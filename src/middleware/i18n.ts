import { NextRequest, NextResponse } from 'next/server';

/**
 * Build the Content-Security-Policy header for the current request.
 * Returns the nonce (so it can be forwarded to RSC via x-nonce) and the
 * fully-rendered CSP string.
 */
function buildCsp(): { nonce: string; csp: string } {
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
    // style-src-elem: controls <style> tags — nonce required, no inline allowed
    // style-src: fallback for browsers without split support; also controls style=
    //   attributes in browsers that support the split (style-src-attr intentionally
    //   omitted — 'unsafe-inline' on that directive would bypass nonce protection)
    `style-src-elem 'self' 'nonce-${nonce}'`,
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

  return { nonce, csp };
}

/**
 * Apply locale + CSP nonce header forwarding for a request and produce the
 * final NextResponse. The locale is detected from the URL path so the root
 * layout can set html[lang] correctly, and `x-next-intl-locale` is forwarded
 * for next-intl's `requestLocale` resolution.
 */
export function applyI18nAndCsp(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  const { nonce, csp } = buildCsp();

  // Forward nonce and locale to server components via request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Detect locale from URL path for html[lang] attribute in root layout
  const locale = path.startsWith('/en') ? 'en' : 'fr';
  requestHeaders.set('x-locale', locale);
  // Required by next-intl so requestLocale resolves correctly in getRequestConfig
  requestHeaders.set('x-next-intl-locale', locale);

  // Generate a per-request trace ID for structured log correlation.
  // Forwarded both to server components (via request header) and to the
  // caller / Vercel edge logs (via response header).
  const requestId = crypto.randomUUID();
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-request-id', requestId);

  return response;
}
