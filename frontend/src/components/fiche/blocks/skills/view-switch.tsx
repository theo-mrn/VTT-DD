'use client';

/**
 * Sélecteur de vue compact (contrôle segmenté) de l'en-tête du bloc Compétences : onglets
 * ARIA, flèches gauche et droite, Début et Fin ; focus itinérant sur l'onglet choisi.
 */
import type { LucideIcon } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export interface ViewOption<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export function ViewSwitch<T extends string>({
  options,
  value,
  onChange,
  label,
  panelId,
  showLabels,
}: {
  options: ViewOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  panelId: string;
  /** Libellés visibles ; sinon icônes seules (libellé lu par les lecteurs d'écran). */
  showLabels: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const last = options.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (i + 1) % options.length
        : e.key === 'ArrowLeft'
          ? (i - 1 + options.length) % options.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(options[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
    >
      {options.map((o, i) => {
        const on = o.id === value;
        const Icon = o.icon;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${panelId}-tab-${o.id}`}
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            title={o.label}
            className={cn(
              'flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2 text-[12px] font-medium sm:h-6',
              'transition-colors duration-150 motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on
                ? 'bg-surface-3 text-foreground shadow-surface'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span className={cn(!showLabels && 'sr-only')}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
