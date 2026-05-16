'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-prisma-date-without-helper');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-prisma-date-without-helper', rule, {
  valid: [
    // Casa helper bound to a const first — no `new Date()` in the query.
    {
      code: `
        const todayStart = startOfTodayCasa();
        await prisma.booking.findMany({
          where: { startDate: { gte: todayStart } },
        });
      `,
    },
    // Constant fixture date (not new Date()) — fine.
    {
      code: `
        const cutoff = new Date('2026-01-01');
        await prisma.invoice.count({
          where: { issuedAt: { gte: cutoff } },
        });
      `,
    },
    // No date column involved — `id`, `email`, etc. are exempt.
    {
      code: `
        await prisma.user.findMany({
          where: { id: { in: ['a', 'b'] } },
        });
      `,
    },
    // `new Date()` outside a Prisma where clause is fine (this rule is
    // scoped to query-shape detection).
    { code: 'const n = new Date();' },
  ],
  invalid: [
    {
      code: `
        await prisma.booking.findMany({
          where: { startDate: { gte: new Date() } },
        });
      `,
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: `
        await prisma.invoice.count({
          where: { issuedAt: { lt: new Date(Date.now()) } },
        });
      `,
      errors: [{ messageId: 'forbidden' }],
    },
    // Direct equality on a date column.
    {
      code: `
        await prisma.payment.findFirst({
          where: { paymentDate: new Date() },
        });
      `,
      errors: [{ messageId: 'forbiddenEq' }],
    },
    // Nested inside AND / OR.
    {
      code: `
        await prisma.booking.findMany({
          where: { AND: [{ endDate: { gte: new Date() } }] },
        });
      `,
      errors: [{ messageId: 'forbidden' }],
    },
    // Relation filter targeting a child model with a date column.
    {
      code: `
        await prisma.user.findMany({
          where: { bookings: { some: { startDate: { gte: new Date() } } } },
        });
      `,
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('no-prisma-date-without-helper: all assertions passed');
