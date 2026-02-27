import { NextRequest, NextResponse } from 'next/server';
import { auth } from './auth';
import createMiddleware from 'next-intl/middleware';
import { routing } from './src/i18n/routing';

const intlMiddleware = createMiddleware(routing);

const publicPaths = [
  '/auth/login',
  '/auth/register',
  '/auth/reset-password',
  '/api/auth',
  '/api/register',
  '/api/reset-password',
];

function isPublicPath(pathname: string): boolean {
  // Remove locale prefix for checking
  const withoutLocale = pathname.replace(/^\/(fr|en)/, '');
  return publicPaths.some((p) => withoutLocale.startsWith(p)) || withoutLocale === '' || withoutLocale === '/';
}

export default auth(async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Skip API routes (except auth-related ones we handle)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // Skip static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/uploads') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Apply i18n middleware
  const intlResponse = intlMiddleware(req);
  if (intlResponse) {
    // If it's a redirect (for locale prefix), let it through
    if (intlResponse.status === 307 || intlResponse.status === 308) {
      return intlResponse;
    }
  }

  // Get session from the augmented request
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (req as any).auth;

  // Extract locale from pathname
  const localeMatch = pathname.match(/^\/(fr|en)/);
  const locale = localeMatch ? localeMatch[1] : 'fr';

  // Check if path is public
  if (isPublicPath(pathname)) {
    // If logged in and trying to access auth pages, redirect to dashboard
    if (session && (pathname.includes('/auth/login') || pathname.includes('/auth/register'))) {
      const redirectPath = session.user.role === 'ADMIN'
        ? `/${locale}/admin/dashboard`
        : `/${locale}/client/dashboard`;
      return NextResponse.redirect(new URL(redirectPath, req.url));
    }
    return intlResponse ?? NextResponse.next();
  }

  // Protected routes: require authentication
  const isAdminRoute = pathname.includes('/admin/');
  const isClientRoute = pathname.includes('/client/');

  if ((isAdminRoute || isClientRoute) && !session) {
    return NextResponse.redirect(new URL(`/${locale}/auth/login`, req.url));
  }

  // Admin-only routes
  if (isAdminRoute && session?.user?.role !== 'ADMIN') {
    return NextResponse.redirect(new URL(`/${locale}/client/dashboard`, req.url));
  }

  return intlResponse ?? NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|uploads/).*)',
  ],
};
