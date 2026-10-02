import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Conteneur de page : largeur maximale et marges communes. */
export function Page({
  children,
  className,
  large = false,
}: {
  children: ReactNode;
  className?: string;
  /** Pleine largeur utile (tableaux de bord, grilles). */
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2 px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
        large ? 'max-w-7xl' : 'max-w-5xl',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** En-tête de page : surtitre, titre, description et actions à droite. */
export function EnTetePage({
  surtitre,
  titre,
  description,
  actions,
  className,
}: {
  surtitre?: ReactNode;
  titre: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {surtitre && (
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{surtitre}</p>
        )}
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
          {titre}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Titre de section dans une page, avec action éventuelle (« Tout voir »). */
export function TitreSection({
  children,
  action,
  compte,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  compte?: number;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {children}
        {compte !== undefined && (
          <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-medium text-muted-foreground">
            {compte}
          </span>
        )}
      </h2>
      {action}
    </div>
  );
}

/** Surface de contenu (panneau). */
export function Panneau({
  children,
  className,
  titre,
  description,
  action,
  corps = true,
}: {
  children: ReactNode;
  className?: string;
  titre?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Faux : pas de marge intérieure (listes, tableaux bord à bord). */
  corps?: boolean;
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card shadow-surface', className)}>
      {(titre || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            {titre && <h2 className="text-[15px] font-semibold tracking-tight">{titre}</h2>}
            {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cn(corps && 'p-5')}>{children}</div>
    </section>
  );
}

/** État vide illustré, avec action principale. */
export function EtatVide({
  icone: Icone,
  titre,
  description,
  action,
  className,
}: {
  icone: LucideIcon;
  titre: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border-strong px-6 py-14 text-center',
        className,
      )}
    >
      <div aria-hidden className="absolute inset-0 bg-grid opacity-60 mask-radial" />
      <div className="relative mb-4 flex size-12 items-center justify-center rounded-xl border border-border-strong bg-surface-2 shadow-surface">
        <Icone className="size-5 text-primary" />
      </div>
      <p className="relative text-[15px] font-semibold">{titre}</p>
      {description && (
        <p className="relative mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="relative mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
