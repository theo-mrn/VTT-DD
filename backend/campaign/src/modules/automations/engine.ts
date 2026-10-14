/**
 * Cœur du moteur des automatismes, sans base ni réseau (docs/automatismes.md § 3) : ce qui a
 * changé entre deux états (signaux), quelles règles un signal concerne, si leurs conditions
 * sont vraies. Testé seul (engine.test.ts).
 */
import type { RuleCondition, RuleTrigger, TableClock, TableState } from '@vtt/contracts';

/** Ce qui s'est passé, dans les termes des déclencheurs. */
export type Signal =
  | { type: 'scene.enter'; mapId: string }
  | { type: 'scene.leave'; mapId: string }
  | { type: 'combat.start' }
  | { type: 'combat.end' }
  | { type: 'combat.round'; round: number }
  /** `userIds` : joueurs du personnage dont c'est le tour (propriétaire, incarnateur). */
  | { type: 'combat.turn'; side: string | null; userIds?: readonly string[] }
  | { type: 'time.hour'; hour: number }
  | { type: 'clock.segment'; clock: string }
  | { type: 'clock.full'; clock: string }
  | { type: 'timer.end' }
  | { type: 'fate.spent'; userId?: string | null };

/** Joueurs concernés par un signal (cible `actor` des actions). */
export function actorsOf(s: Signal): string[] {
  if (s.type === 'combat.turn') return [...(s.userIds ?? [])];
  if (s.type === 'fate.spent' && s.userId) return [s.userId];
  return [];
}

/** Mémoire de l'exécuteur, par campagne : de quoi voir ce qui a changé. */
export interface Memory {
  partyMapId?: string | null;
  clocks?: Record<string, { name: string; filled: number; segments: number }>;
  fateLastAt?: string | null;
  combatVersion?: number;
}

/** Scène du groupe : départ de l'ancienne, arrivée sur la nouvelle. */
export function sceneSignals(memory: Memory, partyMapId: string | null): Signal[] {
  const avant = memory.partyMapId ?? null;
  if (avant === partyMapId) return [];
  return [
    ...(avant ? [{ type: 'scene.leave' as const, mapId: avant }] : []),
    ...(partyMapId ? [{ type: 'scene.enter' as const, mapId: partyMapId }] : []),
  ];
}

const memoClocks = (clocks: readonly TableClock[]) =>
  Object.fromEntries(
    clocks.map((c) => [c.id, { name: c.name, filled: c.filled, segments: c.segments }]),
  );

/** État de la table : horloges qui avancent ou se remplissent, jeton dépensé. */
export function tableSignals(
  memory: Memory,
  s: Pick<TableState, 'clocks' | 'fate'>,
): { signals: Signal[]; memory: Memory } {
  const signals: Signal[] = [];
  const avant = memory.clocks ?? {};
  for (const c of s.clocks) {
    const a = avant[c.id];
    if (!a || c.filled <= a.filled) continue;
    signals.push({ type: 'clock.segment', clock: c.name });
    if (c.filled >= c.segments && a.filled < a.segments)
      signals.push({ type: 'clock.full', clock: c.name });
  }
  const fateLastAt = s.fate?.last?.at ?? null;
  if (fateLastAt && fateLastAt !== (memory.fateLastAt ?? null))
    signals.push({ type: 'fate.spent', userId: s.fate?.last?.userId ?? null });
  return { signals, memory: { ...memory, clocks: memoClocks(s.clocks), fateLastAt } };
}

const memeNom = (a: string | undefined, b: string) =>
  !a || a.trim().toLowerCase() === b.trim().toLowerCase();

/** Le signal correspond-il au déclencheur de la règle (et à ses filtres) ? */
export function matches(trigger: RuleTrigger, s: Signal): boolean {
  if (trigger.type !== s.type) return false;
  switch (trigger.type) {
    case 'scene.enter':
    case 'scene.leave':
      return !trigger.mapId || trigger.mapId === (s as { mapId: string }).mapId;
    case 'combat.round':
      return !trigger.every || (s as { round: number }).round % trigger.every === 0;
    case 'combat.turn': {
      const t = s as Extract<Signal, { type: 'combat.turn' }>;
      return (
        (!trigger.side || trigger.side === t.side) &&
        (!trigger.userId || (t.userIds ?? []).includes(trigger.userId))
      );
    }
    case 'time.hour':
      return trigger.hour === (s as { hour: number }).hour;
    case 'clock.segment':
    case 'clock.full':
      return memeNom(trigger.clock, (s as { clock: string }).clock);
    default:
      return true;
  }
}

/** De quoi juger les conditions. */
export interface ConditionContext {
  partyMapId: string | null;
  combatActive: boolean;
  /** Heure du monde (0 à 23) ; null : pas de temps du monde. */
  hour: number | null;
  random: () => number;
}

export function conditionsHold(conditions: readonly RuleCondition[], c: ConditionContext) {
  return conditions.every((k) => {
    switch (k.type) {
      case 'scene.is':
        return c.partyMapId === k.mapId;
      case 'combat.active':
        return c.combatActive === k.value;
      case 'time.between':
        if (c.hour === null) return false;
        // À cheval sur minuit (22 → 6) : avant `to` ou après `from`
        return k.from <= k.to
          ? c.hour >= k.from && c.hour < k.to
          : c.hour >= k.from || c.hour < k.to;
      case 'chance':
        return c.random() * 100 < k.percent;
    }
  });
}

// ─── Temps du monde ──────────────────────────────────────────────────────────

const DAY = 1440;

/** Minutes du monde à l'instant `nowMs`. */
export function worldMinutes(
  w: { minutes: number; rate: number; anchorAt: string },
  nowMs: number,
) {
  return w.minutes + (w.rate * Math.max(0, nowMs - Date.parse(w.anchorAt))) / 60_000;
}

export const hourOf = (minutes: number) => Math.floor((((minutes % DAY) + DAY) % DAY) / 60);

/** Prochaine minute du monde où il est `hour` h (strictement après `minutes`). */
export function nextHourMinutes(minutes: number, hour: number) {
  const debut = Math.floor(minutes / DAY) * DAY;
  const cible = debut + hour * 60;
  return cible > minutes ? cible : cible + DAY;
}

/** Instant réel (ms) où l'heure du monde atteindra `hour` h ; null si le temps est figé. */
export function realTimeOfHour(
  w: { minutes: number; rate: number; anchorAt: string },
  hour: number,
  nowMs: number,
): number | null {
  if (w.rate <= 0) return null;
  const maintenant = worldMinutes(w, nowMs);
  return nowMs + ((nextHourMinutes(maintenant, hour) - maintenant) / w.rate) * 60_000;
}

/** Profondeur d'enchaînement d'un événement (`auto:<n>:…` dans son `correlationId`). */
export function depthOf(correlationId: string): number {
  const m = /^auto:(\d+):/.exec(correlationId);
  return m ? Number(m[1]) : 0;
}

export const MAX_DEPTH = 3;
