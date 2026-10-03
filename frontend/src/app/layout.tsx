import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Aclonica, Cinzel, Geist, Geist_Mono } from 'next/font/google';
import { Fournisseurs } from '@/components/fournisseurs';
import './globals.css';
import { MAP_FONT_VARIABLES } from './map-fonts';

/** Interface. */
const geist = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
/** Chiffres des dés et des fiches. */
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });
/** Noms de héros et de campagnes, en touche d'ambiance. */
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
/** Logo YNER (et titres de la landing page). */
const aclonica = Aclonica({
  subsets: ['latin'],
  weight: ['400'],
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
