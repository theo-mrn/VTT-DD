/** Cookie de la langue, écrit par le navigateur (docs/i18n.md § 3). */
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_S, type Locale } from './config';

/** Langue du cookie, telle quelle (non vérifiée), ou null. */
export function readLocaleCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const entry = document.cookie.split('; ').find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(LOCALE_COOKIE.length + 1)) : null;
}

/** Écrit le cookie ; faux s'il n'a pas pu l'être (cookies bloqués). */
export function writeLocaleCookie(locale: Locale): boolean {
  if (typeof document === 'undefined') return false;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`;
  return readLocaleCookie() === locale;
}
