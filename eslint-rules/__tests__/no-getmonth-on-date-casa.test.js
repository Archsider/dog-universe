'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-getmonth-on-date-casa');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-getmonth-on-date-casa', rule, {
  valid: [
    {
      filename: '/repo/src/app/admin/dashboard/page.tsx',
      code: 'const { month, year } = casablancaYMD(d);',
    },
    {
      filename: '/repo/src/app/admin/dashboard/page.tsx',
      code: 'const x = currentMonthCasa().month;',
    },
    // The implementation file itself is whitelisted.
    {
      filename: '/repo/src/lib/dates-casablanca.ts',
      code: 'function fn(d) { return d.getMonth() + 1; }',
    },
    // Test files for the helper module also whitelisted.
    {
      filename: '/repo/src/lib/__tests__/dates-casablanca.test.ts',
      code: 'expect(new Date(x).getMonth()).toBe(4);',
    },
    // Bracket access ignored — outside scope, manual review.
    {
      filename: '/repo/src/app/page.tsx',
      code: "d['getMonth']();",
    },
  ],
  invalid: [
    {
      filename: '/repo/src/app/admin/dashboard/page.tsx',
      code: 'const m = d.getMonth();',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      filename: '/repo/src/lib/metrics.ts',
      code: 'const y = new Date().getFullYear();',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      filename: '/repo/src/app/admin/calendar/page.tsx',
      code: 'const day = start.getDate();',
      errors: [{ messageId: 'forbidden' }],
    },
    // Chained off a function result still flagged.
    {
      filename: '/repo/src/lib/billing-utils.ts',
      code: 'const m = startOfMonthCasa(now).getMonth();',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('no-getmonth-on-date-casa: all assertions passed');
