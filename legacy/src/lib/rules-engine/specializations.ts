// ─────────────────────────────────────────────────────────────────────────────
// Coût XP d'achat d'une nouvelle Spécialisation en jeu — générique, façon système narratif type EotE :
// le coût augmente avec le nombre total de spécialisations déjà possédées, et un surcoût s'applique si
// la spécialisation achetée ne fait pas partie de la Carrière d'origine du personnage.
// ─────────────────────────────────────────────────────────────────────────────

/** Coût XP pour acheter une NOUVELLE spécialisation : 10 × (nombre total après achat), +10 XP
 *  supplémentaires si hors carrière d'origine (ex 1ère spécialisation supplémentaire en carrière = 20 XP,
 *  hors carrière = 30 XP). */
export function specializationPurchaseCost(totalSpecializationsAfterPurchase: number, isOutsideOriginCareer: boolean): number {
  return 10 * totalSpecializationsAfterPurchase + (isOutsideOriginCareer ? 10 : 0);
}
