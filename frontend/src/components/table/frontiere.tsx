'use client';

import { useTranslations } from 'next-intl';
import { translate } from '@/i18n/runtime';
import { RotateCw, TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { EtatVide } from '@/components/commun/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Frontière d'erreur d'un panneau de la table (ou d'un de ses blocs) : si un
 * service (dés, historique…) fait tomber son écran, le reste de la table continue.
 */
export class FrontiereTable extends Component<
  { children: ReactNode; nom: string; compacte?: boolean },
  { erreur: boolean }
> {
  state = { erreur: false };

  static getDerivedStateFromError() {
    return { erreur: true };
  }

  componentDidCatch(erreur: Error, info: ErrorInfo) {
    console.warn(`${this.props.nom} : erreur isolée`, erreur.message, info.componentStack);
  }

  render() {
    if (!this.state.erreur) return this.props.children;
    const reessayer = () => this.setState({ erreur: false });
    if (this.props.compacte)
      return (
        <button
          type="button"
          onClick={reessayer}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-subtle hover:text-foreground"
        >
          <TriangleAlert className="size-3.5 text-warning" aria-hidden />
          {translate('table.host.unavailable', { name: this.props.nom })}
        </button>
      );
    return (
      <div className="px-4 py-10 sm:px-6 lg:px-8">
        <EtatVide
          icone={TriangleAlert}
          titre={translate('table.host.unavailable', { name: this.props.nom })}
          description={translate('table.host.crashed')}
          action={
            <Button variant="secondary" onClick={reessayer}>
              <RotateCw />
              {translate('table.host.retry')}
            </Button>
          }
        />
      </div>
    );
  }
}

/** Attente du code d'un panneau (chargé à la demande). */
export function ChargementOnglet({ className }: Readonly<{ className?: string }>) {
  const t = useTranslations('table.host');
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
        className,
      )}
      aria-busy
      aria-label={t('loading')}
    >
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-7 w-64 max-w-full" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
