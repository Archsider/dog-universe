// Idempotency-Key support backed by Redis (Upstash).
//
// Pattern:
//   1. Client sends `Idempotency-Key: <uuid>` header on a non-idempotent POST.
//   2. Server attempts SET NX EX with the key — first writer wins.
//   3. If the SET fails, the request is a replay — caller decides whether to
//      reject (409) or return a cached response.
//
// This file deliberately exposes only the SET-NX primitive. Storing the full
// response body is intentionally out of scope: it would require serialising
// arbitrary response shapes and inflating Redis storage. For the booking
// flow, rejecting duplicates with 409 is sufficient — the client can retry
// with a fresh key, and the server stays idempotent at the DB layer through
// other guards (capacity check, etc).
//
// Fail-open: if Redis is unconfigured or unreachable, the helper allows the
// request through. The accounting risk of a duplicate booking under a Redis
// outage is far smaller than the availability risk of blocking every booking
// when Redis is down.
import { Redis } from '@upstash/redis';

let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    cachedRedis = null;
    return null;
  }
  cachedRedis = new Redis({ url, token });
  return cachedRedis;
}

/** Default TTL: 24h — matches Stripe's idempotency-key window. */
const DEFAULT_TTL_SECONDS = 24 * 3600;

/** Bound on accepted key length — defence against arbitrary-length headers. */
const MAX_KEY_LENGTH = 128;

/** Allowed character set: UUIDs, ULIDs, base64url, dashes — no whitespace or
 *  control chars. Prevents Redis-key injection and noisy keys. */
const KEY_PATTERN = /^[A-Za-z0-9_\-]{8,128}$/;

export interface IdempotencyResult {
  /** true = this request should be processed; false = replay, reject. */
  acquired: boolean;
  /** When the lock was acquired or seen on Redis. null when fail-open. */
  redisAvailable: boolean;
}

/**
 * Reads the `Idempotency-Key` header and tries to claim it for this request.
 * Returns `{ acquired: true }` for the first caller (or when the header is
 * absent — back-compat with clients that don't send it). Returns
 * `{ acquired: false }` when the key has been seen within the TTL window.
 *
 * The `scope` argument namespaces the key (e.g. `'bookings:create'`) so two
 * unrelated endpoints can't collide.
 */
export async function tryAcquireIdempotency(
  request: Request,
  scope: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<IdempotencyResult> {
  const raw = request.headers.get('idempotency-key');
  if (!raw) return { acquired: true, redisAvailable: false };

  const key = raw.trim();
  if (key.length > MAX_KEY_LENGTH || !KEY_PATTERN.test(key)) {
    // Reject malformed keys outright — easier to debug than silently ignoring.
    throw new IdempotencyKeyInvalidError();
  }

  const redis = getRedis();
  if (!redis) return { acquired: true, redisAvailable: false }; // fail-open

  const redisKey = `idem:${scope}:${key}`;
  try {
    const result = await redis.set(redisKey, '1', { nx: true, ex: ttlSeconds });
    return { acquired: result === 'OK', redisAvailable: true };
  } catch (err) {
    console.error(JSON.stringify({ level: 'error', service: 'idempotency', message: 'Redis SET failed, failing open', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() }));
    return { acquired: true, redisAvailable: false };
  }
}

export class IdempotencyKeyInvalidError extends Error {
  constructor() {
    super('IDEMPOTENCY_KEY_INVALID');
    this.name = 'IdempotencyKeyInvalidError';
  }
}
