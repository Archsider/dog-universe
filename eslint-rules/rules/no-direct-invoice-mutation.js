// no-direct-invoice-mutation
//
// Forbids direct `prisma.invoice.update / updateMany / upsert` (and same on
// `tx.*`, `db.*`, etc.) when the `data` payload mutates one of the
// **money-bearing** columns :
//   - paidAmount
//   - amount         (drift from SUM(items.total) — the trigger guards but
//                     a manual override would still violate the contract)
//   - status         (PAID/PARTIALLY_PAID/PENDING/CANCELLED — must flow
//                     through recordPayment / changeInvoiceStatus)
//   - paidAt         (set by allocator, not by hand)
//   - version        (optimistic lock, must increment exactly +1 per write)
//
// Rationale
// ─────────
// `recordPayment()` from `@/lib/payment-allocation` is the single canonical
// path that flips `paidAmount`/`status`/`paidAt` in lockstep with the
// allocation algorithm + cache invalidation + cross-role gate. A bypass
// silently breaks invariant #5 (allocated_sum_vs_paid) within seconds, and
// only the hourly invariant cron catches it.
//
// Patch direction :
// - To record a payment       → `recordPayment({...}, {trustedAmount?})`
// - To cancel an invoice      → dedicated helper (see `cancelInvoice` if it
//   exists, or extract one from the route)
// - To edit clientDisplayName, notes, periodDate, etc. → still allowed via
//   direct update (those fields are not money-bearing)
//
// Detection : the rule walks the `data` object literal of every
// `xxx.invoice.update(args).` call. If any of the FORBIDDEN_FIELDS appears
// as a key, it fires.
//
// Whitelisting
// ────────────
// - `src/lib/payment-allocation.ts` — canonical impl
// - `src/lib/billing/*.ts`           — service files that own the money path
// - Tests / scripts / migrations     — via .eslintrc.json overrides
// - Inline escape : `// eslint-disable-next-line dog-universe/no-direct-
//   invoice-mutation -- OK: <one-line>`

'use strict';

const FORBIDDEN_FIELDS = new Set([
  'paidAmount',
  'amount',
  'status',
  'paidAt',
  'version',
]);

const MUTATION_METHODS = new Set(['update', 'updateMany', 'upsert']);

function isWhitelistedImpl(filename) {
  if (!filename) return false;
  const norm = filename.replace(/\\/g, '/');
  // Canonical money path implementation modules — these own the mutation.
  if (norm.endsWith('/src/lib/payment-allocation.ts')) return true;
  if (norm.endsWith('/src/lib/payments.ts')) return true;
  // Booking state machine + adjacent billing services — they coordinate the
  // money path in lockstep with status transitions and own legitimate
  // invoice mutations.
  if (norm.includes('/src/lib/services/booking-admin/')) return true;
  if (norm.endsWith('/src/lib/services/booking-admin.service.ts')) return true;
  if (norm.includes('/src/lib/billing/')) return true;
  if (norm.endsWith('/src/lib/billing.ts')) return true;
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

/** Extract the `data` ObjectExpression node from prisma.invoice.update args.
 *  Handles both forms :
 *    .update({ where, data: { ... } })           ← update / updateMany
 *    .upsert({ where, create: { ... }, update: { ... } })  ← upsert
 *  Returns an array of (label, ObjectExpression) tuples to scan.
 */
function extractDataLiterals(method, args) {
  if (!args || args.length === 0) return [];
  const out = [];
  const first = args[0];
  if (!first || first.type !== 'ObjectExpression') return out;

  if (method === 'update' || method === 'updateMany') {
    for (const prop of first.properties) {
      if (prop.type !== 'Property') continue;
      if (prop.computed) continue;
      const k = prop.key.type === 'Identifier' ? prop.key.name : null;
      if (k === 'data' && prop.value && prop.value.type === 'ObjectExpression') {
        out.push(['data', prop.value]);
      }
    }
  } else if (method === 'upsert') {
    for (const prop of first.properties) {
      if (prop.type !== 'Property') continue;
      if (prop.computed) continue;
      const k = prop.key.type === 'Identifier' ? prop.key.name : null;
      if ((k === 'create' || k === 'update') && prop.value && prop.value.type === 'ObjectExpression') {
        out.push([k, prop.value]);
      }
    }
  }
  return out;
}

function findForbiddenKeys(objExpr) {
  const hits = [];
  for (const prop of objExpr.properties) {
    if (prop.type !== 'Property') continue;
    if (prop.computed) continue;
    let key = null;
    if (prop.key.type === 'Identifier') key = prop.key.name;
    else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') key = prop.key.value;
    if (!key) continue;
    if (FORBIDDEN_FIELDS.has(key)) {
      hits.push(key);
    }
  }
  return hits;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid direct prisma.invoice.update mutations on money-bearing fields — use the canonical helpers.',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        '`{{ chain }}.invoice.{{ method }}` mutates the money-bearing field `{{ field }}` (in `{{ slot }}`). This bypasses the recordPayment / changeInvoiceStatus canonical path, which means : no allocation re-run, no revenue cache invalidation, no cross-role gate, no SMS OPS. Use `recordPayment` from `@/lib/payment-allocation` (for payments) or the dedicated billing service (for status/version mutations). Inline escape : `// eslint-disable-next-line dog-universe/no-direct-invoice-mutation -- OK: <justification>`.',
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
        const invoiceMember = callee.object;
        if (invoiceMember.type !== 'MemberExpression') return;
        if (invoiceMember.computed) return;
        if (invoiceMember.property.type !== 'Identifier') return;
        if (invoiceMember.property.name !== 'invoice') return;

        const chain = describeChain(invoiceMember.object) || 'prisma';

        for (const [slot, dataObj] of extractDataLiterals(method.name, node.arguments)) {
          const hits = findForbiddenKeys(dataObj);
          for (const field of hits) {
            // Report on the CallExpression itself (the line with
            // `tx.invoice.update(`) rather than on the nested `data: {}`
            // object — that way `// eslint-disable-next-line` placed
            // immediately above the call works as expected without
            // requiring the escape comment to be embedded mid-payload.
            context.report({
              node,
              messageId: 'forbidden',
              data: { chain, method: method.name, field, slot },
            });
          }
        }
      },
    };
  },
};
