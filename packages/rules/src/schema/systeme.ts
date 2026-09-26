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
    /** Modifie un jet : dés ajoutés ou améliorés, bonus au total. */
    sur: z.literal('jet'),
    /** Actions concernées (toutes si absent). */
    actions: z.array(Id).optional(),
    /** Condition sur le jet lui-même, par exemple `competence == "perception"`. */
    si: Formule.optional(),
    ajout: z
      .union([
        z.object({ de: Id, nombre: Formule }),
        z.object({ ameliorer: Id, vers: Id, nombre: Formule }),
        z.object({ bonus: Formule }),
      ])
      .optional(),
  }),
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
  champs: z.array(Champ).default([]),
});
export type Sorte = z.output<typeof Sorte>;

/** Choix fait au moment de prendre une entrée (2 compétences au choix…). */
export const Choix = z.object({
  id: Id,
  nom: Libelle,
  nombre: z.number().int().positive(),
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
    /** Contrainte sur un tirage complet (variables `total`, `min`, `max`). */
    contrainte: Formule.optional(),
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

const Parametre = z.discriminatedUnion('type', [
  z.object({ id: Cle, nom: Libelle, type: z.literal('nombre'), defaut: z.number().default(0) }),
  z.object({
    id: Cle,
    nom: Libelle,
    type: z.literal('booleen'),
    defaut: z.boolean().default(false),
  }),
  /** Une entrée possédée par l'acteur (compétence, arme…) ; ses champs deviennent `id.champ`. */
  z.object({
    id: Cle,
    nom: Libelle,
    type: z.literal('entree'),
    sorte: Cle,
    etiquette: Id.optional(),
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

export const Consequence = z.object({
  condition: Formule.optional(),
  /** Entité touchée : l'acteur ou la cible de l'action. */
  entite: z.enum(['acteur', 'cible']),
  attribut: Cle,
  operation: z.enum(['ajouter', 'retirer', 'fixer']),
  valeur: Formule,
});

export const Action = z.object({
  id: Id,
  nom: Libelle,
  description: Description,
  pour: z.array(Id).min(1),
  /** Type d'entité visé, si l'action a une cible. */
  cible: Id.optional(),
  parametres: z.array(Parametre).default([]),
  /** Valeurs intermédiaires calculées avant le jet, utilisables ensuite par leur clé. */
  variables: z.array(z.object({ cle: Cle, formule: Formule })).default([]),
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
  textes: z.array(z.object({ id: Id, titre: Libelle, contenu: z.string() })).default([]),
});
export type Systeme = z.output<typeof Systeme>;
export type SystemeSaisi = z.input<typeof Systeme>;
