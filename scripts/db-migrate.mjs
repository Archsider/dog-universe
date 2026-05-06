#!/usr/bin/env node
// Migration runner — applique toute migration jamais appliquée.
//
// Pourquoi pas `prisma migrate deploy` ?
//   Le repo a 58 migrations dont la majorité a été appliquée à la main sur
//   Supabase (voir HISTORY.md / CLAUDE.md). Pas de `_prisma_migrations`
//   table en prod, pas de `migration_lock.toml` — `migrate deploy` rejouerait
//   tout et casserait. On contourne avec un tracker maison `_app_migrations`.
//
// Comportement :
//   1. Crée `_app_migrations` (idempotent).
//   2. Premier passage : si table InvoiceItem existe déjà avec category, on
//      considère le schéma legacy entièrement appliqué → bulk-insert toutes
//      les migrations < 20260506 dans `_app_migrations` SANS les rejouer.
//   3. Itère prisma/migrations/* triés par nom, applique chacune dans une
//      transaction, marque comme applied.
//   4. Idempotent : un re-run ne fait rien si tout est à jour.
//
// Câblé dans `package.json` script `db:migrate:auto` + Vercel buildCommand.
// Variables d'env requises : DATABASE_URL (ou DIRECT_URL en fallback).

import { Client } from 'pg';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
const BASELINE_CUTOFF = '20260506_'; // tout ce qui est strictement avant ce préfixe est legacy.

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.warn('[db-migrate] no DATABASE_URL/DIRECT_URL — skipping');
  process.exit(0);
}

if (!existsSync(MIGRATIONS_DIR)) {
  console.warn('[db-migrate] no prisma/migrations dir — skipping');
  process.exit(0);
}

const client = new Client({ connectionString: url });

async function main() {
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS "_app_migrations" (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const subdirs = readdirSync(MIGRATIONS_DIR)
    .filter((n) => statSync(join(MIGRATIONS_DIR, n)).isDirectory())
    .sort();

  const { rows: existing } = await client.query('SELECT name FROM "_app_migrations"');
  const applied = new Set(existing.map((r) => r.name));

  // Baseline : si tracker vide ET le schéma legacy est en place → marquer
  // toutes les migrations < BASELINE_CUTOFF comme appliquées sans les jouer.
  if (applied.size === 0) {
    const probe = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'InvoiceItem' AND column_name = 'category' LIMIT 1
    `);
    if (probe.rowCount > 0) {
      const legacy = subdirs.filter((n) => n < BASELINE_CUTOFF);
      for (const n of legacy) {
        await client.query(
          'INSERT INTO "_app_migrations"(name) VALUES ($1) ON CONFLICT DO NOTHING',
          [n],
        );
        applied.add(n);
      }
      console.log(`[db-migrate] baselined ${legacy.length} legacy migrations`);
    }
  }

  let count = 0;
  for (const name of subdirs) {
    if (applied.has(name)) continue;
    const file = join(MIGRATIONS_DIR, name, 'migration.sql');
    if (!existsSync(file)) {
      console.warn(`[db-migrate] skip ${name} (no migration.sql)`);
      continue;
    }
    const sql = readFileSync(file, 'utf8');
    if (sql.trim().length === 0) {
      console.warn(`[db-migrate] skip ${name} (empty)`);
      continue;
    }
    console.log(`[db-migrate] applying ${name}`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO "_app_migrations"(name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[db-migrate] FAILED ${name}: ${msg}`);
      throw err;
    }
  }

  console.log(`[db-migrate] done — ${count} new migration(s) applied`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    try { await client.end(); } catch { /* noop */ }
    console.error(err);
    process.exit(1);
  });
