'use client';

/**
 * Étapes « Jet » et « Fin » du menu d'attaque (docs/combat.md § 12.1, 3 et 4), mises en scène
 * comme l'ancienne page : attente (défense de la cible, dés), grand chiffre du jet (dés + mod
 * = total, ou les symboles), TOUCHÉ ou RATÉ, puis le grand chiffre des dégâts et leur détail ;
 * une rangée par cible s'il y en a plusieurs. Puis « Rapport envoyé au MJ » et son statut en
 * direct.
 *
 * Étape B : le serveur tire les dés (`serverRunner`), rien ne roule vers une face choisie :
 * le résultat apparaît, il n'est pas « lancé ». Le branchement des dés 3D (étape C) reste
 * celui de `dice-steps.ts`.
 */
import type { Attack } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import {
  Ban,
  Check,
  ChevronDown,
  Crown,
  Dices,
  Send,
  Shield,
  Skull,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Message } from '@/components/compte/elements';
import { DesDuJet } from '@/components/des/resultat-jet';
import { DesSymboles, ResultatsSymboles } from '@/components/fiche/symboles';
import { Badge } from '@/components/ui/badge';
import { hasSuccessRule } from '@/lib/combat/actions';
import { combatErrorMessage } from '@/lib/combat/api';
import { declaredStage } from '@/lib/combat/attack-flow';
import {
  revealTimeline,
  sharedRoll,
  summarizeTarget,
  type DamageFigure,
  type RollFigure,
  type TargetSummary,
} from '@/lib/combat/attack-flow-result';
import { attackMenu } from '@/lib/combat/attack-menu-store';
import { serverRunner } from '@/lib/combat/dice-steps';
import { ATTACK_STATUS_LABELS, useAttack, type useAttackCommands } from '@/lib/combat/use-attacks';
import { awaitingReaction, targetName, type OutcomeTone } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { ResultCard } from './result-card';
import type { AttackContext } from './use-attack-context';
import type { OpenFlow } from './use-attack-model';

type Commands = ReturnType<typeof useAttackCommands>;

// ─── Suivi en direct ─────────────────────────────────────────────────────────

/**
 * Attaque déclarée, tenue à jour en direct (la machine suit la dernière version : « Mêmes
 * cibles » part de là) ; ses étapes de dés sont confiées au serveur (étape B).
 */
export function useDeclaredAttack(flow: OpenFlow, commands: Commands): Attack | null {
  const declared = flow.phase === 'declared' ? flow.attack : null;
  const live = useAttack(flow.campaignId, declared?.id ?? null);
  const attack = !declared
    ? null
    : live.attack && live.attack.id === declared.id && live.attack.version >= declared.version
      ? live.attack
      : declared;

  useEffect(() => {
    if (declared && live.attack?.id === declared.id && live.attack.version > declared.version)
      attackMenu.dispatch({ type: 'attackUpdated', attack: live.attack });
  }, [declared, live.attack]);

  // Dés à lancer (étape C à venir) : le serveur tire, rien n'est animé
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!attack || attack.status !== 'awaiting_dice') return;
    for (const step of attack.pendingSteps) {
      if (sent.current.has(step.id)) continue;
      sent.current.add(step.id);
      void serverRunner
        .run(step)
        .then((body) => commands.submitDice(attack.id, body))
        .catch((err) => toast.error(combatErrorMessage(err)));
    }
  }, [attack, commands]);
  return attack;
}

// ─── Jet ─────────────────────────────────────────────────────────────────────

export function StepRoll({
  attack,
  ctx,
  systeme,
  presentation,
  instant,
  revealed,
  onRevealed,
}: {
  /** null : la déclaration part. */
  attack: Attack | null;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  /** Mouvement réduit, ou attaque rouverte : tout d'un coup. */
  instant: boolean;
  revealed: boolean;
  onRevealed: () => void;
}) {
  if (!attack) return <Waiting title="Envoi de l’attaque…" />;
  const stage = declaredStage(attack);
  if (stage === 'reactions') {
    const waiting = awaitingReaction(attack);
    return (
      <Waiting
        icon={Shield}
        title={`Défense de ${waiting.map((t) => targetName(t.characterId, ctx.known)).join(', ') || 'la cible'}…`}
        subtitle="La cible choisit sa réaction avant le jet."
      />
    );
  }
  if (stage === 'dice')
    return <Waiting title="Les dés roulent…" subtitle="Le serveur lance les dés de l’attaque." />;
  if (stage === 'cancelled')
    return (
      <Centered>
        <Ban className="mx-auto size-10 text-subtle" aria-hidden />
        <p className="mt-3 font-display text-2xl font-semibold">Attaque abandonnée</p>
      </Centered>
    );
  return (
    <Result
      key={attack.id}
      attack={attack}
      ctx={ctx}
      systeme={systeme}
      presentation={presentation}
      instant={instant}
      revealed={revealed}
      onRevealed={onRevealed}
    />
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center text-center">
      <div>{children}</div>
    </div>
  );
}

