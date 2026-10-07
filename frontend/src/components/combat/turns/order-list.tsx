'use client';

/**
 * Ordre du tour (docs/combat.md § 12.6), déplié sous la barre du MJ : position,
 * portrait, nom, jauge de la ressource principale, détail d'initiative, états et durées, puces
 * de situation (surpris, a agi, visé ce round), « + » (ressources) ; tour courant surligné,
 * caché aux joueurs marqué, hors de combat grisé. Un clic ouvre sa fiche de combat ; glisser une ligne la déplace (ou « Monter »,
 * « Descendre » au menu, au clavier) ; le menu de ligne donne le tour, attaque avec, relance ou
 * saisit l'initiative, cache, surprend, met hors de combat, retire.
 */
import { useTranslations } from 'next-intl';
import type { CombatState } from '@vtt/contracts';
import {
  ArrowDown,
  ArrowUp,
  Dices,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Hand,
  Hourglass,
  IdCard,
  MoreHorizontal,
  PencilLine,
  Skull,
  Swords,
  UserMinus,
  Zap,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { PanelLink } from '@/components/table/panels/navigation';
import { TABLE_PARAMS } from '@/components/table/panels/registry';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { SIDE_LABELS, turnRows, type TurnRow } from './model';
import { Gauge, ResourcesPopover, SituationChips } from './parts';
import { situationChips } from './situation';
import { StateBadge } from './states-manager';
import type { CastMember, ParticipantSheet } from './use-cast';

export interface OrderActions {
  /** Clic sur la ligne, « Fiche de combat », « Saisir l'initiative » : la fiche de combat. */
  open(characterId: string): void;
  attackWith(characterId: string): void;
  giveTurn(characterId: string): void;
  reroll(characterId: string): void;
  setHidden(characterId: string, hidden: boolean): void;
  setSurprised(characterId: string, surprised: boolean): void;
  setDefeated(characterId: string, defeated: boolean): void;
  move(characterId: string, to: number): void;
  remove(characterId: string): void;
}

const MAX_BADGES = 3;
const ROW_TRANSITION = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 } as const;

