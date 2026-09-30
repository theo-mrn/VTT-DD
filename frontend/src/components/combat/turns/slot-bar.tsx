'use client';

/**
 * Créneaux du round (mode `slots`, Star Wars ; docs/combat.md § 4.3, § 12.3) : la suite J/E
 * du round, le créneau courant surligné (un clic sur un autre créneau y donne le tour), puis
 * « Qui agit ? » : les participants du camp du créneau, coche sur ceux qui ont déjà agi ;
 * désigner l'un d'eux, ou le faire rejouer (`force`, comme l'ancienne app le permettait).
 */
import type { CombatState } from '@vtt/contracts';
import { Check, RotateCcw, UserCheck } from 'lucide-react';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SIDE_LABELS, slotBar, slotCandidates } from './model';
import type { CastMember } from './use-cast';

export function SlotBar({
  combat,
  busy,
  onSlot,
}: {
  combat: CombatState;
  busy: boolean;
  onSlot(index: number): void;
}) {
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
              c.current
                ? 'border-primary bg-primary text-primary-foreground shadow-surface'
                : c.past
                  ? 'border-border bg-surface text-subtle'
                  : c.side === 'players'
                    ? 'border-info/40 bg-info/10 text-info hover:bg-info/20'
                    : c.side === 'enemies'
                      ? 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20'
                      : 'border-success/40 bg-success/10 text-success hover:bg-success/20',
            )}
          >
            {label.short}
          </button>
        );
      })}
    </div>
  );
}

export function SlotActorPicker({
  combat,
  cast,
  busy,
  onChoose,
}: {
  combat: CombatState;
  cast: ReadonlyMap<string, CastMember>;
  busy: boolean;
  onChoose(characterId: string, force: boolean): void;
}) {
  const candidates = slotCandidates(combat);
  const side = combat.slots?.[combat.currentIndex]?.side;
  if (!side) return null;
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        Qui agit pour les {SIDE_LABELS[side].name.toLowerCase()} ?
      </p>
      {candidates.length === 0 ? (
        <p className="text-[13px] text-subtle">Personne de ce camp ne peut agir.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {candidates.map((c) => {
            const m = cast.get(c.characterId);
            const name = m?.name ?? 'Personnage';
            return (
              <li key={c.characterId}>
                <Button
                  variant={c.actor ? 'default' : 'secondary'}
                  size="sm"
                  disabled={busy || c.actor}
                  onClick={() => onChoose(c.characterId, c.acted)}
                  aria-pressed={c.actor}
                  title={c.acted ? `${name} a déjà agi ce round : le faire rejouer` : undefined}
                  className="h-9 gap-2 pl-1.5"
                >
                  <Illustration
                    src={m?.portraitUrl ?? null}
                    graine={name}
                    position="top"
                    className="size-6 rounded-full"
                  />
                  <span className={cn('max-w-32 truncate', c.acted && !c.actor && 'text-subtle')}>
                    {name}
                  </span>
                  {c.actor ? (
                    <UserCheck aria-label="Agit maintenant" />
                  ) : c.acted ? (
                    <>
                      <Check className="text-success" aria-label="A déjà agi" />
                      <RotateCcw aria-hidden />
                      <span className="sr-only">Rejouer</span>
                    </>
                  ) : null}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
