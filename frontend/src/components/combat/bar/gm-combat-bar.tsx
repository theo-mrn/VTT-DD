'use client';

/**
 * Barre de combat du MJ (docs/combat.md § 12.6) : tout ce que faisait le panneau Combat, depuis
 * la barre. Hors combat, « Combat » ouvre la préparation (`start-dialog.tsx`). En combat, la
 * barre des tours (`InitiativeStrip`) : un portrait ouvre sa fiche de combat
 * (`CharacterDialog`) ; le menu ⋯ ajoute des participants, relance l'initiative (par camp),
 * règle, montre les rapports et leurs cibles, termine le combat. Les rapports en direct restent
 * dessous (`live-reports/`).
 */
import type { CombatState } from '@vtt/contracts';
import {
  Crosshair,
  Dices,
  Flag,
  IdCard,
  MoreHorizontal,
  ScrollText,
  Settings2,
  Swords,
  Target,
  UserPlus,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { openAttackMenu, useAttackHost } from '@/lib/combat/attack-menu-store';
import { currentActorId } from '@/lib/combat/use-combat';
import { cn } from '@/lib/utils';
import { ReportsToggle } from '../live-reports/live-reports';
import { GLASS, TOUCH } from '../live-reports/look';
import type { LiveReports } from '../live-reports/use-live-reports';
import { InitiativeStrip } from '../player/initiative-strip';
import { isPending, pendingTargetIds } from '../reports/model';
import { CharacterDialog, type DialogOrigin } from '../turns/character-dialog';
import {
  AddParticipantsDialog,
  EndCombatDialog,
  InitiativeDialog,
  SettingsDialog,
} from '../turns/combat-dialogs';
import { initiativeAction, sideChoiceParam } from '../turns/initiative-form';
import { sideParamsFromCombat } from '../turns/setup';
import { TargetsDialog } from '../turns/side-cards';
import { useCast, useParticipantSheets } from '../turns/use-cast';
import { ReportsDialog } from './reports-dialog';
import { StartCombatDialog } from './start-dialog';
import { useTurnActions } from './use-turn-actions';

type BarDialog = 'start' | 'add' | 'initiative' | 'settings' | 'end' | 'reports' | 'targets';

/** Fenêtres qui n'ont de sens qu'en combat : refermées quand le combat change. */
const IN_COMBAT: readonly BarDialog[] = ['add', 'initiative', 'settings', 'end'];

const ORIGINS = {
  sheet: { label: 'Fiche de combat', icon: IdCard, tone: 'info' },
  active: { label: 'Personnage actif', icon: Swords, tone: 'primary' },
  target: { label: 'Cible', icon: Target, tone: 'danger' },
} satisfies Record<string, DialogOrigin>;

export function GmCombatBar({
  campagne,
  combat,
  live,
}: {
  campagne: DetailCampagne;
  combat: CombatState | null;
  live: LiveReports;
}) {
  const campaignId = campagne.id;
  const cast = useCast(campaignId);
  const canAttack = useAttackHost(campaignId);
  const turns = useTurnActions(campaignId, combat);
  const [dialog, setDialog] = useState<BarDialog | null>(null);
  const [detail, setDetail] = useState<{ id: string; target?: boolean } | null>(null);
  const systeme = live.systeme;

  // Un autre écran termine ou démarre le combat : ses fenêtres se referment
  const combatId = combat?.id ?? null;
  useEffect(() => setDialog((d) => (d && IN_COMBAT.includes(d) ? null : d)), [combatId]);

  const toReview = useMemo(() => live.items.map((i) => i.attack).filter(isPending), [live.items]);
  const targets = useMemo(() => pendingTargetIds(toReview), [toReview]);
  const actor = currentActorId(combat);
  const action = initiativeAction(systeme);
  const choiceParam = sideChoiceParam(action);
  const playerOf = useMemo(
    () =>
      new Map(campagne.members.filter((m) => m.characterId).map((m) => [m.characterId!, m.name])),
    [campagne.members],
  );

  const attackWith = (id: string) =>
    openAttackMenu({ campaignId, origin: 'turns', attackerId: id });
  const open = (id: string) => setDetail({ id });

  const menu = (
    <BarMenu
      inCombat={combat !== null}
      hasInitiative={action !== null}
      targets={targets.length}
      onPick={setDialog}
    />
  );
  const reports = <ReportsToggle live={live} />;

  const origin: DialogOrigin = detail?.target
    ? ORIGINS.target
    : detail && detail.id === actor
      ? ORIGINS.active
      : ORIGINS.sheet;

  return (
    <>
      {combat ? (
        <InitiativeStrip
          campaignId={campaignId}
          combat={combat}
          reports={reports}
          menu={menu}
          onFace={open}
        />
      ) : (
        <OffCombatBar onStart={() => setDialog('start')} reports={reports} menu={menu} />
      )}

      {combat ? (
        <>
          <InitiativeDialog
            open={dialog === 'initiative'}
            onOpenChange={(o) => setDialog(o ? 'initiative' : null)}
            campaignId={campaignId}
            combat={combat}
            systeme={systeme}
            initial={sideParamsFromCombat(combat, choiceParam ? [choiceParam.id] : [])}
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
            pendingReports={toReview.length}
          />
          <SettingsDialog
            open={dialog === 'settings'}
            onOpenChange={(o) => setDialog(o ? 'settings' : null)}
            campaignId={campaignId}
            combat={combat}
          />
        </>
      ) : (
        <StartCombatDialog
          open={dialog === 'start'}
          onOpenChange={(o) => setDialog(o ? 'start' : null)}
          campagne={campagne}
          onConsult={open}
        />
      )}
      <ReportsDialog
        open={dialog === 'reports'}
        onOpenChange={(o) => setDialog(o ? 'reports' : null)}
        combat={combat}
        live={live}
        onOpenCharacter={open}
      />
      <TargetsHost
        open={dialog === 'targets'}
        onOpenChange={(o) => setDialog(o ? 'targets' : null)}
        campagne={campagne}
        ids={targets}
        onPick={(id) => setDetail({ id, target: true })}
      />
      <CharacterDialog
        campaignId={campaignId}
        combat={combat}
        characterId={detail?.id ?? null}
        member={detail ? (cast.byId.get(detail.id) ?? null) : null}
        playerName={detail ? (playerOf.get(detail.id) ?? null) : null}
        origin={origin}
        actions={{
          attackWith,
          giveTurn: turns.giveTurn,
          ...(actor
            ? {
                aimAt: {
                  actorId: actor,
                  actorName: cast.nameOf(actor),
                  run: (targetId: string) =>
                    openAttackMenu({
                      campaignId,
                      origin: 'turns',
                      attackerId: actor,
                      targetIds: [targetId],
                    }),
                },
              }
            : {}),
        }}
        canAttack={canAttack}
        onClose={() => setDetail(null)}
      />
    </>
  );
}

/** Hors combat : la même barre, réduite à « Combat », aux rapports et au menu. */
function OffCombatBar({
  onStart,
  reports,
  menu,
}: {
  onStart(): void;
  reports: ReactNode;
  menu: ReactNode;
}) {
  return (
    <section
      aria-label="Combat"
      className={cn(GLASS, 'pointer-events-auto flex items-center gap-1 rounded-[20px] p-1.5')}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onStart}
        className={cn(
          'h-10 rounded-[14px] px-3.5 text-xs font-bold uppercase tracking-wide',
          TOUCH,
        )}
      >
        <Swords />
        Combat
      </Button>
      {reports}
      {menu}
    </section>
  );
}

