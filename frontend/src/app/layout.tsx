import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { Fournisseurs } from '@/components/fournisseurs';
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

export const metadata: Metadata = {
  title: { default: 'Yner', template: '%s · Yner' },
  description: 'Plateforme de JDR VTT pour créer, gérer et jouer vos aventures épiques en ligne.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#09090b',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`dark ${geist.variable} ${geistMono.variable} ${cinzel.variable} ${aclonica.variable} ${MAP_FONT_VARIABLES}`}
    >
      <body suppressHydrationWarning>
        <Fournisseurs>{children}</Fournisseurs>
      </body>
    </html>
  );
}
