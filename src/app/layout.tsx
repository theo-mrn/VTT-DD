import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider"
import { CompetencesProvider } from "@/contexts/CompetencesContext"
import { GameProvider } from '@/contexts/GameContext';
import { CharacterProvider } from '@/contexts/CharacterContext';
import { UndoRedoProvider } from '@/contexts/UndoRedoContext';
import { ModuleProvider } from '@/modules/context';
import { Toaster } from "@/components/ui/sonner"
import TimeTracker from '@/components/TimeTracker';
import CookieBanner from '@/components/CookieBanner';
import QuotaGuard from '@/components/QuotaGuard';



import { IM_Fell_English, Cinzel, Caveat, MedievalSharp, Inter } from 'next/font/google';

const imFellEnglish = IM_Fell_English({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-body',
  display: 'swap',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-title',
  display: 'swap',
});

const caveat = Caveat({
  subsets: ['latin'],
  variable: '--font-hand',
  display: 'swap',
});

const medieval = MedievalSharp({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-medieval',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-modern',
  display: 'swap',
});


export const metadata: Metadata = {
  title: "Yner",
  description: "Plateforme de JDR VTT pour créer, gérer et jouer vos aventures épiques en ligne.",
  icons: {
    icon: '/favicon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning

      className={`${imFellEnglish.variable} ${cinzel.variable} ${caveat.variable} ${medieval.variable} ${inter.variable}`}
    >
      <link rel="shortcut icon" href="/favicon.ico" />

      <body
        className="antialiased"
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
          themes={['dark', 'tavern', 'dungeon', 'royal', 'druid']}
        >
          <GameProvider>
            <ModuleProvider>
            <CharacterProvider>
              <CompetencesProvider>
                <UndoRedoProvider>
                  <QuotaGuard />
                  <Toaster position="top-center" />
                  <TimeTracker />
                  <CookieBanner />
                  <div className="flex flex-col min-h-screen">
                    <main className="flex-1">
                      {children}
                    </main>

                  </div>
                </UndoRedoProvider>
              </CompetencesProvider>
            </CharacterProvider>
            </ModuleProvider>
          </GameProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
