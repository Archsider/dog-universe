// no-direct-payment-create
//
// Forbids any direct call to `prisma.payment.create()` or
// `tx.payment.create()` (including inside a $transaction callback).
//
// Rationale
// ─────────
// `recordPayment` from `@/lib/payment-allocation` is the single
// canonical path to insert a Payment row : it
//   - validates amount / method / date
//   - guards against overpayment (unless `trustedAmount: true`)
//   - re-runs `allocatePayments(invoiceId)` to keep
//     `InvoiceItem.allocatedAmount` in sync
//   - invalidates the `revenue:YYYY:MM` cache key
//   - emits the SMS OPS notification on ADMIN/SUPERADMIN actions
//   - participates in the cross-role gate (ADMIN cannot touch a
//     SUPERADMIN-owned invoice)
//
// Two production bugs would have been caught at lint time :
//   - Walk-in invoice creation skipped the revenue cache invalidation
//     → dashboard CA was stale (Module 4-A fix).
//   - Payment method whitelist diverged between Site A and Site B.
//
// Auto-suggestion : `recordPayment({invoiceId, amount, paymentMethod,
// paymentDate}, {prefetchedInvoice})`.
//
// Whitelisting
// ────────────
// - `src/lib/payment-allocation.ts` itself contains the canonical
//   `prisma.payment.create()` call → whitelisted via file path.
// - Tests / scripts / migrations / seeds → skipped via overrides in
//   `.eslintrc.json`.

'use strict';

function isPaymentAllocationImpl(filename) {
  if (!filename) return false;
  const norm = filename.replace(/\\/g, '/');
  return norm.endsWith('/src/lib/payment-allocation.ts');
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid direct `prisma.payment.create()` — use `recordPayment` from `@/lib/payment-allocation`.',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        'Direct `{{ chain }}.payment.create()` bypasses the canonical `recordPayment` helper. It skips overpayment guard, allocation re-run, revenue cache invalidation, SMS OPS notification, and cross-role gating. Use `recordPayment` from `@/lib/payment-allocation` instead. Inline escape : `// eslint-disable-next-line dog-universe/no-direct-payment-create -- OK: <justification>`.',
    },
  },
  create(context) {
    if (isPaymentAllocationImpl(context.getFilename())) return {};

    return {
      CallExpression(node) {
        // Match `<x>.payment.create(...)` and `<x>.payment.createMany(...)`.
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        if (callee.computed) return;
        const method = callee.property;
        if (method.type !== 'Identifier') return;
        if (method.name !== 'create' && method.name !== 'createMany') return;
        const paymentMember = callee.object;
        if (paymentMember.type !== 'MemberExpression') return;
        if (paymentMember.computed) return;
        if (paymentMember.property.type !== 'Identifier') return;
        if (paymentMember.property.name !== 'payment') return;
        // The receiver of `.payment` is `prisma` or a transaction client.
        const receiver = paymentMember.object;
        const chain = describeChain(receiver);
        // Accept anything — the diagnostic is the same regardless of
        // whether the prisma reference is named `prisma`, `tx`, `db`,
        // `client`, etc. We pass the chain text for the error message
        // to make the offender obvious.
        context.report({
          node,
          messageId: 'forbidden',
          data: { chain: chain || 'prisma' },
        });
      },
    };
  },
};

function describeChain(node) {
  if (!node) return '';
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier' && !node.computed) {
    return `${describeChain(node.object)}.${node.property.name}`;
  }
  if (node.type === 'ThisExpression') return 'this';
  return '<expr>';
}
