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
  '/api/bookings': 'bookings',
  '/api/uploads': 'uploads',
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Rate limiting — only for specific POST routes
  if (limiter) {
    const limitKey = RATE_LIMITED_ROUTES[path];
    if (limitKey && request.method === 'POST') {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        '127.0.0.1';

      const { success, limit, remaining, reset } = await limiter[limitKey].limit(ip);

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
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.supabase.co https://supabase.co",
    "font-src 'self'",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
  ].join('; ');

  // Forward nonce and locale to server components via request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Detect locale from URL path for html[lang] attribute in root layout
  const locale = path.startsWith('/en') ? 'en' : 'fr';
  requestHeaders.set('x-locale', locale);

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
