/**
 * Tests E2E — Compétences
 * Collections : cartes/{roomId}/characters/{persoId}/customCompetences
 *               Bonus/{roomId}/{playerName}/{competenceId}
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, addDoc } from "firebase/firestore";

const ROOM_ID = "test-comp-room";
const PERSO_ID = "perso-aragorn";
const PLAYER_NAME = "Aragorn";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();

  // Personnage de base
  const db = env.unauthenticatedContext().firestore();
  await setDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`), {
    Nomperso: PLAYER_NAME,
    type: "joueurs",
    niveau: 4,
    v1: 2, // Voie 1 rang 2
    v2: 0,
  });
});

afterAll(async () => {
  await cleanupTestEnv();
});

// ─── Voies et rangs ───────────────────────────────────────────────────────────

describe("Compétences — Débloquage de rangs", () => {
  it("débloque le rang 1 d'une voie", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`);
    await updateDoc(charRef, { v1: 1 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.v1).toBe(1);
  });

  it("débloque le rang 3 d'une voie (progression)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`);
    await updateDoc(charRef, { v1: 3 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.v1).toBe(3);
  });

  it("réinitialise toutes les voies à 0", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`);
    await updateDoc(charRef, { v1: 0, v2: 0, v3: 0 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.v1).toBe(0);
    expect(snap.data()?.v2).toBe(0);
  });
});

// ─── Custom compétences ───────────────────────────────────────────────────────

describe("Compétences — Compétences personnalisées", () => {
  it("ajoute une compétence personnalisée", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customRef = collection(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}/customCompetences`);
    const docRef = await addDoc(customRef, {
      slotIndex: 0,
      voieIndex: 0,
      sourceVoie: "Voie du Mage",
      sourceRank: 2,
      competenceName: "Boule de feu",
      competenceDescription: "Lance une boule de feu infligeant 3d6 dégâts.",
      competenceType: "active",
    });

    const snap = await getDoc(docRef);
    expect(snap.data()?.competenceName).toBe("Boule de feu");
    expect(snap.data()?.slotIndex).toBe(0);
  });

  it("liste les compétences personnalisées d'un personnage", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customRef = collection(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}/customCompetences`);
    await addDoc(customRef, {
      slotIndex: 1,
      voieIndex: 0,
      sourceVoie: "Voie du Guerrier",
      sourceRank: 1,
      competenceName: "Frappe puissante",
      competenceDescription: "Inflige des dégâts supplémentaires.",
      competenceType: "passive",
    });

    const snap = await getDocs(customRef);
    expect(snap.size).toBeGreaterThanOrEqual(2);
    const names = snap.docs.map(d => d.data().competenceName);
    expect(names).toContain("Boule de feu");
    expect(names).toContain("Frappe puissante");
  });

  it("supprime une compétence personnalisée", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const customRef = collection(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}/customCompetences`);
    const snap = await getDocs(customRef);
    const toDelete = snap.docs[0];

    await deleteDoc(toDelete.ref);

    const after = await getDocs(customRef);
    expect(after.size).toBe(snap.size - 1);
  });
});

// ─── Bonus de compétences ─────────────────────────────────────────────────────

describe("Compétences — Bonus", () => {
  it("crée un bonus de compétence active", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_NAME}/comp-rage`);
    await setDoc(bonusRef, {
      FOR: 3,
      CON: 2,
      active: true,
      category: "competence",
      name: "Rage du Barbare",
    });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.FOR).toBe(3);
    expect(snap.data()?.active).toBe(true);
  });

  it("active/désactive un bonus de compétence", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_NAME}/comp-rage`);

    await updateDoc(bonusRef, { active: false });
    let snap = await getDoc(bonusRef);
    expect(snap.data()?.active).toBe(false);

    await updateDoc(bonusRef, { active: true });
    snap = await getDoc(bonusRef);
    expect(snap.data()?.active).toBe(true);
  });

  it("modifie la valeur d'un bonus existant", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_NAME}/comp-rage`);
    const snap = await getDoc(bonusRef);
    const currentFor = snap.data()?.FOR ?? 0;

    await updateDoc(bonusRef, { FOR: currentFor + 2 });

    const updated = await getDoc(bonusRef);
    expect(updated.data()?.FOR).toBe(5);
  });

  it("remet un bonus à 0 (suppression logique)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_NAME}/comp-rage`);
    await setDoc(bonusRef, { FOR: 0 }, { merge: true });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.FOR).toBe(0);
  });

  it("assigne une sélection de dés à une compétence", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_NAME}/comp-rage`);
    await updateDoc(bonusRef, { diceSelection: "2d6" });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.diceSelection).toBe("2d6");
  });

  it("supprime la sélection de dés d'une compétence", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_NAME}/comp-rage`);
    await updateDoc(bonusRef, { diceSelection: "" });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.diceSelection).toBe("");
  });
});
