import type {
  CharacterCreationRule,
  FormulaNode,
  GameSystemDefinition,
  RollComparisonOperator,
  RollConstraintAggregate,
  StatDefinition,
} from '@/modules/game-system/types';
import { evaluateFormula, getFormulaDependencies, resolveStatModifier, FormulaCycleError, type FormulaContext } from './formula';
import { resolveCharacterStats } from './resolver';

/** Ordonne les stats avec rollFormula par dépendances (tri topologique) : une stat dont la formule
 *  référence une autre ability (ex FORM = FOR + mod(FOR) + 1) est tirée après celle-ci, peu importe
 *  l'ordre d'affichage dans l'éditeur de règles. Une dépendance externe (hors abilities à rollFormula,
 *  ex une ability sans rollFormula, ou une stat dérivée) est ignorée ici — elle n'a de toute façon pas
 *  encore de valeur au moment du tirage des abilities. */
function sortByRollDependencies(stats: StatDefinition[]): StatDefinition[] {
  const byKey = new Map(stats.map((s) => [s.key, s]));
  const sorted: StatDefinition[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(stat: StatDefinition) {
    if (visited.has(stat.key)) return;
    if (visiting.has(stat.key)) throw new FormulaCycleError(stat.key);
    visiting.add(stat.key);

    const deps = stat.rollFormula ? getFormulaDependencies(stat.rollFormula) : [];
    for (const depKey of deps) {
      const depStat = byKey.get(depKey);
      if (depStat) visit(depStat);
    }

    visiting.delete(stat.key);
    visited.add(stat.key);
    sorted.push(stat);
  }

  for (const stat of stats) visit(stat);
  return sorted;
}

/**
 * Détecte si les rollFormula d'un ensemble de stats (ability, derived ou vital) forment un cycle (ex FOR
 * dépend de FORM qui dépend de FOR, ou PV_Max dépend de PV qui dépend de PV_Max) — à utiliser à
 * l'ÉDITION (UI MJ) pour empêcher d'enregistrer une configuration qui ferait planter le tirage à la
 * création de personnage, plutôt que de laisser l'erreur remonter jusqu'à l'écran joueur. Retourne la
 * clé de la première stat impliquée dans un cycle, ou null.
 */
export function findRollFormulaCycle(stats: StatDefinition[]): string | null {
  try {
    sortByRollDependencies(stats.filter((s) => s.rollFormula));
    return null;
  } catch (e) {
    if (e instanceof FormulaCycleError) return e.key;
    throw e;
  }
}

/** Nombre de tentatives par défaut avant d'abandonner une contrainte — volontairement très élevé :
 *  la contrainte est impérative, ce plafond n'est qu'un garde-fou contre une config mathématiquement
 *  impossible (ou quasiment), jamais un moyen d'accepter une valeur qui ne la respecte pas. */
export const DEFAULT_MAX_ATTEMPTS = 1_000_000;

/** Levée quand une ou plusieurs contraintes de tirage n'ont jamais pu être satisfaites après le nombre
 *  maximal de tentatives — la contrainte étant impérative, il n'y a pas de repli : soit elle est
 *  respectée, soit la génération du personnage échoue avec une erreur explicite. */
export class RollConstraintUnsatisfiableError extends Error {
  constructor(public readonly constraintLabels: string[], public readonly attempts: number) {
    super(`Contrainte(s) de tirage jamais satisfaite(s) après ${attempts} tentatives : ${constraintLabels.join(', ')}`);
    this.name = 'RollConstraintUnsatisfiableError';
  }
}

function computeAggregate(aggregate: RollConstraintAggregate, keys: string[], values: Record<string, number>, modifierOf: (key: string, value: number) => number): number {
  switch (aggregate) {
    case 'evenCount':
      return keys.filter((k) => values[k] % 2 === 0).length;
    case 'oddCount':
      return keys.filter((k) => values[k] % 2 !== 0).length;
    case 'sumValues':
      return keys.reduce((sum, k) => sum + values[k], 0);
    case 'sumModifiers':
      return keys.reduce((sum, k) => sum + modifierOf(k, values[k]), 0);
  }
}

function compare(value: number, operator: RollComparisonOperator, target: number): boolean {
  switch (operator) {
    case '=': return value === target;
    case '<': return value < target;
    case '>': return value > target;
    case '<=': return value <= target;
    case '>=': return value >= target;
  }
}

/**
 * Évalue une contrainte de tirage (agrégat + opérateur + cible) sur un ensemble de valeurs déjà tirées.
 * Fonction pure, testée indépendamment du moteur de tirage (retirage/fallback) qui l'utilise.
 */
export function evaluateRollConstraintAggregate(
  aggregate: RollConstraintAggregate,
  operator: RollComparisonOperator,
  target: number,
  keys: string[],
  values: Record<string, number>,
  modifierOf: (key: string, value: number) => number,
): boolean {
  return compare(computeAggregate(aggregate, keys, values, modifierOf), operator, target);
}

export interface RolledCharacterStats {
  /** Valeurs telles que tirées, AVANT modificateurs raciaux (ex FOR, DEX...) — pour affichage "Base". */
  rolledAbilities: Record<string, number>;
  /** Valeurs finales des abilities APRÈS modificateurs raciaux — celles réellement stockées sur le perso. */
  abilities: Record<string, number>;
  /** Toutes les stats dérivées/vitales calculées à partir des abilities (ex Defense, Contact, PV_Max...). */
  derived: Record<string, number | string | boolean>;
}

function abilitiesOf(gameSystem: GameSystemDefinition): StatDefinition[] {
  return gameSystem.stats.filter((s) => s.category === 'ability');
}

/** Stats 'vital' OU 'derived' avec leur propre rollFormula (ex PV_Max = aléatoire entre 1 et 20,
 *  PV = Variable→PV_Max) — valeur de départ tirée UNE FOIS à la création, comme une ability, puis
 *  (pour une stat vital) modifiée librement par le joueur ensuite (PV qui descend en combat). Une stat
 *  'derived' avec rollFormula garde ensuite cette valeur figée (comportement identique à une valeur
 *  stockée normale, jamais retirée) — sans rollFormula, elle continue d'être recalculée en continu
 *  depuis valueFormula comme d'habitude. Une stat vital SANS rollFormula garde son comportement normal
 *  (résolue par ses bornes min/maxFormula dans resolveCharacterStats, ex démarre à son Maximum). */
function rollableDerivedOrVitalsOf(gameSystem: GameSystemDefinition): StatDefinition[] {
  return gameSystem.stats.filter((s) => (s.category === 'vital' || s.category === 'derived') && s.rollFormula);
}

/**
 * Génère les abilities à la création du personnage.
 *
 * Trois mécanismes coexistent :
 * - Formule PAR STAT (StatDefinition.rollFormula) SANS contrainte : chaque caractéristique a sa propre
 *   règle de tirage (ex FOR "aléatoire entre 6 et 20"), tirée une seule fois, jamais retirée.
 * - Formule PAR STAT AVEC contrainte(s) (rollFormula + référencée par une ou plusieurs entrées de
 *   rule.rollConstraints) : tirée en bloc avec les autres stats couvertes par au moins une contrainte
 *   active, retirée ensemble jusqu'à satisfaire TOUTES les contraintes actives simultanément (ex "nombre
 *   de valeurs paires = 3" ET "somme des modificateurs = 6" façon Nooblies, éventuellement sur des
 *   sous-ensembles de stats différents), avec repli par stat sur la première contrainte qui la référence
 *   et définit un fallback, si jamais atteint après le nombre max de tentatives.
 * - Formule PARTAGÉE (CharacterCreationRule.rollFormula, sans rollFormula par stat) : une seule formule
 *   commune appliquée à toutes les abilities qui n'ont PAS de rollFormula individuelle — mécanisme
 *   historique conservé pour rétrocompatibilité, mais plus recommandé pour un nouveau système custom
 *   (préférer une rollFormula individuelle par stat, avec ou sans contrainte).
 *
 * Une ability avec sa propre rollFormula prime toujours sur la règle partagée. Une ability sans aucune
 * des trois garde sa defaultValue (valeur fixe, saisie libre par le joueur).
 */
export function rollAbilities(rule: CharacterCreationRule, abilities: StatDefinition[], gameSystemModifierFormula?: FormulaNode): Record<string, number> {
  const statDefs = Object.fromEntries(abilities.map((s) => [s.key, s]));
  const rawStats: Record<string, number> = {};

  const rollOne = (formula: FormulaNode, ctx: FormulaContext = { rawStats, statDefs, gameSystemModifierFormula }) => {
    return evaluateFormula(formula, ctx);
  };
  const modifierOf = (key: string, value: number) => {
    const ctx: FormulaContext = { rawStats: { ...rawStats, [key]: value }, statDefs, gameSystemModifierFormula };
    return resolveStatModifier(key, ctx) ?? 0;
  };

  const values: Record<string, number> = {};

  // Formule effective d'une ability pour le tirage : sa rollFormula individuelle si définie, sinon
  // la formule partagée du système (rétrocompat dnd-classic), sinon aucune (defaultValue fixe).
  const formulaFor = (stat: StatDefinition): FormulaNode | undefined =>
    stat.rollFormula ?? (rule.method === 'roll' ? rule.rollFormula : undefined);

  // 1. Stats couvertes par au moins une contrainte ACTIVE (qu'elles aient une rollFormula individuelle
  //    ou qu'elles utilisent la formule partagée du système) : retirées EN BLOC (dans l'ordre de leurs
  //    dépendances, à chaque tentative) jusqu'à satisfaire TOUTES les contraintes actives simultanément
  //    (ET logique), chacune évaluée sur ses propres statKeys uniquement — pas sur l'union globale du
  //    groupe retiré ensemble.
  const activeConstraints = (rule.rollConstraints ?? []).filter((c) => c.statKeys.length > 0);
  const constrainedKeySet = new Set(activeConstraints.flatMap((c) => c.statKeys));
  const constrainedAbilities = sortByRollDependencies(
    abilities.filter((s) => constrainedKeySet.has(s.key) && formulaFor(s)),
  );

  if (constrainedAbilities.length > 0 && activeConstraints.length > 0) {
    const maxAttempts = Math.max(...activeConstraints.map((c) => c.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
    let attempts = 0;
    let satisfied = false;
    let attemptValues: Record<string, number> = {};

    while (attempts < maxAttempts) {
      attemptValues = {};
      for (const stat of constrainedAbilities) {
        const ctx: FormulaContext = { rawStats: { ...rawStats, ...attemptValues }, statDefs, gameSystemModifierFormula };
        attemptValues[stat.key] = evaluateFormula(formulaFor(stat)!, ctx);
      }
      const allSatisfied = activeConstraints.every((c) =>
        evaluateRollConstraintAggregate(c.aggregate, c.operator, c.target, c.statKeys, attemptValues, modifierOf),
      );
      if (allSatisfied) { satisfied = true; break; }
      attempts++;
    }

    // Contrainte IMPÉRATIVE : jamais de valeur inventée en repli. Si elle n'est toujours pas satisfaite
    // après maxAttempts, la config est mathématiquement impossible (ou quasiment) — on lève une erreur
    // claire plutôt que de générer un personnage avec des valeurs qui ne respectent pas la règle du MJ.
    if (!satisfied) {
      const unmet = activeConstraints.filter((c) =>
        !evaluateRollConstraintAggregate(c.aggregate, c.operator, c.target, c.statKeys, attemptValues, modifierOf),
      );
      throw new RollConstraintUnsatisfiableError(unmet.map((c) => c.label || c.id), maxAttempts);
    }

    for (const stat of constrainedAbilities) {
      values[stat.key] = attemptValues[stat.key];
      rawStats[stat.key] = values[stat.key];
    }
  }

  // 2. Chaque stat restante (non couverte par une contrainte active) est tirée UNE FOIS dans l'ordre de
  //    ses dépendances — via sa propre rollFormula si définie, sinon la formule partagée du système, sinon
  //    sa defaultValue fixe. Une formule peut référencer une autre ability déjà résolue (ex FORM = FOR +
  //    mod(FOR) + 1), que cette dernière ait elle-même une rollFormula, une formule partagée, ou aucune.
  const remainingAbilities = sortByRollDependencies(
    abilities.filter((s) => !constrainedKeySet.has(s.key)),
  );
  for (const stat of remainingAbilities) {
    const formula = formulaFor(stat);
    const value = formula ? rollOne(formula) : (typeof stat.defaultValue === 'number' ? stat.defaultValue : 10);
    values[stat.key] = value;
    rawStats[stat.key] = value;
  }

  return values;
}

/**
 * Génère un personnage complet (abilities + stats dérivées) selon les règles du système de jeu actif.
 * Remplace rollStats() de app/creation/page.tsx — généralisé sur la liste d'abilities du schéma
 * au lieu de [FOR,DEX,CON,INT,SAG,CHA] en dur, applique les modificateurs raciaux (fournis par l'appelant,
 * la lecture de /tabs/race.json reste hors du moteur : comportement métier "race", pas une règle de système).
 */
export function rollCharacterStats(
  gameSystem: GameSystemDefinition,
  raceModifiers: Record<string, number> = {},
  tableCustomStats: StatDefinition[] = [],
  /** Champs méta additionnels référencés par des formules (ex `deVie` pour diceField), pas des abilities elles-mêmes. */
  extraFields: Record<string, unknown> = {},
): RolledCharacterStats {
  const rule = gameSystem.creation ?? { method: 'manual' as const };
  const abilityDefs = abilitiesOf(gameSystem);
  const abilityKeys = abilityDefs.map((s) => s.key);

  const rolledAbilities = rollAbilities(rule, abilityDefs, gameSystem.modifierFormula);
  const abilities: Record<string, number> = {};
  for (const key of abilityKeys) {
    abilities[key] = rolledAbilities[key] + (raceModifiers[key] || 0);
  }

  // Une stat 'derived' ou 'vital' avec sa propre rollFormula (ex PV_Max = aléatoire entre 1 et 20,
  // PV = Variable→PV_Max) a besoin des autres stats déjà résolues (abilities + derived/vital déjà
  // tirées avant elle dans l'ordre de ses dépendances) pour évaluer sa formule — première passe SANS
  // aucune de ces stats encore stockée, pour obtenir un contexte de base (abilities + derived normales),
  // puis chacune est tirée à son tour et vient enrichir le contexte pour la suivante (ex PV_Max doit
  // être résolue avant PV qui la référence).
  const rollableDefs = sortByRollDependencies(rollableDerivedOrVitalsOf(gameSystem));
  const firstPass = resolveCharacterStats(gameSystem, tableCustomStats, { ...extraFields, ...abilities });
  const statDefsForRoll = Object.fromEntries(gameSystem.stats.map((s) => [s.key, s]));
  const rolledDerivedOrVital: Record<string, number> = {};
  for (const stat of rollableDefs) {
    // _rawContext: true fait qu'un noeud {type:'stat', key} lit directement rawStats[key] (la valeur
    // déjà tirée pour une stat précédente dans CETTE boucle, ex PV_Max), au lieu de repasser par
    // resolveStatValue qui — pour une stat 'derived' avec valueFormula — ignorerait cette valeur tirée
    // et recalculerait depuis valueFormula (ex retomberait sur la constante par défaut de PV_Max au lieu
    // de son tirage aléatoire). Même mécanisme que pour une formule de modificateur (cf. formula.ts).
    const ctx: FormulaContext = { rawStats: { ...firstPass.values, ...rolledDerivedOrVital }, statDefs: statDefsForRoll, _rawContext: true };
    rolledDerivedOrVital[stat.key] = evaluateFormula(stat.rollFormula!, ctx);
  }

  // Résolution finale : la valeur de départ tirée pour chaque stat derived/vital est passée comme "déjà
  // stockée" (comme une valeur de personnage existante), pour qu'une stat 'derived' garde cette valeur
  // figée au lieu d'être recalculée depuis valueFormula, et qu'une stat 'vital' voie ses bornes
  // min/maxFormula s'appliquer normalement au lieu de retomber sur le calcul par défaut "démarre au
  // Maximum" réservé aux stats sans rollFormula.
  const resolved = resolveCharacterStats(gameSystem, tableCustomStats, { ...extraFields, ...abilities, ...rolledDerivedOrVital });
  const derived: Record<string, number | string | boolean> = {};
  for (const [key, value] of Object.entries(resolved.values)) {
    if (!abilityKeys.includes(key)) derived[key] = value;
  }

  return { rolledAbilities, abilities, derived };
}
