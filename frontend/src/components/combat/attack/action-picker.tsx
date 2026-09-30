'use client';

/**
 * Choix de l'action (docs/combat.md § 12.1, 2) : toutes les actions à cible que l'attaquant
 * peut jouer (attaques, sorts, soins…), groupées comme la présentation du système le déclare,
 * avec la description de celle qui est choisie.
 */
import type { Action } from '@vtt/rules';
import { Crosshair } from 'lucide-react';
import type { ActionGroup } from '@/lib/combat/actions';
import { cn } from '@/lib/utils';

export function ActionPicker({
  groups,
  selected,
  onSelect,
  disabled,
}: {
  groups: readonly ActionGroup[];
  selected: string | null;
  onSelect: (action: Action) => void;
  disabled?: boolean;
}) {
  const current = groups.flatMap((g) => g.actions).find((a) => a.id === selected);
  if (!groups.length)
    return (
      <p className="rounded-xl border border-dashed border-border-strong px-3 py-3 text-[13px] text-muted-foreground">
        Ce personnage n’a aucune action à jouer contre une cible.
      </p>
    );
  return (
    <section aria-label="Action" className="space-y-3">
      {groups.map((g) => (
        <div key={g.id} className="space-y-1.5">
          {g.title && (
            <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
              {g.title}
            </p>
          )}
          <div
            role="radiogroup"
            aria-label={g.title ?? 'Actions'}
            className="flex flex-wrap gap-1.5"
          >
            {g.actions.map((a) => {
              const on = a.id === selected;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => onSelect(a)}
                  className={cn(
                    'flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                    on
                      ? 'border-primary/60 bg-primary/15 font-medium text-primary-strong'
                      : 'border-border-strong text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  {on && <Crosshair className="size-3.5 shrink-0" aria-hidden />}
                  {a.nom}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {current?.description && (
        <p className="max-h-24 overflow-y-auto whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground [scrollbar-width:thin]">
          {current.description}
        </p>
      )}
    </section>
  );
}
