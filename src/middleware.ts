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
  };
}

const limiter = getRatelimiter();

const RATE_LIMITED_ROUTES: Record<
  string,
  'auth' | 'passwordReset'
> = {
  '/api/auth/signin': 'auth',
  '/api/auth/callback/credentials': 'auth',
  '/api/register': 'auth',
  '/api/reset-password': 'passwordReset',
};

export async function middleware(request: NextRequest) {
  if (!limiter) return NextResponse.next();

  const path = request.nextUrl.pathname;
  const limitKey = RATE_LIMITED_ROUTES[path];

  if (!limitKey || request.method !== 'POST') return NextResponse.next();

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/auth/signin',
    '/api/auth/callback/credentials',
    '/api/register',
    '/api/reset-password',
  ],
};
