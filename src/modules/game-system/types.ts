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
  /** Nombre maximum de fois que le joueur peut cliquer "Lancer les dés" à la création — absent = illimité
   *  (comportement historique inchangé). Limite le nombre de CLICS, pas une notion de "meilleur tirage" :
   *  le joueur garde le dernier résultat obtenu, le bouton se désactive une fois la limite atteinte. */
  maxRolls?: number;
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
  /** Espèces/races proposées aux joueurs à la création de personnage (remplace race.json pour un
   *  système custom) — génériques, leurs modificateurs référencent les clés de `stats` ci-dessus. */
  races?: RaceDefinition[];
  /** Profils/classes proposés aux joueurs à la création de personnage (remplace profile.json). */
  profiles?: ProfileDefinition[];
  /** Nom d'affichage libre pour la catégorie "races" (ex "Espèce", "Origine", "Lignée") — remplace
   *  uniquement le libellé affiché aux joueurs (onglet, titres) ; le champ interne character.Race et
   *  la structure RaceDefinition restent inchangés. Absent = "Race" (défaut). */
  raceLabel?: string;
  /** Nom d'affichage libre pour la catégorie "profils" (ex "Classe", "Archétype", "Voie"). Absent = "Profil". */
  profileLabel?: string;
  /** Nom d'affichage libre pour l'entité possédée par le GROUPE (la table), pas par un personnage
   *  individuel — le MJ choisit ce que représente cette entité pour son système (ex "Vaisseau", "Base
   *  secrète", "Caravane", "Guilde"). Absent = aucune entité de groupe activée pour ce système
   *  (`groupEntityStats` reste vide/non pertinent tant que ce label n'est pas défini). */
  groupEntityLabel?: string;
  /** Schéma de stats de l'entité de groupe — généricité identique à `stats` ci-dessus (mêmes mécanismes :
   *  formules, catégories, groupes), mais appliqué à une entité de la table plutôt qu'à un personnage.
   *  Absent/vide = pas de stats configurées. Les instances vivent séparément, dans
   *  Salle/{roomId}/groupEntities. */
  groupEntityStats?: StatDefinition[];
  /** Règle de génération optionnelle pour une NOUVELLE entité de groupe (ex tirage initial d'une stat) —
   *  distincte de `creation` (personnages) : pas de rollConstraints/applyRacialModifiers, une entité de
   *  groupe n'a pas de race. */
  groupEntityCreation?: { method: 'roll' | 'manual'; rollFormula?: FormulaNode };
  /** Dés à symboles configurables par le MJ (ex système narratif façon Star Wars : Boost/Setback/
   *  Ability/Difficulty/Proficiency/Challenge/Force) — généricité totale, aucun dé n'est codé en dur.
   *  Absent/vide = système purement numérique, comportement inchangé (D&D, Nooblies...). */
  symbolDice?: SymbolDieDefinition[];
  /** Règles textuelles du système (glossaire affiché dans le wiki/la recherche, ex "Jet de sauvegarde")
   *  — remplace le Rules.json statique : chaque système porte ses propres règles, éditées par le MJ. */
  rules?: GameRuleEntry[];
  /** Nom d'affichage libre pour la catégorie "lieux" (ex "Planète", "Ville", "Plan") — absent = feature
   *  désactivée (aucun onglet Lieux dans la recherche/le wiki, quel que soit le contenu déjà créé). */
  locationLabel?: string;
  /** Schéma des champs additionnels d'un lieu, en plus de nom/description/image (toujours présents) —
   *  ex "Climat", "Population", "Faction dominante" pour un système façon Star Wars. Texte libre
   *  uniquement (comme GameRuleEntry) : pas de formule/calcul, purement narratif. Les instances de lieux
   *  elles-mêmes vivent en contenu Firestore (kind 'location', cf game-content/types.ts), pas ici — même
   *  logique que "gros contenu → sous-collection" pour l'équipement/le bestiaire. */
  locationFields?: LocationFieldDefinition[];
  /** Compétences configurées par le MJ (ex Athlétisme, Discrétion, Astrogation) — chacune liée à une
   *  Caractéristique de `stats`. Donnée de RÈGLES (comme `stats`), pas narrative : jamais superposée par
   *  narrativeOverlay() pour un système builtin. Absent/vide = pas de système de compétences à rangs pour
   *  cette table (comportement inchangé, ex dnd-classic qui garde son propre système de Voies). */
  skills?: SkillDefinition[];
  /** Nom d'affichage libre pour la catégorie "compétences" (ex "Compétences", "Talents actifs").
   *  Absent = "Compétences" (défaut). */
  skillLabel?: string;
  /** Points d'expérience donnés à un personnage fraîchement créé, à dépenser ensuite via la fiche
   *  (achat de rangs de compétence, de talents, de nouvelles spécialisations) — constante simple éditée
   *  par le MJ, pas une formule (contrairement à la plupart des autres valeurs du moteur, une valeur de
   *  départ fixe suffit ici). Absent = 0. */
  startingXp?: number;
  /** Règle générique de composition d'un pool de dés à partir de DEUX valeurs numériques quelconques
   *  (ex Caractéristique liée vs rang de Compétence) : max(a,b) = nombre total de dés de base, min(a,b) =
   *  combien de ces dés de base sont upgradés vers le dé "supérieur". Ne connaît ni Caractéristique ni
   *  Compétence — réutilisable par tout futur système ayant une règle de composition de pool similaire.
   *  Référence deux SymbolDieDefinition.key déjà définis par le MJ (ex baseDiceKey='ability',
   *  upgradedDiceKey='proficiency') — aucun nom de dé codé en dur. Absent = pas de mécanisme de pool
   *  dérivé activé (comportement inchangé : jets numériques classiques ou dés à symboles à nombre fixe). */
  diceUpgradeRule?: DicePoolUpgradeRule;
}

