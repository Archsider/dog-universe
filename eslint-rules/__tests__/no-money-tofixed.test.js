'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-money-tofixed');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-money-tofixed', rule, {
  valid: [
    { code: 'const s = formatMAD(invoice.amount);' },
    { code: 'const s = invoice.amount.toString();' },
    { code: 'const s = Number(x).toFixed(2);' }, // wrapped in Number() — explicit cast, OK
    { code: 'const s = duration.toFixed(2);' }, // duration is not a money name
    { code: 'const ratio = (x / y).toFixed(1);' }, // anonymous expression, no money hint
    { code: 'const s = pct.toFixed(1);' }, // percent, not money
  ],
  invalid: [
    {
      code: 'const s = invoice.amount.toFixed(2);',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'const s = item.unitPrice.toFixed(2);',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'const s = booking.totalPrice.toFixed(2);',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'const s = payment.allocatedAmount.toFixed(2);',
      errors: [{ messageId: 'forbidden' }],
    },
    // Suffix convention.
    {
      code: 'const s = revenueMAD.toFixed(2);',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('no-money-tofixed: all assertions passed');