function Waiting({
  title,
  subtitle,
  icon: Icon = Dices,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  return (
    <div
      role="status"
      className="flex min-h-[18rem] flex-col items-center justify-center gap-5 text-center"
    >
      <div className="relative grid size-24 place-items-center">
        <span aria-hidden className="absolute inset-0 rounded-full border-4 border-border" />
        <span
          aria-hidden
          className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary motion-reduce:animate-none"
        />
        <Icon className="size-8 text-primary" aria-hidden />
      </div>
      <div>
        <p className="font-display text-2xl font-semibold">{title}</p>
        {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

/** Nom d'un attribut du système (clé sinon), pour les modifications montrées au MJ. */
function attributeNamer(systeme: SystemeCharge) {
  return (key: string) => {
    for (const e of systeme.entites.values()) {
      const a = e.attributs.get(key);
      if (a) return a.nom;
    }
    return key;
  };
}

function Result({
  attack,
  ctx,
  systeme,
  presentation,
  instant,
  revealed,
  onRevealed,
}: {
  attack: Attack;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  instant: boolean;
  revealed: boolean;
  onRevealed: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const quick = instant || reduced;
  const successRule = hasSuccessRule(systeme.actions.get(attack.action.id));
  const attributeName = attributeNamer(systeme);
  const summaries = attack.targets.map((t) =>
    summarizeTarget(attack, t, { successRule, attributeName }),
  );
  const shared = sharedRoll(attack);
  const t = revealTimeline({
    targets: summaries.length,
    damage: summaries.some((s) => s.damage),
    instant: quick,
  });
  const done = useRef(onRevealed);
  done.current = onRevealed;
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), t.done);
    return () => window.clearTimeout(id);
    // Une fois par attaque montrée, même si elle se met à jour (décision du MJ)
  }, [attack.id]);
  const failed = attack.status === 'failed';
  const first = summaries[0];

  return (
    <div className="space-y-6" aria-live="polite">
      {failed && (
        <Message>
          Refusée par les règles
          {summaries.find((s) => s.error)?.error
            ? ` : ${summaries.find((s) => s.error)!.error}`
            : '.'}
        </Message>
      )}
      {shared && first?.figure && (
        <BigRoll
          figure={first.figure}
          systeme={systeme}
          presentation={presentation}
          quick={quick}
        />
      )}
      {summaries.length === 1 && first ? (
        <SingleOutcome summary={first} successRule={successRule} delays={t} quick={quick} />
      ) : (
        <ul className="mx-auto max-w-3xl space-y-2.5">
          {summaries.map((s, i) => (
            <TargetRow
              key={s.characterId}
              summary={s}
              ctx={ctx}
              systeme={systeme}
              presentation={presentation}
              showRoll={!shared}
              delay={quick ? 0 : (t.outcome + i * 120) / 1000}
              damageDelay={quick ? 0 : (t.damage + i * 120) / 1000}
              successRule={successRule}
              quick={quick}
            />
          ))}
        </ul>
      )}
      {revealed && (
        <Details attack={attack} ctx={ctx} systeme={systeme} presentation={presentation} />
      )}
    </div>
  );
}

// ─── Grand chiffre ───────────────────────────────────────────────────────────

const signed = (n: number) => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);

