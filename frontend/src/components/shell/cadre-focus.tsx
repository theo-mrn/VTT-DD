'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useProfilRequis } from '@/lib/session';
import { cn } from '@/lib/utils';
import { EcranChargement } from './ecran-chargement';

/**
 * Pages « focus » (onboarding, assistants de création, choix du héros) :
 * plein écran, sans barre latérale, pour garder l'attention sur une tâche.
 */
export function CadreFocus({ children }: { children: ReactNode }) {
  const profil = useProfilRequis();
  if (!profil) return <EcranChargement />;
  return <div className="min-h-dvh bg-background">{children}</div>;
}

/** En-tête d'une page focus : logo, contenu central (progression), bouton de sortie. */
export function EnTeteFocus({
  centre,
  quitter,
  libelleQuitter = 'Quitter',
  className,
}: {
  centre?: ReactNode;
  /** Lien de sortie (ou action). */
  quitter?: { href: string } | { onClick: () => void };
  libelleQuitter?: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/60 bg-background/95 px-4 sm:px-6',
        className,
      )}
    >
      <Link href="/accueil" className="flex shrink-0 items-center gap-2.5" aria-label="Accueil">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-strong via-primary to-primary/60 shadow-glow">
          <svg
            viewBox="0 0 24 24"
            className="size-[18px] text-primary-foreground"
            fill="none"
            aria-hidden
          >
            <path
              d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4L12 2.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="hidden font-logo text-base tracking-[0.18em] sm:inline">YNER</span>
      </Link>
      <div className="flex min-w-0 flex-1 justify-center">{centre}</div>
      {quitter ? (
        'href' in quitter ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={quitter.href}>
              <X />
              <span className="hidden sm:inline">{libelleQuitter}</span>
            </Link>
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={quitter.onClick}>
            <X />
            <span className="hidden sm:inline">{libelleQuitter}</span>
          </Button>
        )
      ) : (
        <span className="w-20" />
      )}
    </header>
  );
}

/** Progression par étapes (segments), avec le nom de l'étape courante. */
export function ProgressionEtapes({
  etapes,
  courante,
  onAller,
}: {
  etapes: { id: string; nom: string; faite?: boolean }[];
  courante: number;
  /** Rend les étapes déjà atteintes cliquables. */
  onAller?: (i: number) => void;
}) {
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
              aria-label={`Étape ${i + 1} : ${e.nom}`}
              aria-current={i === courante ? 'step' : undefined}
              className="group h-4 flex-1 py-1.5 disabled:cursor-default"
            >
              <span
                className={cn(
                  'block h-1 w-full rounded-full transition-colors duration-300',
                  i < courante || (e.faite && i !== courante)
                    ? 'bg-primary/70 group-enabled:group-hover:bg-primary'
                    : i === courante
                      ? 'bg-primary'
                      : 'bg-surface-3',
                )}
              />
            </button>
          );
        })}
      </div>
      <p className="text-xs text-subtle">
        Étape {courante + 1} sur {etapes.length} ·{' '}
        <span className="text-muted-foreground">{etapes[courante]?.nom}</span>
      </p>
    </div>
  );
}
