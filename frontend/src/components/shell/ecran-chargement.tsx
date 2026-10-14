'use client';

import { useTranslations } from 'next-intl';
import { LogoYner } from '@/components/commun/logo-yner';
import { cn } from '@/lib/utils';

/**
 * Indicateur de chargement unique de l'app : le logo qui pulse, sans texte visible (le texte
 * reste pour les lecteurs d'écran). Le même d'un bout à l'autre de l'ouverture de la table.
 */
export function IconeChargement({
  texte,
  className,
}: Readonly<{ texte?: string; className?: string }>) {
  const t = useTranslations('shell');
  return (
    <div role="status" className={cn('relative size-12', className)}>
      <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" aria-hidden />
      <LogoYner className="relative size-12 animate-pulse text-primary" aria-hidden />
      <span className="sr-only">{texte ?? t('loading')}</span>
    </div>
  );
}

/** Écran d'attente plein cadre (session en cours d'ouverture). */
export function EcranChargement({ texte }: Readonly<{ texte?: string }>) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <IconeChargement texte={texte} />
    </div>
  );
}
