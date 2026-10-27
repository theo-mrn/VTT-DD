'use client';

import { ArrowRight } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/** Courbe et durée des survols de la landing. */
export const SURVOL = 'duration-300 ease-weighted';

const ANNEAU =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black';

/** Action principale : créer sa table pour un visiteur, ouvrir l'application une fois connecté. */
export function BoutonCommencer({
  libelle,
  compact = false,
  className,
}: Readonly<{ libelle?: string; compact?: boolean; className?: string }>) {
  const t = useTranslations('landing');
  const { statut } = useSession();
  const connecte = statut === 'connecte';
  return (
    <Link
      href={connecte ? '/accueil' : '/connexion?mode=inscription'}
      className={cn(
        'group inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground transition-[transform,background-color] hover:bg-primary/90 active:scale-[0.98]',
        SURVOL,
        ANNEAU,
        compact ? 'text-sm' : 'text-base',
        className,
      )}
    >
      {connecte ? t('cta.openApp') : (libelle ?? t('cta.start'))}
      <ArrowRight
        weight="bold"
        aria-hidden
        className={cn('size-4 transition-transform group-hover:translate-x-0.5', SURVOL)}
      />
    </Link>
  );
}

/** Connexion, dans la barre ; rien une fois connecté. */
export function LienConnexion({ className }: Readonly<{ className?: string }>) {
  const t = useTranslations('landing.nav');
  const { statut } = useSession();
  if (statut === 'connecte') return null;
  return (
    <Link
      href="/connexion"
      className={cn(
        'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground active:scale-[0.98]',
        SURVOL,
        ANNEAU,
        className,
      )}
    >
      {t('signIn')}
    </Link>
  );
}
