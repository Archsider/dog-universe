/**
 * Simple in-memory rate limiter using a sliding window.
 * Works for single-instance deployments (Vercel serverless functions share
 * the same instance within the same region during warm instances).
 *
 * For multi-region or high-traffic, replace with Upstash Redis:
 *   https://github.com/upstash/ratelimit
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key.
 * @param key       Unique identifier (e.g. IP address, "register:1.2.3.4")
 * @param limit     Max requests allowed in the window
 * @param windowMs  Time window in milliseconds (default: 60_000 = 1 minute)
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/** Extract IP from Next.js request headers.
 * Prefers x-real-ip (set by Vercel/Nginx, not spoofable by client).
 * Falls back to last entry in x-forwarded-for (added by the closest trusted proxy). */
export function getIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[ips.length - 1]; // last entry is added by the closest trusted proxy
  }
  return 'unknown';
}
