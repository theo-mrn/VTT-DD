// Mock Firebase avant l'import de titles.ts
jest.mock("../lib/firebase", () => ({
  db: {},
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  getDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
}));

import { generateSlug, INITIAL_TITLES } from "@/lib/titles";

describe("generateSlug", () => {
  it("convertit en minuscules", () => {
    expect(generateSlug("Vagabond")).toBe("vagabond");
  });

  it("retire les accents", () => {
    expect(generateSlug("Héros")).toBe("heros");
    expect(generateSlug("Érudit")).toBe("erudit");
    expect(generateSlug("Vétéran")).toBe("veteran");
  });

  it("remplace les espaces par des underscores", () => {
    expect(generateSlug("Rat de taverne")).toBe("rat_de_taverne");
  });

  it("remplace les caractères spéciaux par des underscores", () => {
    expect(generateSlug("Maître d'Armes")).toBe("maitre_d_armes");
  });

  it("ne laisse pas d'underscores en début ou fin", () => {
    expect(generateSlug("_test_")).toBe("test");
  });

  it("fusionne plusieurs caractères non-alphanumériques consécutifs", () => {
    expect(generateSlug("Béni des Dieux")).toBe("beni_des_dieux");
  });

  it("produit des slugs déterministes (même entrée → même sortie)", () => {
    const label = "Maudit des dés";
    expect(generateSlug(label)).toBe(generateSlug(label));
  });
});

describe("INITIAL_TITLES", () => {
  it("contient des titres débloqués par défaut", () => {
    const unlocked = INITIAL_TITLES.filter(t => t.defaultUnlocked);
    expect(unlocked.length).toBeGreaterThan(0);
  });

  it("contient des titres verrouillés par défaut", () => {
    const locked = INITIAL_TITLES.filter(t => !t.defaultUnlocked);
    expect(locked.length).toBeGreaterThan(0);
  });

  it("les titres avec condition 'time' ont un nombre de minutes positif", () => {
    const timeTitles = INITIAL_TITLES.filter(
      t => t.condition?.type === "time"
    );
    timeTitles.forEach(t => {
      if (t.condition?.type === "time") {
        expect(t.condition.minutes).toBeGreaterThan(0);
      }
    });
  });

  it("chaque label est unique", () => {
    const labels = INITIAL_TITLES.map(t => t.label);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });

  it("les titres 'time' sont ordonnés par minutes croissantes", () => {
    const timeTitles = INITIAL_TITLES.filter(
      t => t.condition?.type === "time"
    ) as Array<{ label: string; defaultUnlocked: boolean; condition: { type: "time"; minutes: number } }>;

    for (let i = 1; i < timeTitles.length; i++) {
      expect(timeTitles[i].condition.minutes).toBeGreaterThanOrEqual(
        timeTitles[i - 1].condition.minutes
      );
    }
  });
});
