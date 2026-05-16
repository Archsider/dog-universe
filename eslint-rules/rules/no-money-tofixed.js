// no-money-tofixed
//
// Forbids `.toFixed()` on any expression whose receiver heuristically
// looks like a monetary amount : the rightmost identifier in the member
// chain matches one of the known money names (amount, paidAmount,
// allocatedAmount, total, unitPrice, price, fee, refund, balance).
//
// Rationale
// ─────────
// Decimal.prototype.toFixed() silently rounds at the digit boundary and
// returns a plain string. Two sites of harm :
//   1. Display : `invoice.amount.toFixed(2)` produced the legendary
//      Rita DU-2026-0030 = "120.10" while the real Decimal was 120.105.
//      Use `formatMAD(value)` instead — it is Decimal-aware and goes
//      through the canonical MAD formatter.
//   2. Compute : `(a.amount + b.amount).toFixed(2)` performs a float
//      addition before the toFixed. Use Decimal arithmetic when summing
//      and let the formatter handle presentation.
//
// Auto-suggestion : `formatMAD(value)` for display, `.toString()` if
// you really want the raw Decimal string (no rounding).
//
// Whitelisting
// ────────────
// - Test files, scripts/, migrations/ → skipped via overrides in
//   .eslintrc.json.
// - Inline escape : `// eslint-disable-next-line dog-universe/no-money-
//   tofixed -- OK: <justification>`.

'use strict';

const MONEY_NAMES = new Set([
  'amount',
  'paidAmount',
  'allocatedAmount',
  'unallocatedAmount',
  'total',
  'subtotal',
  'unitPrice',
  'price',
  'pricePerNight',
  'taxiAddonPrice',
  'groomingPrice',
  'finalAmount',
  'historicalSpendMAD',
  'totalPrice',
  'totalSpentMAD',
  'boardingRevenue',
  'groomingRevenue',
  'taxiRevenue',
  'otherRevenue',
  'fee',
  'refund',
  'balance',
  'cash',
  'mad',
]);

function looksLikeMoney(name) {
  if (!name) return false;
  if (MONEY_NAMES.has(name)) return true;
  const lower = name.toLowerCase();
  // Defensive : catch suffixed conventions like `totalMAD`, `priceMad`.
  if (lower.endsWith('mad')) return true;
  if (lower.endsWith('amount')) return true;
  if (lower.endsWith('price')) return true;
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid `.toFixed()` on money-like fields — use `formatMAD()` for display.',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        '`.toFixed()` on `{{ name }}` loses Decimal precision and returns a string. Use `formatMAD({{ name }})` (from `@/lib/utils`) for display, or `.toString()` if you really need the raw Decimal value. Inline escape : `// eslint-disable-next-line dog-universe/no-money-tofixed -- OK: <justification>`.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.computed) return;
        const prop = callee.property;
        if (prop.type !== 'Identifier' || prop.name !== 'toFixed') return;

        // Inspect the receiver of `.toFixed()`. We support :
        //   x.toFixed()                       → ignored (no hint)
        //   invoice.amount.toFixed()          → member, rightmost = amount
        //   item.unitPrice.toFixed()          → same
        //   Number(x).toFixed()               → CallExpression — skip
        //   (a + b).toFixed()                 → BinaryExpression — inspect operands
        const recv = callee.object;
        const rightmost = rightmostName(recv);
        if (!rightmost) return;
        if (!looksLikeMoney(rightmost)) return;
        context.report({
          node: callee,
          messageId: 'forbidden',
          data: { name: rightmost },
        });
      },
    };
  },
};

function rightmostName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }
  if (node.type === 'BinaryExpression') {
    return rightmostName(node.right) || rightmostName(node.left);
  }
  if (node.type === 'ChainExpression') return rightmostName(node.expression);
  return null;
}
