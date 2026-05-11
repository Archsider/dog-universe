import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '../../auth';

type Role = 'CLIENT' | 'ADMIN' | 'SUPERADMIN';

type RequireRoleResult =
  | { error: NextResponse; session?: undefined }
  | { error?: undefined; session: Session };

/**
 * requireRole — auth + role gate factorisé. Remplace le pattern dupliqué dans
 * 86 routes (`auth() + if !session + if role !== ...`). Usage :
 *
 *   const guard = await requireRole(['ADMIN', 'SUPERADMIN']);
 *   if (guard.error) return guard.error;
 *   const { session } = guard;
 *
 * Le narrowing TS sur `guard.error` est correct grâce au type discriminé.
 */
export async function requireRole(roles: Role[]): Promise<RequireRoleResult> {
  const session = (await auth()) as Session | null;
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!roles.includes(session.user.role as Role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { session };
}

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