export interface GameRuleEntry {
  title: string;
  description: string;
}

export interface LocationFieldDefinition {
  /** Identifiant stable, clé de stockage dans LocationDoc.values (généré côté UI, ex crypto.randomUUID()). */
  key: string;
  label: string;
}

export interface DicePoolUpgradeRule {
  baseDiceKey: string;
  upgradedDiceKey: string;
}

export interface SkillDefinition {
  /** Identifiant stable, clé de stockage (character.skillRanks[key], ProfileDefinition.careerSkillKeys,
   *  SpecializationDoc.grantedSkillKeys). Ne doit pas changer après publication. */
  key: string;
  label: string;
  /** Clé de la StatDefinition (en pratique category='ability') à laquelle cette compétence est liée —
   *  ex Athlétisme -> clé de la stat Vigueur. Référence libre, non validée à la structure (comme
   *  combatDefenseKey) : une clé orpheline dégrade proprement plutôt que de bloquer. */
  linkedStatKey: string;
  /** Regroupement visuel optionnel dans l'éditeur MJ et la fiche perso (ex "Combat", "Social",
   *  "Connaissance") — indépendant de linkedStatKey, même logique que StatDefinition.group. */
  group?: string;
  order?: number;
}

// ─── Symbol dice (dés narratifs à symboles) ──────────────────────────
// 100% générique : un "symbole" (Succès, Échec, Avantage...) N'EST PAS un type fermé côté moteur —
// c'est simplement une StatDefinition ordinaire que le MJ définit dans son système (ex category='ability'
// pour un compteur brut rempli par les faces, category='derived' avec valueFormula pour un résultat net
// calculé, ex max(sub(succesBrut, echecBrut), const 0) via le même FormulaEditor que le reste du moteur).
// Aucune liste de noms de symboles n'existe dans le code.

export interface SymbolDieFace {
  /** Valeurs brutes assignées à des stats du système par cette face — clé = StatDefinition.key d'une
   *  stat "compteur" quelconque définie par le MJ (ex "succesBrut", ou n'importe quel nom pour un
   *  futur système différent). Face "vide" (aucun effet) = objet vide {}. */
  values: Record<string, number>;
}

export interface SymbolDieDefinition {
  /** Identifiant stable, utilisé tel quel dans la notation texte du lanceur de dés (ex "1boost + 2ability") —
   *  jamais un nombre de faces (dN) pour ne pas entrer en collision avec les dés numériques classiques. */
  key: string;
  label: string;
  /** Une entrée par face, dans l'ordre (index 0 = résultat du jet "1", etc.) — longueur = nombre de faces. */
  faces: SymbolDieFace[];
}

export interface RacialAbility {
  /** Identifiant stable (généré côté UI, ex crypto.randomUUID()). */
  id: string;
  label: string;
  /** Texte libre, affiché sur la fiche — pas d'effet mécanique automatisé (comme capacite_*.json). */
  description?: string;
}

export interface RaceDefinition {
  id: string;
  label: string;
  description?: string;
  image?: string;
  /** Modificateurs appliqués aux stats du système actif à la création — clés = StatDefinition.key
   *  du système en cours (générique, pas FOR/DEX en dur). Ex { FOR: -2, CHA: 2 } ou { car3: 2 }. */
  modifiers: Record<string, number>;
  abilities: RacialAbility[];
  /** Taille moyenne (cm), proposée comme valeur de départ à la création. */
  avgHeight?: number;
  /** Poids moyen (kg), proposé comme valeur de départ à la création. */
  avgWeight?: number;
}

export interface ProfileDefinition {
  id: string;
  label: string;
  description?: string;
  image?: string;
  /** Notation de dé texte (ex "d8", "d12") — réutilisée telle quelle par le mécanisme diceField déjà
   *  existant (ex PV_Max = 1 + mod(CON) + diceField:deVie), pas de nouveau mécanisme de dé. */
  hitDie?: string;
  /** Les compétences "de carrière" de ce Profil (ex 8 en système façon EotE, clés SkillDefinition.key) —
   *  coûtent moins cher à améliorer avec l'XP qu'une compétence hors-carrière (cf skillUpgradeCost dans
   *  rules-engine/skills.ts). Absent/vide = pas de notion de carrière pour ce profil (comportement
   *  dnd-classic inchangé, hitDie reste la seule donnée mécanique utile dans ce cas). */
  careerSkillKeys?: string[];
}

/** Un module de type 'game-system' fournit gameSystem en plus des champs ModuleDefinition standards. */
export interface GameSystemModule extends ModuleDefinition {
  gameSystem: GameSystemDefinition;
}

export function isGameSystemModule(mod: ModuleDefinition): mod is GameSystemModule {
  return mod.manifest.type === 'game-system' && 'gameSystem' in mod;
}
