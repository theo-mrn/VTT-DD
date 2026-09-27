'use client';

import { useId, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { FOCUS, TACTILE } from './tactile';

const APPUI_LONG_MS = 450;

/** Dés de la grille ; le d100 passe par le menu « + » ou la formule. */
export const DES_GRILLE = [4, 6, 8, 10, 12, 20] as const;

/**
 * Grille des dés (2 × 3) : un clic ajoute le dé à la formule ; un clic droit,
 * un appui long ou Retour arrière en retire un. Le compteur est sur le bouton.
 */
export function GrilleDes({
  compte,
  onAjouter,
  onRetirer,
}: {
  compte: Map<number, number>;
  onAjouter: (faces: number) => void;
  onRetirer: (faces: number) => void;
}) {
  const aide = useId();
  return (
    <div className="h-full">
      <p id={aide} className="sr-only">
        Clic droit, appui long ou touche Retour arrière pour retirer un dé.
      </p>
      <div
        role="group"
        aria-label="Dés à ajouter"
        className="grid h-full grid-cols-2 grid-rows-3 gap-1.5"
      >
        {DES_GRILLE.map((faces) => (
          <BoutonDe
            key={faces}
            faces={faces}
            n={compte.get(faces) ?? 0}
            aide={aide}
            onAjouter={() => onAjouter(faces)}
            onRetirer={() => onRetirer(faces)}
          />
        ))}
      </div>
    </div>
  );
}

export function BoutonDe({
  faces,
  n,
  aide,
  onAjouter,
  onRetirer,
}: {
  faces: number;
  n: number;
  aide: string;
  onAjouter: () => void;
  onRetirer: () => void;
}) {
  const minuteur = useRef<number | undefined>(undefined);
  // Appui long déjà traité : le clic (ou le menu contextuel) qui suit ne compte pas
  const long = useRef(false);
  const depart = useRef<{ x: number; y: number } | null>(null);

  const annuler = () => {
    window.clearTimeout(minuteur.current);
    depart.current = null;
  };

  function appui(e: PointerEvent<HTMLButtonElement>) {
    long.current = false;
    // La souris a le clic droit ; l'appui long sert au doigt et au stylet
    if (e.pointerType === 'mouse' || e.button !== 0) return;
    depart.current = { x: e.clientX, y: e.clientY };
    minuteur.current = window.setTimeout(() => {
      long.current = true;
      depart.current = null;
      if (n > 0) {
        onRetirer();
        navigator.vibrate?.(10);
      }
    }, APPUI_LONG_MS);
  }

  function deplacement(e: PointerEvent<HTMLButtonElement>) {
    const d = depart.current;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) annuler();
  }

  function clavier(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '-') {
      e.preventDefault();
      if (n > 0) onRetirer();
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (long.current) {
          long.current = false;
          return;
        }
        onAjouter();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (long.current) return;
        if (n > 0) onRetirer();
      }}
      onPointerDown={appui}
      onPointerMove={deplacement}
      onPointerUp={annuler}
      onPointerLeave={annuler}
      onPointerCancel={annuler}
      onKeyDown={clavier}
      aria-label={`Ajouter un d${faces}${n ? `, ${n} dans la formule` : ''}`}
      aria-describedby={aide}
      className={cn(
        'relative flex h-full min-h-10 w-full touch-manipulation select-none items-center justify-center rounded-lg border font-mono text-[13px] font-semibold tabular transition-[background-color,border-color,color,transform] duration-150 [-webkit-touch-callout:none]',
        'active:scale-95 motion-reduce:active:scale-100',
        n
          ? 'border-primary/45 bg-primary/10 text-primary-strong'
          : 'border-border bg-surface-2/60 text-muted-foreground hover:border-border-strong hover:bg-surface-3 hover:text-foreground',
        FOCUS,
        TACTILE,
      )}
    >
      d{faces}
      {n > 0 && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground tabular shadow-[0_0_0_2px_hsl(var(--card))]"
        >
          {n}
        </span>
      )}
    </button>
  );
}
