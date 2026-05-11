import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

// Rate limiting is only active when Upstash env vars are set (production).
// In development (no vars), all requests pass through.
function getRatelimiter() {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });

  return {
    // Auth endpoints: 10 attempts per 15 minutes per IP
    auth: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '15 m'),
      prefix: 'rl:auth',
    }),
    // TOTP endpoints (setup / verify-setup / disable / validate) :
    // bucket dédié, 10 / 15 min, séparé d'`auth` pour éviter qu'un brute-force
    // de code TOTP ne gèle aussi les tentatives signin/reset-password
    // légitimes du même utilisateur (ou inversement).
    totp: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '15 m'),
      prefix: 'rl:totp',
    }),
    // Password reset: 5 attempts per hour per IP
    passwordReset: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 m'),
      prefix: 'rl:pwd-reset',
    }),
    // Booking creation: 20 per hour per IP
    bookings: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '60 m'),
      prefix: 'rl:bookings',
    }),
    // File uploads: 30 per hour per IP
    uploads: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '60 m'),
      prefix: 'rl:uploads',
    }),
    // Admin mutations: 300 per hour per IP (generous — admins are trusted users)
    adminMutation: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(300, '60 m'),
      prefix: 'rl:admin',
    }),
    // Public taxi SSE stream: 60 connection-opens per hour per IP. Each
    // connection is short-lived (~55 s) and reconnects via EventSource;
    // this caps at roughly one fresh connect per minute, which is plenty
    // for legitimate viewers and stops a clever attacker from hammering
    // the stream endpoint.
    taxiStream: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '60 m'),
      prefix: 'rl:taxi-stream',
    }),
    // Public taxi tracking JSON endpoint (/api/taxi-tracking/{token}/...): the
    // tracking page polls this as a fallback when SSE is unavailable. 600/h
    // (= 10/min) is generous for normal use (a polling client at 10 s = 360/h)
    // and bounds Postgres exposure to brute-force token enumeration. IP-based
    // bucket — viewers are unauthenticated.
    taxiTracking: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(600, '60 m'),
      prefix: 'rl:taxi-tracking',
    }),
    // RGPD ops (export + anonymize): 5 per hour per IP — these are expensive
    // (full DB read or transactional write) and abusable for DoS/scraping.
    rgpd: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 m'),
      prefix: 'rl:rgpd',
    }),
    // Addon requests (PET_TAXI / TOILETTAGE / AUTRE on an existing booking):
    // 10 per hour per IP. The route already caps 3 per booking; this prevents
    // an attacker from spam-creating bookings just to spam addon-request.
    addonRequest: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 m'),
      prefix: 'rl:addon-req',
    }),
    // Health endpoint: 60 per minute per IP — generous for monitoring probes,
    // tight enough to prevent scraping the uptime signal as a side-channel.
    health: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '1 m'),
      prefix: 'rl:health',
    }),
    // Public availability calendar (DB scan + per-month projection) — 60
    // per 15 min per IP. Cheap thanks to a 5-min Redis cache, but a tight
    // bucket discourages scrapers harvesting boarding-occupancy patterns.
    availability: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(60, '15 m'),
      prefix: 'rl:availability',
    }),
    // Tier 2 hardening (2026-05-09) — granular buckets for sensitive routes:
    //
    // payment: 5 / 60 min — POST /api/invoices/[id]/payments. Recording a
    // payment is a high-value comptable operation; brute-force or accidental
    // double-submits should be hard-capped per user.
    payment: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 m'),
      prefix: 'rl:payment',
    }),
    // invoiceCreate: 20 / 60 min — POST /api/admin/invoices and the future
    // /api/admin/invoices/standalone. Caps invoice spam from a compromised
    // admin token without throttling routine billing work.
    invoiceCreate: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '60 m'),
      prefix: 'rl:invoiceCreate',
    }),
    // vaccinationExtract: 10 / 60 min — POST /api/pets/[id]/vaccinations/extract.
    // Each call hits the Anthropic API ($$) and uploads a document; tight bucket
    // bounds cost exposure if a token leaks.
    vaccinationExtract: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 m'),
      prefix: 'rl:vaccinationExtract',
    }),
    // productOrder: 30 / 60 min — POST /api/client/bookings/[id]/add-product.
    // Clients adding shop products to an active stay; cap accidental
    // double-clicks and inventory griefing without blocking legitimate use.
    productOrder: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '60 m'),
      prefix: 'rl:productOrder',
    }),
    // geocode: 30 / 60 min — GET /api/geocode/reverse. Proxies Nominatim
    // (OSM) which has a 1 req/s fair-use policy. Authenticated only —
    // anonymous traffic is rejected at the route level.
    geocode: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '60 m'),
      prefix: 'rl:geocode',
    }),
  };
}

