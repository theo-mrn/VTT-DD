import type { GameSystemDefinition, StatDefinition } from '@/modules/game-system/types';
import { evaluateFormula, formulaContainsDice, resolveStatModifier, resolveStatValue, type FormulaContext } from './formula';

export interface ResolvedStats {
  /** Toutes les stats avec leur valeur finale (équivalent des champs `_F` actuels). */
  values: Record<string, number | string | boolean>;
  /** Modificateurs, uniquement pour les stats qui en définissent un. */
  modifiers: Record<string, number>;
}

function buildStatDefsIndex(gameSystem: GameSystemDefinition, tableCustomStats: StatDefinition[]): Record<string, StatDefinition> {
  const index: Record<string, StatDefinition> = {};
  for (const def of gameSystem.stats) index[def.key] = def;
  for (const def of tableCustomStats) index[def.key] = def;
  return index;
}

export interface StatGroupEntry {
  /** Nom du groupe (StatDefinition.group), ou null pour les stats sans groupe. */
  name: string | null;
  stats: StatDefinition[];
}

/** Regroupe un ensemble de stats selon GameSystemDefinition.statGroups (ordre défini par le MJ dans
 *  l'éditeur de règles), avec un groupe final `name: null` pour les stats sans groupe (ou si le système
 *  ne définit aucun groupe — comportement rétrocompatible, un seul groupe "sans nom" contenant tout).
 *  Réutilisé par l'éditeur de règles (onglet Tester) ET /creation (onglet Caractéristiques) pour un
 *  affichage cohérent, piloté par la même donnée. */
export function groupStats(stats: StatDefinition[], statGroups: string[] = []): StatGroupEntry[] {
  const entries: StatGroupEntry[] = statGroups.map((name) => ({
    name,
    stats: stats.filter((s) => s.group === name),
  }));
  const ungrouped = stats.filter((s) => !s.group || !statGroups.includes(s.group));
  if (ungrouped.length > 0) entries.push({ name: null, stats: ungrouped });
  return entries.filter((e) => e.stats.length > 0);
}

/** Valeurs par défaut d'un ensemble de stats (ex pour initialiser le state d'un formulaire de création
 *  de personnage) — clé -> defaultValue si défini, sinon 0/'' selon dataType. */
export function statsToDefaults(stats: StatDefinition[]): Record<string, number | string | boolean> {
  const defaults: Record<string, number | string | boolean> = {};
  for (const def of stats) {
    if (def.defaultValue !== undefined) {
      defaults[def.key] = def.defaultValue;
    } else if (def.dataType === 'text') {
      defaults[def.key] = '';
    } else if (def.dataType === 'boolean') {
      defaults[def.key] = false;
    } else {
      defaults[def.key] = 0;
    }
  }
  return defaults;
}

/**
 * Coeur pur, sans I/O — remplace la logique dupliquée de calcul de `_F` dans CharacterContext,
 * la logique de character-variables.ts, et replaceCharacteristics() de dice-roller.tsx.
 */
