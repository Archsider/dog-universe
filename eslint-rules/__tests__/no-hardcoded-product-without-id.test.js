'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-hardcoded-product-without-id');

const tester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-hardcoded-product-without-id', rule, {
  valid: [
    // Non-PRODUCT category, no productId — fine.
    { code: "const item = { category: 'BOARDING', description: 'Pension', quantity: 1, unitPrice: 100 };" },
    // PRODUCT category WITH a productId (string literal) — fine.
    { code: "const item = { category: 'PRODUCT', productId: 'cmprod123', description: 'X', quantity: 1, unitPrice: 100 };" },
    // PRODUCT category WITH productId bound via variable — assumed safe at runtime.
    { code: "const item = { category: 'PRODUCT', productId: chosen.id, description: 'X', quantity: 1, unitPrice: 100 };" },
    // PRODUCT category WITH productId from a function call — assumed safe at runtime.
    { code: "const item = { category: 'PRODUCT', productId: lookupProduct(name), description: 'X', quantity: 1, unitPrice: 100 };" },
    // category dynamic (not a literal) — out of scope.
    { code: "const item = { category: dynamicCat, description: 'x', quantity: 1, unitPrice: 100 };" },
    // OTHER category, productId null — irrelevant to this rule.
    { code: "const item = { category: 'OTHER', productId: null, description: 'X', quantity: 1, unitPrice: 0 };" },
    // PRODUCT category with `as const` cast — valid when productId is present.
    { code: "const item = { category: 'PRODUCT' as const, productId: 'cm1', description: 'X', quantity: 1, unitPrice: 100 };" },
    // DROPDOWN TEMPLATE — doesn't look like an InvoiceItem (no description/
    // quantity/unitPrice/total). Shape-keys gate stops the rule from firing.
    { code: "const preset = { labelFr: 'Croquettes', labelEn: 'Kibbles', serviceType: 'PRODUCT_SALE', category: 'PRODUCT', defaultPrice: 0, color: 'bg-green-50' };" },
    // Object with only ONE shape key (e.g. only `description`) does NOT
    // fire — too thin to be a real InvoiceItem payload. Caller's responsibility.
    { code: "const view = { category: 'PRODUCT', label: 'Croquettes', description: 'X' };" },
  ],
  invalid: [
    // PRODUCT category without productId at all — InvoiceItem-shaped.
    {
      code: "const item = { category: 'PRODUCT', description: 'Nexgard', quantity: 1, unitPrice: 350 };",
      errors: [{ messageId: 'forbidden' }],
    },
    // PRODUCT category with productId: null.
    {
      code: "const item = { category: 'PRODUCT', productId: null, description: 'Nexgard', quantity: 1, unitPrice: 350 };",
      errors: [{ messageId: 'forbidden' }],
    },
    // PRODUCT category with productId: undefined.
    {
      code: "const item = { category: 'PRODUCT', productId: undefined, description: 'Nexgard', quantity: 1, unitPrice: 350 };",
      errors: [{ messageId: 'forbidden' }],
    },
    // Inside an array.map() builder — common Prisma pattern.
    {
      code: "const data = items.map(it => ({ category: 'PRODUCT', description: it.label, quantity: 1, unitPrice: it.price }));",
      errors: [{ messageId: 'forbidden' }],
    },
    // String literal key 'category' (not Identifier).
    {
      code: "const item = { 'category': 'PRODUCT', description: 'x', quantity: 1, unitPrice: 100, total: 100 };",
      errors: [{ messageId: 'forbidden' }],
    },
    // `as const` cast on PRODUCT, no productId, InvoiceItem-shaped.
    {
      code: "const item = { category: 'PRODUCT' as const, description: 'x', quantity: 1, unitPrice: 100 };",
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});

console.log('no-hardcoded-product-without-id: all assertions passed');
