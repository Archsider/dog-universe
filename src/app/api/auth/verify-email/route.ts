import { NextResponse } from 'next/server';

/**
 * GET /api/auth/verify-email
 * Email verification is not yet active — redirect to login.
 */
export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://doguniverse.ma';
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get('locale') ?? 'fr';
  return NextResponse.redirect(`${appUrl}/${locale}/auth/login`);
}