export function OrderList({
  combat,
  cast,
  sheets,
  busy,
  canAttack,
  actions,
}: Readonly<{
  combat: CombatState;
  cast: ReadonlyMap<string, CastMember>;
  sheets: ReadonlyMap<string, ParticipantSheet>;
  busy: boolean;
  canAttack: boolean;
  actions: OrderActions;
}>) {
  const t = useTranslations();
  const rows = turnRows(combat);
  const [dragged, setDragged] = useState<string | null>(null);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const reduced = useReducedMotion();
  const current = rows.find((r) => r.current)?.characterId ?? null;
  // Le tour passe : la ligne de celui qui agit reste en vue (longue liste, colonne défilée)
  useEffect(() => {
    if (!current) return;
    currentRef.current?.scrollIntoView({
      block: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, [current, reduced]);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const over = (e: DragEvent<HTMLDivElement>, index: number) => {
    if (!dragged) return;
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientY < box.top + box.height / 2 ? index : index + 1);
  };
  const drop = () => {
    if (dragged !== null && dropAt !== null) {
      const from = rows.findIndex((r) => r.characterId === dragged);
      // La place visée compte la ligne déplacée : au-delà d'elle, un rang de moins
      const to = dropAt > from ? dropAt - 1 : dropAt;
      if (to !== from) actions.move(dragged, to);
    }
    setDragged(null);
    setDropAt(null);
  };

  if (!rows.length)
    return (
      <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
        {t('combat.order.empty')}
      </p>
    );

  return (
    <ol className="space-y-1" aria-label={t('combat.order.title')}>
      {rows.map((row, i) => (
        <motion.li
          key={row.characterId}
          ref={row.current ? currentRef : undefined}
          // Mesurée seulement quand le rang change (pas à chaque rendu de la liste)
          layout="position"
          layoutDependency={i}
          transition={ROW_TRANSITION}
        >
          <div
            draggable={!busy}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', row.characterId);
              setDragged(row.characterId);
            }}
            onDragEnd={() => {
              setDragged(null);
              setDropAt(null);
            }}
            onDragOver={(e) => over(e, i)}
            onDrop={(e) => {
              e.preventDefault();
              drop();
            }}
            className={cn(
              'relative',
              dragged === row.characterId && 'opacity-40',
              dropAt === i &&
                dragged &&
                'before:absolute before:inset-x-2 before:-top-[3px] before:h-0.5 before:rounded-full before:bg-primary',
              dropAt === i + 1 &&
                dragged &&
                i === rows.length - 1 &&
                'after:absolute after:inset-x-2 after:-bottom-[3px] after:h-0.5 after:rounded-full after:bg-primary',
            )}
          >
            <OrderRow
              row={row}
              member={cast.get(row.characterId) ?? null}
              sheet={sheets.get(row.characterId) ?? null}
              count={rows.length}
              busy={busy}
              canAttack={canAttack}
              actions={actions}
            />
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

/** États et situation sous le nom, les premiers en pastilles, le reste en info-bulle. */
function RowBadges({
  states,
  chips,
}: Readonly<{
  states: NonNullable<ParticipantSheet['states']>;
  chips: ReturnType<typeof situationChips>;
}>) {
  if (!(states.length > 0 || chips.length > 0)) return null;
  return (
    <span className="relative z-10 mt-1 flex flex-wrap items-center gap-1">
      <SituationChips chips={chips} />
      {states.slice(0, MAX_BADGES).map((s) => (
        <StateBadge key={s.key} state={s} />
      ))}
      {states.length > MAX_BADGES && (
        <Info
          texte={states
            .slice(MAX_BADGES)
            .map((s) => s.name)
            .join(', ')}
        >
          <span className="cursor-help text-[11px] text-subtle">+{states.length - MAX_BADGES}</span>
        </Info>
      )}
    </span>
  );
}

/** Menu d'une ligne : fiche, tour, attaque, initiative, visibilité, état, ordre, retrait. */
function RowMenuItems({
  row,
  count,
  canAttack,
  actions,
  confirm,
  onConfirm,
}: Readonly<{
  row: TurnRow;
  count: number;
  canAttack: boolean;
  actions: OrderActions;
  /** Retrait demandé une fois : le prochain choix le confirme. */
  confirm: boolean;
  onConfirm(): void;
}>) {
  const t = useTranslations();
  const id = row.characterId;
  const p = row.participant;
  return (
    <>
      <DropdownMenuItem onSelect={() => actions.open(id)}>
        <IdCard />
        {t('combat.order.sheet')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={row.current || row.defeated}
        onSelect={() => actions.giveTurn(id)}
      >
        <Hand />
        {t('combat.character.giveTurn')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={row.defeated || !canAttack}
        onSelect={() => actions.attackWith(id)}
      >
        <Swords />
        {t('combat.order.attackWith')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => actions.reroll(id)}>
        <Dices />
        {row.initiative ? t('combat.character.rerollInitiative') : t('combat.initiative.roll')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => actions.open(id)}>
        <PencilLine />
        {t('combat.order.enterInitiative')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => actions.setHidden(id, !row.hidden)}>
        {row.hidden ? <Eye /> : <EyeOff />}
        {row.hidden ? t('combat.order.show') : t('map.scenes.hideFromPlayers')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => actions.setSurprised(id, p.surprised !== true)}>
        <Zap />
        {p.surprised ? t('combat.order.notSurprised') : t('combat.situation.surprised')}
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => actions.setDefeated(id, !row.defeated)}>
        <Skull />
        {row.defeated ? t('combat.order.backInPlay') : t('combat.situation.defeated')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={row.position === 1}
        onSelect={() => actions.move(id, row.position - 2)}
      >
        <ArrowUp />
        {t('audio.playlists.up')}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={row.position === count}
        onSelect={() => actions.move(id, row.position)}
      >
        <ArrowDown />
        {t('audio.playlists.down')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <PanelLink panel="joueurs" params={{ [TABLE_PARAMS.character]: id }}>
          <ExternalLink />
          {t('map.tokens.inspector.openSheet')}
        </PanelLink>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="text-destructive focus:text-destructive"
        onSelect={(e) => {
          if (!confirm) {
            e.preventDefault();
            onConfirm();
            return;
          }
          actions.remove(id);
        }}
      >
        <UserMinus />
        {confirm ? t('combat.character.confirmRemove') : t('combat.character.remove')}
      </DropdownMenuItem>
    </>
  );
}

function OrderRow({
  row,
  member,
  sheet,
  count,
  busy,
  canAttack,
  actions,
}: Readonly<{
  row: TurnRow;
  member: CastMember | null;
  sheet: ParticipantSheet | null;
  count: number;
  busy: boolean;
  canAttack: boolean;
  actions: OrderActions;
}>) {
  const t = useTranslations();
  const name = member?.name ?? t('map.common.character');
  const states = sheet?.states ?? [];
  const id = row.characterId;
  const p = row.participant;
  const chips = situationChips(p, { current: row.current });
  const [confirm, setConfirm] = useState(false);
  return (
    <div
      className={cn(
        'group relative flex items-center gap-2.5 rounded-xl border px-2 py-2 transition-colors',
        row.current
          ? 'border-primary/50 bg-primary/10 shadow-surface'
          : 'border-transparent hover:border-border hover:bg-surface',
        row.defeated && 'opacity-55',
      )}
      aria-current={row.current ? 'step' : undefined}
    >
      {row.current && (
        <motion.span
          layoutId="combat-turn-marker"
          aria-hidden
          className="absolute inset-y-2 left-0 w-1 rounded-full bg-primary"
          transition={ROW_TRANSITION}
        />
      )}
      <button
        type="button"
        onClick={() => actions.open(id)}
        aria-label={t('combat.order.sheetOf', { name })}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      />
      <span
        aria-hidden
        className="hidden w-4 shrink-0 cursor-grab text-subtle opacity-0 transition-opacity group-hover:opacity-100 sm:block"
      >
        <GripVertical className="size-4" />
      </span>
      <span
        className={cn(
          'w-5 shrink-0 text-center font-mono text-sm tabular-nums',
          row.current ? 'font-bold text-primary-strong' : 'text-subtle',
        )}
      >
        {row.position}
      </span>
      <span className="relative shrink-0">
        <Illustration
          largeur={40}
          src={member?.portraitUrl ?? null}
          graine={name}
          position="top"
          className={cn(
            'size-10 rounded-full ring-2',
            row.current ? 'ring-primary' : 'ring-border',
            row.defeated && 'grayscale',
          )}
        />
        {row.defeated && (
          <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-background text-destructive">
            <Skull className="size-3" aria-label={t('combat.situation.defeated')} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'truncate text-sm font-medium',
              row.current && 'font-semibold',
              row.defeated && 'line-through',
            )}
          >
            {name}
          </span>
          {row.hidden && (
            <EyeOff
              className="size-3.5 shrink-0 text-info"
              aria-label={t('combat.order.hiddenFromPlayers')}
            />
          )}
          {row.pendingInitiative && (
            <Hourglass
              className="size-3.5 shrink-0 text-warning"
              aria-label={t('combat.order.initiativeAsked')}
            />
          )}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="shrink-0">{SIDE_LABELS[p.side].name}</span>
          {row.initiative && (
            <>
              <span aria-hidden>·</span>
              <span className="flex min-w-0 items-center gap-1" title={row.initiative}>
                <Dices className="size-3 shrink-0" aria-hidden />
                <span className="truncate font-mono tabular-nums">{row.initiative}</span>
              </span>
            </>
          )}
        </span>
        <RowBadges states={states} chips={chips} />
      </span>
      {sheet?.gauge && <Gauge gauge={sheet.gauge} />}
      <ResourcesPopover
        characterId={id}
        name={name}
        className="opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
      />
      <DropdownMenu onOpenChange={(open) => !open && setConfirm(false)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative z-10 shrink-0"
            aria-label={t('audio.playlists.actionsFor', { name })}
            disabled={busy}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <RowMenuItems
            row={row}
            count={count}
            canAttack={canAttack}
            actions={actions}
            confirm={confirm}
            onConfirm={() => setConfirm(true)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
