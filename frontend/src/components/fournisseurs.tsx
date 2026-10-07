'use client';

import { ShortcutsRoot } from '@/components/shortcuts/shortcuts-root';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig as LegacyMotionConfig } from 'framer-motion';
import { MotionConfig } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { YoutubeConsentBanner } from '@/components/audio/youtube-consent';
import { DiceThrowerHost } from '@/components/dice/thrower-host';
import { PerfOverlay } from '@/components/perf/perf-overlay';
import { ProgressionRoot } from '@/components/progression/progression-root';
import { Telemetry } from '@/components/telemetry';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LocaleSync } from '@/i18n/locale-sync';
import { SessionProvider } from '@/lib/session';

/** Contextes communs à toute l'app : cache des requêtes, session, infobulles, notifications. */
export function Fournisseurs({ children }: Readonly<{ children: ReactNode }>) {
  // Un client par onglet, créé une seule fois (et jamais partagé entre requêtes serveur)
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  // Mouvement réduit du système respecté partout : motion/react et framer-motion 11 sont deux
  // paquets distincts (deux contextes), chacun reçoit sa configuration
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <MotionConfig reducedMotion="user">
          <LegacyMotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
            {/* Langue du compte appliquée à ce navigateur (docs/i18n.md § 3) */}
            <LocaleSync />
            {/* Dés 3D de toute l'app, montés une seule fois (contexte WebGL, shaders et moteur
                physique gardés entre l'app et la table), chargés au premier lancer */}
            <DiceThrowerHost />
            {/* Raccourcis du compte, aide-mémoire (?) et éditeur, partout dans l'app */}
            <ShortcutsRoot />
            {/* Progression du compte : notifications (niveau, défi) et temps de jeu */}
            <ProgressionRoot />
            <PerfOverlay />
            <Telemetry />
            <YoutubeConsentBanner />
          </LegacyMotionConfig>
        </MotionConfig>
      </SessionProvider>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast:
              'group !rounded-xl !border !border-border-strong !bg-popover !text-foreground !shadow-elevated',
            description: '!text-muted-foreground',
            actionButton: '!bg-primary !text-primary-foreground',
          },
        }}
      />
    </QueryClientProvider>
  );
}
