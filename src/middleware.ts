import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from './middleware/rate-limit';
import { resolveUserId } from './middleware/auth';
import { applyI18nAndCsp } from './middleware/i18n';

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

  // Rate limiting — FAIL-CLOSED: if Upstash is unavailable on a rate-limited
  // route, return 429 immediately. A security control that fails open is no
  // control at all; we'd rather take a brief availability hit than silently
  // remove brute-force protection during a Redis outage.
  const rl = await checkRateLimit(request, { resolveUserId });
  if (!rl.ok) return rl.response;

  // TOTP guard — two layers, both enforced here:
  //
  //  A. PENDING TOTP (existing flow): admin already enrolled but hasn't entered
  //     the code this session → redirect to /auth/totp (or 403 on /api/admin/*).
  //
  //  B. MANDATORY ENROLLMENT (new): every ADMIN / SUPERADMIN MUST have TOTP
  //     enabled. If a privileged session lands on the app without
  //     `totpEnabled`, force them to /admin/profile (the only place where the
  //     TOTP setup UI lives) until they finish enrolling. /admin/profile and
  //     its setup APIs stay reachable so the user can complete enrollment.
  const pathname = request.nextUrl.pathname;
  const isTotpPage = /\/auth\/totp/.test(pathname);
  const isApiRoute = pathname.startsWith('/api/');
  const isStaticRoute = /\/_next\/|\/favicon/.test(pathname);
  const isAdminApi = pathname.startsWith('/api/admin/');
  const isTotpApi = pathname.startsWith('/api/auth/totp/');
  const isAdminProfilePage = /^\/(?:fr|en|ar)\/admin\/profile(?:\/|$)/.test(pathname);
  const isLogoutApi = pathname === '/api/auth/signout';

  // C1 fix: gate ALL API routes that may carry privileged actions, not just
  // /api/admin/*. Many sensitive endpoints live elsewhere (e.g. /api/invoices,
  // /api/bookings PATCH) and would otherwise let an admin session bypass TOTP.
  // CLIENT sessions are filtered inside the block — no behavior change for them.
  const needsTotpCheck =
    (!isTotpPage && !isApiRoute && !isStaticRoute) ||
    (isApiRoute && !isTotpApi && !isLogoutApi);

  // Reference isAdminApi so it stays available for future targeted logic
  // (and avoid an unused-var lint error after the broader gate above).
  void isAdminApi;

  if (needsTotpCheck) {
    try {
      const { auth } = await import('../auth.edge');
      const session = await auth();

      const localeMatch = pathname.match(/^\/(fr|en|ar)\//);
      const locale = localeMatch?.[1] ?? 'fr';

      // CLIENT sessions are not subject to TOTP enforcement at all.
      if (session?.user && session.user.role === 'CLIENT') {
        return applyI18nAndCsp(request);
      }

      // (A) TOTP pending — already enrolled, just hasn't validated this session.
      if (session?.user?.totpPending) {
        if (isApiRoute) {
          return NextResponse.json({ error: 'TOTP_REQUIRED' }, { status: 403 });
        }
        const totpUrl = new URL(`/${locale}/auth/totp`, request.url);
        totpUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(totpUrl);
      }

      // (B) Mandatory TOTP enrollment for ADMIN / SUPERADMIN.
      const isPrivileged = session?.user?.role === 'ADMIN' || session?.user?.role === 'SUPERADMIN';
      if (isPrivileged && !session.user.totpEnabled) {
        // Allow access to /admin/profile (where they configure TOTP) and to
        // the TOTP setup APIs + signout. Block everything else.
        if (isApiRoute) {
          if (!isTotpApi && !isLogoutApi) {
            return NextResponse.json({ error: 'TOTP_ENROLLMENT_REQUIRED' }, { status: 403 });
          }
        } else if (!isAdminProfilePage) {
          const profileUrl = new URL(`/${locale}/admin/profile?totp=required`, request.url);
          return NextResponse.redirect(profileUrl);
        }
      }
    } catch {
      // fail-safe: if auth() fails, let the request through
    }
  }

  // CSP nonce + locale forwarding for RSC + next-intl.
  return applyI18nAndCsp(request);
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
};