function BigRoll({
  figure,
  systeme,
  presentation,
  quick,
}: {
  figure: RollFigure;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  quick: boolean;
}) {
  const pop = quick
    ? {}
    : {
        initial: { scale: 0.55, opacity: 0 },
        animate: { scale: 1, opacity: 1 },
        transition: { type: 'spring' as const, stiffness: 260, damping: 20 },
      };
  if (figure.kind === 'symbols')
    return (
      <motion.div {...pop} className="mx-auto flex max-w-xl flex-col items-center gap-3">
        <ResultatsSymboles
          systeme={systeme}
          presentation={presentation}
          resultats={figure.roll.results}
        />
        <DesSymboles
          systeme={systeme}
          presentation={presentation}
          des={figure.roll.dice.map((x) => ({ de: x.die, face: x.face, symboles: x.symbols }))}
        />
      </motion.div>
    );
  return (
    <div className="flex flex-col items-center text-center">
      <motion.p
        {...pop}
        aria-label={`Total du jet : ${figure.total}`}
        className="bg-gradient-to-b from-foreground to-muted-foreground bg-clip-text font-display text-[5.5rem] font-bold leading-none tabular-nums text-transparent sm:text-[8.5rem]"
      >
        {figure.total}
      </motion.p>
      <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-border bg-surface/80 px-5 py-2 font-mono text-lg tabular-nums shadow-surface">
        <span>{figure.dice}</span>
        {figure.modifier !== 0 && <span className="text-info">{signed(figure.modifier)}</span>}
        <span className="text-subtle">=</span>
        <span className="font-bold">{figure.total}</span>
      </div>
      <div className="mt-3">
        <DesDuJet
          taille="sm"
          entree={!quick}
          groupes={figure.roll.dice.map((g) => ({
            faces: g.faces,
            total: g.values.filter((v) => v.kept).reduce((s, v) => s + v.value, 0),
            dice: g.values.map((v) => ({ value: v.value, kept: v.kept, exploded: v.exploded })),
          }))}
        />
      </div>
      <p className="mt-2 max-w-full truncate font-mono text-[11px] uppercase tracking-[0.2em] text-subtle">
        {figure.formula}
        {figure.bonuses.length > 0 &&
          ` · ${figure.bonuses.map((b) => `${b.name} ${b.value >= 0 ? '+' : ''}${b.value}`).join(', ')}`}
      </p>
    </div>
  );
}

const OUTCOME_STYLE: Record<OutcomeTone, { className: string; icon: LucideIcon }> = {
  success: { className: 'text-success', icon: Check },
  critical: { className: 'text-primary', icon: Crown },
  fumble: { className: 'text-destructive', icon: Skull },
  failure: { className: 'text-destructive', icon: X },
  neutral: { className: 'text-muted-foreground', icon: Dices },
};

function damageTone(d: DamageFigure, successRule: boolean) {
  if (d.sense === 'add') return 'text-success';
  if (d.sense === 'subtract' || successRule) return 'text-destructive';
  return 'text-primary';
}

function SingleOutcome({
  summary,
  successRule,
  delays,
  quick,
}: {
  summary: TargetSummary;
  successRule: boolean;
  delays: { outcome: number; damage: number };
  quick: boolean;
}) {
  const o = summary.outcome;
  const style = o ? OUTCOME_STYLE[o.tone] : null;
  const enter = (delay: number) =>
    quick
      ? {}
      : {
          initial: { opacity: 0, scale: 0.7 },
          animate: { opacity: 1, scale: 1 },
          transition: { delay: delay / 1000, type: 'spring' as const, stiffness: 300, damping: 22 },
        };
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {summary.error && <Message>{summary.error}</Message>}
      {o && style && (
        <motion.p
          {...enter(delays.outcome)}
          className={cn(
            'flex items-center gap-3 font-display text-4xl font-black uppercase tracking-[0.18em] sm:text-6xl',
            style.className,
          )}
        >
          <style.icon className="size-9 sm:size-12" strokeWidth={2.5} aria-hidden />
          {o.label}
        </motion.p>
      )}
      {summary.damage && (
        <motion.div {...enter(delays.damage)} className="flex flex-col items-center">
          <p
            className={cn(
              'font-display text-7xl font-bold leading-none tabular-nums sm:text-[7rem]',
              damageTone(summary.damage, successRule),
            )}
          >
            {summary.damage.value}
          </p>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            {summary.damage.name ?? 'Valeur'}
          </p>
          <DamageDetails damage={summary.damage} className="mt-3 justify-center" />
        </motion.div>
      )}
    </div>
  );
}

