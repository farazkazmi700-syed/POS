CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  byte_count INTEGER,
  sha256 TEXT
);

CREATE TABLE snapshot_chunks (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  content BLOB NOT NULL,
  PRIMARY KEY (snapshot_id, ordinal)
);

CREATE TABLE current_snapshots (
  business_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  started_at INTEGER NOT NULL
);
