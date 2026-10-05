import type { MetadataRoute } from 'next';
import { LEGAL_PAGES } from '@/lib/legal';
import { PUBLIC_HOST } from '@/lib/site';

const ORIGIN = `https://${PUBLIC_HOST}`;

/**
 * Pages publiques de yner.fr : la landing, la connexion et les pages légales. Mêmes adresses
 * quel que soit l'hôte (le staging est de toute façon exclu par robots.txt).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${ORIGIN}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${ORIGIN}/connexion`, changeFrequency: 'yearly', priority: 0.5 },
    ...Object.values(LEGAL_PAGES).map((path) => ({
      url: `${ORIGIN}${path}`,
      changeFrequency: 'yearly' as const,
      priority: 0.2,
    })),
  ];
}