function DamageDetails({ damage, className }: { damage: DamageFigure; className?: string }) {
  if (!damage.details.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {damage.details.map((d, i) => (
        <li
          key={`${d.label}-${i}`}
          className="rounded-full border border-border bg-surface/70 px-2.5 py-0.5 text-[12px]"
        >
          <span className="text-subtle">{d.label}</span>{' '}
          <span className="font-mono font-medium">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

function TargetRow({
  summary,
  ctx,
  systeme,
  presentation,
  showRoll,
  delay,
  damageDelay,
  successRule,
  quick,
}: {
  summary: TargetSummary;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  showRoll: boolean;
  delay: number;
  damageDelay: number;
  successRule: boolean;
  quick: boolean;
}) {
  const name = targetName(summary.characterId, ctx.known);
  const o = summary.outcome;
  const style = o ? OUTCOME_STYLE[o.tone] : null;
  const fig = summary.figure;
  const fade = (d: number) =>
    quick
      ? {}
      : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, transition: { delay: d } };
  return (
    <motion.li
      {...fade(Math.max(0, delay - 0.3))}
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border bg-surface/70 px-4 py-3',
        o?.tone === 'success' || o?.tone === 'critical'
          ? 'border-success/25'
          : o?.tone === 'failure' || o?.tone === 'fumble'
            ? 'border-destructive/25'
            : 'border-border',
      )}
    >
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
        <Illustration
          src={ctx.known.get(summary.characterId)?.portraitUrl}
          graine={name}
          className="size-10 shrink-0 rounded-full ring-2 ring-destructive/60"
        />
        <span className="truncate font-medium">{name}</span>
      </div>
      {showRoll && fig && (
        <div className="flex items-center gap-2">
          {fig.kind === 'numeric' ? (
            <>
              <span className="font-display text-3xl font-bold tabular-nums">{fig.total}</span>
              <span className="font-mono text-[12px] text-subtle">
                {fig.dice} {fig.modifier ? signed(fig.modifier) : ''}
              </span>
            </>
          ) : (
            <ResultatsSymboles
              systeme={systeme}
              presentation={presentation}
              resultats={fig.roll.results}
            />
          )}
        </div>
      )}
      {o && style && (
        <motion.span
          {...fade(delay)}
          className={cn(
            'inline-flex items-center gap-1.5 font-display text-lg font-black uppercase tracking-[0.14em]',
            style.className,
          )}
        >
          <style.icon className="size-5" strokeWidth={2.5} aria-hidden />
          {o.label}
        </motion.span>
      )}
      {summary.damage && (
        <motion.span {...fade(damageDelay)} className="flex items-baseline gap-2">
          <span
            className={cn(
              'font-display text-3xl font-bold tabular-nums',
              damageTone(summary.damage, successRule),
            )}
          >
            {summary.damage.value}
          </span>
          <span className="text-[12px] uppercase tracking-wider text-muted-foreground">
            {summary.damage.name ?? 'Valeur'}
          </span>
        </motion.span>
      )}
      {summary.error && <p className="basis-full text-[13px] text-destructive">{summary.error}</p>}
      {summary.damage && summary.damage.details.length > 0 && (
        <DamageDetails damage={summary.damage} className="basis-full" />
      )}
    </motion.li>
  );
}

/** Détail repliable : dés, déroulé, et pour le MJ les modifications proposées. */
function Details({
  attack,
  ctx,
  systeme,
  presentation,
}: {
  attack: Attack;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
}) {
  const [open, setOpen] = useState(false);
  const successRule = hasSuccessRule(systeme.actions.get(attack.action.id));
  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
        {open ? 'Masquer le détail' : 'Voir le détail'}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 grid gap-2.5 md:grid-cols-2"
          >
            {attack.targets.map((t) => (
              <ResultCard
                key={t.characterId}
                attack={attack}
                target={t}
                known={ctx.known}
                systeme={systeme}
                presentation={presentation}
                successRule={successRule}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Fin ─────────────────────────────────────────────────────────────────────

/** « Rapport envoyé au MJ » et son statut en direct (§ 12.1, 4). */
export function ReportStatus({ attack, gm }: { attack: Attack; gm: boolean }) {
  const decided = attack.targets.filter((t) => t.decision !== 'pending').length;
  const label =
    attack.status === 'pending'
      ? gm
        ? 'Rapport en attente : décidez dans le panneau Combat'
        : 'Rapport envoyé au MJ'
      : ATTACK_STATUS_LABELS[attack.status];
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-2 text-[13px] text-muted-foreground"
    >
      <Send className="size-4 text-primary" aria-hidden />
      <span>{label}</span>
      {attack.targets.length > 1 && attack.status === 'pending' && decided > 0 && (
        <Badge ton="info">
          {decided}/{attack.targets.length} décidées
        </Badge>
      )}
      {attack.outOfTurn && <Badge ton="alerte">hors tour</Badge>}
      {attack.selfTarget && <Badge ton="alerte">auto-attaque</Badge>}
      {attack.visibility === 'gm' && <Badge>caché</Badge>}
      {attack.adjustments && <Badge ton="alerte">ajusté à la main</Badge>}
    </div>
  );
}
