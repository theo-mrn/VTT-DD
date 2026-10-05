import type { MetadataRoute } from 'next';
import { LEGAL_PAGES } from '@/lib/legal';
import { requestSite } from '@/lib/site';

/** Pages publiques : la landing, la connexion et les pages légales. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { indexed, origin } = await requestSite();
  if (!indexed) return [];
  return [
    { url: `${origin}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${origin}/connexion`, changeFrequency: 'yearly', priority: 0.5 },
    ...Object.values(LEGAL_PAGES).map((path) => ({
      url: `${origin}${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.2,
    })),
  ];
}
