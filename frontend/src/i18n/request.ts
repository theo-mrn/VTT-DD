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

export default getRequestConfig(async () => {
  const locale = resolveLocale({
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get('accept-language'),
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
