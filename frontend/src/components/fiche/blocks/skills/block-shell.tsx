'use client';

/**
 * Cadre du bloc Compétences : il remplit la cellule de la grille (hauteur imposée
 * par le redimensionnement) et fait défiler son seul contenu, l'en-tête restant visible.
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function BlockShell({
  title,
  count,
  actions,
  toolbar,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  count?: number;
  actions?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-surface',
        className,
      )}
    >
      {/* Pas de bandeau de titre (place perdue) : titre pour les lecteurs d'écran, actions seules */}
      <h2 className="sr-only">
        {title}
        {count !== undefined && ` (${count})`}
      </h2>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 px-3 pt-2">
          {actions}
        </div>
      )}
      {toolbar && (
        <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">{toolbar}</div>
      )}
      <div className={cn('min-h-0 flex-1 overflow-auto p-3', bodyClassName)}>{children}</div>
    </section>
  );
}
