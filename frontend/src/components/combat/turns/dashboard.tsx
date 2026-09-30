'use client';

/**
 * Panneau Combat du MJ (docs/combat.md § 12.3, § 12.4) : l'ancien tableau de bord, en une seule
 * vue, sans onglets. En-tête (round et tour, initiative par camp, Précédent, Suivant, menu ⋯) ;
 * colonne de gauche « Ordre du tour » (créneaux en mode slots) ; colonne de droite : cartes
 * « Consulté », « Cibles (n) », « Personnage actif », puis « Rapports d'attaque » sur tout
 * l'espace restant. Panneau étroit ou mobile : carte active, rapports, ordre, empilés.
 *
 * Hors combat, la même vue : l'ordre montre les personnages de la scène (écarter, cacher,
 * surpris) et « Lancer l'initiative » démarre le combat en un clic. Le serveur tient l'ordre,
 * le tour et les rapports : chaque bouton appelle sa route, la réponse remplace l'état.
 */
import {
  DEFAULT_COMBAT_SETTINGS,
  type ActionParams,
  type CampaignSide,
  type CombatMode,
  type CombatSettings,
  type CombatState,
  type CombatTurnResponse,
} from '@vtt/contracts';
import { ChevronLeft, Eye, IdCard, ListOrdered, Swords, Target, UserPlus } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { toast } from 'sonner';
import { usePanelVisible } from '@/components/table/panels/navigation';
import { Button } from '@/components/ui/button';
import type { DetailCampagne } from '@/lib/campagnes';
import { openAttackMenu, useAttackHost } from '@/lib/combat/attack-menu-store';
import {
  combatFailure,
  currentActorId,
  useCombat,
  useCombatCommands,
} from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { BulkReview } from '../reports/bulk-review';
import { DecisionDrawer } from '../reports/decision-drawer';
import { DefeatedDialog } from '../reports/defeated-dialog';
import { isPending } from '../reports/model';
import { ReportsSection } from '../reports/report-list';
import { DEFAULT_REPORT_VIEW, useReports, type ReportView } from '../reports/use-reports';
import { CharacterDialog, type DialogOrigin } from './character-dialog';
import { CombatHeader, type HeaderMenuAction, type SideChoice } from './combat-header';
import {
  AddParticipantsDialog,
  EndCombatDialog,
  InitiativeDialog,
  SettingsDialog,
} from './combat-dialogs';
import { HeroesTab } from './heroes';
import { initiativeAction, sideChoiceParam } from './initiative-form';
import {
  SIDE_LABELS,
  SIDES,
  currentSlotOf,
  reorder,
  slotCandidates,
  startCandidates,
  turnHeadline,
} from './model';
import { OrderHint, OrderList, type OrderActions } from './order-list';
import {
  pruneChoices,
  setupRows,
  setupSummary,
  sideParamsBody,
  sideParamsFromCombat,
  startCombatBody,
  withChoice,
  type SetupChoices,
} from './setup';
import { SetupList } from './setup-list';
import { combatShortcutOf, TYPING_SELECTOR, type CombatShortcut } from './shortcuts';
import {
  ActiveCard,
  Appear,
  ConsultedCard,
  NoActorCard,
  SetupCard,
  SlotPickCard,
  TargetsCard,
  TargetsDialog,
} from './side-cards';
import { SlotBar } from './slot-bar';
import { ShortcutsDialog, StartSettingsDialog, MODE_LABELS } from './start-combat';
import { useCombatLayout } from './use-combat-layout';
import {
  combatPresentation,
  systemInitiativeMode,
  useCast,
  useParticipantSheets,
} from './use-cast';
import { useSceneTokens } from './use-scene-tokens';

type Dialogs = 'initiative' | 'add' | 'end' | 'settings' | 'shortcuts' | null;

type Origin = 'active' | 'consulted' | 'target' | 'row';

