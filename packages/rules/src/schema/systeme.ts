/**
 * Schéma d'un système de jeu complet. Tout ce qui est règle est ici, en
 * données : le moteur ne connaît aucun nom d'attribut, de dé ou de sorte.
 *
 * Le schéma Zod ne vérifie que la forme. La cohérence (références existantes,
 * formules bien typées, pas de cycle) est vérifiée par `charger()`.
 */
import { z } from 'zod';

/** Clé utilisable dans une formule (`@FOR`, `arme.degats`) : lettres, chiffres, `_`. */
export const Cle = z
  .string()
  .regex(/^[\p{L}_][\p{L}\p{N}_]*$/u, 'Lettres, chiffres et « _ » uniquement');
/** Identifiant d'objet (entrée, achat, table…) : autorise aussi le tiret. */
export const Id = z
  .string()
  .regex(/^[\p{L}\p{N}_][\p{L}\p{N}_-]*$/u, 'Lettres, chiffres, « _ » et « - » uniquement');
/** Formule textuelle, analysée et typée au chargement. */
export const Formule = z
  .union([z.string().min(1), z.number(), z.boolean()])
  .transform((v) => String(v));
export type Formule = z.input<typeof Formule>;

const Libelle = z.string().min(1).max(200);
const Description = z.string().max(20_000).optional();

// ─── Attributs ───────────────────────────────────────────────────────────────

const AttributCommun = {
  cle: Cle,
  nom: Libelle,
  abrege: z.string().max(12).optional(),
  description: Description,
  /** Identifiant d'un groupe déclaré sur le type d'entité. */
  groupe: Id.optional(),
  visibilite: z.enum(['tous', 'mj']).default('tous'),
};

/**
 * `true` : formule de modificateur commune du système ; texte : formule propre
 * (la variable `valeur` désigne la valeur de l'attribut).
 */
const Modificateur = z.union([z.boolean(), Formule]).optional();

export const Attribut = z.discriminatedUnion('nature', [
  z.object({
    ...AttributCommun,
    /** Valeur saisie, achetée ou tirée. */
    nature: z.literal('base'),
    defaut: z.number().default(0),
    min: Formule.optional(),
    max: Formule.optional(),
    modificateur: Modificateur,
  }),
  z.object({
    ...AttributCommun,
    /** Recalculée en continu à partir des autres attributs. */
    nature: z.literal('derivee'),
    type: z.enum(['nombre', 'booleen', 'texte']).default('nombre'),
    formule: Formule,
    modificateur: Modificateur,
  }),
  z.object({
    ...AttributCommun,
    /** Valeur courante bornée (PV, Stress, munitions…). */
    nature: z.literal('ressource'),
    max: Formule,
    min: Formule.default('0'),
    /** Valeur à la création : borne haute (`max`), basse (`min`) ou une formule. */
    initiale: z.union([z.enum(['max', 'min']), Formule]).default('max'),
    /** Borne vers laquelle le repos ramène la ressource. */
    recuperation: z.enum(['max', 'min']).default('max'),
    /** Faux : la valeur peut dépasser le maximum (blessures au-delà du seuil). */
    plafonnee: z.boolean().default(true),
  }),
  z.object({
    ...AttributCommun,
    nature: z.literal('texte'),
    defaut: z.string().default(''),
    multiligne: z.boolean().default(false),
  }),
  z.object({
    ...AttributCommun,
    nature: z.literal('choix'),
    options: z.array(z.object({ valeur: Cle, nom: Libelle })).min(1),
    defaut: Cle.optional(),
  }),
  z.object({
    ...AttributCommun,
    nature: z.literal('booleen'),
    defaut: z.boolean().default(false),
  }),
]);
export type Attribut = z.output<typeof Attribut>;

export const TypeEntite = z.object({
  id: Id,
  nom: Libelle,
  description: Description,
  groupes: z.array(z.object({ id: Id, nom: Libelle })).default([]),
  attributs: z.array(Attribut),
});
export type TypeEntite = z.output<typeof TypeEntite>;

