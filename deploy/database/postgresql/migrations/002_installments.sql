-- Migration 002: Installment plans, products, and sales tables
-- Applied after 001_initial_schema.sql

CREATE TABLE IF NOT EXISTS installment_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installment_product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  category TEXT,
  description TEXT,
  image_url TEXT,
  actual_price NUMERIC(12,2) NOT NULL,
  default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active','inactive','archived')) DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_products_tenant_id ON installment_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_products_tenant_active ON installment_products(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS installment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_no TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_cnic TEXT,
  customer_address TEXT,
  guarantor JSONB NOT NULL DEFAULT '{}',
  items JSONB NOT NULL DEFAULT '[]',
  cash_total NUMERIC(12,2) NOT NULL,
  down_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  markup_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(12,2) NOT NULL,
  financed_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  months INTEGER NOT NULL,
  monthly_amount NUMERIC(12,2) NOT NULL,
  first_due_date DATE NOT NULL,
  schedule JSONB NOT NULL DEFAULT '[]',
  payments JSONB NOT NULL DEFAULT '[]',
  paid_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overdue_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  overdue_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant_id ON installment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_order_id ON installment_plans(order_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_customer_id ON installment_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_status ON installment_plans(status);

CREATE TABLE IF NOT EXISTS installment_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installment_product_id UUID REFERENCES installment_products(id),
  agreement_id TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  sale_date DATE NOT NULL,
  actual_price NUMERIC(12,2) NOT NULL,
  advance_payment NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_installment_price NUMERIC(12,2) NOT NULL,
  installment_duration INTEGER NOT NULL,
  payment_frequency TEXT NOT NULL CHECK (payment_frequency IN ('monthly','weekly','biweekly')),
  outstanding_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_status TEXT NOT NULL CHECK (sale_status IN ('pending','active','completed','overdue','cancelled')) DEFAULT 'pending',
  schedule JSONB NOT NULL DEFAULT '[]',
  payments JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_sales_tenant_id ON installment_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_sales_customer_id ON installment_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_installment_sales_agreement_id ON installment_sales(agreement_id);
CREATE INDEX IF NOT EXISTS idx_installment_sales_status ON installment_sales(sale_status);

COMMENT ON TABLE installment_products IS 'Installment product catalog';
COMMENT ON TABLE installment_plans IS 'Installment agreements linked to orders';
COMMENT ON TABLE installment_sales IS 'Independent installment sales records';