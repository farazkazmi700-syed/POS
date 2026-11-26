CREATE SCHEMA IF NOT EXISTS invoice_store;
REVOKE ALL ON SCHEMA invoice_store FROM PUBLIC;
CREATE TABLE IF NOT EXISTS invoice_store.business (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  tenant_id text NOT NULL UNIQUE CHECK (tenant_id ~ '^[a-f0-9]{24}$')
);
CREATE TABLE IF NOT EXISTS invoice_store.invoices (
  tenant_id text NOT NULL REFERENCES invoice_store.business(tenant_id),
  order_id text NOT NULL CHECK (order_id ~ '^[a-f0-9]{24}$'),
  status text NOT NULL CHECK (status IN ('pending','ready','failed')),
  pdf_path text,
  generation uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, order_id),
  CHECK (status <> 'ready' OR pdf_path IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS invoice_store.business_appearance (
  tenant_id text PRIMARY KEY REFERENCES invoice_store.business(tenant_id),
  preferences jsonb NOT NULL CHECK (jsonb_typeof(preferences) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
