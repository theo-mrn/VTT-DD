/**
 * Contexte du combat lu par les formules sous `@combat.*` (docs/regles.md, « Contexte du
 * combat ») : round, et pour l'acteur comme pour la cible, ce que le combat a compté. Il entre
 * par la demande d'exécution, figé par le service qui mène le combat au moment où l'action est
 * déclarée (sans elle) ; le moteur ne l'invente jamais. Absent : hors combat, valeurs neutres.
 */
import { z } from 'zod';
import type { TypeValeur, Valeur } from '../formules/index.js';

const Compte = z.number().int().min(0).default(0);

/** Ce que le combat a compté pour un participant, sans l'action en cours. */
export const ContexteCombattant = z.object({
  /** Attaques faites depuis le début du combat. */
  attaques: Compte,
  /** Attaques faites ce round. */
  attaquesRound: Compte,
  /** Fois où il a été visé depuis le début du combat. */
  vise: Compte,
  /** Fois où il a été visé ce round. */
  viseRound: Compte,
  /** Son tour est déjà passé ce round. */
  aAgi: z.boolean().default(false),
  /** Surpris (décidé par le MJ). */
  surpris: z.boolean().default(false),
});
export type ContexteCombattant = z.output<typeof ContexteCombattant>;
export type ContexteCombattantSaisi = z.input<typeof ContexteCombattant>;

export const ContexteCombat = z.object({
  /** Round courant, 1 au premier ; 0 : hors combat. */
  round: z.number().int().min(0),
  /** Absent : l'acteur ne participe pas au combat (valeurs neutres). */
  acteur: ContexteCombattant.optional(),
  /** Absent : la cible ne participe pas au combat, ou l'action n'en a pas. */
  cible: ContexteCombattant.optional(),
});
export type ContexteCombat = z.output<typeof ContexteCombat>;
export type ContexteCombatSaisi = z.input<typeof ContexteCombat>;

/** Entité réservée des formules : `@combat.round`, `@combat.cible.aAgi`. */
export const ENTITE_COMBAT = 'combat';

const COMBATTANT: Record<keyof ContexteCombattant, TypeValeur> = {
  attaques: 'nombre',
  attaquesRound: 'nombre',
  vise: 'nombre',
  viseRound: 'nombre',
  aAgi: 'booleen',
  surpris: 'booleen',
};

/**
 * Valeurs lisibles sous `@combat.` et leur type. `enCours` : un combat est en cours (round 1
 * ou plus) ; `premierRound` : round 1 ; `acteur.x`, `cible.x` : `ContexteCombattant`.
 */
export const VALEURS_COMBAT: Readonly<Record<string, TypeValeur>> = {
  enCours: 'booleen',
  round: 'nombre',
  premierRound: 'booleen',
  ...Object.fromEntries(
    (['acteur', 'cible'] as const).flatMap((qui) =>
      Object.entries(COMBATTANT).map(([cle, type]) => [`${qui}.${cle}`, type]),
    ),
  ),
};

const NEUTRE: ContexteCombattant = ContexteCombattant.parse({});

/**
 * Valeur de `@combat.<cle>` pour un contexte (absent : hors combat) ; `undefined` pour une clé
 * inconnue (le chargement les refuse). Un participant absent du contexte a des valeurs neutres.
 */
export function valeurCombat(c: ContexteCombat | undefined, cle: string): Valeur | undefined {
  const round = c?.round ?? 0;
  if (cle === 'round') return round;
  if (cle === 'enCours') return round >= 1;
  if (cle === 'premierRound') return round === 1;
  const [qui, champ] = cle.split('.', 2) as [string, keyof ContexteCombattant | undefined];
  if ((qui !== 'acteur' && qui !== 'cible') || !champ || !(champ in COMBATTANT)) return undefined;
  return (round >= 1 ? c?.[qui] : undefined)?.[champ] ?? NEUTRE[champ];
}
