'use client';

/**
 * Pièces des rapports en direct : duel en portraits, issue, jet (le total et les dés du
 * lanceur), valeurs à appliquer (réductions en info-bulle), marques. Rien n'est propre à un jeu :
 * libellés et types viennent du système.
 */
import type { Attack, AttackTarget } from '@vtt/contracts';
import type { Presentation, SystemeCharge } from '@vtt/rules';
import { MotionConfig as FramerMotionConfig } from 'framer-motion';
import { Check, Crown, EyeOff, ShieldHalf, Skull, Swords, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { DesDuJet, TotalJet } from '@/components/des/resultat-jet';
import { ResultatsSymboles } from '@/components/fiche/symboles';
import { Badge } from '@/components/ui/badge';
import { Info } from '@/components/ui/tooltip';
import { hasSuccessRule } from '@/lib/combat/actions';
import { outcomeLabel, targetDisplay, type OutcomeTone } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { attributeLabel, damageTypeName, keyParams, modificationText } from '../reports/labels';
import {
  reductionDetail,
  targetAmounts,
  toInput,
  type AttributeModification,
} from '../reports/model';
import { harmful } from '../reports/report-card';
import { LABEL, NUMBER_SPRING } from './look';
import type { Cast } from './use-live-reports';

// ─── Lecture d'un rapport ────────────────────────────────────────────────────

/** Ce qu'une carte affiche d'un rapport : titre, noms, issue, ton du liseré. */
export function readReport(a: Attack, cast: Cast, systeme: SystemeCharge | null) {
  const params = keyParams(systeme, a.action.id, a.params);
  const successRule = hasSuccessRule(systeme?.actions.get(a.action.id) ?? null);
  const attackerName = cast.get(a.attackerId)?.name ?? 'Personnage';
  const targetNames = a.targets.map((t) => cast.get(t.characterId)?.name ?? 'Personnage');
  const tones = a.targets.map((t) => outcomeOf(t, successRule)?.tone ?? 'neutral');
  const tone: OutcomeTone =
    tones.length && tones.every((x) => x === tones[0]) ? tones[0]! : 'neutral';
  return {
    title: params.length ? params.join(', ') : a.action.name,
    successRule,
    attackerName,
    targetNames,
    /** « Aragorn → Gobelin », « Aragorn → 3 cibles ». */
    versus: a.targets.length === 1 ? targetNames[0]! : `${a.targets.length} cibles`,
    tone,
  };
}

export function outcomeOf(t: AttackTarget, successRule: boolean) {
  return outcomeLabel(t.result?.outcome ?? t.view?.outcome ?? null, successRule);
}

// ─── Portraits ───────────────────────────────────────────────────────────────

export function Portrait({
  name,
  src,
  className,
}: {
  name: string;
  src: string | null | undefined;
  className?: string;
}) {
  return (
    <Illustration
      largeur={36}
      src={src ?? null}
      graine={name}
      position="top"
      className={cn(
        'shrink-0 rounded-full ring-2 ring-border-strong ring-offset-2 ring-offset-card',
        className,
      )}
    />
  );
}

/** Attaquant, épées, cible(s) : qui attaque qui, d'un coup d'œil. */
export function Duel({
  attack: a,
  cast,
  size = 'md',
}: {
  attack: Attack;
  cast: Cast;
  size?: 'sm' | 'md';
}) {
  const attacker = cast.get(a.attackerId);
  const face = size === 'md' ? 'size-9' : 'size-7';
  return (
    <span className="flex shrink-0 items-center" aria-hidden>
      <Portrait
        name={attacker?.name ?? 'Personnage'}
        src={attacker?.portraitUrl}
        className={cn(face, 'ring-primary/60')}
      />
      <span
        className={cn(
          'z-10 grid place-items-center rounded-full border border-border-strong bg-card text-muted-foreground shadow-surface',
          size === 'md' ? '-mx-1.5 size-5' : '-mx-1 size-4',
        )}
      >
        <Swords className={size === 'md' ? 'size-2.5' : 'size-2'} />
      </span>
      <span className={cn('flex', size === 'md' ? '-space-x-3' : '-space-x-2.5')}>
        {a.targets.slice(0, 3).map((t, i) => {
          const m = cast.get(t.characterId);
          return (
            <span key={t.characterId} className="relative" style={{ zIndex: 3 - i }}>
              <Portrait name={m?.name ?? 'Personnage'} src={m?.portraitUrl} className={face} />
            </span>
          );
        })}
        {a.targets.length > 3 && (
          <span
            className={cn(
              'relative grid place-items-center rounded-full bg-surface-3 font-mono text-[10px] font-semibold ring-2 ring-card',
              face,
            )}
          >
            +{a.targets.length - 3}
          </span>
        )}
      </span>
    </span>
  );
}

// ─── Issue ───────────────────────────────────────────────────────────────────

const OUTCOME_LOOK: Record<
  OutcomeTone,
  { ton: 'succes' | 'neutre' | 'primaire' | 'danger'; icon: typeof Check }
> = {
  success: { ton: 'succes', icon: Check },
  failure: { ton: 'neutre', icon: X },
  critical: { ton: 'primaire', icon: Crown },
  fumble: { ton: 'danger', icon: Skull },
  neutral: { ton: 'neutre', icon: Check },
};

/**
 * Touché, Raté (l'ancienne app), Critique, Échec critique. `hitOnly` : le critique est déjà dit
 * par le total du jet (le lanceur le montre à côté du chiffre), la pastille dit seulement
 * touché ou raté.
 */
export function OutcomeBadge({
  target,
  successRule,
  hitOnly = false,
  size = 'md',
}: {
  target: AttackTarget;
  successRule: boolean;
  hitOnly?: boolean;
  size?: 'sm' | 'md';
}) {
  const outcome = target.result?.outcome ?? target.view?.outcome ?? null;
  const o = hitOnly
    ? successRule && outcome
      ? outcome.success
        ? { label: 'Touché', tone: 'success' as const }
        : { label: 'Raté', tone: 'failure' as const }
      : null
    : outcomeOf(target, successRule);
  if (!o) return null;
  const look = OUTCOME_LOOK[o.tone];
  return (
    <motion.span
      key={o.label}
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={NUMBER_SPRING}
      className="shrink-0"
    >
      <Badge ton={look.ton} taille={size} className="font-bold uppercase tracking-wide">
        <look.icon aria-hidden />
        {o.label}
      </Badge>
    </motion.span>
  );
}

// ─── Chiffres ────────────────────────────────────────────────────────────────

/** Case d'un chiffre, à la manière du bandeau de la fiche : libellé discret, chiffre, détail. */
export function Figure({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <dt className={LABEL}>{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Jet d'une cible : le total et les dés du lanceur, ou les symboles du système. */
export function RollFigure({
  attack: a,
  target: t,
  systeme,
  presentation,
}: {
  attack: Attack;
  target: AttackTarget;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
}) {
  const d = targetDisplay(a, t);
  const roll = d.roll;
  if (!roll)
    return <span className="font-mono text-3xl font-bold leading-none text-subtle">–</span>;
  if (roll.kind === 'symbols')
    return systeme ? (
      <ResultatsSymboles systeme={systeme} presentation={presentation} resultats={roll.results} />
    ) : null;
  const critique = d.outcome?.critical ? 'success' : d.outcome?.fumble ? 'failure' : null;
  const modifier = roll.total - roll.natural;
  return (
    // Les dés du lanceur (framer-motion) suivent aussi la préférence du système
    <FramerMotionConfig reducedMotion="user">
      <div className="space-y-2">
        <TotalJet
          total={roll.total}
          critique={critique}
          taille="md"
          cle={`${a.id}:${t.characterId}`}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <DesDuJet
            taille="xs"
            entree
            max={8}
            groupes={roll.dice.map((g) => ({
              faces: g.faces,
              total: g.values.filter((v) => v.kept).reduce((s, v) => s + v.value, 0),
              dice: g.values.map((v) => ({ value: v.value, kept: v.kept, exploded: v.exploded })),
            }))}
          />
          {modifier !== 0 && (
            <span className="font-mono text-xs text-subtle tabular">
              {modifier > 0 ? '+' : '−'} {Math.abs(modifier)}
            </span>
          )}
        </div>
      </div>
    </FramerMotionConfig>
  );
}

/** Valeur à appliquer : « −7 », rouge quand elle aggrave la cible, réductions en info-bulle. */
export function Amount({
  m,
  systeme,
  presentation,
  size,
  label,
  detail = true,
}: {
  m: AttributeModification;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
  size: 'lg' | 'sm';
  /** Libellé à côté du chiffre (petite taille). */
  label?: string;
  /** Détail des réductions en info-bulle (pas dans un bouton : la ligne repliée). */
  detail?: boolean;
}) {
  const r = reductionDetail(m);
  const value = `${m.operation === 'add' ? '+' : m.operation === 'set' ? '=' : '−'}${m.value}`;
  const danger = harmful(m, presentation);
  const number = (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={NUMBER_SPRING}
      className={cn(
        'inline-block font-mono font-bold leading-none tabular',
        size === 'lg' ? 'text-3xl' : 'text-sm',
        danger ? 'text-destructive' : 'text-success',
      )}
    >
      {value}
    </motion.span>
  );
  const body = (
    <span className={cn('inline-flex items-baseline', size === 'lg' ? 'gap-2' : 'gap-1')}>
      {number}
      {label && <span className="text-[11px] font-medium text-muted-foreground">{label}</span>}
      {r && <ShieldHalf className="size-3 self-center text-info" aria-label="Réduit" />}
    </span>
  );
  if (!r || !detail) return body;
  return (
    <Info
      cote="bottom"
      texte={
        <span className="block space-y-0.5 text-xs">
          <span className="block font-mono tabular">
            {r.raw}
            {r.damageType ? ` ${damageTypeName(systeme, r.damageType)}` : ''} brut
          </span>
          {r.lines.map((l, j) => (
            <span key={j} className={cn('block', l.ignored && 'line-through opacity-60')}>
              {l.name} <span className="font-mono">{l.effect}</span>
            </span>
          ))}
          <span className="block font-mono font-semibold tabular">= {r.result}</span>
        </span>
      }
    >
      <span
        tabIndex={0}
        className="cursor-help rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {body}
      </span>
    </Info>
  );
}

/** Valeurs et états proposés pour une cible, après la principale : pastilles discrètes. */
export function Extras({
  target: t,
  skip,
  cast,
  systeme,
  presentation,
}: {
  target: AttackTarget;
  /** Valeurs déjà montrées en grand. */
  skip: number;
  cast: Cast;
  systeme: SystemeCharge | null;
  presentation: Presentation | null;
}) {
  const type = cast.get(t.characterId)?.type;
  const rest = targetAmounts(t).slice(skip);
  const entries = (t.result?.modifications ?? []).filter(
    (m) => m.entity === 'target' && m.kind === 'entry',
  );
  if (!rest.length && !entries.length) return null;
  const chip = 'rounded-lg border border-border bg-background/40 px-2 py-1';
  return (
    <ul className="flex flex-wrap gap-1.5">
      {rest.map((m, i) => (
        <li key={`amount:${i}`} className={chip}>
          <Amount
            m={m}
            systeme={systeme}
            presentation={presentation}
            size="sm"
            label={attributeLabel(systeme, m.attribute, type)}
          />
        </li>
      ))}
      {entries.map((m, i) => (
        <li key={`entry:${i}`} className={cn(chip, 'text-[11px] font-medium text-foreground/90')}>
          {modificationText(systeme, toInput(m), type)}
        </li>
      ))}
    </ul>
  );
}

// ─── Marques ─────────────────────────────────────────────────────────────────

/** Auto-attaque, hors tour, ajusté à la main, caché : seulement quand c'est le cas. */
export function Marks({ attack: a, className }: { attack: Attack; className?: string }) {
  const self = a.targets.some((t) => t.characterId === a.attackerId);
  if (!self && !a.outOfTurn && !a.adjustments && a.visibility === 'public') return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {self && (
        <Badge ton="danger" className="font-bold uppercase tracking-wide">
          <Skull aria-hidden />
          Auto-attaque
        </Badge>
      )}
      {a.outOfTurn && <Badge ton="alerte">Hors tour</Badge>}
      {a.adjustments && <Badge ton="info">Ajusté à la main</Badge>}
      {a.visibility !== 'public' && (
        <Badge>
          <EyeOff aria-hidden />
          {a.visibility === 'gm' ? 'Caché' : 'Privé'}
        </Badge>
      )}
    </div>
  );
}
