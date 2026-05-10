#!/usr/bin/env node
// Migration rollback runner — applique le `down.sql` d'une migration.
//
// Usage :
//   node scripts/db-rollback.mjs <migration_name>
//   node scripts/db-rollback.mjs 20260512_addon_request
//
// Convention :
//   - Chaque dossier `prisma/migrations/<name>/` peut contenir un `down.sql`.
//   - Un down.sql commençant (dans les 5 premières lignes) par
//     `-- @rollback: not-applicable` est REJETÉ — la migration est déclarée
//     non-rollbackable (perte de données, drop irréversible, etc.).
//   - Pas de down.sql → rollback impossible, exit 1.
//
// Comportement :
//   1. Charge le down.sql.
//   2. Vérifie l'absence du marker not-applicable.
//   3. Applique le SQL dans une transaction.
//   4. Supprime la row dans `_app_migrations` pour permettre une réapplication.
//
// Flags :
//   --dry-run : affiche le SQL qui serait exécuté, ne touche pas la DB.

import { Client } from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const positional = argv.filter((a) => !a.startsWith('--'));
const MIGRATION_NAME = positional[0];

/**
 * Parse le header d'un down.sql et retourne la directive `@rollback:` si
 * présente dans les 5 premières lignes (case-insensitive).
 *
 * Valeurs reconnues :
 *   - 'not-applicable' : rollback explicitement refusé.
 *   - undefined        : pas de directive, rollback applicable.
 */
export function parseRollbackHeader(sql) {
  const head = sql.split('\n').slice(0, 5).join('\n');
  const m = head.match(/--\s*@rollback:\s*([A-Za-z0-9_-]+)/i);
  return m ? m[1].toLowerCase() : undefined;
}

/**
 * Charge le down.sql d'une migration. Retourne :
 *   - { found: false }                                    si le fichier n'existe pas
 *   - { found: true, sql, directive: 'not-applicable' }   si marker présent
 *   - { found: true, sql }                                rollback exécutable
 */
export function loadDownSql(migrationName, baseDir = MIGRATIONS_DIR) {
  const file = join(baseDir, migrationName, 'down.sql');
  if (!existsSync(file)) return { found: false };
  const sql = readFileSync(file, 'utf8');
  const directive = parseRollbackHeader(sql);
  return { found: true, sql, directive };
}

async function main() {
  if (!MIGRATION_NAME) {
    console.error('[db-rollback] usage: node scripts/db-rollback.mjs <migration_name> [--dry-run]');
    process.exit(2);
  }

  const migrationDir = join(MIGRATIONS_DIR, MIGRATION_NAME);
  if (!existsSync(migrationDir)) {
    console.error(`[db-rollback] migration not found: ${MIGRATION_NAME}`);
    process.exit(2);
  }

  const loaded = loadDownSql(MIGRATION_NAME);
  if (!loaded.found) {
    console.error(`[db-rollback] no down.sql for ${MIGRATION_NAME} — rollback impossible`);
    process.exit(1);
  }
  if (loaded.directive === 'not-applicable') {
    console.error(`[db-rollback] ${MIGRATION_NAME}: marked "@rollback: not-applicable" — refusing`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log(`[db-rollback] dry-run — would apply down.sql for ${MIGRATION_NAME}:`);
    console.log(loaded.sql);
    return;
  }

  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error('[db-rollback] DATABASE_URL/DIRECT_URL required');
    process.exit(2);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log(`[db-rollback] applying down.sql for ${MIGRATION_NAME}`);
    await client.query('BEGIN');
    try {
      await client.query(loaded.sql);
      await client.query('DELETE FROM "_app_migrations" WHERE name = $1', [MIGRATION_NAME]);
      await client.query('COMMIT');
      console.log(`[db-rollback] ${MIGRATION_NAME} rolled back`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
