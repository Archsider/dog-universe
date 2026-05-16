'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-direct-revenue-computation');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-direct-revenue-computation', rule, {
  valid: [
    // Canonical helper usage.
    {
      filename: '/repo/src/app/[locale]/admin/dashboard/page.tsx',
      code: 'const { rows } = await getMonthlyRevenueByCategory(2026, 5);',
    },
    // Whitelisted impl file owns the live path.
    {
      filename: '/repo/src/lib/billing/monthly-revenue.ts',
      code: 'await prisma.payment.aggregate({ _sum: { amount: true }, where: { paymentDate: { gte, lte } } });',
    },
    // Sibling billing service whitelisted.
    {
      filename: '/repo/src/lib/billing/cancel-invoice.ts',
      code: 'await prisma.payment.aggregate({ _sum: { amount: true }, where: { paymentDate: { gte, lte } } });',
    },
    // Health invariants whitelisted (cross-check JS vs MV).
    {
      filename: '/repo/src/lib/health-invariants.ts',
      code: 'await prisma.payment.aggregate({ _sum: { amount: true }, where: { paymentDate: { gte, lte } } });',
    },
    // Per-invoice aggregate — legitimate (no paymentDate filter).
    {
      filename: '/repo/src/app/api/invoices/[id]/route.ts',
      code: 'await prisma.payment.aggregate({ _sum: { amount: true }, where: { invoiceId: id } });',
    },
    // Count aggregate — not a money sum.
    {
      filename: '/repo/src/app/api/admin/dashboard/route.ts',
      code: 'await prisma.payment.aggregate({ _count: true, where: { paymentDate: { gte, lte } } });',
    },
    // Other Prisma models untouched.
    {
      filename: '/repo/src/app/api/admin/foo/route.ts',
      code: 'await prisma.invoice.aggregate({ _sum: { amount: true }, where: { issuedAt: { gte, lte } } });',
    },
  ],
  invalid: [
    {
      filename: '/repo/src/app/[locale]/admin/dashboard/page.tsx',
      code: 'await prisma.payment.aggregate({ _sum: { amount: true }, where: { paymentDate: { gte, lte } } });',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      filename: '/repo/src/app/api/admin/analytics/route.ts',
      code: 'await tx.payment.aggregate({ _sum: { amount: true }, where: { paymentDate: { gte: from, lte: to } } });',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      filename: '/repo/src/app/api/admin/exports/csv/route.ts',
      code: 'await db.payment.groupBy({ by: ["paymentMethod"], _sum: { amount: true }, where: { paymentDate: { gte, lte } } });',
      errors: [{ messageId: 'forbidden' }],
    },
    // Nested AND clause — still detected.
    {
      filename: '/repo/src/app/api/admin/billing/route.ts',
      code: 'await prisma.payment.aggregate({ _sum: { amount: true }, where: { AND: [{ paymentDate: { gte } }, { paymentDate: { lte } }] } });',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('no-direct-revenue-computation: all assertions passed');
