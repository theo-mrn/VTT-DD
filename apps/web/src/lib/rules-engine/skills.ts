// ─────────────────────────────────────────────────────────────────────────────
// Coût XP d'amélioration d'une compétence — générique, façon système narratif type EotE : une compétence
// "de carrière" (héritée du Profil choisi à la création ou d'une Spécialisation possédée) coûte moins
// cher à améliorer qu'une compétence hors-carrière. Aucun nom de compétence codé en dur ici.
// ─────────────────────────────────────────────────────────────────────────────

/** Coût XP pour amener une compétence au rang `targetRank` (depuis targetRank-1) : 5 × rang visé pour
 *  une compétence de carrière, +5 XP de surcoût sinon (ex 0→1 = 5 XP en carrière, 10 XP hors-carrière). */
export function skillUpgradeCost(targetRank: number, isCareerSkill: boolean): number {
  const base = 5 * targetRank;
  return isCareerSkill ? base : base + 5;
}

/** Coût cumulé pour passer du rang `fromRank` au rang `toRank` (somme des paliers intermédiaires) —
 *  utile si l'UI permet un achat direct de plusieurs rangs d'un coup. */
export function totalSkillUpgradeCost(fromRank: number, toRank: number, isCareerSkill: boolean): number {
  let total = 0;
  for (let rank = fromRank + 1; rank <= toRank; rank++) {
    total += skillUpgradeCost(rank, isCareerSkill);
  }
  return total;
}

/** Vrai si `skillKey` fait partie des compétences de carrière du personnage : soit directement via son
 *  Profil (ProfileDefinition.careerSkillKeys), soit via l'une de ses Spécialisations possédées
 *  (SpecializationDoc.grantedSkillKeys). */
export function isCareerSkillForCharacter(
  skillKey: string,
  careerSkillKeys: string[],
  ownedSpecializations: { grantedSkillKeys: string[] }[],
): boolean {
  if (careerSkillKeys.includes(skillKey)) return true;
  return ownedSpecializations.some((spec) => spec.grantedSkillKeys.includes(skillKey));
}