// ─── Effets ──────────────────────────────────────────────────────────────────

const EffetCommun = {
  /** L'effet ne s'applique que si la condition est vraie. */
  condition: Formule.optional(),
  /** Les effets d'une même famille ne se cumulent pas : seul le plus fort compte. */
  famille: Id.optional(),
  description: z.string().max(500).optional(),
};

/**
 * Résistance aux dégâts, portée par l'entité qui les reçoit : réduction (RD 2),
 * multiplication (×0,5 résistance, ×2 vulnérabilité) ou annulation (immunité).
 * Ordre : annulation, multiplications, puis réductions ; résultat arrondi à
 * l'entier inférieur et jamais négatif.
 */
export const EffetDegats = z.object({
  ...EffetCommun,
  sur: z.literal('degats'),
  /** Types concernés ; absent : tous les dégâts, typés ou non. */
  types: z.array(Id).optional(),
  /** Attributs concernés (PV, blessures…) ; absent : tous. */
  attributs: z.array(Cle).optional(),
  operation: z.enum(['reduire', 'multiplier', 'annuler']),
  valeur: Formule.default('0'),
});
export type EffetDegats = z.output<typeof EffetDegats>;

export const Effet = z.discriminatedUnion('sur', [
  z.object({
    ...EffetCommun,
    /** Modifie un attribut de l'entité qui possède la source. */
    sur: z.literal('attribut'),
    attribut: Cle,
    operation: z.enum(['ajouter', 'multiplier', 'fixer', 'minimum', 'maximum']),
    valeur: Formule,
  }),
  z.object({
    ...EffetCommun,
    /** Rangs supplémentaires dans une entrée à rangs (rang gratuit d'espèce…). */
    sur: z.literal('rang'),
    entree: Id,
    valeur: Formule,
  }),
  z.object({
    ...EffetCommun,
    /** Marque des entrées (compétences de carrière…), lue par `marque()` dans les formules. */
    sur: z.literal('marque'),
    marque: Cle,
    entrees: z.array(Id).min(1),
  }),
  z.object({
    ...EffetCommun,
    /**
     * Modifie un jet : dés ajoutés, améliorés, rétrogradés ou retirés, bonus au
     * total. Ordre d'application : ajouts, améliorations, rétrogradations, retraits.
     */
    sur: z.literal('jet'),
    /** `cible` : l'effet s'applique quand le porteur est la cible de l'action (défense active). */
    cote: z.enum(['acteur', 'cible']).default('acteur'),
    /** Actions concernées (toutes si absent). */
    actions: z.array(Id).optional(),
    /** Condition sur le jet lui-même, par exemple `competence == "perception"`. */
    si: Formule.optional(),
    ajout: z
      .union([
        z.object({ de: Id, nombre: Formule }),
        z.object({ ameliorer: Id, vers: Id, nombre: Formule }),
        /** Remplace des dés `retrograder` par `vers`, sans en ajouter s'il n'y en a pas. */
        z.object({ retrograder: Id, vers: Id, nombre: Formule }),
        /** Retire des dés du pool (jamais en dessous de zéro). */
        z.object({ retirer: Id, nombre: Formule }),
        /** Ajoute une valeur à une variable de l'action (`variables` ou `apres`) : avantage, dégâts… */
        z.object({ variable: Cle, ajouter: Formule }),
        z.object({ bonus: Formule }),
      ])
      .optional(),
  }),
  EffetDegats,
]);
export type Effet = z.output<typeof Effet>;

// ─── Catalogues ──────────────────────────────────────────────────────────────

