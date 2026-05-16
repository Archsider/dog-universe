#!/usr/bin/env node
// Sémantique B impact report — diff par mois entre l'ancienne MV (cash
// basis pure post-pivot 2026-05-17) et l'archive Sémantique A
// (`monthly_revenue_mv_v1_archive_20260517`).
//
// Usage (post-migration) :
//   DATABASE_URL='postgresql://...' node scripts/semantic-b-impact-report.mjs
//
// Génère `docs/SEMANTIC_B_MIGRATION_IMPACT.md` à la racine du repo.
//
// Mehdi → ce rapport sert à présenter le pivot au comptable : il liste
// les mois impactés, le delta net par catégorie, et les factures pivots
// (résa avril payée mai, etc.) responsables du shift.
//
// Le script est read-only : aucune mutation, juste deux SELECT (nouvelle
// MV + archive) + un JOIN en mémoire pour calculer les diffs.

import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const prisma = new PrismaClient();
const OUT_PATH = 'docs/SEMANTIC_B_MIGRATION_IMPACT.md';

function fmt(n) {
  return n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ymKey(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`;
}

async function main() {
  console.log('[impact] reading new MV (Sémantique B)...');
  const newRows = await prisma.$queryRawUnsafe(`
    SELECT year, month, category, total::float8 AS total
    FROM monthly_revenue_mv
    ORDER BY year, month, category
  `);

  console.log('[impact] reading archive MV (Sémantique A)...');
  let oldRows = [];
  try {
    oldRows = await prisma.$queryRawUnsafe(`
      SELECT year, month, category, total::float8 AS total
      FROM monthly_revenue_mv_v1_archive_20260517
      ORDER BY year, month, category
    `);
  } catch (err) {
    console.error('[impact] archive MV not found — was the migration applied ?');
    console.error('         expected table : monthly_revenue_mv_v1_archive_20260517');
    console.error('         error:', err.message);
    process.exit(1);
  }

  // Bucket : key = "YYYY-MM:category" → { old, new, diff }
  const buckets = new Map();
  for (const r of oldRows) {
    const k = `${ymKey(r.year, r.month)}:${r.category}`;
    buckets.set(k, { year: r.year, month: r.month, category: r.category, old: Number(r.total), new: 0 });
  }
  for (const r of newRows) {
    const k = `${ymKey(r.year, r.month)}:${r.category}`;
    if (!buckets.has(k)) {
      buckets.set(k, { year: r.year, month: r.month, category: r.category, old: 0, new: Number(r.total) });
    } else {
      buckets.get(k).new = Number(r.total);
    }
  }
  for (const b of buckets.values()) {
    b.diff = Math.round((b.new - b.old) * 100) / 100;
  }

  // Group by month for the report.
  const byMonth = new Map();
  let totalOld = 0;
  let totalNew = 0;
  for (const b of buckets.values()) {
    const k = ymKey(b.year, b.month);
    if (!byMonth.has(k)) byMonth.set(k, { year: b.year, month: b.month, cats: [], oldSum: 0, newSum: 0 });
    const m = byMonth.get(k);
    m.cats.push(b);
    m.oldSum += b.old;
    m.newSum += b.new;
    totalOld += b.old;
    totalNew += b.new;
  }

  const monthsSorted = [...byMonth.values()].sort((a, b) => a.year - b.year || a.month - b.month);

  // Build markdown
  let md = `# Impact comptable — pivot Sémantique A → Sémantique B (2026-05-17)\n\n`;
  md += `_Généré automatiquement par \`scripts/semantic-b-impact-report.mjs\`._\n\n`;
  md += `## Contexte\n\n`;
  md += `Avant le 2026-05-17, le CA mensuel était calculé en **Sémantique A** (paid-clôture) : `;
  md += `une facture était attribuée au mois de son dernier paiement, sur la base du total `;
  md += `de la facture. Cette logique divergeait de l'extrait bancaire et de la déclaration `;
  md += `fiscale du comptable (cash basis pure).\n\n`;
  md += `Depuis 2026-05-17, **Sémantique B** (cash basis pure) attribue chaque \`Payment.amount\` `;
  md += `au mois de \`Payment.paymentDate\` Casa, peu importe la date de la facture ou du séjour. `;
  md += `Pour la catégorisation, chaque paiement est réparti au prorata des `;
  md += `\`InvoiceItem.allocatedAmount\` de la facture parente.\n\n`;
  md += `## Synthèse globale\n\n`;
  md += `| Source | Total CA (MAD) |\n`;
  md += `|---|--:|\n`;
  md += `| Sémantique A (archive) | ${fmt(totalOld)} |\n`;
  md += `| Sémantique B (nouvelle) | ${fmt(totalNew)} |\n`;
  md += `| **Delta net** | **${fmt(totalNew - totalOld)}** |\n\n`;

  md += `> Note : le delta global doit être proche de zéro (les paiements ne changent pas de `;
  md += `> nature, ils changent de mois). Un delta net significatif signale soit des factures `;
  md += `> CANCELLED full-paid incluses différemment, soit un bug de catégorisation.\n\n`;

  md += `## Diff par mois\n\n`;
  for (const m of monthsSorted) {
    const ymLabel = `${m.year}-${String(m.month).padStart(2, '0')}`;
    md += `### ${ymLabel}\n\n`;
    md += `| Catégorie | Sémantique A | Sémantique B | Δ |\n`;
    md += `|---|--:|--:|--:|\n`;
    m.cats.sort((a, b) => a.category.localeCompare(b.category));
    for (const c of m.cats) {
      const sign = c.diff > 0 ? '+' : '';
      md += `| ${c.category} | ${fmt(c.old)} | ${fmt(c.new)} | ${sign}${fmt(c.diff)} |\n`;
    }
    const monthDelta = Math.round((m.newSum - m.oldSum) * 100) / 100;
    const sign = monthDelta > 0 ? '+' : '';
    md += `| **Total mois** | **${fmt(m.oldSum)}** | **${fmt(m.newSum)}** | **${sign}${fmt(monthDelta)}** |\n\n`;
  }

  md += `## Cas pivots connus (sanity check)\n\n`;
  md += `Ces factures de prod ont été utilisées comme test régression (\`src/lib/__tests__/business-regression.test.ts\` §1) :\n\n`;
  md += `- **Anas Chekroun DU-2026-0023** : résa avril, payé mai → 100% mai\n`;
  md += `- **Benjamin Boksenbaum DU-2026-0033** : résa avril, payé mai → 100% mai\n`;
  md += `- **Imane Berrada DU-2026-0028** : tout avril → 100% avril\n`;
  md += `- **Rita Kabbaj DU-2026-0030** : 900 avril + 40 mai → split entre les deux mois\n`;
  md += `- **Alexandra Bon DU-2026-0024** : 1000 avril + 940 mai → split entre les deux mois\n`;
  md += `- **Marie Lagarde DU-2026-0052** : CANCELLED avec paidAmount=0 → 0 CA (exclu des 2 sémantiques)\n\n`;

  md += `## Procédure (récap)\n\n`;
  md += `Cette migration a été appliquée le **2026-05-17** :\n\n`;
  md += `1. \`REFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue_mv\` (point de comparaison frais)\n`;
  md += `2. \`prisma/migrations/20260517_revenue_mv_semantic_b/migration.sql\` (rename archive + create function + rebuild MV)\n`;
  md += `3. \`node scripts/semantic-b-impact-report.mjs\` (ce rapport)\n`;
  md += `4. Vérification \`/admin/health\` : invariants #11 #12 verts\n\n`;
  md += `En cas de rollback (30s) : voir le bloc commenté en bas de \`migration.sql\`. L'archive `;
  md += `\`monthly_revenue_mv_v1_archive_20260517\` est conservée 30 jours puis droppée.\n`;

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, md, 'utf8');
  console.log(`[impact] wrote ${OUT_PATH} (${monthsSorted.length} months, ${buckets.size} cells)`);
}

main()
  .catch((err) => {
    console.error('[impact] fatal:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
