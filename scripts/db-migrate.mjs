#!/usr/bin/env node
// Migration runner — applique toute migration jamais appliquée.
//
// Pourquoi pas `prisma migrate deploy` ?
//   Le repo a 58+ migrations dont la majorité a été appliquée à la main sur
//   Supabase (voir HISTORY.md / CLAUDE.md). Pas de `_prisma_migrations`
//   table en prod, pas de `migration_lock.toml` — `migrate deploy` rejouerait
//   tout et casserait. On contourne avec un tracker maison `_app_migrations`.
//
// Comportement :
//   1. Crée `_app_migrations` (idempotent).
//   2. Premier passage : si table InvoiceItem existe déjà avec category, on
//      considère le schéma legacy entièrement appliqué → bulk-insert toutes
//      les migrations < 20260506 dans `_app_migrations` SANS les rejouer.
//   3. Itère prisma/migrations/* triés par nom, valide les règles de safety,
//      applique chacune dans une transaction, marque comme applied avec
//      checksum SHA256 du fichier SQL.
//   4. Idempotent : un re-run ne fait rien si tout est à jour.
//   5. Si un fichier SQL change après application (checksum mismatch) → warning.
//
// Flags :
//   --dry-run         : affiche les migrations qui seraient appliquées, n'exécute rien.
//   --validate-only   : run uniquement la validation statique (pas de DB requise).
//
// Câblé dans `package.json` script `build` (Vercel buildCommand).
// Variables d'env requises : DATABASE_URL (ou DIRECT_URL en fallback).

import { Client } from 'pg';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');
const BASELINE_CUTOFF = '20260506_'; // tout ce qui est strictement avant ce préfixe est legacy.

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VALIDATE_ONLY = argv.includes('--validate-only');

// ---------------------------------------------------------------------------
// Safety validation rules — refusent toute migration dangereuse au pré-vol.
// ---------------------------------------------------------------------------

/**
 * Strip SQL comments (line `--` and block /* ... *\/) and string literals
 * pour éviter les faux-positifs (ex: 'DELETE FROM' dans un INSERT INTO log).
 */
function stripSqlNoise(sql) {
  // Remove block comments
  let out = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Remove line comments
  out = out.replace(/--[^\n]*/g, ' ');
  // Remove single-quoted string literals (handle escaped quotes '')
  out = out.replace(/'(?:''|[^'])*'/g, "''");
  // Remove dollar-quoted strings ($$...$$ and $tag$...$tag$)
  out = out.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, '$$$$');
  return out;
}

/**
 * Valide une migration SQL contre les règles de safety.
 * Retourne { ok: true } ou { ok: false, violations: string[] }.
 */
