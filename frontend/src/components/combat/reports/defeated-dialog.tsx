'use client';

/**
 * « Hors de combat » (docs/combat.md § 4.5, § 7.4) : les personnages tombés après une
 * application sont réunis dans un seul dialogue (pas un par personnage). Pour chacun :
 * Garder (grisé, reste dans l'ordre : boss à seconde phase), Retirer du combat, ou Supprimer
 * le PNJ (instance et token, route de la carte ; le combat le retire de lui-même).
 *
 * Sources : les réponses des applications du panneau, et `combat.participant_defeated`
 * (réservé au MJ) pour une application faite ailleurs.
 */
import type { CombatState } from '@vtt/contracts';
import { Skull } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { Illustration } from '@/components/commun/illustration';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DetailCampagne } from '@/lib/campagnes';
import { combatErrorMessage } from '@/lib/combat/api';
import { useCombatCommands } from '@/lib/combat/use-combat';
import { messageErreur } from '@/lib/api';
import { deleteNpcsCommand } from '@/lib/map/modules/tokens/commands';
import { tokensStateOf } from '@/lib/map/modules/tokens/state';
import { useCampaignEvents } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useCast, type CastMember } from '../turns/use-cast';
import { tokensOf, useSceneTokens } from '../turns/use-scene-tokens';

// ─── File des personnages tombés ─────────────────────────────────────────────

interface DefeatedQueue {
  ids: readonly string[];
}

const queue = createStore<DefeatedQueue>()(() => ({ ids: [] }));

/**
 * Personnages déjà traités, et quand : l'événement du bus arrive souvent juste après la
 * réponse de l'application ; il ne rouvre pas le dialogue pour la même chute.
 */
const handled = new Map<string, number>();
const HANDLED_MS = 30_000;

/** Signale des personnages hors de combat (réponse d'une application, événement). */
export function reportDefeated(ids: readonly string[]) {
  const now = Date.now();
  const fresh = ids.filter((id) => now - (handled.get(id) ?? 0) > HANDLED_MS);
  if (!fresh.length) return;
  queue.setState((s) => ({ ids: [...new Set([...s.ids, ...fresh])] }));
}

function clearDefeated() {
  const now = Date.now();
  for (const id of queue.getState().ids) handled.set(id, now);
  queue.setState({ ids: [] });
}

// ─── Un seul dialogue monté à la fois ────────────────────────────────────────

/**
 * Le dialogue est monté par le panneau Combat et par la pile du bandeau (panneau jamais
 * ouvert) : seul le premier monté s'affiche, les autres se taisent.
 */
const hosts = createStore<{ ids: readonly number[] }>()(() => ({ ids: [] }));
let nextHost = 0;

function useDefeatedHost(): boolean {
  const [id] = useState(() => ++nextHost);
  useEffect(() => {
    hosts.setState((s) => ({ ids: [...s.ids, id] }));
    return () => hosts.setState((s) => ({ ids: s.ids.filter((x) => x !== id) }));
  }, [id]);
  return useStore(hosts, (s) => s.ids[0] === id);
}

// ─── Dialogue ────────────────────────────────────────────────────────────────

type Choice = 'keep' | 'remove' | 'delete';

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'keep', label: 'Garder' },
  { value: 'remove', label: 'Retirer du combat' },
  { value: 'delete', label: 'Supprimer le PNJ' },
];

