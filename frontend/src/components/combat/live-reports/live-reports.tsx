'use client';

/**
 * Rapports en direct sous le bandeau du MJ (docs/combat.md § 12.6) : chaque rapport qui attend
 * une décision sort de la barre dès qu'il arrive, sans changer de panneau. Carte compacte par
 * attaque : attaquant → cible(s), action et arme, issue par cible, valeur en gros chiffre
 * (rouge quand elle aggrave la cible), réductions en info-bulle, marques ; puis Appliquer,
 * Modifier (tiroir de décision du panneau), Ne pas appliquer ; par cible quand il y en a
 * plusieurs, plus « Tout appliquer ». Décidé : confirmation brève et « Annuler », puis la carte
 * s'en va. Une attaque en cours (défense, dés) paraît discrète et se complète en place.
 *
 * Trois cartes au plus, « +n » ouvre le panneau Combat ; repliable (préférence gardée).
 * Entrée applique le premier rapport, Suppr ne l'applique pas, quand la pile a le focus.
 * Les décisions passent par les mêmes corps que le panneau (`reports/model.ts`).
 */
import type { Attack, AttackTarget, CombatState } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import {
  ArrowRight,
  Battery,
  Check,
  CheckCheck,
  ChevronDown,
  EyeOff,
  Pencil,
  ScrollText,
  ShieldHalf,
  Skull,
  Undo2,
  X,
} from 'lucide-react';
import { AnimatePresence, MotionConfig, motion, type Transition } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { PanelLink } from '@/components/table/panels/navigation';
import { usePanelStore } from '@/components/table/panels/store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import type { DetailCampagne } from '@/lib/campagnes';
import { useCampaignSystem } from '@/lib/campaign-settings';
import { hasSuccessRule } from '@/lib/combat/actions';
import { combatErrorMessage } from '@/lib/combat/api';
import { useAttackCommands, useAttacks } from '@/lib/combat/use-attacks';
import { outcomeLabel } from '@/lib/combat/view';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { cn } from '@/lib/utils';
import { DecisionDrawer } from '../reports/decision-drawer';
import { DefeatedDialog, reportDefeated } from '../reports/defeated-dialog';
import { attributeLabel, damageTypeName, keyParams, modificationText } from '../reports/labels';
import {
  actorDecidable,
  buildApply,
  decidableTargets,
  defeatedBy,
  draftOf,
  isDecidable,
  reductionDetail,
  revertConflictOf,
  targetAmounts,
  toInput,
} from '../reports/model';
import { harmful, TONES } from '../reports/report-card';
import { combatPresentation, useCast, type CastMember } from '../turns/use-cast';
import { liveItems, liveStack, SETTLED_MS, type LiveItem } from './model';

const GLASS =
  'rounded-2xl border border-border-strong bg-popover/85 shadow-elevated backdrop-blur-xl';

/** Ressort court : une carte sort de la barre, se pose, sans rebond appuyé. */
const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 38, mass: 0.7 };

type Cast = ReadonlyMap<string, CastMember>;

interface Settled {
  attack: Attack;
  message: string;
  applied: boolean;
}