export function validateMigrationSql(name, sql) {
  const violations = [];
  const cleaned = stripSqlNoise(sql);

  // `-- @safety: reviewed` in the first 20 lines = explicit ack from a human
  // that this migration is intentional (mass-backfill, legacy schema fix, etc.).
  // It bypasses the WHERE-less UPDATE/DELETE rules AND the >100-line rule.
  const header = sql.split('\n').slice(0, 20).join('\n');
  const reviewed = /--\s*@safety:\s*reviewed/i.test(header);

  // Split into top-level statements on `;` — note: dollar-quoted bodies have
  // already been stripped by stripSqlNoise(), so semicolons inside PL/pgSQL
  // bodies are no longer present at this point.
  const topLevelStatements = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of topLevelStatements) {
    // Identify the leading SQL command (first word, ignoring CTEs etc.).
    const firstWordMatch = stmt.match(/^\s*([A-Za-z_]+)/);
    const firstWord = firstWordMatch ? firstWordMatch[1].toUpperCase() : '';

    // 1. DROP TABLE sans IF EXISTS — only when statement STARTS with DROP TABLE.
    if (firstWord === 'DROP' && /^\s*DROP\s+TABLE\b/i.test(stmt)) {
      if (!/^\s*DROP\s+TABLE\s+IF\s+EXISTS\b/i.test(stmt)) {
        violations.push('DROP TABLE without IF EXISTS — use "DROP TABLE IF EXISTS"');
      }
    }

    // 2. DELETE FROM sans WHERE — only top-level DELETE.
    if (firstWord === 'DELETE' && !reviewed) {
      if (!/\bWHERE\b/i.test(stmt)) {
        violations.push('DELETE FROM without WHERE clause — refuse mass-delete (add "-- @safety: reviewed" if intentional)');
      }
    }

    // 3. UPDATE sans WHERE — only top-level UPDATE (skips `ON CONFLICT DO UPDATE`,
    //    FK `ON UPDATE CASCADE`, trigger bodies which are stripped by dollar-quote removal).
    if (firstWord === 'UPDATE' && !reviewed) {
      if (!/\bWHERE\b/i.test(stmt)) {
        violations.push('UPDATE without WHERE clause — refuse mass-update (add "-- @safety: reviewed" if intentional)');
      }
    }
  }

  // 4. Migration > 100 lignes doit avoir un commentaire `-- @safety: reviewed`
  const lineCount = sql.split('\n').length;
  if (lineCount > 100 && !reviewed) {
    violations.push(
      `Migration > 100 lines (${lineCount}) requires "-- @safety: reviewed" comment in the header (first 20 lines)`,
    );
  }

  const unique = Array.from(new Set(violations));
  return unique.length === 0
    ? { ok: true }
    : { ok: false, violations: unique };
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function listMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((n) => {
      try {
        return statSync(join(MIGRATIONS_DIR, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

function loadMigrationSql(name) {
  const file = join(MIGRATIONS_DIR, name, 'migration.sql');
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8');
}

// ---------------------------------------------------------------------------
// Validate-only mode : statique, pas de DB.
// ---------------------------------------------------------------------------

async function runValidateOnly() {
  console.log('[db-migrate] validate-only mode');
  const migrations = listMigrations();
  if (migrations.length === 0) {
    console.log('[db-migrate] no migrations found');
    return 0;
  }

  let errors = 0;
  let checked = 0;
  for (const name of migrations) {
    const sql = loadMigrationSql(name);
    if (sql === null) {
      console.warn(`[db-migrate] ${name}: no migration.sql (skip)`);
      continue;
    }
    if (sql.trim().length === 0) {
      console.warn(`[db-migrate] ${name}: empty (skip)`);
      continue;
    }
    checked += 1;
    const result = validateMigrationSql(name, sql);
    if (!result.ok) {
      errors += 1;
      console.error(`[db-migrate] FAIL ${name}:`);
      for (const v of result.violations) console.error(`    - ${v}`);
    }
  }
  console.log(`[db-migrate] validated ${checked} migration(s), ${errors} failure(s)`);
  return errors === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Main flow.
// ---------------------------------------------------------------------------

async function main() {
  // Validate-only short-circuits everything else (no DB needed).
  if (VALIDATE_ONLY) {
    const code = await runValidateOnly();
    process.exit(code);
  }

  // Dry-run still needs DB to know which migrations are pending.
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.warn('[db-migrate] no DATABASE_URL/DIRECT_URL — skipping');
    process.exit(0);
  }

  // CI / local : ne JAMAIS appliquer les migrations (sauf --dry-run explicite).
  //   - GitHub Actions définit CI=true → skip
  //   - DATABASE_URL pointe localhost → dev local, skip
  //   - Seul l'environnement Vercel production déclenche réellement les migrations.
  if (!DRY_RUN && (process.env.CI === 'true' || url.includes('localhost') || url.includes('127.0.0.1'))) {
    console.log('[db-migrate] Skipping migrations (CI or local DB — production only)');
    process.exit(0);
  }

  if (!existsSync(MIGRATIONS_DIR)) {
    console.warn('[db-migrate] no prisma/migrations dir — skipping');
    process.exit(0);
  }

  // Pre-flight static validation : refuse de démarrer si une migration est cassée.
  const allMigrations = listMigrations();
  let staticErrors = 0;
  for (const name of allMigrations) {
    const sql = loadMigrationSql(name);
    if (!sql || sql.trim().length === 0) continue;
    const result = validateMigrationSql(name, sql);
    if (!result.ok) {
      staticErrors += 1;
      console.error(`[db-migrate] FAIL ${name}:`);
      for (const v of result.violations) console.error(`    - ${v}`);
    }
  }
  if (staticErrors > 0) {
    console.error(`[db-migrate] ${staticErrors} migration(s) failed safety validation — aborting`);
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_app_migrations" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Ensure checksum column exists (forward compat with legacy installs).
    await client.query(`
      ALTER TABLE "_app_migrations" ADD COLUMN IF NOT EXISTS "checksum" TEXT
    `);

    const { rows: existing } = await client.query(
      'SELECT name, checksum FROM "_app_migrations"',
    );
    const appliedMap = new Map(existing.map((r) => [r.name, r.checksum]));

    // Baseline : si tracker vide ET le schéma legacy est en place → marquer
    // toutes les migrations < BASELINE_CUTOFF comme appliquées sans les jouer.
    if (appliedMap.size === 0) {
      const probe = await client.query(`
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'InvoiceItem' AND column_name = 'category' LIMIT 1
      `);
      if (probe.rowCount > 0) {
        const legacy = allMigrations.filter((n) => n < BASELINE_CUTOFF);
        for (const n of legacy) {
          const sql = loadMigrationSql(n);
          const checksum = sql ? sha256(sql) : null;
          if (!DRY_RUN) {
            await client.query(
              'INSERT INTO "_app_migrations"(name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
              [n, checksum],
            );
          }
          appliedMap.set(n, checksum);
        }
        console.log(`[db-migrate] baselined ${legacy.length} legacy migrations${DRY_RUN ? ' (dry-run)' : ''}`);
      }
    }

    // Drift detection : compare checksums for already-applied migrations.
    for (const [name, storedChecksum] of appliedMap.entries()) {
      const sql = loadMigrationSql(name);
      if (!sql) continue;
      const currentChecksum = sha256(sql);
      if (storedChecksum && storedChecksum !== currentChecksum) {
        console.warn(
          `[db-migrate] WARN ${name}: checksum drift detected ` +
          `(stored=${storedChecksum.slice(0, 8)} current=${currentChecksum.slice(0, 8)}) — ` +
          'migration SQL was modified after application',
        );
      }
    }

    const pending = allMigrations.filter((n) => !appliedMap.has(n));
    if (DRY_RUN) {
      console.log(`[db-migrate] dry-run — ${pending.length} pending migration(s):`);
      for (const n of pending) console.log(`    - ${n}`);
      return;
    }

    let count = 0;
    for (const name of pending) {
      const sql = loadMigrationSql(name);
      if (!sql) {
        console.warn(`[db-migrate] skip ${name} (no migration.sql)`);
        continue;
      }
      if (sql.trim().length === 0) {
        console.warn(`[db-migrate] skip ${name} (empty)`);
        continue;
      }
      console.log(`[db-migrate] applying ${name}`);

      // Postgres : CREATE INDEX CONCURRENTLY ne tolère pas une transaction.
      // On split le SQL en deux groupes : statements CONCURRENTLY hors tx,
      // le reste dans la tx unique habituelle. Détection naïve "CONCURRENTLY"
      // (case-insensitive) suffisante pour notre usage.
      const stmts = sql.split(';').map((s) => s.trim()).filter(Boolean);
      const concurrent = stmts.filter((s) => /\bconcurrently\b/i.test(s));
      const transactional = stmts.filter((s) => !/\bconcurrently\b/i.test(s));

      const checksum = sha256(sql);

      try {
        if (transactional.length > 0) {
          await client.query('BEGIN');
          try {
            await client.query(transactional.join(';\n') + ';');
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
        }
        for (const stmt of concurrent) {
          await client.query(stmt);
        }
        await client.query(
          'INSERT INTO "_app_migrations"(name, checksum) VALUES ($1, $2)',
          [name, checksum],
        );
        count += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[db-migrate] FAILED ${name}: ${msg}`);
        throw err;
      }
    }

    console.log(`[db-migrate] done — ${count} new migration(s) applied`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

// Skip main when imported by tests.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
