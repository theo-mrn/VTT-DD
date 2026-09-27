'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface OptionSegment<T extends string> {
  valeur: T;
  libelle: string;
  icone?: LucideIcon;
  /** Infobulle (explication courte). */
  aide?: string;
}

/**
 * Choix exclusif en pastilles (visibilité, avantage). Groupe radio accessible :
 * flèches pour se déplacer, un seul arrêt de tabulation.
 */
export function Segmente<T extends string>({
  options,
  valeur,
  onChange,
  etiquette,
  className,
}: {
  options: OptionSegment<T>[];
  valeur: T;
  onChange: (v: T) => void;
  /** Nom du groupe pour les lecteurs d'écran. */
  etiquette: string;
  className?: string;
}) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function clavier(e: KeyboardEvent, i: number) {
    const pas =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!pas) return;
    e.preventDefault();
    const suivant = (i + pas + options.length) % options.length;
    onChange(options[suivant]!.valeur);
    refs.current[suivant]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={etiquette}
      className={cn(
        'relative inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5',
        className,
      )}
    >
      {options.map((o, i) => {
        const actif = o.valeur === valeur;
        const bouton = (
          <button
            key={o.valeur}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={actif}
            tabIndex={actif ? 0 : -1}
            onClick={() => onChange(o.valeur)}
            onKeyDown={(e) => clavier(e, i)}
            className={cn(
              'relative flex h-full flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              actif ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {actif && (
              <motion.span
                layoutId={`segment-${id}`}
                className="absolute inset-0 rounded-md border border-white/[0.06] bg-surface-3 shadow-surface"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {o.icone && (
              <o.icone
                className={cn('relative size-3.5 shrink-0', actif && 'text-primary')}
                aria-hidden
              />
            )}
            <span className="relative">{o.libelle}</span>
          </button>
        );
        return o.aide ? (
          <Info key={o.valeur} texte={o.aide}>
            {bouton}
          </Info>
        ) : (
          bouton
        );
      })}
    </div>
  );
}
