/**
 * Réglages de l'internationalisation (docs/i18n.md) : langues, cookie, noms des langues,
 * formats nommés. Aucun catalogue ici : ce module est importé côté client.
 */
import type { Formats } from 'next-intl';
import type { Locale } from '@vtt/contracts';

export { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@vtt/contracts';

/** Cookie de la langue choisie (fonctionnel, nommé comme `vtt_refresh` et `vtt_oauth`). */
export const LOCALE_COOKIE = 'vtt_locale';
export const LOCALE_COOKIE_MAX_AGE_S = 365 * 24 * 60 * 60;

/** Chaque langue écrite dans sa propre langue, pour le sélecteur. */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
};

/**
 * Fuseau du rendu serveur. Le navigateur prend le sien : aucune date de données n'est rendue au
 * premier rendu serveur (docs/i18n.md § 5).
 */
export const SERVER_TIME_ZONE = 'Europe/Paris';

/** Formats nommés : `format.dateTime(d, 'date')`, `format.number(n, 'percent')`. */
export const formats = {
  dateTime: {
    /** 5 octobre 2026 / October 5, 2026 */
    date: { day: 'numeric', month: 'long', year: 'numeric' },
    /** 05/10/2026 / 10/05/2026 */
    shortDate: { day: '2-digit', month: '2-digit', year: 'numeric' },
    /** 5 oct. / Oct 5 */
    dayMonth: { day: 'numeric', month: 'short' },
    /** 5 oct. 2026, 14:32 */
    dateTime: {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
    /** 14:32 */
    time: { hour: '2-digit', minute: '2-digit' },
    /** Date calendaire (`AAAA-MM-JJ`), sans décalage de fuseau. */
    calendarDate: { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  },
  number: {
    percent: { style: 'percent', maximumFractionDigits: 0 },
    decimal: { maximumFractionDigits: 1 },
  },
  list: {
    and: { type: 'conjunction' },
    or: { type: 'disjunction' },
  },
} satisfies Formats;
