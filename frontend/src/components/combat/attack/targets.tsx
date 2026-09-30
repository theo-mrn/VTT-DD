'use client';

/**
 * Cibles de l'attaque (docs/combat.md § 12.1, 4) : puces (portrait, nom tel que je le
 * connais), visée sur la carte (un clic sur un token l'ajoute ou le retire, ⇧ : plusieurs,
 * Échap termine), et liste des participants puis des autres personnages connus. Une cible que
 * la liste de la campagne ne me donne pas reste « Adversaire » : rien n'est lu de sa fiche.
 */
import { ChevronDown, Crosshair, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { targetGroups, type RosterCharacter } from '@/lib/combat/roster';
import { targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import type { AttackContext } from './use-attack-context';

export function TargetsSection({
  ctx,
  attackerId,
  targetIds,
  max,
  aiming,
  canAim,
  onToggle,
  onRemove,
  onAim,
  disabled,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  targetIds: readonly string[];
  max: number;
  aiming: boolean;
  /** Une carte est affichée : la visée y est possible. */
  canAim: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAim: (on: boolean) => void;
  disabled?: boolean;
}) {
  const [listOpen, setListOpen] = useState(!canAim);
  const groups = targetGroups(ctx.roster, ctx.combat);

  return (
    <section aria-label="Cibles" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
          Cibles{' '}
          <span className="font-mono normal-case tracking-normal">
            {targetIds.length}
            {targetIds.length > 1 || max < 50 ? ` / ${max}` : ''}
          </span>
        </p>
        {canAim && (
          <Button
            type="button"
            size="xs"
            variant={aiming ? 'default' : 'secondary'}
            aria-pressed={aiming}
            disabled={disabled}
            onClick={() => onAim(!aiming)}
          >
            <Crosshair />
            {aiming ? 'Visée en cours' : 'Viser sur la carte'}
          </Button>
        )}
      </div>

      {aiming && (
        <p className="text-[12px] text-muted-foreground" aria-live="polite">
          Cliquez un personnage sur la carte pour l’ajouter ou le retirer ; <Kbd>⇧</Kbd> pour en
          prendre plusieurs, <Kbd>Échap</Kbd> pour finir.
        </p>
      )}

      {targetIds.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {targetIds.map((id) => {
            const c = ctx.known.get(id);
            const name = targetName(id, ctx.known);
            return (
              <li
                key={id}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-1 text-[13px]',
                  id === attackerId
                    ? 'border-warning/40 bg-warning/10'
                    : 'border-destructive/35 bg-destructive/10',
                )}
              >
                <Illustration
                  src={c?.portraitUrl}
                  graine={name}
                  className="size-6 shrink-0 rounded-full"
                />
                <span className="max-w-[9rem] truncate">{name}</span>
                {id === attackerId && <span className="text-[11px] text-warning">(lui-même)</span>}
                <button
                  type="button"
                  aria-label={`Retirer ${name} des cibles`}
                  disabled={disabled}
                  onClick={() => onRemove(id)}
                  className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {canAim
            ? 'Aucune cible : visez sur la carte, ou choisissez dans la liste.'
            : 'Aucune cible : choisissez dans la liste.'}
        </p>
      )}

      <div className="rounded-xl border border-border">
        <button
          type="button"
          aria-expanded={listOpen}
          onClick={() => setListOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        >
          <Users className="size-4" aria-hidden />
          <span className="flex-1">Choisir dans la liste</span>
          <ChevronDown
            className={cn('size-4 transition-transform', listOpen && 'rotate-180')}
            aria-hidden
          />
        </button>
        {listOpen && (
          <div className="max-h-56 space-y-2 overflow-y-auto border-t border-border px-2 py-2 [scrollbar-width:thin]">
            {groups.participants.length > 0 && (
              <TargetList
                title="Participants du combat"
                list={groups.participants}
                ctx={ctx}
                selected={targetIds}
                attackerId={attackerId}
                full={targetIds.length >= max}
                onToggle={onToggle}
                disabled={disabled}
              />
            )}
            {groups.others.length > 0 && (
              <TargetList
                title={groups.participants.length ? 'Autres personnages' : null}
                list={groups.others}
                ctx={ctx}
                selected={targetIds}
                attackerId={attackerId}
                full={targetIds.length >= max}
                onToggle={onToggle}
                disabled={disabled}
              />
            )}
            {!groups.participants.length && !groups.others.length && (
              <p className="px-1 py-1 text-[13px] text-muted-foreground">
                Aucun personnage connu dans la campagne.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TargetList({
  title,
  list,
  ctx,
  selected,
  attackerId,
  full,
  onToggle,
  disabled,
}: {
  title: string | null;
  list: readonly RosterCharacter[];
  ctx: AttackContext;
  selected: readonly string[];
  attackerId: string | null;
  full: boolean;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      {title && (
        <p className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">
          {title}
        </p>
      )}
      <ul className="space-y-0.5">
        {list.map((c) => {
          const on = selected.includes(c.id);
          const name = targetName(c.id, ctx.known);
          const participant = ctx.combat?.order.find((p) => p.characterId === c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled || (!on && full)}
                onClick={() => onToggle(c.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
                  on ? 'bg-destructive/10 text-foreground' : 'hover:bg-surface-2',
                  participant?.defeated && 'opacity-60',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded border',
                    on ? 'border-destructive bg-destructive' : 'border-border-strong',
                  )}
                >
                  {on && <Crosshair className="size-3 text-destructive-foreground" />}
                </span>
                <Illustration
                  src={c.portraitUrl}
                  graine={name}
                  className="size-6 shrink-0 rounded-full"
                />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                {c.id === attackerId && <span className="text-[11px] text-subtle">attaquant</span>}
                {participant?.defeated && (
                  <span className="text-[11px] text-subtle">hors de combat</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
