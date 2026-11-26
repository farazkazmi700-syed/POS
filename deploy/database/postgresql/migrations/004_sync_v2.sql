-- V2 local synchronization metadata. Run in the migration runner transaction.
CREATE SCHEMA pos_sync;
REVOKE ALL ON SCHEMA pos_sync FROM PUBLIC;

CREATE TABLE pos_sync.source (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  id uuid NOT NULL DEFAULT gen_random_uuid()
);
INSERT INTO pos_sync.source DEFAULT VALUES;

CREATE TABLE pos_sync.stream (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),
  last_sequence bigint NOT NULL DEFAULT 0,
  retained_through bigint NOT NULL DEFAULT 0,
  CHECK (retained_through BETWEEN 0 AND last_sequence)
);

CREATE TABLE pos_sync.outbox (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES pos_sync.stream(tenant_id),
  sequence bigint NOT NULL CHECK (sequence > 0),
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  entity_version bigint NOT NULL CHECK (entity_version > 0),
  operation text NOT NULL CHECK (operation IN ('upsert', 'tombstone')),
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  UNIQUE (tenant_id, sequence),
  UNIQUE (tenant_id, entity, entity_id, entity_version)
);

CREATE TABLE pos_sync.financial_history (
  event_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES pos_sync.stream(tenant_id),
  sequence bigint NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  entity_version bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  before_record jsonb,
  after_record jsonb NOT NULL,
  UNIQUE (tenant_id, sequence)
);

CREATE TABLE pos_sync.checkpoint (
  tenant_id uuid NOT NULL REFERENCES pos_sync.stream(tenant_id),
  consumer_id uuid NOT NULL,
  acknowledged_sequence bigint NOT NULL CHECK (acknowledged_sequence >= 0),
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, consumer_id)
);

-- Prevent existing cross-tenant order links from silently entering the baseline.
ALTER TABLE public.orders ADD CONSTRAINT orders_tenant_identity UNIQUE (tenant_id, id);
ALTER TABLE public.order_items ADD CONSTRAINT order_items_sync_order_scope
  FOREIGN KEY (tenant_id, order_id) REFERENCES public.orders (tenant_id, id);
ALTER TABLE public.installment_plans ADD CONSTRAINT installment_plans_sync_order_scope
  FOREIGN KEY (tenant_id, order_id) REFERENCES public.orders (tenant_id, id);

CREATE FUNCTION pos_sync.record_payload(record jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, pg_temp
AS $$
  SELECT ($1 - ARRAY['mongo_id','mongo_order_id','mongo_customer_id','mongo_product_id',
    'mongo_installment_product_id','invoice_pdf_path','idempotency_key','image_url','updated_at'])
    || jsonb_build_object('sync_version', $1 ->> 'sync_version');
$$;

CREATE FUNCTION pos_sync.stamp_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET timezone = 'UTC'
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Physical removal is disabled for synced records' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Insert a live record before tombstoning it' USING ERRCODE = '23514';
    END IF;
    NEW.sync_version := 1;
    NEW.sync_updated_at := clock_timestamp();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.tenant_id) IS DISTINCT FROM (OLD.id, OLD.tenant_id) THEN
    RAISE EXCEPTION 'Sync identity cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'invoice_counters' THEN
    IF NEW.year <> OLD.year OR NEW.seq < OLD.seq THEN
      RAISE EXCEPTION 'Invoice counters cannot change year or move backwards' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.sync_version := OLD.sync_version;
  NEW.sync_updated_at := OLD.sync_updated_at;
  IF OLD.deleted_at IS NOT NULL AND pos_sync.record_payload(to_jsonb(NEW)) IS DISTINCT FROM pos_sync.record_payload(to_jsonb(OLD)) THEN
    RAISE EXCEPTION 'A tombstone cannot be modified or restored in place' USING ERRCODE = '23514';
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    NEW.deleted_at := clock_timestamp();
    IF TG_TABLE_NAME IN ('branches', 'products', 'installment_products') THEN
      NEW.is_active := false;
    END IF;
  END IF;
  IF pos_sync.record_payload(to_jsonb(NEW)) IS DISTINCT FROM pos_sync.record_payload(to_jsonb(OLD)) THEN
    NEW.sync_version := OLD.sync_version + 1;
    NEW.sync_updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION pos_sync.append_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pos_sync, pg_temp
