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
export const Formule = z.union([z.string().min(1), z.number(), z.boolean()]).transform(String);
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
  /**
   * Règle optionnelle (`options` du système) dont dépend l'attribut : option éteinte pour la
   * campagne, il est absent de la fiche (ni calcul, ni tuile, ni lanceur) ; sa valeur saisie
   * reste dans l'état.
   */
  option: Cle.optional(),
};

/**
 * `true` : formule de modificateur commune du système ; texte : formule propre
 * (la variable `valeur` désigne la valeur de l'attribut).
 */
const Modificateur = z.union([z.boolean(), Formule]).optional();

/**
 * L'attribut sert aux jets libres du lanceur de dés : il y est proposé et ajoute son
 * apport à la formule. Sans `jet`, l'attribut n'est jamais proposé.
 *   - `modificateur` : son modificateur (`mod(@CLE)`), l'attribut doit en avoir un ;
 *   - `valeur` : sa valeur (`@CLE`), l'attribut doit être numérique ;
 *   - une formule sans dé qui ne lit que les attributs de l'entité (`mod(@DEX) + @niveau`),
 *     ajoutée entre parenthèses : le service de dés l'évalue avec les seules valeurs et
 *     modificateurs de la fiche (ni `rang`, ni `possede`, ni agrégats).
 */
export const JetAttribut = z.object({
  apport: z.union([z.enum(['modificateur', 'valeur']), Formule]),
});
export type JetAttribut = z.output<typeof JetAttribut>;

