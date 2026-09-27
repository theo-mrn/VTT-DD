'use client';

/**
 * Cadre des blocs Compétences et Arbre : il remplit la cellule de la grille (hauteur imposée
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
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="truncate">{title}</span>
          {count !== undefined && (
            <span className="text-xs font-normal tabular text-subtle">{count}</span>
          )}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      {toolbar && (
        <div className="shrink-0 space-y-2 border-b border-border px-4 py-2.5">{toolbar}</div>
      )}
      <div className={cn('min-h-0 flex-1 overflow-auto p-4', bodyClassName)}>{children}</div>
    </section>
  );
}
