/**
 * Sites de fiches en ligne pris en charge (docs/import-fiche.md § 2.1) : liste fermée d'hôtes,
 * un adaptateur par site. Le service ne télécharge jamais d'autre adresse (pas de requête du
 * serveur vers n'importe où), en https, avec un délai et une taille de page bornés.
 */
import type { SheetReading } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { lireNooblies, NOOBLIES_HOST } from './nooblies.js';

interface Site {
  host: string;
  lire(html: string, url: string): SheetReading | null;
}

const SITES: readonly Site[] = [{ host: NOOBLIES_HOST, lire: lireNooblies }];

/** Délai et taille maximale d'une page de fiche. */
const DELAI_MS = 10_000;
const TAILLE_MAX = 2 * 1024 * 1024;

const hoteDe = (url: URL) => url.hostname.toLowerCase().replace(/\.$/, '');

/** Site de cette adresse (l'hôte ou un sous-domaine), en https ; sinon undefined. */
export function siteDe(adresse: string): Site | undefined {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
  const hote = hoteDe(url);
  return SITES.find((s) => hote === s.host || hote.endsWith(`.${s.host}`));
}

export const siteNonPrisEnCharge = () =>
  new HttpError(
    422,
    'Site non pris en charge',
    'sheet_site_unsupported',
    `Sites pris en charge : ${SITES.map((s) => s.host).join(', ')}`,
  );

const injoignable = (detail: string) =>
  new HttpError(502, 'Fiche injoignable', 'sheet_unreachable', detail);

/** Page HTML de la fiche ; redirections suivies seulement dans le site, trois au plus. */
async function telecharger(adresse: string, site: Site, sauts = 0): Promise<string> {
  let reponse: Response;
  try {
    reponse = await fetch(adresse, {
      redirect: 'manual',
      signal: AbortSignal.timeout(DELAI_MS),
      headers: { accept: 'text/html' },
    });
  } catch {
    throw injoignable('Le site ne répond pas');
  }
  if (reponse.status >= 300 && reponse.status < 400) {
    const suite = reponse.headers.get('location');
    const cible = suite ? new URL(suite, adresse).toString() : '';
    if (!cible || siteDe(cible) !== site || sauts >= 3)
      throw injoignable('Redirection hors du site');
    return telecharger(cible, site, sauts + 1);
  }
  if (!reponse.ok || !reponse.body) throw injoignable(`Réponse ${reponse.status} du site`);
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  for await (const m of reponse.body as unknown as AsyncIterable<Uint8Array>) {
    taille += m.byteLength;
    if (taille > TAILLE_MAX) throw injoignable('Page trop lourde');
    morceaux.push(m);
  }
  return Buffer.concat(morceaux).toString('utf8');
}

/** Lecture brute de la fiche à cette adresse (site pris en charge, page lisible). */
export async function lireFicheEnLigne(adresse: string): Promise<SheetReading> {
  const site = siteDe(adresse);
  if (!site) throw siteNonPrisEnCharge();
  const lecture = site.lire(await telecharger(adresse, site), adresse);
  if (!lecture)
    throw new HttpError(422, 'Fiche illisible', 'sheet_unreadable', 'Aucune fiche sur cette page');
  return lecture;
}
