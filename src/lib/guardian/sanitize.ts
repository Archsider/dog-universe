/**
 * Guardian sanitizer — strip PII from Sentry payloads before sending to
 * Claude or persisting in DB.
 *
 * RGPD rule: never let an email, phone number, IP, JWT, cookie, or DB id
 * leave the trust boundary. Sentry payloads can contain breadcrumbs with
 * arbitrary user input — we redact aggressively.
 *
 * The redactions are deterministic so the same fingerprint hashes the same
 * way before and after sanitization (used for occurrence counting).
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// Permissive phone regex: handles +212-6-12-34-56-78, +33 6 12 34 56 78, etc.
// Requires a leading + and at least 8 digits in total to avoid matching
// stack-trace line:column or version numbers.
const PHONE_RE = /\+\d[\d\s().-]{7,}\d/g;
// IPv4
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// IPv6 (loose)
const IPV6_RE = /\b(?:[0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/g;
// JWT-like: header.payload.signature (base64url segments, 10+ chars each)
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
// Bearer / api-key headers
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi;
// Cuid (Prisma default ids: c + 24 chars)
const CUID_RE = /\bc[a-z0-9]{24}\b/g;
// UUID v4 / v1
const UUID_RE =
  /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\b/g;
// Long credit-card-shaped digit runs (defensive — should never appear)
const LONG_DIGITS_RE = /\b\d{13,19}\b/g;

/**
 * Redact PII from an arbitrary string.
 * Replacement uses static tokens so log lines remain readable but no
 * sensitive value leaks downstream.
 */
export function sanitizeString(input: string): string {
  if (!input) return input;
  return input
    .replace(JWT_RE, '[REDACTED_JWT]')
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]')
    .replace(IPV4_RE, '[REDACTED_IP]')
    .replace(IPV6_RE, '[REDACTED_IP]')
    .replace(UUID_RE, '[REDACTED_UUID]')
    .replace(CUID_RE, '[REDACTED_ID]')
    .replace(LONG_DIGITS_RE, '[REDACTED_DIGITS]');
}

const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'phonenumber',
  'password',
  'passwordhash',
  'token',
  'authorization',
  'cookie',
  'cookies',
  'set-cookie',
  'sessiontoken',
  'jwt',
  'apikey',
  'api_key',
  'secret',
  'creditcard',
  'card',
  'ssn',
  'address',
  'firstname',
  'lastname',
  'name',
]);

/**
 * Recursively walk a JSON-like structure: redact strings, drop sensitive keys.
 *
 * - Arrays: each element sanitized (max length capped to keep prompts cheap).
 * - Objects: keys whose lower-case form is in `SENSITIVE_KEYS` are dropped
 *   entirely. Other values are recursed into.
 * - Strings are passed through `sanitizeString`.
 * - Depth and array length are bounded to keep prompt size predictable.
 */
export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated:depth]';
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const cap = 50;
    const sliced = value.slice(0, cap).map((v) => sanitizePayload(v, depth + 1));
    if (value.length > cap) sliced.push(`[truncated:${value.length - cap}]`);
    return sliced;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
        continue;
      }
      out[k] = sanitizePayload(v, depth + 1);
    }
    return out;
  }
  return null;
}