const ORIGINS: Record<Exclude<Origin, 'row'>, DialogOrigin> = {
  active: { label: 'Personnage actif', icon: Swords, tone: 'primary' },
  consulted: { label: 'Consulté', icon: Eye, tone: 'info' },
  target: { label: 'Cible', icon: Target, tone: 'danger' },
};
const ROW_ORIGIN: DialogOrigin = { label: 'Fiche de combat', icon: IdCard, tone: 'info' };

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

/** Raccourcis du panneau, quand il est affiché et que le focus y est (ou nulle part). */
function usePanelShortcuts(
  enabled: boolean,
  rootRef: RefObject<HTMLElement | null>,
  handlers: Record<CombatShortcut, () => void>,
) {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const shortcut = combatShortcutOf(e);
      if (!shortcut) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const panel = rootRef.current?.closest('[data-table-panel]') ?? rootRef.current;
      const inPanel = Boolean(target && panel?.contains(target));
      const nowhere = !target || target === document.body;
      if (!inPanel && !nowhere) return;
      if (target?.closest(TYPING_SELECTOR)) return;
      e.preventDefault();
      latest.current[shortcut]();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, rootRef]);
}

export function CombatDashboard({ campagne }: { campagne: DetailCampagne }) {
  const campaignId = campagne.id;
  const { combat, isLoading } = useCombat(campaignId);
  const cast = useCast(campaignId);
  const commands = useCombatCommands(campaignId);
  const canAttack = useAttackHost(campaignId);
  const visible = usePanelVisible();
  const [rootRef, layout] = useCombatLayout<HTMLDivElement>();
  const split = layout.mode === 'split';
  const [view, setView] = useState<'combat' | 'heroes'>('combat');
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [consulted, setConsulted] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ id: string; origin: Origin; back?: boolean } | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);

  // ─── Rapports ──────────────────────────────────────────────────────────────
  const [reportView, setReportView] = useState<ReportView>(DEFAULT_REPORT_VIEW);
  const reports = useReports(campaignId, combat, reportView);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const decidingAttack = deciding ? reports.find(deciding) : null;

  // ─── Hors combat : la scène ────────────────────────────────────────────────
  const { engine, tokens } = useSceneTokens(campaignId);
  // Les tokens bougent à chaque pas : seuls les personnages posés et leur visibilité comptent
  const sceneKey = tokens.map((t) => `${t.characterId}:${t.visibility}`).join('|');
  const candidates = useMemo(
    () =>
      startCandidates(
        cast.members.map((m) => ({ characterId: m.id, side: m.side, inCreation: m.inCreation })),
        tokens,
      ),
    // `sceneKey` résume `tokens`
    [cast.members, sceneKey],
  );
  const [choices, setChoices] = useState<SetupChoices>({});
  useEffect(() => setChoices((c) => pruneChoices(c, candidates)), [candidates]);
  const rows = setupRows(candidates, choices);
  const summary = setupSummary(rows);
  const [startMode, setStartMode] = useState<CombatMode | null>(null);
  const [startSettings, setStartSettings] = useState<CombatSettings>(DEFAULT_COMBAT_SETTINGS);
  const [startSettingsOpen, setStartSettingsOpen] = useState(false);

  // ─── Fiches ────────────────────────────────────────────────────────────────
  const actor = currentActorId(combat);
  const sheetIds = useMemo(() => {
    const base = combat
      ? combat.order.map((p) => p.characterId)
      : rows.filter((r) => r.onScene || r.checked).map((r) => r.characterId);
    return [...new Set([...base, ...(consulted ? [consulted] : []), ...reports.pendingTargets])];
    // `rows` se déduit de `candidates` et `choices` ; les cibles, de leur liste
  }, [combat, candidates, choices, consulted, reports.pendingTargets.join('|')]);
  const { sheets, systeme, presentation } = useParticipantSheets(
    campaignId,
    campagne.system,
    sheetIds,
  );
  const playerOf = new Map(
    campagne.members.filter((m) => m.characterId).map((m) => [m.characterId!, m.name]),
  );

  // ─── Initiative par camp (compétence d'un système à créneaux) ──────────────
  const action = initiativeAction(systeme);
  const hasInitiative = Boolean(action);
  const choiceParam = sideChoiceParam(action);
  const [sideParams, setSideParams] = useState<Partial<Record<CampaignSide, ActionParams>> | null>(
    null,
  );
  const currentSideParams =
    sideParams ?? sideParamsFromCombat(combat, choiceParam ? [choiceParam.id] : []);
  const presentSides = combat
    ? SIDES.filter((s) => combat.order.some((p) => p.side === s))
    : summary.sides;
  const sideChoice: SideChoice | null =
    choiceParam && presentSides.length
      ? {
          param: choiceParam,
          sides: presentSides,
          value: currentSideParams,
          onChange: (side, value) => {
            const base = { ...currentSideParams };
            const params = { ...(base[side] ?? {}) };
            if (value) params[choiceParam.id] = value;
            else delete params[choiceParam.id];
            setSideParams({ ...base, [side]: params });
          },
        }
      : null;

  // ─── Commandes ─────────────────────────────────────────────────────────────
  const run = async <T,>(key: string, label: string, work: () => Promise<T>) => {
    setBusy(key);
    try {
      return await work();
    } catch (err) {
      const message = combatFailure(err);
      if (message) toast.error(label, { description: message });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const next = async () => {
    if (!combat || busy) return;
    const r = await run('next', 'Le tour n’a pas pu passer', () =>
      commands.next({ version: combat.version }),
    );
    if (r) announceDurations(r, cast.nameOf);
  };
  const previous = async () => {
    if (!combat || busy || combat.canGoBack === false) return;
    const r = await run('previous', 'Le retour arrière n’a pas pu se faire', () =>
      commands.previous({ version: combat.version }),
    );
    if (r) announceDurations(r, cast.nameOf);
  };
  const rollInitiative = async () => {
    if (!combat) return;
    if (combat.initiativeRolled) return setDialog('initiative');
    const paramsBySide = sideParamsBody(currentSideParams);
    const r = await run('initiative', 'L’initiative n’a pas pu être lancée', () =>
      commands.rollInitiative(paramsBySide ? { paramsBySide } : {}),
    );
    if (r) toast.success('Initiative lancée');
  };
  const start = async (roll: boolean) => {
    const body = startCombatBody(rows, {
      rollInitiative: roll && hasInitiative,
      mode: startMode,
      settings: startSettings,
      sideParams: currentSideParams,
    });
    if (!body) return;
    const r = await run(`start:${roll}`, 'Le combat n’a pas pu commencer', () =>
      commands.start(body),
    );
    if (r) {
      toast.success('Le combat commence !');
      setChoices({});
    }
  };
  const attackWith = (attackerId: string) =>
    openAttackMenu({ campaignId, origin: 'turns', attackerId });

  const slot = combat ? currentSlotOf(combat) : null;
  const giveTurn = (id: string) => {
    if (!combat) return;
    const p = combat.order.find((x) => x.characterId === id);
    // Créneaux : donner la main à un participant du camp du créneau, sinon au créneau suivant
    // de son camp
    if (slot && p) {
      if (p.side === slot.side)
        return void run('turn', 'Le tour n’a pas pu être donné', () =>
          commands.chooseSlotActor({ characterId: id, force: p.hasActed }),
        );
      const slots = combat.slots ?? [];
      const after = slots.findIndex((s, i) => i > slot.index && s.side === p.side);
      const target = after >= 0 ? after : slots.findIndex((s) => s.side === p.side);
      if (target < 0) return;
      return void run('turn', 'Le tour n’a pas pu être donné', () =>
        commands.setTurn({ slotIndex: target, version: combat.version }),
      );
    }
    void run('turn', 'Le tour n’a pas pu être donné', () =>
      commands.setTurn({ characterId: id, version: combat.version }),
    );
  };

  /** Clic sur une ligne : la carte « Consulté » à droite ; la fiche en vue empilée. */
  const consult = (id: string) => {
    if (!split) return setDetail({ id, origin: id === actor ? 'active' : 'row' });
    setConsulted((c) => (c === id ? null : id));
  };

  const orderActions: OrderActions = {
    consult,
    open: (id) => setDetail({ id, origin: id === actor ? 'active' : 'row' }),
    attackWith,
    giveTurn,
    reroll: (id) => {
      if (!combat) return;
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
    setSurprised: (id, surprised) =>
      void run('surprised', 'La surprise n’a pas pu changer', () =>
        commands.updateParticipant(id, { surprised }),
      ),
    setDefeated: (id, defeated) =>
      void run('defeated', 'L’état n’a pas pu changer', () =>
        commands.updateParticipant(id, { defeated }),
      ),
    move: (id, to) => {
      if (!combat) return;
      const ids = combat.order.map((p) => p.characterId);
      void run('order', 'L’ordre n’a pas pu changer', () =>
        commands.reorder({ order: reorder(ids, id, to), version: combat.version }),
      );
    },
    remove: (id) =>
      void run('remove', 'Le participant n’a pas pu être retiré', () =>
        commands.removeParticipant(id),
      ),
  };

  usePanelShortcuts(visible && view === 'combat', rootRef, {
    next: () => void next(),
    previous: () => void previous(),
    attack: () => {
      if (actor && canAttack) attackWith(actor);
    },
    applyAll: () => {
      if (reports.reviewCount) setReviewing(true);
    },
  });

  const onMenu = (a: HeaderMenuAction) => {
    if (a === 'heroes') return setView('heroes');
    if (a === 'settings' && !combat) return setStartSettingsOpen(true);
    setDialog(a);
  };

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  const headline = combat
    ? turnHeadline(combat, cast.nameOf)
    : isLoading
      ? 'Chargement du combat…'
      : 'Hors combat';
  const detailLine = combat
    ? [
        slot ? `Créneau ${slot.index + 1}/${combat.slots?.length ?? 0}` : MODE_LABELS[combat.mode],
        `${combat.order.length} participant${combat.order.length > 1 ? 's' : ''}`,
        combat.turn !== undefined ? `passage ${combat.turn}` : null,
        !combat.initiativeRolled && hasInitiative ? 'initiative à lancer' : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : summary.chosen
      ? `${summary.chosen} prêt${summary.chosen > 1 ? 's' : ''} à combattre · ${summary.sides
          .map((s) => `${summary.bySide[s]} ${SIDE_LABELS[s].name.toLowerCase()}`)
          .join(', ')}`
      : 'Cochez qui se bat dans l’ordre du tour';

  const header = (
    <CombatHeader
      combat={combat}
      headline={headline}
      detail={detailLine}
      compact={layout.compactHeader}
      busy={busy}
      hasInitiative={hasInitiative}
      sideChoice={sideChoice}
      systeme={systeme}
      readyCount={summary.chosen}
      pendingReports={reports.reviewCount}
      onPrevious={() => void previous()}
      onNext={() => void next()}
      onInitiative={() => void rollInitiative()}
      onStart={(roll) => void start(roll)}
      onMenu={onMenu}
    />
  );

  const activeParticipant =
    combat && actor ? combat.order.find((p) => p.characterId === actor) : null;
  const slotSide = slot?.side ?? null;
  const cards = (
    <div className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {split && consulted && consulted !== actor && (
          <Appear key={`consulted:${consulted}`} id={consulted}>
            <ConsultedCard
              member={cast.byId.get(consulted) ?? null}
              sheet={sheets.get(consulted) ?? null}
              participant={combat?.order.find((p) => p.characterId === consulted) ?? null}
              onOpen={() => setDetail({ id: consulted, origin: 'consulted' })}
              onClose={() => setConsulted(null)}
            />
          </Appear>
        )}
        {reports.pendingTargets.length > 0 && (
          <Appear key="targets" id="targets">
            <TargetsCard
              ids={reports.pendingTargets}
              cast={cast.byId}
              onOpen={() =>
                reports.pendingTargets.length === 1
                  ? setDetail({ id: reports.pendingTargets[0]!, origin: 'target' })
                  : setTargetsOpen(true)
              }
            />
          </Appear>
        )}
      </AnimatePresence>
      {combat ? (
        activeParticipant ? (
          <ActiveCard
            member={cast.byId.get(activeParticipant.characterId) ?? null}
            sheet={sheets.get(activeParticipant.characterId) ?? null}
            participant={activeParticipant}
            large={!split}
            canAttack={canAttack}
            onOpen={() => setDetail({ id: activeParticipant.characterId, origin: 'active' })}
            onAttack={() => attackWith(activeParticipant.characterId)}
          />
        ) : slotSide ? (
          <SlotPickCard
            side={slotSide}
            candidates={slotCandidates(combat)}
            cast={cast.byId}
            busy={busy !== null}
            onChoose={(characterId, force) =>
              void run('slot', 'Ce participant ne peut pas agir maintenant', () =>
                commands.chooseSlotActor({ characterId, ...(force ? { force: true } : {}) }),
              )
            }
          />
        ) : (
          <NoActorCard
            text={
              combat.initiativeRolled || !hasInitiative
                ? 'Personne n’agit : donnez le tour depuis l’ordre.'
                : 'Initiative à lancer : l’ordre suivra le résultat.'
            }
          />
        )
      ) : (
        !isLoading && <SetupCard summary={summary} />
      )}
    </div>
  );

  const reportsSection = (
    <ReportsSection
      campaignId={campaignId}
      combat={combat}
      data={reports}
      view={reportView}
      onView={setReportView}
      systeme={systeme}
      presentation={presentation}
      cast={cast.byId}
      columns={layout.reportColumns}
      fill={split}
      onDecide={setDeciding}
      onReview={() => setReviewing(true)}
      onOpenCharacter={(id) => setDetail({ id, origin: id === actor ? 'active' : 'row' })}
    />
  );

  const order = (
    <OrderPanel
      combat={combat}
      fill={split}
      busy={busy}
      onSlot={(slotIndex) =>
        combat &&
        void run('turn', 'Le tour n’a pas pu être donné', () =>
          commands.setTurn({ slotIndex, version: combat.version }),
        )
      }
      onAdd={() => setDialog('add')}
    >
      {combat ? (
        <OrderList
          combat={combat}
          cast={cast.byId}
          sheets={sheets}
          busy={busy !== null}
          consulted={split ? consulted : null}
          canAttack={canAttack}
          actions={orderActions}
        />
      ) : (
        <SetupList
          rows={rows}
          cast={cast.byId}
          sheets={sheets}
          loading={isLoading || cast.isLoading}
          onMap={Boolean(engine)}
          consulted={split ? consulted : null}
          onChange={(row, patch) => setChoices((c) => withChoice(c, row, patch))}
          onConsult={consult}
          onAll={(on) =>
            setChoices((c) =>
              rows.reduce((acc, r) => withChoice(acc, r, { checked: on }), { ...c }),
            )
          }
        />
      )}
    </OrderPanel>
  );

  const detailOrigin: DialogOrigin = detail
    ? detail.origin === 'row'
      ? ROW_ORIGIN
      : ORIGINS[detail.origin]
    : ROW_ORIGIN;

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef}>
        {view === 'heroes' ? (
          <div className="px-4 pb-6 pt-3 sm:px-5">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-3"
              onClick={() => setView('combat')}
            >
              <ChevronLeft />
              Retour au combat
            </Button>
            <HeroesTab campagne={campagne} />
          </div>
        ) : split ? (
          <div className="flex h-[calc(100dvh-3.5rem-var(--table-dock-h,0px))] flex-col">
            {header}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(17rem,5fr)_minmax(0,7fr)] gap-3 p-3">
              {order}
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain [&>section]:min-h-[18rem]">
                {cards}
                {reportsSection}
              </div>
            </div>
          </div>
        ) : (
          <div className="pb-6">
            <div className="sticky top-14 z-20">{header}</div>
            <div className="space-y-3 p-3">
              {cards}
              {reportsSection}
              {order}
            </div>
          </div>
        )}
      </div>

      {combat ? (
        <>
          <InitiativeDialog
            open={dialog === 'initiative'}
            onOpenChange={(o) => setDialog(o ? 'initiative' : null)}
            campaignId={campaignId}
            combat={combat}
            systeme={systeme}
            initial={currentSideParams}
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
            pendingReports={reports.toReview.filter(isPending).length}
          />
          <SettingsDialog
            open={dialog === 'settings'}
            onOpenChange={(o) => setDialog(o ? 'settings' : null)}
            campaignId={campaignId}
            combat={combat}
          />
        </>
      ) : (
        <StartSettingsDialog
          open={startSettingsOpen}
          onOpenChange={setStartSettingsOpen}
          systemMode={systemInitiativeMode(systeme)}
          mode={startMode}
          onMode={setStartMode}
          settings={startSettings}
          onSettings={setStartSettings}
        />
      )}
      <ShortcutsDialog
        open={dialog === 'shortcuts'}
        onOpenChange={(o) => setDialog(o ? 'shortcuts' : null)}
      />
      <CharacterDialog
        campaignId={campaignId}
        combat={combat}
        characterId={detail?.id ?? null}
        member={detail ? (cast.byId.get(detail.id) ?? null) : null}
        playerName={detail ? (playerOf.get(detail.id) ?? null) : null}
        origin={detailOrigin}
        actions={{ attackWith, giveTurn }}
        canAttack={canAttack}
        onBack={
          detail?.back
            ? () => {
                setDetail(null);
                setTargetsOpen(true);
              }
            : undefined
        }
        onClose={() => setDetail(null)}
      />
      <TargetsDialog
        open={targetsOpen}
        onOpenChange={setTargetsOpen}
        ids={reports.pendingTargets}
        cast={cast.byId}
        sheets={sheets}
        onPick={(id) => {
          setTargetsOpen(false);
          setDetail({ id, origin: 'target', back: true });
        }}
      />
      <DecisionDrawer
        campaignId={campaignId}
        attack={decidingAttack && isPending(decidingAttack) ? decidingAttack : null}
        systeme={systeme}
        cast={cast.byId}
        stateSorts={combatPresentation(presentation).stateSorts}
        onClose={() => setDeciding(null)}
      />
      <BulkReview
        open={reviewing}
        onOpenChange={setReviewing}
        campaignId={campaignId}
        attacks={reports.toReview}
        systeme={systeme}
        cast={cast.byId}
      />
      {/* Personnages tombés après une application : un seul dialogue pour tous */}
      <DefeatedDialog campagne={campagne} combat={combat} />
    </MotionConfig>
  );
}

