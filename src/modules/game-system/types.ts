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

  /** Pour category='vital' uniquement : sens du "bon état" pour cette jauge — vrai si 0 représente le
   *  meilleur état (ex Blessures/Stress façon EotE : 0 = indemne/calme, le max = très blessé/très
   *  stressé), faux/absent si le MAX représente le meilleur état (ex PV façon D&D : le max = pleine
   *  santé, 0 = mort). Utilisé uniquement par le bouton "Repos complet" de la fiche pour savoir vers
   *  quelle borne ramener la jauge — n'affecte aucun calcul de formule. */
  recoversToZero?: boolean;

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
  /** Mécanique d'Obligation (ex Star Wars EotE) : dettes/contraintes narratives chiffrées,
   *  OPTIONNELLES et multiples — liste {value, text} posée à la création sur le doc personnage
   *  (champ Obligations, tableau possiblement vide) et affichée/éditée ensuite par un widget de
   *  fiche fourni par le bundle. Absent = pas d'étape Obligation à la création (ex dnd-classic). */
  obligation?: ObligationConfig;
  /** Règle générique de composition d'un pool de dés à partir de DEUX valeurs numériques quelconques
   *  (ex Caractéristique liée vs rang de Compétence) : max(a,b) = nombre total de dés de base, min(a,b) =
   *  combien de ces dés de base sont upgradés vers le dé "supérieur". Ne connaît ni Caractéristique ni
   *  Compétence — réutilisable par tout futur système ayant une règle de composition de pool similaire.
   *  Référence deux SymbolDieDefinition.key déjà définis par le MJ (ex baseDiceKey='ability',
   *  upgradedDiceKey='proficiency') — aucun nom de dé codé en dur. Absent = pas de mécanisme de pool
   *  dérivé activé (comportement inchangé : jets numériques classiques ou dés à symboles à nombre fixe). */
  diceUpgradeRule?: DicePoolUpgradeRule;
  /** Disposition par défaut des widgets de la fiche personnage (react-grid-layout), appliquée à tout
   *  personnage qui n'a pas encore sa propre disposition sauvegardée (Character.layout) — remplace
   *  DEFAULT_LAYOUT codé en dur dans fiche.tsx pour ce système. Structure volontairement non typée
   *  précisément (pas de dépendance à react-grid-layout dans ce module) : chaque entrée est un objet
   *  {i, x, y, w, h, minW?, minH?} recopié tel quel dans le layout runtime. Absent = repli sur
   *  DEFAULT_LAYOUT. */
  defaultCharacterLayout?: CharacterLayoutEntry[];
  /** Ordre par défaut des icônes de la sidebar (Sidebar.tsx), appliqué à tout utilisateur qui n'a pas
   *  encore personnalisé sa barre (aucun state persisté en localStorage) — un par rôle, remplace
   *  DEFAULT_ITEM_IDS codé en dur pour ce système. Chaque valeur est un id de CustomActionDef
   *  (src/lib/customActions.ts, ex SHORTCUT_ACTIONS.TAB_FICHE) — pas de nom d'onglet en dur ici, un
   *  système custom choisit librement quelles actions il expose et dans quel ordre. Absent (ou id
   *  inconnu/filtré par rôle) = repli sur l'ordre historique. */
  defaultSidebarLayout?: { mj?: string[]; player?: string[] };
  /** Cartes génériques du système (fond image + marqueurs cliquables) — un onglet natif de sidebar
   *  dédié ("Carte"), toujours visible, ouvert au MJ ET aux joueurs. Plusieurs cartes distinctes
   *  possibles (ex Carte Galactique + Carte de Ville), chacune avec son propre fond et ses propres
   *  marqueurs — le joueur choisit la carte à consulter si plusieurs existent. `image` est une URL
   *  Firebase Storage (uploadée par le MJ via uploadWithQuota, même mécanisme que les images de
   *  personnage/PNJ) — jamais d'image fournie par le moteur lui-même (risque de licence). Les cartes
   *  vivent ICI (inline sur GameSystemDefinition, pas un ContentDoc Firestore séparé) pour voyager
   *  dans le MÊME export JSON que le reste des règles. Absent ou vide = aucune carte encore créée
   *  (l'onglet reste visible mais affiche un message d'invite, jamais masqué). */
  maps?: MapConfig[];
  /** Règle d'initiative du tracker de combat (MJcombat) — remplace le "1d20 + INIT" historique codé en
   *  dur. Deux modes exclusifs : `formula` (numérique, évaluée par personnage, peut contenir des dés —
   *  ex add(dice '1d20', stat 'INIT') pour un système D&D-like) OU `skillKeys` (pool de compétence à
   *  dés à symboles, ex EotE : le MJ choisit AU MOMENT du jet laquelle s'applique — Sang-froid si
   *  préparé, Vigilance si surpris — chaque personnage lance son pool carac liée + rang via
   *  diceUpgradeRule, classé par `rankStatKey` (ex succesNets) puis départagé par `tieStatKey` (ex
   *  avantagesNets)). Absent = repli historique (1d20 + première stat derived du système). */
  initiative?: InitiativeRule;
  /** Règle d'attaque du flux de combat (combat.tsx/MJcombat.tsx) pour un système à dés à symboles
   *  (ex EotE) : compétences d'attaque proposées, dés négatifs/situationnels du pool, stat de succès
   *  nets (toucher si >= 1, chaque net s'ajoute aux dégâts de base de l'arme) et stat d'encaissement
   *  de la cible (soustraite des dégâts à l'application par le MJ). Absent = flux d'attaque numérique
   *  historique (1d20 + bonus vs Défense, dégâts aux dés d'arme) strictement inchangé. */
  combat?: CombatRule;
  /** Identifiant d'une bibliothèque d'objets suggérés (glisser-déposer sur la carte, cf ObjectDrawer.tsx)
   *  alternative à celle par défaut (D&D-classic) — ex 'starwars' pour piocher dans
   *  SUGGESTED_OBJECTS_STARWARS (src/lib/suggested-objects-starwars.ts) au lieu de SUGGESTED_OBJECTS.
   *  Absent = bibliothèque par défaut. Chaque bibliothèque reste un fichier statique généré une fois
   *  (pas un ContentKind Firestore) — même principe que defaultSidebarLayout référençant des id de
   *  CustomActionDef : le moteur ne connaît que l'id, jamais le contenu réel d'un système précis. */
  objectLibraryId?: string;
  /** Typographie de l'app imposée par le système de règles : polices chargées à l'exécution
   *  (FontFace) puis surcharge des variables CSS --font-body/--font-title pour TOUTE la salle tant
   *  que ce système est actif (GameSystemTypography.tsx, monté dans le layout de salle). Les src de
   *  polices peuvent être des chemins relatifs d'un bundle zip (assets/fonts/x.woff2), réécrits en
   *  URL R2 à l'import. Absent = polices historiques (IM Fell English / Cinzel) inchangées. */
  typography?: TypographyConfig;
}

