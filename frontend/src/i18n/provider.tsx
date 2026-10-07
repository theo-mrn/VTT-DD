'use client';

import { NextIntlClientProvider, type Formats } from 'next-intl';
import type { ReactNode } from 'react';
import { formats, SERVER_TIME_ZONE, type Locale } from './config';
import { getMessageFallback, onIntlError } from './errors';
import { initI18nRuntime } from './runtime';
import type { Messages } from './types';

/** Fuseau du navigateur ; celui du serveur pendant le rendu serveur (docs/i18n.md § 5). */
function clientTimeZone(): string {
  if (typeof window === 'undefined') return SERVER_TIME_ZONE;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || SERVER_TIME_ZONE;
  } catch {
    return SERVER_TIME_ZONE;
  }
}

/**
 * Traductions des composants client, et du code hors React (`runtime.ts`), dans la langue de la
 * requête. Monté par le layout racine, qui lui passe la langue et ses messages.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: Readonly<{ locale: Locale; messages: Messages; children: ReactNode }>) {
  const timeZone = clientTimeZone();
  initI18nRuntime(locale, messages, timeZone);
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      formats={formats as Formats}
      timeZone={timeZone}
      onError={onIntlError}
      getMessageFallback={getMessageFallback}
    >
      {children}
    </NextIntlClientProvider>
  );
}
