/**
 * Langues de l'interface (docs/i18n.md § 3) : la seule liste, lue par le front (catalogues,
 * sélecteur) et par identity (préférence du compte, `profiles.locale`). Ajouter une langue
 * commence ici.
 */
import { z } from 'zod';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Langue de référence (catalogue source) et de repli. */
export const DEFAULT_LOCALE: Locale = 'fr';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Langue choisie sur le compte ; `null` : pas de choix, le navigateur décide. */
export const AccountLocale = z.enum(LOCALES).nullable();
