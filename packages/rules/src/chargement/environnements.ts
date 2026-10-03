/**
 * Environnements de typage : ce qu'une formule a le droit de lire selon
 * l'endroit où elle est écrite (attribut, effet, achat, action…).
 */
import {
  sousNoeuds,
  type EnvironnementTypes,
  type InfoAttribut,
  type SignatureFonction,
  type Noeud,
  type TypeValeur,
} from '../formules/index.js';
import { ENTITE_COMBAT, VALEURS_COMBAT, type Attribut, type Champ } from '../schema/index.js';

export function typeAttribut(a: Attribut): TypeValeur {
  switch (a.nature) {
    case 'base':
    case 'ressource':
      return 'nombre';
    case 'derivee':
      return a.type;
    case 'texte':
    case 'choix':
      return 'texte';
    case 'booleen':
      return 'booleen';
  }
}

export function infoAttribut(a: Attribut): InfoAttribut {
  const modificateur =
    (a.nature === 'base' || a.nature === 'derivee') &&
    a.modificateur !== undefined &&
    a.modificateur !== false;
  return { type: typeAttribut(a), modificateur };
}

/** Type sous lequel un champ d'entrée est lu dans une formule (`arme.degats`). */
export function typeChamp(c: Champ): TypeValeur | undefined {
  switch (c.type) {
    case 'nombre':
    case 'formule':
      return 'nombre';
    case 'booleen':
      return 'booleen';
    case 'texte':
    case 'attribut':
    case 'entree':
    case 'choix':
      return 'texte';
    case 'entrees':
      return undefined;
  }
}

/**
 * Fonctions d'agrégat sur les possessions de l'entité, disponibles partout où une entité est lue.
 * Chaque exemplaire d'une entrée compte ; une entrée possédée sans possession
 * explicite (rang gratuit, choix) compte comme un exemplaire de quantité 1.
 */
export const FONCTIONS_ENTITE: Record<string, SignatureFonction> = {
  /** Nombre d'exemplaires possédés d'une sorte : `compte("specialisation")`. */
  compte: { args: ['texte'], retour: 'nombre' },
  /**
   * Somme d'un champ numérique sur les exemplaires possédés, chacun multiplié
   * par sa quantité : `somme("obligation", "valeur")`, `somme("objet", "encombrement")`.
   */
  somme: { args: ['texte', 'texte'], retour: 'nombre' },
  /** Variantes limitées aux exemplaires actifs (équipés) : `compte_actifs("armure")`. */
  compte_actifs: { args: ['texte'], retour: 'nombre' },
  somme_actifs: { args: ['texte', 'texte'], retour: 'nombre' },
  /** Somme des quantités des exemplaires possédés d'une sorte : `quantite("munition")`. */
  quantite: { args: ['texte'], retour: 'nombre' },
  /** Somme des rangs des entrées possédées d'une sorte : `somme_rangs("blessure_critique")`. */
  somme_rangs: { args: ['texte'], retour: 'nombre' },
  /** Étiquette d'une entrée du catalogue : `a_etiquette(arme, "hache")`. */
  a_etiquette: { args: ['texte', 'texte'], retour: 'booleen' },
  /** Marque posée sur une entrée : `marquee("athletisme", "carriere")`. */
  marquee: { args: ['texte', 'texte'], retour: 'booleen' },
};

/** Agrégats dont le premier argument littéral est une sorte (vérifiée au chargement). */
export const AGREGATS = [
  'compte',
  'somme',
  'compte_actifs',
  'somme_actifs',
  'somme_rangs',
  'quantite',
];

/** Table d'attributs (un ou plusieurs types d'entité, qui doivent alors s'accorder). */
export type Attributs = Map<string, Attribut>;

/** Attribut commun à tous les types donnés, avec le même type. */
export function attributCommun(tables: Attributs[], cle: string): InfoAttribut | undefined {
  if (!tables.length) return undefined;
  let info: InfoAttribut | undefined;
  for (const t of tables) {
    const a = t.get(cle);
    if (!a) return undefined;
    const i = infoAttribut(a);
    if (info && info.type !== i.type) return undefined;
    info = info ? { type: i.type, modificateur: info.modificateur && i.modificateur } : i;
  }
  return info;
}

