/**
 * Langue d'une requête (docs/i18n.md § 3) : cookie, puis pays de l'adresse IP, puis
 * `Accept-Language`, puis le français. Pur : appelé par `request.ts` (serveur) et par les tests.
 */
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

/**
 * Pays où le français domine (codes ISO 3166-1) : France et outre-mer (qui ont leurs propres
 * codes), Belgique, Suisse, Luxembourg, Monaco, et les pays dont le français est langue
 * officielle. Un visiteur de l'un d'eux arrive en français.
 */
// prettier-ignore
const FRENCH_COUNTRIES = new Set([
  // France et outre-mer
  'FR', 'GP', 'MQ', 'GF', 'RE', 'YT', 'PM', 'BL', 'MF', 'WF', 'PF', 'NC',
  // Europe
  'BE', 'CH', 'LU', 'MC',
  // Français langue officielle
  'HT', 'SN', 'CI', 'CM', 'BJ', 'BF', 'ML', 'NE', 'TG', 'GA', 'CG', 'CD', 'GN', 'MG', 'CF', 'TD',
  'DJ', 'KM', 'BI', 'RW', 'SC', 'VU',
]);

/**
 * Pays où le français partage l'usage avec une autre langue (Québec dans le Canada, Maghreb,
 * Liban) : le pays ne tranche pas, la langue du navigateur décide.
 */
const MIXED_COUNTRIES = new Set(['CA', 'MA', 'DZ', 'TN', 'LB']);

/**
 * Langue d'un pays (en-tête `CF-IPCountry` de Cloudflare) : le français dans un pays
 * francophone, l'anglais ailleurs, null quand le pays est inconnu (`XX`, `T1` pour Tor) ou
 * partagé entre deux langues.
 */
export function localeOfCountry(country: string | null | undefined): Locale | null {
  const code = country?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return null;
  if (MIXED_COUNTRIES.has(code)) return null;
  return FRENCH_COUNTRIES.has(code) ? 'fr' : 'en';
}

/**
 * Première langue connue d'un en-tête `Accept-Language`, par poids décroissant (`q`), à poids
 * égal dans l'ordre de l'en-tête. `en-GB` donne `en` ; `*` et les langues inconnues sont ignorés.
 */
export function matchAcceptLanguage(
  header: string | null | undefined,
  available: readonly Locale[] = LOCALES,
): Locale | null {
  if (!header) return null;
  const ranges = header
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((r) => r.tag && r.tag !== '*' && r.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { tag } of ranges) {
    const primary = tag.split('-')[0];
    const found = available.find((l) => l === primary);
    if (found) return found;
  }
  return null;
}

export function resolveLocale({
  cookie,
  country,
  acceptLanguage,
}: {
  cookie?: string | null;
  /** Pays de l'adresse IP (`CF-IPCountry`), ou celui simulé en développement. */
  country?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(cookie)) return cookie;
  return localeOfCountry(country) ?? matchAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
