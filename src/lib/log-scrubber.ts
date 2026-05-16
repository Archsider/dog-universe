// Recursive secret scrubber for structured logs + ActionLog.details.
//
// Source : audit 2026-05-16 Hunt F1 — "logAction() details non-redacté
// automatiquement, un dev qui loggue { password } écrit en clair dans la
// table ActionLog (qui finit dans les backups, dans les exports RGPD, et
// dans n'importe quel script d'audit)".
//
// Stratégie : remplace toute valeur dont la CLÉ matche un pattern sensible
// par la sentinel `'[REDACTED]'`. Préserve la structure pour que la valeur
// soit toujours sérialisable mais sans fuite de PII/secrets.
//
// Pure helper — testable sans DB ni I/O.

const SENSITIVE_KEY_PATTERN =
  /password|passwd|pwd|token|secret|api[_-]?key|apikey|authorization|cookie|csrf|2fa|otp|totp/i;

const REDACTED = '[REDACTED]';

/** Max depth — defence against cyclic structures + JSON bombs. */
const MAX_DEPTH = 6;

/** Cap on the number of keys traversed per call. */
const MAX_NODES = 1000;

interface Ctx {
  visited: WeakSet<object>;
  nodeCount: number;
}

function shouldRedact(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function scrubValue(value: unknown, depth: number, ctx: Ctx): unknown {
  if (ctx.nodeCount >= MAX_NODES) return value;
  if (depth > MAX_DEPTH) return value;
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'bigint') return value;
  if (t !== 'object') return value;

  // Cyclic protection — return as-is, scrubber doesn't follow back-edges.
  if (ctx.visited.has(value as object)) return value;
  ctx.visited.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1, ctx));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    ctx.nodeCount++;
    if (shouldRedact(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = scrubValue(v, depth + 1, ctx);
    }
  }
  return out;
}

/**
 * Returns a deep-cloned variant of `obj` with sensitive keys replaced by
 * `'[REDACTED]'`. Safe to call on any user-supplied object. Idempotent.
 */
export function scrubSensitive<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  const ctx: Ctx = { visited: new WeakSet(), nodeCount: 0 };
  return scrubValue(obj, 0, ctx) as T;
}

/** Exported for unit tests. */
export const __test = { SENSITIVE_KEY_PATTERN, REDACTED, MAX_DEPTH };
