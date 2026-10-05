import type { MetadataRoute } from 'next';
import { requestSite } from '@/lib/site';

/**
 * Pages publiques indexées sur yner.fr seulement ; l'application derrière connexion ne l'est
 * jamais (pages vides pour un robot, liens d'invitation et jetons dans les URL).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { indexed, origin } = await requestSite();
  if (!indexed) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/v1/',
        '/accueil',
        '/campagnes',
        '/personnages',
        '/des',
        '/notes',
        '/resources',
        '/profil',
        '/amis',
        '/joueurs',
        '/paiement',
        '/bienvenue',
        '/join',
        '/discord',
        '/reinitialisation',
        '/verification-email',
        '/healthz',
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
