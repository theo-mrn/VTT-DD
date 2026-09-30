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
import type { RollDiceMode, RollStep, SubmitRollDice } from '@vtt/contracts';
import { MAX_3D_DICE, SHAPES_3D } from '../dice-throw';

/** Les dés 3D des attaques sont branchés (étape C) ; faux : le serveur tire tout. */
export const PHYSICAL_DICE_READY = false;

/** Lance une étape de dés et rend les faces lues (ou le repli du serveur). */
export interface DiceStepRunner {
  run(step: RollStep): Promise<SubmitRollDice>;
}

/**
 * Repli : le serveur tire les dés de **cette** étape seulement (§ 6.3) ; l'étape suivante
 * (dégâts après TOUCHÉ) reste à lancer par l'attaquant.
 */
export const serverRunner: DiceStepRunner = {
  run: async (step) => ({ stepId: step.id, results: [] }),
};

/** Face tirée dans le navigateur (aléa cryptographique, sans biais de modulo). */
function rollFace(faces: number): number {
  const n = Math.max(1, Math.floor(faces));
  const max = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= max);
  return (buf[0]! % n) + 1;
}

/**
 * Dés tirés dans le navigateur (décidé par Théo le 2026-09-30) : chaque dé de l'étape reçoit sa
 * face ici, le serveur ne fait que rejouer ces faces et calculer (la fiche de la cible reste
 * chez lui). Aucun aller-retour pour tirer : un seul appel par étape.
 */
export const clientRunner: DiceStepRunner = {
  run: async (step) => ({
    stepId: step.id,
    results: step.dice.map((d) => ({ id: d.id, value: rollFace(d.faces) })),
  }),
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

/**
 * Dés d'une nouvelle attaque (§ 5.2, « Dés ») : 3D seulement si elle est branchée, permise par
 * le combat et voulue par l'attaquant (préférence « animation 3D ») ; sinon le serveur tire.
 */
export function chooseDiceMode(o: {
  physicalAllowed: boolean;
  animation3d: boolean;
}): RollDiceMode {
  return PHYSICAL_DICE_READY && o.physicalAllowed && o.animation3d ? 'physical' : 'server';
}