export function resolveCharacterStats(
  gameSystem: GameSystemDefinition,
  tableCustomStats: StatDefinition[],
  character: Record<string, unknown>,
  bonuses?: Record<string, number>,
): ResolvedStats {
  const statDefs = buildStatDefsIndex(gameSystem, tableCustomStats);
  // Base = document personnage complet (couvre les champs méta référencés par diceField,
  // ex `deVie`, qui ne sont pas eux-mêmes des StatDefinition), complété/écrasé par le schéma.
  const rawStats: Record<string, number | string | boolean | undefined> = {
    ...(character as Record<string, number | string | boolean | undefined>),
  };
  for (const key of Object.keys(statDefs)) {
    rawStats[key] = character[key] as number | string | boolean | undefined;
  }

  const ctx: FormulaContext = { rawStats, bonuses, statDefs, _memo: new Map(), gameSystemModifierFormula: gameSystem.modifierFormula };

  // Une stat dérivée dont la formule contient un jet de dé (ex PV_Max = 1+mod(CON)+dé de vie) n'est
  // évaluée dynamiquement QUE tant qu'aucune valeur n'a encore été stockée pour ce personnage (création).
  // Une fois une valeur présente en base, elle est figée (rawStat + bonus) : on ne relance jamais le dé
  // à chaque re-render — comportement identique à l'actuel `_F` de CharacterContext.tsx. Utilisé à la fois
  // pour la valeur affichée de la stat ET pour la borne (minFormula/maxFormula) d'une stat 'vital' qui
  // référence une autre stat (ex PV borné par PV_Max) : sans ce partage, PV_Max était re-tiré au dé à
  // chaque calcul de la borne de PV, pouvant faire chuter PV bien en dessous de sa valeur réelle si le
  // nouveau tirage était bas.
  function hasStoredValue(key: string): boolean {
    const raw = rawStats[key];
    return raw !== undefined && raw !== null && raw !== '';
  }

  /** Vrai si la formule de `key` contient un jet de dé ET n'a pas encore de valeur stockée pour ce
   *  personnage — dans ce cas précis, toute valeur qu'on en tirerait serait un nouveau tirage aléatoire
   *  à chaque appel, jamais stable. Une borne ne doit jamais reposer sur une telle valeur. */
  function isUnstableDiceRoll(key: string): boolean {
    const def = statDefs[key];
    return !!(def?.category === 'derived' && def.valueFormula && formulaContainsDice(def.valueFormula) && !hasStoredValue(key));
  }

  function resolveFrozen(key: string): number {
    const bonus = bonuses?.[key] ?? 0;
    if (isUnstableDiceRoll(key)) {
      return resolveStatValue(key, ctx);
    }
    if (hasStoredValue(key)) {
      const stored = typeof rawStats[key] === 'number' ? (rawStats[key] as number) : parseFloat(String(rawStats[key]));
      if (Number.isFinite(stored)) return stored + bonus;
    }
    return resolveStatValue(key, ctx);
  }

  const values: Record<string, number | string | boolean> = {};
  const modifiers: Record<string, number> = {};

  for (const def of Object.values(statDefs)) {
    if (def.category === 'meta') {
      values[def.key] = (character[def.key] as string | boolean | number) ?? def.defaultValue ?? '';
      continue;
    }

    if (def.category === 'vital' && (def.minFormula || def.maxFormula)) {
      const raw = rawStats[def.key];
      const bonus = bonuses?.[def.key] ?? 0;
      // hasStoredValue() (pas juste "raw est un nombre") distingue vraiment "aucune valeur" de "0" —
      // parseFloat(String(undefined ?? '0')) vaudrait silencieusement 0 (un nombre fini), masquant à
      // tort le cas "personnage tout juste créé, doit démarrer à sa valeur maximale".
      const current = hasStoredValue(def.key)
        ? (typeof raw === 'number' ? raw : parseFloat(String(raw))) + bonus
        : NaN;

      // Une borne qui référence directement une autre stat (cas courant, ex {type:'stat', key:'PV_Max'})
      // doit utiliser sa valeur FIGÉE (resolveFrozen), pas la réévaluer à chaque fois — sinon une stat
      // dérivée stockée (ex PV_Max=12 déjà en base) serait silencieusement re-calculée depuis sa formule
      // au lieu de sa valeur réelle. Pour une formule composée (pas une simple référence), on retombe sur
      // evaluateFormula/resolveStatValue, seul cas où un jet de dé encore instable peut réapparaître.
      const resolveBound = (formula: NonNullable<StatDefinition['maxFormula']>): number =>
        formula.type === 'stat' ? resolveFrozen(formula.key) : evaluateFormula(formula, ctx);

      // Si la borne référence directement une autre stat ET que cette stat a un jet de dé pas encore
      // figé (personnage créé avant que PV_Max ne soit stocké), le plafond ne doit JAMAIS reposer dessus :
      // un personnage existant avec PV stocké mais PV_Max instable ne doit pas voir son PV coupé par un
      // tirage aléatoire à chaque résolution.
      if (hasStoredValue(def.key) && def.maxFormula?.type === 'stat' && isUnstableDiceRoll(def.maxFormula.key)) {
        values[def.key] = Number.isFinite(current) ? current : 0;
        continue;
      }

      let resolved = Number.isFinite(current) ? current : 0;
      if (!Number.isFinite(current) && def.maxFormula) {
        // Aucune valeur stockée : un personnage tout juste créé démarre à sa valeur maximale.
        resolved = resolveBound(def.maxFormula);
      }
      if (def.maxFormula) resolved = Math.min(resolved, resolveBound(def.maxFormula));
      if (def.minFormula) resolved = Math.max(resolved, resolveBound(def.minFormula));
      values[def.key] = resolved;
      continue;
    }

    values[def.key] = resolveFrozen(def.key);

    const mod = resolveStatModifier(def.key, ctx);
    if (mod !== undefined) modifiers[def.key] = mod;
  }

  return { values, modifiers };
}

interface LegacyCustomField {
  label?: string;
  value?: number | string | boolean;
  isRollable?: boolean;
  hasModifier?: boolean;
}

