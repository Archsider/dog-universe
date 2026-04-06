import { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://doguniverse.ma';

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ['fr', 'en'] as const;

  const publicRoutes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '', priority: 1.0, changeFrequency: 'weekly' },
    { path: '/privacy', priority: 0.4, changeFrequency: 'monthly' },
    { path: '/terms', priority: 0.4, changeFrequency: 'monthly' },
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const route of publicRoutes) {
      entries.push({
        url: `${baseUrl}/${locale}${route.path}`,
        lastModified: new Date('2026-04-06'),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
      });
    }
  }

  return entries;
}