export const Champ = z.discriminatedUnion('type', [
  z.object({ id: Cle, nom: Libelle, type: z.literal('nombre'), defaut: z.number().optional() }),
  z.object({ id: Cle, nom: Libelle, type: z.literal('texte'), defaut: z.string().optional() }),
  z.object({ id: Cle, nom: Libelle, type: z.literal('booleen'), defaut: z.boolean().optional() }),
  /** Formule évaluée dans le contexte du porteur (dégâts `@vigueur + 2`…). */
  z.object({ id: Cle, nom: Libelle, type: z.literal('formule'), defaut: Formule.optional() }),
  /** Clé d'un attribut d'un type d'entité (caractéristique liée d'une compétence). */
  z.object({ id: Cle, nom: Libelle, type: z.literal('attribut'), entite: Id }),
  /** Référence vers une autre entrée (compétence utilisée par une arme). */
  z.object({ id: Cle, nom: Libelle, type: z.literal('entree'), sorte: Id }),
  z.object({ id: Cle, nom: Libelle, type: z.literal('entrees'), sorte: Id }),
]);
export type Champ = z.output<typeof Champ>;

export const Sorte = z.object({
  id: Cle,
  nom: Libelle,
  nomPluriel: Libelle.optional(),
  description: Description,
  /** Types d'entité pouvant posséder ces entrées. */
  pour: z.array(Id).min(1),
  /** Rang maximal (formule), si les entrées se possèdent par rangs. */
  rangs: z.object({ max: Formule }).optional(),
  /** Nombre maximal d'entrées de cette sorte par entité (1 pour une espèce). */
  maximum: z.number().int().positive().optional(),
  /** Les entrées de cette sorte peuvent être équipées / activées (variable `actif`). */
  activable: z.boolean().default(false),
  /** État d'une entrée activable obtenue sans possession explicite (capacité à activer : Rage…). */
  actifParDefaut: z.boolean().default(true),
  champs: z.array(Champ).default([]),
});
export type Sorte = z.output<typeof Sorte>;

/** Choix fait au moment de prendre une entrée (2 compétences au choix…). */
export const Choix = z.object({
  id: Id,
  nom: Libelle,
  /** Nombre d'entrées à retenir : formule sur le porteur (`4 + @bonusChoixCarriere`). */
  nombre: Formule,
  parmi: z.object({
    sorte: Id,
    entrees: z.array(Id).optional(),
    marque: Cle.optional(),
    sansMarque: Cle.optional(),
  }),
  /** Ce que reçoit chaque entrée choisie. */
  donne: z.discriminatedUnion('type', [
    z.object({ type: z.literal('rang'), valeur: Formule.default('1') }),
    z.object({ type: z.literal('marque'), marque: Cle }),
    z.object({ type: z.literal('possession') }),
  ]),
});
export type Choix = z.output<typeof Choix>;

/** Choix d'attributs (« +1 à une caractéristique au choix ») : les clés retenues vont dans `choix`. */
export const ChoixAttribut = z.object({
  id: Id,
  nom: Libelle,
  /** Formule avec la variable `rang` (rang de l'entrée qui porte le choix). */
  nombre: Formule,
  parmi: z.object({ attributs: z.array(Cle).optional(), groupe: Id.optional() }),
  operation: z.enum(['ajouter', 'minimum', 'maximum']).default('ajouter'),
  /** Variable `rang` : rang de l'entrée qui porte le choix. */
  valeur: Formule.default('1'),
});
export type ChoixAttribut = z.output<typeof ChoixAttribut>;

export const Entree = z.object({
  id: Id,
  sorte: Cle,
  nom: Libelle,
  description: Description,
  etiquettes: z.array(Id).default([]),
  /** Valeurs des champs déclarés par la sorte. */
  champs: z
    .record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.array(Id)]))
    .default({}),
  effets: z.array(Effet).default([]),
  choix: z.array(Choix).default([]),
  choixAttributs: z.array(ChoixAttribut).default([]),
  /** Condition pour pouvoir prendre l'entrée. */
  exige: Formule.optional(),
});
export type Entree = z.output<typeof Entree>;

// ─── Progression ─────────────────────────────────────────────────────────────

export const Monnaie = z.object({
  id: Cle,
  nom: Libelle,
  /** Total gagné (formule sur l'entité) ; le reste = total − dépenses du journal. */
  total: Formule,
  pour: z.array(Id).min(1),
});
export type Monnaie = z.output<typeof Monnaie>;

const Moment = z.enum(['creation', 'jeu', 'toujours']).default('toujours');

