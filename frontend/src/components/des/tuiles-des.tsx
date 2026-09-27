'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Eraser, Minus } from 'lucide-react';
import { DES_RAPIDES } from '@/lib/jets';
import { cn } from '@/lib/utils';
import { DeVisuel } from './de-visuel';

/**
 * Dés rapides en tuiles : un clic ajoute un dé à la formule, la pastille
 * compte ceux déjà écrits, le « − » en retire un. La dernière tuile vide la
 * formule (et complète la grille de 4 × 2 sur mobile).
 */
export function TuilesDes({
  compte,
  onAjouter,
  onRetirer,
  onVider,
  vide,
}: {
  compte: Map<number, number>;
  onAjouter: (faces: number) => void;
  onRetirer: (faces: number) => void;
  onVider: () => void;
  vide: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {DES_RAPIDES.map((faces) => {
        const n = compte.get(faces) ?? 0;
        return (
          <div key={faces} className="group/tuile relative">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => onAjouter(faces)}
              aria-label={`Ajouter un d${faces}${n ? ` (${n} dans la formule)` : ''}`}
              className={cn(
                'relative flex h-[76px] w-full flex-col items-center justify-center rounded-xl border transition-[border-color,background-color,box-shadow] duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                n
                  ? 'border-primary/35 bg-primary/[0.06] shadow-[inset_0_1px_0_0_hsl(var(--primary)/0.12)]'
                  : 'border-border bg-surface-2/50 hover:border-border-strong hover:bg-surface-3/70',
              )}
            >
              {/* Le dé est animé par framer (style en ligne) : le survol agit sur son cadre */}
              <span
                className={cn(
                  'transition-[transform,opacity] duration-300 ease-out group-hover/tuile:-rotate-6 group-hover/tuile:scale-105',
                  !n && 'opacity-80 group-hover/tuile:opacity-100',
                )}
              >
                <DeVisuel
                  faces={faces}
                  taille="md"
                  etat={n ? 'critique' : 'normal'}
                  className="text-xs"
                />
              </span>
            </motion.button>

            <AnimatePresence>
              {n > 0 && (
                <motion.span
                  key={n}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 26 }}
                  aria-hidden
                  className="pointer-events-none absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold text-primary-foreground tabular shadow-[0_0_0_2px_hsl(var(--card))]"
                >
                  {n}
                </motion.span>
              )}
            </AnimatePresence>

            {n > 0 && (
              <button
                type="button"
                onClick={() => onRetirer(faces)}
                aria-label={`Retirer un d${faces}`}
                className={cn(
                  'absolute left-1.5 top-1.5 flex size-[18px] items-center justify-center rounded-full border border-border-strong bg-surface-3 text-muted-foreground transition-[opacity,color] hover:text-foreground',
                  'focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  // Toujours visible au toucher ; au survol seulement avec une souris
                  '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/tuile:opacity-100',
                )}
              >
                <Minus className="size-3" />
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onVider}
        disabled={vide}
        className={cn(
          'flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-strong text-[11px] font-medium text-subtle transition-colors',
          'hover:border-border-strong hover:bg-surface-2/60 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        <Eraser className="size-4" aria-hidden />
        Vider
      </button>
    </div>
  );
}