export function DefeatedDialog({
  campagne,
  combat,
}: Readonly<{
  campagne: DetailCampagne;
  combat: CombatState | null;
}>) {
  const ids = useStore(queue, (s) => s.ids);
  const host = useDefeatedHost();
  const cast = useCast(campagne.id);
  const { engine } = useSceneTokens(campagne.id);
  const commands = useCombatCommands(campagne.id);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);

  useCampaignEvents(campagne.id, ['combat.participant_defeated'], (e) => {
    const id = e.event.payload.characterId;
    if (typeof id === 'string') reportDefeated([id]);
  });

  const inCombat = new Set(combat?.order.map((p) => p.characterId) ?? []);
  const onMap = new Set(
    tokensOf(engine)
      .map((t) => t.characterId)
      .filter(Boolean),
  );
  const rows = ids.map((id) => {
    const m = cast.byId.get(id);
    const npc = m ? isNpc(m) : false;
    const canDelete = npc && onMap.has(id);
    const canRemove = inCombat.has(id);
    const fallback: Choice = canDelete ? 'delete' : 'keep';
    let choice = choices[id] ?? fallback;
    if ((choice === 'delete' && !canDelete) || (choice === 'remove' && !canRemove)) choice = 'keep';
    return { id, member: m, npc, canDelete, canRemove, choice };
  });

  // Un personnage retiré entre-temps (PNJ supprimé ailleurs) quitte la file
  useEffect(() => {
    setChoices((c) => Object.fromEntries(Object.entries(c).filter(([id]) => ids.includes(id))));
  }, [ids]);

  const confirm = async () => {
    setBusy(true);
    const failures: string[] = [];
    for (const r of rows) {
      try {
        if (r.choice === 'remove') await commands.removeParticipant(r.id);
        if (r.choice === 'delete' && engine) {
          const tokens = tokensStateOf(engine);
          const items = tokensOf(engine).filter((t) => t.characterId === r.id);
          if (tokens && items.length)
            await tokens.engine.execute(
              deleteNpcsCommand({
                label: `Supprimer ${r.member?.name ?? 'le PNJ'}`,
                api: tokens.api,
                items,
                sideOf: (id) => tokens.directory.get(id)?.side,
              }),
            );
        }
      } catch (err) {
        failures.push(
          `${r.member?.name ?? 'Personnage'} : ${
            r.choice === 'remove' ? combatErrorMessage(err) : messageErreur(err)
          }`,
        );
      }
    }
    setBusy(false);
    if (failures.length)
      toast.error('Certains choix n’ont pas pu être appliqués', {
        description: failures.join(' · '),
      });
    setChoices({});
    clearDefeated();
  };

  return (
    <Dialog
      open={host && ids.length > 0}
      onOpenChange={(open) => !open && !busy && clearDefeated()}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Skull className="size-5 text-destructive" aria-hidden />
            Hors de combat
          </DialogTitle>
          <DialogDescription>
            {ids.length > 1
              ? `${ids.length} personnages sont tombés. Que deviennent-ils ?`
              : 'Un personnage est tombé. Que devient-il ?'}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2">
          {rows.map((r) => {
            const name = r.member?.name ?? 'Personnage';
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2"
              >
                <Illustration
                  largeur={36}
                  src={r.member?.portraitUrl ?? null}
                  graine={name}
                  position="top"
                  className="size-9 rounded-full ring-1 ring-border grayscale"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
                <div
                  role="radiogroup"
                  aria-label={`Que devient ${name} ?`}
                  className="flex overflow-hidden rounded-lg border border-border-strong"
                >
                  {CHOICES.filter((c) => c.value !== 'delete' || r.npc).map((c) => {
                    const disabled =
                      (c.value === 'delete' && !r.canDelete) ||
                      (c.value === 'remove' && !r.canRemove);
                    return (
                      <button
                        key={c.value}
                        type="button"
                        role="radio"
                        aria-checked={r.choice === c.value}
                        disabled={disabled || busy}
                        title={
                          c.value === 'delete' && !r.canDelete
                            ? 'Son token n’est pas sur la scène affichée'
                            : undefined
                        }
                        onClick={() => setChoices((s) => ({ ...s, [r.id]: c.value }))}
                        className={cn(
                          'px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 disabled:opacity-40',
                          choiceTone(r.choice === c.value, c.value === 'delete'),
                        )}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={clearDefeated} disabled={busy}>
            Plus tard
          </Button>
          <Button onClick={() => void confirm()} loading={busy}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Teinte d'un choix : retenu (suppression ou non) ou non retenu. */
function choiceTone(selected: boolean, destructive: boolean): string {
  if (!selected) return 'text-muted-foreground hover:bg-surface-3';
  return destructive ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary-strong';
}

/** PNJ : selon sa nature quand on la connaît, sinon selon son camp. */
function isNpc(m: CastMember): boolean {
  return m.kind ? m.kind === 'npc' : m.side !== 'players';
}