export const limiter = getRatelimiter();

// Bucket name for routes that should be rate-limited only on POST (default).
type ExactBucket = 'auth' | 'totp' | 'passwordReset' | 'bookings' | 'uploads';

export const RATE_LIMITED_ROUTES: Record<string, ExactBucket> = {
  '/api/auth/signin': 'auth',
  '/api/auth/callback/credentials': 'auth',
  '/api/register': 'auth',
  '/api/reset-password': 'passwordReset',
  '/api/profile/password': 'passwordReset', // change password — brute force protection
  '/api/contracts/sign': 'uploads', // signature contrat — spam protection
  '/api/bookings': 'bookings',
  '/api/uploads': 'uploads',
  // TOTP endpoints — bucket dédié `totp` (10 / 15 min) pour slow brute-force
  // des codes 6 digits (1e6 space) sans interférer avec le bucket `auth`
  // partagé par signin / register / reset-password.
  '/api/auth/totp/setup': 'totp',
  '/api/auth/totp/validate': 'totp',
  '/api/auth/totp/verify-setup': 'totp',
  '/api/auth/totp/disable': 'totp',
  // Diagnostics — manual SUPERADMIN-triggered live tests. Reuse the
  // passwordReset bucket (5 / 60 min) — same low-rate semantics, no need
  // to create a fresh bucket for two rarely-used endpoints.
  '/api/admin/diagnostics/test-email': 'passwordReset',
  '/api/admin/diagnostics/test-sms': 'passwordReset',
};

type DynamicBucket =
  | 'uploads'
  | 'auth'
  | 'passwordReset'
  | 'bookings'
  | 'taxiStream'
  | 'taxiTracking'
  | 'addonRequest'
  | 'payment'
  | 'invoiceCreate'
  | 'vaccinationExtract'
  | 'productOrder'
  | 'geocode';

// Routes rate-limited regardless of HTTP method (e.g. expensive GETs).
export const RATE_LIMITED_ROUTES_ANY_METHOD: Record<string, 'rgpd' | 'health' | 'availability' | 'geocode'> = {
  '/api/user/export': 'rgpd',          // GET — full DB read
  '/api/user/anonymize': 'rgpd',       // POST — transactional write
  '/api/health': 'health',             // GET — uptime probe, 60/min per IP
  '/api/availability': 'availability', // GET — public calendar, scrape-resistant
  '/api/geocode/reverse': 'geocode',   // GET — proxies Nominatim (1 req/s fair use)
};

// Routes dynamiques (avec [params]) — match par suffixe de path
export function getDynamicLimitBucket(path: string): DynamicBucket | null {
  // /api/pets/{petId}/vaccinations/extract — Anthropic API call ($$ + upload).
  // Tier 2 hardening: switched from 'uploads' (30/h) to dedicated 'vaccinationExtract'
  // (10/h) bucket — bounds cost exposure if an admin token leaks.
  if (path.startsWith('/api/pets/') && path.endsWith('/vaccinations/extract')) {
    return 'vaccinationExtract';
  }
  // /api/taxi/{token}/stream — public SSE endpoint, 60 opens/h per IP
  if (path.startsWith('/api/taxi/') && path.endsWith('/stream')) {
    return 'taxiStream';
  }
  // /api/taxi-tracking/{token}/... — public JSON tracking endpoints (state +
  // history). Unauthenticated, IP-bucketed. 600/h cap is plenty for a normal
  // polling viewer (~360/h) and blocks token brute-force scans.
  if (path.startsWith('/api/taxi-tracking/')) {
    return 'taxiTracking';
  }
  // /api/bookings/{id}/addon-request — client adds extra service to a booking
  if (path.startsWith('/api/bookings/') && path.endsWith('/addon-request')) {
    return 'addonRequest';
  }
  // SECURITY (P2): /api/bookings/{id}/extension-request — creates a PENDING_EXTENSION
  // booking row (DB write) and notifies all admins on each call. Reuse the addonRequest
  // bucket (10/h per user) — same threat model: client-driven booking creation, abused
  // both routes can spam admin notifications and bloat the booking table.
  if (path.startsWith('/api/bookings/') && path.endsWith('/extension-request')) {
    return 'addonRequest';
  }
  // P1-3: /api/admin/bookings/{id}/photos — file upload route under admin namespace.
  // Reuse the uploads bucket (30/h per user) to cap photo-spam and storage abuse.
  if (path.startsWith('/api/admin/bookings/') && path.endsWith('/photos')) {
    return 'uploads';
  }
  // Tier 2 hardening — sensitive POST routes :
  //
  // /api/invoices/{id}/payments — record a payment (POST). Tight 5/h bucket.
  if (
    path.startsWith('/api/invoices/') &&
    path.endsWith('/payments')
  ) {
    return 'payment';
  }
  // /api/admin/invoices (POST) and /api/admin/invoices/standalone (POST).
  // Note: this is hit before the generic adminMutation bucket — granular wins.
  if (
    path === '/api/admin/invoices' ||
    path === '/api/admin/invoices/standalone'
  ) {
    return 'invoiceCreate';
  }
  // /api/client/bookings/{id}/add-product — client adds shop products mid-stay.
  if (
    path.startsWith('/api/client/bookings/') &&
    path.endsWith('/add-product')
  ) {
    return 'productOrder';
  }
  return null;
}

