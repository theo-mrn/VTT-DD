'use client';

/**
 * Onglet « Tours » du panneau Combat (docs/combat.md § 4.3, § 12.3) : hors combat, démarrer
 * un combat ; en combat, round et tour courant, Précédent et Suivant, initiative, créneaux
 * (Star Wars), ordre du tour, ajout et retrait de participants, fiche de chaque participant,
 * réglages et fin du combat. Le serveur tient l'ordre et le tour : chaque bouton appelle sa
 * route, la réponse remplace l'état affiché.
 */
import type { CombatState, CombatTurnResponse } from '@vtt/contracts';
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  Flag,
  MoreHorizontal,
  Settings2,
  Swords,
  UserPlus,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import type { DetailCampagne } from '@/lib/campagnes';
import { openAttackMenu } from '@/lib/combat/attack-menu-store';
import { combatErrorMessage } from '@/lib/combat/api';
import { useCombatCommands } from '@/lib/combat/use-combat';
import {
  AddParticipantsDialog,
  EndCombatDialog,
  InitiativeDialog,
  SettingsDialog,
} from './combat-dialogs';
import { initiativeAction } from './initiative-form';
import { currentActorOf, currentSlotOf, reorder, turnHeadline } from './model';
import { OrderHint, OrderList, type OrderActions } from './order-list';
import { ParticipantDrawer } from './participant-drawer';
import { SlotActorPicker, SlotBar } from './slot-bar';
import { StartCombatForm } from './start-combat';
import { useCast, useParticipantSheets } from './use-cast';

export function TurnsPanel({
  campagne,
  combat,
  loading,
  pendingReports,
}: {
  campagne: DetailCampagne;
  combat: CombatState | null;
  loading: boolean;
  pendingReports: number;
}) {
  const cast = useCast(campagne.id);
  const { systeme } = useParticipantSheets(campagne.id, campagne.system, []);

  if (!combat)
    return (
      <div className="space-y-4">
        <header className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border-strong bg-surface-2 text-primary">
            <Swords className="size-5" aria-hidden />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold">Démarrer un combat</h3>
            <p className="text-[13px] text-muted-foreground">
              Les personnages de la scène sont présélectionnés ; cochez qui se bat.
            </p>
          </div>
        </header>
        <StartCombatForm
          campaignId={campagne.id}
          systeme={systeme}
          members={cast.members}
          loading={loading || cast.isLoading}
        />
      </div>
    );

  return (
    <ActiveCombat campagne={campagne} combat={combat} cast={cast} pendingReports={pendingReports} />
  );
}

type Dialogs = 'initiative' | 'add' | 'end' | 'settings' | null;

/** Durées décomptées ou rendues par un passage de tour, annoncées au MJ. */
function announceDurations(r: CombatTurnResponse, nameOf: (id: string) => string) {
  const expired = (r.durationUpdates ?? []).filter((u) => u.expired.length);
  if (expired.length)
    toast.info(
      `Durées : ${expired.map((u) => `${nameOf(u.characterId)} (${u.expired.length})`).join(', ')}`,
    );
  if (r.durationFailures?.length)
    toast.warning('Certaines fiches n’ont pas répondu pendant le décompte des durées', {
      description: r.durationFailures.map(nameOf).join(', '),
    });
}

