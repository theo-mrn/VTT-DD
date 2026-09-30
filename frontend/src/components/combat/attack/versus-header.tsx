'use client';

/**
 * En-tête « versus » du menu d'attaque (docs/combat.md § 2.1 A5, § 12.1), repris de l'ancienne
 * page : l'attaquant à gauche (grand portrait cerclé, pastille « Attaquant », nom, statistiques,
 * MJ : changer d'attaquant), « VS » en filigrane, les cibles à droite (portraits chevauchés,
 * pastille du nom, « N cibles », « + » pour en ajouter, retrait, visée sur la carte).
 *
 * Une cible que la liste de la campagne ne me donne pas reste « Adversaire » : rien n'est lu
 * de sa fiche.
 */
import { Check, Crosshair, Plus, ScrollText, UserRoundCog, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Illustration } from '@/components/commun/illustration';
import type { ContexteFiche } from '@/components/fiche/widgets';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { targetGroups, type RosterCharacter } from '@/lib/combat/roster';
import { targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { AttackerStats, Gauge, profileStats, resourceStats } from './attacker-stats';
import type { AttackContext } from './use-attack-context';

/** Portraits montrés au plus ; au-delà, « +N ». */
const MAX_PORTRAITS = 4;

const iconButton =
  'grid size-8 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2/80 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-40 max-sm:size-9';

export function VersusHeader({
  ctx,
  attackerId,
  attackerName,
  portraitUrl,
  fc,
  targetIds,
  editable,
  canAim,
  maxTargets,
  onAttacker,
  onToggleTarget,
  onRemoveTarget,
  onAim,
  badges,
  promptAttacker = false,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  attackerName: string | null;
  portraitUrl: string | null;
  /** Fiche calculée de l'attaquant (statistiques), si elle est lue. */
  fc: ContexteFiche | null;
  targetIds: readonly string[];
  /** Composition en cours : attaquant et cibles modifiables. */
  editable: boolean;
  canAim: boolean;
  maxTargets: number;
  onAttacker: (id: string) => void;
  onToggleTarget: (id: string) => void;
  onRemoveTarget: (id: string) => void;
  onAim: () => void;
  /** Pastilles sous le nom (tour, hors tour). */
  badges?: React.ReactNode;
  /** Aucun attaquant choisi, ni proposé : la liste s'ouvre d'elle-même. */
  promptAttacker?: boolean;
}) {
  return (
    <header
      className={cn(
        'relative isolate shrink-0 overflow-hidden border-b border-border',
        'bg-[linear-gradient(100deg,hsl(var(--primary)/0.09),transparent_38%,transparent_62%,hsl(var(--destructive)/0.09))]',
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 select-none font-display text-6xl font-black italic tracking-tighter text-foreground/[0.06] sm:text-[7.5rem]"
      >
        VS
      </span>
      <div className="flex items-center justify-between gap-3 px-4 pb-6 pt-4 sm:px-10 sm:pb-8 sm:pt-6">
        <AttackerSide
          ctx={ctx}
          attackerId={attackerId}
          name={attackerName}
          portraitUrl={portraitUrl}
          fc={fc}
          editable={editable}
          onAttacker={onAttacker}
          badges={badges}
          promptAttacker={promptAttacker}
        />
        <TargetsSide
          ctx={ctx}
          attackerId={attackerId}
          targetIds={targetIds}
          editable={editable}
          canAim={canAim}
          maxTargets={maxTargets}
          onToggle={onToggleTarget}
          onRemove={onRemoveTarget}
          onAim={onAim}
        />
      </div>
    </header>
  );
}

// ─── Attaquant ───────────────────────────────────────────────────────────────

function AttackerSide({
  ctx,
  attackerId,
  name,
  portraitUrl,
  fc,
  editable,
  onAttacker,
  badges,
  promptAttacker,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  name: string | null;
  portraitUrl: string | null;
  fc: ContexteFiche | null;
  editable: boolean;
  onAttacker: (id: string) => void;
  badges?: React.ReactNode;
  promptAttacker: boolean;
}) {
  const known = attackerId ? ctx.known.get(attackerId) : undefined;
  const label = name ?? known?.name ?? (attackerId ? 'Personnage' : 'Qui attaque ?');
  const choosable = editable && (ctx.attackers.length > 1 || !attackerId);
  const resources = fc ? resourceStats(fc, 2) : [];
  const profile = fc ? profileStats(fc).slice(0, 2) : [];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-6">
      <div className="relative shrink-0">
        <Illustration
          src={portraitUrl ?? known?.portraitUrl}
          graine={attackerId ? label : '?'}
          alt=""
          className="size-14 rounded-full ring-2 ring-primary ring-offset-2 ring-offset-background sm:size-24 sm:ring-[3px] sm:ring-offset-[3px]"
        />
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground shadow-surface sm:px-2.5 sm:text-[11px]">
          Attaquant
        </span>
      </div>
      <div className="min-w-0 space-y-1.5 sm:space-y-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h2 className="max-w-full truncate font-display text-lg font-semibold leading-tight tracking-tight sm:text-[1.9rem]">
            {label}
          </h2>
          {fc && (
            <Popover>
              <Info texte="Statistiques">
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Statistiques de l’attaquant"
                    className={iconButton}
                  >
                    <ScrollText className="size-3.5" aria-hidden />
                  </button>
                </PopoverTrigger>
              </Info>
              <PopoverContent
                align="start"
                className="max-h-[min(32rem,70dvh)] w-72 overflow-y-auto [scrollbar-width:thin]"
              >
                <AttackerStats ctx={fc} name={label} />
              </PopoverContent>
            </Popover>
          )}
          {choosable && (
            <AttackerSwitch
              ctx={ctx}
              attackerId={attackerId}
              prompt={promptAttacker}
              onAttacker={onAttacker}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {badges}
          {resources.map((r) => (
            <span
              key={r.key}
              className="hidden min-w-[5.5rem] flex-col gap-1 rounded-lg border border-border bg-surface/70 px-2 py-1 sm:flex"
            >
              <span className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-subtle">{r.label}</span>
                <span className="font-mono font-semibold tabular-nums">{r.value}</span>
              </span>
              <Gauge stat={r} />
            </span>
          ))}
          {profile.map((p) => (
            <span
              key={p.key}
              className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface/70 px-2 py-1 text-[11px] md:inline-flex"
            >
              <span className="text-subtle">{p.label}</span>
              <span className="font-mono font-semibold tabular-nums">{p.value}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Changer d'attaquant (MJ, ou joueur qui incarne plusieurs personnages). */
function AttackerSwitch({
  ctx,
  attackerId,
  prompt,
  onAttacker,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  prompt: boolean;
  onAttacker: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Personne n'attaque encore (MJ sans PNJ qui agit) : la liste s'ouvre d'elle-même
  useEffect(() => {
    if (prompt) setOpen(true);
  }, [prompt]);
  const order = ctx.combat?.order.map((p) => p.characterId) ?? [];
  const inCombat = ctx.attackers
    .filter((c) => order.includes(c.id))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const others = ctx.attackers.filter((c) => !order.includes(c.id));
  const item = (c: RosterCharacter) => (
    <CommandItem
      key={c.id}
      value={`${c.name ?? 'Personnage'} ${c.id}`}
      onSelect={() => {
        onAttacker(c.id);
        setOpen(false);
      }}
    >
      <Illustration src={c.portraitUrl} graine={c.name ?? '?'} className="size-6 rounded-full" />
      <span className="min-w-0 flex-1 truncate">{c.name ?? 'Personnage'}</span>
      {c.id === attackerId && <Check className="text-primary" aria-hidden />}
    </CommandItem>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte="Changer d’attaquant">
        <PopoverTrigger asChild>
          <button type="button" aria-label="Changer d’attaquant" className={iconButton}>
            <UserRoundCog className="size-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
      </Info>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Qui attaque ?" />
          <CommandList>
            <CommandEmpty>Aucun personnage.</CommandEmpty>
            {inCombat.length > 0 && (
              <CommandGroup heading="Combat en cours">{inCombat.map(item)}</CommandGroup>
            )}
            {others.length > 0 && (
              <CommandGroup heading={inCombat.length ? 'Hors du combat' : 'Personnages'}>
                {others.map(item)}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Cibles ──────────────────────────────────────────────────────────────────

function TargetsSide({
  ctx,
  attackerId,
  targetIds,
  editable,
  canAim,
  maxTargets,
  onToggle,
  onRemove,
  onAim,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  targetIds: readonly string[];
  editable: boolean;
  canAim: boolean;
  maxTargets: number;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onAim: () => void;
}) {
  const n = targetIds.length;
  const shown = targetIds.slice(0, n > MAX_PORTRAITS ? MAX_PORTRAITS - 1 : MAX_PORTRAITS);
  const rest = n - shown.length;
  const names = targetIds.map((id) => targetName(id, ctx.known));
  const title = n === 0 ? 'Aucune cible' : n === 1 ? names[0]! : `${n} cibles`;

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-3 sm:gap-6">
      <div className="hidden min-w-0 text-right sm:block">
        <p className="truncate font-display text-[1.9rem] font-semibold leading-tight tracking-tight">
          {title}
        </p>
        <p className="truncate text-[12px] text-muted-foreground">
          {n > 1
            ? names.join(', ')
            : n === 0
              ? editable
                ? canAim
                  ? 'Ajoutez-en une, ou visez sur la carte'
                  : 'Ajoutez-en une'
                : ''
              : maxTargets < 50
                ? `${maxTargets} cible${maxTargets > 1 ? 's' : ''} au plus`
                : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {n === 0 ? (
          <span
            aria-hidden
            className="grid size-14 place-items-center rounded-full border-2 border-dashed border-destructive/40 font-display text-2xl text-destructive/60 sm:size-24 sm:text-4xl"
          >
            ?
          </span>
        ) : (
          <ul aria-label="Cibles" className="flex -space-x-4 sm:-space-x-6">
            {shown.map((id, i) => (
              <TargetPortrait
                key={id}
                ctx={ctx}
                id={id}
                self={id === attackerId}
                z={shown.length - i}
                pill={n <= 2}
                editable={editable}
                onRemove={() => onRemove(id)}
              />
            ))}
            {rest > 0 && (
              <li style={{ zIndex: 0 }}>
                <Info texte={names.slice(shown.length).join(', ')}>
                  <span
                    tabIndex={0}
                    className="grid size-14 place-items-center rounded-full bg-surface-3 font-mono text-sm font-semibold ring-2 ring-destructive/60 ring-offset-2 ring-offset-background sm:size-24 sm:text-xl"
                  >
                    +{rest}
                  </span>
                </Info>
              </li>
            )}
          </ul>
        )}
        {editable && (
          <div className="flex flex-col gap-1.5">
            <TargetPicker
              ctx={ctx}
              attackerId={attackerId}
              targetIds={targetIds}
              full={n >= maxTargets}
              canAim={canAim}
              onToggle={onToggle}
              onAim={onAim}
            />
            {canAim && (
              <Info
                texte={
                  <span className="flex items-center gap-1.5">
                    Viser sur la carte <Kbd>V</Kbd>
                  </span>
                }
              >
                <button
                  type="button"
                  aria-label="Viser sur la carte"
                  onClick={onAim}
                  className={iconButton}
                >
                  <Crosshair className="size-4" aria-hidden />
                </button>
              </Info>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TargetPortrait({
  ctx,
  id,
  self,
  z,
  pill,
  editable,
  onRemove,
}: {
  ctx: AttackContext;
  id: string;
  self: boolean;
  z: number;
  pill: boolean;
  editable: boolean;
  onRemove: () => void;
}) {
  const c = ctx.known.get(id);
  const name = targetName(id, ctx.known);
  const defeated = ctx.combat?.order.find((p) => p.characterId === id)?.defeated;
  return (
    <li className="group relative" style={{ zIndex: z }}>
      <Illustration
        src={c?.portraitUrl}
        graine={name}
        alt={name}
        className={cn(
          'size-14 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform sm:size-24 sm:ring-[3px] sm:ring-offset-[3px]',
          self ? 'ring-warning' : 'ring-destructive/80',
          defeated && 'opacity-50 grayscale',
        )}
      />
      {pill && (
        <span
          className={cn(
            'absolute -bottom-2 left-1/2 max-w-[5.5rem] -translate-x-1/2 truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-surface sm:max-w-[8rem] sm:px-2.5 sm:text-[11px]',
            self
              ? 'bg-warning text-primary-foreground'
              : 'bg-destructive text-destructive-foreground',
          )}
        >
          {name}
        </span>
      )}
      {editable && (
        <button
          type="button"
          aria-label={`Retirer ${name} des cibles`}
          onClick={onRemove}
          className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full border border-border-strong bg-popover text-muted-foreground opacity-0 shadow-surface transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </li>
  );
}

/** « + » : participants du combat d'abord, puis les autres personnages connus. */
function TargetPicker({
  ctx,
  attackerId,
  targetIds,
  full,
  canAim,
  onToggle,
  onAim,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  targetIds: readonly string[];
  full: boolean;
  canAim: boolean;
  onToggle: (id: string) => void;
  onAim: () => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = targetGroups(ctx.roster, ctx.combat);
  const item = (c: RosterCharacter) => {
    const on = targetIds.includes(c.id);
    const name = targetName(c.id, ctx.known);
    const p = ctx.combat?.order.find((x) => x.characterId === c.id);
    return (
      <CommandItem
        key={c.id}
        value={`${name} ${c.id}`}
        disabled={!on && full}
        onSelect={() => onToggle(c.id)}
        aria-checked={on}
      >
        <span
          aria-hidden
          className={cn(
            'grid size-4 shrink-0 place-items-center rounded-[5px] border',
            on
              ? 'border-destructive bg-destructive text-destructive-foreground'
              : 'border-border-strong',
          )}
        >
          {on && <Check className="!size-3" strokeWidth={3} />}
        </span>
        <Illustration
          src={c.portraitUrl}
          graine={name}
          className={cn('size-6 rounded-full', p?.defeated && 'opacity-50 grayscale')}
        />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        {c.id === attackerId && <span className="text-[11px] text-warning">lui-même</span>}
        {p?.defeated && <span className="text-[11px] text-subtle">hors de combat</span>}
      </CommandItem>
    );
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Info texte="Ajouter une cible">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Ajouter une cible"
            className={cn(iconButton, 'border-dashed')}
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>
      </Info>
      <PopoverContent align="end" className="w-80 p-0">
        <Command>
          <CommandInput placeholder="Chercher un personnage…" />
          <CommandList>
            <CommandEmpty>Aucun personnage connu.</CommandEmpty>
            {groups.participants.length > 0 && (
              <CommandGroup heading="Participants du combat">
                {groups.participants.map(item)}
              </CommandGroup>
            )}
            {groups.others.length > 0 && (
              <CommandGroup
                heading={groups.participants.length ? 'Autres personnages' : 'Personnages'}
              >
                {groups.others.map(item)}
              </CommandGroup>
            )}
          </CommandList>
          {canAim && (
            <div className="border-t border-border p-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onAim();
                }}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-surface-2 text-[13px] font-medium transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Crosshair className="size-4" aria-hidden /> Viser sur la carte
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
