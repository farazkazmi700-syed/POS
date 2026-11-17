-- Migration 003: Row-Level Security policies for tenant isolation
-- Applied after 002_installments.sql
-- RLS ensures each database session can only see its own tenant's data

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkout_requests ENABLE ROW LEVEL SECURITY;

-- Policy: application sets app.current_tenant_id via SET LOCAL at request start
-- Super admin / developer bypass is handled at the application layer, not RLS
CREATE POLICY tenant_isolation_on_users ON users
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_products ON products
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_orders ON orders
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_order_items ON order_items
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_customers ON customers
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_installment_plans ON installment_plans
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_installment_products ON installment_products
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_installment_sales ON installment_sales
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_branches ON branches
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_audit_events ON audit_events
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_invoice_counters ON invoice_counters
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_on_checkout_requests ON checkout_requests
  FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- Tenants table: readable by all (for tenant resolution), writable only by system
CREATE POLICY tenant_read_all ON tenants FOR SELECT USING (true);
CREATE POLICY tenant_write_system ON tenants FOR ALL USING (
  current_setting('app.current_tenant_id', true) IS NULL
  OR id = current_setting('app.current_tenant_id', true)::UUID
);

COMMENT ON MIGRATION 003 IS 'Row-level security enforces tenant boundaries at the database level';