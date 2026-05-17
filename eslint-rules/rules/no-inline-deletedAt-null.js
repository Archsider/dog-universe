// no-inline-deletedAt-null
//
// Forbids inline `deletedAt: null` (or `deletedAt: { not: null }`) in object
// literals when the helper `notDeleted()` / `onlyDeleted()` from
// `@/lib/prisma-soft` is the canonical, documented way to express the soft-
// delete filter.
//
// Rationale
// ─────────
// Dog Universe never hard-deletes a User, Pet, or Booking. Every read on
// those tables must filter `{ deletedAt: null }`. We've accumulated ~170
// inline occurrences across the codebase — each one is a separate liability
// because :
//   - greppability is poor : `deletedAt: null` is the implementation, not
//     the intent. `notDeleted()` reads as "active rows", which is what the
//     caller actually means,
//   - it's easy to forget on a new query path. Most production "ghost row"
//     bugs we've shipped were a missing `deletedAt: null` in a freshly
//     written `findMany`,
//   - if we ever change the convention (e.g. move to `archivedAt`, add a
//     CHECK constraint, etc.), the helper is one diff ; the inline pattern
//     is 170 diffs.
//
// This rule is the third line of defense after the helper (line 1) and the
// `CLAUDE.md` convention (line 2). It catches new occurrences at PR review.
//
// What the rule matches
// ─────────────────────
// Any ObjectExpression that has a property `deletedAt` with the value :
//   - `null`              → suggest `notDeleted({...})`
//   - `{ not: null }`     → suggest `onlyDeleted({...})`
//
// The match is intentionally narrow : we DO NOT flag computed forms like
// `deletedAt: someVar`, `deletedAt: { gt: someDate }`, etc. — those are
// legitimate trash-view / time-windowed queries.
//
// What it deliberately does NOT match
// ───────────────────────────────────
// - `deletedAt: { lt: someDate }` and other range queries (legitimate).
// - The helper file itself (`src/lib/prisma-soft.ts`) — that's where the
//   literal lives by design (skipped via filename check).
// - Tests / migrations / scripts → skipped via overrides in .eslintrc.json.
//
// Whitelisting
// ────────────
// - Inline escape : `// eslint-disable-next-line dog-universe/no-inline-
//   deletedAt-null -- OK: <justification>` (e.g. one-off explicit query
//   inside a complex `OR` clause where the helper composition would
//   obscure intent).

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

/** Returns true when value is the `null` literal. */
function isNullLiteral(value) {
  return !!value && value.type === 'Literal' && value.value === null;
}

/**
 * Returns true when value is the object literal `{ not: null }`.
 * Tolerates `{ not: null as any }` etc. via TS cast unwrapping.
 */
function isNotNullObject(value) {
  if (!value) return false;
  if (value.type === 'TSAsExpression') return isNotNullObject(value.expression);
  if (value.type !== 'ObjectExpression') return false;
  if (value.properties.length !== 1) return false;
  const inner = value.properties[0];
  if (!isKeyNamed(inner, 'not')) return false;
  return isNullLiteral(inner.value);
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Forbid inline `deletedAt: null` and `deletedAt: { not: null }` in object literals — use `notDeleted()` / `onlyDeleted()` from `@/lib/prisma-soft` instead.',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      useNotDeleted:
        "Inline `deletedAt: null` is the implementation, not the intent. Use `notDeleted({...})` from `@/lib/prisma-soft` so soft-delete reads as 'active rows' and stays greppable. Inline escape : `// eslint-disable-next-line dog-universe/no-inline-deletedAt-null -- OK: <justification>`.",
      useOnlyDeleted:
        "Inline `deletedAt: { not: null }` should be `onlyDeleted({...})` from `@/lib/prisma-soft` — the trash-view helper documents intent. Inline escape : `// eslint-disable-next-line dog-universe/no-inline-deletedAt-null -- OK: <justification>`.",
    },
  },
  create(context) {
    const filename = context.getFilename ? context.getFilename() : context.filename;
    // Skip the helper module itself — the literal lives here by design.
    if (filename && filename.replace(/\\/g, '/').endsWith('src/lib/prisma-soft.ts')) {
      return {};
    }
    // Skip test files generated from this rule's own fixture path.
    if (filename && /(__tests__|\.test\.[tj]sx?$)/.test(filename)) {
      return {};
    }

    return {
      ObjectExpression(node) {
        for (const prop of node.properties) {
          if (prop.type !== 'Property') continue;
          if (!isKeyNamed(prop, 'deletedAt')) continue;
          if (isNullLiteral(prop.value)) {
            context.report({ node: prop, messageId: 'useNotDeleted' });
            return;
          }
          if (isNotNullObject(prop.value)) {
            context.report({ node: prop, messageId: 'useOnlyDeleted' });
            return;
          }
        }
      },
    };
  },
};
