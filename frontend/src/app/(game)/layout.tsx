'use client';

import type { ReactNode } from 'react';
import { Loading } from '@/components/account/elements';
import { AccountNav } from '@/components/account/account-nav';
import { useRequiredProfile } from '@/lib/session';

/**
 * Pages de jeu (personnages, fiches, création) : réservées aux joueurs
 * connectés, avec la navigation des pages de compte et plus de largeur.
 */
export default function GameLayout({ children }: { children: ReactNode }) {
  const profile = useRequiredProfile();

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      <AccountNav />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
        {profile ? children : <Loading />}
      </main>
    </div>
  );
}
