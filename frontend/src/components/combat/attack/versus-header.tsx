'use client';

/**
 * Duel en tête du menu d'attaque (docs/combat.md § 2.1 A5, § 12.1), avec les pièces de l'en-tête
 * de la fiche : portraits au format de la fiche (3/4, arrondis, ombre), fond des portraits
 * floutés, nom en titre, ressources en jauges (`BannerStats`). L'attaquant à gauche (ses
 * statistiques, MJ : changer d'attaquant), « VS » au milieu, les cibles à droite (portraits
 * chevauchés, « + » pour en ajouter, retrait, visée sur la carte).
 *
 * Une cible que la liste de la campagne ne me donne pas reste « Adversaire » : rien n'est lu de
 * sa fiche.
 */
import { Check, Crosshair, Plus, ScrollText, UserRoundCog, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { FOCUS } from '@/components/des/tactile';
import { BannerStats } from '@/components/fiche/banner';
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
import { AttackerStats } from './attacker-stats';
import type { AttackContext } from './use-attack-context';

/** Portraits montrés au plus ; au-delà, « +N ». */
const MAX_PORTRAITS = 3;

/** Portrait au format de la fiche (3/4), à la taille du duel. */
const PORTRAIT =
  'aspect-[3/4] w-12 shrink-0 rounded-xl shadow-elevated xs:w-14 sm:w-[5.5rem] lg:w-24';

const iconButton = cn(
  'grid size-8 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2/95 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-40 max-sm:size-9',
  FOCUS,
);

/** Petit libellé au-dessus d'un nom, comme les libellés du bandeau de la fiche. */
function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-[11px] font-medium uppercase tracking-wider', className)}>{children}</p>
  );
}

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
  bar,
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
  /** Barre du haut (round, « Mes attaques », fermer). */
  bar: ReactNode;
  /** Aucun attaquant choisi, ni proposé : la liste s'ouvre d'elle-même. */
  promptAttacker?: boolean;
}) {
  const known = attackerId ? ctx.known.get(attackerId) : undefined;
  const attackerPortrait = portraitUrl ?? known?.portraitUrl ?? null;
  const firstTarget = targetIds[0] ? ctx.known.get(targetIds[0]) : undefined;
  return (
    <header className="relative isolate shrink-0 overflow-hidden border-b border-border">
      {/* Fond : les deux portraits floutés, comme l'en-tête de la fiche */}
      <div aria-hidden className="absolute inset-0 -z-10 grid grid-cols-2">
        <Illustration
          src={attackerPortrait}
          graine={attackerName ?? known?.name ?? 'attaquant'}
          initiale={false}
          className="opacity-40"
          classeImage="scale-110 blur-3xl"
        />
        <Illustration
          src={firstTarget?.portraitUrl}
          graine={firstTarget?.name ?? targetIds[0] ?? 'cible'}
          initiale={false}
          className={cn('opacity-40', !targetIds.length && 'opacity-0')}
          classeImage="scale-110 blur-3xl"
        />
      </div>
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-background/50 via-background/85 to-background"
      />
      {bar}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-4 pb-5 pt-1 sm:gap-6 sm:px-8 sm:pb-6">
        <AttackerSide
          ctx={ctx}
          attackerId={attackerId}
          name={attackerName}
          portraitUrl={attackerPortrait}
          fc={fc}
          editable={editable}
          onAttacker={onAttacker}
          promptAttacker={promptAttacker}
        />
        <span
          aria-hidden
          className="select-none font-display text-2xl font-black italic tracking-tighter text-foreground/15 sm:text-5xl"
        >
          VS
        </span>
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
  promptAttacker,
}: {
  ctx: AttackContext;
  attackerId: string | null;
  name: string | null;
  portraitUrl: string | null;
  fc: ContexteFiche | null;
  editable: boolean;
  onAttacker: (id: string) => void;
  promptAttacker: boolean;
}) {
  const known = attackerId ? ctx.known.get(attackerId) : undefined;
  const label = name ?? known?.name ?? (attackerId ? 'Personnage' : 'Qui attaque ?');
  const choosable = editable && (ctx.attackers.length > 1 || !attackerId);

  return (
    <div className="flex min-w-0 items-center gap-2.5 sm:gap-5">
      {attackerId && fc ? (
        <Popover>
          <Info texte="Statistiques">
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`Statistiques de ${label}`}
                className={cn(
                  'group/portrait relative shrink-0 rounded-xl transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
                  FOCUS,
                )}
              >
                <Illustration
                  largeur={128}
                  src={portraitUrl}
                  graine={label}
                  alt=""
                  position="top"
                  className={cn(
                    PORTRAIT,
                    'ring-1 ring-primary/50 transition-shadow group-hover/portrait:ring-primary',
                  )}
                />
                <span
                  aria-hidden
                  className="absolute -bottom-1.5 -right-1.5 grid size-6 place-items-center rounded-full border border-border-strong bg-popover text-muted-foreground shadow-surface transition-colors group-hover/portrait:text-foreground"
                >
                  <ScrollText className="size-3" />
                </span>
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
      ) : attackerId ? (
        <Illustration
          largeur={128}
          src={portraitUrl}
          graine={label}
          alt=""
          position="top"
          className={cn(PORTRAIT, 'ring-1 ring-primary/50')}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            PORTRAIT,
            'grid place-items-center border-2 border-dashed border-primary/40 font-display text-2xl text-primary/60 shadow-none sm:text-4xl',
          )}
        >
          ?
        </span>
      )}
      <div className="min-w-0 space-y-2">
        <div className="min-w-0">
          <Kicker className="text-primary">Attaquant</Kicker>
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="min-w-0 truncate font-display text-base font-semibold leading-tight xs:text-lg sm:text-3xl">
              {label}
            </h2>
            {choosable && (
              <AttackerSwitch
                ctx={ctx}
                attackerId={attackerId}
                prompt={promptAttacker}
                onAttacker={onAttacker}
              />
            )}
          </div>
        </div>
        {fc && (
          <div className="hidden lg:block">
            <BannerStats ctx={fc} widget={undefined} />
          </div>
        )}
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
      <Illustration
        src={c.portraitUrl}
        graine={c.name ?? '?'}
        largeur={24}
        className="size-6 rounded-full"
      />
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
  const self = n === 1 && targetIds[0] === attackerId;

  return (
    <div className="flex min-w-0 flex-row-reverse items-center gap-2.5 sm:gap-5">
      {n === 0 ? (
        <button
          type="button"
          onClick={canAim && editable ? onAim : undefined}
          disabled={!canAim || !editable}
          aria-label="Viser sur la carte"
          className={cn(
            PORTRAIT,
            'grid place-items-center border-2 border-dashed border-destructive/40 text-destructive/70 shadow-none transition-colors enabled:hover:border-destructive/70 enabled:hover:text-destructive',
            FOCUS,
          )}
        >
          <Crosshair className="size-5 sm:size-7" aria-hidden />
        </button>
      ) : (
        <ul aria-label="Cibles" className="flex shrink-0 -space-x-6 sm:-space-x-10">
          {shown.map((id, i) => (
            <TargetPortrait
              key={id}
              ctx={ctx}
              id={id}
              self={id === attackerId}
              z={shown.length - i}
              editable={editable}
              onRemove={() => onRemove(id)}
            />
          ))}
          {rest > 0 && (
            <li style={{ zIndex: 0 }}>
              <Info texte={names.slice(shown.length).join(', ')}>
                <span
                  tabIndex={0}
                  className={cn(
                    PORTRAIT,
                    'grid place-items-center bg-surface-3 font-mono text-sm font-semibold ring-1 ring-destructive/50 sm:text-xl',
                    FOCUS,
                  )}
                >
                  +{rest}
                </span>
              </Info>
            </li>
          )}
        </ul>
      )}
      <div className="min-w-0 space-y-2 text-right">
        <div className="min-w-0">
          <Kicker className={self ? 'text-warning' : 'text-destructive'}>
            {self ? 'Lui-même' : n > 1 ? 'Cibles' : 'Cible'}
          </Kicker>
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            {editable && (
              <>
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
                      aria-keyshortcuts="V"
                      onClick={onAim}
                      className={cn(iconButton, 'max-sm:hidden')}
                    >
                      <Crosshair className="size-4" aria-hidden />
                    </button>
                  </Info>
                )}
                <TargetPicker
                  ctx={ctx}
                  attackerId={attackerId}
                  targetIds={targetIds}
                  full={n >= maxTargets}
                  canAim={canAim}
                  onToggle={onToggle}
                  onAim={onAim}
                />
              </>
            )}
            <h2
              className={cn(
                'min-w-0 truncate font-display text-base font-semibold leading-tight xs:text-lg sm:text-3xl',
                n === 0 && 'text-muted-foreground',
              )}
            >
              {title}
            </h2>
          </div>
        </div>
        {n > 1 && (
          <p className="hidden truncate text-[13px] text-muted-foreground sm:block">
            {names.join(', ')}
          </p>
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
  editable,
  onRemove,
}: {
  ctx: AttackContext;
  id: string;
  self: boolean;
  z: number;
  editable: boolean;
  onRemove: () => void;
}) {
  const c = ctx.known.get(id);
  const name = targetName(id, ctx.known);
  const defeated = ctx.combat?.order.find((p) => p.characterId === id)?.defeated;
  return (
    <li className="group relative" style={{ zIndex: z }}>
      <Illustration
        largeur={128}
        src={c?.portraitUrl}
        graine={name}
        alt={name}
        position="top"
        className={cn(
          PORTRAIT,
          'ring-1',
          self ? 'ring-warning/60' : 'ring-destructive/50',
          defeated && 'opacity-50 grayscale',
        )}
      />
      {editable && (
        <button
          type="button"
          aria-label={`Retirer ${name} des cibles`}
          onClick={onRemove}
          className={cn(
            'absolute -right-1.5 -top-1.5 grid size-7 place-items-center rounded-full border border-border-strong bg-popover text-muted-foreground opacity-0 shadow-surface transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
            FOCUS,
          )}
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
          largeur={24}
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