/**
 * Variables issues du format LEGACY de Character.customFields (tableau par personnage, pré-StatDefinition).
 * Migration douce : tant qu'une table n'a pas de `customStats` partagées (nouveau format, cf. tableCustomStats),
 * ses champs personnalisés existants continuent de fonctionner dans le lanceur de dés/Discord via ce chemin.
 */
export function getLegacyCustomFieldVariables(character: Record<string, unknown>): Record<string, number> {
  const vars: Record<string, number> = {};
  const customFields = character.customFields;
  if (!Array.isArray(customFields)) return vars;

  for (const field of customFields as LegacyCustomField[]) {
    if (!field?.isRollable || !field.label) continue;
    const val = Number(field.value) || 0;
    vars[field.label] = field.hasModifier ? Math.floor((val - 10) / 2) : val;
  }
  return vars;
}

/**
 * Construit les variables utilisables dans une notation de dé (ex "1d20+FOR"),
 * remplace buildCharacterVariables() ET la logique de rollableStats/characterModifiers de dice-roller.
 * Inclut aussi les champs custom au format legacy (tableau par personnage) tant qu'ils n'ont pas
 * été migrés vers des StatDefinition de table (tableCustomStats).
 */
export function buildDiceVariables(
  resolved: ResolvedStats,
  statDefs: StatDefinition[],
  character?: Record<string, unknown>,
): Record<string, number> {
  const vars: Record<string, number> = {};
  for (const def of statDefs) {
    if (def.category === 'meta') continue;
    const useModifier = def.category === 'ability' && def.key in resolved.modifiers;
    const raw = useModifier ? resolved.modifiers[def.key] : resolved.values[def.key];
    if (typeof raw === 'number') vars[def.key] = raw;
  }
  if (character) Object.assign(vars, getLegacyCustomFieldVariables(character));
  return vars;
}

/**
 * Remplace applyVariables() de character-variables.ts et replaceCharacteristics() de dice-roller.tsx,
 * fusionnés en une seule implémentation partagée (regex longest-key-first).
 */
export function applyVariablesToNotation(notation: string, variables: Record<string, number>): string {
  const keys = Object.keys(variables);
  if (keys.length === 0) return notation;

  const sortedKeys = [...keys].sort((a, b) => b.length - a.length);
  const escapedKeys = sortedKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedKeys.join('|')})\\b`, 'gi');

  return notation.replace(regex, (match) => {
    const key = sortedKeys.find((k) => k.toLowerCase() === match.toLowerCase());
    return key !== undefined ? String(variables[key]) : match;
  });
}

export interface RollableStat {
  key: string;
  label: string;
  rawValue: number;
  hasModifier: boolean;
}

/** Liste des stats "rollables" pour peupler l'UI du dice-roller (remplace rollableStats useMemo). */
export function getRollableStats(
  gameSystem: GameSystemDefinition,
  tableCustomStats: StatDefinition[],
  character: Record<string, unknown>,
  statRollableOverrides?: Record<string, boolean>,
  bonuses?: Record<string, number>,
): RollableStat[] {
  const allDefs = [...gameSystem.stats, ...tableCustomStats];
  const resolved = resolveCharacterStats(gameSystem, tableCustomStats, character, bonuses);

  const rollables: RollableStat[] = [];
  for (const def of allDefs) {
    if (def.category === 'meta') continue;
    const isRollable = def.key in (statRollableOverrides ?? {}) ? statRollableOverrides![def.key] : def.isRollable ?? false;
    if (!isRollable) continue;

    const hasModifier = !!(def.rollUsesModifier && def.key in resolved.modifiers);
    const rawValue = hasModifier ? resolved.modifiers[def.key] : Number(resolved.values[def.key] ?? 0);

    rollables.push({
      key: def.key,
      label: def.shortLabel ?? def.label,
      rawValue,
      hasModifier,
    });
  }

  // Rétrocompat : champs custom legacy (Character.customFields[] par personnage, pas encore
  // migrés vers des StatDefinition de table) — même filtre type que l'ancien code de dice-roller.tsx.
  const legacyCustomFields = character.customFields;
  if (Array.isArray(legacyCustomFields)) {
    for (const f of legacyCustomFields as Array<{ label?: string; value?: unknown; isRollable?: boolean; type?: string; hasModifier?: boolean }>) {
      if (!f?.isRollable || !f.label || (f.type !== 'number' && f.type !== 'percent')) continue;
      rollables.push({
        key: f.label,
        label: f.label.length > 5 ? f.label.substring(0, 5) : f.label,
        rawValue: Number(f.value) || 0,
        hasModifier: !!(f.hasModifier && f.type === 'number'),
      });
    }
  }

  return rollables;
}
