'use client';

/**
 * Bandeau d'initiative en haut de la table (docs/combat.md § 12.6), pour toute la table
 * pendant un combat : round, portraits dans l'ordre (vue expurgée : un adversaire caché n'y
 * est pas), tour courant surligné ; « À vous ! » et « Terminer mon tour » quand c'est le tour
 * d'un personnage que j'incarne ; en créneaux, la suite J/E et « Je prends ce créneau » ;
 * « Lancer mon initiative » quand elle m'est demandée. Les spectateurs n'ont pas de boutons ;
 * le MJ ouvre le panneau Combat d'un clic.
 *
 * Rien ici n'est calculé au-delà de ce que le serveur envoie : noms et portraits viennent de la
 * liste des personnages de la campagne, déjà filtrée pour moi (« Adversaire » sinon).
 */
import { useQuery } from '@tanstack/react-query';
import type { CombatState } from '@vtt/contracts';
import { ChevronRight, Dices, Hand, HelpCircle, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { PanelLink } from '@/components/table/panels/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { campagnes, clePersonnagesCampagne } from '@/lib/campagnes';
import { combatFailure, useCombatCommands } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import {
  SIDE_LABELS,
  currentActorOf,
  hiddenTurn,
  myPendingInitiatives,
  myTurn,
  slotBar,
  turnRows,
} from '../turns/model';

const VERRE =
  'rounded-2xl border border-border-strong bg-popover/75 shadow-elevated backdrop-blur-xl';

/** Au-delà, les portraits suivants sont résumés (« +4 »). */
const MAX_PORTRAITS = 12;

export function InitiativeStrip({
  campaignId,
  combat,
  mine,
  role,
}: {
  campaignId: string;
  combat: CombatState;
  /** Personnages que j'incarne. */
  mine: ReadonlySet<string>;
  role: 'gm' | 'player' | 'spectator';
}) {
  const commands = useCombatCommands(campaignId);
  const list = useQuery({
    queryKey: clePersonnagesCampagne(campaignId),
    queryFn: () => campagnes.personnages(campaignId),
  });
  const known = useMemo(
    () =>
      new Map(
        (list.data ?? []).map((c) => [c.characterId, { name: c.name, portrait: c.avatarUrl }]),
      ),
    [list.data],
  );
  const nameOf = (id: string) => known.get(id)?.name ?? 'Adversaire';
  const [busy, setBusy] = useState<string | null>(null);

  const rows = turnRows(combat);
  const actor = currentActorOf(combat);
  const slots = slotBar(combat);
  const acting = role === 'player' ? myTurn(combat, mine) : null;
  const toRoll = role === 'player' ? myPendingInitiatives(combat, mine) : [];

  const run = async (key: string, label: string, work: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await work();
    } catch (err) {
      {
        const message = combatFailure(err);
        if (message) toast.error(label, { description: message });
      }
    } finally {
      setBusy(null);
    }
  };

  const shown = rows.slice(0, MAX_PORTRAITS);
  const portraits = (
    <ol className="flex items-center gap-1" aria-label="Ordre du tour">
      {shown.map((r) => {
        const name = nameOf(r.characterId);
        const me = mine.has(r.characterId);
        return (
          <li
            key={r.characterId}
            aria-current={r.current ? 'step' : undefined}
            title={`${name}${r.current ? ' : son tour' : r.acted ? ' : a agi' : ''}`}
            className="relative shrink-0"
          >
            <Illustration
              src={known.get(r.characterId)?.portrait ?? null}
              graine={name}
              position="top"
              className={cn(
                'rounded-full ring-2 transition-[width,height,opacity] duration-200',
                r.current ? 'size-9 ring-primary' : 'size-7 ring-border',
                me && !r.current && 'ring-info/70',
                r.acted && !r.current && 'opacity-45',
                r.defeated && 'grayscale',
              )}
            />
            <span className="sr-only">
              {name}
              {r.current ? ', son tour' : ''}
              {me ? ', mon personnage' : ''}
            </span>
          </li>
        );
      })}
      {rows.length > MAX_PORTRAITS && (
        <li className="px-1 text-[11px] text-subtle">+{rows.length - MAX_PORTRAITS}</li>
      )}
      {hiddenTurn(combat) && (
        <li
          aria-current="step"
          title="Tour d’un adversaire"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-3 text-muted-foreground ring-2 ring-primary"
        >
          <HelpCircle className="size-4" aria-hidden />
          <span className="sr-only">Tour d’un adversaire</span>
        </li>
      )}
    </ol>
  );

  const headline = hiddenTurn(combat)
    ? 'Tour d’un adversaire'
    : combat.mode === 'slots'
      ? actor
        ? nameOf(actor)
        : `Créneau des ${SIDE_LABELS[combat.slots?.[combat.currentIndex]?.side ?? 'players'].name.toLowerCase()}`
      : actor
        ? nameOf(actor)
        : combat.initiativeRolled
          ? 'En attente'
          : 'Initiative';

  return (
    <section
      aria-label={`Combat, round ${combat.round}`}
      className={cn(
        VERRE,
        'pointer-events-auto flex max-w-full items-center gap-2 overflow-hidden p-1 pr-1.5',
        acting?.kind === 'act' && 'border-primary/60',
      )}
    >
      <span className="flex shrink-0 flex-col items-center rounded-xl bg-primary/10 px-2 py-0.5 text-primary">
        <span className="text-[9px] font-medium uppercase leading-tight tracking-wide">Round</span>
        <span className="font-display text-base font-bold leading-none tabular-nums">
          {combat.round}
        </span>
      </span>

      {slots.length > 0 && (
        <span className="hidden shrink-0 items-center gap-0.5 sm:flex" aria-label="Créneaux">
          {slots.map((s) => (
            <span
              key={s.index}
              aria-current={s.current ? 'step' : undefined}
              className={cn(
                'grid size-5 place-items-center rounded-md font-mono text-[10px] font-semibold',
                s.current
                  ? 'bg-primary text-primary-foreground'
                  : s.past
                    ? 'text-subtle'
                    : 'bg-surface-3 text-muted-foreground',
              )}
            >
              {SIDE_LABELS[s.side].short}
            </span>
          ))}
        </span>
      )}

      <div className="min-w-0 overflow-x-auto py-0.5 [scrollbar-width:none]">{portraits}</div>

      <span className="hidden min-w-0 max-w-40 truncate text-[13px] font-medium md:block">
        {acting?.kind === 'act' ? <span className="text-primary-strong">À vous !</span> : headline}
      </span>

      {role === 'player' && toRoll.length > 0 && (
        <Button
          size="xs"
          onClick={() =>
            void run('init', 'L’initiative n’a pas pu être lancée', async () => {
              for (const id of toRoll)
                await commands.rollParticipantInitiative(id, { dice: 'server' });
            })
          }
          loading={busy === 'init'}
          disabled={busy !== null}
        >
          <Dices />
          Lancer mon initiative
        </Button>
      )}

      {acting?.kind === 'act' && (
        <Button
          size="xs"
          onClick={() =>
            void run('next', 'Le tour n’a pas pu passer', () =>
              commands.next({ characterId: acting.characterId, version: combat.version }),
            )
          }
          loading={busy === 'next'}
          disabled={busy !== null}
        >
          Terminer mon tour
          <ChevronRight />
        </Button>
      )}

      {acting?.kind === 'slot' &&
        (acting.candidates.length === 1 ? (
          <Button
            size="xs"
            onClick={() =>
              void run('slot', 'Le créneau n’a pas pu être pris', () =>
                commands.chooseSlotActor({ characterId: acting.candidates[0]! }),
              )
            }
            loading={busy === 'slot'}
            disabled={busy !== null}
          >
            <Hand />
            Je prends ce créneau
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="xs" disabled={busy !== null}>
                <Hand />
                Prendre ce créneau
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {acting.candidates.map((id) => (
                <DropdownMenuItem
                  key={id}
                  onSelect={() =>
                    void run('slot', 'Le créneau n’a pas pu être pris', () =>
                      commands.chooseSlotActor({ characterId: id }),
                    )
                  }
                >
                  {nameOf(id)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}

      {role === 'gm' && (
        <Button variant="ghost" size="icon-xs" asChild>
          <PanelLink panel="combat" aria-label="Ouvrir le panneau Combat">
            <Swords />
          </PanelLink>
        </Button>
      )}
    </section>
  );
}