/** Une police embarquée par le bundle du système, chargée à l'exécution via l'API FontFace. */
export interface FontFaceDefinition {
  /** Nom de famille CSS déclaré (ex 'Aurebesh') — référencé par bodyFamily/titleFamily. */
  family: string;
  /** URL du fichier (.woff2/.woff/.ttf/.otf) : chemin relatif au bundle (assets/fonts/x.woff2),
   *  réécrit en URL R2 à l'import — ou URL https directe si le MJ héberge lui-même. */
  src: string;
  /** Graisse CSS (ex '400', '700', '100 900' pour une police variable). Absent = 'normal'. */
  weight?: string;
  /** Style CSS ('normal' | 'italic'). Absent = 'normal'. */
  style?: string;
}

/** Typographie de l'app configurée par le système de règles — cf GameSystemDefinition.typography. */
export interface TypographyConfig {
  /** Famille appliquée à --font-body (texte courant). Doit exister dans `fonts` ou être installée. */
  bodyFamily?: string;
  /** Famille appliquée à --font-title (titres). */
  titleFamily?: string;
  /** Polices à charger avant application (une entrée par fichier/graisse). */
  fonts?: FontFaceDefinition[];
}

export interface MapConfig {
  id: string;
  label: string;
  image: string;
  markers: MapMarker[];
}

export interface CombatRule {
  /** Compétences d'attaque proposées au joueur (clés SkillDefinition, ex melee/ranged_light...). */
  skillKeys: string[];
  /** Nombre de dés de difficulté par défaut du pool (ex 2 = difficulté "Moyenne" EotE) — ajustable
   *  par le joueur/MJ au moment du jet selon la portée/situation. */
  defaultDifficulty?: number;
  /** Clés SymbolDieDefinition des dés négatifs/situationnels ajoutés au pool. */
  difficultyDieKey?: string;
  bonusDieKey?: string;
  penaltyDieKey?: string;
  /** Stat dérivée du jet donnant les succès nets — toucher si >= 1, chaque net s'ajoute aux dégâts. */
  successStatKey?: string;
  /** Stat d'encaissement de la CIBLE, soustraite des dégâts à l'application (MJcombat). */
  soakStatKey?: string;
  /** Stat dérivée des Avantages nets du jet — l'Indice Critique de l'arme (item.critique) se
   *  déclenche quand cette stat atteint l'indice (activations multiples : +10 au d100 chacune). */
  advantageStatKey?: string;
  /** Stat dérivée des Triomphes du jet — un Triomphe déclenche une Blessure Critique quel que
   *  soit l'Indice Critique de l'arme. */
  triumphStatKey?: string;
  /** Pool par défaut d'une attaque à mains nues SANS compétence choisie : N dés de base (ex 2 dés
   *  verts d'Aptitude). Une compétence explicitement sélectionnée reprend le pool carac+rang normal. */
  unarmedBaseDice?: number;
}

export interface InitiativeRule {
  /** Mode numérique : formule évaluée pour chaque personnage (peut contenir des noeuds dice). */
  formula?: FormulaNode;
  /** Mode pool de compétence : clés SkillDefinition éligibles, choisies par le MJ au moment du jet. */
  skillKeys?: string[];
  /** Stat (dérivée du jet de dés à symboles) de classement principal, ex 'succesNets'. */
  rankStatKey?: string;
  /** Stat de départage des égalités, ex 'avantagesNets'. */
  tieStatKey?: string;
}

export interface MapMarker {
  id: string;
  name: string;
  description?: string;
  image?: string;
  /** Position normalisée (fraction 0-1 de la largeur/hauteur NATURELLE de l'image de fond),
   *  indépendante de la résolution ou du zoom courant. */
  x: number;
  y: number;
}

export interface CharacterLayoutEntry {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
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

/** Config de la mécanique d'Obligation (cf GameSystemDefinition.obligation). */
export interface ObligationConfig {
  /** Valeur pré-remplie pour chaque nouvelle entrée d'Obligation (le joueur peut l'ajuster). */
  startingValue: number;
  /** Plancher en jeu — une Obligation ne descend jamais en dessous (5 dans EotE). Absent = 0. */
  minValue?: number;
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
  /** Skin 3D à utiliser pour CE dé lors de l'animation (id de DICE_SKINS, ex 'jade', 'ruby') — permet
   *  de distinguer visuellement deux dés de même forme physique (ex Aptitude vert vs Difficulté violet,
   *  tous deux d8). Absent = skin global choisi par l'utilisateur. */
  skinId?: string;
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