SET timezone = 'UTC'
AS $$
DECLARE
  next_sequence bigint;
  event uuid;
  changed_at timestamptz;
  after_record jsonb;
  prior_record jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.sync_version = NEW.sync_version THEN RETURN NULL; END IF;
    prior_record := pos_sync.record_payload(to_jsonb(OLD));
  END IF;
  after_record := pos_sync.record_payload(to_jsonb(NEW));
  -- Updating the stream row serializes sequence assignment and commit order per tenant.
  INSERT INTO pos_sync.stream (tenant_id, last_sequence) VALUES (NEW.tenant_id, 1)
  ON CONFLICT (tenant_id) DO UPDATE SET last_sequence = stream.last_sequence + 1
  RETURNING last_sequence INTO next_sequence;
  changed_at := clock_timestamp();
  INSERT INTO pos_sync.outbox (tenant_id, sequence, entity, entity_id, entity_version, operation, occurred_at, payload)
  VALUES (NEW.tenant_id, next_sequence, TG_TABLE_NAME, NEW.id, NEW.sync_version,
    CASE WHEN NEW.deleted_at IS NULL THEN 'upsert' ELSE 'tombstone' END, changed_at,
    CASE WHEN NEW.deleted_at IS NULL THEN after_record ELSE jsonb_build_object(
      'id', NEW.id, 'tenant_id', NEW.tenant_id, 'sync_version', NEW.sync_version::text,
      'sync_updated_at', NEW.sync_updated_at, 'deleted_at', NEW.deleted_at) END)
  RETURNING event_id INTO event;
  IF TG_ARGV[0] = 'financial' THEN
    INSERT INTO pos_sync.financial_history
      (event_id, tenant_id, sequence, entity, entity_id, entity_version, occurred_at, before_record, after_record)
    VALUES (event, NEW.tenant_id, next_sequence, TG_TABLE_NAME, NEW.id, NEW.sync_version,
      changed_at, prior_record, after_record);
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  entity text;
  is_financial boolean;
BEGIN
  FOREACH entity IN ARRAY ARRAY['branches','products','customers','installment_products',
    'orders','order_items','invoice_counters','installment_plans','installment_sales','stock_adjustments']
  LOOP
    is_financial := entity IN ('orders','order_items','invoice_counters','installment_plans','installment_sales','stock_adjustments');
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN sync_version bigint NOT NULL DEFAULT 1 CHECK (sync_version > 0),
      ADD COLUMN sync_updated_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN deleted_at timestamptz', entity);
    IF is_financial THEN
      EXECUTE format('ALTER TABLE public.%I ADD CHECK (deleted_at IS NULL)', entity);
    END IF;
    EXECUTE format('CREATE TRIGGER sync_stamp BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION pos_sync.stamp_change()', entity);
    EXECUTE format('CREATE TRIGGER sync_protect_truncate BEFORE TRUNCATE ON public.%I
      FOR EACH STATEMENT EXECUTE FUNCTION pos_sync.stamp_change()', entity);
    EXECUTE format('CREATE TRIGGER sync_outbox AFTER INSERT OR UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION pos_sync.append_change(%L)', entity,
      CASE WHEN is_financial THEN 'financial' ELSE 'reference' END);
  END LOOP;
END;
$$;

CREATE FUNCTION pos_sync.snapshot(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET timezone = 'UTC' SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  entity text;
  items jsonb;
  history jsonb;
  collections jsonb := '{}'::jsonb;
  high bigint;
BEGIN
  IF NOT EXISTS (SELECT FROM public.tenants WHERE id = p_tenant) THEN
    RAISE EXCEPTION 'Unknown tenant' USING ERRCODE = '22023';
  END IF;
  SELECT last_sequence INTO high FROM pos_sync.stream WHERE tenant_id = p_tenant;
  FOREACH entity IN ARRAY ARRAY['branches','products','customers','installment_products',
    'orders','order_items','invoice_counters','installment_plans','installment_sales','stock_adjustments']
  LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(CASE WHEN r.deleted_at IS NULL
      THEN pos_sync.record_payload(to_jsonb(r)) ELSE jsonb_build_object(
        ''id'', r.id, ''tenant_id'', r.tenant_id, ''sync_version'', r.sync_version::text,
        ''sync_updated_at'', r.sync_updated_at, ''deleted_at'', r.deleted_at) END ORDER BY r.id), ''[]'')
      FROM public.%I AS r WHERE tenant_id = $1', entity) INTO items USING p_tenant;
    collections := collections || jsonb_build_object(entity, items);
  END LOOP;
  SELECT coalesce(jsonb_agg(jsonb_build_object('eventId', h.event_id, 'sequence', h.sequence::text,
    'entity', h.entity, 'entityId', h.entity_id, 'entityVersion', h.entity_version::text,
    'occurredAt', h.occurred_at, 'before', h.before_record, 'after', h.after_record) ORDER BY h.sequence), '[]')
  INTO history FROM pos_sync.financial_history AS h WHERE h.tenant_id = p_tenant;
  RETURN jsonb_build_object('contract', 'kazmion.sync', 'version', 2, 'kind', 'snapshot',
    'sourceId', (SELECT id FROM pos_sync.source), 'tenantId', p_tenant, 'checkpoint', coalesce(high, 0)::text, 'exportedAt', statement_timestamp(),
    'collections', collections, 'financialHistory', history);
END;
$$;

CREATE FUNCTION pos_sync.changes(p_tenant uuid, p_after bigint, p_limit integer DEFAULT 500) RETURNS jsonb
LANGUAGE plpgsql STABLE SET timezone = 'UTC' SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  high bigint;
  floor bigint;
  next_cursor bigint;
  events jsonb;
BEGIN
  IF p_after IS NULL OR p_limit IS NULL OR NOT p_limit BETWEEN 1 AND 1000
    OR NOT EXISTS (SELECT FROM public.tenants WHERE id = p_tenant) THEN
    RAISE EXCEPTION 'Invalid tenant, cursor, or page size' USING ERRCODE = '22023';
  END IF;
  SELECT last_sequence, retained_through INTO high, floor FROM pos_sync.stream WHERE tenant_id = p_tenant;
  high := coalesce(high, 0);
  floor := coalesce(floor, 0);
  IF p_after < floor OR p_after > high THEN
    RAISE EXCEPTION 'Cursor outside retained stream; take a new snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(max(sequence), p_after), coalesce(jsonb_agg(jsonb_build_object(
    'eventId', event_id, 'sequence', sequence::text, 'entity', entity, 'entityId', entity_id,
    'entityVersion', entity_version::text, 'operation', operation, 'occurredAt', occurred_at,
    'record', payload) ORDER BY sequence), '[]')
  INTO next_cursor, events
  FROM (SELECT * FROM pos_sync.outbox WHERE tenant_id = p_tenant AND sequence > p_after
    ORDER BY sequence LIMIT p_limit) AS page;

  RETURN jsonb_build_object('contract', 'kazmion.sync', 'version', 2, 'kind', 'changes',
    'sourceId', (SELECT id FROM pos_sync.source), 'tenantId', p_tenant, 'after', p_after::text, 'checkpoint', next_cursor::text,
    'hasMore', next_cursor < high, 'events', events);
