#!/usr/bin/env node
/**
 * Restore-from-backup drill — outil ponctuel pour valider la chaîne
 * de sauvegarde Supabase Storage → DB cible.
 *
 * Usage :
 *   RESTORE_TARGET_DATABASE_URL="postgresql://..." \
 *   SUPABASE_URL="..." SUPABASE_SERVICE_ROLE_KEY="..." \
 *   node scripts/restore-from-backup.mjs --backup-key=backups/2026-05-07.json
 *
 * Modes :
 *   --dry-run   N'écrit rien. Lit le dump, affiche les counts par table.
 *   (defaut)    Insère dans la DB cible (TRONQUE d'abord les tables).
 *
 * Le dump JSON attendu a la structure :
 *   {
 *     "createdAt": "2026-05-07T03:00:00Z",
 *     "tables": {
 *       "User": [ { id, email, ... }, ... ],
 *       "Pet": [ ... ],
 *       ...
 *     }
 *   }
 *
 * Voir docs/RESTORE_DRILL.md pour la procédure complète.
 *
 * NE PAS exécuter contre la DB de production. RESTORE_TARGET_DATABASE_URL
 * doit pointer vers un projet Supabase staging dédié au drill.
 */

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const backupKeyArg = args.find((a) => a.startsWith('--backup-key='));
const backupKey = backupKeyArg ? backupKeyArg.split('=')[1] : null;

if (!backupKey) {
  console.error('ERROR: --backup-key=<storage path> requis');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_DB = process.env.RESTORE_TARGET_DATABASE_URL;
const BACKUP_BUCKET = process.env.SUPABASE_BACKUP_BUCKET ?? 'backups';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis');
  process.exit(1);
}

if (!dryRun && !TARGET_DB) {
  console.error('ERROR: RESTORE_TARGET_DATABASE_URL requis (sauf --dry-run)');
  process.exit(1);
}

if (TARGET_DB && /production|prod\b/i.test(TARGET_DB)) {
  console.error('ERROR: RESTORE_TARGET_DATABASE_URL semble pointer vers la prod. Abandon.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log(`[restore] mode=${dryRun ? 'DRY-RUN' : 'WRITE'} key=${backupKey} bucket=${BACKUP_BUCKET}`);

// 1. Téléchargement du dump
const { data: blob, error: dlErr } = await supabase.storage
  .from(BACKUP_BUCKET)
  .download(backupKey);

if (dlErr || !blob) {
  console.error('ERROR: download failed:', dlErr?.message ?? 'unknown');
  process.exit(1);
}

const text = await blob.text();
let dump;
try {
  dump = JSON.parse(text);
} catch (err) {
  console.error('ERROR: dump JSON parse:', err.message);
  process.exit(1);
}

if (!dump.tables || typeof dump.tables !== 'object') {
  console.error('ERROR: dump.tables manquant ou invalide');
  process.exit(1);
}

const counts = Object.fromEntries(
  Object.entries(dump.tables).map(([t, rows]) => [t, Array.isArray(rows) ? rows.length : 0])
);

console.log(`[restore] dump createdAt=${dump.createdAt ?? 'unknown'}`);
console.log('[restore] counts par table:');
for (const [t, c] of Object.entries(counts)) {
  console.log(`  ${t.padEnd(30)} ${c}`);
}

if (dryRun) {
  console.log('[restore] DRY-RUN — aucune écriture. Fin.');
  process.exit(0);
}

// 2. Connexion à la DB cible
process.env.DATABASE_URL = TARGET_DB;
const prisma = new PrismaClient();

// Ordre d'insertion (parents d'abord pour respecter les FK).
// À maintenir alignée avec schema.prisma.
const TABLE_ORDER = [
  'Tenant',
  'User',
  'Pet',
  'Setting',
  'Product',
  'Booking',
  'BookingItem',
  'BoardingDetail',
  'TaxiDetail',
  'TaxiTrip',
  'Invoice',
  'InvoiceItem',
  'Payment',
  'LoyaltyGrade',
  'LoyaltyBenefitClaim',
  'Notification',
  'AdminNote',
  'ActionLog',
  'AuditLog',
  'ClientContract',
  'StayPhoto',
  'Review',
  'Vaccination',
  'MonthlyRevenueSummary',
];

console.log('[restore] truncate des tables cibles dans l\'ordre inverse...');
for (const table of [...TABLE_ORDER].reverse()) {
  if (!dump.tables[table]) continue;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
    console.log(`  truncated ${table}`);
  } catch (err) {
    console.warn(`  WARN truncate ${table}: ${err.message}`);
  }
}

console.log('[restore] insertion en cours...');
for (const table of TABLE_ORDER) {
  const rows = dump.tables[table];
  if (!rows || rows.length === 0) continue;
  const model = table.charAt(0).toLowerCase() + table.slice(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const delegate = (prisma)[model];
  if (!delegate?.createMany) {
    console.warn(`  SKIP ${table}: pas de delegate Prisma`);
    continue;
  }
  try {
    const res = await delegate.createMany({ data: rows, skipDuplicates: true });
    console.log(`  ${table.padEnd(30)} +${res.count}/${rows.length}`);
  } catch (err) {
    console.error(`  ERR ${table}: ${err.message}`);
  }
}

await prisma.$disconnect();
console.log('[restore] terminé.');
