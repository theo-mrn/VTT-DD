'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { useProfilRequis } from '@/lib/session';
import { cn } from '@/lib/utils';
import { EcranChargement } from './ecran-chargement';
import { LogoYner } from '@/components/commun/logo-yner';

/**
 * Pages « focus » (onboarding, assistants de création, choix du héros) :
 * plein écran, sans barre latérale, pour garder l'attention sur une tâche.
 */
export function CadreFocus({ children }: Readonly<{ children: ReactNode }>) {
  const profil = useProfilRequis();
  if (!profil) return <EcranChargement />;
  return <div className="min-h-dvh bg-background">{children}</div>;
}

/** En-tête d'une page focus : logo, contenu central (progression), bouton de sortie. */
export function EnTeteFocus({
  centre,
  quitter,
  libelleQuitter,
  className,
}: Readonly<{
  centre?: ReactNode;
  /** Lien de sortie (ou action). */
  quitter?: { href: string } | { onClick: () => void };
  libelleQuitter?: string;
  className?: string;
}>) {
  const t = useTranslations('shell.focus');
  const quit = libelleQuitter ?? t('quit');
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/60 bg-background/95 px-4 sm:px-6',
        className,
      )}
    >
      <Link href="/accueil" className="flex shrink-0 items-center gap-2.5" aria-label={t('home')}>
        <LogoYner className="size-8 text-primary" />
        <span className="hidden font-logo text-base tracking-[0.18em] sm:inline">YNER</span>
      </Link>
      <div className="flex min-w-0 flex-1 justify-center">{centre}</div>
      {quitter && 'href' in quitter && (
        <Button variant="ghost" size="sm" asChild>
          <Link href={quitter.href}>
            <X />
            <span className="hidden sm:inline">{quit}</span>
          </Link>
        </Button>
      )}
      {quitter && !('href' in quitter) && (
        <Button variant="ghost" size="sm" onClick={quitter.onClick}>
          <X />
          <span className="hidden sm:inline">{quit}</span>
        </Button>
      )}
      {!quitter && <span className="w-20" />}
    </header>
  );
}

/** Progression par étapes (segments), avec le nom de l'étape courante. */
export function ProgressionEtapes({
  etapes,
  courante,
  onAller,
}: Readonly<{
  etapes: { id: string; nom: string; faite?: boolean }[];
  courante: number;
  /** Rend les étapes déjà atteintes cliquables. */
  onAller?: (i: number) => void;
}>) {
  const t = useTranslations('shell.focus');
  return (
    <div className="flex w-full max-w-xl flex-col items-center gap-2">
      <div className="flex w-full gap-1.5">
        {etapes.map((e, i) => {
          const atteinte = i <= courante || e.faite;
          return (
            <button
              key={e.id}
              type="button"
              disabled={!onAller || !atteinte}
              onClick={() => onAller?.(i)}
              aria-label={t('step', { index: i + 1, name: e.nom })}
              aria-current={i === courante ? 'step' : undefined}
              className="group h-4 flex-1 py-1.5 disabled:cursor-default"
            >
              <span
                className={cn(
                  'block h-1 w-full rounded-full transition-colors duration-300',
                  teinteSegment(i, courante, e.faite),
                )}
              />
            </button>
          );
        })}
      </div>
      <p className="text-xs text-subtle">
        {t.rich('stepOf', {
          index: courante + 1,
          total: etapes.length,
          name: etapes[courante]?.nom ?? '',
          b: (chunks) => <span className="text-muted-foreground">{chunks}</span>,
        })}
      </p>
    </div>
  );
}

/**
 * Stepper d'un assistant : une pastille par étape (son numéro, une coche une fois faite), l'étape
 * courante avec son nom en clair, les autres en info-bulle ; une étape accessible se rouvre d'un
 * clic. Défile seul sur petit écran.
 */
export function EtapesFocus({
  etapes,
  courante,
  onAller,
}: Readonly<{
  etapes: { id: string; nom: string; faite?: boolean; accessible?: boolean }[];
  courante: number;
  onAller?: (i: number) => void;
}>) {
  const t = useTranslations('shell.focus');
  return (
    <ol
      aria-label={t('steps')}
      className="flex min-w-0 max-w-full items-center overflow-x-auto px-1 py-1 [scrollbar-width:none]"
    >
      {etapes.map((e, i) => {
        const actuelle = i === courante;
        const faite = !actuelle && (i < courante || e.faite);
        const ouvrable = !!onAller && !actuelle && (i < courante || e.accessible || e.faite);
        const pastille = (
          <button
            type="button"
            disabled={!ouvrable}
            onClick={() => onAller?.(i)}
            aria-label={t('step', { index: i + 1, name: e.nom })}
            aria-current={actuelle ? 'step' : undefined}
            className={cn(
              'flex h-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default',
              actuelle && 'gap-1.5 bg-primary px-3 text-primary-foreground shadow-sm',
              faite && 'w-7 bg-primary/15 text-primary enabled:hover:bg-primary/25',
              !actuelle &&
                !faite &&
                'w-7 border border-border-strong text-subtle enabled:hover:border-primary/60 enabled:hover:text-foreground',
            )}
          >
            {faite ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            {actuelle && <span className="max-w-[12rem] truncate">{e.nom}</span>}
          </button>
        );
        return (
          <li key={e.id} className="flex shrink-0 items-center">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'mx-1 h-px w-3 sm:mx-1.5 sm:w-5',
                  i <= courante ? 'bg-primary/60' : 'bg-border-strong',
                )}
              />
            )}
            {actuelle ? (
              pastille
            ) : (
              // Enveloppée : un bouton désactivé (étape à venir) ne reçoit pas le survol
              <Info texte={e.nom}>
                <span className="inline-flex">{pastille}</span>
              </Info>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Segment de progression : franchi (ou fait), courant, ou à venir. */
function teinteSegment(i: number, courante: number, faite: boolean | undefined): string {
  if (i < courante || (faite && i !== courante))
    return 'bg-primary/70 group-enabled:group-hover:bg-primary';
  return i === courante ? 'bg-primary' : 'bg-surface-3';
}