/**
 * Variables disponibles dans `cout`, `plafond` et `condition` :
 * `actuel` (valeur ou rang avant achat), `cible` (après achat), `nombre`
 * (entrées de la sorte déjà possédées), `creation` (booléen), et la fonction
 * `marque("m")` qui teste une marque sur l'entrée visée.
 */
export const Achat = z.object({
  id: Id,
  nom: Libelle,
  description: Description,
  obtient: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('attribut'),
      entite: Id,
      attributs: z.array(Cle).optional(),
      groupe: Id.optional(),
    }),
    z.object({ type: z.literal('rang'), sorte: Cle }),
    z.object({ type: z.literal('entree'), sorte: Cle }),
    z.object({ type: z.literal('noeud'), arbres: z.array(Id).optional() }),
  ]),
  monnaie: Cle,
  cout: Formule,
  plafond: Formule.optional(),
  condition: Formule.optional(),
  moment: Moment,
});
export type Achat = z.output<typeof Achat>;

const Cibles = z.object({ attributs: z.array(Cle).optional(), groupe: Id.optional() });

export const EtapeCreation = z.discriminatedUnion('type', [
  z.object({
    id: Id,
    nom: Libelle,
    description: Description,
    type: z.literal('choisir'),
    sorte: Cle,
    min: z.number().int().nonnegative().default(1),
    max: z.number().int().positive().default(1),
  }),
  z.object({
    id: Id,
    nom: Libelle,
    description: Description,
    type: z.literal('repartir'),
    ...Cibles.shape,
    budget: Formule,
    /** Coût cumulé pour atteindre `valeur`. */
    cout: Formule,
    min: Formule,
    max: Formule,
  }),
  z.object({
    id: Id,
    nom: Libelle,
    description: Description,
    type: z.literal('tirer'),
    ...Cibles.shape,
    formule: Formule,
    /** Nombre de tirages complets autorisés. */
    essais: z.number().int().positive().default(1),
    /**
     * Contrainte sur un tirage complet. Variables : `total`, `min`, `max`,
     * `nombre`, `pairs`, `impairs`, `somme_modificateurs` (modificateur commun
     * du système appliqué à chaque valeur).
     */
    contrainte: Formule.optional(),
    /** Relancer automatiquement tant que la contrainte n'est pas respectée (sans compter d'essai). */
    relancer: z.boolean().default(false),
    /** `ordre` : valeurs attribuées dans l'ordre ; `libre` : le joueur les répartit. */
    attribution: z.enum(['ordre', 'libre']).default('libre'),
  }),
  z.object({
    id: Id,
    nom: Libelle,
    description: Description,
    type: z.literal('saisir'),
    ...Cibles.shape,
  }),
  z.object({
    id: Id,
    nom: Libelle,
    description: Description,
    type: z.literal('acheter'),
    achats: z.array(Id).min(1),
  }),
]);
export type EtapeCreation = z.output<typeof EtapeCreation>;

export const Creation = z.object({ entite: Id, etapes: z.array(EtapeCreation).min(1) });
export type Creation = z.output<typeof Creation>;

// ─── Arbres ──────────────────────────────────────────────────────────────────

export const Arbre = z.object({
  id: Id,
  nom: Libelle,
  description: Description,
  /** Entrée dont la possession ouvre l'arbre (spécialisation…). */
  ouvertPar: Id.optional(),
  noeuds: z
    .array(
      z.object({
        id: Id,
        /** Entrée obtenue (un talent) ; plusieurs nœuds de la même entrée cumulent les rangs. */
        entree: Id,
        x: z.number().int(),
        y: z.number().int(),
        cout: Formule,
        /** Nœud achetable sans lien avec un nœud déjà acquis. */
        depart: z.boolean().default(false),
      }),
    )
    .min(1),
  liens: z
    .array(z.object({ de: Id, vers: Id, sens: z.enum(['double', 'simple']).default('double') }))
    .default([]),
});
export type Arbre = z.output<typeof Arbre>;

// ─── Jets ────────────────────────────────────────────────────────────────────

