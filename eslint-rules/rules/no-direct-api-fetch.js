// no-direct-api-fetch
//
// Forbids any direct `fetch('/api/...')` call that hits one of the
// "Top 10 critical routes" covered by the typed api-client.
//
// Rationale
// ─────────
// Each of these routes has a shared Zod schema in `src/lib/api-schemas/`
// and a typed wrapper in `src/lib/api-client/`. Bypassing the wrapper
// bypasses :
//   - Client-side pre-validation (catch malformed bodies pre-network)
//   - Discriminated `ApiResult<TSuccess, TErrorCode>` return shape
//   - Canonicalised network/parse error codes (NETWORK_ERROR, UNKNOWN_ERROR)
//   - Auto-attached `Idempotency-Key` header on money path routes
//
// Production bugs would have been caught by this rule :
//   - Walk-in invoice modal used raw fetch with `'idempotency-key'` (lowercase)
//     header while routes accept it case-insensitively but test mocks were
//     case-sensitive — tests passed locally but failed CI on header lookup.
//   - submit-payment.ts forgot the `sendClientSms` flag in early iterations,
//     bypassing ADR-0008 respectful SMS policy.
//
// Auto-suggestion : use the matching wrapper from `@/lib/api-client`.
//
// Whitelisting
// ────────────
// - `src/lib/api-client/**` — the canonical place where fetch happens.
// - Tests / scripts / migrations / seeds → skipped via overrides in
//   `.eslintrc.json`.
// - Inline escape : `// eslint-disable-next-line dog-universe/no-direct-api-fetch -- OK: <reason>`.

'use strict';

// Sub-routes that are NOT the [id] PATCH endpoint — they're sibling routes
// with their own handlers. Excluded from the [id] regex match.
const EXCLUDED_BOOKING_SEGMENTS = new Set(['merge', 'today']);
const EXCLUDED_INVOICE_SEGMENTS = new Set([]);

// (regex, helperName, optionalExcludeSet) — route URL patterns that should
// go through the typed client. Keep in sync with src/lib/api-client/index.ts.
const PROTECTED_ROUTES = [
  [/^\/api\/admin\/walkin-invoice\/?$/, 'createWalkinInvoice', null],
  [/^\/api\/invoices\/[^/]+\/payments\/?$/, 'recordInvoicePayment', null],
  [/^\/api\/admin\/invoices\/[^/]+\/cancel\/?$/, 'cancelInvoice', null],
  [/^\/api\/admin\/bookings\/[^/]+\/cancel\/?$/, 'cancelBooking', null],
  [/^\/api\/admin\/bookings\/[^/]+\/time-proposals\/?$/, 'submitTimeProposal', null],
  [/^\/api\/admin\/bookings\/?$/, 'createAdminBooking', null],
  // PATCH /api/admin/bookings/[id] (but NOT /api/admin/bookings/[id]/<sub>
  // or /api/admin/bookings/merge etc.)
  [/^\/api\/admin\/bookings\/([^/]+)\/?$/, 'patchAdminBooking', EXCLUDED_BOOKING_SEGMENTS],
  [/^\/api\/bookings\/?$/, 'createClientBooking', null],
  [/^\/api\/invoices\/?$/, 'createInvoice', null],
  // PATCH /api/invoices/[id] (but NOT /api/invoices/[id]/<sub>)
  [/^\/api\/invoices\/([^/]+)\/?$/, 'patchInvoice', EXCLUDED_INVOICE_SEGMENTS],
];

function isApiClientImpl(filename) {
  if (!filename) return false;
  const norm = filename.replace(/\\/g, '/');
  return norm.includes('/src/lib/api-client/');
}

/**
 * Best-effort extraction of a literal URL from a `fetch(URL, ...)`
 * first-argument node. Returns `null` if the URL is dynamic.
 *
 * Handles:
 *   - Plain string literal: `fetch('/api/foo')`
 *   - Template literal with no expressions: `fetch(\`/api/foo\`)`
 *   - Template literal with expressions: substitutes a placeholder
 *     `[^/]+` for each `${...}` so the regex still matches dynamic IDs.
 */
function extractFetchUrl(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral') {
    // Reconstruct the URL with `[ID]` placeholders for each expression.
    let url = '';
    for (let i = 0; i < node.quasis.length; i++) {
      url += node.quasis[i].value.cooked;
      if (i < node.expressions.length) {
        url += '[ID]';
      }
    }
    return url;
  }
  return null;
}

function matchProtectedRoute(url) {
  if (!url || !url.startsWith('/api/')) return null;
  // Normalize template placeholders to regex-friendly tokens.
  const normalized = url.replace(/\[ID\]/g, 'X');
  for (const [pattern, helper, excluded] of PROTECTED_ROUTES) {
    const m = normalized.match(pattern);
    if (!m) continue;
    // If this pattern has an exclusion set, check the captured segment.
    if (excluded && m[1] && excluded.has(m[1])) continue;
    return helper;
  }
  return null;
}

/**
 * Extract the HTTP method from the second argument of `fetch(url, init)`.
 * Returns the method as uppercase string, or null if unknown / not detectable.
 * Defaults to `GET` (browser default) when init is missing or method omitted.
 */
function extractFetchMethod(node) {
  if (!node) return 'GET';
  if (node.type !== 'ObjectExpression') return null; // dynamic init — give up
  for (const prop of node.properties) {
    if (prop.type !== 'Property' || prop.computed) continue;
    const keyName = prop.key.type === 'Identifier' ? prop.key.name
                  : prop.key.type === 'Literal' ? prop.key.value
                  : null;
    if (keyName !== 'method') continue;
    if (prop.value.type === 'Literal' && typeof prop.value.value === 'string') {
      return prop.value.value.toUpperCase();
    }
    return null; // dynamic method
  }
  return 'GET'; // method not specified in init
}

// Only POST and PATCH on protected routes should be redirected through
// the typed client. GET/DELETE remain free (the api-client doesn't cover
// them — see Top 10 scope).
const PROTECTED_METHODS = new Set(['POST', 'PATCH']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Forbid direct `fetch()` on the Top 10 critical API routes — use the typed wrapper in `@/lib/api-client/`.',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [],
    messages: {
      forbidden:
        'Direct `fetch("{{ url }}")` bypasses the typed client. Use `{{ helper }}()` from `@/lib/api-client` — it provides Zod pre-validation + discriminated `ApiResult` + auto Idempotency-Key. Inline escape : `// eslint-disable-next-line dog-universe/no-direct-api-fetch -- OK: <justification>`.',
    },
  },
  create(context) {
    if (isApiClientImpl(context.getFilename())) return {};

    return {
      CallExpression(node) {
        // Match `fetch(URL, ...)` — the global one, not `something.fetch(...)`.
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'fetch') return;
        if (node.arguments.length === 0) return;
        const url = extractFetchUrl(node.arguments[0]);
        if (!url) return;
        const helper = matchProtectedRoute(url);
        if (!helper) return;
        // Only flag mutating methods (POST / PATCH) — GET/DELETE on the
        // same URL paths are read paths or out-of-scope verbs and aren't
        // wrapped by the typed api-client.
        const method = extractFetchMethod(node.arguments[1]);
        if (!method || !PROTECTED_METHODS.has(method)) return;
        context.report({
          node,
          messageId: 'forbidden',
          data: { url, helper },
        });
      },
    };
  },
};