export const Attribut = z.discriminatedUnion('nature', [
  z.object({
    ...AttributCommun,
    /** Valeur saisie, achetée ou tirée. */
    nature: z.literal('base'),
    defaut: z.number().default(0),
    min: Formule.optional(),
    max: Formule.optional(),
    modificateur: Modificateur,
    jet: JetAttribut.optional(),
    /**
     * Qui saisit librement la valeur une fois la création terminée :
     * `creation` personne (elle s'achète ensuite), `jeu` le propriétaire ou le
     * MJ (crédits, bourse), `mj` le MJ seul (XP gagnée, niveau). Pendant la
     * création, le propriétaire la saisit toujours.
     */
    saisie: z.enum(['creation', 'jeu', 'mj']).default('creation'),
  }),
  z.object({
    ...AttributCommun,
    /** Recalculée en continu à partir des autres attributs. */
    nature: z.literal('derivee'),
    type: z.enum(['nombre', 'booleen', 'texte']).default('nombre'),
    formule: Formule,
    modificateur: Modificateur,
    jet: JetAttribut.optional(),
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
    jet: JetAttribut.optional(),
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

/**
 * Effet sur un jet (voir `Effet`) : dés ajoutés, améliorés, rétrogradés ou retirés, bonus au total,
 * valeur ajoutée à une variable de l'action. Seule sorte d'effet permise à la situation.
 */
export const EffetJet = z.object({
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
  /**
   * Le jet doit impliquer cette entrée ou cet attribut : un paramètre de
   * l'action la désigne (compétence choisie, caractéristique testée) ou un
   * champ du paramètre y renvoie (compétence d'une arme, caractéristique
   * liée d'une compétence). « +2 aux tests de Discrétion » quel que soit le système.
   */
  implique: z.object({ entree: Id.optional(), attribut: Cle.optional() }).optional(),
  /** Condition libre sur le jet, par exemple `competence == "perception"`. */
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
});
export type EffetJet = z.output<typeof EffetJet>;

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
  EffetJet,
  EffetDegats,
]);
export type Effet = z.output<typeof Effet>;

// ─── Types d'entité ──────────────────────────────────────────────────────────

export const TypeEntite = z.object({
  id: Id,
  nom: Libelle,
  description: Description,
  groupes: z.array(z.object({ id: Id, nom: Libelle })).default([]),
  attributs: z.array(Attribut),
  /**
   * Effets de règle, portés par toute entité de ce type sans source possédée (surcharge,
   * malus généraux) : toujours présents, ils ne s'appliquent que si leur condition est vraie
   * (`option("encombrement") et @surcharge`).
   */
  effets: z.array(Effet).default([]),
  /**
   * Hors de combat : formule booléenne sur l'entité (`@PV <= 0`, `@neutralise`), évaluée après
   * chaque application d'une attaque. Absente : aucune détection, le MJ décide lui-même.
   */
  horsCombat: Formule.optional(),
});
export type TypeEntite = z.output<typeof TypeEntite>;

// ─── Catalogues ──────────────────────────────────────────────────────────────

const ChampCommun = {
  id: Cle,
  nom: Libelle,
  /**
   * Règle optionnelle dont dépend le champ : option éteinte pour la campagne, il est caché
   * dans l'inventaire et à l'ajout ; les valeurs saisies restent dans l'état.
   */
  option: Cle.optional(),
};

export const Champ = z.discriminatedUnion('type', [
  z.object({ ...ChampCommun, type: z.literal('nombre'), defaut: z.number().optional() }),
  z.object({ ...ChampCommun, type: z.literal('texte'), defaut: z.string().optional() }),
  z.object({ ...ChampCommun, type: z.literal('booleen'), defaut: z.boolean().optional() }),
  /**
   * Formule évaluée dans le contexte du porteur (dégâts `@vigueur + 2`…) ; elle lit aussi
   * les autres champs de l'objet (`source.<champ>`). `des` : formule de jet, qui peut lancer
   * des dés (`des(source.nbDes, source.faces)`), tirés pendant l'action qui la lit.
   * Un exemplaire peut la remplacer par la sienne (champ propre, voir `formuleChamp`).
   */
  z.object({
    ...ChampCommun,
    type: z.literal('formule'),
    defaut: Formule.optional(),
    des: z.boolean().optional(),
  }),
  /** Clé d'un attribut d'un type d'entité (caractéristique liée d'une compétence). */
  z.object({ ...ChampCommun, type: z.literal('attribut'), entite: Id }),
  /** Référence vers une autre entrée (compétence utilisée par une arme). */
  z.object({ ...ChampCommun, type: z.literal('entree'), sorte: Id }),
  z.object({ ...ChampCommun, type: z.literal('entrees'), sorte: Id }),
  /**
   * Valeur prise dans une liste déclarée par le système (catégorie d'objet : potions,
   * nourriture…). Lue comme un texte (la `valeur` de l'option) dans les formules.
   */
  z.object({
    ...ChampCommun,
    type: z.literal('choix'),
    options: z.array(z.object({ valeur: Cle, nom: Libelle })).min(1),
    defaut: Cle.optional(),
  }),
]);
export type Champ = z.output<typeof Champ>;

/**
 * Moment où une durée perd un décompte : à chaque fin de round, au début ou à la fin du tour
 * d'un personnage (le porteur, ou la source de l'effet).
 */
export const MomentDecompte = z.enum(['fin-round', 'debut-tour', 'fin-tour']);
export type MomentDecompte = z.output<typeof MomentDecompte>;

export const Sorte = z.object({
  id: Cle,
  nom: Libelle,
  nomPluriel: Libelle.optional(),
  description: Description,
  /** Types d'entité pouvant posséder ces entrées. */
  pour: z.array(Id).min(1),
  /** Rang maximal (formule), si les entrées se possèdent par rangs. */
  rangs: z.object({ max: Formule }).optional(),
  /**
   * Un personnage peut porter des entrées de cette sorte hors du catalogue (voie maison,
   * capacité inventée : `etat.entrees`, docs/entrees-libres.md).
   */
  personnalisable: z.boolean().default(false),
  /** Nombre maximal d'entrées de cette sorte par entité (1 pour une espèce). */
  maximum: z.number().int().positive().optional(),
  /** Les entrées de cette sorte peuvent être équipées / activées (variable `actif`). */
  activable: z.boolean().default(false),
  /** État d'une entrée activable obtenue sans possession explicite (capacité à activer : Rage…). */
  actifParDefaut: z.boolean().default(true),
  /**
   * Durée d'une activation (sorte `activable`) : le champ `formule` de la sorte qui la donne,
   * lu sur le porteur au moment où il active l'entrée (dés compris : « 1d6 + mod(@INT) »), et
   * le moment de son décompte. À 0, l'entrée s'éteint (`actif: false`) au lieu d'être retirée.
   * Entrée sans valeur pour ce champ, ou résultat inférieur à 1 : pas de durée, elle reste
   * active jusqu'à ce qu'on la coupe.
   */
  dureeActivation: z.object({ champ: Cle, moment: MomentDecompte.default('fin-round') }).optional(),
  /**
   * Une même entrée peut être possédée plusieurs fois (deux dagues, deux
   * Obligations du même type) : chaque possession est un exemplaire, avec son
   * état actif, ses champs, ses effets et sa durée. Interdit avec `rangs`.
   */
  exemplaires: z.boolean().default(false),
  /**
   * Une possession porte une quantité (munitions, stimpacks) : `somme` la
   * multiplie par le champ, `quantite("sorte")` l'additionne. Interdit avec `rangs`.
   */
  quantites: z.boolean().default(false),
  /**
   * Champ `texte` qui donne son nom propre à un exemplaire (objet personnalisé, arme
   * renommée) : affiché à la place du nom de l'entrée quand l'exemplaire le renseigne.
   */
  nomExemplaire: Cle.optional(),
  /** Champ `texte` qui décrit un exemplaire, affiché à la place de la description de l'entrée. */
  descriptionExemplaire: Cle.optional(),
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

// ─── Durées (docs/combat.md § 18) ────────────────────────────────────────────

/** Personnage dont le tour compte : le porteur de l'effet, ou sa source (qui l'a donné). */
export const AncreDuree = z.enum(['porteur', 'source']);
export type AncreDuree = z.output<typeof AncreDuree>;

/** Comment une durée donnée se décompte (`fin-round` : `de` n'a pas de sens). */
export const DecompteDonne = z.object({
  moment: MomentDecompte.default('fin-round'),
  de: AncreDuree.default('porteur'),
});
export type DecompteDonne = z.output<typeof DecompteDonne>;

/**
 * Durée par défaut d'une entrée (état, sort actif) : proposée quand on la pose à la main,
 * reprise par une conséquence `donner` qui ne dit pas de durée.
 */
export const DureeEntree = DecompteDonne.extend({
  /** Nombre de décomptes (rounds, ou tours de l'ancre). */
  valeur: z.number().int().min(1).max(10_000),
});
export type DureeEntree = z.output<typeof DureeEntree>;

/** Période après laquelle les usages d'une entrée reviennent. */
export const PeriodeUsages = z.enum(['tour', 'combat', 'jour']);
export type PeriodeUsages = z.output<typeof PeriodeUsages>;

export const Entree = z.object({
  id: Id,
  sorte: Cle,
  nom: Libelle,
  description: Description,
  etiquettes: z.array(Id).default([]),
  /** Durée par défaut quand l'entrée est donnée pour un temps (état, sort actif). */
  duree: DureeEntree.optional(),
  /**
   * Entrée générique des objets hors catalogue (« Objet personnalisé ») : chaque exemplaire
   * porte son nom, sa description et ses valeurs dans ses champs propres (`nomExemplaire`
   * de la sorte). Sa sorte admet des exemplaires et déclare `nomExemplaire`.
   */
  libre: z.boolean().default(false),
  /** Valeurs des champs déclarés par la sorte. */
  champs: z
    .record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.array(Id)]))
    .default({}),
  effets: z.array(Effet).default([]),
  choix: z.array(Choix).default([]),
  choixAttributs: z.array(ChoixAttribut).default([]),
  /** Condition pour pouvoir prendre l'entrée. */
  exige: Formule.optional(),
  /**
   * Usages limités (« une fois par combat ») : nombre d'utilisations (formule sur le porteur,
   * 1 par défaut) par période. `tour` : un tour de combat, rendu à chaque fin de round ;
   * `combat` : rendu à la fin du combat ; `jour` : rendu au repos (qui rend aussi les autres).
   */
  usages: z.object({ max: Formule.default('1'), par: PeriodeUsages }).optional(),
  /**
   * Effets donnés aux cibles quand l'entrée est jouée (capacité : « +3 FOR à tout le groupe »,
   * docs/combat.md § 19.2). Au chargement, une entrée de la sorte `effetsDonnes.sorte` les porte,
   * nommée comme celle-ci ; son identifiant est écrit dans le champ `effetsDonnes.champ`, que
   * l'action lit pour la donner (`entreeCalculee`), avec sa durée.
   */
  donne: z.array(Effet).min(1).optional(),
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
 * Rangement d'un paramètre dans le formulaire d'une action : `preparation` (arme, options des
 * talents, ce que l'acteur prépare) ou `situation` (couvert, surprise, avantage de situation :
 * ce que la table constate). Sans effet sur le calcul.
 */
export const SectionParametre = z.enum(['preparation', 'situation']);
export type SectionParametre = z.output<typeof SectionParametre>;

/** Option d'un paramètre `choix` : sa `valeur` est lue comme un texte dans les formules. */
export const OptionChoix = z.object({
  valeur: Cle,
  nom: Libelle,
  description: z.string().max(500).optional(),
  /**
   * Paramètres propres à cette option, proposés avec elle quand elle est choisie (les dés d'un
   * jet « Libre » : nombre, faces, modificateur). Sans effet sur le calcul.
   */
  parametres: z.array(Cle).optional(),
});
export type OptionChoix = z.output<typeof OptionChoix>;

/**
 * `exige` : le paramètre n'est proposé que si la condition est vraie pour
 * l'acteur (option d'un talent possédé : « subir 2 stress pour… ») ; sinon
 * il garde sa valeur par défaut.
 */
const ParametreCommun = {
  id: Cle,
  nom: Libelle,
  /** Aide courte, montrée au survol du paramètre. */
  description: z.string().max(500).optional(),
  exige: Formule.optional(),
  /**
   * `cible` : réaction choisie par la cible (Esquive…) ; `exige` est alors
   * évalué sur la cible. La valeur est fournie avec l'action.
   */
  par: z.enum(['acteur', 'cible']).default('acteur'),
  section: SectionParametre.default('preparation'),
  /**
   * `apres` : choisi après le jet, seulement s'il réussit (l'arme, une fois la cible touchée) ;
   * fourni avec l'étape des dégâts, jamais demandé à la déclaration. Aucune formule du jet ne
   * le lit (vérifié au chargement) ; les effets de jet le lisent à sa valeur neutre, les
   * variables qui ne servent pas au jet sont calculées après lui (docs/regles.md).
   */
  etape: z.enum(['declaration', 'apres']).default('declaration'),
};

export const Parametre = z.discriminatedUnion('type', [
  z.object({ ...ParametreCommun, type: z.literal('nombre'), defaut: z.number().default(0) }),
  z.object({
    ...ParametreCommun,
    type: z.literal('booleen'),
    defaut: z.boolean().default(false),
  }),
  /**
   * Une option parmi une liste nommée (couvert : aucun, partiel, important). Lue comme un
   * texte, la `valeur` de l'option : `couvert == "partiel"` ; le chargement vérifie que le
   * texte comparé est bien une option. `defaut` absent : la première option.
   */
  z.object({
    ...ParametreCommun,
    type: z.literal('choix'),
    options: z.array(OptionChoix).min(1),
    defaut: Cle.optional(),
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
export type Parametre = z.output<typeof Parametre>;

/** Valeur par défaut d'un paramètre `choix` : son `defaut`, sinon sa première option. */
export function defautChoix(p: Extract<Parametre, { type: 'choix' }>): string {
  return p.defaut ?? p.options[0]!.valeur;
}

export const Jet = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('numerique'),
    formule: Formule,
    /** Variable `total`. */
    reussite: Formule.optional(),
    critique: Formule.optional(),
    fumble: Formule.optional(),
    /**
     * Critique confirmé après le jet, sur une réussite, quand les paramètres `etape: apres` sont
     * connus (seuil de critique de l'arme choisie après le jet) : vrai, le jet devient critique.
     */
    confirmerCritique: Formule.optional(),
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
  /** Entrée fixe, ou `entreeCalculee` : formule texte (ex. `capacite.etat`) ; vide : rien. */
  entree: Id.optional(),
  entreeCalculee: Formule.optional(),
  operation: z.enum(['donner', 'retirer']),
  /** Rangs donnés ou retirés (entrée à rangs). */
  rangs: Formule.default('1'),
  /**
   * Nombre de décomptes (rounds par défaut), décomptés par l'état de combat ; absente : la
   * durée par défaut de l'entrée (`duree`), sinon permanente.
   */
  duree: Formule.optional(),
  /** Moment et ancre du décompte ; absent : ceux de l'entrée, sinon fin de round. */
  decompte: DecompteDonne.optional(),
});

export const Consequence = z.union([ConsequenceAttribut, ConsequenceEntree]);
export type Consequence = z.output<typeof Consequence>;

/**
 * Valeur calculée d'une action (`variables`, `apres`). `visibilite: acteur` : montrée à qui agit
 * (dégâts lancés), dans sa vue du résultat et le jet de l'historique ; `mj` (défaut) : réservée
 * au MJ, comme tout ce qui peut dépendre de la cible.
 */
export const ValeurAction = z.object({
  cle: Cle,
  formule: Formule,
  /** Libellé montré avec la valeur (« Dégâts »). */
  nom: Libelle.optional(),
  visibilite: z.enum(['acteur', 'mj']).default('mj'),
});
export type ValeurAction = z.output<typeof ValeurAction>;

/**
 * Plusieurs cibles : `commun`, un seul jet partagé (zone : les dés de chaque phase sont lancés
 * une fois pour toutes, un dé propre à une cible l'est pour elle seule) ; `par-cible`, un jet
 * par cible. C'est le mode proposé par défaut ; `max` borne le nombre de cibles.
 */
export const Multicible = z.object({
  jet: z.enum(['commun', 'par-cible']).default('par-cible'),
  max: z.number().int().min(1).max(50).optional(),
});
export type Multicible = z.output<typeof Multicible>;

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
  variables: z.array(ValeurAction).default([]),
  /** Refus de l'action après lecture des paramètres et variables (arme non possédée…). */
  verifications: z.array(z.object({ condition: Formule, message: Libelle })).default([]),
  jet: Jet,
  /** Valeurs calculées après le jet (dégâts…), avec `total`/résultats et `reussi`. */
  apres: z.array(ValeurAction).default([]),
  consequences: z.array(Consequence).default([]),
  /** Table à tirer si la condition est vraie (blessure critique…). */
  tables: z
    .array(z.object({ table: Id, condition: Formule, modificateur: Formule.optional() }))
    .default([]),
  /** Action à cible jouable contre plusieurs cibles : mode de jet proposé, plafond. */
  multicible: Multicible.optional(),
  /**
   * Situation du système (`Systeme.situation`), reçue par toute action à cible : `false` n'en
   * reçoit rien (soins), `{ sauf }` écarte certains de ses paramètres (lus alors à leur valeur
   * neutre par ses effets). Sans effet sur une action sans cible.
   */
  situation: z.union([z.boolean(), z.object({ sauf: z.array(Cle).min(1) })]).default(true),
});
export type Action = z.output<typeof Action>;

/** L'action reçoit la situation du système : une action à cible qui ne l'écarte pas. */
export function recoitSituation(a: Pick<Action, 'cible' | 'situation'>): boolean {
  return !!a.cible?.length && a.situation !== false;
}

/**
 * Situation d'une action à cible, déclarée une fois pour tout le système (couvert, avantage de
 * situation, cible surprise…). Au chargement, ses paramètres rejoignent ceux de chaque action à
 * cible (rangés `section: situation`) : le front et les services les voient comme des paramètres
 * ordinaires. Ses effets de jet s'appliquent à ces actions et lisent ces paramètres, la cible
 * (`@cible.X`) et le combat (`@combat.*`).
 */
export const Situation = z.object({
  parametres: z.array(Parametre).default([]),
  effets: z.array(EffetJet).default([]),
});
export type Situation = z.output<typeof Situation>;

export const Initiative = z.object({
  action: Id,
  /** Clés de tri, de la plus importante à la moins importante (ordre décroissant). */
  tri: z.array(Formule).min(1),
  /**
   * `individuel` : chacun agit à son tour, dans l'ordre ; `creneaux` : l'ordre donne une suite
   * de créneaux par camp, un participant du camp agit pendant chacun (Star Wars).
   */
  mode: z.enum(['individuel', 'creneaux']).default('individuel'),
});
export type Initiative = z.output<typeof Initiative>;

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

// ─── Règles optionnelles ─────────────────────────────────────────────────────

/**
 * Règle optionnelle que le MJ allume ou éteint pour sa campagne (encombrement…). Les
 * attributs, champs et blocs qui en dépendent la citent (`option: id`), les formules la
 * lisent avec `option("id")`. Éteindre ne détruit rien : les données restent, sans effet.
 */
export const OptionRegle = z.object({
  id: Cle,
  nom: Libelle,
  description: Description,
  /** Valeur quand la campagne ne l'a pas réglée. */
  defaut: z.boolean().default(false),
});
export type OptionRegle = z.output<typeof OptionRegle>;

// ─── Rencontres ──────────────────────────────────────────────────────────────

/**
 * Règles du générateur de rencontres (panneau Rencontres du MJ) : combien « coûte » une
 * créature du bestiaire selon sa puissance, quel budget offre un groupe de personnages selon
 * la difficulté voulue, et les formes de rencontre proposées. Tout est une donnée : un système
 * sans ce bloc n'a pas de générateur.
 */
export const Rencontres = z.object({
  /** Attribut du personnage qui donne son niveau (le budget se calcule par personnage). */
  niveau: Cle,
  /** Valeur d'une créature du bestiaire qui dit sa puissance (niveau de défi…). */
  puissance: Cle,
  /** Nom de la puissance à l'écran (« Niveau », « FP »). */
  nomPuissance: Libelle.default('Puissance'),
  /** Unité du budget (« XP »). */
  unite: Libelle.default('XP'),
  /** Coût d'une créature : palier le plus haut dont la puissance ne dépasse pas la sienne. */
  cout: z.array(z.object({ puissance: z.number(), valeur: z.number().nonnegative() })).min(1),
  /** Difficultés, de la plus facile à la plus dure : budget d'un personnage par niveau (1, 2…). */
  difficultes: z
    .array(
      z.object({
        id: Cle,
        nom: Libelle,
        parNiveau: z.array(z.number().nonnegative()).min(1),
      }),
    )
    .min(1),
  /** Le nombre de créatures pèse sur le coût : facteur à partir de `nombre` créatures. */
  multiplicateurs: z
    .array(z.object({ nombre: z.number().int().min(1), facteur: z.number().positive() }))
    .default([{ nombre: 1, facteur: 1 }]),
  /** Formes de rencontre proposées (groupe restreint, horde, boss…). */
  scenarios: z
    .array(
      z.object({
        id: Cle,
        nom: Libelle,
        description: Description,
        /** Nombre de créatures. */
        min: z.number().int().min(1),
        max: z.number().int().min(1),
        /** Puissance d'une créature au plus : rapport au niveau moyen du groupe. */
        puissanceMax: z.number().positive(),
        /** Un chef plus puissant (jusqu'à `puissanceMax` fois le niveau), le reste en sbires. */
        chef: z.boolean().default(false),
        /** Puissance d'un sbire au plus (rapport au niveau moyen), avec un chef. */
        puissanceSbires: z.number().positive().optional(),
      }),
    )
    .min(1),
  /** Valeurs des créatures filtrables par intervalle (PV, Défense…). */
  filtres: z.array(Cle).default([]),
  /**
   * Probabilité de chaque catégorie de créatures (« Humanoïde » plus souvent que « Céleste ») :
   * une rencontre tire d'abord sa catégorie selon ces poids, puis ses créatures, qui en sont
   * pour la plupart. Une catégorie absente pèse 1.
   */
  categories: z.array(z.object({ nom: Libelle, poids: z.number().nonnegative() })).default([]),
});
export type Rencontres = z.output<typeof Rencontres>;

// ─── Système ─────────────────────────────────────────────────────────────────

export const Systeme = z.object({
  format: z.literal(1),
  id: Id,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version au format x.y.z'),
  nom: Libelle,
  description: Description,
  /** Formule de modificateur commune (variable `valeur`), pour les attributs `modificateur: true`. */
  modificateur: Formule.optional(),
  /** Règles optionnelles, choisies par campagne. */
  options: z.array(OptionRegle).default([]),
  entites: z.array(TypeEntite).min(1),
  sortes: z.array(Sorte).default([]),
  catalogue: z.array(Entree).default([]),
  /**
   * Effets donnés par les entrées (`Entree.donne`) : la sorte des entrées qui les portent (un
   * état, donné pour un temps), le champ texte où chaque entrée reçoit l'identifiant de la
   * sienne, et le champ de leur durée.
   */
  effetsDonnes: z
    .object({
      sorte: Cle,
      champ: Cle,
      /** Champ formule de l'entrée qui donne leur durée (tours, dés compris) ; absent : aucune. */
      duree: Cle.optional(),
    })
    .optional(),
  monnaies: z.array(Monnaie).default([]),
  achats: z.array(Achat).default([]),
  creation: z.array(Creation).default([]),
  arbres: z.array(Arbre).default([]),
  des: DesSymboles.optional(),
  actions: z.array(Action).default([]),
  /** Situation commune des actions à cible (voir `Situation`). */
  situation: Situation.optional(),
  initiative: Initiative.optional(),
  tables: z.array(Table).default([]),
  /** Types de dégâts (feu, froid, perforant…), lus par les conséquences et les résistances. */
  typesDegats: z.array(z.object({ id: Id, nom: Libelle, description: Description })).default([]),
  /** Générateur de rencontres (voir `Rencontres`). */
  rencontres: Rencontres.optional(),
  textes: z.array(z.object({ id: Id, titre: Libelle, contenu: z.string() })).default([]),
});
export type Systeme = z.output<typeof Systeme>;
export type SystemeSaisi = z.input<typeof Systeme>;
