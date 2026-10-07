import type { Locale } from './config';

/**
 * Variante d'un contenu long écrit par langue (docs/i18n.md § 7) : celle de la langue demandée,
 * sinon le français, toujours présent.
 */
export function pickByLocale<T>(
  variants: { fr: T } & Partial<Record<Locale, T>>,
  locale: Locale,
): T {
  return variants[locale] ?? variants.fr;
}
