/**
 * Étapes de dés d'une attaque (docs/combat.md § 6, § 12.2) : **point d'extension de l'étape
 * C**, pas encore branché.
 *
 * Étape B (aujourd'hui) : toutes les attaques sont déclarées en dés du serveur
 * (`PHYSICAL_DICE_READY` faux) ; si une attaque arrive quand même en `awaiting_dice` (réglage
 * du serveur, reprise), le menu répond `serverFallback` avec `serverRunner` : le serveur tire,
 * rien n'est animé, aucune face n'est imposée à une animation.
 *
 * Étape C : un `DiceStepRunner` 3D lancera les dés de l'étape avec le lanceur de la table
 * (`useDiceThrowStore`, `lib/dice-throw.ts`), lira les faces à l'arrêt et les renverra
 * (`SubmitRollDice`) ; `partitionStep` dit déjà quels dés ont une forme 3D et lesquels restent
 * au serveur (d100, au-delà de `MAX_3D_DICE`).
 */
import type { RollStep, SubmitRollDice } from '@vtt/contracts';
import { MAX_3D_DICE, SHAPES_3D } from '../dice-throw';

/** Les dés 3D des attaques sont branchés (étape C) ; faux : le serveur tire tout. */
export const PHYSICAL_DICE_READY = false;

/** Lance une étape de dés et rend les faces lues (ou le repli du serveur). */
export interface DiceStepRunner {
  run(step: RollStep): Promise<SubmitRollDice>;
}

/** Repli : le serveur tire tous les dés de l'étape (§ 6.3). */
export const serverRunner: DiceStepRunner = {
  run: async (step) => ({ stepId: step.id, results: [], serverFallback: true }),
};

/** Forme 3D d'un dé demandé, ou null s'il n'en a pas (dé à symboles : forme de la présentation). */
export function shapeOf(
  die: RollStep['dice'][number],
  symbolShape?: (die: string) => string | null,
) {
  if (die.die) return symbolShape?.(die.die) ?? null;
  const shape = `d${die.faces}`;
  return (SHAPES_3D as readonly string[]).includes(shape) ? shape : null;
}

/**
 * Dés d'une étape lancés en 3D (forme connue, dans la limite du lanceur) et dés laissés au
 * serveur (absents des résultats envoyés).
 */
export function partitionStep(
  step: RollStep,
  symbolShape?: (die: string) => string | null,
): { thrown: RollStep['dice']; server: RollStep['dice'] } {
  const thrown: RollStep['dice'] = [];
  const server: RollStep['dice'] = [];
  for (const d of step.dice) {
    if (thrown.length < MAX_3D_DICE && shapeOf(d, symbolShape)) thrown.push(d);
    else server.push(d);
  }
  return { thrown, server };
}
