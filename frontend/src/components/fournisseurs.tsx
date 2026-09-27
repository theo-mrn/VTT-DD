'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SessionProvider } from '@/lib/session';

/** Contextes communs à toute l'app : cache des requêtes, session, infobulles, notifications. */
export function Fournisseurs({ children }: { children: ReactNode }) {
  // Un client par onglet, créé une seule fois (et jamais partagé entre requêtes serveur)
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
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
