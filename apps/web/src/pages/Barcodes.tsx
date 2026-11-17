import type { Product } from '@pos/shared-types';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { IScannerControls } from '@zxing/browser';
import { barcodeApi, type BarcodeFormat, type BarcodeInput } from '../api';
import PageHeading from '../components/PageHeading';
import { useDebounce } from '../hooks/useDebounce';
import { useTenant } from '../hooks/useTenant';
import { useAuth } from '../store/auth';
import { useCart } from '../store/cart';
import { availablePages } from '../utils/access';
import { errorMessage } from '../utils/errors';
import { formatMoney } from '../utils/money';
import './Barcodes.css';

const formats: { value: BarcodeFormat; label: string; hint: string; example: string }[] = [
  { value: 'CODE128', label: 'CODE 128', hint: '1–80 printable ASCII characters. Ideal for internal product codes and SKUs.', example: 'KZM-001' },
  { value: 'EAN13', label: 'EAN-13', hint: '12 digits to calculate a check digit, or a valid 13-digit retail barcode.', example: '400638133393' },
  { value: 'EAN8', label: 'EAN-8', hint: '7 digits to calculate a check digit, or a valid 8-digit retail barcode.', example: '9638507' },
  { value: 'UPC', label: 'UPC-A', hint: '11 digits to calculate a check digit, or a valid 12-digit retail barcode.', example: '03600029145' },
  { value: 'CODE39', label: 'CODE 39', hint: 'Up to 40 uppercase letters, digits, spaces and - . $ / + %.', example: 'SKU-001' },
];
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BarcodeGenerator() {
  const branch = useAuth((s) => s.activeBranchId);
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [value, setValue] = useState('KZM-001');
  const [product, setProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebounce(search);
  const [scale, setScale] = useState(2);
  const [height, setHeight] = useState(25);
  const [displayValue, setDisplayValue] = useState(true);
  const [copies, setCopies] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useMutation({ mutationFn: (input: BarcodeInput) => barcodeApi.generate(input) });
  const products = useQuery({ queryKey: ['barcode-products', branch, q], queryFn: ({ signal }) => barcodeApi.products(q.trim(), signal), enabled: q.trim().length >= 2, retry: false });
  const selectedFormat = formats.find((option) => option.value === format)!;
  const resetPreview = () => { generation.reset(); setExportError(''); };
  const generate = (event: FormEvent) => {
    event.preventDefault(); setExportError('');
    generation.mutate({ format, ...(product ? { productId: product._id } : { value: value.trim() }), scale, height, displayValue });
  };
  const result = generation.data;
  const filename = result ? `barcode-${result.format.toLowerCase()}-${result.value.replace(/[^\w-]/g, '_')}` : 'barcode';
  const downloadPng = async () => {
    if (!result) return;
    setExporting(true); setExportError('');
    try {
      const image = new Image(); image.src = svgUrl(result.svg); await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image export is unavailable in this browser. Download SVG instead.');
      context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to export PNG.')), 'image/png'));
      saveFile(blob, `${filename}.png`);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Unable to export PNG.'); }
    finally { setExporting(false); }
  };
  const print = () => {
    if (!result) return;
    setExportError('');
    const popup = window.open('', '_blank', 'width=900,height=650');
    if (!popup) { setExportError('Your browser blocked the print window. Allow pop-ups for this site and try again.'); return; }
    popup.opener = null;
    popup.document.title = 'KazmiOn barcode labels';
    const style = popup.document.createElement('style');
    style.textContent = 'body{margin:0;background:white}.sheet{display:flex;flex-wrap:wrap;align-items:flex-start;gap:8mm;padding:10mm}.label{margin:0;break-inside:avoid;max-width:100%}img{display:block;max-width:100%;height:auto}@media print{@page{margin:0}}';
    popup.document.head.append(style);
    const sheet = popup.document.createElement('div'); sheet.className = 'sheet';
    const loaded: Promise<void>[] = [];
    for (let index = 0; index < copies; index++) {
      const label = popup.document.createElement('figure'); label.className = 'label';
      const image = popup.document.createElement('img'); image.alt = result.value;
      loaded.push(new Promise((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Unable to load labels for printing.')); }));
      image.src = svgUrl(result.svg); label.append(image); sheet.append(label);
    }
    popup.document.body.append(sheet);
    void Promise.all(loaded).then(() => { if (!popup.closed) { popup.focus(); popup.print(); } }).catch((error: Error) => { popup.close(); setExportError(error.message); });
  };
  return <div className="barcode-workspace barcode-generator-grid">
    <section className="card barcode-panel" aria-labelledby="label-settings-title">
      <div><h2 id="label-settings-title">Label settings</h2><p className="barcode-muted">Use a saved product or enter a code. Generating a label does not change your catalog.</p></div>
      <form onSubmit={generate}>
        <fieldset disabled={generation.isPending || exporting} className="barcode-fields">
          <div><label className="label" htmlFor="label-product-search">Find a product <span className="barcode-muted">(optional)</span></label>
            <input className="input" id="label-product-search" placeholder="Search by name, SKU or barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
            {products.isFetching && <p className="barcode-muted" role="status">Searching products…</p>}
            {products.error && <p className="barcode-error" role="alert">{errorMessage(products.error)}</p>}
            {q.trim().length >= 2 && !products.isFetching && products.data && <ul className="barcode-product-options" aria-label="Matching products">{products.data.data.length ? products.data.data.map((item) => <li key={item._id}><button type="button" disabled={!item.barcode && !item.sku} onClick={() => { setProduct(item); setValue(item.barcode || item.sku || ''); setSearch(''); setFormat('CODE128'); resetPreview(); }}><strong>{item.name}</strong><span>{item.barcode || item.sku || 'Add a barcode or SKU in Products first'}</span></button></li>) : <li className="barcode-muted">No matching products in this branch.</li>}</ul>}
          </div>
          {product && <div className="barcode-selection"><span>Selected product<strong>{product.name}</strong></span><button className="btn-secondary" type="button" onClick={() => { setProduct(null); resetPreview(); }}>Use manual code</button></div>}
          <div><label className="label" htmlFor="barcode-format">Barcode format</label><select id="barcode-format" className="input" value={format} onChange={(e) => { setFormat(e.target.value as BarcodeFormat); resetPreview(); }}>{formats.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><p id="barcode-format-hint" className="barcode-muted">{selectedFormat.hint}</p></div>
          <div><label className="label" htmlFor="barcode-value">Barcode value</label><input className="input font-mono" id="barcode-value" ref={inputRef} required maxLength={80} readOnly={!!product} value={value} placeholder={selectedFormat.example} aria-describedby="barcode-format-hint" onChange={(e) => { setValue(e.target.value); resetPreview(); }} /></div>
          <div className="barcode-settings-row"><div><label className="label" htmlFor="barcode-scale">Bar scale</label><select id="barcode-scale" className="input" value={scale} onChange={(e) => { setScale(Number(e.target.value)); resetPreview(); }}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}×</option>)}</select></div><div><label className="label" htmlFor="barcode-height">Bar height (mm)</label><input className="input" id="barcode-height" type="number" required min={10} max={60} step={1} value={height} onChange={(e) => { setHeight(Number(e.target.value)); resetPreview(); }} /></div></div>
          <label className="barcode-checkbox"><input type="checkbox" checked={displayValue} onChange={(e) => { setDisplayValue(e.target.checked); resetPreview(); }} />Show the value below the bars</label>
          {generation.error && <p className="barcode-error" role="alert">{errorMessage(generation.error)}</p>}
          <div className="barcode-actions"><button className="btn-primary" type="submit">{generation.isPending ? 'Generating…' : 'Generate barcode'}</button><button className="btn-secondary" type="button" onClick={() => { setProduct(null); setValue(''); setSearch(''); resetPreview(); inputRef.current?.focus(); }}>Clear</button></div>
        </fieldset>
      </form>
    </section>
    <section className="card barcode-panel" aria-labelledby="label-preview-title" aria-busy={generation.isPending}>
      <div><h2 id="label-preview-title">Label preview</h2><p className="barcode-muted">High-contrast bars with clear margins for scanning.</p></div>
      <div className="barcode-preview">{result ? <img src={svgUrl(result.svg)} alt={`Generated ${result.format} barcode for ${result.value}`} /> : <p>{generation.isPending ? 'Preparing your barcode…' : 'Generate a barcode to preview your label here.'}</p>}</div>
      {result && <p className="barcode-encoded" role="status">Encoded value <strong>{result.value}</strong></p>}
      <div className="barcode-actions"><button type="button" className="btn-primary" disabled={!result || exporting} onClick={() => void downloadPng()}>{exporting ? 'Exporting…' : 'Download PNG'}</button><button type="button" className="btn-secondary" disabled={!result || exporting} onClick={() => result && saveFile(new Blob([result.svg], { type: 'image/svg+xml' }), `${filename}.svg`)}>Download SVG</button></div>
      <div className="barcode-print-row"><div><label className="label" htmlFor="barcode-copies">Label copies</label><input className="input" type="number" id="barcode-copies" min={1} max={60} step={1} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(60, Math.floor(Number(e.target.value)) || 1)))} /></div><button className="btn-secondary" type="button" disabled={!result || exporting} onClick={print}>Print {copies === 1 ? 'label' : `${copies} labels`}</button></div>
      {exportError && <p className="barcode-error" role="alert">{exportError}</p>}
      <p className="barcode-muted">Use the SVG for sharp printing. Keep the bars at their original proportions and test a printed label before printing a batch.</p>
    </section>
  </div>;
}

function BarcodeScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const [camera, setCamera] = useState<'idle' | 'starting' | 'scanning'>('idle');
  const [cameraError, setCameraError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [looking, setLooking] = useState(false);
  const [code, setCode] = useState('');
  const [product, setProduct] = useState<Product | null>(null);
  const [scans, setScans] = useState<{ value: string; name: string; at: string }[]>([]);
  const [notice, setNotice] = useState('');
  const [autoAdd, setAutoAdd] = useState(false);
  const { tenant, currency } = useTenant();
  const user = useAuth((s) => s.user);
  const cart = useCart();
  const canSell = !!user && availablePages(user, tenant).some((page) => page.key === 'pos') && (user.role === 'owner' || !user.permissions || user.permissions.includes('sales.create'));
  const stopCamera = useCallback(() => {
    sessionRef.current++;
    controlsRef.current?.stop(); controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
  }, []);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) { stopCamera(); setCamera('idle'); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { document.removeEventListener('visibilitychange', onVisibility); stopCamera(); requestRef.current?.abort(); };
  }, [stopCamera]);
  const lookup = async (raw: string) => {
    const value = raw.trim();
    stopCamera(); setCamera('idle'); requestRef.current?.abort();
    setProduct(null); setNotice(''); setLookupError('');
    if (!/^[\x20-\x7E]{1,80}$/.test(value)) { setLooking(false); setLookupError('Enter 1–80 printable characters from a barcode or SKU.'); return; }
    setCode(value); setLooking(true);
    const request = new AbortController(); requestRef.current = request;
    try {
      const found = await barcodeApi.lookup(value, request.signal);
      if (request.signal.aborted) return;
      setProduct(found);
      if (autoAdd && canSell) {
        const current = useCart.getState();
        const quantity = current.items.find((item) => item.product._id === found._id)?.qty ?? 0;
        if (found.trackStock && found.stockQty < quantity + 1) setLookupError('Not enough stock to add another unit to this sale.');
        else { current.add(found); setNotice(`${found.name} added to the current sale.`); }
      }
      setScans((previous) => [{ value, name: found.name, at: new Date().toLocaleTimeString() }, ...previous.filter((scan) => scan.value !== value)].slice(0, 10));
    } catch (error) { if (!request.signal.aborted) setLookupError(errorMessage(error)); }
    finally { if (!request.signal.aborted) { setLooking(false); inputRef.current?.focus(); inputRef.current?.select(); } }
  };
  const startCamera = async () => {
    stopCamera(); const session = sessionRef.current; setCameraError(''); setCamera('starting');
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires HTTPS or localhost. You can still use a USB scanner or the code field.');
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (session !== sessionRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (session !== sessionRef.current || !videoRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 });
      const controls = await reader.decodeFromStream(stream, videoRef.current, (result, _error, controls) => {
        if (session !== sessionRef.current) { controls.stop(); return; }
        if (result) { controls.stop(); void lookup(result.getText()); }
      });
      if (session !== sessionRef.current) { controls.stop(); return; }
      controlsRef.current = controls; setCamera('scanning');
    } catch (error) {
      if (session !== sessionRef.current) return;
      stopCamera(); setCamera('idle');
      const name = error instanceof Error ? error.name : '';
      setCameraError(name === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in your browser settings, or use a USB scanner in the code field.' : name === 'NotFoundError' ? 'No camera was found. Connect a camera or use the code field.' : error instanceof Error ? error.message : 'Unable to start the camera.');
    }
  };
  const inCart = product ? cart.items.find((item) => item.product._id === product._id)?.qty ?? 0 : 0;
  const outOfStock = !!product?.trackStock && product.stockQty <= inCart;
  return <div className="barcode-workspace barcode-scanner-grid">
    <section className="card barcode-panel" aria-labelledby="scan-input-title">
      <div><h2 id="scan-input-title">Scan or enter a code</h2><p className="barcode-muted">Focus this field, scan with a USB reader, and press Enter. Product lookup uses your selected branch.</p></div>
      <form className="barcode-lookup-form" onSubmit={(e) => { e.preventDefault(); void lookup(code); }}><label className="label" htmlFor="scanner-code">Barcode or SKU</label><div className="barcode-manual-row"><input ref={inputRef} className="input font-mono" id="scanner-code" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={80} required placeholder="Scan or type a product code" value={code} onChange={(e) => setCode(e.target.value)} /><button className="btn-primary" type="submit" disabled={looking}>{looking ? 'Finding…' : 'Find product'}</button></div></form>
      {lookupError && <p className="barcode-error" role="alert">{lookupError}</p>}
      {canSell && <label className="barcode-checkbox"><input type="checkbox" checked={autoAdd} onChange={(e) => setAutoAdd(e.target.checked)} />Add matched products directly to billing</label>}
      {canSell && <div className="barcode-selection"><span>Current bill<strong>{cart.items.reduce((sum, item) => sum + item.qty, 0)} items ready for billing</strong></span><Link className="btn-secondary" to="/pos">Continue to billing</Link></div>}
      <div className="barcode-camera"><video ref={videoRef} playsInline muted aria-label="Barcode camera preview" />{camera !== 'scanning' && <div className="barcode-camera-placeholder"><span aria-hidden="true">▥</span><p>{camera === 'starting' ? 'Starting camera…' : 'Point your camera at a product barcode'}</p></div>}{camera === 'scanning' && <div className="barcode-scan-guide" aria-hidden="true" />}</div>
      <div className="barcode-actions">{camera === 'idle' ? <button className="btn-secondary" type="button" onClick={() => void startCamera()}>Start camera scan</button> : <button className="btn-secondary" type="button" onClick={() => { stopCamera(); setCamera('idle'); }}>Stop camera</button>}<span className="barcode-muted" role="status">{camera === 'scanning' ? 'Camera active · stops after a scan' : camera === 'starting' ? 'Waiting for camera access' : 'Camera off'}</span></div>
      {cameraError && <p className="barcode-error" role="alert">{cameraError}</p>}
    </section>
    <div className="barcode-result-column">
      <section className="card barcode-panel" aria-labelledby="scan-result-title" aria-busy={looking}>
        <div><h2 id="scan-result-title">Product details</h2><p className="barcode-muted">Exact barcode match first, then exact SKU.</p></div>
        {product ? <><div className="barcode-product-heading"><span className="barcode-status">Product found</span><h3>{product.name}</h3></div><dl className="barcode-details"><div><dt>Barcode</dt><dd>{product.barcode || 'Not assigned'}</dd></div><div><dt>SKU</dt><dd>{product.sku || 'Not assigned'}</dd></div><div><dt>Price</dt><dd>{formatMoney(product.price, currency)}</dd></div><div><dt>Available stock</dt><dd>{product.trackStock ? `${product.stockQty} ${product.unit || 'pcs'}` : 'Not tracked'}</dd></div></dl>{canSell && <div className="barcode-actions"><button className="btn-primary" type="button" disabled={outOfStock} onClick={() => { cart.add(product); setNotice(`${product.name} added to the current sale.`); inputRef.current?.focus(); inputRef.current?.select(); }}>{outOfStock ? 'No stock available' : 'Add to sale'}</button><Link className="btn-secondary" to="/pos">Open POS</Link></div>}{notice && <p className="barcode-notice" role="status">{notice}</p>}</> : <div className="barcode-empty" role="status">{looking ? 'Finding your product…' : 'Scan a product to see its price and stock here.'}</div>}
      </section>
      <section className="card barcode-panel" aria-labelledby="scan-history-title"><div className="barcode-history-heading"><h2 id="scan-history-title">Recent matches</h2><button className="btn-secondary" type="button" disabled={!scans.length} onClick={() => setScans([])}>Clear history</button></div>{scans.length ? <ul className="barcode-history">{scans.map((scan) => <li key={scan.value}><button type="button" onClick={() => void lookup(scan.value)}><strong>{scan.name}</strong><span>{scan.value}</span></button><time>{scan.at}</time></li>)}</ul> : <p className="barcode-muted">Your last 10 matched codes appear here for this session.</p>}</section>
    </div>
  </div>;
}

export function BarcodeGeneratorPage() {
  const branch = useAuth((s) => `${s.user?.tenantId}:${s.activeBranchId}`);
  return <div className="barcode-page"><header className="page-header"><PageHeading eyebrow="Barcode studio" title="Barcode generator" description="Create accurate product labels, download images, and prepare sheets for printing." /></header><BarcodeGenerator key={branch} /></div>;
}
export function BarcodeScannerPage() {
  const branch = useAuth((s) => `${s.user?.tenantId}:${s.activeBranchId}`);
  return <div className="barcode-page"><header className="page-header"><PageHeading eyebrow="Barcode studio" title="Barcode scanner" description="Find products with your camera, a USB scanner, or an exact barcode search." /></header><BarcodeScanner key={branch} /></div>;
}
