#!/usr/bin/env node
// Audit script — InvoiceItem rows persisted with category='OTHER' that
// would be re-classified by `inferItemCategory(category, description)`
// into a real category (BOARDING/PET_TAXI/GROOMING/PRODUCT).
//
// Read-only. Outputs a markdown table to stdout + a per-category summary.
// Used to size the data normalization migration before applying it.
//
// Usage :
//   DATABASE_URL='postgresql://...' node scripts/audit-legacy-other-items.mjs
//
// Source of truth for the classification logic : src/lib/category.ts.
// We re-implement the same regex/keyword rules here in pure JS (no app
// import) so the script can run standalone in a CI matrix without a
// full TS build.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Mirror of `categoryKey` from src/lib/category.ts.
 * Returns the bucket inferred from a description, or null if none matches.
 */
function categoryKey(cat, description) {
  if (cat === 'BOARDING') return 'boarding';
  if (cat === 'PET_TAXI') return 'taxi';
  if (cat === 'GROOMING') return 'grooming';
  if (cat === 'PRODUCT') return 'croquettes';
  if (description) {
    const d = description.toLowerCase();
    if (
      d.includes('pension') ||
      d.includes('boarding') ||
      d.includes('nuit') ||
      d.includes('hébergement')
    )
      return 'boarding';
    if (
      d.includes('taxi') ||
      d.includes('transport') ||
      d.includes('aller') ||
      d.includes('retour')
    )
      return 'taxi';
    if (
      d.includes('toilettage') ||
      d.includes('grooming') ||
      d.includes('soin') ||
      d.includes('bain') ||
      d.includes('coupe')
    )
      return 'grooming';
    if (
      d.includes('croquette') ||
      d.includes('kibble') ||
      d.includes('nourriture') ||
      d.includes('royal') ||
      d.includes('grain')
    )
      return 'croquettes';
  }
  return null;
}

function inferItemCategory(cat, description) {
  const k = categoryKey(cat, description);
  if (k === 'boarding') return 'BOARDING';
  if (k === 'taxi') return 'PET_TAXI';
  if (k === 'grooming') return 'GROOMING';
  if (k === 'croquettes') return 'PRODUCT';
  return 'OTHER';
}

async function main() {
  console.log('[audit-legacy-other] scanning InvoiceItem rows where category=OTHER...');

  const items = await prisma.invoiceItem.findMany({
    where: { category: 'OTHER' },
    select: {
      id: true,
      description: true,
      total: true,
      productId: true,
    },
    take: 10_000,
  });

  console.log(`[audit-legacy-other] ${items.length} OTHER rows fetched.\n`);

  const stayedOther = [];
  const remapped = [];
  const summary = {
    BOARDING: { count: 0, total: 0 },
    PET_TAXI: { count: 0, total: 0 },
    GROOMING: { count: 0, total: 0 },
    PRODUCT: { count: 0, total: 0 },
  };

  for (const it of items) {
    const inferred = inferItemCategory('OTHER', it.description ?? undefined);
    const totalNum = it.total != null ? Number(it.total) : 0;

    // Defensive : any item with productId != null should be PRODUCT
    // (resolveItemCategory invariant). Surface those as PRODUCT remaps
    // even when the description doesn't match the kibble keywords.
    let finalInferred = inferred;
    if (it.productId && inferred === 'OTHER') {
      finalInferred = 'PRODUCT';
    }

    if (finalInferred === 'OTHER') {
      stayedOther.push({ id: it.id, description: it.description, total: totalNum });
    } else {
      remapped.push({
        id: it.id,
        description: it.description,
        currentCat: 'OTHER',
        inferredCat: finalInferred,
        total: totalNum,
      });
      summary[finalInferred].count += 1;
      summary[finalInferred].total += totalNum;
    }
  }

  // ── Print tabular detail of remapped rows
  if (remapped.length > 0) {
    console.log('## Items à normaliser\n');
    console.log('| ID                  | Description                          | Cat actuelle | Cat inférée | Total MAD |');
    console.log('|---------------------|--------------------------------------|--------------|-------------|-----------|');
    for (const r of remapped.slice(0, 100)) {
      const desc = (r.description ?? '').slice(0, 36).padEnd(36);
      const id = r.id.slice(0, 19).padEnd(19);
      console.log(
        `| ${id} | ${desc} | OTHER        | ${r.inferredCat.padEnd(11)} | ${r.total.toFixed(2).padStart(9)} |`,
      );
    }
    if (remapped.length > 100) {
      console.log(`\n(+ ${remapped.length - 100} additional rows truncated from display)`);
    }
  } else {
    console.log('No OTHER rows match a known category pattern. Nothing to normalize.');
  }

  // ── Per-category summary
  console.log('\n## Résumé par catégorie cible\n');
  console.log('| Catégorie inférée | Rows  | Total MAD     |');
  console.log('|-------------------|-------|---------------|');
  for (const [cat, agg] of Object.entries(summary)) {
    if (agg.count === 0) continue;
    console.log(`| ${cat.padEnd(17)} | ${String(agg.count).padStart(5)} | ${agg.total.toFixed(2).padStart(13)} |`);
  }
  console.log(`| ${'OTHER (no match)'.padEnd(17)} | ${String(stayedOther.length).padStart(5)} | ${stayedOther
    .reduce((s, r) => s + r.total, 0)
    .toFixed(2)
    .padStart(13)} |`);

  console.log('\n## Items qui restent OTHER (échantillon)\n');
  for (const r of stayedOther.slice(0, 20)) {
    console.log(`  ${r.id} : "${(r.description ?? '').slice(0, 60)}" — ${r.total.toFixed(2)} MAD`);
  }
  if (stayedOther.length > 20) {
    console.log(`  (+ ${stayedOther.length - 20} more)`);
  }

  console.log(
    `\n[audit-legacy-other] DONE — ${remapped.length} rows would be normalized, ${stayedOther.length} stay OTHER (legitimate or unknown).`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[audit-legacy-other] FAILED', err);
  process.exit(1);
});