export function LiveReports({
  campagne,
  combat,
}: {
  campagne: DetailCampagne;
  combat: CombatState | null;
}) {
  const campaignId = campagne.id;
  // Le panneau Combat ouvert montre déjà les rapports : la pile s'efface
  const panelOpen = usePanelStore((s) => s.active === 'combat');
  const pending = useAttacks(campaignId, { status: 'pending', limit: 100 });
  const open = useAttacks(campaignId, { status: 'open', limit: 50 });
  const cast = useCast(campaignId);
  const sys = useCampaignSystem(campagne.system, campaignId);
  const systeme = sys.data?.systeme ?? null;
  const presentation = sys.data?.presentation ?? null;
  const commands = useAttackCommands(campaignId);
  const [collapsed, setCollapsed] = usePreferenceLocale('combat:pile-rapports-repliee', false);
  const [settled, setSettled] = useState<ReadonlyMap<string, Settled>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const settledAttacks = useMemo(
    () => new Map([...settled].map(([id, s]) => [id, s.attack])),
    [settled],
  );
  const items = useMemo(
    () => liveItems([open.attacks, pending.attacks], settledAttacks),
    [open.attacks, pending.attacks, settledAttacks],
  );
  const stack = liveStack(items, collapsed);
  const decidingAttack = deciding
    ? (items.find((i) => i.attack.id === deciding)?.attack ?? null)
    : null;

  // Une confirmation s'en va d'elle-même
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const forget = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setSettled((s) => {
      const next = new Map(s);
      next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const nameOf = (id: string) => cast.byId.get(id)?.name ?? 'Personnage';

  /** Même corps que le panneau : cibles telles quelles (appliquer ou non), coûts à part. */
  const decide = async (
    a: Attack,
    scope: { targets: readonly AttackTarget[]; actor: boolean },
    apply: boolean,
  ) => {
    const key = `${a.id}:${scope.targets.map((t) => t.characterId).join(',')}:${scope.actor}:${apply}`;
    setBusy(key);
    try {
      const actor =
        scope.actor && actorDecidable(a)
          ? { apply, modifications: a.actor!.modifications.map(toInput) }
          : null;
      const updated = await commands.apply(
        a.id,
        buildApply(
          a,
          scope.targets.map((t) => ({ ...draftOf(t), apply })),
          actor,
        ),
      );
      reportDefeated(defeatedBy(updated));
      if (updated.status !== 'pending') {
        const message = settledMessage(updated, nameOf, systeme, cast.byId);
        setSettled((s) => new Map(s).set(a.id, { attack: updated, ...message }));
        timers.current.set(
          a.id,
          setTimeout(() => forget(a.id), SETTLED_MS),
        );
      }
    } catch (err) {
      toast.error('La décision n’a pas pu être appliquée', {
        description: combatErrorMessage(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const undo = async (s: Settled) => {
    setBusy(`${s.attack.id}:undo`);
    try {
      await commands.revert(s.attack.id, { version: s.attack.version });
      forget(s.attack.id);
    } catch (err) {
      toast.error('L’application n’a pas pu être annulée', {
        description: revertConflictOf(err)
          ? 'La fiche a changé entre-temps : voyez le panneau Combat.'
          : combatErrorMessage(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const first = stack.first;
    if (!first || busy || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [role="menu"]')) return;
    // Un bouton garde sa propre touche Entrée
    if (e.key === 'Enter' && target.closest('button, a')) return;
    const all = { targets: decidableTargets(first), actor: true };
    if (e.key === 'Enter') {
      e.preventDefault();
      void decide(first, all, true);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void decide(first, { targets: all.targets, actor: false }, false);
    }
  };

  const empty = items.length === 0 || panelOpen;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {!empty && (
          <motion.section
            key="pile"
            aria-label="Rapports d’attaque en direct"
            aria-keyshortcuts="Enter Delete"
            tabIndex={0}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
            transition={SPRING}
            className="pointer-events-none flex w-[min(27rem,100%)] flex-col items-stretch gap-1.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <StackHeader
              waiting={stack.waiting}
              collapsed={collapsed}
              onToggle={() => setCollapsed(!collapsed)}
            />
            <motion.ol
              layoutScroll
              className="pointer-events-auto flex max-h-[min(60vh,34rem)] flex-col gap-1.5 overflow-y-auto overscroll-contain rounded-2xl [scrollbar-width:thin]"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {stack.visible.map((item) => (
                  <motion.li
                    key={item.attack.id}
                    layout
                    initial={{ opacity: 0, y: -18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 28, scale: 0.97, transition: { duration: 0.2 } }}
                    transition={SPRING}
                  >
                    {item.kind === 'settled' ? (
                      <SettledCard
                        settled={settled.get(item.attack.id)!}
                        busy={busy === `${item.attack.id}:undo`}
                        onUndo={(s) => void undo(s)}
                        onClose={() => forget(item.attack.id)}
                      />
                    ) : (
                      <LiveCard
                        item={item}
                        cast={cast.byId}
                        systeme={systeme}
                        presentation={presentation}
                        busy={busy}
                        first={item.attack.id === stack.first?.id}
                        onDecide={(scope, apply) => void decide(item.attack, scope, apply)}
                        onEdit={() => setDeciding(item.attack.id)}
                      />
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ol>
            <AnimatePresence initial={false}>
              {stack.hidden > 0 && !collapsed && (
                <motion.div
                  key="more"
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={SPRING}
                  className="flex justify-center"
                >
                  <Button
                    variant="ghost"
                    size="xs"
                    asChild
                    className={cn(GLASS, 'pointer-events-auto rounded-full')}
                  >
                    <PanelLink panel="combat">
                      +{stack.hidden} autre{stack.hidden > 1 ? 's' : ''} dans le panneau Combat
                    </PanelLink>
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>
      <DecisionDrawer
        campaignId={campaignId}
        attack={decidingAttack}
        systeme={systeme}
        cast={cast.byId}
        stateSorts={combatPresentation(presentation).stateSorts}
        onClose={() => setDeciding(null)}
      />
      <DefeatedDialog campagne={campagne} combat={combat} />
    </MotionConfig>
  );
}

// ─── En-tête de la pile ──────────────────────────────────────────────────────

function StackHeader({
  waiting,
  collapsed,
  onToggle,
}: {
  waiting: number;
  collapsed: boolean;
  onToggle(): void;
}) {
  return (
    <header className="flex justify-center rounded-full">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={cn(
          GLASS,
          'group pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-2.5 pr-2 text-xs font-medium transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        )}
      >
        <ScrollText className="size-3.5 text-primary" aria-hidden />
        <span>{waiting ? 'Rapports à décider' : 'Attaques en cours'}</span>
        {waiting > 0 && (
          <motion.span
            key={waiting}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={SPRING}
            className="grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[10px] font-bold tabular-nums text-primary-foreground"
          >
            {waiting}
          </motion.span>
        )}
        <ChevronDown
          className={cn(
            'size-3.5 text-subtle transition-transform duration-200',
            collapsed && '-rotate-90',
          )}
          aria-hidden
        />
        <span className="sr-only">{collapsed ? 'Déplier' : 'Replier'}</span>
      </button>
    </header>
  );
}

// ─── Carte d'une attaque ─────────────────────────────────────────────────────

type Scope = { targets: readonly AttackTarget[]; actor: boolean };

function LiveCard({
  item,
  cast,
  systeme,
  presentation,
  busy,
  first,
  onDecide,
  onEdit,
}: {
  item: LiveItem;
  cast: Cast;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  busy: string | null;
  first: boolean;
  onDecide(scope: Scope, apply: boolean): void;
  onEdit(): void;
}) {
  const a = item.attack;
  const progress = item.kind === 'progress';
  const attacker = cast.get(a.attackerId);
  const attackerName = attacker?.name ?? 'Personnage';
  const params = keyParams(systeme, a.action.id, a.params);
  const successRule = hasSuccessRule(systeme?.actions.get(a.action.id) ?? null);
  const decidable = decidableTargets(a);
  const single = a.targets.length === 1;
  const t0 = a.targets[0];
  const tone0 = t0 ? outcomeOf(t0, successRule)?.tone : undefined;
  const all: Scope = { targets: decidable, actor: true };
  const isBusy = busy !== null && busy.startsWith(`${a.id}:`);
  const keyOf = (s: Scope, apply: boolean) =>
    `${a.id}:${s.targets.map((t) => t.characterId).join(',')}:${s.actor}:${apply}`;

  return (
    <article
      aria-label={`${a.action.name} : ${attackerName} contre ${a.targets.map((t) => cast.get(t.characterId)?.name ?? 'Personnage').join(', ')}`}
      className={cn(
        GLASS,
        'relative overflow-hidden',
        progress && 'bg-popover/65',
        first && !progress && 'border-primary/40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          progress
            ? 'bg-warning/70'
            : tone0 === 'critical'
              ? 'bg-arcane'
              : tone0 === 'fumble'
                ? 'bg-destructive'
                : tone0 === 'failure'
                  ? 'bg-subtle'
                  : 'bg-primary',
        )}
      />

      {/* Qui attaque qui, avec quoi */}
      <header className="flex items-center gap-2.5 py-2.5 pl-4 pr-3">
        <span className="flex shrink-0 items-center">
          <Portrait name={attackerName} src={attacker?.portraitUrl ?? null} />
          <ArrowRight className="mx-1 size-3.5 text-subtle" aria-hidden />
          <span className="flex -space-x-2">
            {a.targets.slice(0, 3).map((t) => {
              const m = cast.get(t.characterId);
              return (
                <Portrait
                  key={t.characterId}
                  name={m?.name ?? 'Personnage'}
                  src={m?.portraitUrl ?? null}
                  ring="ring-popover"
                />
              );
            })}
            {a.targets.length > 3 && (
              <span className="grid size-7 place-items-center rounded-full bg-surface-3 text-[10px] font-semibold ring-2 ring-popover">
                +{a.targets.length - 3}
              </span>
            )}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">
            {params.length ? params.join(', ') : a.action.name}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {attackerName}
            {single && t0 ? ` → ${cast.get(t0.characterId)?.name ?? 'Personnage'}` : ''}
            {params.length ? ` · ${a.action.name}` : ''}
          </span>
        </span>
        {single && t0 && <OutcomePill target={t0} successRule={successRule} />}
      </header>

      <Marks attack={a} />

      {progress ? (
        <InProgress attack={a} />
      ) : single && t0 ? (
        <SingleBody
          attack={a}
          target={t0}
          cast={cast}
          systeme={systeme}
          presentation={presentation}
        />
      ) : (
        <ul className="space-y-1 px-3 pb-1">
          {a.targets.map((t) => (
            <TargetRow
              key={t.characterId}
              attack={a}
              target={t}
              cast={cast}
              systeme={systeme}
              presentation={presentation}
              successRule={successRule}
              busy={isBusy}
              loadingApply={busy === keyOf({ targets: [t], actor: false }, true)}
              loadingSkip={busy === keyOf({ targets: [t], actor: false }, false)}
              onDecide={(apply) => onDecide({ targets: [t], actor: false }, apply)}
            />
          ))}
        </ul>
      )}

      {!progress && actorDecidable(a) && (
        <ActorCosts
          attack={a}
          cast={cast}
          systeme={systeme}
          only={decidable.length === 0}
          busy={isBusy}
          onDecide={(apply) => onDecide({ targets: [], actor: true }, apply)}
        />
      )}

      {!progress && decidable.length > 0 && (
        <footer className="flex items-center gap-1.5 px-3 pb-3 pt-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onDecide(all, true)}
            loading={busy === keyOf(all, true)}
            disabled={isBusy}
            aria-keyshortcuts={first ? 'Enter' : undefined}
          >
            {single ? <Check /> : <CheckCheck />}
            {single ? 'Appliquer' : `Tout appliquer (${decidable.length})`}
            {first && (
              <kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1 font-sans text-[10px] leading-4 opacity-80 sm:inline">
                ↵
              </kbd>
            )}
          </Button>
          <Info texte="Modifier avant d’appliquer" cote="bottom">
            <Button
              size="icon-sm"
              variant="secondary"
              onClick={onEdit}
              disabled={isBusy}
              aria-label="Modifier avant d’appliquer"
            >
              <Pencil />
            </Button>
          </Info>
          {single && (
            <Info texte="Ne pas appliquer" cote="bottom">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onDecide({ targets: decidable, actor: false }, false)}
                loading={busy === keyOf({ targets: decidable, actor: false }, false)}
                disabled={isBusy}
                aria-label="Ne pas appliquer"
                aria-keyshortcuts={first ? 'Delete' : undefined}
              >
                <X />
              </Button>
            </Info>
          )}
        </footer>
      )}
    </article>
  );
}

function Portrait({
  name,
  src,
  ring = 'ring-border',
}: {
  name: string;
  src: string | null;
  ring?: string;
}) {
  return (
    <Illustration
      src={src}
      graine={name}
      position="top"
      className={cn('size-7 shrink-0 rounded-full ring-2', ring)}
    />
  );
}

function outcomeOf(t: AttackTarget, successRule: boolean) {
  return outcomeLabel(t.result?.outcome ?? t.view?.outcome ?? null, successRule);
}

function OutcomePill({ target, successRule }: { target: AttackTarget; successRule: boolean }) {
  const o = outcomeOf(target, successRule);
  if (!o) return null;
  return (
    <motion.span
      key={o.label}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING}
      className="shrink-0"
    >
      <Badge ton={TONES[o.tone]} className="font-bold uppercase tracking-wide">
        {o.label}
      </Badge>
    </motion.span>
  );
}

/** Auto-attaque, hors tour, ajusté à la main, caché. */
function Marks({ attack: a }: { attack: Attack }) {
  const self = a.targets.some((t) => t.characterId === a.attackerId);
  if (!self && !a.outOfTurn && !a.adjustments && a.visibility === 'public') return null;
  return (
    <div className="-mt-1 flex flex-wrap gap-1 pb-1.5 pl-4 pr-3">
      {self && (
        <Badge ton="danger" className="font-bold uppercase tracking-wide">
          <Skull />
          Auto-attaque
        </Badge>
      )}
      {a.outOfTurn && <Badge ton="alerte">Hors tour</Badge>}
      {a.adjustments && <Badge ton="info">Ajusté à la main</Badge>}
      {a.visibility !== 'public' && (
        <Badge>
          <EyeOff />
          {a.visibility === 'gm' ? 'Caché' : 'Privé'}
        </Badge>
      )}
    </div>
  );
}

/** Attaque pas encore résolue : défense ou dés attendus, en discret. */
function InProgress({ attack: a }: { attack: Attack }) {
  const reacting = a.targets.some((t) => t.status === 'awaiting_reaction');
  return (
    <p className="flex items-center gap-2 pb-3 pl-4 pr-3 text-xs text-muted-foreground">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1 rounded-full bg-warning"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </span>
      {reacting ? 'Défense attendue' : 'Dés en cours de lancer'}
    </p>
  );
}

/** Une cible : la valeur en gros chiffre, les réductions en info-bulle. */
function SingleBody({
  attack: a,
  target: t,
  cast,
  systeme,
  presentation,
}: {
  attack: Attack;
  target: AttackTarget;
  cast: Cast;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
}) {
  const amounts = targetAmounts(t);
  const type = cast.get(t.characterId)?.type;
  const others = (t.result?.modifications ?? []).filter(
    (m) => m.entity === 'target' && m.kind === 'entry',
  );
  if (!amounts.length && !others.length)
    return (
      <p className="pb-1 pl-4 pr-3 text-xs text-subtle">
        {isDecidable(t) ? 'Aucune valeur à appliquer.' : null}
      </p>
    );
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-1 pb-1 pl-4 pr-3">
      {amounts.map((m, i) => (
        <Amount
          key={`${a.id}:${i}`}
          m={m}
          label={attributeLabel(systeme, m.attribute, type)}
          sub={m.damageType ? damageTypeName(systeme, m.damageType) : null}
          danger={harmful(m, presentation)}
          size="lg"
          systeme={systeme}
        />
      ))}
      {others.length > 0 && (
        <span className="flex flex-wrap gap-1 pb-1">
          {others.map((m, i) => (
            <span
              key={i}
              className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px]"
            >
              {modificationText(systeme, toInput(m), type)}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function Amount({
  m,
  label,
  sub,
  danger,
  size,
  systeme,
}: {
  m: ReturnType<typeof targetAmounts>[number];
  label: string;
  sub: string | null;
  danger: boolean;
  size: 'lg' | 'sm';
  systeme: SystemeCharge | null;
}) {
  const r = reductionDetail(m);
  const value = `${m.operation === 'add' ? '+' : '−'}${m.value}`;
  const number = (
    <span className="flex items-baseline gap-1">
      <motion.span
        key={value}
        initial={{ scale: 0.6, opacity: 0, y: 4 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={SPRING}
        className={cn(
          'font-mono font-bold leading-none tabular-nums',
          size === 'lg' ? 'text-3xl' : 'text-lg',
          danger ? 'text-destructive' : 'text-success',
        )}
      >
        {value}
      </motion.span>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {sub && size === 'lg' && <span className="text-[11px] text-subtle">{sub}</span>}
      {r && <ShieldHalf className="size-3.5 self-center text-info" aria-label="Réduit" />}
    </span>
  );
  if (!r) return number;
  return (
    <Info
      cote="bottom"
      texte={
        <span className="block space-y-0.5 text-xs">
          <span className="block font-mono tabular-nums">
            {r.raw}
            {r.damageType ? ` ${damageTypeName(systeme, r.damageType)}` : ''} brut
          </span>
          {r.lines.map((l, j) => (
            <span key={j} className={cn('block', l.ignored && 'line-through opacity-60')}>
              {l.name} <span className="font-mono">{l.effect}</span>
            </span>
          ))}
          <span className="block font-mono font-semibold tabular-nums">= {r.result}</span>
        </span>
      }
    >
      <span
        tabIndex={0}
        className="cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {number}
      </span>
    </Info>
  );
}

/** Une cible parmi plusieurs : issue, valeur, appliquer ou non. */
function TargetRow({
  attack: a,
  target: t,
  cast,
  systeme,
  presentation,
  successRule,
  busy,
  loadingApply,
  loadingSkip,
  onDecide,
}: {
  attack: Attack;
  target: AttackTarget;
  cast: Cast;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  successRule: boolean;
  busy: boolean;
  loadingApply: boolean;
  loadingSkip: boolean;
  onDecide(apply: boolean): void;
}) {
  const m = cast.get(t.characterId);
  const name = m?.name ?? 'Personnage';
  const decidable = isDecidable(t);
  const amounts = targetAmounts(t);
  return (
    <motion.li
      layout="position"
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-surface/60 py-1 pl-1.5 pr-1 transition-opacity',
        !decidable && 'opacity-55',
      )}
    >
      <Portrait name={name} src={m?.portraitUrl ?? null} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{name}</span>
      </span>
      <OutcomePill target={t} successRule={successRule} />
      <span className="flex shrink-0 gap-2">
        {amounts.map((x, i) => (
          <Amount
            key={`${a.id}:${t.characterId}:${i}`}
            m={x}
            label={attributeLabel(systeme, x.attribute, m?.type)}
            sub={null}
            danger={harmful(x, presentation)}
            size="sm"
            systeme={systeme}
          />
        ))}
      </span>
      {decidable ? (
        <span className="flex shrink-0">
          <Button
            size="icon-xs"
            variant="ghost"
            className="text-success hover:text-success"
            onClick={() => onDecide(true)}
            loading={loadingApply}
            disabled={busy}
            aria-label={`Appliquer à ${name}`}
          >
            <Check />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onDecide(false)}
            loading={loadingSkip}
            disabled={busy}
            aria-label={`Ne pas appliquer à ${name}`}
          >
            <X />
          </Button>
        </span>
      ) : (
        <span className="grid size-7 shrink-0 place-items-center text-subtle" aria-hidden>
          {t.decision === 'applied' ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <X className="size-3.5" />
          )}
        </span>
      )}
    </motion.li>
  );
}

/** Coûts de l'attaquant (stress, munitions…) : appliqués avec « Appliquer », ou à part. */
function ActorCosts({
  attack: a,
  cast,
  systeme,
  only,
  busy,
  onDecide,
}: {
  attack: Attack;
  cast: Cast;
  systeme: SystemeCharge | null;
  /** Plus que les coûts à décider : leurs propres boutons. */
  only: boolean;
  busy: boolean;
  onDecide(apply: boolean): void;
}) {
  const attacker = cast.get(a.attackerId);
  return (
    <div className="mx-3 mt-1 flex items-center gap-2 rounded-xl border border-dashed border-border-strong px-2.5 py-1.5 text-[11px] text-muted-foreground">
      <Battery className="size-3.5 shrink-0 text-warning" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        Coûts de {attacker?.name ?? 'l’attaquant'} :{' '}
        {a
          .actor!.modifications.map((m) => modificationText(systeme, toInput(m), attacker?.type))
          .join(', ')}
      </span>
      {only && (
        <span className="flex shrink-0 gap-1">
          <Button size="xs" variant="secondary" onClick={() => onDecide(true)} disabled={busy}>
            <Check />
            Appliquer
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onDecide(false)}
            disabled={busy}
            aria-label="Ne pas appliquer les coûts"
          >
            <X />
          </Button>
        </span>
      )}
    </div>
  );
}

// ─── Confirmation ────────────────────────────────────────────────────────────

/** « Appliqué : −7 PV à Gobelin », « Non appliqué », « Écarté ». */
function settledMessage(
  a: Attack,
  nameOf: (id: string) => string,
  systeme: SystemeCharge | null,
  cast: Cast,
): { message: string; applied: boolean } {
  const parts = a.targets.flatMap((t) => {
    if (t.decision !== 'applied' || !t.applied) return [];
    const who = t.applied.redirectedTo ?? t.characterId;
    const values = t.applied.modifications
      .filter((m) => m.kind === 'attribute')
      .map((m) => modificationText(systeme, toInput(m), cast.get(who)?.type));
    return [`${values.length ? values.join(', ') : 'effets'} à ${nameOf(who)}`];
  });
  if (parts.length) return { message: `Appliqué : ${parts.join(' · ')}`, applied: true };
  if (a.status === 'dismissed') return { message: 'Rapport écarté', applied: false };
  return { message: 'Non appliqué', applied: false };
}

function SettledCard({
  settled: s,
  busy,
  onUndo,
  onClose,
}: {
  settled: Settled;
  busy: boolean;
  onUndo(s: Settled): void;
  onClose(): void;
}) {
  return (
    <div
      role="status"
      className={cn(GLASS, 'relative flex items-center gap-2.5 overflow-hidden py-2 pl-3 pr-1.5')}
    >
      <CheckMark applied={s.applied} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.message}</span>
      {s.applied && (
        <Button size="xs" variant="ghost" onClick={() => onUndo(s)} loading={busy}>
          <Undo2 />
          Annuler
        </Button>
      )}
      <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="Fermer">
        <X />
      </Button>
      {/* Le temps qui reste avant que la carte s'en aille */}
      <motion.span
        aria-hidden
        className={cn(
          'absolute inset-x-0 bottom-0 h-0.5 origin-left',
          s.applied ? 'bg-success/60' : 'bg-border-strong',
        )}
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: SETTLED_MS / 1000, ease: 'linear' }}
      />
    </div>
  );
}

/** Coche tracée (appliqué) ou trait (non appliqué), dans un disque qui se pose. */
function CheckMark({ applied }: { applied: boolean }) {
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full',
        applied ? 'bg-success/15 text-success' : 'bg-surface-3 text-muted-foreground',
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3}>
        <motion.path
          d={applied ? 'M5 12.5l4.5 4.5L19 7.5' : 'M7 12h10'}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </motion.span>
  );
}
