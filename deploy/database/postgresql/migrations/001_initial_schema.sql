-- =============================================================================
-- KazmiOn POS — Migration 001: Complete Initial Schema
-- =============================================================================
-- Applied to each client's independent PostgreSQL database.
-- Idempotent: safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Never modifies or deletes existing MongoDB data.
-- Financial columns: NUMERIC(12,2) — never FLOAT.
-- All timestamps: TIMESTAMPTZ (UTC stored, timezone-aware).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id                     TEXT        UNIQUE,          -- ObjectId preserved during migration
  name                         TEXT        NOT NULL,
  domain_type                  TEXT        NOT NULL DEFAULT 'retail'
                                           CHECK (domain_type IN ('retail','restaurant','pharmacy',
                                                                   'supermarket','grocery','electronics',
                                                                   'salon','custom')),
  tax_reg_no                   TEXT,
  address                      TEXT,
  currency                     TEXT        NOT NULL DEFAULT 'PKR',
  invoice_prefix               TEXT        NOT NULL DEFAULT 'INV',
  logo_url                     TEXT,
  time_zone                    TEXT        NOT NULL DEFAULT 'Asia/Karachi',
  tax_profile                  JSONB       NOT NULL DEFAULT '{}',
  installment_markup_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
  invoice_print_settings       JSONB       NOT NULL DEFAULT '{}',
  feature_flags                JSONB       NOT NULL DEFAULT '{}',
  navigation_visibility        JSONB       NOT NULL DEFAULT '{}',
  status                       TEXT        NOT NULL DEFAULT 'active'
                                           CHECK (status IN ('active','suspended')),
  deployment_mode              TEXT        NOT NULL DEFAULT 'offline'
                                           CHECK (deployment_mode IN ('cloud','offline','hybrid')),
  subscription_plan_id         UUID,
  branch_limit                 INTEGER     NOT NULL DEFAULT 1,
  default_branch_id            UUID,
  license_expires_at           TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenants_status           ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_subscription_plan ON tenants(subscription_plan_id);

-- ---------------------------------------------------------------------------
-- USERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id                     TEXT        UNIQUE,
  tenant_id                    UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                         TEXT        NOT NULL,
  email                        TEXT        NOT NULL,
  password_hash                TEXT        NOT NULL,          -- Argon2id; bcrypt hashes upgrade on next login
  pin_hash                     TEXT,                          -- bcrypt (small search space, rate-limited)
  developer_pin_hash           TEXT,
  pin_requires_change          BOOLEAN     NOT NULL DEFAULT false,
  pin_version                  INTEGER     NOT NULL DEFAULT 0,
  pin_failed_attempts          INTEGER     NOT NULL DEFAULT 0,
  pin_locked_until             TIMESTAMPTZ,
  session_version              INTEGER     NOT NULL DEFAULT 0,
  developer_session_version    INTEGER     NOT NULL DEFAULT 0,
  role                         TEXT        NOT NULL CHECK (role IN ('owner','admin','cashier')),
  is_active                    BOOLEAN     NOT NULL DEFAULT true,
  is_super_admin               BOOLEAN     NOT NULL DEFAULT false,
  is_developer                 BOOLEAN     NOT NULL DEFAULT false,
  recovery_email               TEXT,
  phone                        TEXT,
  phone_verified               BOOLEAN     NOT NULL DEFAULT false,
  phone_verified_at            TIMESTAMPTZ,
  email_verified               BOOLEAN     NOT NULL DEFAULT false,
  email_verified_at            TIMESTAMPTZ,
  password_requires_change     BOOLEAN     NOT NULL DEFAULT false,
  pin_enabled                  BOOLEAN     NOT NULL DEFAULT false,
  module_rights                TEXT[]      NOT NULL DEFAULT '{}',
  permissions                  TEXT[]      NOT NULL DEFAULT '{}',
  branch_ids                   UUID[]      NOT NULL DEFAULT '{}',
  default_branch_id            UUID,
  enrollment_expires_at        TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id    ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant_role  ON users(tenant_id, role);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_super_admin
  ON users(is_super_admin) WHERE is_super_admin = true;

