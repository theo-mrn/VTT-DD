/**
 * Générateur de rencontres (panneau Rencontres du MJ), calculé dans le navigateur à partir des
 * règles que le système déclare (`Systeme.rencontres`, docs/regles.md) : budget du groupe selon
 * la difficulté, coût d'une créature selon sa puissance, poids du nombre de créatures, formes de
 * rencontre (scénarios). Rien n'est propre à un jeu ici : pas un seul nombre de D&D.
 *
 * Fonctions pures (aléa injecté) : générer des propositions, les éditer (nombre, remplacement,
 * verrou et relance) et en lire la difficulté, recalculée à chaque changement.
 */
import type { Rencontres, Valeur } from '@vtt/rules';
import { compareCodeUnits } from '@vtt/contracts';

/** Une créature que le générateur peut proposer (bestiaire du système ou modèle du MJ). */
export interface EncounterCreature {
  /** Unique dans le vivier : `bestiary:<id>` ou `template:<id>`. */
  key: string;
  name: string;
  category: string;
  image: string | null;
  power: number;
  values: Readonly<Record<string, Valeur>>;
  source: { bestiary: string } | { template: string };
}

export interface PartyMember {
  id: string;
  name: string;
  level: number;
}

export interface EncounterGroup {
  creature: EncounterCreature;
  count: number;
  /** Gardé à la relance. */
  locked?: boolean;
}

export interface Encounter {
  id: string;
  scenario: string;
  groups: EncounterGroup[];
}

export interface EncounterFilters {
  categories?: readonly string[];
  /** Puissance au plus et au moins (en plus de ce que permet le scénario). */
  minPower?: number;
  maxPower?: number;
  /** Intervalles sur les valeurs déclarées filtrables (PV, Défense…). */
  ranges?: Readonly<Record<string, { min?: number; max?: number }>>;
}

export type Random = () => number;

