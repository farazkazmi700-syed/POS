# Barcode generator and scanner

## API

All endpoints require an authenticated, active tenant and the `barcodes` feature. Operational product queries inherit the selected branch context and never search another tenant or branch.

| Endpoint | Purpose | Module access |
| --- | --- | --- |
| `POST /api/barcodes/generate` | Validate and render CODE128, CODE39, EAN13, EAN8 or UPC-A as SVG | Barcode generator |
| `GET /api/barcodes/products?q=...` | Search active products for label selection | Barcode generator |
| `GET /api/barcodes/lookup?value=...` | Find an active product by exact barcode, then exact SKU | Barcode scanner or POS |

All three endpoints require `catalog.read` action access. Generation accepts exactly one of `value` or `productId`, plus `format`, optional integer `scale` (1–6), `height` (10–60 mm) and `displayValue`. Retail inputs without check digits are completed; incorrect supplied check digits are rejected. A product label cannot silently change the stored identifier. Generation does not assign or alter product barcodes; edit them in Products.

The generator uses `bwip-js` rather than handwritten encoding tables. SVGs have explicit native pixel dimensions so PNG export preserves barcode resolution. The browser downloads PNG/SVG files and builds print sheets using DOM nodes without inserting product text as HTML. Print windows wait for labels to load; blocked pop-ups show an error.

## Scanner behavior

USB readers that emit keyboard input and Enter use the labeled barcode/SKU field or the POS search field. Camera decoding uses a lazily loaded ZXing multi-format decoder, so native `BarcodeDetector` support is unnecessary. HTTPS or localhost and camera permission are required. Permission errors, missing devices and unavailable products have visible messages.

Camera tracks stop after a match, when canceled, when the page is hidden and when the module unmounts. A stream arriving after cancellation is also stopped. Lookup requests are canceled when superseded. Product details include price and stock, with Add to sale available only to users with POS access; local cart quantities cannot exceed tracked stock. Checkout still validates stock on the server.

History is limited to the last ten matched codes in memory. Switching branch clears the module state. No camera images are uploaded or stored. Weighted GS1 labels, lot/serial extraction, physical printer/scanner certification and offline lookup are outside this change.

## Billing scans

The scanner's optional “Add matched products directly to billing” mode adds each successful match to the shared sale cart. The input regains focus and selects the last code for the next USB scan. “Continue to billing” opens the same cart in POS. POS also has a dedicated barcode/SKU input that queries the full active branch catalog, independently of the products currently displayed or the catalog page limit. Both paths check the quantity already in the cart against tracked stock.

Camera scanning supports 1D barcodes and QR codes containing a saved product barcode or SKU. Lookup accepts the equivalent UPC-A/EAN-13 representation only when the retail checksum is valid, and always prefers exact identifiers. Products must have their code saved in the catalog; arbitrary or unregistered product codes cannot be priced automatically.

## Verification

```powershell
npm run build
npm --prefix apps/api test -- --runInBand
node qa/api-integration.cjs
npm exec --yes --package=@playwright/test -- playwright test --config=qa/barcodes.config.cjs
```

The browser tests exercise the actual compiled API encoder and independently decode SVGs for all five formats and downloaded PNGs. They also check invalid check digits, printing, responsive desktop/mobile layouts, USB-style input, unknown codes, adding to a sale, denied camera permission, canceling a pending camera request and a deterministic camera-video match. API integration tests use a disposable database and cover tenant/branch isolation, separate module rights, feature entitlements and exact matching. Physical devices still need a manual acceptance check.
