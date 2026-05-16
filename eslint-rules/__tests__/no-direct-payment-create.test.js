'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-direct-payment-create');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-direct-payment-create', rule, {
  valid: [
    // Canonical path — recordPayment, not prisma.payment.create.
    { code: 'await recordPayment({ invoiceId, amount, paymentMethod, paymentDate });' },
    // Implementation file whitelisted.
    {
      filename: '/repo/src/lib/payment-allocation.ts',
      code: 'await prisma.payment.create({ data: payload });',
    },
    {
      filename: '/repo/src/lib/payment-allocation.ts',
      code: 'await tx.payment.create({ data: payload });',
    },
    // Other prisma models untouched.
    { code: 'await prisma.invoice.create({ data });' },
    { code: 'await prisma.booking.createMany({ data });' },
  ],
  invalid: [
    {
      filename: '/repo/src/app/api/admin/walkin/route.ts',
      code: 'await prisma.payment.create({ data });',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      filename: '/repo/src/app/api/invoices/[id]/payments/route.ts',
      code: 'await tx.payment.create({ data });',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      filename: '/repo/src/app/api/invoices/route.ts',
      code: 'await db.payment.createMany({ data: rows });',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('no-direct-payment-create: all assertions passed');
