/**
 * État d'une entité (personnage, PNJ, véhicule…) : uniquement ce que le joueur
 * a saisi, acheté ou tiré. Tout le reste est recalculé par le moteur.
 */
import { z } from 'zod';
import { Cle, Effet, Id } from './systeme.js';

/**
 * Possession d'une entrée par l'entité. Une entrée d'une sorte sans rangs
 * déclarée `exemplaires` peut être possédée plusieurs fois : chaque
 * possession est alors un exemplaire, distingué par `exemplaire` (unique par
 * entrée ; absent : l'exemplaire historique, unique). Une entrée à rangs n'a
 * qu'une possession, dont les rangs s'additionnent.
 */
export const Possession = z.object({
  entree: Id,
  /** Identifiant de l'exemplaire, unique par entrée ; absent : exemplaire unique historique. */
  exemplaire: Id.optional(),
  /**
   * Nombre d'unités de l'exemplaire (munitions, stimpacks) pour une sorte
   * `quantites` ; absent : 1. `somme` et `somme_actifs` multiplient le champ par la quantité.
   */
  quantite: z.number().int().positive().optional(),
  /** Rangs achetés (hors rangs gratuits donnés par des effets). */
  rang: z.number().int().nonnegative().default(0),
  /** Équipée / active (sortes `activable`). */
  actif: z.boolean().default(true),
  /** Entrées retenues pour chaque choix de l'entrée. */
  choix: z.record(z.string(), z.array(Id)).default({}),
  /**
   * Effets propres à cet exemplaire, en plus de ceux de l'entrée : épée +1,
   * objet enchanté, bonus saisi sur un objet. Actifs quand l'exemplaire l'est.
   */
  effets: z.array(Effet).default([]),
  /** Rounds restants pour un état temporaire (décomptés par l'état de combat). */
  duree: z.number().int().nonnegative().optional(),
  /** Valeurs propres à cet exemplaire (points d'Obligation, munitions…). */
  champs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type Possession = z.output<typeof Possession>;

/** Nouvelle possession avec toutes ses valeurs par défaut. */
export function nouvellePossession(
  entree: string,
  rang = 0,
  extra: Partial<Possession> = {},
): Possession {
  return { entree, rang, actif: true, choix: {}, champs: {}, effets: [], ...extra };
}

/** Quantité d'une possession (1 si elle n'en déclare pas). */
export function quantiteDe(p: Pick<Possession, 'quantite'>): number {
  return p.quantite ?? 1;
}

/** Même entrée et même exemplaire (absent désigne l'exemplaire sans identifiant). */
export function estExemplaire(
  p: Pick<Possession, 'entree' | 'exemplaire'>,
  entree: string,
  exemplaire?: string,
): boolean {
  return p.entree === entree && p.exemplaire === exemplaire;
}

/**
 * Identifiant libre pour un nouvel exemplaire d'une entrée : `2`, `3`… (le
 * premier exemplaire, sans identifiant, compte pour 1).
 */
export function nouvelExemplaire(
  possessions: readonly Pick<Possession, 'entree' | 'exemplaire'>[],
  entree: string,
): string {
  const pris = new Set(possessions.filter((p) => p.entree === entree).map((p) => p.exemplaire));
  let n = 2;
  while (pris.has(String(n))) n++;
  return String(n);
}

/** Identifiant de source des effets propres d'un exemplaire : `entree#exemplaire` ou `entree#<id>`. */
export function sourceExemplaire(p: Pick<Possession, 'entree' | 'exemplaire'>): string {
  return `${p.entree}#${p.exemplaire ?? 'exemplaire'}`;
}

/**
 * Bonus libre posé sur l'entité (potion, bénédiction, décision du MJ) : mêmes
 * effets que le catalogue, sans entrée de catalogue derrière.
 */
export const BonusLibre = z.object({
  id: Id,
  nom: z.string().min(1).max(200),
  /** D'où vient le bonus, pour l'affichage (« Potion de force », « MJ »). */
  source: z.string().max(200).optional(),
  effets: z.array(Effet).min(1),
  actif: z.boolean().default(true),
  /** Rounds restants (décomptés par l'état de combat) ; absent : permanent. */
  duree: z.number().int().nonnegative().optional(),
});
export type BonusLibre = z.output<typeof BonusLibre>;

export const LigneJournal = z.object({
  achat: Id,
  /** Attribut, entrée ou `arbre/noeud` obtenu. */
  objet: z.string(),
  cout: z.number(),
  monnaie: Cle,
  creation: z.boolean(),
  date: z.string().optional(),
});
export type LigneJournal = z.output<typeof LigneJournal>;

export const EtatEntite = z.object({
  type: Id,
  systeme: z.object({ id: Id, version: z.string() }),
  valeurs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  possessions: z.array(Possession).default([]),
  /** Bonus libres posés sur l'entité. */
  bonus: z.array(BonusLibre).default([]),
  /** Nœuds acquis, par arbre. */
  noeuds: z.record(z.string(), z.array(Id)).default({}),
  journal: z.array(LigneJournal).default([]),
  /** Vrai tant que la création n'est pas terminée. */
  creation: z.boolean().default(false),
});
export type EtatEntite = z.output<typeof EtatEntite>;
export type EtatEntiteSaisi = z.input<typeof EtatEntite>;
