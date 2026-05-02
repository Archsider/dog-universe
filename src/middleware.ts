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

  // TOTP pending guard.
  //
  // Two paths:
  //  1. Browser navigation (non-API): ADMIN/SUPERADMIN who have not yet
  //     validated their 2FA this session are redirected to /[locale]/auth/totp.
  //  2. API access to /api/admin/*: bypassing the redirect by hitting the
  //     JSON API directly used to be possible — now blocked with 403
  //     TOTP_REQUIRED. The TOTP-validation endpoint itself stays open so
  //     the user can complete the second factor.
  const pathname = request.nextUrl.pathname;
  const isTotpPage = /\/auth\/totp/.test(pathname);
  const isApiRoute = pathname.startsWith('/api/');
  const isStaticRoute = /\/_next\/|\/favicon/.test(pathname);
  const isAdminApi = pathname.startsWith('/api/admin/');
  const isTotpApi = pathname.startsWith('/api/auth/totp/');

  const needsTotpCheck =
    (!isTotpPage && !isApiRoute && !isStaticRoute) ||
    (isAdminApi && !isTotpApi);

  if (needsTotpCheck) {
    try {
      const { auth } = await import('../auth');
      const session = await auth();
      if (session?.user?.totpPending) {
        if (isApiRoute) {
          return NextResponse.json({ error: 'TOTP_REQUIRED' }, { status: 403 });
        }
        const localeMatch = pathname.match(/^\/(fr|en)\//);
        const locale = localeMatch?.[1] ?? 'fr';
        const totpUrl = new URL(`/${locale}/auth/totp`, request.url);
        totpUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(totpUrl);
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