/** Colonne « Ordre du tour » : titre, créneaux (mode slots), liste, « Ajouter ». */
function OrderPanel({
  combat,
  fill,
  busy,
  onSlot,
  onAdd,
  children,
}: {
  combat: CombatState | null;
  fill: boolean;
  busy: string | null;
  onSlot(index: number): void;
  onAdd(): void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Ordre du tour"
      className={cn(
        'flex flex-col rounded-2xl border border-border bg-card/60 shadow-surface',
        fill && 'min-h-0',
      )}
    >
      <header className="space-y-2 border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ListOrdered className="size-4 text-primary" aria-hidden />
            Ordre du tour
            {combat && (
              <span className="rounded-full bg-surface-3 px-1.5 py-px text-[11px] font-medium text-muted-foreground">
                {combat.order.length}
              </span>
            )}
          </h3>
          <span className="flex-1" />
          {combat ? <OrderHint /> : <span className="text-[11px] text-subtle">Préparation</span>}
        </div>
        {combat?.mode === 'slots' && (
          <SlotBar combat={combat} busy={busy !== null} onSlot={onSlot} />
        )}
      </header>
      {/* `layoutScroll` : les lignes qui changent de place s'animent juste, liste défilée */}
      <motion.div
        layoutScroll
        className={cn('p-2', fill && 'min-h-0 flex-1 overflow-y-auto overscroll-contain')}
      >
        {children}
      </motion.div>
      {combat && (
        <footer className="border-t border-border p-2">
          <Button variant="ghost" size="sm" className="w-full" onClick={onAdd}>
            <UserPlus />
            Ajouter des participants
          </Button>
        </footer>
      )}
    </section>
  );
}
