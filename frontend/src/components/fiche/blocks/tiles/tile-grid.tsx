'use client';

/**
 * Grille de tuiles d'un bloc (attributs, ressources…) : colonnes fixes choisies en
 * personnalisation, ou `auto` (largeur du bloc mesurée, tuiles de `minPx` au moins, rangées
 * équilibrées). La hauteur du contenu change avec les colonnes : la grille de la fiche la
 * remesure d'elle-même (hauteur automatique).
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { autoColumns, resolveColumns, type TileColumns } from './model';

export function TileGrid({
  columns,
  count,
  minPx,
  cap,
  gapPx = 8,
  className,
  children,
}: Readonly<{
  columns?: TileColumns;
  /** Tuiles affichées. */
  count: number;
  /** Largeur minimale d'une tuile en `auto` (px). */
  minPx: number;
  /** Colonnes au plus en `auto` : préférence de la présentation, ou du type de bloc. */
  cap?: number;
  gapPx?: number;
  className?: string;
  children: ReactNode;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => setLargeur(Math.floor(e!.contentRect.width)));
    obs.observe(el);
    setLargeur(Math.floor(el.getBoundingClientRect().width));
    return () => obs.disconnect();
  }, []);
  const n = resolveColumns(columns, count, () =>
    largeur > 0 ? autoColumns(count, largeur, minPx, gapPx, cap) : Math.min(cap ?? count, count),
  );
  return (
    <div
      ref={ref}
      className={cn('grid', className)}
      style={{ gap: gapPx, gridTemplateColumns: `repeat(${Math.max(1, n)}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