const ADMIN_MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Run the rate-limit check for a request. Returns a 429 response when the
 * bucket is exhausted or Upstash is unavailable (fail-closed). Returns
 * `{ ok: true }` when the request should proceed.
 *
 * `resolveUserId` is invoked lazily — only when we're actually going to
 * rate-limit — so non-rate-limited routes pay no auth() cost.
 */
export async function checkRateLimit(
  request: NextRequest,
  opts: { resolveUserId?: () => Promise<string | null> } = {},
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (!limiter) return { ok: true };

  const path = request.nextUrl.pathname;

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1';

  const exactKey = RATE_LIMITED_ROUTES[path];
  const anyMethodKey = exactKey ? null : RATE_LIMITED_ROUTES_ANY_METHOD[path];
  const dynamicKey = (exactKey || anyMethodKey) ? null : getDynamicLimitBucket(path);
  const isAdminMutation =
    path.startsWith('/api/admin/') && ADMIN_MUTATION_METHODS.has(request.method);

  const limitKey =
    exactKey ?? anyMethodKey ?? dynamicKey ?? (isAdminMutation ? 'adminMutation' : null);

  // Routes exactes (mutation) : POST seulement.
  // taxiStream : GET (long-lived SSE connection — rate-limit per open).
  // RGPD any-method routes : toute méthode (GET export inclus).
  // Autres dynamiques : POST seulement.
  // Admin : toutes méthodes mutantes (déjà filtré par isAdminMutation).
  const methodAllowed =
    exactKey
      ? // /api/auth/totp/disable uses DELETE; everything else with an exact
        // key is POST. Allow either method when the path is the TOTP disable
        // endpoint.
        path === '/api/auth/totp/disable'
        ? request.method === 'DELETE'
        : request.method === 'POST'
      : anyMethodKey ? true :
    dynamicKey === 'taxiStream' ? request.method === 'GET' :
    dynamicKey === 'taxiTracking' ? request.method === 'GET' :
    dynamicKey ? request.method === 'POST' :
    true; // admin mutation

  if (!limitKey || !methodAllowed) return { ok: true };

  try {
    // Prefer per-user limit when authenticated: rotating IPs (VPN, mobile
    // network) shouldn't let a logged-in client/admin bypass the bucket.
    // Fall back to IP for anonymous traffic. We only call auth() when
    // we're actually going to rate-limit, so non-rate-limited routes
    // pay no auth() cost.
    let bucketKey = ip;
    if (opts.resolveUserId) {
      try {
        const userId = await opts.resolveUserId();
        if (userId) bucketKey = `u:${userId}`;
      } catch {
        // auth() failure → keep IP key (fail-safe, never block on it)
      }
    }
    const result = await limiter[limitKey].limit(bucketKey);

    // Validate the response shape — a malformed payload from Upstash should
    // never be interpreted as "allowed".
    if (
      !result ||
      typeof result.success !== 'boolean' ||
      typeof result.limit !== 'number' ||
      typeof result.remaining !== 'number' ||
      typeof result.reset !== 'number'
    ) {
      console.error('[middleware] rate-limit malformed response, fail-closed:', result);
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'SERVICE_UNAVAILABLE' },
          { status: 429, headers: { 'Retry-After': '60' } },
        ),
      };
    }

    const { success, limit, remaining, reset } = result;

    if (!success) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': String(limit),
              'X-RateLimit-Remaining': String(remaining),
              'X-RateLimit-Reset': String(reset),
              'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
            },
          },
        ),
      };
    }
  } catch (err) {
    // Upstash unreachable / timeout / unexpected error → fail-closed.
    // Sentry picks this up via console.error in production.
    console.error('[middleware] rate-limit check failed, fail-closed:', err);
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'SERVICE_UNAVAILABLE' },
        { status: 429, headers: { 'Retry-After': '60' } },
      ),
    };
  }

  return { ok: true };
}
