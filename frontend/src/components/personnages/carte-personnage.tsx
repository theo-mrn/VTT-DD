'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Personnage } from '@/lib/personnages';
import { cn } from '@/lib/utils';

/** Portrait d'un personnage en carte verticale : nom, accroche, niveau. */
export function CartePersonnage({
  personnage: p,
  href,
  haut,
  bas,
  className,
  onClick,
  choisie,
}: {
  personnage: Pick<Personnage, 'id' | 'name' | 'portraitUrl' | 'summary'>;
  href?: string;
  /** Badges en haut à gauche (système, campagne…). */
  haut?: ReactNode;
  /** Contenu sous le nom (valeurs clés, joueur…). */
  bas?: ReactNode;
  className?: string;
  onClick?: () => void;
  choisie?: boolean;
}) {
  const contenu = (
    <Illustration
      largeur={320}
      src={p.portraitUrl}
      graine={p.name}
      position="top"
      className="aspect-[3/4] w-full"
      classeImage="transition-transform duration-700 ease-out group-hover:scale-[1.05]"
      voile
    >
      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">{haut}</div>
        {p.summary.highlights[0] && (
          <Badge ton="verre" className="tabular">
            {p.summary.highlights[0].label} {p.summary.highlights[0].value}
          </Badge>
        )}
      </div>
      <div className="absolute inset-x-4 bottom-4">
        <h3 className="truncate font-display text-xl font-semibold text-white drop-shadow">
          {p.name}
        </h3>
        {p.summary.tagline && (
          <p className="truncate text-[13px] text-white/70">{p.summary.tagline}</p>
        )}
        {bas}
      </div>
    </Illustration>
  );

  const classes = cn(
    'group relative block overflow-hidden rounded-2xl border bg-card text-left shadow-surface transition-all duration-300',
    choisie
      ? 'border-primary shadow-glow'
      : 'border-border hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevated',
    className,
  );

  if (href)
    return (
      <Link href={href} className={classes}>
        {contenu}
      </Link>
    );
  if (onClick)
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(classes, 'w-full')}
        aria-pressed={choisie}
      >
        {contenu}
      </button>
    );
  return <div className={classes}>{contenu}</div>;
}

export function CartePersonnageSquelette() {
  return <Skeleton className="aspect-[3/4] rounded-2xl" />;
}
