'use client';

/**
 * Ordre du tour (docs/combat.md § 12.3) : position, portrait, nom, jauge de la ressource
 * principale, initiative et son détail, états et durées, caché aux joueurs, hors de combat
 * grisé. Glisser une ligne la déplace (ou « Monter », « Descendre » au menu, au clavier) ; un
 * clic ouvre la fiche du participant ; le menu donne le tour, relance l'initiative, etc.
 */
import type { CombatState } from '@vtt/contracts';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Dices,
  ExternalLink,
  Eye,
  EyeOff,
  GripVertical,
  Hand,
  Hourglass,
  MoreHorizontal,
  Skull,
  Swords,
  UserMinus,
} from 'lucide-react';
import { useState, type DragEvent } from 'react';
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
import type { ResourceGauge } from '@/lib/map/modules/tokens/model';
import { cn } from '@/lib/utils';
import { SIDE_LABELS, turnRows, type TurnRow } from './model';
import { StateBadge } from './states-manager';
import type { CastMember, ParticipantSheet } from './use-cast';

export interface OrderActions {
  open(characterId: string): void;
  attackWith(characterId: string): void;
  giveTurn(characterId: string): void;
  reroll(characterId: string): void;
  setHidden(characterId: string, hidden: boolean): void;
  setDefeated(characterId: string, defeated: boolean): void;
  move(characterId: string, to: number): void;
  remove(characterId: string): void;
}

const MAX_BADGES = 3;

export function OrderList({
  combat,
  cast,
  sheets,
  busy,
  actions,
}: {
  combat: CombatState;
  cast: ReadonlyMap<string, CastMember>;
  sheets: ReadonlyMap<string, ParticipantSheet>;
  busy: boolean;
  actions: OrderActions;
}) {
  const rows = turnRows(combat);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const over = (e: DragEvent<HTMLLIElement>, index: number) => {
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

  return (
    <ol className="space-y-1" aria-label="Ordre du tour" onDragEnd={() => setDragged(null)}>
      {rows.map((row, i) => (
        <li
          key={row.characterId}
          draggable={!busy}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', row.characterId);
            setDragged(row.characterId);
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
            actions={actions}
          />
        </li>
      ))}
    </ol>
  );
}

function Gauge({ gauge }: { gauge: ResourceGauge }) {
  const ratio = gauge.max > 0 ? Math.max(0, Math.min(1, gauge.value / gauge.max)) : 0;
  return (
    <span
      className="flex w-20 shrink-0 flex-col gap-0.5"
      title={`${gauge.label} : ${gauge.value} / ${gauge.max}`}
    >
      <span className="flex items-baseline justify-between text-[10px] leading-none">
        <span className="truncate text-subtle">{gauge.label}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {gauge.value}/{gauge.max}
        </span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <span
          className={cn('block h-full rounded-full', !gauge.color && 'bg-primary')}
          style={{
            width: `${ratio * 100}%`,
            ...(gauge.color ? { background: gauge.color } : {}),
          }}
        />
      </span>
    </span>
  );
}

function OrderRow({
  row,
  member,
  sheet,
  count,
  busy,
  actions,
}: {
  row: TurnRow;
  member: CastMember | null;
  sheet: ParticipantSheet | null;
  count: number;
  busy: boolean;
  actions: OrderActions;
}) {
  const name = member?.name ?? 'Personnage';
  const states = sheet?.states ?? [];
  const id = row.characterId;
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
      <button
        type="button"
        onClick={() => actions.open(id)}
        aria-label={`${name} : ouvrir sa fiche de combat`}
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
          'w-5 shrink-0 text-center font-mono text-xs tabular-nums',
          row.current ? 'font-bold text-primary-strong' : 'text-subtle',
        )}
      >
        {row.position}
      </span>
      <span className="relative shrink-0">
        <Illustration
          src={member?.portraitUrl ?? null}
          graine={name}
          position="top"
          className={cn(
            'size-9 rounded-full ring-2',
            row.current ? 'ring-primary' : 'ring-border',
            row.defeated && 'grayscale',
          )}
        />
        {row.defeated && (
          <span className="absolute -bottom-1 -right-1 grid size-4 place-items-center rounded-full bg-background text-destructive">
            <Skull className="size-3" aria-label="Hors de combat" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-sm font-medium', row.defeated && 'line-through')}>
            {name}
          </span>
          {row.hidden && (
            <EyeOff className="size-3.5 shrink-0 text-info" aria-label="Caché aux joueurs" />
          )}
          {row.acted && !row.current && (
            <Check className="size-3.5 shrink-0 text-success" aria-label="A agi ce round" />
          )}
          {row.pendingInitiative && (
            <Hourglass
              className="size-3.5 shrink-0 text-warning"
              aria-label="Initiative demandée au joueur"
            />
          )}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="shrink-0">{SIDE_LABELS[row.participant.side].name}</span>
          {row.initiative && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate font-mono tabular-nums" title={row.initiative}>
                Init. {row.initiative}
              </span>
            </>
          )}
        </span>
        {states.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {states.slice(0, MAX_BADGES).map((s) => (
              <StateBadge key={s.key} state={s} />
            ))}
            {states.length > MAX_BADGES && (
              <span className="text-[11px] text-subtle">+{states.length - MAX_BADGES}</span>
            )}
          </span>
        )}
      </span>
      {sheet?.gauge && <Gauge gauge={sheet.gauge} />}
      <DropdownMenu onOpenChange={(open) => !open && setConfirm(false)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative z-10 shrink-0"
            aria-label={`Actions pour ${name}`}
            disabled={busy}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem disabled={row.current} onSelect={() => actions.giveTurn(id)}>
            <Hand />
            Donner le tour
          </DropdownMenuItem>
          <DropdownMenuItem disabled={row.defeated} onSelect={() => actions.attackWith(id)}>
            <Swords />
            Attaquer avec
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.reroll(id)}>
            <Dices />
            {row.initiative ? 'Relancer l’initiative' : 'Lancer l’initiative'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.setHidden(id, !row.hidden)}>
            {row.hidden ? <Eye /> : <EyeOff />}
            {row.hidden ? 'Montrer aux joueurs' : 'Cacher aux joueurs'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.setDefeated(id, !row.defeated)}>
            <Skull />
            {row.defeated ? 'Remettre en jeu' : 'Hors de combat'}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={row.position === 1}
            onSelect={() => actions.move(id, row.position - 2)}
          >
            <ArrowUp />
            Monter
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={row.position === count}
            onSelect={() => actions.move(id, row.position)}
          >
            <ArrowDown />
            Descendre
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <PanelLink panel="joueurs" params={{ [TABLE_PARAMS.character]: id }}>
              <ExternalLink />
              Ouvrir la fiche
            </PanelLink>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              if (!confirm) {
                e.preventDefault();
                setConfirm(true);
                return;
              }
              actions.remove(id);
            }}
          >
            <UserMinus />
            {confirm ? 'Confirmer le retrait' : 'Retirer du combat'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Pastille d'aide de la liste (glisser, clic). */
export function OrderHint() {
  return (
    <Info texte="Glissez une ligne pour changer l’ordre ; le tour reste au même participant.">
      <span className="text-[11px] text-subtle">Glisser pour réordonner</span>
    </Info>
  );
}
