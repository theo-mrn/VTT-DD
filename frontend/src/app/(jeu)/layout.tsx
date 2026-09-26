'use client';

import type { ReactNode } from 'react';
import { Chargement } from '@/components/compte/elements';
import { NavigationCompte } from '@/components/compte/navigation-compte';
import { useProfilRequis } from '@/lib/session';

/**
 * Pages de jeu (personnages, fiches, création) : réservées aux joueurs
 * connectés, avec la navigation des pages de compte et plus de largeur.
 */
export default function LayoutJeu({ children }: { children: ReactNode }) {
  const profil = useProfilRequis();

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      <NavigationCompte />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-10">
        {profil ? children : <Chargement />}
      </main>
    </div>
  );
}
