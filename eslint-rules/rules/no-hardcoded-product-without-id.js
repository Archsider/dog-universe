// no-hardcoded-product-without-id
//
// Forbids ObjectExpression literals that hardcode `category: 'PRODUCT'`
// without also providing a `productId` key (or providing one set to
// `null`/`undefined`).
//
// Rationale
// ─────────
// The metier invariant is :
//
//   InvoiceItem.category = 'PRODUCT'   ⇒   InvoiceItem.productId IS NOT NULL
//
// A code path that builds an InvoiceItem.create payload with
// `{ category: 'PRODUCT' }` and no productId can :
//   - dodge the Zod refinement `PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID`
//     (e.g. internal service path that doesn't parse via the route schema),
//   - dodge the UI "pick from catalogue" gate,
//   - hit the DB CHECK constraint `InvoiceItem_product_category_has_productId`
//     at runtime — but only on the day it ships, and only on the unhappy
//     branch the developer hadn't tested.
//
// Catching it at lint time is the third floor of defense-in-depth, and the
// only one that runs before merge (the other two enforce at API boundary
// and at DB write time respectively).
//
// What the rule matches
// ─────────────────────
// Any ObjectExpression that *looks like an InvoiceItem payload* :
//   - has a key `category` (Identifier or string Literal) whose value is the
//     string literal 'PRODUCT', AND
//   - has at least 2 of the InvoiceItem shape keys (`description`,
//     `quantity`, `unitPrice`, `total`) — this is the "shape signal" that
//     separates a real InvoiceItem builder from a dropdown template like
//     `{ labelFr, serviceType, category: 'PRODUCT', defaultPrice, color }`,
//     AND
//   - does NOT have a `productId` key OR has `productId: null` /
//     `productId: undefined` as a literal
//
// The "≥ 2 shape keys" heuristic was chosen after a code-base scan : real
// InvoiceItem builders always carry description+quantity+unitPrice (and
// frequently total), while UI catalogue templates carry `labelFr`,
// `defaultPrice`, `serviceType` etc. — different vocabulary. This gives
// us a precise rule with no known false positives in production code.
//
// What it deliberately does NOT match
// ──────────────────────────────────
// - `category: someVar` (no literal — runtime-driven, can't statically tell)
// - `category: 'PRODUCT', productId: someProductId` (productId is bound)
// - `category: 'PRODUCT', productId: lookupProductId(name)` (productId is
//   bound via a call — assumed safe at runtime, Zod + DB will catch a null)
// - Spread elements `...item, category: 'PRODUCT'` — too ambiguous to
//   reason about statically ; rely on the Zod + DB layers in that case.
//
// Whitelisting
// ────────────
// - Tests / scripts / migrations / seeds → skipped via overrides in
//   .eslintrc.json.
// - Inline escape : `// eslint-disable-next-line dog-universe/no-hardcoded-
//   product-without-id -- OK: <justification>`.

'use strict';

/** Returns true when `prop.key` is the identifier or string literal `name`. */
function isKeyNamed(prop, name) {
  if (!prop || prop.type !== 'Property') return false;
  if (prop.computed) return false;
  const k = prop.key;
  if (!k) return false;
  if (k.type === 'Identifier' && k.name === name) return true;
  if (k.type === 'Literal' && typeof k.value === 'string' && k.value === name) return true;
  return false;
}

/** Returns true when `value` is the string literal 'PRODUCT'. */
function isStringLiteralProduct(value) {
  if (!value) return false;
  // String literal: `'PRODUCT'`
  if (value.type === 'Literal' && typeof value.value === 'string' && value.value === 'PRODUCT') {
    return true;
  }
  // TS `as const` cast around a string literal: `'PRODUCT' as const`
  if (value.type === 'TSAsExpression' && value.expression) {
    return isStringLiteralProduct(value.expression);
  }
  return false;
}

/** Returns true if the value is literally `null` or `undefined`. */
function isNullishLiteral(value) {
  if (!value) return false;
  if (value.type === 'Literal' && value.value === null) return true;
  if (value.type === 'Identifier' && value.name === 'undefined') return true;
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Forbid hardcoding `category: 'PRODUCT'` in an object literal without a non-null `productId` — InvoiceItem invariant: PRODUCT category requires productId.",
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        "Hardcoded `category: 'PRODUCT'` requires a non-null `productId` in the same object literal. An InvoiceItem with category='PRODUCT' must reference a Product (enforced by Zod refine PRODUCT_CATEGORY_REQUIRES_PRODUCT_ID and DB CHECK InvoiceItem_product_category_has_productId). If you don't have a productId, use `category: 'OTHER'` (or another non-PRODUCT category). Inline escape : `// eslint-disable-next-line dog-universe/no-hardcoded-product-without-id -- OK: <justification>`.",
    },
  },
  create(context) {
    const SHAPE_KEYS = ['description', 'quantity', 'unitPrice', 'total'];
    const SHAPE_MIN = 2; // require ≥ 2 InvoiceItem shape keys to fire.

    return {
      ObjectExpression(node) {
        let hasProductCategory = false;
        let productIdProp = null;
        let shapeKeyHits = 0;
        for (const prop of node.properties) {
          if (prop.type !== 'Property') continue;
          if (isKeyNamed(prop, 'category') && isStringLiteralProduct(prop.value)) {
            hasProductCategory = true;
          }
          if (isKeyNamed(prop, 'productId')) {
            productIdProp = prop;
          }
          for (const shapeKey of SHAPE_KEYS) {
            if (isKeyNamed(prop, shapeKey)) shapeKeyHits++;
          }
        }
        if (!hasProductCategory) return;
        if (shapeKeyHits < SHAPE_MIN) return; // dropdown templates / config maps
        // category: 'PRODUCT' on an InvoiceItem-shaped literal. Check productId.
        if (!productIdProp) {
          // Missing entirely → forbidden.
          context.report({ node, messageId: 'forbidden' });
          return;
        }
        // productId present but null/undefined literal → forbidden.
        if (isNullishLiteral(productIdProp.value)) {
          context.report({ node, messageId: 'forbidden' });
        }
        // Otherwise (string literal, variable reference, call expression, etc.)
        // is assumed safe — Zod + DB will catch a null at runtime.
      },
    };
  },
};
