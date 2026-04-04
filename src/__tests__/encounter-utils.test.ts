import { getEncounterMultiplier, calculateEncounterBudget } from "@/lib/encounter-utils";

describe("getEncounterMultiplier", () => {
  it("retourne 1 pour 0 ou 1 monstre", () => {
    expect(getEncounterMultiplier(0)).toBe(1);
    expect(getEncounterMultiplier(1)).toBe(1);
  });

  it("retourne 1.5 pour 2 monstres", () => {
    expect(getEncounterMultiplier(2)).toBe(1.5);
  });

  it("retourne 2 pour 3 à 6 monstres", () => {
    expect(getEncounterMultiplier(3)).toBe(2);
    expect(getEncounterMultiplier(6)).toBe(2);
  });

  it("retourne 2.5 pour 7 à 10 monstres", () => {
    expect(getEncounterMultiplier(7)).toBe(2.5);
    expect(getEncounterMultiplier(10)).toBe(2.5);
  });

  it("retourne 3 pour 11 à 14 monstres", () => {
    expect(getEncounterMultiplier(11)).toBe(3);
    expect(getEncounterMultiplier(14)).toBe(3);
  });

  it("retourne 4 pour 15 monstres et plus", () => {
    expect(getEncounterMultiplier(15)).toBe(4);
    expect(getEncounterMultiplier(100)).toBe(4);
  });
});

describe("calculateEncounterBudget", () => {
  it("calcule le budget pour un groupe de 4 joueurs niveau 1 (facile)", () => {
    // XP_THRESHOLDS[1].Easy = 25, x4 joueurs = 100
    expect(calculateEncounterBudget(4, 1, "Easy")).toBe(100);
  });

  it("calcule le budget pour un groupe de 4 joueurs niveau 5 (mortel)", () => {
    // XP_THRESHOLDS[5].Deadly = 1100, x4 = 4400
    expect(calculateEncounterBudget(4, 5, "Deadly")).toBe(4400);
  });

  it("calcule le budget pour un groupe de 6 joueurs niveau 10 (medium)", () => {
    // XP_THRESHOLDS[10].Medium = 1200, x6 = 7200
    expect(calculateEncounterBudget(6, 10, "Medium")).toBe(7200);
  });

  it("clamp le niveau à 1 si inférieur à 1", () => {
    expect(calculateEncounterBudget(4, 0, "Easy")).toBe(calculateEncounterBudget(4, 1, "Easy"));
  });

  it("clamp le niveau à 20 si supérieur à 20", () => {
    expect(calculateEncounterBudget(4, 21, "Deadly")).toBe(calculateEncounterBudget(4, 20, "Deadly"));
  });

  it("scale linéairement avec la taille du groupe", () => {
    const budget2 = calculateEncounterBudget(2, 5, "Hard");
    const budget4 = calculateEncounterBudget(4, 5, "Hard");
    expect(budget4).toBe(budget2 * 2);
  });
});
