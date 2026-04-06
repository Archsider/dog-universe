import { NextResponse } from 'next/server';

/**
 * GET /auth/login
 * Locale-aware redirect for NextAuth's signIn page.
 * Detects the locale from the callbackUrl and forwards to the correct login page.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const callbackUrl = searchParams.get('callbackUrl') ?? '';

  // Infer locale from the callbackUrl (e.g. /en/client/dashboard → 'en')
  const locale = /^\/(en)(\/|$)/.test(callbackUrl) ? 'en' : 'fr';
  const params = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : '';

  return NextResponse.redirect(`${origin}/${locale}/auth/login${params}`);
}