-- ---------------------------------------------------------------------------
-- BRANCHES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id    TEXT  UNIQUE,
  tenant_id   UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT  NOT NULL,
  code        TEXT  NOT NULL,
  address     TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant_id ON branches(tenant_id);

-- Back-fill FK now that branches exists
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS default_branch_fk UUID REFERENCES branches(id);

-- ---------------------------------------------------------------------------
-- SUBSCRIPTION PLANS  (platform/developer-level)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_plans (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id         TEXT        UNIQUE,
  name             TEXT        NOT NULL,
  description      TEXT,
  price            NUMERIC(12,2) NOT NULL DEFAULT 0,
  billing_interval TEXT        NOT NULL DEFAULT 'monthly'
                               CHECK (billing_interval IN ('monthly','yearly','lifetime')),
  features         JSONB       NOT NULL DEFAULT '{}',
  domain_type      TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- PLATFORM MODULES  (developer module catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_modules (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id      TEXT  UNIQUE,
  key           TEXT  NOT NULL UNIQUE,
  module_id     TEXT  NOT NULL UNIQUE,            -- e.g. MOD-POS
  label         TEXT  NOT NULL,
  description   TEXT,
  version       TEXT  NOT NULL DEFAULT '1.0.0',
  release_state TEXT  NOT NULL DEFAULT 'active'
                      CHECK (release_state IN ('active','coming-soon','retired')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  universal     BOOLEAN NOT NULL DEFAULT false,
  builtin       BOOLEAN NOT NULL DEFAULT false,
  submodules    JSONB   NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- PRODUCTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id            TEXT        UNIQUE,
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id           UUID        REFERENCES branches(id),
  name                TEXT        NOT NULL,
  sku                 TEXT,
  barcode             TEXT,
  category            TEXT,
  unit                TEXT,
  price               NUMERIC(12,2) NOT NULL,
  cost_price          NUMERIC(12,2),
  stock_qty           INTEGER     NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER     NOT NULL DEFAULT 5,
  track_stock         BOOLEAN     NOT NULL DEFAULT true,
  tax_class           TEXT        NOT NULL DEFAULT 'standard'
                                  CHECK (tax_class IN ('standard','reduced','exempt')),
  attributes          JSONB       NOT NULL DEFAULT '{}',
  image_url           TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id     ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_tenant_active  ON products(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_tenant_barcode ON products(tenant_id, barcode)
  WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_tenant_sku ON products(tenant_id, sku)
  WHERE sku IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CUSTOMERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id    TEXT  UNIQUE,
  tenant_id   UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id   UUID  REFERENCES branches(id),
  name        TEXT  NOT NULL,
  phone       TEXT  NOT NULL,
  cnic        TEXT,
  address     TEXT,
  notes       TEXT,
  guarantor   JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant_id    ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customers_tenant_name  ON customers(tenant_id, name);

-- ---------------------------------------------------------------------------
-- INVOICE COUNTERS  (per-tenant per-year sequential invoice numbers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_counters (
  id        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      INTEGER NOT NULL,
  seq       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, year)
);

CREATE INDEX IF NOT EXISTS idx_invoice_counters_tenant ON invoice_counters(tenant_id);

-- ---------------------------------------------------------------------------
-- CHECKOUT REQUESTS  (idempotency keys for duplicate checkout prevention)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checkout_requests (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        TEXT  NOT NULL,
  hash       TEXT  NOT NULL,
  result     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_checkout_requests_tenant_key ON checkout_requests(tenant_id, key);

-- ---------------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id          TEXT        UNIQUE,
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id         UUID        REFERENCES branches(id),
  invoice_no        TEXT        NOT NULL,
  payment_mode      TEXT        NOT NULL CHECK (payment_mode IN ('cash','card','wallet','installment','mixed')),
  status            TEXT        NOT NULL DEFAULT 'completed'
                                CHECK (status IN ('completed','voided','refunded')),
  cashier_id        UUID        REFERENCES users(id),
  cashier_name      TEXT        NOT NULL,
  customer_id       UUID        REFERENCES customers(id),
  customer_name     TEXT,
  customer_phone    TEXT,
  note              TEXT,
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total    NUMERIC(12,2) NOT NULL DEFAULT 0,
  taxable_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  charges_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_breakdown     JSONB       NOT NULL DEFAULT '[]',
  charges           JSONB       NOT NULL DEFAULT '[]',
  payments          JSONB       NOT NULL DEFAULT '[]',   -- [{mode, amount}] for mixed payments
  invoice_status    TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (invoice_status IN ('pending','ready','failed')),
  invoice_pdf_path  TEXT,
  idempotency_key   TEXT,
  installment_plan_id UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_id         ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_invoice_no ON orders(tenant_id, invoice_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_invoice_no_unique
  ON orders(tenant_id, invoice_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_idempotency
  ON orders(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_at ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status     ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id         ON orders(branch_id);

-- ---------------------------------------------------------------------------
-- ORDER ITEMS  (normalized child table, embedded in MongoDB)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id       UUID        REFERENCES products(id) ON DELETE SET NULL,
  mongo_product_id TEXT,                -- preserved during migration
  name             TEXT        NOT NULL,
  serial_no        TEXT,
  qty              INTEGER     NOT NULL,
  unit_price       NUMERIC(12,2) NOT NULL,
  discount_percent NUMERIC(5,2)  NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_percent      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  tax_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  line_total       NUMERIC(12,2) NOT NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id   ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_id  ON order_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- ---------------------------------------------------------------------------
-- STOCK ADJUSTMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id     TEXT  UNIQUE,
  tenant_id    UUID  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id    UUID  REFERENCES branches(id),
  product_id   UUID  REFERENCES products(id) ON DELETE SET NULL,
  mongo_product_id TEXT,
  product_name TEXT  NOT NULL,
  adjustment   INTEGER NOT NULL,              -- positive = added, negative = removed
  reason       TEXT  NOT NULL DEFAULT 'manual',
  note         TEXT,
  adjusted_by  UUID  REFERENCES users(id),
  adjusted_by_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_tenant_id  ON stock_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_created_at ON stock_adjustments(tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- INSTALLMENT PRODUCTS  (standalone installment product catalog)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS installment_products (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id                 TEXT        UNIQUE,
  tenant_id                UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installment_product_id   TEXT        NOT NULL,  -- business-visible ID
  name                     TEXT        NOT NULL,
  brand                    TEXT,
  model                    TEXT,
  category                 TEXT,
  description              TEXT,
  image_url                TEXT,
  actual_price             NUMERIC(12,2) NOT NULL,
  default_commission_rate  NUMERIC(5,2)  NOT NULL DEFAULT 0,
  status                   TEXT        NOT NULL DEFAULT 'active'
                                       CHECK (status IN ('active','inactive','archived')),
  is_active                BOOLEAN     NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_products_tenant ON installment_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_products_status ON installment_products(tenant_id, status);

-- ---------------------------------------------------------------------------
-- INSTALLMENT PLANS  (tied to POS orders — the original installment flow)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS installment_plans (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id            TEXT        UNIQUE,
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id            UUID        REFERENCES orders(id) ON DELETE SET NULL,
  mongo_order_id      TEXT,
  invoice_no          TEXT        NOT NULL,
  customer_id         UUID        REFERENCES customers(id) ON DELETE SET NULL,
  customer_name       TEXT        NOT NULL,
  customer_phone      TEXT        NOT NULL,
  customer_cnic       TEXT,
  customer_address    TEXT,
  guarantor           JSONB       NOT NULL DEFAULT '{}',
  items               JSONB       NOT NULL DEFAULT '[]',   -- snapshot of order items
  cash_total          NUMERIC(12,2) NOT NULL,
  down_payment        NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup_percent      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  markup_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  financed_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_payable       NUMERIC(12,2) NOT NULL,
  months              INTEGER       NOT NULL,
  monthly_amount      NUMERIC(12,2) NOT NULL,
  first_due_date      DATE          NOT NULL,
  schedule            JSONB         NOT NULL DEFAULT '[]',  -- [{no, dueDate, amount, paidAmount, status}]
  payments            JSONB         NOT NULL DEFAULT '[]',  -- [{receiptNo, amount, paidAt, mode, receivedBy, note}]
  paid_total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance             NUMERIC(12,2) NOT NULL DEFAULT 0,
  status              TEXT          NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','completed')),
  created_by_name     TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_plans_tenant     ON installment_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_customer   ON installment_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_order      ON installment_plans(order_id);
CREATE INDEX IF NOT EXISTS idx_installment_plans_status     ON installment_plans(tenant_id, status);

-- ---------------------------------------------------------------------------
-- INSTALLMENT SALES  (standalone installment module — independent of POS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS installment_sales (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id                  TEXT        UNIQUE,
  tenant_id                 UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installment_sale_id       TEXT        NOT NULL,
  agreement_id              TEXT        NOT NULL,
  customer_id               UUID        REFERENCES customers(id) ON DELETE SET NULL,
  mongo_customer_id         TEXT,
  installment_product_id    UUID        REFERENCES installment_products(id) ON DELETE SET NULL,
  mongo_installment_product_id TEXT,
  sale_date                 DATE        NOT NULL,
  actual_price              NUMERIC(12,2) NOT NULL,
  advance_payment           NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_rate           NUMERIC(5,2)  NOT NULL DEFAULT 0,
  commission_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_installment_price   NUMERIC(12,2) NOT NULL,
  installment_duration      INTEGER       NOT NULL,
  payment_frequency         TEXT          NOT NULL DEFAULT 'monthly'
                                          CHECK (payment_frequency IN ('monthly','weekly','biweekly')),
  outstanding_balance       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_paid                NUMERIC(12,2) NOT NULL DEFAULT 0,
  sale_status               TEXT          NOT NULL DEFAULT 'active'
                                          CHECK (sale_status IN ('pending','active','completed','overdue','cancelled')),
  schedule                  JSONB         NOT NULL DEFAULT '[]',
  payments                  JSONB         NOT NULL DEFAULT '[]',
  is_active                 BOOLEAN       NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_installment_sales_tenant     ON installment_sales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_installment_sales_customer   ON installment_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_installment_sales_product    ON installment_sales(installment_product_id);
CREATE INDEX IF NOT EXISTS idx_installment_sales_status     ON installment_sales(tenant_id, sale_status);

-- ---------------------------------------------------------------------------
-- AUDIT EVENTS  (append-only — no UPDATE or DELETE)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id    TEXT  UNIQUE,
  tenant_id   UUID  REFERENCES tenants(id) ON DELETE SET NULL,
  actor_id    UUID  REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT  NOT NULL,
  action      TEXT  NOT NULL,
  entity_type TEXT  NOT NULL,
  entity_id   TEXT  NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant     ON audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor      ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity     ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);

-- ---------------------------------------------------------------------------
-- ADMIN AUDIT  (developer/super-admin platform audit log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  mongo_id    TEXT  UNIQUE,
  actor_email TEXT  NOT NULL,
  action      TEXT  NOT NULL,
  target_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor      ON admin_audit(actor_email);

-- ---------------------------------------------------------------------------
-- MIGRATION IDENTITY  (links this database to a MongoDB business)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS migration_identity (
  singleton        BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  mongo_db_name    TEXT    NOT NULL,
  mongo_tenant_id  TEXT    NOT NULL,
  migrated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  migration_version TEXT   NOT NULL DEFAULT '001'
);

-- ---------------------------------------------------------------------------
-- SCHEMA METADATA / VERSION
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT
);

INSERT INTO schema_migrations(version, description)
VALUES ('001', 'Initial schema — tenants, users, branches, products, orders, order_items, customers, installments, stock, audit')
ON CONFLICT (version) DO NOTHING;
