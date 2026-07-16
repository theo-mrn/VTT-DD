import type { DicePoolUpgradeRule, GameSystemDefinition } from '@/modules/game-system/types';
import { rollSymbolDie, type SymbolDieRoll } from './symbol-dice';

// ─────────────────────────────────────────────────────────────────────────────
// Pool de dés dérivé de DEUX valeurs numériques quelconques — 100% générique, ne connaît ni
// Caractéristique ni Compétence : composeDicePool ne reçoit que deux nombres. Réutilisable par tout
// futur système à mécanique de composition similaire (max = nombre total de dés, min = combien de ces
// dés sont upgradés vers un dé "supérieur"). rollComposedDicePool relie ça aux SymbolDieDefinition déjà
// existants (aucune notion de dé n'est codée en dur ici) et délègue le tirage à rollSymbolDie.
// ─────────────────────────────────────────────────────────────────────────────

export interface ComposedDicePool {
  /** Nombre de dés du type "upgradé" (le plus petit des deux nombres, plafonné au total). */
  upgradedCount: number;
  /** Nombre de dés du type de base restants après upgrade (total - upgradedCount). */
  baseCount: number;
}

/** max(a,b) = nombre total de dés, min(a,b) = combien sont upgradés. Générique — reçoit deux nombres,
 *  ne sait pas d'où ils viennent. Ex Agilité 3 / Discrétion rang 1 → composeDicePool(3,1) = {upgradedCount:1, baseCount:2}. */
export function composeDicePool(a: number, b: number): ComposedDicePool {
  const total = Math.max(a, b, 0);
  const upgradedCount = Math.max(Math.min(a, b), 0);
  return { upgradedCount, baseCount: total - upgradedCount };
}

/** Construit et lance le pool composé (baseCount faces du dé `rule.baseDiceKey` + upgradedCount faces du
 *  dé `rule.upgradedDiceKey`) — délègue le tirage à rollSymbolDie, aucune logique de résolution de faces
 *  dupliquée ici. Lève une erreur claire si l'une des deux clés ne correspond à aucun SymbolDieDefinition
 *  du système (config MJ incomplète), plutôt que d'échouer silencieusement. */
export function rollComposedDicePool(
  gameSystem: GameSystemDefinition,
  rule: DicePoolUpgradeRule,
  a: number,
  b: number,
): SymbolDieRoll[] {
  const baseDie = gameSystem.symbolDice?.find((d) => d.key === rule.baseDiceKey);
  const upgradedDie = gameSystem.symbolDice?.find((d) => d.key === rule.upgradedDiceKey);
  if (!baseDie) throw new Error(`Dé de base introuvable pour la clé '${rule.baseDiceKey}'.`);
  if (!upgradedDie) throw new Error(`Dé upgradé introuvable pour la clé '${rule.upgradedDiceKey}'.`);

  const { baseCount, upgradedCount } = composeDicePool(a, b);
  const rolls: SymbolDieRoll[] = [];
  for (let i = 0; i < baseCount; i++) rolls.push(rollSymbolDie(baseDie));
  for (let i = 0; i < upgradedCount; i++) rolls.push(rollSymbolDie(upgradedDie));
  return rolls;
}
