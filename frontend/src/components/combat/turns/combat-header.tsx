'use client';

/**
 * En-tête du panneau Combat (docs/combat.md § 12.3) : round et tour (ou créneau), initiative
 * de tous (systèmes à créneaux : compétence des joueurs et des ennemis en deux listes, comme
 * l'ancienne app), Précédent, Suivant ; menu ⋯ : ajouter des participants, initiative
 * (options), réglages, héros de la table, raccourcis, terminer. Hors combat : « Lancer
 * l'initiative » (démarre et tire l'ordre en un clic) et « Démarrer sans initiative ».
 */
import type { ActionParams, CampaignSide, CombatState } from '@vtt/contracts';
import type { SystemeCharge } from '@vtt/rules';
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Dices,
  Flag,
  Keyboard,
  MoreHorizontal,
  Play,
  Settings2,
  SlidersHorizontal,
  UserPlus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { SelectField } from '@/components/ui/select';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { entryOptionsOf, type Parametre } from './initiative-form';
import { SIDE_LABELS } from './model';
import { COMBAT_SHORTCUTS } from './shortcuts';

export type HeaderMenuAction = 'add' | 'initiative' | 'settings' | 'heroes' | 'shortcuts' | 'end';

export interface SideChoice {
  /** Paramètre d'initiative à choisir par camp (compétence), lu dans l'action du système. */
  param: Parametre;
  sides: readonly CampaignSide[];
  value: Partial<Record<CampaignSide, ActionParams>>;
  onChange(side: CampaignSide, value: string): void;
}

function RoundBadge({ round }: { round: number | null }) {
  return (
    <span
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-xl border',
        round === null
          ? 'border-border-strong bg-surface-2 text-subtle'
          : 'border-primary/30 bg-primary/10 text-primary-strong',
      )}
      aria-label={round === null ? 'Hors combat' : `Round ${round}`}
    >
      <span className="text-[9px] font-semibold uppercase leading-none tracking-wider">Round</span>
      <span className="relative h-5 overflow-hidden font-display text-lg font-bold leading-5 tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={round ?? 'none'}
            className="block"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {round ?? '–'}
          </motion.span>
        </AnimatePresence>
      </span>
    </span>
  );
}

function Shortcut({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-2">
      {children}
      <Kbd>{label}</Kbd>
    </span>
  );
}

