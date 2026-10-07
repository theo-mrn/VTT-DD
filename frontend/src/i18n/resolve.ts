/**
 * Langue d'une requête (docs/i18n.md § 3) : cookie, puis `Accept-Language`, puis le français.
 * Pur : appelé par `request.ts` (serveur) et par les tests.
 */
import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from './config';

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
  acceptLanguage,
}: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(cookie)) return cookie;
  return matchAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE;
}
