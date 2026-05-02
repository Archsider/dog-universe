import { NextResponse } from 'next/server';
import { auth } from '../../auth';

/**
 * Server-side helper for /api/admin/* route handlers — returns a 403 response
 * if the current session has `totpPending: true`, otherwise returns null.
 *
 * The middleware already blocks /api/admin/* with 403 TOTP_REQUIRED when a
 * session is pending 2FA; this helper is a defense-in-depth checkpoint for
 * routes that want belt-and-braces enforcement at the handler level.
 *
 * Usage:
 *   const totpBlock = await requireTotpSatisfied();
 *   if (totpBlock) return totpBlock;
 */
export async function requireTotpSatisfied(): Promise<NextResponse | null> {
  try {
    const session = await auth();
    if (session?.user?.totpPending) {
      return NextResponse.json({ error: 'TOTP_REQUIRED' }, { status: 403 });
    }
  } catch {
    // fail-safe: if auth() fails here, the route's own auth() call will
    // produce the correct 401/403 — don't double-fail.
  }
  return null;
}