export const DesSymboles = z.object({
  symboles: z.array(z.object({ id: Cle, nom: Libelle })).min(1),
  sortes: z
    .array(
      z.object({
        id: Id,
        nom: Libelle,
        /** Une entrée par face : nombre de chaque symbole sur la face. */
        faces: z.array(z.record(z.string(), z.number().int().nonnegative())).min(1),
        apparence: z.string().optional(),
      }),
    )
    .min(1),
  /** Valeurs lues d'un jet ; les symboles sont des variables (`max(succes - echec, 0)`). */
  resultats: z.array(
    z.object({ cle: Cle, nom: Libelle, formule: Formule, visible: z.boolean().default(true) }),
  ),
});
export type DesSymboles = z.output<typeof DesSymboles>;

/**
 * `exige` : le paramètre n'est proposé que si la condition est vraie pour
 * l'acteur (option d'un talent possédé : « subir 2 stress pour… ») ; sinon
 * il garde sa valeur par défaut.
 */
const ParametreCommun = {
  id: Cle,
  nom: Libelle,
  exige: Formule.optional(),
  /**
   * `cible` : réaction choisie par la cible (Esquive…) ; `exige` est alors
   * évalué sur la cible. La valeur est fournie avec l'action.
   */
  par: z.enum(['acteur', 'cible']).default('acteur'),
};

const Parametre = z.discriminatedUnion('type', [
  z.object({ ...ParametreCommun, type: z.literal('nombre'), defaut: z.number().default(0) }),
  z.object({
    ...ParametreCommun,
    type: z.literal('booleen'),
    defaut: z.boolean().default(false),
  }),
  /** Une entrée possédée par l'acteur (compétence, arme…) ; ses champs deviennent `id.champ`. */
  z.object({
    ...ParametreCommun,
    type: z.literal('entree'),
    sorte: Cle,
    etiquette: Id.optional(),
    /** Faux : toute entrée de la sorte est acceptée, au rang 0 si l'acteur ne la possède pas. */
    possedee: z.boolean().default(true),
    /** Vrai : le paramètre peut être omis (valeur `""`, rang 0, champs par défaut). */
    facultatif: z.boolean().default(false),
  }),
  /** Un attribut numérique de l'acteur (« quelle caractéristique ? ») : lu par `valeur(p)` et `modificateur(p)`. */
  z.object({
    ...ParametreCommun,
    type: z.literal('attribut'),
    attributs: z.array(Cle).optional(),
    groupe: Id.optional(),
  }),
]);

export const Jet = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('numerique'),
    formule: Formule,
    /** Variable `total`. */
    reussite: Formule.optional(),
    critique: Formule.optional(),
    fumble: Formule.optional(),
  }),
  z.object({
    type: z.literal('symboles'),
    pool: z.array(z.object({ de: Id, nombre: Formule })),
    ameliorations: z.array(z.object({ de: Id, vers: Id, nombre: Formule })).default([]),
    /** Variables : les résultats déclarés dans `des.resultats`. */
    reussite: Formule.optional(),
  }),
]);
export type Jet = z.output<typeof Jet>;

export const ConsequenceAttribut = z.object({
  condition: Formule.optional(),
  /** Entité touchée : l'acteur ou la cible de l'action. */
  entite: z.enum(['acteur', 'cible']),
  attribut: Cle,
  operation: z.enum(['ajouter', 'retirer', 'fixer']),
  valeur: Formule,
  /** Type de dégâts : la valeur passe par les résistances (`sur: degats`) de l'entité touchée. */
  type: Id.optional(),
  /** Type de dégâts calculé (texte, ex. `capacite.typeDegats`) ; vide : dégâts non typés. */
  typeCalcule: Formule.optional(),
  /** Dégâts du type déclaré par l'action (`typeDegats`) : passent par les résistances. */
  degats: z.boolean().default(false),
  /**
   * Dégâts minimaux après résistances quand les dégâts bruts sont positifs
   * (« au moins 1 DM ») ; une immunité donne toujours 0.
   */
  minimum: Formule.optional(),
});

