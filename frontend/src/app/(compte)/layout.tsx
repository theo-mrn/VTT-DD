'use client';

import type { ReactNode } from 'react';
import { Chargement } from '@/components/compte/elements';
import { NavigationCompte } from '@/components/compte/navigation-compte';
import { useProfilRequis } from '@/lib/session';

/**
 * Pages de compte (profil, sécurité, amis, clés d'API, profils de joueurs) :
 * réservées aux joueurs connectés, avec une navigation commune.
 */
export default function LayoutCompte({ children }: { children: ReactNode }) {
  const profil = useProfilRequis();

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      <NavigationCompte />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {profil ? children : <Chargement />}
      </main>
    </div>
  );
}