export function CombatHeader({
  combat,
  headline,
  detail,
  compact,
  busy,
  hasInitiative,
  sideChoice,
  systeme,
  readyCount,
  pendingReports,
  onPrevious,
  onNext,
  onInitiative,
  onStart,
  onMenu,
}: {
  combat: CombatState | null;
  /** « Tour de Lyra », « Créneau des Ennemis : Orc », « Hors combat ». */
  headline: string;
  /** Deuxième ligne : créneau n/N, passage, mode ; préparation hors combat. */
  detail: string;
  compact: boolean;
  busy: string | null;
  hasInitiative: boolean;
  sideChoice: SideChoice | null;
  systeme: SystemeCharge | null;
  /** Hors combat : participants cochés. */
  readyCount: number;
  pendingReports: number;
  onPrevious(): void;
  onNext(): void;
  /** En combat : initiative de tous (tout de suite si elle n'est pas tirée, sinon options). */
  onInitiative(): void;
  /** Hors combat : démarrer, avec ou sans initiative. */
  onStart(rollInitiative: boolean): void;
  onMenu(action: HeaderMenuAction): void;
}) {
  const inCombat = combat !== null;
  const rolled = combat?.initiativeRolled ?? false;

  return (
    <div className="space-y-2.5 border-b border-border bg-background/95 px-3 pb-3 pt-3 backdrop-blur sm:px-4">
      <div className="flex items-center gap-3">
        <RoundBadge round={combat ? combat.round : null} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight" aria-live="polite">
            {headline}
          </p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        {inCombat ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <Info
              texte={
                <Shortcut label={COMBAT_SHORTCUTS.previous.label}>
                  Annuler le dernier passage (durées rendues)
                </Shortcut>
              }
            >
              <Button
                variant="secondary"
                size={compact ? 'icon' : 'default'}
                onClick={onPrevious}
                loading={busy === 'previous'}
                disabled={busy !== null || combat.canGoBack === false}
                aria-label="Précédent"
                aria-keyshortcuts={COMBAT_SHORTCUTS.previous.aria}
              >
                <ChevronLeft />
                {!compact && 'Précédent'}
              </Button>
            </Info>
            <Info texte={<Shortcut label={COMBAT_SHORTCUTS.next.label}>Tour suivant</Shortcut>}>
              <Button
                size={compact ? 'icon' : 'default'}
                onClick={onNext}
                loading={busy === 'next'}
                disabled={busy !== null || !combat.order.length}
                aria-label="Suivant"
                aria-keyshortcuts={COMBAT_SHORTCUTS.next.aria}
              >
                {!compact && 'Suivant'}
                <ChevronRight />
              </Button>
            </Info>
          </div>
        ) : null}
        <HeaderMenu
          inCombat={inCombat}
          hasInitiative={hasInitiative}
          pendingReports={pendingReports}
          onMenu={onMenu}
        />
      </div>

      {/* Initiative déjà tirée et rien à choisir par camp : « Relancer » reste au menu ⋯ */}
      {(!inCombat || sideChoice || (hasInitiative && !rolled)) && (
        <div className="flex flex-wrap items-end gap-2">
          {sideChoice && systeme && <SideSelects choice={sideChoice} systeme={systeme} />}
          <span className="flex-1" />
          {inCombat ? (
            hasInitiative && (
              <Button
                variant={rolled ? 'secondary' : 'default'}
                size="sm"
                onClick={onInitiative}
                loading={busy === 'initiative'}
                disabled={busy !== null || !combat.order.length}
              >
                <Dices />
                {rolled ? 'Relancer l’initiative…' : 'Lancer l’initiative'}
              </Button>
            )
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onStart(false)}
                loading={busy === 'start:false'}
                disabled={busy !== null || !readyCount}
              >
                <Play />
                {compact ? 'Sans initiative' : 'Démarrer sans initiative'}
              </Button>
              {hasInitiative && (
                <Button
                  size="sm"
                  onClick={() => onStart(true)}
                  loading={busy === 'start:true'}
                  disabled={busy !== null || !readyCount}
                >
                  <Dices />
                  Lancer l’initiative
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Compétence (ou autre choix) d'initiative par camp : une liste par camp présent. */
function SideSelects({ choice, systeme }: { choice: SideChoice; systeme: SystemeCharge }) {
  const options = [{ valeur: '', nom: 'Par défaut' }, ...entryOptionsOf(systeme, choice.param)];
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label={choice.param.nom}>
      {choice.sides.map((side) => {
        const current = choice.value[side]?.[choice.param.id];
        return (
          <label key={side} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-subtle">
              {SIDE_LABELS[side].name}
            </span>
            <SelectField
              value={typeof current === 'string' ? current : ''}
              onValueChange={(v) => choice.onChange(side, v)}
              options={options}
              className="h-8 w-36 text-xs"
              aria-label={`${choice.param.nom} des ${SIDE_LABELS[side].name.toLowerCase()}`}
            />
          </label>
        );
      })}
    </div>
  );
}

function HeaderMenu({
  inCombat,
  hasInitiative,
  pendingReports,
  onMenu,
}: {
  inCombat: boolean;
  hasInitiative: boolean;
  pendingReports: number;
  onMenu(action: HeaderMenuAction): void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Plus d’actions du combat">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {inCombat && (
          <>
            <DropdownMenuItem onSelect={() => onMenu('add')}>
              <UserPlus />
              Ajouter des participants…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!hasInitiative} onSelect={() => onMenu('initiative')}>
              <SlidersHorizontal />
              Initiative : options…
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={() => onMenu('settings')}>
          <Settings2 />
          Réglages du combat…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onMenu('heroes')}>
          <Crown />
          Héros de la table
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onMenu('shortcuts')}>
          <Keyboard />
          Raccourcis clavier
        </DropdownMenuItem>
        {inCombat && (
          <>
            <DropdownMenuSeparator />
            {pendingReports > 0 && (
              <DropdownMenuLabel className="text-[11px] font-normal text-subtle">
                {pendingReports} rapport{pendingReports > 1 ? 's' : ''} en attente
              </DropdownMenuLabel>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onMenu('end')}
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
