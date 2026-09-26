import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { aclonica, caveat, cinzel, imFellEnglish, inter, medieval } from './fonts';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/lib/session';
import './globals.css';

// Mêmes polices que l'ancienne app : le thème (globals.css) s'appuie sur ces variables

export const metadata: Metadata = {
  title: 'Yner',
  description: 'Plateforme de JDR VTT pour créer, gérer et jouer vos aventures épiques en ligne.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${imFellEnglish.variable} ${cinzel.variable} ${caveat.variable} ${medieval.variable} ${inter.variable} ${aclonica.variable}`}
    >
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          themes={['dark', 'tavern', 'dungeon', 'royal', 'druid']}
        >
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
