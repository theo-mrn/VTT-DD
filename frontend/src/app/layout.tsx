import type { Metadata, Viewport } from 'next';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { Fournisseurs } from '@/components/fournisseurs';
import { I18nProvider } from '@/i18n/provider';
import './globals.css';
import { MAP_FONT_VARIABLES } from './map-fonts';

/**
 * Polices hébergées dans le dépôt (src/app/fonts, sous-ensemble latin de Google Fonts) : le build
 * n'appelle jamais Google, dont les réponses aléatoires cassaient les images en CI.
 */
/** Interface. */
const geist = localFont({
  src: './fonts/geist.woff2',
  weight: '100 900',
  variable: '--font-sans',
  display: 'swap',
});
/** Chiffres des dés et des fiches. */
const geistMono = localFont({
  src: './fonts/geist-mono.woff2',
  weight: '100 900',
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
});
/** Noms de héros et de campagnes, en touche d'ambiance. */
const cinzel = localFont({
  src: [
    { path: './fonts/cinzel-400.woff2', weight: '400' },
    { path: './fonts/cinzel-600.woff2', weight: '600' },
    { path: './fonts/cinzel-700.woff2', weight: '700' },
  ],
  variable: '--font-display',
  display: 'swap',
});
/** Logo YNER (et titres de la landing page). */
const aclonica = localFont({
  src: './fonts/aclonica.woff2',
  weight: '400',
  variable: '--font-aclonica',
  display: 'swap',
});

const ICONS: Metadata['icons'] = {
  icon: [
    { url: '/favicon.ico', sizes: 'any' },
    { url: '/icon.svg', type: 'image/svg+xml' },
  ],
  apple: '/apple-icon.png',
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: 'Yner', template: '%s · Yner' },
    description: t('description'),
    icons: ICONS,
  };
}

export const viewport: Viewport = {
  themeColor: '#09090b',
  colorScheme: 'dark',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Langue de la requête (cookie, Accept-Language, défaut) : docs/i18n.md § 3
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`dark ${geist.variable} ${geistMono.variable} ${cinzel.variable} ${aclonica.variable} ${MAP_FONT_VARIABLES}`}
    >
      <body suppressHydrationWarning>
        <I18nProvider locale={locale} messages={messages}>
          <Fournisseurs>{children}</Fournisseurs>
        </I18nProvider>
      </body>
    </html>
  );
}
