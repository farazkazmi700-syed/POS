# Changelog

## 1.1.0
- Installment sales: customers with guarantor, down payment, markup %, monthly schedule
- Collect payments (partial / early), overdue tracking, receivables stats
- Printable installment agreement and payment receipts
- IMEI / serial number captured per sale line

## 1.0.0
- Multi-tenant auth (owner / admin / cashier), JWT access + refresh tokens
- Product catalogue with tax classes, stock tracking and free-form attributes
- POS checkout with discounts, per-rate tax, service/other charges, sequential invoice numbers
- Async PDF tax invoice (Handlebars + Chromium + QR) via BullMQ worker
- Dashboard (revenue, top products), order history with void/restore stock
- Docker Compose (dev + prod overlay), GitHub Actions CI
