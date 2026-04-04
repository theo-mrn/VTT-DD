/**
 * Tests E2E — Combat (MJcombat)
 * Collections : cartes/{roomId}/characters, cartes/{roomId}/combat/{charId}/rapport
 *               cartes/{roomId}/cities/{cityId}/combat/state
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, addDoc } from "firebase/firestore";

const ROOM_ID = "test-combat-room";
const CITY_ID = "city-01";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();
});

afterAll(async () => {
  await cleanupTestEnv();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createCharacter(db: any, id: string, overrides = {}) {
  await setDoc(doc(db, `cartes/${ROOM_ID}/characters/${id}`), {
    Nomperso: id,
    type: "joueurs",
    PV: 30,
    Defense: 12,
    INIT: 3,
    currentInit: 0,
    conditions: [],
    ...overrides,
  });
}

// ─── Initiative ───────────────────────────────────────────────────────────────

describe("Combat — Initiative", () => {
  it("met à jour currentInit et initDetails d'un personnage", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createCharacter(db, "Aragorn", { INIT: 3 });

    const diceRoll = 15;
    const totalInit = 3 + diceRoll;

    await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/Aragorn`), {
      currentInit: totalInit,
      initDetails: `3+${diceRoll}=${totalInit}`,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/Aragorn`));
    expect(snap.data()?.currentInit).toBe(18);
    expect(snap.data()?.initDetails).toBe("3+15=18");
  });

  it("enregistre le joueur actif dans l'état de combat de la ville", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const combatRef = doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}/combat/state`);
    await setDoc(combatRef, { activePlayer: "Aragorn" }, { merge: true });

    const snap = await getDoc(combatRef);
    expect(snap.data()?.activePlayer).toBe("Aragorn");
  });

  it("initialise plusieurs personnages avec leurs initiatives", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const chars = [
      { id: "Legolas", init: 5, dice: 18, total: 23 },
      { id: "Gimli", init: 1, dice: 7, total: 8 },
      { id: "Gandalf", init: 4, dice: 12, total: 16 },
    ];

    for (const c of chars) {
      await createCharacter(db, c.id, { INIT: c.init });
      await updateDoc(doc(db, `cartes/${ROOM_ID}/characters/${c.id}`), {
        currentInit: c.total,
        initDetails: `${c.init}+${c.dice}=${c.total}`,
      });
    }

    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/characters`));
    const inits = snap.docs.map(d => d.data().currentInit).filter(v => v > 0);
    expect(inits).toContain(23);
    expect(inits).toContain(16);
    expect(inits).toContain(8);
  });
});

// ─── PV et dégâts ─────────────────────────────────────────────────────────────

describe("Combat — PV et dégâts", () => {
  it("applique des dégâts à un personnage", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createCharacter(db, "Boromir", { PV: 40 });

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Boromir`);
    const snap = await getDoc(charRef);
    const newPv = Math.max(0, snap.data()!.PV - 15);

    await updateDoc(charRef, { PV: newPv });

    const updated = await getDoc(charRef);
    expect(updated.data()?.PV).toBe(25);
  });

  it("clamp les PV à 0 (pas de PV négatifs)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createCharacter(db, "Orc", { PV: 5, type: "pnj" });

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Orc`);
    const snap = await getDoc(charRef);
    const newPv = Math.max(0, snap.data()!.PV - 99);

    await updateDoc(charRef, { PV: newPv });

    const updated = await getDoc(charRef);
    expect(updated.data()?.PV).toBe(0);
  });

  it("soigne un personnage (augmente les PV)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Boromir`);
    await updateDoc(charRef, { PV: 35 }); // +10 de soin

    const snap = await getDoc(charRef);
    expect(snap.data()?.PV).toBe(35);
  });
});

// ─── Conditions ───────────────────────────────────────────────────────────────

describe("Combat — Conditions", () => {
  it("ajoute une condition à un personnage", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { conditions: ["poisoned"] });

    const snap = await getDoc(charRef);
    expect(snap.data()?.conditions).toContain("poisoned");
  });

  it("ajoute plusieurs conditions", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { conditions: ["poisoned", "stunned"] });

    const snap = await getDoc(charRef);
    expect(snap.data()?.conditions).toHaveLength(2);
  });

  it("retire une condition", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { conditions: ["stunned"] }); // retire poisoned

    const snap = await getDoc(charRef);
    expect(snap.data()?.conditions).not.toContain("poisoned");
    expect(snap.data()?.conditions).toContain("stunned");
  });

  it("retire toutes les conditions", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { conditions: [] });

    const snap = await getDoc(charRef);
    expect(snap.data()?.conditions).toHaveLength(0);
  });

  it("supporte les conditions personnalisées", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { conditions: ["Ralenti"] });

    const snap = await getDoc(charRef);
    expect(snap.data()?.conditions).toContain("Ralenti");
  });
});

// ─── Rapport d'attaque ────────────────────────────────────────────────────────

describe("Combat — Rapport d'attaque", () => {
  it("enregistre un rapport d'attaque", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const rapportRef = collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`);
    const docRef = await addDoc(rapportRef, {
      attaquant: "Aragorn",
      cible: "Orc",
      cible_nom: "Orc",
      arme_utilisée: "Épée longue",
      attaque_result: 18,
      degat_result: 12,
      réussite: true,
      type: "Contact",
    });

    const snap = await getDoc(docRef);
    expect(snap.data()?.réussite).toBe(true);
    expect(snap.data()?.degat_result).toBe(12);
  });

  it("enregistre une attaque ratée", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const rapportRef = collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`);
    const docRef = await addDoc(rapportRef, {
      attaquant: "Aragorn",
      cible: "Troll",
      cible_nom: "Troll",
      arme_utilisée: "Épée longue",
      attaque_result: 5,
      degat_result: 0,
      réussite: false,
      type: "Contact",
    });

    const snap = await getDoc(docRef);
    expect(snap.data()?.réussite).toBe(false);
    expect(snap.data()?.degat_result).toBe(0);
  });

  it("liste tous les rapports d'un attaquant", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const rapportSnap = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`));
    expect(rapportSnap.size).toBeGreaterThanOrEqual(2);
  });

  it("supprime les rapports d'un personnage supprimé", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const rapportSnap = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`));
    for (const d of rapportSnap.docs) {
      await deleteDoc(d.ref);
    }

    const after = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`));
    expect(after.size).toBe(0);
  });
});
