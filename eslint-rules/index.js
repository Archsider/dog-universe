// eslint-plugin-dog-universe — custom rules guarding the 4 families of
// production bugs we chased this nightly cycle. Wired into `.eslintrc.json`
// via the `file:` protocol in the root package.json (`"eslint-plugin-dog-
// universe": "file:./eslint-rules"`).
//
// Each rule is documented in `docs/ESLINT_RULES.md` with rationale +
// auto-fix guidance + escape hatch.

'use strict';

module.exports = {
  rules: {
    'no-getmonth-on-date-casa': require('./rules/no-getmonth-on-date-casa'),
    'no-money-tofixed': require('./rules/no-money-tofixed'),
    'no-direct-payment-create': require('./rules/no-direct-payment-create'),
    'no-prisma-date-without-helper': require('./rules/no-prisma-date-without-helper'),
    'no-direct-invoice-mutation': require('./rules/no-direct-invoice-mutation'),
    'no-direct-revenue-computation': require('./rules/no-direct-revenue-computation'),
  },
};
