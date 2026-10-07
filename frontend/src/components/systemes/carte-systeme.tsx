'use client';

import { useTranslations } from 'next-intl';
import { Check, Dices, Library, ListChecks } from 'lucide-react';
import { Illustration } from '@/components/commun/illustration';
import { Skeleton } from '@/components/ui/skeleton';
import type { ResumeSysteme } from '@/lib/systemes';
import { cn } from '@/lib/utils';

/** Première phrase d'une description (cartes compactes). */
export function premierePhrase(texte: string, max = 140): string {
  const phrase = /^.+?[.!?](\s|$)/.exec(texte.trim())?.[0]?.trim() ?? texte.trim();
  return phrase.length > max ? `${phrase.slice(0, max - 1).trimEnd()}…` : phrase;
}

/** Carte d'un système de jeu : illustration, nom, résumé, repères (catalogue, création, dés). */
export function CarteSysteme({
  systeme,
  choisie,
  onChoisir,
  multiple = false,
  compacte = false,
}: Readonly<{
  systeme: ResumeSysteme;
  choisie: boolean;
  onChoisir: () => void;
  multiple?: boolean;
  compacte?: boolean;
}>) {
  const t = useTranslations('campaigns.systemCard');
  const etapes = systeme.creation[0]?.etapes.length ?? 0;
  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={choisie}
      onClick={onChoisir}
      className={cn(
        'group relative flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        choisie
          ? 'border-primary/60 shadow-glow'
          : 'border-border shadow-surface hover:-translate-y-0.5 hover:border-border-strong',
      )}
    >
      <Illustration
        largeur={640}
        src={systeme.couverture}
        graine={systeme.id}
        initiale={systeme.nom.charAt(0)}
        className={cn(compacte ? 'h-24' : 'h-32')}
        classeImage="transition-transform duration-500 group-hover:scale-105"
        voile
      >
        {systeme.accent && (
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-0.5"
            style={{ background: systeme.accent }}
          />
        )}
        <span
          aria-hidden
          className={cn(
            'absolute right-3 top-3 flex size-6 items-center justify-center border transition-all',
            multiple ? 'rounded-md' : 'rounded-full',
            choisie
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-white/25 bg-black/50 text-transparent',
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <span className="absolute bottom-3 left-4 right-4 text-[17px] font-semibold leading-tight text-white">
          {systeme.nom}
        </span>
      </Illustration>
      <span
        className={cn('flex flex-1 flex-col gap-3 bg-card p-4', choisie && 'bg-primary/[0.05]')}
      >
        {!compacte && (
          <span className="text-[13px] leading-relaxed text-muted-foreground">
            {premierePhrase(systeme.description)}
          </span>
        )}
        <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-subtle">
          <span className="flex items-center gap-1">
            <Library className="size-3" />
            {t('entries', { count: systeme.entrees })}
          </span>
          {etapes > 0 && (
            <span className="flex items-center gap-1">
              <ListChecks className="size-3" />
              {t('steps', { count: etapes })}
            </span>
          )}
          {systeme.desSymboles && (
            <span className="flex items-center gap-1">
              <Dices className="size-3" />
              {t('symbolDice')}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function CarteSystemeSquelette() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <Skeleton className="h-32 rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
