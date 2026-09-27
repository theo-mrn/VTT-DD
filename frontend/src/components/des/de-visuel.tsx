'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Silhouette de chaque dé, dans un carré 40×40. */
function forme(faces: number) {
  switch (faces) {
    case 4:
      return { d: 'M20 4.5 36 34H4L20 4.5Z', lignes: null };
    case 6:
      return {
        d: 'M10 5h20a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V10a5 5 0 0 1 5-5Z',
        lignes: null,
      };
    case 8:
      return { d: 'M20 3 37 20 20 37 3 20 20 3Z', lignes: 'M3 20h34' };
    case 10:
    case 100:
      return {
        d: 'M20 3 36.5 16.5 20 37 3.5 16.5 20 3Z',
        lignes: 'M3.5 16.5 20 23l16.5-6.5M20 23v14',
      };
    case 12:
      return { d: 'M20 3.5 36.6 15.6 30.3 35.2H9.7L3.4 15.6 20 3.5Z', lignes: null };
    case 20:
      return {
        d: 'M20 3 35 11.5v17L20 37 5 28.5v-17L20 3Z',
        lignes: 'M20 3 11 25h18L20 3M5 11.5l6 13.5M35 11.5l-6 13.5M11 25l9 12 9-12',
      };
    default:
      return { d: 'M20 4a16 16 0 1 1 0 32 16 16 0 0 1 0-32Z', lignes: null };
  }
}

export type EtatDe = 'normal' | 'ecarte' | 'critique' | 'fumble' | 'explose';

/**
 * Dé en SVG avec sa valeur. `roulement` fait défiler des valeurs au hasard
 * avant de se poser sur la vraie (le résultat est déjà tiré).
 */
export function DeVisuel({
  faces,
  valeur,
  etat = 'normal',
  taille = 'md',
  roulement = false,
  delai = 0,
  className,
}: {
  faces: number;
  valeur?: number | null;
  etat?: EtatDe;
  taille?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  roulement?: boolean;
  delai?: number;
  className?: string;
}) {
  const { d, lignes } = forme(faces);
  const [affiche, setAffiche] = useState<number | null | undefined>(roulement ? null : valeur);

  useEffect(() => {
    if (!roulement) {
      setAffiche(valeur);
      return;
    }
    let tours = 0;
    let intervalle: number | undefined;
    const depart = window.setTimeout(() => {
      intervalle = window.setInterval(() => {
        tours++;
        if (tours >= 9) {
          window.clearInterval(intervalle);
          setAffiche(valeur);
        } else setAffiche(1 + Math.floor(Math.random() * faces));
      }, 55);
    }, delai);
    return () => {
      window.clearTimeout(depart);
      window.clearInterval(intervalle);
    };
  }, [roulement, valeur, faces, delai]);

  const pose = !roulement || affiche === valeur;
  const tailles = {
    xs: 'size-7 text-[10px]',
    sm: 'size-9 text-xs',
    md: 'size-12 text-sm',
    lg: 'size-16 text-lg',
    xl: 'size-24 text-3xl',
  };

  return (
    <motion.div
      initial={roulement ? { rotate: -90, scale: 0.6, opacity: 0 } : false}
      animate={{ rotate: 0, scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16, delay: delai / 1000 }}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center font-mono font-semibold tabular',
        tailles[taille],
        className,
      )}
      aria-label={valeur != null ? `d${faces} : ${valeur}` : `d${faces}`}
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <path
          d={d}
          className={cn(
            'transition-colors duration-300',
            etat === 'critique' && 'fill-primary/20 stroke-primary',
            etat === 'fumble' && 'fill-destructive/15 stroke-destructive',
            etat === 'explose' && 'fill-arcane/15 stroke-arcane',
            etat === 'ecarte' && 'fill-surface-2 stroke-border-strong',
            etat === 'normal' && 'fill-surface-3 stroke-white/25',
          )}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        {lignes && (
          <path
            d={lignes}
            fill="none"
            className="stroke-white/[0.07]"
            strokeWidth={1}
            strokeLinejoin="round"
          />
        )}
        {etat === 'critique' && pose && (
          <path
            d={d}
            fill="none"
            className="stroke-primary blur-[3px]"
            strokeWidth={3}
            opacity={0.7}
          />
        )}
      </svg>
      <span
        className={cn(
          'relative',
          faces === 4 && 'translate-y-[18%]',
          etat === 'ecarte' && 'text-subtle line-through decoration-1',
          etat === 'critique' && 'text-primary-strong',
          etat === 'fumble' && 'text-destructive',
          etat === 'explose' && 'text-arcane',
          etat === 'normal' && 'text-foreground',
          !pose && 'text-muted-foreground',
        )}
      >
        {affiche ?? (valeur == null ? `d${faces}` : '')}
      </span>
    </motion.div>
  );
}

/** État d'affichage d'un dé d'un jet. */
export function etatDe(
  faces: number,
  de: { value: number; kept: boolean; exploded: boolean },
  seulD20: boolean,
): EtatDe {
  if (!de.kept) return 'ecarte';
  if (de.exploded) return 'explose';
  if (faces === 20 && seulD20 && de.value === 20) return 'critique';
  if (faces === 20 && seulD20 && de.value === 1) return 'fumble';
  return 'normal';
}
