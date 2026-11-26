#!/usr/bin/env node
/**
 * KazmiOn PostgreSQL Migration Runner
 *
 * Applies SQL migration files from deploy/database/postgresql/migrations/ in order.
 * Tracks applied files separately from legacy schema version metadata.
 *
 * Usage:
 *   node deploy/scripts/migrate/run-migrations.cjs
 *   POSTGRES_URL=postgresql://... node deploy/scripts/migrate/run-migrations.cjs
 */

'use strict';

const { createRequire } = require('node:module');
const fs         = require('fs');
const path       = require('path');

const { Client } = createRequire(path.join(__dirname, '../migration/package.json'))('pg');
const POSTGRES_URL = process.env.POSTGRES_URL;
const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'database', 'postgresql', 'migrations');

async function main() {
  if (!POSTGRES_URL) throw new Error('Set POSTGRES_URL to an explicit PostgreSQL database');
  const files = fs.readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
  if (!files.length) throw new Error('No PostgreSQL migrations found');
  const client = new Client({ connectionString: POSTGRES_URL });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('kazmion:sql-migrations'))");
    await client.query(`
      CREATE TABLE IF NOT EXISTS pos_sql_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    for (const file of files) {
      const result = await client.query('SELECT 1 FROM pos_sql_migrations WHERE filename = $1', [file]);
      if (result.rowCount) {
        console.log(`[skip] ${file}`);
        continue;
      }
      try {
        await client.query('BEGIN');
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('INSERT INTO pos_sql_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed (SQLSTATE ${error.code ?? 'unknown'})`);
      }
      console.log(`[done] ${file}`);
    }
  } finally {
    await client.end();
  }
}

main().catch(error => {
  const safe = /^(Set POSTGRES_URL|No PostgreSQL migrations|Migration .* failed)/.test(error.message);
  console.error(safe ? error.message : 'PostgreSQL migration failed. Check database connectivity and permissions.');
  process.exitCode = 1;
});
