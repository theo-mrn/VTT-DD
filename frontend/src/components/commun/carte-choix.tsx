'use client';

import { Check, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte sélectionnable (choix unique ou multiple) : icône, titre, description,
 * coche. `multiple` : case à cocher, sinon bouton radio.
 */
export function CarteChoix({
  choisie,
  onChoisir,
  titre,
  description,
  icone: Icone,
  multiple = false,
  desactivee = false,
  badge,
  className,
  children,
}: {
  choisie: boolean;
  onChoisir: () => void;
  titre: ReactNode;
  description?: ReactNode;
  icone?: LucideIcon;
  multiple?: boolean;
  desactivee?: boolean;
  badge?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={choisie}
      disabled={desactivee}
      onClick={onChoisir}
      className={cn(
        'group relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-200 active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50',
        choisie
          ? 'border-primary/60 bg-primary/[0.07] shadow-glow'
          : 'border-border bg-card shadow-surface hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute right-3.5 top-3.5 flex size-5 items-center justify-center border transition-all',
          multiple ? 'rounded-md' : 'rounded-full',
          choisie
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border-strong bg-surface-2 text-transparent group-hover:border-subtle',
        )}
      >
        {/* Coché : la coche apparaît d'un léger rebond */}
        <Check
          className={cn('size-3', choisie && 'duration-200 ease-out animate-in zoom-in-50')}
          strokeWidth={3}
        />
      </span>
      {Icone && (
        <span
          className={cn(
            'flex size-10 items-center justify-center rounded-xl border transition-[color,background-color,border-color,transform] duration-200 group-hover:scale-105 group-active:scale-95',
            choisie
              ? 'border-primary/40 bg-primary/15 text-primary'
              : 'border-border-strong bg-surface-2 text-muted-foreground group-hover:text-foreground',
          )}
        >
          <Icone className="size-5" />
        </span>
      )}
      {children}
      <span className="min-w-0 pr-6">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-foreground">
          {titre}
          {badge}
        </span>
        {description && (
          <span className="mt-1 block text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
