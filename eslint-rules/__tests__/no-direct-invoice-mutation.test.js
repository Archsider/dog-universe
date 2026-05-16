'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-direct-invoice-mutation');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-direct-invoice-mutation', rule, {
  valid: [
    // Canonical path — recordPayment, not prisma.invoice.update.
    { code: 'await recordPayment({ invoiceId, amount, paymentMethod, paymentDate });' },
    // Direct update on non-money fields (allowed).
    { code: 'await prisma.invoice.update({ where: { id }, data: { notes: "hi", clientDisplayName: "Foo" } });' },
    { code: 'await prisma.invoice.update({ where: { id }, data: { periodDate: new Date() } });' },
    // payment-allocation.ts canonical impl is whitelisted.
    {
      filename: '/repo/src/lib/payment-allocation.ts',
      code: 'await tx.invoice.update({ where: { id }, data: { paidAmount, status: "PAID", paidAt: now } });',
    },
    // src/lib/billing/* service whitelisted.
    {
      filename: '/repo/src/lib/billing/changeStatus.ts',
      code: 'await prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });',
    },
    // Other prisma models untouched.
    { code: 'await prisma.booking.update({ where: { id }, data: { status: "COMPLETED" } });' },
    { code: 'await prisma.user.update({ where: { id }, data: { name: "x" } });' },
    // upsert on a non-money column.
    { code: 'await prisma.invoice.upsert({ where: { id }, create: { notes: "x" }, update: { notes: "y" } });' },
  ],
  invalid: [
    // update on paidAmount.
    {
      code: 'await prisma.invoice.update({ where: { id }, data: { paidAmount: 100 } });',
      errors: [{ messageId: 'forbidden' }],
    },
    // update on status.
    {
      code: 'await prisma.invoice.update({ where: { id }, data: { status: "PAID" } });',
      errors: [{ messageId: 'forbidden' }],
    },
    // updateMany on paidAt.
    {
      code: 'await prisma.invoice.updateMany({ where: { id: { in: ids } }, data: { paidAt: new Date() } });',
      errors: [{ messageId: 'forbidden' }],
    },
    // tx.* receiver.
    {
      filename: '/repo/src/app/api/invoices/route.ts',
      code: 'await tx.invoice.update({ where: { id }, data: { amount: 200 } });',
      errors: [{ messageId: 'forbidden' }],
    },
    // db.* receiver.
    {
      filename: '/repo/src/app/api/admin/walkin/route.ts',
      code: 'await db.invoice.update({ where: { id }, data: { version: 7 } });',
      errors: [{ messageId: 'forbidden' }],
    },
    // upsert update slot mutates status.
    {
      code: 'await prisma.invoice.upsert({ where: { id }, create: { notes: "x" }, update: { status: "CANCELLED" } });',
      errors: [{ messageId: 'forbidden' }],
    },
    // Mixed : one forbidden field among allowed ones still fires.
    {
      code: 'await prisma.invoice.update({ where: { id }, data: { notes: "x", paidAmount: 50 } });',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('no-direct-invoice-mutation: all assertions passed');
