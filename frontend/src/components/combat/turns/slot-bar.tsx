'use client';

/**
 * Créneaux du round (mode `slots`, Star Wars ; docs/combat.md § 4.3, § 12.3) : la suite J/E
 * du round, le créneau courant surligné ; un clic sur un autre créneau y donne le tour.
 * « Qui agit ? » (désigner, faire rejouer avec `force`) est la carte du personnage actif
 * (`SlotPickCard`, `side-cards.tsx`) tant que le créneau n'a pas d'acteur.
 */
import type { CombatState } from '@vtt/contracts';
import { cn } from '@/lib/utils';
import { SIDE_LABELS, slotBar } from './model';

export function SlotBar({
  combat,
  busy,
  onSlot,
}: Readonly<{
  combat: CombatState;
  busy: boolean;
  onSlot(index: number): void;
}>) {
  const cells = slotBar(combat);
  if (!cells.length) return null;
  return (
    <div
      role="group"
      aria-label={`Créneaux du round ${combat.round}`}
      className="flex flex-wrap items-center gap-1"
    >
      {cells.map((c) => {
        const label = SIDE_LABELS[c.side];
        return (
          <button
            key={c.index}
            type="button"
            disabled={busy || c.current}
            onClick={() => onSlot(c.index)}
            aria-current={c.current ? 'step' : undefined}
            aria-label={`Créneau ${c.index + 1} : ${label.name}${c.current ? ' (en cours)' : ''}`}
            title={`Créneau ${c.index + 1} : ${label.name}`}
            className={cn(
              'grid size-8 place-items-center rounded-lg border font-mono text-xs font-semibold transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              slotLook(c),
            )}
          >
            {label.short}
          </button>
        );
      })}
    </div>
  );
}

/** Créneau : en cours, passé, ou à venir dans la couleur de son camp. */
function slotLook(c: { current: boolean; past: boolean; side: string }): string {
  if (c.current) return 'border-primary bg-primary text-primary-foreground shadow-surface';
  if (c.past) return 'border-border bg-surface text-subtle';
  return SIDE_LOOK[c.side] ?? 'border-success/40 bg-success/10 text-success hover:bg-success/20';
}

const SIDE_LOOK: Partial<Record<string, string>> = {
  players: 'border-info/40 bg-info/10 text-info hover:bg-info/20',
  enemies: 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20',
};