/** Donne ou retire une entrée (état, blessure, affaiblissement…) à l'entité touchée. */
export const ConsequenceEntree = z.object({
  condition: Formule.optional(),
  entite: z.enum(['acteur', 'cible']),
  entree: Id,
  operation: z.enum(['donner', 'retirer']),
  /** Rangs donnés ou retirés (entrée à rangs). */
  rangs: Formule.default('1'),
  /** Durée en rounds, décomptée par l'état de combat ; absente : permanente. */
  duree: Formule.optional(),
});

export const Consequence = z.union([ConsequenceAttribut, ConsequenceEntree]);
export type Consequence = z.output<typeof Consequence>;

export const Action = z.object({
  id: Id,
  nom: Libelle,
  description: Description,
  pour: z.array(Id).min(1),
  /** Condition pour que l'acteur puisse utiliser l'action (`possede("minotaure")`). */
  exige: Formule.optional(),
  /** Type des dégâts infligés par l'action, lu par les conséquences `degats: true`. */
  typeDegats: Id.optional(),
  /** Type des dégâts calculé après le jet (texte, ex. `capacite.typeDegats`). */
  typeDegatsCalcule: Formule.optional(),
  /** Type d'entité visé, si l'action a une cible. */
  cible: z
    .union([Id, z.array(Id).min(1)])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional(),
  parametres: z.array(Parametre).default([]),
  /** Valeurs intermédiaires calculées avant le jet, utilisables ensuite par leur clé. */
  variables: z.array(z.object({ cle: Cle, formule: Formule })).default([]),
  /** Refus de l'action après lecture des paramètres et variables (arme non possédée…). */
  verifications: z.array(z.object({ condition: Formule, message: Libelle })).default([]),
  jet: Jet,
  /** Valeurs calculées après le jet (dégâts…), avec `total`/résultats et `reussi`. */
  apres: z.array(z.object({ cle: Cle, formule: Formule })).default([]),
  consequences: z.array(Consequence).default([]),
  /** Table à tirer si la condition est vraie (blessure critique…). */
  tables: z
    .array(z.object({ table: Id, condition: Formule, modificateur: Formule.optional() }))
    .default([]),
});
export type Action = z.output<typeof Action>;

export const Initiative = z.object({
  action: Id,
  /** Clés de tri, de la plus importante à la moins importante (ordre décroissant). */
  tri: z.array(Formule).min(1),
});

export const Table = z.object({
  id: Id,
  nom: Libelle,
  description: Description,
  jet: Formule,
  lignes: z
    .array(
      z.object({
        min: z.number().int(),
        max: z.number().int(),
        nom: Libelle,
        description: Description,
        /** Entrée donnée à l'entité (un état, une blessure critique…). */
        entree: Id.optional(),
      }),
    )
    .min(1),
});
export type Table = z.output<typeof Table>;

// ─── Système ─────────────────────────────────────────────────────────────────

export const Systeme = z.object({
  format: z.literal(1),
  id: Id,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version au format x.y.z'),
  nom: Libelle,
  description: Description,
  /** Formule de modificateur commune (variable `valeur`), pour les attributs `modificateur: true`. */
  modificateur: Formule.optional(),
  entites: z.array(TypeEntite).min(1),
  sortes: z.array(Sorte).default([]),
  catalogue: z.array(Entree).default([]),
  monnaies: z.array(Monnaie).default([]),
  achats: z.array(Achat).default([]),
  creation: z.array(Creation).default([]),
  arbres: z.array(Arbre).default([]),
  des: DesSymboles.optional(),
  actions: z.array(Action).default([]),
  initiative: Initiative.optional(),
  tables: z.array(Table).default([]),
  /** Types de dégâts (feu, froid, perforant…), lus par les conséquences et les résistances. */
  typesDegats: z.array(z.object({ id: Id, nom: Libelle, description: Description })).default([]),
  textes: z.array(z.object({ id: Id, titre: Libelle, contenu: z.string() })).default([]),
});
export type Systeme = z.output<typeof Systeme>;
export type SystemeSaisi = z.input<typeof Systeme>;
