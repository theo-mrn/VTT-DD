'use client';

import { Crown, Swords } from 'lucide-react';
import Link from 'next/link';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Campagne } from '@/lib/campagnes';

/** Campagnes où l'on écrit des notes (MJ ou joueur, pas spectateur). */
export const campagnesEcrivables = (campagnes: Campagne[]) =>
  campagnes.filter((c) => c.role === 'gm' || c.role === 'player');

/**
 * Choix de la campagne d'une nouvelle note : une note appartient toujours à
 * une campagne. Sans campagne où écrire, invitation à en rejoindre une.
 */
export function ChoixCampagne({
  ouvert,
  campagnes,
  onChoix,
  onFermer,
}: {
  ouvert: boolean;
  /** Campagnes où l'utilisateur écrit, les plus récentes d'abord. */
  campagnes: Campagne[];
  onChoix: (id: string) => void;
  onFermer: () => void;
}) {
  return (
    <Dialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl border border-border-strong bg-surface-2">
            <Swords className="size-4 text-primary" />
          </div>
          <DialogTitle>Dans quelle campagne ?</DialogTitle>
          <DialogDescription>
            {campagnes.length
              ? 'La note y restera privée tant que vous ne la partagez pas.'
              : 'Les notes s’écrivent dans une campagne : rejoignez-en une ou créez la vôtre.'}
          </DialogDescription>
        </DialogHeader>
        {campagnes.length ? (
          <ul className="-mx-2 max-h-80 space-y-0.5 overflow-y-auto">
            {campagnes.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onChoix(c.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Illustration
                    largeur={64}
                    src={c.coverUrl}
                    graine={c.name}
                    initiale={false}
                    className="size-9 shrink-0 rounded-lg ring-1 ring-white/10"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="flex items-center gap-1 text-xs text-subtle">
                      {c.role === 'gm' && <Crown className="size-3" aria-hidden />}
                      {c.role === 'gm' ? 'Maître du jeu' : 'Joueur'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Button asChild className="w-full" onClick={onFermer}>
            <Link href="/campagnes">Voir les campagnes</Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
