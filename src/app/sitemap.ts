import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.doguniverse.ma';
const LOCALES = ['fr', 'en', 'ar'] as const;

type Route = {
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
};

// Public routes only — anything auth-gated (`/admin/*`, `/client/*`),
// token-protected (`/track/*`, `/time-proposals/*`) or API endpoints are
// excluded both here and in `app/robots.ts`. Status page is public by
// design (uptime transparency) and is indexed.
const PUBLIC_ROUTES: Route[] = [
  { path: '',               priority: 1.0, changeFrequency: 'weekly' },
  { path: '/auth/login',    priority: 0.6, changeFrequency: 'monthly' },
  { path: '/auth/register', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/privacy',       priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms',         priority: 0.3, changeFrequency: 'yearly' },
];

// /status is locale-agnostic (no /[locale] prefix) — appended once.
const ROOT_ROUTES: Route[] = [
  { path: '/status', priority: 0.4, changeFrequency: 'daily' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  // One entry per (locale × route) pair. Each entry advertises its
  // siblings in other locales via `alternates.languages` so Google can
  // route the right version to each user (hreflang). `x-default` points
  // to French (primary market: Morocco).
  for (const locale of LOCALES) {
    for (const route of PUBLIC_ROUTES) {
      const languages: Record<string, string> = {};
      for (const alt of LOCALES) {
        languages[alt] = `${baseUrl}/${alt}${route.path}`;
      }
      languages['x-default'] = `${baseUrl}/fr${route.path}`;

      entries.push({
        url: `${baseUrl}/${locale}${route.path}`,
        lastModified: now,
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: { languages },
      });
    }
  }

  for (const route of ROOT_ROUTES) {
    entries.push({
      url: `${baseUrl}${route.path}`,
      lastModified: now,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    });
  }

  return entries;
}