const randInt = (rng: Random, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(rng: Random, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;

// ─── Coûts et budget ─────────────────────────────────────────────────────────

/** Coût d'une créature : le palier le plus haut dont la puissance ne dépasse pas la sienne. */
export function costOf(rules: Rencontres, power: number): number {
  let cost = rules.cout[0]!.valeur;
  for (const p of rules.cout) if (p.puissance <= power) cost = p.valeur;
  return cost;
}

/** Facteur du nombre de créatures (le palier le plus haut atteint). */
export function multiplierOf(rules: Rencontres, count: number): number {
  let f = 1;
  for (const m of [...rules.multiplicateurs].sort((a, b) => a.nombre - b.nombre))
    if (count >= m.nombre) f = m.facteur;
  return f;
}

/** Budget d'un personnage : la valeur de son niveau (bornée à la table déclarée). */
function memberBudget(parNiveau: readonly number[], level: number): number {
  const i = Math.min(parNiveau.length, Math.max(1, Math.round(level))) - 1;
  return parNiveau[i]!;
}

/** Budget du groupe pour une difficulté : la somme des budgets de ses personnages. */
export function budgetOf(
  rules: Rencontres,
  party: readonly PartyMember[],
  difficultyId: string,
): number {
  const d = rules.difficultes.find((x) => x.id === difficultyId) ?? rules.difficultes[0]!;
  return party.reduce((sum, m) => sum + memberBudget(d.parNiveau, m.level), 0);
}

/** Niveau moyen du groupe (1 au moins). */
export const averageLevel = (party: readonly PartyMember[]) =>
  party.length ? Math.max(1, party.reduce((s, m) => s + m.level, 0) / party.length) : 1;

export interface EncounterCost {
  count: number;
  /** Somme des coûts des créatures. */
  raw: number;
  /** Coût pondéré par le nombre de créatures : ce qu'on compare au budget. */
  adjusted: number;
}

export function encounterCost(rules: Rencontres, groups: readonly EncounterGroup[]): EncounterCost {
  const count = groups.reduce((s, g) => s + g.count, 0);
  const raw = groups.reduce((s, g) => s + costOf(rules, g.creature.power) * g.count, 0);
  return { count, raw, adjusted: Math.round(raw * multiplierOf(rules, count)) };
}

export interface DifficultyReading {
  /** Difficulté atteinte (la plus dure dont le budget est atteint), ou null : en dessous. */
  reached: { id: string; nom: string } | null;
  /** Budget du groupe pour chaque difficulté, dans l'ordre déclaré. */
  thresholds: { id: string; nom: string; budget: number }[];
  adjusted: number;
}

/** Difficulté d'une rencontre pour ce groupe : sa jauge. */
export function readDifficulty(
  rules: Rencontres,
  party: readonly PartyMember[],
  groups: readonly EncounterGroup[],
): DifficultyReading {
  const { adjusted } = encounterCost(rules, groups);
  const thresholds = rules.difficultes.map((d) => ({
    id: d.id,
    nom: d.nom,
    budget: budgetOf(rules, party, d.id),
  }));
  let reached: DifficultyReading['reached'] = null;
  for (const t of thresholds) if (adjusted >= t.budget) reached = { id: t.id, nom: t.nom };
  return { reached, thresholds, adjusted };
}

// ─── Vivier ──────────────────────────────────────────────────────────────────

const num = (v: Valeur | undefined) => (typeof v === 'number' ? v : Number(v));

/** Créatures qui passent les filtres (catégories, puissance, intervalles de valeurs). */
export function filterPool(
  pool: readonly EncounterCreature[],
  f: EncounterFilters,
): EncounterCreature[] {
  return pool.filter((c) => {
    if (f.categories?.length && !f.categories.includes(c.category)) return false;
    if (f.minPower !== undefined && c.power < f.minPower) return false;
    if (f.maxPower !== undefined && c.power > f.maxPower) return false;
    for (const [key, r] of Object.entries(f.ranges ?? {})) {
      const v = num(c.values[key]);
      if (!Number.isFinite(v)) {
        if (r.min !== undefined || r.max !== undefined) return false;
        continue;
      }
      if (r.min !== undefined && v < r.min) return false;
      if (r.max !== undefined && v > r.max) return false;
    }
    return true;
  });
}

// ─── Génération ──────────────────────────────────────────────────────────────

/** Répartit `total` créatures entre `kinds` groupes (1 au moins chacun). */
function split(rng: Random, total: number, kinds: number): number[] {
  const counts = Array.from({ length: kinds }, () => 1);
  for (let i = kinds; i < total; i++) counts[Math.floor(rng() * kinds)]! += 1;
  return counts;
}

const signature = (groups: readonly EncounterGroup[]) =>
  groups
    .map((g) => `${g.creature.key}×${g.count}`)
    .sort(compareCodeUnits)
    .join('|');

let nextId = 0;
const newId = () => `rencontre-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

interface Target {
  rules: Rencontres;
  budget: number;
  scenario: Rencontres['scenarios'][number];
  level: number;
}

/** Part des créatures tirées dans la catégorie de la rencontre (le reste : n'importe laquelle). */
const COHESION = 0.8;

/** Poids d'une catégorie : déclaré par le système, 1 sinon. */
const weightOf = (rules: Rencontres, category: string) =>
  rules.categories.find((c) => c.nom === category)?.poids ?? 1;

/** Tirage pondéré (null si tout pèse 0). */
function weighted<T>(rng: Random, items: readonly T[], weight: (t: T) => number): T | null {
  const total = items.reduce((s, x) => s + Math.max(0, weight(x)), 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const x of items) {
    r -= Math.max(0, weight(x));
    if (r < 0) return x;
  }
  return items[items.length - 1] ?? null;
}

/**
 * Catégorie de la rencontre, tirée selon les poids du système parmi celles qui ont des
 * candidates : une rencontre de bandits plutôt qu'un mélange au hasard, et les catégories
 * nombreuses (les bêtes) ne l'emportent plus par leur seul nombre.
 */
function theme(rng: Random, rules: Rencontres, candidates: readonly EncounterCreature[]) {
  const cats = [...new Set(candidates.map((c) => c.category))];
  return weighted(rng, cats, (c) => weightOf(rules, c));
}

/** `n` créatures distinctes, de la catégorie `cat` pour la plupart (sinon n'importe laquelle). */
function choose(
  rng: Random,
  candidates: readonly EncounterCreature[],
  n: number,
  cat: string | null,
): EncounterCreature[] {
  const out: EncounterCreature[] = [];
  const left = [...candidates];
  while (out.length < n && left.length) {
    const same = cat ? left.filter((c) => c.category === cat) : [];
    const from = same.length && (rng() < COHESION || out.length === 0) ? same : left;
    const c = pick(rng, from);
    out.push(c);
    left.splice(left.indexOf(c), 1);
  }
  return out;
}

/** Une composition tirée au hasard pour ce scénario, avec ce qui est gardé (`fixed`). */
function draw(
  rng: Random,
  t: Target,
  pool: readonly EncounterCreature[],
  fixed: readonly EncounterGroup[],
): EncounterGroup[] | null {
  const s = t.scenario;
  const fixedCount = fixed.reduce((n, g) => n + g.count, 0);
  const total = Math.max(fixedCount + 1, randInt(rng, s.min, s.max)) - fixedCount;
  const used = new Set(fixed.map((g) => g.creature.key));
  const free = (max: number, min = 0) =>
    pool.filter((c) => !used.has(c.key) && c.power <= max && c.power >= min);

  if (s.chef && !fixed.length) {
    const minion = (s.puissanceSbires ?? s.puissanceMax / 3) * t.level;
    const leaders = free(s.puissanceMax * t.level, minion);
    const minions = free(minion);
    if (!leaders.length || !minions.length) return null;
    // Le chef donne sa catégorie ; ses sbires en sont, s'il y en a
    const cat =
      theme(
        rng,
        t.rules,
        leaders.filter((l) => minions.some((m) => m.category === l.category)),
      ) ?? theme(rng, t.rules, leaders);
    const leader = pick(
      rng,
      leaders.filter((l) => l.category === cat).length
        ? leaders.filter((l) => l.category === cat)
        : leaders,
    );
    const kinds = Math.min(minions.length, total - 1 >= 4 ? randInt(rng, 1, 2) : 1);
    const chosen = choose(rng, minions, kinds, leader.category);
    const counts = split(rng, Math.max(kinds, total - 1), kinds);
    return [
      { creature: leader, count: 1 },
      ...chosen.map((c, i) => ({ creature: c, count: counts[i]! })),
    ];
  }

  if (total <= 0) return [...fixed];
  const candidates = free(s.puissanceMax * t.level);
  if (!candidates.length) return fixed.length ? [...fixed] : null;
  // Gardées : leur catégorie reste celle de la rencontre
  const cat = fixed[0]?.creature.category ?? theme(rng, t.rules, candidates);
  const kinds = Math.min(candidates.length, total, randInt(rng, 1, Math.min(3, total)));
  const chosen = choose(rng, candidates, kinds, cat);
  const counts = split(rng, total, kinds);
  return [...fixed, ...chosen.map((c, i) => ({ creature: c, count: counts[i]! }))];
}

function shuffle<T>(rng: Random, list: readonly T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Écart relatif au budget (0 : pile dessus). */
const gap = (t: Target, groups: readonly EncounterGroup[]) =>
  Math.abs(encounterCost(t.rules, groups).adjusted - t.budget) / Math.max(1, t.budget);

/** Meilleure composition sur `tries` tirages : la plus proche du budget. */
function best(
  rng: Random,
  t: Target,
  pool: readonly EncounterCreature[],
  fixed: readonly EncounterGroup[],
  tries: number,
  avoid: ReadonlySet<string> = new Set(),
): EncounterGroup[] | null {
  let found: EncounterGroup[] | null = null;
  let score = Infinity;
  for (let i = 0; i < tries; i++) {
    const g = draw(rng, t, pool, fixed);
    if (!g || !g.length || avoid.has(signature(g))) continue;
    const d = gap(t, g);
    if (d < score) {
      found = g;
      score = d;
      if (d <= 0.1) break;
    }
  }
  return found;
}

/**
 * Propositions pour un scénario : `n` compositions différentes, chacune au plus près du
 * budget de la difficulté voulue (les plus proches d'abord).
 */
export function generate(input: {
  rules: Rencontres;
  pool: readonly EncounterCreature[];
  party: readonly PartyMember[];
  difficultyId: string;
  scenarioId: string;
  count?: number;
  rng?: Random;
}): Encounter[] {
  const { rules, pool, party, difficultyId, scenarioId, count = 5, rng = Math.random } = input;
  const scenario = rules.scenarios.find((s) => s.id === scenarioId);
  if (!scenario || !pool.length) return [];
  const t: Target = {
    rules,
    budget: budgetOf(rules, party, difficultyId),
    scenario,
    level: averageLevel(party),
  };
  const seen = new Set<string>();
  const out: { groups: EncounterGroup[]; d: number }[] = [];
  for (let i = 0; i < count; i++) {
    const g = best(rng, t, pool, [], 120, seen);
    if (!g) break;
    seen.add(signature(g));
    out.push({ groups: g, d: gap(t, g) });
  }
  return out
    .sort((a, b) => a.d - b.d)
    .map((x) => ({ id: newId(), scenario: scenarioId, groups: x.groups }));
}

// ─── Édition d'une proposition ───────────────────────────────────────────────

/** Nombre d'un groupe (0 le retire). */
export function setCount(e: Encounter, key: string, count: number): Encounter {
  return {
    ...e,
    groups: e.groups
      .map((g) => (g.creature.key === key ? { ...g, count: Math.max(0, Math.round(count)) } : g))
      .filter((g) => g.count > 0),
  };
}

export function toggleLock(e: Encounter, key: string): Encounter {
  return {
    ...e,
    groups: e.groups.map((g) => (g.creature.key === key ? { ...g, locked: !g.locked } : g)),
  };
}

/** Ajoute une créature (ou un exemplaire de plus si elle y est déjà). */
export function addCreature(e: Encounter, c: EncounterCreature): Encounter {
  const has = e.groups.some((g) => g.creature.key === c.key);
  return has
    ? setCount(e, c.key, (e.groups.find((g) => g.creature.key === c.key)?.count ?? 0) + 1)
    : { ...e, groups: [...e.groups, { creature: c, count: 1 }] };
}

/** Créatures proches pour remplacer `c` : même catégorie d'abord, puissance la plus voisine. */
export function alternativesFor(
  pool: readonly EncounterCreature[],
  c: EncounterCreature,
  n = 8,
): EncounterCreature[] {
  return pool
    .filter((x) => x.key !== c.key)
    .map((x) => ({
      x,
      d: Math.abs(x.power - c.power) + (x.category === c.category ? 0 : 0.75),
    }))
    .sort((a, b) => a.d - b.d || a.x.name.localeCompare(b.x.name, 'fr'))
    .slice(0, n)
    .map((a) => a.x);
}

/** Remplace une créature par une autre (même nombre, verrou gardé). */
export function replaceCreature(e: Encounter, key: string, by: EncounterCreature): Encounter {
  if (e.groups.some((g) => g.creature.key === by.key)) {
    const moved = e.groups.find((g) => g.creature.key === key);
    const merged = setCount(e, key, 0);
    return moved
      ? setCount(
          merged,
          by.key,
          (merged.groups.find((g) => g.creature.key === by.key)?.count ?? 0) + moved.count,
        )
      : merged;
  }
  return {
    ...e,
    groups: e.groups.map((g) => (g.creature.key === key ? { ...g, creature: by } : g)),
  };
}

/**
 * Relance une proposition : les groupes verrouillés restent, le reste est tiré à nouveau pour
 * se rapprocher du budget.
 */
export function reroll(input: {
  rules: Rencontres;
  pool: readonly EncounterCreature[];
  party: readonly PartyMember[];
  difficultyId: string;
  encounter: Encounter;
  rng?: Random;
}): Encounter {
  const { rules, pool, party, difficultyId, encounter, rng = Math.random } = input;
  const scenario = rules.scenarios.find((s) => s.id === encounter.scenario) ?? rules.scenarios[0]!;
  const fixed = encounter.groups.filter((g) => g.locked);
  const t: Target = {
    rules,
    budget: budgetOf(rules, party, difficultyId),
    scenario,
    level: averageLevel(party),
  };
  const groups = best(rng, t, pool, fixed, 120, new Set([signature(encounter.groups)]));
  return groups ? { ...encounter, groups } : encounter;
}
