// no-getmonth-on-date-casa
//
// Forbids `.getMonth()` / `.getFullYear()` / `.getDate()` everywhere in
// `src/` and `scripts/`, with two exceptions :
//   1. `src/lib/dates-casablanca.ts` — the helper implementation itself
//      must call into the raw Date API to produce its Casa-projected
//      values. Whitelisted via the file path check below.
//   2. Any line preceded by a `// eslint-disable-next-line dog-universe/
//      no-getmonth-on-date-casa` comment that includes the word "OK"
//      followed by a justification (enforced by the lint config, not
//      this rule).
//
// Rationale
// ─────────
// Production bug surfaced 2026-05-15 : on the UTC Vercel runtime,
// `startOfMonthCasa(new Date('2026-05-01T00:00:00Z')).getMonth()`
// returns 3 (April) — the May-1st Casa midnight is 23:00 UTC on April
// 30. Reading the UTC month silently shifts dashboards / cache keys /
// analytics queries by ±1 month at month boundaries.
//
// The full audit lived in CLAUDE.md "Bug TZ" entries. This rule is the
// machine-enforced version of the discipline.
//
// Suggested fixes
// ───────────────
// - `d.getMonth()` / `d.getFullYear()` → `casablancaYMD(d).month / .year`
// - `new Date().getMonth()`            → `currentMonthCasa().month`
// - `d.getDate()`                       → `casablancaYMD(d).day`

'use strict';

const FORBIDDEN_METHODS = new Set([
  'getMonth',
  'getFullYear',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
]);

const SUGGESTION_BY_METHOD = {
  getMonth: 'casablancaYMD(d).month  /  currentMonthCasa().month',
  getFullYear: 'casablancaYMD(d).year  /  currentMonthCasa().year',
  getDate: 'casablancaYMD(d).day',
  getDay: 'casablancaWeekday(d)  (helper to add if needed)',
  getHours: 'casablancaHour(d)  (helper to add if needed)',
  getMinutes: 'casablancaMinute(d)  (helper to add if needed)',
};

/**
 * Files where direct Date API access is the implementation under test
 * (the helpers themselves). Anywhere else, prefer the Casa wrappers.
 */
function isInternalImpl(filename) {
  if (!filename) return false;
  const norm = filename.replace(/\\/g, '/');
  return (
    norm.endsWith('/src/lib/dates-casablanca.ts') ||
    // The helper unit tests need to call .getMonth() directly to assert
    // the Casa projection is correct.
    norm.includes('/dates-casablanca.test.')
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid raw Date.prototype.getMonth/getFullYear/getDate — use the Casablanca helpers',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        '`.{{ method }}()` reads the UTC value on Vercel and silently shifts dates at midnight Casa. Use {{ suggestion }} from `@/lib/dates-casablanca` instead. If this is genuinely safe (already a Casa-anchored integer, fixture data, etc.), disable inline with `// eslint-disable-next-line dog-universe/no-getmonth-on-date-casa  -- OK: <one-line justification>`.',
    },
  },
  create(context) {
    const filename = context.getFilename();
    if (isInternalImpl(filename)) return {};
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression') return;
        // Skip computed access (`d['getMonth']()`) — rare and worth the
        // tradeoff to not have to evaluate the property at lint time.
        if (callee.computed) return;
        const prop = callee.property;
        if (prop.type !== 'Identifier') return;
        if (!FORBIDDEN_METHODS.has(prop.name)) return;
        context.report({
          node: prop,
          messageId: 'forbidden',
          data: {
            method: prop.name,
            suggestion: SUGGESTION_BY_METHOD[prop.name],
          },
        });
      },
    };
  },
};
