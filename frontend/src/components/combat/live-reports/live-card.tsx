'use client';

/**
 * Cartes de la pile des rapports en direct (docs/combat.md § 12.6), sur le modèle des rapports
 * de l'ancienne app (liseré, Touché ou Raté, cases Jet et Dégâts, Appliquer) dans la matière du
 * lanceur de dés :
 *
 * - `ReportCard` : la carte dépliée, une seule à la fois ; qui attaque qui, le jet (total et dés
 *   du lanceur), la valeur à appliquer, puis Appliquer, Modifier, Ne pas appliquer ;
 * - `ReportRow` : les autres rapports à décider, en une ligne, décidables d'un clic ;
 * - `ProgressRow` : attaque en cours (défense, dés), avec Tirer et Abandonner ;
 * - `SettledRow` : confirmation d'une décision, avec Annuler.
 */
import type { Attack, AttackTarget } from '@vtt/contracts';
import { Battery, Check, CheckCheck, Dices, MoveRight, Pencil, Undo2, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { attributeLabel, damageTypeName, modificationText } from '../reports/labels';
import {
  actorDecidable,
  decidableTargets,
  isDecidable,
  targetAmounts,
  toInput,
} from '../reports/model';
import { CARD, CTA, QUIET, RAIL, TOUCH, washOf } from './look';
import { SETTLED_MS } from './model';
import {
  Amount,
  Duel,
  Extras,
  Figure,
  Marks,
  OutcomeBadge,
  Portrait,
  readReport,
  RollFigure,
} from './parts';
import {
  scopeKey,
  wholeScope,
  type LiveReports,
  type Scope,
  type Settled,
} from './use-live-reports';

type Live = Pick<
  LiveReports,
  'cast' | 'systeme' | 'presentation' | 'busy' | 'decide' | 'setDeciding' | 'setFocus'
>;

/** Raté sans rien à appliquer : l'action principale classe le rapport. */
export function nothingToApply(a: Attack): boolean {
  return (
    !actorDecidable(a) && decidableTargets(a).every((t) => !(t.result?.modifications ?? []).length)
  );
}

/**
 * Décision d'un clic d'un rapport replié (et touches Entrée, Suppr) : tout appliquer (ou classer
 * un raté), ou ne pas appliquer ; les coûts seuls de l'attaquant se décident de même.
 */
export function rowDecision(a: Attack): { applyLabel: string; skip: Scope; canSkip: boolean } {
  const decidable = decidableTargets(a);
  const costsOnly = decidable.length === 0;
  const nothing = nothingToApply(a);
  return {
    applyLabel: costsOnly
      ? 'Appliquer les coûts'
      : nothing
        ? 'Classer'
        : a.targets.length === 1
          ? 'Appliquer'
          : `Tout appliquer (${decidable.length})`,
    skip: costsOnly ? { targets: [], actor: true } : { targets: decidable, actor: false },
    canSkip: costsOnly || (a.targets.length === 1 && !nothing),
  };
}

/** Fond du lanceur : trame de points, halo de l'issue, liseré. */
function Backdrop({ tone }: Readonly<{ tone: Parameters<typeof washOf>[0] }>) {
  return (
    <>
      <span aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-60 mask-radial" />
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{ background: washOf(tone) } as CSSProperties}
      />
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', RAIL[tone])} />
    </>
  );
}

/** « Aragorn → Gobelin » : noms seuls, la flèche dit le sens. */
function Versus({ attacker, versus }: Readonly<{ attacker: string; versus: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="truncate">{attacker}</span>
      <MoveRight className="size-3 shrink-0 text-subtle" aria-hidden />
      <span className="truncate">{versus}</span>
    </span>
  );
}

// ─── Carte dépliée ───────────────────────────────────────────────────────────