function ActiveCombat({
  campagne,
  combat,
  cast,
  pendingReports,
}: {
  campagne: DetailCampagne;
  combat: CombatState;
  cast: ReturnType<typeof useCast>;
  pendingReports: number;
}) {
  const campaignId = campagne.id;
  const commands = useCombatCommands(campaignId);
  const ids = useMemo(() => combat.order.map((p) => p.characterId), [combat.order]);
  const { sheets, systeme } = useParticipantSheets(campaignId, campagne.system, ids);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const playerOf = new Map(
    campagne.members.filter((m) => m.characterId).map((m) => [m.characterId!, m.name]),
  );

  const run = async <T,>(key: string, label: string, work: () => Promise<T>) => {
    setBusy(key);
    try {
      return await work();
    } catch (err) {
      toast.error(label, { description: combatErrorMessage(err) });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const next = async () => {
    const r = await run('next', 'Le tour n’a pas pu passer', () =>
      commands.next({ version: combat.version }),
    );
    if (r) announceDurations(r, cast.nameOf);
  };
  const previous = async () => {
    const r = await run('previous', 'Le retour arrière n’a pas pu se faire', () =>
      commands.previous({ version: combat.version }),
    );
    if (r) announceDurations(r, cast.nameOf);
  };

  const slot = currentSlotOf(combat);
  const attackWith = (attackerId: string) =>
    openAttackMenu({ campaignId, origin: 'turns', attackerId });
  const actions: OrderActions = {
    open: setDrawer,
    attackWith,
    giveTurn: (id) => {
      const p = combat.order.find((x) => x.characterId === id);
      // Créneaux : donner la main à un participant du camp du créneau, sinon au créneau
      if (slot && p) {
        if (p.side === slot.side)
          return void run('turn', 'Le tour n’a pas pu être donné', () =>
            commands.chooseSlotActor({ characterId: id, force: p.hasActed }),
          );
        const index = (combat.slots ?? []).findIndex((s, i) => i > slot.index && s.side === p.side);
        const target =
          index >= 0 ? index : (combat.slots ?? []).findIndex((s) => s.side === p.side);
        if (target < 0) return;
        return void run('turn', 'Le tour n’a pas pu être donné', () =>
          commands.setTurn({ slotIndex: target, version: combat.version }),
        );
      }
      void run('turn', 'Le tour n’a pas pu être donné', () =>
        commands.setTurn({ characterId: id, version: combat.version }),
      );
    },
    reroll: (id) => {
      // Une relance reprend les paramètres de la précédente (compétence choisie…)
      const params = combat.order.find((p) => p.characterId === id)?.initiative?.params;
      void run('reroll', 'L’initiative n’a pas pu être lancée', () =>
        commands.rollParticipantInitiative(id, {
          ...(params && Object.keys(params).length ? { params } : {}),
          dice: 'server',
        }),
      );
    },
    setHidden: (id, hidden) =>
      void run('hidden', 'La visibilité n’a pas pu changer', () =>
        commands.updateParticipant(id, { visibleToPlayers: !hidden }),
      ),
    setDefeated: (id, defeated) =>
      void run('defeated', 'L’état n’a pas pu changer', () =>
        commands.updateParticipant(id, { defeated }),
      ),
    move: (id, to) =>
      void run('order', 'L’ordre n’a pas pu changer', () =>
        commands.reorder({ order: reorder(ids, id, to), version: combat.version }),
      ),
    remove: (id) =>
      void run('remove', 'Le participant n’a pas pu être retiré', () =>
        commands.removeParticipant(id),
      ),
  };

  const headline = turnHeadline(combat, cast.nameOf);
  const actor = currentActorOf(combat);
  const hasInitiative = Boolean(initiativeAction(systeme));

  return (
    <div className="space-y-4">
      <section
        aria-label="Tour en cours"
        className="rounded-2xl border border-border bg-card p-3 shadow-surface"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <span className="text-[10px] font-medium uppercase leading-none tracking-wide">
              Round
            </span>
            <span className="font-display text-xl font-bold leading-none tabular-nums">
              {combat.round}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" aria-live="polite">
              {headline}
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge>{combat.mode === 'slots' ? 'Créneaux par camp' : 'Individuel'}</Badge>
              {combat.turn !== undefined && <span>Passage {combat.turn}</span>}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Plus d’actions du combat">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem disabled={!hasInitiative} onSelect={() => setDialog('initiative')}>
                <Dices />
                Initiative de tous…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('add')}>
                <UserPlus />
                Ajouter des participants…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('settings')}>
                <Settings2 />
                Réglages du combat…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setDialog('end')}
              >
                <Flag />
                Terminer le combat…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-3 grid grid-cols-[auto_auto_1fr] gap-2">
          <Info texte="Annule le dernier passage de tour (durées rendues)">
            <Button
              variant="secondary"
              onClick={() => void previous()}
              loading={busy === 'previous'}
              disabled={busy !== null || combat.canGoBack === false}
            >
              <ChevronLeft />
              Précédent
            </Button>
          </Info>
          <Info
            texte={
              actor ? `Attaquer avec ${cast.nameOf(actor)}` : 'Personne n’agit pour ce créneau'
            }
          >
            <Button
              variant="secondary"
              disabled={!actor}
              onClick={() => actor && attackWith(actor)}
              aria-label={actor ? `Attaquer avec ${cast.nameOf(actor)}` : 'Attaquer'}
            >
              <Swords />
              Attaquer
            </Button>
          </Info>
          <Button
            onClick={() => void next()}
            loading={busy === 'next'}
            disabled={busy !== null || !combat.order.length}
          >
            Suivant
            <ChevronRight />
          </Button>
        </div>
      </section>

      {!combat.initiativeRolled && hasInitiative && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5">
          <Dices className="size-4 shrink-0 text-warning" aria-hidden />
          <p className="flex-1 text-[13px]">L’initiative n’a pas encore été lancée.</p>
          <Button size="sm" onClick={() => setDialog('initiative')}>
            Lancer l’initiative
          </Button>
        </div>
      )}

      {combat.mode === 'slots' && (
        <section aria-label="Créneaux" className="space-y-2">
          <SlotBar
            combat={combat}
            busy={busy !== null}
            onSlot={(slotIndex) =>
              void run('turn', 'Le tour n’a pas pu être donné', () =>
                commands.setTurn({ slotIndex, version: combat.version }),
              )
            }
          />
          <SlotActorPicker
            combat={combat}
            cast={cast.byId}
            busy={busy !== null}
            onChoose={(characterId, force) =>
              void run('slot', 'Ce participant ne peut pas agir maintenant', () =>
                commands.chooseSlotActor({ characterId, ...(force ? { force: true } : {}) }),
              )
            }
          />
        </section>
      )}

      <section aria-label="Ordre du tour" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            Ordre <span className="font-normal text-subtle">({combat.order.length})</span>
          </h3>
          <OrderHint />
        </div>
        <OrderList
          combat={combat}
          cast={cast.byId}
          sheets={sheets}
          busy={busy !== null}
          actions={actions}
        />
        <Button variant="secondary" size="sm" onClick={() => setDialog('add')}>
          <UserPlus />
          Ajouter
        </Button>
      </section>

      <InitiativeDialog
        open={dialog === 'initiative'}
        onOpenChange={(o) => setDialog(o ? 'initiative' : null)}
        campaignId={campaignId}
        combat={combat}
        systeme={systeme}
      />
      <AddParticipantsDialog
        open={dialog === 'add'}
        onOpenChange={(o) => setDialog(o ? 'add' : null)}
        campaignId={campaignId}
        combat={combat}
        members={cast.members}
      />
      <EndCombatDialog
        open={dialog === 'end'}
        onOpenChange={(o) => setDialog(o ? 'end' : null)}
        campaignId={campaignId}
        combat={combat}
        pendingReports={pendingReports}
      />
      <SettingsDialog
        open={dialog === 'settings'}
        onOpenChange={(o) => setDialog(o ? 'settings' : null)}
        campaignId={campaignId}
        combat={combat}
      />
      <ParticipantDrawer
        campaignId={campaignId}
        combat={combat}
        characterId={drawer}
        member={drawer ? (cast.byId.get(drawer) ?? null) : null}
        playerName={drawer ? (playerOf.get(drawer) ?? null) : null}
        onClose={() => setDrawer(null)}
      />
    </div>
  );
}
