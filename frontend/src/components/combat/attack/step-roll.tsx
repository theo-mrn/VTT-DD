'use client';

/**
 * Jet et fin du menu d'attaque (docs/combat.md § 12.1) : l'attente (défense de la cible, dés qui
 * roulent), puis le résultat comme le lanceur de dés le montre (les dés, le total en grand,
 * doré sur un critique) et TOUCHÉ ou RATÉ en très grand ; les dégâts à côté, en grand chiffre.
 * Une rangée par cible s'il y en a plusieurs. Enfin le statut du rapport, en direct.
 *
 * Étape B : le serveur tire les dés (`serverRunner`), rien ne roule vers une face choisie : le
 * résultat apparaît, il n'est pas « lancé ». Le branchement des dés 3D (étape C) reste celui de
 * `dice-steps.ts`.
 */
import type { Attack } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { Ban, ChevronDown, Send, Shield } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Illustration } from '@/components/commun/illustration';
import { Message } from '@/components/compte/elements';
import { DeVisuel } from '@/components/des/de-visuel';
import { DesDuJet, TotalJet } from '@/components/des/resultat-jet';
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
import { clientRunner } from '@/lib/combat/dice-steps';
import { isLocalAttack } from '@/lib/combat/local-attack';
import { ATTACK_STATUS_LABELS, useAttack, type useAttackCommands } from '@/lib/combat/use-attacks';
import { awaitingReaction, targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { OUTCOME_STYLE, rollGroups } from './outcome';
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
  // Attaque calculée dans le navigateur, pas encore envoyée : rien à relire au serveur
  const live = useAttack(
    flow.campaignId,
    declared && !isLocalAttack(declared) ? declared.id : null,
  );
  const attack = !declared
    ? null
    : live.attack && live.attack.id === declared.id && live.attack.version >= declared.version
      ? live.attack
      : declared;

  useEffect(() => {
    if (declared && live.attack?.id === declared.id && live.attack.version > declared.version)
      attackMenu.dispatch({ type: 'attackUpdated', attack: live.attack });
  }, [declared, live.attack]);

  // Jet d'attaque : lancé tout seul, dés tirés dans le navigateur ; la suite (dégâts),
  // l'attaquant la déclenche après avoir vu TOUCHÉ ou RATÉ (`stepToLaunch`). Les étapes de
  // chaque attaque s'appellent pareil (`roll-0`) : la clé porte l'attaque.
  const sent = useRef(new Set<string>());
  useEffect(() => {
    if (!attack || attack.status !== 'awaiting_dice' || attack.resolving) return;
    for (const step of attack.pendingSteps) {
      const key = `${attack.id}:${step.id}`;
      if (step.phase !== 'roll' || sent.current.has(key)) continue;
      sent.current.add(key);
      void clientRunner
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
}: Readonly<{
  /** null : la déclaration part. */
  attack: Attack | null;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  /** Mouvement réduit, ou attaque rouverte : tout d'un coup. */
  instant: boolean;
  /** Le résultat a déjà été dévoilé une fois (retour des dégâts) : seuls les dégâts arrivent. */
  revealed: boolean;
  onRevealed: () => void;
}>) {
  if (!attack) return <Waiting title="Envoi de l’attaque…" />;
  const stage = declaredStage(attack);
  if (stage === 'reactions') {
    const waiting = awaitingReaction(attack);
    return (
      <Waiting
        shield
        title={`Défense de ${waiting.map((t) => targetName(t.characterId, ctx.known)).join(', ') || 'la cible'}…`}
      />
    );
  }
  if (stage === 'dice') return <Waiting title="Les dés roulent…" />;
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
      settled={revealed}
      onRevealed={onRevealed}
    />
  );
}

function Centered({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-h-[16rem] flex-col items-center justify-center text-center">
      <div>{children}</div>
    </div>
  );
}

/** Attente : le d20 du lanceur qui tremble (le bouclier pendant la défense). */
function Waiting({ title, shield = false }: Readonly<{ title: string; shield?: boolean }>) {
  return (
    <div
      role="status"
      className="flex min-h-[18rem] flex-col items-center justify-center gap-6 text-center"
    >
      <div className="relative grid size-28 place-items-center">
        <span aria-hidden className="absolute inset-0 rounded-full bg-halo" />
        {shield ? (
          <Shield
            className="size-12 animate-pulse text-primary motion-reduce:animate-none"
            aria-hidden
          />
        ) : (
          <span className="animate-shake-die motion-reduce:animate-none">
            <DeVisuel faces={20} taille="xl" />
          </span>
        )}
      </div>
      <p className="font-display text-2xl font-semibold">{title}</p>
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

/** Libellé discret au-dessus d'une valeur, comme le bandeau de la fiche. */
function Label({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">{children}</p>;
}

const signed = (n: number) => (n >= 0 ? `+ ${n}` : `− ${Math.abs(n)}`);

function Result({
  attack,
  ctx,
  systeme,
  presentation,
  instant,
  settled,
  onRevealed,
}: Readonly<{
  attack: Attack;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  instant: boolean;
  settled: boolean;
  onRevealed: () => void;
}>) {
  const reduced = useReducedMotion() ?? false;
  const quick = instant || reduced;
  // Retour de l'écran des dégâts : le jet est déjà connu, seuls les dégâts arrivent
  const rollQuick = quick || settled;
  const successRule = hasSuccessRule(systeme.actions.get(attack.action.id));
  const attributeName = attributeNamer(systeme);
  const summaries = attack.targets.map((t) =>
    summarizeTarget(attack, t, { successRule, attributeName }),
  );
  const shared = sharedRoll(attack);
  const t = revealTimeline({
    targets: summaries.length,
    damage: summaries.some((s) => s.damage),
    instant: rollQuick,
  });
  const damageDelay = settled && !quick ? 150 : t.damage;
  const done = useRef(onRevealed);
  done.current = onRevealed;
  useEffect(() => {
    const id = window.setTimeout(() => done.current(), t.done);
    return () => window.clearTimeout(id);
    // Une fois par attaque montrée, même si elle se met à jour (décision du MJ)
  }, [attack.id]);
  const failed = attack.status === 'failed';
  const first = summaries[0];
  const glow = first?.outcome ? OUTCOME_STYLE[first.outcome.tone].glow : '--primary';

  return (
    <MotionConfig reducedMotion={rollQuick ? 'always' : 'user'}>
      <div className="relative isolate space-y-6" aria-live="polite">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-80"
          style={{
            background: `radial-gradient(55% 60% at 50% 30%, hsl(var(${glow}) / 0.12), transparent 70%)`,
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-80 bg-dots opacity-60 mask-radial"
        />
        {failed && (
          <Message>
            Refusée par les règles
            {summaries.find((s) => s.error)?.error
              ? ` : ${summaries.find((s) => s.error)!.error}`
              : '.'}
          </Message>
        )}
        {summaries.length === 1 && first ? (
          <Duel
            summary={first}
            systeme={systeme}
            presentation={presentation}
            successRule={successRule}
            quick={rollQuick}
            outcomeDelay={t.outcome}
            damageDelay={damageDelay}
            animateDamage={!quick}
          />
        ) : (
          <>
            {shared && first?.figure && (
              <div className="flex flex-col items-center gap-3">
                <BigRoll
                  figure={first.figure}
                  systeme={systeme}
                  presentation={presentation}
                  quick={rollQuick}
                  critique={first.outcome ? OUTCOME_STYLE[first.outcome.tone].critique : null}
                  cle={attack.id}
                />
              </div>
            )}
            <ul className="mx-auto max-w-3xl space-y-2.5">
              {summaries.map((s, i) => (
                <TargetRow
                  key={s.characterId}
                  summary={s}
                  ctx={ctx}
                  systeme={systeme}
                  presentation={presentation}
                  showRoll={!shared}
                  delay={rollQuick ? 0 : (t.outcome + i * 120) / 1000}
                  damageDelay={quick ? 0 : (damageDelay + i * 120) / 1000}
                  successRule={successRule}
                  quick={rollQuick}
                  animateDamage={!quick}
                />
              ))}
            </ul>
          </>
        )}
        {(settled || quick) && (
          <Details attack={attack} ctx={ctx} systeme={systeme} presentation={presentation} />
        )}
      </div>
    </MotionConfig>
  );
}

// ─── Une cible : le jet, puis les dégâts à côté ──────────────────────────────

function Duel({
  summary,
  systeme,
  presentation,
  successRule,
  quick,
  outcomeDelay,
  damageDelay,
  animateDamage,
}: Readonly<{
  summary: TargetSummary;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  successRule: boolean;
  quick: boolean;
  outcomeDelay: number;
  damageDelay: number;
  animateDamage: boolean;
}>) {
  const o = summary.outcome;
  const style = o ? OUTCOME_STYLE[o.tone] : null;
  const fig = summary.figure;
  // L'état final est toujours donné : passer en affichage instantané ne laisse jamais un
  // élément figé à son état de départ (invisible)
  const pop = (delay: number, on: boolean) => ({
    initial: on ? { opacity: 0, scale: 0.7 } : false,
    animate: { opacity: 1, scale: 1 },
    transition: on
      ? { delay: delay / 1000, type: 'spring' as const, stiffness: 300, damping: 22 }
      : { duration: 0 },
  });
  const damage = summary.damage;
  return (
    <div
      className={cn(
        'mx-auto grid max-w-4xl items-center gap-8',
        damage && 'sm:grid-cols-2 sm:gap-0',
      )}
    >
      <div className="flex flex-col items-center gap-4 text-center">
        {summary.error && <Message>{summary.error}</Message>}
        {fig && (
          <BigRoll
            figure={fig}
            systeme={systeme}
            presentation={presentation}
            quick={quick}
            critique={style?.critique ?? null}
            cle={summary.characterId}
          />
        )}
        {o && style && (
          <motion.p
            {...pop(outcomeDelay, !quick)}
            className="flex items-center gap-3 font-display text-4xl font-black uppercase tracking-[0.18em] sm:text-6xl"
          >
            <style.icon
              className={cn('size-9 shrink-0 sm:size-12', style.tint)}
              strokeWidth={2.5}
              aria-hidden
            />
            <span className={style.text}>{o.label}</span>
          </motion.p>
        )}
      </div>
      {damage && (
        <motion.div
          {...pop(damageDelay, animateDamage)}
          className="flex flex-col items-center gap-3 border-t border-border pt-8 text-center sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0"
        >
          <Label>{damage.name ?? 'Valeur'}</Label>
          <DamageNumber damage={damage} successRule={successRule} size="xl" />
          <DamageDetails damage={damage} className="justify-center" />
        </motion.div>
      )}
    </div>
  );
}

/** Le jet comme le lanceur de dés l'affiche : les dés, le total, le détail. */
function BigRoll({
  figure,
  systeme,
  presentation,
  quick,
  critique,
  cle,
}: Readonly<{
  figure: RollFigure;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  quick: boolean;
  critique: 'success' | 'failure' | null;
  cle: string;
}>) {
  if (figure.kind === 'symbols')
    return (
      <div className="flex max-w-xl flex-col items-center gap-3">
        <Label>Jet</Label>
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
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-3">
      <Label>Jet</Label>
      <DesDuJet taille="md" entree={!quick} groupes={rollGroups(figure.roll)} />
      <div aria-label={`Total du jet : ${figure.total}`}>
        <TotalJet total={figure.total} critique={critique} taille="xl" cle={cle} sansBadge />
      </div>
      <p className="max-w-full truncate font-mono text-xs text-subtle">
        {figure.dice}
        {figure.modifier !== 0 && ` ${signed(figure.modifier)}`} = {figure.total}
        {figure.bonuses.length > 0 && (
          <span className="ml-2">
            (
            {figure.bonuses.map((b) => `${b.name} ${b.value >= 0 ? '+' : ''}${b.value}`).join(', ')}
            )
          </span>
        )}
      </p>
    </div>
  );
}

function damageTone(d: DamageFigure, successRule: boolean) {
  if (d.sense === 'add') return 'text-success';
  if (d.sense === 'subtract' || successRule) return 'text-destructive';
  return 'text-gradient-primary';
}

function DamageNumber({
  damage,
  successRule,
  size,
}: Readonly<{
  damage: DamageFigure;
  successRule: boolean;
  size: 'md' | 'xl';
}>) {
  return (
    <span
      className={cn(
        'font-mono font-bold leading-none tabular',
        size === 'xl' ? 'text-7xl sm:text-8xl' : 'text-3xl',
        damageTone(damage, successRule),
      )}
    >
      {damage.value}
    </span>
  );
}

function DamageDetails({
  damage,
  className,
}: Readonly<{ damage: DamageFigure; className?: string }>) {
  if (!damage.details.length) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {damage.details.map((d, i) => (
        <li
          key={`${d.label}-${i}`}
          className="inline-flex items-baseline gap-1 rounded-md bg-surface-3/80 px-1.5 py-0.5 text-[11px]"
        >
          <span className="text-subtle">{d.label}</span>
          <span className="font-mono font-medium text-foreground">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

// ─── Plusieurs cibles : une rangée chacune ───────────────────────────────────

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
  animateDamage,
}: Readonly<{
  summary: TargetSummary;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  showRoll: boolean;
  delay: number;
  damageDelay: number;
  successRule: boolean;
  quick: boolean;
  animateDamage: boolean;
}>) {
  const name = targetName(summary.characterId, ctx.known);
  const o = summary.outcome;
  const style = o ? OUTCOME_STYLE[o.tone] : null;
  const fig = summary.figure;
  const fade = (d: number, on: boolean) => ({
    initial: on ? { opacity: 0, y: 6 } : false,
    animate: { opacity: 1, y: 0 },
    transition: on ? { delay: d } : { duration: 0 },
  });
  return (
    <motion.li
      {...fade(Math.max(0, delay - 0.3), !quick)}
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-surface-2/50 p-3',
        o?.tone === 'success' || o?.tone === 'critical'
          ? 'border-success/25'
          : o?.tone === 'failure' || o?.tone === 'fumble'
            ? 'border-destructive/25'
            : 'border-border',
      )}
    >
      <div className="flex min-w-0 flex-1 basis-40 items-center gap-3">
        <Illustration
          largeur={48}
          src={ctx.known.get(summary.characterId)?.portraitUrl}
          graine={name}
          position="top"
          className="aspect-[3/4] w-9 shrink-0 rounded-lg ring-1 ring-destructive/40"
        />
        <span className="truncate text-sm font-semibold">{name}</span>
      </div>
      {showRoll && fig && (
        <div className="flex items-center gap-2.5">
          {fig.kind === 'numeric' ? (
            <>
              <TotalJet
                total={fig.total}
                critique={style?.critique ?? null}
                taille="md"
                cle={summary.characterId}
                sansBadge
              />
              <DesDuJet taille="xs" entree={!quick} groupes={rollGroups(fig.roll)} />
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
          {...fade(delay, !quick)}
          className="inline-flex items-center gap-1.5 font-display text-lg font-black uppercase tracking-[0.14em]"
        >
          <style.icon className={cn('size-5', style.tint)} strokeWidth={2.5} aria-hidden />
          <span className={style.text}>{o.label}</span>
        </motion.span>
      )}
      {summary.damage && (
        <motion.span {...fade(damageDelay, animateDamage)} className="flex items-baseline gap-2">
          <DamageNumber damage={summary.damage} successRule={successRule} size="md" />
          <span className="text-[11px] font-medium uppercase tracking-wider text-subtle">
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
}: Readonly<{
  attack: Attack;
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
}>) {
  const [open, setOpen] = useState(false);
  const successRule = hasSuccessRule(systeme.actions.get(attack.action.id));
  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="mx-auto flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
        Détail
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
export function ReportStatus({ attack, gm }: Readonly<{ attack: Attack; gm: boolean }>) {
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
      className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground"
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
