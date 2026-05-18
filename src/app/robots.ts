import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';

// Robots policy:
//  - Allow crawl of public pages (landing, auth, privacy, terms, status)
//  - Disallow everything auth-gated, token-protected, or API endpoint to
//    keep them out of Google index AND save crawl budget.
//  - sitemap.xml points crawlers at the multi-lingual map (FR/EN/AR) with
//    hreflang alternates — see app/sitemap.ts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/client/',
          '/track/',           // public taxi tracking page (HMAC token URLs)
          '/time-proposals/',  // public time-proposal page (HMAC token URLs)
          '/_next/',
          '/uploads/',         // dev-only Supabase fallback path
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