export function ReportCard({ attack: a, live }: Readonly<{ attack: Attack; live: Live }>) {
  const { cast, systeme, busy } = live;
  const r = readReport(a, cast, systeme);
  const decidable = decidableTargets(a);
  const single = a.targets.length === 1;
  const t0 = a.targets[0];
  const all = wholeScope(a);
  const nothing = nothingToApply(a);
  const isBusy = busy !== null && busy.startsWith(`${a.id}:`);
  const skip: Scope = { targets: decidable, actor: false };
  const numeric = t0 ? (t0.result?.roll ?? t0.view?.roll)?.kind === 'numeric' : false;

  return (
    <article
      aria-label={`${a.action.name} : ${r.attackerName} contre ${r.targetNames.join(', ')}`}
      className={cn(CARD, 'ring-1 ring-primary/25')}
    >
      <Backdrop tone={r.tone} />

      <header className="flex items-center gap-3 pb-1 pl-4 pr-3 pt-3">
        <Duel attack={a} cast={cast} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] font-semibold leading-tight">
            {r.title}
          </span>
          <Versus attacker={r.attackerName} versus={r.versus} />
        </span>
        {single && t0 && <OutcomeBadge target={t0} successRule={r.successRule} hitOnly={numeric} />}
      </header>

      <Marks attack={a} className="pl-4 pr-3 pt-1.5" />

      {single && t0 ? (
        <SingleTarget attack={a} target={t0} live={live} />
      ) : (
        <ul className="space-y-1 pl-3 pr-2 pt-2.5">
          {a.targets.map((t) => (
            <TargetRow key={t.characterId} attack={a} target={t} live={live} />
          ))}
        </ul>
      )}

      {actorDecidable(a) && (
        <ActorCosts attack={a} live={live} only={decidable.length === 0} busy={isBusy} />
      )}

      {decidable.length > 0 && (
        <footer className="flex items-center gap-1.5 px-3 pb-3 pt-3">
          <Info texte={nothing ? 'Classer (Entrée)' : 'Appliquer (Entrée)'} cote="bottom">
            <Button
              size="sm"
              variant={nothing ? 'secondary' : 'default'}
              className={cn('h-9 flex-1', nothing ? QUIET : CTA)}
              onClick={() => void live.decide(a, all, !nothing)}
              loading={busy === scopeKey(a, all, !nothing)}
              disabled={isBusy}
              aria-keyshortcuts="Enter"
            >
              {nothing ? <Check /> : single ? <Check /> : <CheckCheck />}
              {nothing ? 'Classer' : single ? 'Appliquer' : `Tout appliquer (${decidable.length})`}
            </Button>
          </Info>
          <Info texte="Modifier" cote="bottom">
            <Button
              size="icon"
              variant="secondary"
              className={cn('rounded-xl', TOUCH)}
              onClick={() => live.setDeciding(a.id)}
              disabled={isBusy}
              aria-label="Modifier avant d’appliquer"
            >
              <Pencil />
            </Button>
          </Info>
          {single && !nothing && (
            <Info texte="Ne pas appliquer (Suppr)" cote="bottom">
              <Button
                size="icon"
                variant="ghost"
                className={cn('rounded-xl hover:bg-destructive/10 hover:text-destructive', TOUCH)}
                onClick={() => void live.decide(a, skip, false)}
                loading={busy === scopeKey(a, skip, false)}
                disabled={isBusy}
                aria-label="Ne pas appliquer"
                aria-keyshortcuts="Delete"
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

/** Une cible : Jet | valeur principale, séparés d'un filet, puis le reste en pastilles. */
function SingleTarget({
  attack: a,
  target: t,
  live,
}: Readonly<{
  attack: Attack;
  target: AttackTarget;
  live: Live;
}>) {
  const { cast, systeme, presentation } = live;
  const [main] = targetAmounts(t);
  const type = cast.get(t.characterId)?.type;
  return (
    <div className="space-y-2.5 pl-4 pr-3 pt-3">
      <dl className="flex items-stretch">
        <Figure label="Jet" className="flex-[1.4] pr-4">
          <RollFigure attack={a} target={t} systeme={systeme} presentation={presentation} />
        </Figure>
        {main && (
          <Figure
            label={attributeLabel(systeme, main.attribute, type)}
            className="flex-1 border-l border-border pl-4"
          >
            <Amount m={main} systeme={systeme} presentation={presentation} size="lg" />
            {main.damageType && (
              <span className="mt-2 block truncate text-[11px] text-subtle">
                {damageTypeName(systeme, main.damageType)}
              </span>
            )}
          </Figure>
        )}
      </dl>
      <Extras target={t} skip={1} cast={cast} systeme={systeme} presentation={presentation} />
    </div>
  );
}

/** Une cible parmi plusieurs : portrait, issue, valeurs, appliquer ou non. */
function TargetRow({
  attack: a,
  target: t,
  live,
}: Readonly<{
  attack: Attack;
  target: AttackTarget;
  live: Live;
}>) {
  const { cast, systeme, presentation, busy } = live;
  const r = readReport(a, cast, systeme);
  const m = cast.get(t.characterId);
  const name = m?.name ?? 'Personnage';
  const decidable = isDecidable(t);
  const scope: Scope = { targets: [t], actor: false };
  const isBusy = busy !== null && busy.startsWith(`${a.id}:`);
  return (
    <motion.li
      // L'ordre des cibles ne change qu'avec leur nombre
      layout="position"
      layoutDependency={a.targets.length}
      className={cn(
        'flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-0.5 transition-opacity',
        !decidable && 'opacity-50',
      )}
    >
      <Portrait name={name} src={m?.portraitUrl} className="size-8" />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{name}</span>
      <OutcomeBadge target={t} successRule={r.successRule} size="sm" />
      <span className="flex shrink-0 items-baseline gap-2">
        {targetAmounts(t).map((x, i) => (
          <Amount
            key={i}
            m={x}
            systeme={systeme}
            presentation={presentation}
            size="sm"
            label={attributeLabel(systeme, x.attribute, m?.type)}
          />
        ))}
      </span>
      {decidable ? (
        <span className="flex shrink-0">
          <Info texte="Appliquer" cote="bottom">
            <Button
              size="icon-sm"
              variant="ghost"
              className={cn('text-success hover:bg-success/10 hover:text-success', TOUCH)}
              onClick={() => void live.decide(a, scope, true)}
              loading={busy === scopeKey(a, scope, true)}
              disabled={isBusy}
              aria-label={`Appliquer à ${name}`}
            >
              <Check />
            </Button>
          </Info>
          <Info texte="Ne pas appliquer" cote="bottom">
            <Button
              size="icon-sm"
              variant="ghost"
              className={cn('hover:bg-destructive/10 hover:text-destructive', TOUCH)}
              onClick={() => void live.decide(a, scope, false)}
              loading={busy === scopeKey(a, scope, false)}
              disabled={isBusy}
              aria-label={`Ne pas appliquer à ${name}`}
            >
              <X />
            </Button>
          </Info>
        </span>
      ) : (
        <span className="grid size-8 shrink-0 place-items-center" aria-hidden>
          {t.decision === 'applied' ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <X className="size-3.5 text-subtle" />
          )}
        </span>
      )}
    </motion.li>
  );
}

/** Coûts de l'attaquant (stress, munitions…) : appliqués avec le rapport, ou seuls. */
function ActorCosts({
  attack: a,
  live,
  only,
  busy,
}: Readonly<{
  attack: Attack;
  live: Live;
  /** Plus que les coûts à décider : leurs propres boutons. */
  only: boolean;
  busy: boolean;
}>) {
  const attacker = live.cast.get(a.attackerId);
  const costs = a.actor!.modifications.map((m) =>
    modificationText(live.systeme, toInput(m), attacker?.type),
  );
  const scope: Scope = { targets: [], actor: true };
  return (
    <div className="mx-3 mt-2.5 flex items-center gap-2 rounded-xl border border-dashed border-border-strong py-1 pl-2.5 pr-1">
      <Info texte={`Coûts de ${attacker?.name ?? 'l’attaquant'}`} cote="bottom">
        <Battery className="size-3.5 shrink-0 text-warning" aria-label="Coûts de l’attaquant" />
      </Info>
      <span className="min-w-0 flex-1 truncate py-1 text-xs font-medium">{costs.join(', ')}</span>
      {only && (
        <span className="flex shrink-0 gap-0.5">
          <Button
            size="xs"
            className={CTA}
            onClick={() => void live.decide(a, scope, true)}
            loading={busy && live.busy === scopeKey(a, scope, true)}
            disabled={busy}
          >
            <Check />
            Appliquer
          </Button>
          <Info texte="Ne pas appliquer" cote="bottom">
            <Button
              size="icon-xs"
              variant="ghost"
              className="hover:text-destructive"
              onClick={() => void live.decide(a, scope, false)}
              disabled={busy}
              aria-label="Ne pas appliquer les coûts"
            >
              <X />
            </Button>
          </Info>
        </span>
      )}
    </div>
  );
}

// ─── Lignes compactes ────────────────────────────────────────────────────────

/** Ligne d'une carte repliée : fond de carte, liseré, hauteur fixe. */
function Row({
  tone,
  children,
  className,
  ...rest
}: {
  tone: Parameters<typeof washOf>[0];
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <article
      {...rest}
      className={cn(CARD, 'flex min-h-12 items-center gap-2 py-1.5 pl-3 pr-1.5', className)}
    >
      <Backdrop tone={tone} />
      {children}
    </article>
  );
}

/** Rapport à décider, replié : lu d'un coup d'œil, décidé d'un clic, déplié d'un clic. */
export function ReportRow({ attack: a, live }: Readonly<{ attack: Attack; live: Live }>) {
  const { cast, systeme, presentation, busy } = live;
  const r = readReport(a, cast, systeme);
  const single = a.targets.length === 1;
  const t0 = a.targets[0];
  const all = wholeScope(a);
  const nothing = nothingToApply(a);
  const isBusy = busy !== null && busy.startsWith(`${a.id}:`);
  const main = single && t0 ? targetAmounts(t0)[0] : undefined;
  const { applyLabel, skip, canSkip } = rowDecision(a);
  return (
    <Row
      tone={r.tone}
      aria-label={`${a.action.name} : ${r.attackerName} contre ${r.targetNames.join(', ')}`}
    >
      <button
        type="button"
        onClick={() => live.setFocus(a.id)}
        aria-expanded={false}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Duel attack={a} cast={cast} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight">{r.title}</span>
          <Versus attacker={r.attackerName} versus={r.versus} />
        </span>
        {single && t0 && <OutcomeBadge target={t0} successRule={r.successRule} size="sm" />}
        {main && (
          <Amount
            m={main}
            systeme={systeme}
            presentation={presentation}
            size="sm"
            label={attributeLabel(systeme, main.attribute, cast.get(t0!.characterId)?.type)}
            detail={false}
          />
        )}
      </button>
      <span className="flex shrink-0">
        <Info texte={applyLabel} cote="bottom">
          <Button
            size="icon-sm"
            variant="ghost"
            className={cn(
              nothing
                ? 'hover:bg-surface-3'
                : 'text-primary hover:bg-primary/10 hover:text-primary-strong',
              TOUCH,
            )}
            onClick={() => void live.decide(a, all, !nothing)}
            loading={busy === scopeKey(a, all, !nothing)}
            disabled={isBusy}
            aria-label={applyLabel}
          >
            {single || nothing ? <Check /> : <CheckCheck />}
          </Button>
        </Info>
        {canSkip && (
          <Info texte="Ne pas appliquer" cote="bottom">
            <Button
              size="icon-sm"
              variant="ghost"
              className={cn('hover:bg-destructive/10 hover:text-destructive', TOUCH)}
              onClick={() => void live.decide(a, skip, false)}
              loading={busy === scopeKey(a, skip, false)}
              disabled={isBusy}
              aria-label="Ne pas appliquer"
            >
              <X />
            </Button>
          </Info>
        )}
      </span>
    </Row>
  );
}

/**
 * Attaque pas encore résolue : défense ou dés attendus. Le MJ tire la suite par le serveur
 * (auteur parti) ou abandonne : une carte ne reste jamais bloquée.
 */
export function ProgressRow({
  attack: a,
  live,
  onRoll,
  onCancel,
}: Readonly<{
  attack: Attack;
  live: Live;
  onRoll(): void;
  onCancel(): void;
}>) {
  const { cast, systeme, busy } = live;
  const r = readReport(a, cast, systeme);
  const reacting = a.targets.some((t) => t.status === 'awaiting_reaction');
  const canRoll = a.status === 'awaiting_dice' && !a.resolving && a.pendingSteps.length > 0;
  const status = reacting ? 'Défense attendue' : a.resolving ? 'Résolution' : 'Dés attendus';
  const still = useReducedMotion();
  return (
    <Row
      tone="progress"
      aria-label={`${a.action.name} : ${r.attackerName} contre ${r.targetNames.join(', ')}, ${status.toLowerCase()}`}
    >
      <Duel attack={a} cast={cast} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight">{r.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-warning">
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="size-1 rounded-full bg-current"
                animate={still ? { opacity: 0.8 } : { opacity: [0.25, 1, 0.25] }}
                transition={
                  still ? { duration: 0 } : { duration: 1.2, repeat: Infinity, delay: i * 0.18 }
                }
              />
            ))}
          </span>
          <span className="truncate">{status}</span>
        </span>
      </span>
      {canRoll && (
        <Info texte="Le serveur tire les dés restants" cote="bottom">
          <Button
            size="xs"
            variant="secondary"
            className={cn('h-8 px-2.5', QUIET)}
            onClick={onRoll}
            loading={busy === `${a.id}:server`}
            disabled={busy !== null}
          >
            <Dices />
            Tirer
          </Button>
        </Info>
      )}
      <Info texte="Abandonner l’attaque" cote="bottom">
        <Button
          size="icon-sm"
          variant="ghost"
          className={cn('hover:bg-destructive/10 hover:text-destructive', TOUCH)}
          onClick={onCancel}
          loading={busy === `${a.id}:cancel`}
          disabled={busy !== null}
          aria-label="Abandonner l’attaque"
        >
          <X />
        </Button>
      </Info>
    </Row>
  );
}

// ─── Confirmation ────────────────────────────────────────────────────────────

export function SettledRow({
  settled: s,
  busy,
  onUndo,
  onClose,
}: Readonly<{
  settled: Settled;
  busy: boolean;
  onUndo(): void;
  onClose(): void;
}>) {
  return (
    <div
      role="status"
      className={cn(CARD, 'flex min-h-12 items-center gap-2.5 py-1.5 pl-3 pr-1.5')}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          s.applied ? 'bg-success' : 'bg-border-strong',
        )}
      />
      <CheckMark applied={s.applied} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.message}</span>
      {s.applied && (
        <Button
          size="xs"
          variant="ghost"
          className={cn('h-8', TOUCH)}
          onClick={onUndo}
          loading={busy}
        >
          <Undo2 />
          Annuler
        </Button>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className={TOUCH}
        onClick={onClose}
        aria-label="Fermer"
      >
        <X />
      </Button>
      {/* Le temps qui reste avant que la ligne s'en aille */}
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
function CheckMark({ applied }: Readonly<{ applied: boolean }>) {
  return (
    <motion.span
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full',
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
