// no-prisma-date-without-helper
//
// Forbids passing a freshly-constructed `new Date()` (with no arguments,
// or with `Date.now()`) as the value of a Prisma filter on a date field
// (`paymentDate`, `startDate`, `endDate`, `issuedAt`, `createdAt`,
// `updatedAt`, `nextDueDate`, `dateOfBirth`, `arrivalTime`,
// `paidAt`, `signedAt`, `deletedAt`, `archivedAt`).
//
// Concretely, this is flagged :
//
//   prisma.booking.findMany({
//     where: { startDate: { gte: new Date() } },     // ← forbidden
//   });
//
//   prisma.invoice.count({
//     where: { issuedAt: { lt: new Date(Date.now()) } },  // ← forbidden
//   });
//
// And this is OK (already Casa-anchored) :
//
//   const todayStart = startOfTodayCasa();
//   prisma.booking.findMany({ where: { startDate: { gte: todayStart } } });
//
// Rationale
// ─────────
// On Vercel UTC, `new Date()` is the current UTC instant. When the local
// wall clock in Casablanca is 00:30 (just after midnight), UTC is still
// 23:30 of the previous day — so a query "where startDate >= today"
// silently includes yesterday's bookings, which produces a 1-day window
// drift on every cron / dashboard / billing query that ran at the wrong
// hour. See ADR-0008 + the PR #97 timezone family-of-bugs writeup.
//
// The rule walks every object property whose key is a known date column
// and recurses into nested objects (Prisma's `{ gte, lte, lt, gt, equals,
// not }` operator wrappers). If the leaf value is a bare `new Date()`
// node, the rule fires.
//
// Whitelisting
// ────────────
// - Test files / scripts / migrations → skipped via overrides in
//   `.eslintrc.json`.
// - Inline escape : `// eslint-disable-next-line dog-universe/no-prisma-
//   date-without-helper -- OK: <justification>`.

'use strict';

const DATE_COLUMNS = new Set([
  'paymentDate',
  'startDate',
  'endDate',
  'issuedAt',
  'createdAt',
  'updatedAt',
  'nextDueDate',
  'dateOfBirth',
  'arrivalTime',
  'paidAt',
  'signedAt',
  'deletedAt',
  'archivedAt',
  'cancelledAt',
  'sentAt',
  'lastReminderSentAt',
  'completedAt',
  'departureAt',
  'lastTotpUsedAt',
  'lockedAt',
]);

const PRISMA_OPERATORS = new Set(['gte', 'lte', 'gt', 'lt', 'equals', 'not', 'in', 'notIn']);

function isBareNowDate(node) {
  if (!node) return false;
  if (node.type !== 'NewExpression') return false;
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'Date') return false;
  // `new Date()` — zero args.
  if (!node.arguments || node.arguments.length === 0) return true;
  // `new Date(Date.now())` — single Date.now() call.
  if (node.arguments.length === 1) {
    const a = node.arguments[0];
    if (
      a.type === 'CallExpression' &&
      a.callee.type === 'MemberExpression' &&
      a.callee.object.type === 'Identifier' &&
      a.callee.object.name === 'Date' &&
      a.callee.property.type === 'Identifier' &&
      a.callee.property.name === 'now'
    ) {
      return true;
    }
  }
  return false;
}

function visitObjectLooking(node, context, parentKey) {
  if (!node || node.type !== 'ObjectExpression') return;
  for (const prop of node.properties) {
    if (prop.type !== 'Property') continue;
    if (prop.computed) continue;
    let key = null;
    if (prop.key.type === 'Identifier') key = prop.key.name;
    else if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') key = prop.key.value;
    if (!key) continue;

    // Anchor : enter a date column. Then any nested leaf value that is
    // `new Date()` triggers, including direct equality and operator
    // wrappers ({ gte: new Date() }, { not: new Date() }, etc.).
    const insideDateColumn = DATE_COLUMNS.has(key) || (parentKey && DATE_COLUMNS.has(parentKey));

    if (insideDateColumn && PRISMA_OPERATORS.has(key)) {
      // { gte: new Date() } leaf
      if (isBareNowDate(prop.value)) {
        context.report({
          node: prop.value,
          messageId: 'forbidden',
          data: { column: parentKey, op: key },
        });
        continue;
      }
    }
    if (DATE_COLUMNS.has(key)) {
      // Direct equality form : { paymentDate: new Date() }
      if (isBareNowDate(prop.value)) {
        context.report({
          node: prop.value,
          messageId: 'forbiddenEq',
          data: { column: key },
        });
      }
      // Recurse into operator object : { paymentDate: { gte: new Date() } }
      if (prop.value && prop.value.type === 'ObjectExpression') {
        visitObjectLooking(prop.value, context, key);
      }
      continue;
    }

    // Recurse into any nested object (e.g. `where: { ... }`, `AND: [ ... ]`).
    if (prop.value && prop.value.type === 'ObjectExpression') {
      visitObjectLooking(prop.value, context, key);
    } else if (prop.value && prop.value.type === 'ArrayExpression') {
      for (const el of prop.value.elements) {
        if (el && el.type === 'ObjectExpression') visitObjectLooking(el, context, key);
      }
    }
  }
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid `new Date()` inside Prisma queries on date columns — use a Casa helper.',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        '`new Date()` inside a Prisma `{{ op }}` filter on `{{ column }}` reads the UTC current instant. At 00:30 Casablanca this silently shifts the window by 1 day. Use `startOfTodayCasa()` / `endOfTodayCasa()` / `casablancaStartOfDay(d)` from `@/lib/dates-casablanca` instead. Inline escape : `// eslint-disable-next-line dog-universe/no-prisma-date-without-helper -- OK: <justification>`.',
      forbiddenEq:
        '`new Date()` as the value of Prisma column `{{ column }}` reads the UTC current instant. Use `startOfTodayCasa()` / `casablancaStartOfDay(d)` from `@/lib/dates-casablanca`. Inline escape : `// eslint-disable-next-line dog-universe/no-prisma-date-without-helper -- OK: <justification>`.',
    },
  },
  create(context) {
    // We don't need to scope to "inside a prisma.*.method call" : flagging
    // any object literal that contains a date-column filter with `new
    // Date()` is enough, and avoids the headache of tracking how the
    // `where` object was bound (it may be assigned to a const first and
    // then spread).
    return {
      ObjectExpression(node) {
        // Look for a `where` key — the entry point for the recursion.
        for (const prop of node.properties) {
          if (prop.type !== 'Property') continue;
          if (prop.computed) continue;
          const key = prop.key.type === 'Identifier' ? prop.key.name : null;
          if (key === 'where' && prop.value && prop.value.type === 'ObjectExpression') {
            visitObjectLooking(prop.value, context, null);
          }
        }
      },
    };
  },
};
