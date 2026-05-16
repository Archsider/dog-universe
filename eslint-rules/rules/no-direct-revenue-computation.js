// no-direct-revenue-computation
//
// Forbids any direct `prisma.payment.aggregate({ _sum: { amount: true } })`
// or `prisma.payment.groupBy(...)` that sums `amount` outside of the
// canonical helper `src/lib/billing/monthly-revenue.ts`.
//
// Rationale
// ─────────
// Sémantique B (cash basis pure, depuis 2026-05-17) déclare que
// `getMonthlyRevenueByCategory(year, month)` est l'UNIQUE point d'entrée
// pour le CA mensuel par catégorie. Tout consommateur (dashboard,
// analytics, exports CSV, invariants horaires, page billing) DOIT passer
// par ce helper. La formule métier (prorata des allocatedAmount sur la
// facture parente) est implémentée dans la PG function
// `compute_payment_by_category` et matérialisée dans `monthly_revenue_mv`.
//
// Un appel direct à `prisma.payment.aggregate({ _sum: amount })` avec un
// filtre `paymentDate` mensuel bypass :
//   - la MV cache (drift visible 2h après chaque write)
//   - le drift check live vs MV (Sentry alert manqué)
//   - la catégorisation prorata (l'aggregate brut ne split pas par
//     `InvoiceItem.category`)
//   - les invariants horaires #11 #12 (qui comparent helper canonique
//     vs computeLive, pas helper vs sum brut)
//
// Patch direction
// ───────────────
// Remplacer
//   const sum = await prisma.payment.aggregate({
//     _sum: { amount: true },
//     where: { paymentDate: { gte, lte } },
//   });
// par
//   const { rows, totalAllCategories } = await getMonthlyRevenueByCategory(year, month);
//
// Whitelisting
// ────────────
// - `src/lib/billing/monthly-revenue.ts` — canonical impl (autorisée à
//   calculer live via computeLive)
// - `src/lib/billing/*.ts`               — services billing voisins
//   (allocation, cancel-invoice, etc. — autorisés à faire des aggregates
//   non-mensuels sur Payment, ex : SUM(payments) vs paidAmount sur 1
//   facture)
// - `src/lib/health-invariants.ts`       — invariants horaires (peut
//   appeler aggregate brut pour la croisée JS-vs-MV)
// - `src/lib/payment-allocation.ts`      — owns la canonical write path,
//   read aggregates per-invoice OK
// - Tests / scripts / migrations         — via .eslintrc.json overrides
//
// Detection
// ─────────
// La règle déclenche si TOUTES ces conditions sont vraies :
//   1. Le call est `<x>.payment.aggregate(args)` ou `<x>.payment.groupBy(args)`
//   2. `args[0]` contient `_sum: { amount: true }` (signal money sum)
//   3. `args[0].where` mentionne `paymentDate` (signal filtre mensuel)
//
// Le double signal évite les faux positifs sur :
//   - aggregates per-invoice (where: { invoiceId }) — légitimes
//   - aggregates sans _sum.amount (count, etc.) — pas du CA mensuel

'use strict';

const MUTATION_METHODS = new Set(['aggregate', 'groupBy']);

function isWhitelistedImpl(filename) {
  if (!filename) return false;
  const norm = filename.replace(/\\/g, '/');
  // Canonical helper — owns the live path.
  if (norm.endsWith('/src/lib/billing/monthly-revenue.ts')) return true;
  // Sibling billing services (cancel-invoice, allocation, etc.).
  if (norm.includes('/src/lib/billing/')) return true;
  if (norm.endsWith('/src/lib/billing.ts')) return true;
  // Allocation owns the write path → may aggregate per-invoice on read.
  if (norm.endsWith('/src/lib/payment-allocation.ts')) return true;
  // Invariants cron compares helper vs raw — legitimate JS-vs-MV check.
  if (norm.endsWith('/src/lib/health-invariants.ts')) return true;
  return false;
}

function describeChain(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier' && !node.computed) {
    return `${describeChain(node.object)}.${node.property.name}`;
  }
  if (node.type === 'ThisExpression') return 'this';
  return '<expr>';
}

/** Returns the value node of `key` in an ObjectExpression, or null. */
function getProp(objExpr, key) {
  if (!objExpr || objExpr.type !== 'ObjectExpression') return null;
  for (const prop of objExpr.properties) {
    if (prop.type !== 'Property') continue;
    if (prop.computed) continue;
    let k = null;
    if (prop.key.type === 'Identifier') k = prop.key.name;
    else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') k = prop.key.value;
    if (k === key) return prop.value;
  }
  return null;
}

/** True if obj looks like `{ amount: true }` (sums the money column). */
function sumsAmount(sumValue) {
  if (!sumValue || sumValue.type !== 'ObjectExpression') return false;
  const amount = getProp(sumValue, 'amount');
  if (!amount) return false;
  // `amount: true` is the standard Prisma signal. We also accept any
  // truthy literal / identifier as a defensive measure.
  if (amount.type === 'Literal') return amount.value === true || amount.value === 1;
  return true;
}

/** True if where clause mentions `paymentDate` anywhere (recursive walk). */
function whereMentionsPaymentDate(node) {
  if (!node) return false;
  if (node.type !== 'ObjectExpression') return false;
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue;
    if (prop.computed) continue;
    let k = null;
    if (prop.key.type === 'Identifier') k = prop.key.name;
    else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') k = prop.key.value;
    if (k === 'paymentDate') return true;
    // Recurse into nested where shapes : AND / OR / NOT arrays + objects.
    if (prop.value.type === 'ObjectExpression') {
      if (whereMentionsPaymentDate(prop.value)) return true;
    } else if (prop.value.type === 'ArrayExpression') {
      for (const el of prop.value.elements) {
        if (el && el.type === 'ObjectExpression' && whereMentionsPaymentDate(el)) return true;
      }
    }
  }
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid direct `prisma.payment.aggregate({ _sum: amount })` filtered by month — use `getMonthlyRevenueByCategory` from `@/lib/billing/monthly-revenue`.',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        '`{{ chain }}.payment.{{ method }}` with `_sum.amount` + `paymentDate` filter is a direct monthly revenue computation. Sémantique B mandates the canonical helper `getMonthlyRevenueByCategory(year, month)` from `@/lib/billing/monthly-revenue` (reads MV cache + drift check + categorisation prorata). Bypass invalides invariants #11 #12. Inline escape : `// eslint-disable-next-line dog-universe/no-direct-revenue-computation -- OK: <justification>`.',
    },
  },
  create(context) {
    if (isWhitelistedImpl(context.getFilename())) return {};

    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.computed) return;
        const method = callee.property;
        if (method.type !== 'Identifier') return;
        if (!MUTATION_METHODS.has(method.name)) return;
        const paymentMember = callee.object;
        if (paymentMember.type !== 'MemberExpression') return;
        if (paymentMember.computed) return;
        if (paymentMember.property.type !== 'Identifier') return;
        if (paymentMember.property.name !== 'payment') return;

        const args = node.arguments;
        if (!args || args.length === 0) return;
        const first = args[0];
        if (!first || first.type !== 'ObjectExpression') return;

        const sumValue = getProp(first, '_sum');
        if (!sumsAmount(sumValue)) return;

        const whereValue = getProp(first, 'where');
        if (!whereMentionsPaymentDate(whereValue)) return;

        const chain = describeChain(paymentMember.object) || 'prisma';
        context.report({
          node,
          messageId: 'forbidden',
          data: { chain, method: method.name },
        });
      },
    };
  },
};
