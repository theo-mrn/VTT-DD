/**
 * État d'une entité (personnage, PNJ, véhicule…) : uniquement ce que le joueur
 * a saisi, acheté ou tiré. Tout le reste est recalculé par le moteur.
 */
import { z } from 'zod';
import { Cle, Id } from './systeme.js';

export const Possession = z.object({
  entree: Id,
  /** Rangs achetés (hors rangs gratuits donnés par des effets). */
  rang: z.number().int().nonnegative().default(0),
  /** Équipée / active (sortes `activable`). */
  actif: z.boolean().default(true),
  /** Entrées retenues pour chaque choix de l'entrée. */
  choix: z.record(z.string(), z.array(Id)).default({}),
  /** Valeurs propres à cet exemplaire (points d'Obligation, munitions…). */
  champs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
});
export type Possession = z.output<typeof Possession>;

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
  /** Nœuds acquis, par arbre. */
  noeuds: z.record(z.string(), z.array(Id)).default({}),
  journal: z.array(LigneJournal).default([]),
  /** Vrai tant que la création n'est pas terminée. */
  creation: z.boolean().default(false),
});
export type EtatEntite = z.output<typeof EtatEntite>;
export type EtatEntiteSaisi = z.input<typeof EtatEntite>;
