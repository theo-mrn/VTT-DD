// ─────────────────────────────────────────────────────────────────────────────
// Achat de caractéristiques à la CRÉATION (façon EotE) : les caractéristiques ne s'améliorent qu'avec
// l'XP de départ, séquentiellement (3→5 = payer 3→4 puis 4→5), coût = 10 × la valeur visée, plafond 5.
// Pur et générique : ne connaît aucune caractéristique par son nom, juste des valeurs numériques —
// même esprit que skillUpgradeCost (skills.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Valeur maximale d'une caractéristique à la création (EotE : 5). */
export const CREATION_STAT_MAX = 5;

/** Coût XP pour passer une caractéristique À la valeur `targetValue` (depuis targetValue - 1) :
 *  10 × la nouvelle valeur visée. Ex passer de 3 à 4 => 40 XP. */
export function statUpgradeCost(targetValue: number): number {
  return 10 * targetValue;
}

/** Coût XP total pour passer séquentiellement de `fromValue` à `toValue` (chaque palier payé au tarif
 *  de sa valeur visée). Ex 3 → 5 = 40 + 50 = 90 XP. Retourne 0 si toValue <= fromValue. */
export function totalStatUpgradeCost(fromValue: number, toValue: number): number {
  let total = 0;
  for (let value = fromValue + 1; value <= toValue; value++) {
    total += statUpgradeCost(value);
  }
  return total;
}
