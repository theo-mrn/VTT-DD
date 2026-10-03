// Mock Firebase Admin avant l'import de character-variables.ts
jest.mock("../lib/firebase-admin", () => ({
  adminDb: {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
    }),
    collection: jest.fn(),
  },
}));

import { applyVariables } from "@/lib/character-variables";

describe("applyVariables", () => {
  it("remplace une variable simple", () => {
    expect(applyVariables("1d20+FOR", { FOR: 3 })).toBe("1d20+3");
  });

  it("remplace plusieurs variables", () => {
    expect(applyVariables("1d20+FOR+DEX", { FOR: 3, DEX: 2 })).toBe("1d20+3+2");
  });

  it("est insensible à la casse", () => {
    expect(applyVariables("1d20+for", { FOR: 3 })).toBe("1d20+3");
    expect(applyVariables("1d20+For", { FOR: 3 })).toBe("1d20+3");
  });

  it("ne remplace pas un mot qui n'est pas dans les variables", () => {
    expect(applyVariables("1d20+FOR", { DEX: 2 })).toBe("1d20+FOR");
  });

  it("retourne la notation telle quelle si aucune variable", () => {
    expect(applyVariables("1d6", {})).toBe("1d6");
  });

  it("gère les valeurs négatives", () => {
    expect(applyVariables("1d20+FOR", { FOR: -2 })).toBe("1d20+-2");
  });

  it("gère les valeurs nulles", () => {
    expect(applyVariables("1d20+FOR", { FOR: 0 })).toBe("1d20+0");
  });

  it("évite les correspondances partielles (INIT avant IN)", () => {
    expect(applyVariables("1d20+INIT", { INIT: 4, IN: 99 })).toBe("1d20+4");
  });

  it("remplace plusieurs occurrences de la même variable", () => {
    expect(applyVariables("FOR+FOR", { FOR: 3 })).toBe("3+3");
  });

  it("gère les champs personnalisés avec noms longs", () => {
    expect(applyVariables("Perception+Acrobaties", { Perception: 5, Acrobaties: 3 })).toBe("5+3");
  });
});
