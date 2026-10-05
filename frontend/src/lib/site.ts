import { headers } from 'next/headers';

/** Seul hôte indexé par les moteurs de recherche : le staging et les previews ne le sont pas. */
export const PUBLIC_HOST = 'yner.fr';

/** Hôte de la requête en cours (même image pour staging et prod), servi en HTTPS. */
export async function requestSite() {
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? PUBLIC_HOST).split(',')[0]!.trim();
  return { host, origin: `https://${host}`, indexed: host === PUBLIC_HOST };
}
