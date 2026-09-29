'use client';

import { Map as IconeCarte } from 'lucide-react';
import type { ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';

export interface MapStageProps {
  /** Couverture de la campagne, en toile de fond tant que la carte n'est pas là. */
  backdropUrl: string | null | undefined;
  /** Graine du dégradé de repli (nom de la campagne). */
  seed: string;
  /**
   * Moteur de carte (canevas, jetons, brouillard). Il occupe toute la scène, sous les
   * surcouches et les panneaux ; sans lui, la scène montre la toile d'attente.
   */
  children?: ReactNode;
  /** Message de la toile d'attente (aucune scène ouverte, scène en cours d'ouverture). */
  emptyMessage?: string;
}

/**
 * Scène centrale de la table : la carte, en plein écran sous le rail, les panneaux et les
 * surcouches. Aucune logique de carte ici : le moteur (`components/map/table-map.tsx`) se
 * branche comme enfant, et reçoit tout l'espace (`absolute inset-0`).
 */
export function MapStage({
  backdropUrl,
  seed,
  children,
  emptyMessage = 'La carte arrive bientôt',
}: MapStageProps) {
  return (
    <section aria-label="Carte" className="absolute inset-0 overflow-hidden bg-background">
      {children ?? (
        <>
          <Illustration
            src={backdropUrl}
            graine={seed}
            initiale={false}
            className="absolute inset-0 scale-110 opacity-40 blur-2xl"
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background))_75%)]"
          />
          <div className="absolute inset-0 grid place-items-center p-6">
            <p className="flex items-center gap-2 rounded-full border border-border bg-background/60 px-4 py-2 text-sm text-muted-foreground backdrop-blur-md">
              <IconeCarte className="size-4 text-primary" aria-hidden />
              {emptyMessage}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
