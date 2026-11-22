-- Lossless staging only. This is not the final application schema.
CREATE SCHEMA IF NOT EXISTS migration;
REVOKE ALL ON SCHEMA migration FROM PUBLIC;
CREATE TABLE IF NOT EXISTS migration.target_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  source_database text NOT NULL,
  business_id text,
  purpose text NOT NULL CHECK (purpose = 'staging'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS migration.source_records (
  collection_name text NOT NULL,
  legacy_id text NOT NULL,
  source_bson bytea NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_name, legacy_id)
);
CREATE TABLE IF NOT EXISTS migration.collection_manifests (
  collection_name text PRIMARY KEY,
  source_count bigint NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
