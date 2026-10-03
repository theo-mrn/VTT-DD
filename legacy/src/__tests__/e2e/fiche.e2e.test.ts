/**
 * Tests E2E — Fiche personnage (fiche.tsx)
 * Collections : cartes/{roomId}/characters
 * Couvre : création, stats, layout, thème, customFields, level-up,
 *          statRollable, avatar, type pnj, bourse, widgets optionnels
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import { doc, setDoc, getDoc, updateDoc, collection, getDocs, deleteDoc } from "firebase/firestore";

const ROOM_ID = "test-fiche-room";
const PERSO_ID = "perso-frodo";
const PNJ_ID = "pnj-nazgul";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();
});

afterAll(async () => {
  await cleanupTestEnv();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createCharacter(db: any, id = PERSO_ID, overrides = {}) {
  await setDoc(doc(db, `cartes/${ROOM_ID}/characters/${id}`), {
    Nomperso: "Frodo",
    type: "joueurs",
    niveau: 1,
    PV: 20,
    PV_Max: 20,
    FOR: 8, DEX: 14, CON: 12, SAG: 14, INT: 10, CHA: 10,
    Defense: 11,
    Contact: 2,
    Distance: 4,
    Magie: 0,
    INIT: 2,
    v1: 0, v2: 0,
    customFields: [],
    layout: [],
    conditions: [],
    ...overrides,
  });
}

// ─── Création et lecture ──────────────────────────────────────────────────────

describe("Fiche — Création et lecture", () => {
  it("crée un personnage joueur avec toutes ses stats de base", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createCharacter(db);

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.Nomperso).toBe("Frodo");
    expect(snap.data()?.FOR).toBe(8);
    expect(snap.data()?.DEX).toBe(14);
    expect(snap.data()?.type).toBe("joueurs");
  });

  it("crée un personnage de type pnj", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createCharacter(db, PNJ_ID, {
      Nomperso: "Nazgûl",
      type: "pnj",
      PV: 60,
      Defense: 15,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PNJ_ID}`));
    expect(snap.data()?.type).toBe("pnj");
    expect(snap.data()?.Nomperso).toBe("Nazgûl");
    expect(snap.data()?.PV).toBe(60);
  });

  it("lit les stats avec leur modificateur calculable (D&D)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    const data = snap.data()!;

    // FOR 8 → mod -1, DEX 14 → mod +2
    expect(Math.floor((data.FOR - 10) / 2)).toBe(-1);
    expect(Math.floor((data.DEX - 10) / 2)).toBe(2);
  });

  it("liste tous les personnages d'une room", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/characters`));
    expect(snap.size).toBeGreaterThanOrEqual(2);

    const types = snap.docs.map(d => d.data().type);
    expect(types).toContain("joueurs");
    expect(types).toContain("pnj");
  });
});

// ─── Avatar ───────────────────────────────────────────────────────────────────

describe("Fiche — Avatar", () => {
  it("enregistre une URL d'avatar", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      imageURL: "https://example.com/frodo.png",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.imageURL).toBe("https://example.com/frodo.png");
  });

  it("met à jour l'URL d'avatar finale (imageURLFinal)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      imageURLFinal: "https://cdn.example.com/frodo-final.webp",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.imageURLFinal).toBe("https://cdn.example.com/frodo-final.webp");
  });

  it("réinitialise l'avatar (URL vide)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      imageURL: "",
      imageURLFinal: "",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.imageURL).toBe("");
  });
});

// ─── Mise à jour des stats ────────────────────────────────────────────────────

describe("Fiche — Mise à jour des stats", () => {
  it("modifie les PV actuels", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { PV: 15 });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.PV).toBe(15);
  });

  it("modifie une stat principale (FOR)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { FOR: 10 });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.FOR).toBe(10);
  });

  it("applique plusieurs stats en une seule écriture", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      FOR: 12, DEX: 16, CON: 14,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.FOR).toBe(12);
    expect(snap.data()?.DEX).toBe(16);
    expect(snap.data()?.CON).toBe(14);
  });

  it("applique les stats _F (finales avec bonus)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      FOR_F: 4,
      DEX_F: 5,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.FOR_F).toBe(4);
    expect(snap.data()?.DEX_F).toBe(5);
  });

  it("met à jour les stats de combat (Defense, Contact, Distance, Magie)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      Defense: 14,
      Contact: 5,
      Distance: 6,
      Magie: 3,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.Defense).toBe(14);
    expect(snap.data()?.Contact).toBe(5);
    expect(snap.data()?.Distance).toBe(6);
    expect(snap.data()?.Magie).toBe(3);
  });
});

// ─── Level-up ─────────────────────────────────────────────────────────────────

describe("Fiche — Level-up", () => {
  it("augmente le niveau du personnage", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`);
    const snap = await getDoc(charRef);
    const newLevel = (snap.data()?.niveau ?? 1) + 1;

    await updateDoc(charRef, { niveau: newLevel });

    const updated = await getDoc(charRef);
    expect(updated.data()?.niveau).toBe(2);
  });

  it("augmente les PV max au level-up", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`);
    await updateDoc(charRef, { PV_Max: 25, PV: 25 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.PV_Max).toBe(25);
  });

  it("augmente Contact, Distance et Magie au level-up", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`);
    const snap = await getDoc(charRef);
    const data = snap.data()!;

    await updateDoc(charRef, {
      Contact: (data.Contact ?? 0) + 1,
      Distance: (data.Distance ?? 0) + 1,
      Magie: (data.Magie ?? 0) + 1,
    });

    const updated = await getDoc(charRef);
    expect(updated.data()?.Contact).toBe((data.Contact ?? 0) + 1);
    expect(updated.data()?.Distance).toBe((data.Distance ?? 0) + 1);
  });
});

// ─── Layout et thème ──────────────────────────────────────────────────────────

describe("Fiche — Layout", () => {
  it("sauvegarde le layout par défaut (DEFAULT_LAYOUT)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const defaultLayout = [
      { i: "avatar",       x: 0,  y: 0,  w: 20, h: 4, minW: 20, minH: 3 },
      { i: "details",      x: 20, y: 0,  w: 20, h: 4, minW: 20, minH: 3 },
      { i: "stats",        x: 0,  y: 4,  w: 30, h: 4, minW: 20, minH: 3 },
      { i: "vitals",       x: 30, y: 4,  w: 30, h: 2, minW: 20, minH: 2 },
      { i: "combat_stats", x: 30, y: 6,  w: 30, h: 2, minW: 20, minH: 2 },
      { i: "inventory",    x: 0,  y: 8,  w: 60, h: 6, minW: 20, minH: 4 },
      { i: "skills",       x: 0,  y: 14, w: 60, h: 6, minW: 20, minH: 6 },
      { i: "effects",      x: 40, y: 0,  w: 20, h: 4, minW: 20, minH: 3 },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { layout: defaultLayout });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.layout).toHaveLength(8);
    expect(snap.data()?.layout[0].i).toBe("avatar");
  });

  it("sauvegarde un layout personnalisé", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const layout = [
      { i: "avatar",    x: 0, y: 0, w: 20, h: 4, minW: 20, minH: 3 },
      { i: "stats",     x: 0, y: 4, w: 30, h: 4, minW: 20, minH: 3 },
      { i: "inventory", x: 0, y: 8, w: 60, h: 6, minW: 20, minH: 4 },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { layout });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.layout).toHaveLength(3);
    expect(snap.data()?.layout[0].i).toBe("avatar");
  });

  it("met à jour un widget du layout (changement de taille)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const layout = [
      { i: "avatar", x: 0, y: 0, w: 40, h: 4, minW: 20, minH: 3 },
      { i: "stats",  x: 0, y: 4, w: 30, h: 4, minW: 20, minH: 3 },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { layout });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    const avatar = snap.data()?.layout.find((l: any) => l.i === "avatar");
    expect(avatar?.w).toBe(40);
  });

  it("ajoute le widget optionnel 'bourse' au layout", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const layout = [
      { i: "avatar", x: 0, y: 0, w: 20, h: 4, minW: 20, minH: 3 },
      { i: "bourse", x: 0, y: 4, w: 60, h: 4, minW: 20, minH: 3 },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { layout });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    const bourse = snap.data()?.layout.find((l: any) => l.i === "bourse");
    expect(bourse).toBeDefined();
  });

  it("supprime un widget du layout (handleRemoveWidget)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const layout = [
      { i: "avatar", x: 0, y: 0, w: 20, h: 4, minW: 20, minH: 3 },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { layout });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    const bourse = snap.data()?.layout.find((l: any) => l.i === "bourse");
    expect(bourse).toBeUndefined();
  });

  it("sauvegarde les préférences de thème", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      theme_background: "#1a1a2e",
      theme_secondary_color: "#16213e",
      theme_text_color: "#e0e0e0",
      theme_border_color: "#8b6914",
      theme_border_radius: 8,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.theme_background).toBe("#1a1a2e");
    expect(snap.data()?.theme_border_radius).toBe(8);
  });

  it("importe un thème JSON complet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const themeImport = {
      theme_background: "#0d0d0d",
      theme_secondary_color: "#1a1a1a",
      theme_text_color: "#ffffff",
      theme_border_color: "#gold",
      theme_border_radius: 12,
      theme_font: "serif",
    };

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), themeImport);

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.theme_font).toBe("serif");
    expect(snap.data()?.theme_border_radius).toBe(12);
  });
});

// ─── Champs personnalisés ─────────────────────────────────────────────────────

describe("Fiche — Champs personnalisés (customFields)", () => {
  it("ajoute un champ personnalisé rollable", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customFields = [
      { label: "Perception", type: "number", value: 14, isRollable: true, hasModifier: true },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { customFields });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.customFields).toHaveLength(1);
    expect(snap.data()?.customFields[0].label).toBe("Perception");
    expect(snap.data()?.customFields[0].isRollable).toBe(true);
  });

  it("ajoute un champ de type texte (non rollable)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customFields = [
      { label: "Note RP", type: "text", value: "Porteur de l'Anneau", isRollable: false },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { customFields });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.customFields[0].type).toBe("text");
    expect(snap.data()?.customFields[0].isRollable).toBe(false);
  });

  it("ajoute un champ de type percent", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customFields = [
      { label: "Furtivité", type: "percent", value: 75, isRollable: true, hasModifier: false },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { customFields });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.customFields[0].type).toBe("percent");
    expect(snap.data()?.customFields[0].value).toBe(75);
  });

  it("ajoute plusieurs champs personnalisés", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customFields = [
      { label: "Perception",  type: "number",  value: 14, isRollable: true,  hasModifier: true  },
      { label: "Discrétion",  type: "number",  value: 16, isRollable: true,  hasModifier: false },
      { label: "Note RP",     type: "text",    value: "Porteur de l'Anneau", isRollable: false  },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { customFields });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.customFields).toHaveLength(3);
  });

  it("modifie la valeur d'un champ personnalisé", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customFields = [
      { label: "Perception", type: "number", value: 18, isRollable: true, hasModifier: true },
    ];

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { customFields });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.customFields[0].value).toBe(18);
  });

  it("supprime tous les champs personnalisés", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { customFields: [] });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.customFields).toHaveLength(0);
  });
});

// ─── Stat rollable overrides ──────────────────────────────────────────────────

describe("Fiche — Stat rollable overrides", () => {
  it("active Defense comme stat rollable", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      statRollable: { Defense: true, INIT: true },
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.statRollable?.Defense).toBe(true);
    expect(snap.data()?.statRollable?.INIT).toBe(true);
  });

  it("désactive FOR comme stat rollable", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      statRollable: { FOR: false },
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.statRollable?.FOR).toBe(false);
  });

  it("active toutes les stats de combat comme rollables", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
      statRollable: { Defense: true, Contact: true, Distance: true, Magie: true, INIT: true },
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`));
    expect(snap.data()?.statRollable?.Contact).toBe(true);
    expect(snap.data()?.statRollable?.Distance).toBe(true);
    expect(snap.data()?.statRollable?.Magie).toBe(true);
  });
});

// ─── Suppression de personnage ────────────────────────────────────────────────

describe("Fiche — Suppression", () => {
  it("supprime un personnage PNJ (mort au combat)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createCharacter(db, "pnj-to-delete", { Nomperso: "Gobelin", type: "pnj", PV: 0 });
    const charRef = doc(db, `cartes/${ROOM_ID}/characters/pnj-to-delete`);

    await deleteDoc(charRef);

    const snap = await getDoc(charRef);
    expect(snap.exists()).toBe(false);
  });

  it("ne supprime pas un joueur quand PV = 0", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`);
    await updateDoc(charRef, { PV: 0 });

    // Les joueurs ne sont pas supprimés automatiquement
    const snap = await getDoc(charRef);
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.PV).toBe(0);
  });
});
