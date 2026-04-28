import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Rate limiting is only active when Upstash env vars are set (production).
// In development (no vars), all requests pass through.
function getRatelimiter() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redis = new Redis({ url, token });

  return {
    // Auth endpoints: 10 attempts per 15 minutes per IP
    auth: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '15 m'),
      prefix: 'rl:auth',
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
  };
}

const limiter = getRatelimiter();

const RATE_LIMITED_ROUTES: Record<
  string,
  'auth' | 'passwordReset' | 'bookings' | 'uploads'
> = {
  '/api/auth/signin': 'auth',
  '/api/auth/callback/credentials': 'auth',
  '/api/register': 'auth',
  '/api/reset-password': 'passwordReset',
  '/api/profile/password': 'passwordReset', // change password — brute force protection
  '/api/contracts/sign': 'uploads', // signature contrat — spam protection
  '/api/bookings': 'bookings',
  '/api/uploads': 'uploads',
};

// Routes dynamiques (avec [params]) — match par suffixe de path
function getDynamicLimitBucket(path: string): 'uploads' | 'auth' | 'passwordReset' | 'bookings' | null {
  // /api/pets/{petId}/vaccinations/extract — upload + parsing PDF coûteux
  if (path.startsWith('/api/pets/') && path.endsWith('/vaccinations/extract')) {
    return 'uploads';
  }
  return null;
}

const ADMIN_MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export async function middleware(request: NextRequest) {
  // Defense-in-depth against CVE-2025-29927 (GHSA-f82v-jwr5-mffw):
  // x-middleware-subrequest is an internal Next.js header that must never arrive
  // from an external client. Block any request carrying it.
  if (request.headers.has('x-middleware-subrequest')) {
    return new NextResponse(null, { status: 400 });
  }

  // Note: l'ancienne mitigation manuelle pour GHSA-8f24-v5vv-gm5j (open
  // redirect via next-intl) a ete retiree — corrigee en amont dans
  // next-intl >= 4.9.1.

  const path = request.nextUrl.pathname;

  // Rate limiting — FAIL-CLOSED: if Upstash is unavailable on a rate-limited
  // route, return 429 immediately. A security control that fails open is no
  // control at all; we'd rather take a brief availability hit than silently
  // remove brute-force protection during a Redis outage.
  if (limiter) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const exactKey = RATE_LIMITED_ROUTES[path];
    const dynamicKey = exactKey ? null : getDynamicLimitBucket(path);
    const isAdminMutation =
      path.startsWith('/api/admin/') && ADMIN_MUTATION_METHODS.has(request.method);

    const limitKey = exactKey ?? dynamicKey ?? (isAdminMutation ? 'adminMutation' : null);

    // Routes exactes + dynamiques : POST seulement (mutations).
    // Admin : toutes méthodes mutantes (déjà filtré par isAdminMutation).
    if (limitKey && ((exactKey || dynamicKey) ? request.method === 'POST' : true)) {
      try {
        const result = await limiter[limitKey].limit(ip);

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
          return NextResponse.json(
            { error: 'SERVICE_UNAVAILABLE' },
            { status: 429, headers: { 'Retry-After': '60' } },
          );
        }

        const { success, limit, remaining, reset } = result;

        if (!success) {
          return NextResponse.json(
            { error: 'Too many requests. Please try again later.' },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': String(limit),
                'X-RateLimit-Remaining': String(remaining),
                'X-RateLimit-Reset': String(reset),
                'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
              },
            }
          );
        }
      } catch (err) {
        // Upstash unreachable / timeout / unexpected error → fail-closed.
        // Sentry picks this up via console.error in production.
        console.error('[middleware] rate-limit check failed, fail-closed:', err);
        return NextResponse.json(
          { error: 'SERVICE_UNAVAILABLE' },
          { status: 429, headers: { 'Retry-After': '60' } },
        );
      }
    }
  }

  // Generate a per-request nonce for Content-Security-Policy
  // btoa(randomUUID) produces a URL-safe base64 string without Node.js Buffer
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV === 'development';

  const csp = [
    "default-src 'self'",
    // unsafe-eval only in dev (HMR); strict-dynamic in prod makes unsafe-inline inert
    isDev
      ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // CSP Level 3 split style directives:
    // style-src-elem: controls <style> tags — requires nonce (no unsafe-inline)
    // style-src-attr: controls style="" attributes — unsafe-inline needed for Radix/Tailwind
    // style-src: fallback for browsers that don't support the split (kept as-is)
    `style-src-elem 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // img-src ajoute les CDN tuiles cartographiques (Leaflet/OpenStreetMap)
    // pour le suivi GPS taxi.
    "img-src 'self' blob: data: https://*.supabase.co https://supabase.co https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "font-src 'self'",
    // Restrict connect-src to known origins — 'https:' was too permissive.
    // Upstash Redis is called server-side only (no browser fetch needed).
    // wss://*.supabase.co : Supabase Realtime pour le push temps-réel de la position GPS.
    // https://*.tile.openstreetmap.org : tuiles cartographiques Leaflet.
    isDev
      ? "connect-src 'self' https://*.supabase.co https://supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org ws://localhost:* http://localhost:*"
      : "connect-src 'self' https://*.supabase.co https://supabase.co wss://*.supabase.co https://*.tile.openstreetmap.org",
    "frame-ancestors 'none'",
  ].join('; ');

  // Forward nonce and locale to server components via request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Detect locale from URL path for html[lang] attribute in root layout
  const locale = path.startsWith('/en') ? 'en' : 'fr';
  requestHeaders.set('x-locale', locale);
  // Required by next-intl so requestLocale resolves correctly in getRequestConfig
  requestHeaders.set('x-next-intl-locale', locale);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