export interface OptionsEnv {
  /** Attributs de l'entité courante (`@X`). Vide : aucune lecture d'attribut. */
  entite?: Attributs[];
  /** Entités nommées (`@cible.X`). */
  externes?: Record<string, Attributs[]>;
  variables?: Record<string, TypeValeur>;
  fonctions?: Record<string, SignatureFonction>;
  des?: boolean;
  dynamique?: boolean;
  entree?: (id: string) => boolean;
  /**
   * Règle optionnelle déclarée par le système : `option("id")` n'est permis que dans une
   * formule lue sur une entité (évaluée sur sa fiche, qui connaît les options de la campagne).
   */
  option?: (id: string) => boolean;
  /** Sans les agrégats sur les possessions (`compte`, `somme`…) : attributs seuls. */
  sansAgregats?: boolean;
  /**
   * Options des paramètres `choix` lisibles (par identifiant) : un texte comparé à l'un d'eux
   * (`couvert == "partiel"`) doit être l'une de ses options. Vérifié par le chargeur.
   */
  choix?: ReadonlyMap<string, readonly string[]>;
  /** Contexte du combat lisible (`@combat.round`, `@combat.cible.aAgi`…) : formules d'action. */
  combat?: boolean;
}

/**
 * Textes comparés (`==`, `!=`) à un paramètre `choix` qui ne sont pas l'une de ses options :
 * une faute de frappe (`"partiell"`) serait sinon toujours fausse, sans rien dire.
 */
export function comparaisonsChoixInvalides(
  n: Noeud,
  choix: ReadonlyMap<string, readonly string[]>,
): { message: string; position: number }[] {
  const erreurs: { message: string; position: number }[] = [];
  const visiter = (x: Noeud): void => {
    if (x.t === 'binaire' && (x.op === '==' || x.op === '!=')) {
      erreurs.push(...optionInconnue(x.g, x.d, choix), ...optionInconnue(x.d, x.g, choix));
    }
    sousNoeuds(x).forEach(visiter);
  };
  visiter(n);
  return erreurs;
}

/** `variable == "texte"` dont le texte n'est pas une option du paramètre `choix`. */
function optionInconnue(
  v: Noeud,
  t: Noeud,
  choix: ReadonlyMap<string, readonly string[]>,
): { message: string; position: number }[] {
  if (v.t !== 'variable' || t.t !== 'texte') return [];
  const options = choix.get(v.nom);
  if (!options || options.includes(t.v)) return [];
  return [
    {
      message: `« ${t.v} » n’est pas une option de ${v.nom} (${options.join(', ')})`,
      position: t.pos,
    },
  ];
}

export function env(o: OptionsEnv): EnvironnementTypes {
  const avecEntite = !!o.entite?.length && !o.sansAgregats;
  return {
    attribut: (cle, entite) => attributPour(o, cle, entite),
    variable: (nom) => o.variables?.[nom],
    ...(o.entree ? { entree: o.entree } : {}),
    ...(o.option && avecEntite ? { option: o.option } : {}),
    fonctions: { ...(avecEntite ? FONCTIONS_ENTITE : {}), ...o.fonctions },
    des: o.des ?? false,
    dynamique: o.dynamique ?? false,
  };
}

/** Attribut vu par une formule : de l'entité, du combat (`@combat.*`), ou d'une autre entité. */
function attributPour(o: OptionsEnv, cle: string, entite: string | undefined) {
  if (entite === undefined) return attributCommun(o.entite ?? [], cle);
  if (entite === ENTITE_COMBAT) {
    const type = o.combat ? VALEURS_COMBAT[cle] : undefined;
    return type ? { type, modificateur: false } : undefined;
  }
  const externe = o.externes?.[entite];
  return externe ? attributCommun(externe, cle) : undefined;
}
