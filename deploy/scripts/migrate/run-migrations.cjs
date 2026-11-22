#!/usr/bin/env node
/**
 * KazmiOn PostgreSQL Migration Runner
 *
 * Applies SQL migration files from deploy/database/postgresql/migrations/ in order.
 * Tracks applied migrations in schema_migrations table.
 *
 * Usage:
 *   node deploy/scripts/migrate/run-migrations.cjs
 *   POSTGRES_URL=postgresql://... node deploy/scripts/migrate/run-migrations.cjs
 */

'use strict';

const { Client } = require('pg');
const fs         = require('fs');
const path       = require('path');

const POSTGRES_URL  = process.env.POSTGRES_URL || 'postgresql://kazmion:kazmion@localhost:5432/kazmion';
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', '..', 'database', 'postgresql', 'migrations');

async function main() {
  const client = new Client({ connectionString: POSTGRES_URL });
  await client.connect();
  console.log('[✓] Connected to PostgreSQL');

  // Ensure schema_migrations table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found in', MIGRATIONS_DIR);
    await client.end();
    return;
  }

  for (const file of files) {
    const res = await client.query(`SELECT 1 FROM schema_migrations WHERE filename=$1`, [file]);
    if (res.rows.length > 0) {
      console.log(`  [skip] ${file} (already applied)`);
      continue;
    }

    console.log(`  [run ] ${file}`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (filename) VALUES ($1)`, [file]);
      console.log(`  [done] ${file}`);
    } catch (err) {
      console.error(`  [FAIL] ${file}:`, err.message);
      await client.end();
      process.exit(1);
    }
  }

  console.log('\n[✓] All migrations applied');
  await client.end();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