/** Menu ⋯ au bout de la barre. */
function BarMenu({
  inCombat,
  hasInitiative,
  targets,
  onPick,
}: {
  inCombat: boolean;
  hasInitiative: boolean;
  targets: number;
  onPick(dialog: BarDialog): void;
}) {
  return (
    <DropdownMenu>
      <Info texte="Plus" cote="bottom">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn('size-10 rounded-[14px]', TOUCH)}
            aria-label="Plus d’actions du combat"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
      </Info>
      <DropdownMenuContent align="end" className="w-60">
        {inCombat && (
          <>
            <DropdownMenuItem onSelect={() => onPick('add')}>
              <UserPlus />
              Ajouter des participants…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasInitiative} onSelect={() => onPick('initiative')}>
              <Dices />
              Initiative…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onPick('settings')}>
              <Settings2 />
              Réglages du combat…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => onPick('reports')}>
          <ScrollText />
          Rapports d’attaque…
        </DropdownMenuItem>
        {targets > 0 && (
          <DropdownMenuItem onSelect={() => onPick('targets')}>
            <Crosshair />
            Cibles ({targets})…
          </DropdownMenuItem>
        )}
        {inCombat && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onPick('end')}
            >
              <Flag />
              Terminer le combat…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Cibles des rapports en attente ; leurs fiches ne se lisent qu'à l'ouverture. */
function TargetsHost({
  open,
  onOpenChange,
  campagne,
  ids,
  onPick,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  campagne: DetailCampagne;
  ids: readonly string[];
  onPick(characterId: string): void;
}) {
  const cast = useCast(campagne.id);
  const { sheets } = useParticipantSheets(campagne.id, campagne.system, open ? ids : []);
  return (
    <TargetsDialog
      open={open}
      onOpenChange={onOpenChange}
      ids={ids}
      cast={cast.byId}
      sheets={sheets}
      onPick={(id) => {
        onOpenChange(false);
        onPick(id);
      }}
    />
  );
}
