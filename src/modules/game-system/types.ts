import type { ModuleDefinition } from '@/modules/types';

// ─── Stat schema ────────────────────────────────────────────────────

export type StatCategory = 'ability' | 'derived' | 'vital' | 'meta';
// 'ability'  : stat de base tirée aux dés / achetée (FOR, DEX...)
// 'derived'  : calculée depuis une formule (Defense, Contact, PV_Max...)
// 'vital'    : valeur "courante" éditable, bornée par une autre stat (PV borné par PV_Max)
// 'meta'     : non numérique / informative (Race, Background...) — pas de formule, pas de modificateur

export interface StatDefinition {
  /** Identifiant stable ET clé de stockage Firestore (racine du doc character). Ne doit pas changer après publication. */
  key: string;
  label: string;
  shortLabel?: string;
  category: StatCategory;
  dataType: 'number' | 'text' | 'percent' | 'boolean';

  /** Formule de modificateur optionnelle (ex D&D: floor((v-10)/2)). Absente = pas de modificateur. */
  modifierFormula?: FormulaNode;

  /** Pour category='derived'|'vital' uniquement : formule de calcul de la valeur elle-même
   *  (réévaluée en continu, ex Défense = 18 + mod(DEX)). */
  valueFormula?: FormulaNode;

  /** Pour category='ability' uniquement : formule de tirage à la création du personnage
   *  (ex "aléatoire entre 6 et 20"). Évaluée une seule fois à la création, jamais réévaluée ensuite —
   *  contrairement à valueFormula qui est pour les stats dérivées recalculées en continu. */
  rollFormula?: FormulaNode;

  /** Bornes optionnelles de la valeur courante — chacune une formule quelconque (constante, référence
   *  à une autre stat, aléatoire...), au même titre que n'importe quel autre calcul du système. Absentes
   *  par défaut (aucune borne). Ex pour PV : minFormula = 0 (constante), maxFormula = Variable→PV_Max. */
  minFormula?: FormulaNode;
  maxFormula?: FormulaNode;

  defaultValue?: number | string | boolean;

  isRollable?: boolean;
  rollUsesModifier?: boolean;
  visibleToPlayers?: boolean;

  order?: number;
  group?: string;

  /** D'où vient cette définition : builtin d'un module publié, ou stat ajoutée à la table par le MJ. */
  origin: 'module' | 'table-custom';

  /** Stat table-custom non partagée (comportement legacy d'un CustomField par personnage). */
  perCharacterOverride?: boolean;

  /** Stat requise par l'architecture (ex PV/PV_Max d'un système custom fraîchement créé) —
   *  ne peut pas être supprimée par le MJ, seule sa formule/son nom reste éditable. */
  protected?: boolean;
}

// ─── Formula AST ────────────────────────────────────────────────────
// Union discriminée, sérialisable JSON pur — stockable telle quelle dans Firestore.
// Jamais de fonctions/closures dans l'AST : aucun eval/new Function nulle part.

export type FormulaNode =
  | { type: 'const'; value: number }
  | { type: 'stat'; key: string }
  | { type: 'modifier'; key: string }
  | { type: 'bonus'; key: string }
  | { type: 'dice'; notation: string }
  | { type: 'diceField'; key: string }
  /** Valeur brute de la stat en cours d'évaluation — utilisé uniquement dans la formule de
   *  modificateur GLOBALE du système (GameSystemDefinition.modifierFormula), qui doit s'appliquer
   *  à n'importe quelle ability sans référencer une clé fixe (ex "self" au lieu de "FOR"). */
  | { type: 'self' }
  | { type: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max'; args: FormulaNode[] }
  | { type: 'floor' | 'ceil'; arg: FormulaNode }
  | { type: 'clamp'; arg: FormulaNode; lo: FormulaNode; hi: FormulaNode };

// ─── Character creation rules ───────────────────────────────────────

// V1 : agrégats à une seule valeur cible (couvre Nooblies). countAbove/countBelow (nécessitant un 2e
// champ "seuil" distinct de la cible du compte) laissés pour une itération séparée si besoin réel.
export type RollConstraintAggregate =
  | 'evenCount'      // nombre de valeurs paires
  | 'oddCount'       // nombre de valeurs impaires
  | 'sumValues'      // somme des valeurs brutes
  | 'sumModifiers';  // somme des modificateurs (mod() de chaque stat)

export type RollComparisonOperator = '=' | '<' | '>' | '<=' | '>=';

export interface RollConstraintRule {
  id: string;                          // identifiant stable (généré côté UI, ex crypto.randomUUID())
  label?: string;                      // nom libre optionnel affiché dans l'éditeur (ex "Parité")
  statKeys: string[];                  // clés des stats concernées par CETTE contrainte
  aggregate: RollConstraintAggregate;
  operator: RollComparisonOperator;
  target: number;                      // valeur cible comparée à l'agrégat
  /** Nombre max de tentatives avant d'abandonner (défaut 1 000 000). La contrainte est IMPÉRATIVE :
   *  si elle n'est jamais satisfaite, le tirage lève une erreur plutôt que de retomber sur une valeur
   *  arbitraire — ce plafond n'est là que comme garde-fou contre une config mathématiquement impossible. */
  maxAttempts?: number;
}

export interface CharacterCreationRule {
  method: 'roll' | 'point-buy' | 'manual';
  rollFormula?: FormulaNode;
  rollConstraints?: RollConstraintRule[];
  applyRacialModifiers?: boolean;
}

// ─── Game system definition ─────────────────────────────────────────

export interface GameSystemDefinition {
  systemId: string;
  stats: StatDefinition[];
  creation?: CharacterCreationRule;
  /** clé de la stat utilisée comme "défense" pour la résolution de combat générique. */
  combatDefenseKey?: string;
  /** clés utilisées comme "valeur d'attaque" comparées à combatDefenseKey. */
  combatAttackKeys?: string[];
  /** Formule de modificateur GLOBALE, partagée par toutes les abilities du système (ex floor((self-10)/2)) —
   *  utilise {type:'self'} pour référencer la valeur de la stat en cours. Absente = repli sur le calcul
   *  par défaut floor((v-10)/2), ou sur StatDefinition.modifierFormula par-stat si défini (legacy dnd-classic). */
  modifierFormula?: FormulaNode;
  /** Noms de groupes visuels créés par le MJ pour organiser ses stats dans l'éditeur (ex "Caractéristiques",
   *  "Combat", "Social") — ordonnés, existent indépendamment des stats qui les référencent (StatDefinition.group)
   *  pour permettre de créer un groupe vide avant d'y ranger des stats. Sans rapport avec StatCategory
   *  (ability/derived/vital/meta), qui reste le type de calcul technique de la stat. */
  statGroups?: string[];
}

/** Un module de type 'game-system' fournit gameSystem en plus des champs ModuleDefinition standards. */
export interface GameSystemModule extends ModuleDefinition {
  gameSystem: GameSystemDefinition;
}

export function isGameSystemModule(mod: ModuleDefinition): mod is GameSystemModule {
  return mod.manifest.type === 'game-system' && 'gameSystem' in mod;
}
