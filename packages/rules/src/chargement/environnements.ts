/**
 * Environnements de typage : ce qu'une formule a le droit de lire selon
 * l'endroit où elle est écrite (attribut, effet, achat, action…).
 */
import type { EnvironnementTypes, InfoAttribut, SignatureFonction } from '../formules/index.js';
import type { TypeValeur } from '../formules/index.js';
import type { Attribut, Champ } from '../schema/index.js';

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
      return 'texte';
    case 'entrees':
      return undefined;
  }
}

/** Fonctions d'agrégat sur les possessions de l'entité, disponibles partout où une entité est lue. */
export const FONCTIONS_ENTITE: Record<string, SignatureFonction> = {
  /** Nombre d'entrées possédées d'une sorte : `compte("specialisation")`. */
  compte: { args: ['texte'], retour: 'nombre' },
  /** Somme d'un champ numérique sur les entrées possédées : `somme("obligation", "valeur")`. */
  somme: { args: ['texte', 'texte'], retour: 'nombre' },
  /** Variantes limitées aux entrées actives (équipées) : `compte_actifs("armure")`. */
  compte_actifs: { args: ['texte'], retour: 'nombre' },
  somme_actifs: { args: ['texte', 'texte'], retour: 'nombre' },
  /** Somme des rangs des entrées possédées d'une sorte : `somme_rangs("blessure_critique")`. */
  somme_rangs: { args: ['texte'], retour: 'nombre' },
  /** Marque posée sur une entrée : `marquee("athletisme", "carriere")`. */
  marquee: { args: ['texte', 'texte'], retour: 'booleen' },
};

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
}

export function env(o: OptionsEnv): EnvironnementTypes {
  const avecEntite = !!o.entite?.length;
  return {
    attribut: (cle, entite) =>
      entite === undefined
        ? attributCommun(o.entite ?? [], cle)
        : o.externes?.[entite]
          ? attributCommun(o.externes[entite]!, cle)
          : undefined,
    variable: (nom) => o.variables?.[nom],
    ...(o.entree ? { entree: o.entree } : {}),
    fonctions: { ...(avecEntite ? FONCTIONS_ENTITE : {}), ...o.fonctions },
    des: o.des ?? false,
    dynamique: o.dynamique ?? false,
  };
}