END;
$$;

CREATE FUNCTION pos_sync.acknowledge(p_tenant uuid, p_consumer uuid, p_sequence bigint) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  high bigint;
  floor bigint;
BEGIN
  INSERT INTO pos_sync.stream(tenant_id) VALUES (p_tenant) ON CONFLICT DO NOTHING;
  SELECT last_sequence, retained_through INTO high, floor FROM pos_sync.stream WHERE tenant_id = p_tenant FOR UPDATE;
  IF p_sequence IS NULL OR p_sequence NOT BETWEEN floor AND high THEN
    RAISE EXCEPTION 'Acknowledgement outside retained stream' USING ERRCODE = '22023';
  END IF;
  INSERT INTO pos_sync.checkpoint (tenant_id, consumer_id, acknowledged_sequence)
  VALUES (p_tenant, p_consumer, p_sequence)
  ON CONFLICT (tenant_id, consumer_id) DO UPDATE
    SET acknowledged_sequence = EXCLUDED.acknowledged_sequence, acknowledged_at = now()
    WHERE checkpoint.acknowledged_sequence < EXCLUDED.acknowledged_sequence;
END;
$$;

CREATE FUNCTION pos_sync.prune(p_tenant uuid) RETURNS bigint
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  floor bigint;
  cutoff bigint;
  recent bigint;
BEGIN
  SELECT retained_through INTO floor FROM pos_sync.stream WHERE tenant_id = p_tenant FOR UPDATE;
  SELECT min(acknowledged_sequence) INTO cutoff FROM pos_sync.checkpoint WHERE tenant_id = p_tenant;
  IF cutoff IS NULL OR cutoff <= floor THEN RETURN 0; END IF;
  SELECT min(sequence) INTO recent FROM pos_sync.outbox
    WHERE tenant_id = p_tenant AND sequence <= cutoff AND occurred_at >= now() - interval '90 days';
  cutoff := least(cutoff, coalesce(recent - 1, cutoff));
  IF cutoff <= floor THEN RETURN 0; END IF;
  DELETE FROM pos_sync.outbox WHERE tenant_id = p_tenant AND sequence <= cutoff;
  UPDATE pos_sync.stream SET retained_through = cutoff WHERE tenant_id = p_tenant;
  RETURN cutoff - floor;
END;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA pos_sync FROM PUBLIC;
