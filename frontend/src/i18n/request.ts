/**
 * Configuration de requête de next-intl (serveur) : la langue de la requête, ses messages
 * (fusionnés sur le français), le fuseau et les formats nommés. Branchée par le plugin de
 * `next.config.ts`.
 */
import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { formats, LOCALE_COOKIE, SERVER_TIME_ZONE } from './config';
import { loadMessages } from './messages';
import { getMessageFallback, onIntlError } from './errors';
import { resolveLocale } from './resolve';

/**
 * Pays du visiteur : l'en-tête que Cloudflare ajoute à chaque requête (staging, prod). En local,
 * la requête vient de `localhost` (un VPN n'y change rien) : `I18N_DEV_COUNTRY` le simule, hors
 * production seulement. Rien n'est enregistré, le pays ne sert qu'à choisir la langue.
 */
function countryOf(h: Headers): string | null {
  const fromCloudflare = h.get('cf-ipcountry');
  if (fromCloudflare) return fromCloudflare;
  return process.env.NODE_ENV === 'production' ? null : (process.env.I18N_DEV_COUNTRY ?? null);
}

export default getRequestConfig(async () => {
  const h = await headers();
  const locale = resolveLocale({
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
    country: countryOf(h),
    acceptLanguage: h.get('accept-language'),
  });
  return {
    locale,
    messages: loadMessages(locale),
    timeZone: SERVER_TIME_ZONE,
    formats,
    onError: onIntlError,
    getMessageFallback,
  };
});
