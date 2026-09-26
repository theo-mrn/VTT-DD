import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Aclonica, Caveat, Cinzel, IM_Fell_English, Inter, MedievalSharp } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/lib/session';
import './globals.css';

// Mêmes polices que l'ancienne app : le thème (globals.css) s'appuie sur ces variables
const imFellEnglish = IM_Fell_English({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-body',
  display: 'swap',
});
const aclonica = Aclonica({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-aclonica',
  display: 'swap',
});
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-title',
  display: 'swap',
});
const caveat = Caveat({ subsets: ['latin'], variable: '--font-hand', display: 'swap' });
const medieval = MedievalSharp({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-medieval',
  display: 'swap',
});
const inter = Inter({ subsets: ['latin'], variable: '--font-modern', display: 'swap' });

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
