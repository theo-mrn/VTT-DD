/**
 * Tests E2E — Personnages
 * Nécessite l'émulateur Firestore : firebase emulators:exec --only firestore "npm test"
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const ROOM_ID = "test-room-01";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();
});

afterAll(async () => {
  await cleanupTestEnv();
});

describe("Firestore — Personnages", () => {
  it("crée un personnage et le relit correctement", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/perso-1`);
    await setDoc(charRef, {
      Nomperso: "Aragorn",
      type: "joueurs",
      niveau: 5,
      PV: 40,
      FOR: 18,
      DEX: 14,
      CON: 16,
      SAG: 12,
      INT: 10,
      CHA: 14,
      Defense: 15,
      INIT: 3,
    });

    const snap = await getDoc(charRef);
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.Nomperso).toBe("Aragorn");
    expect(snap.data()?.niveau).toBe(5);
  });

  it("met à jour les PV d'un personnage", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/perso-1`);
    await updateDoc(charRef, { PV: 25 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.PV).toBe(25);
  });

  it("liste tous les personnages d'une room", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // Ajoute un second personnage
    await setDoc(doc(db, `cartes/${ROOM_ID}/characters/perso-2`), {
      Nomperso: "Legolas",
      type: "joueurs",
      niveau: 5,
      PV: 35,
    });

    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/characters`));
    expect(snap.size).toBe(2);
    const noms = snap.docs.map(d => d.data().Nomperso);
    expect(noms).toContain("Aragorn");
    expect(noms).toContain("Legolas");
  });

  it("supprime un personnage", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/perso-2`);
    await deleteDoc(charRef);

    const snap = await getDoc(charRef);
    expect(snap.exists()).toBe(false);
  });
});

describe("Firestore — Inventaire", () => {
  it("ajoute un objet dans l'inventaire", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const itemRef = doc(db, `Inventaire/${ROOM_ID}/Aragorn/item-1`);
    await setDoc(itemRef, {
      message: "Épée longue",
      category: "armes-contact",
      quantity: 1,
      weight: 2,
    });

    const snap = await getDoc(itemRef);
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.message).toBe("Épée longue");
  });

  it("incrémente la quantité d'un objet existant", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const itemRef = doc(db, `Inventaire/${ROOM_ID}/Aragorn/item-1`);
    const snap = await getDoc(itemRef);
    const currentQty = snap.data()?.quantity ?? 0;

    await updateDoc(itemRef, { quantity: currentQty + 1 });

    const updated = await getDoc(itemRef);
    expect(updated.data()?.quantity).toBe(2);
  });

  it("supprime un objet de l'inventaire quand la quantité tombe à 0", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const itemRef = doc(db, `Inventaire/${ROOM_ID}/Aragorn/item-1`);
    await deleteDoc(itemRef);

    const snap = await getDoc(itemRef);
    expect(snap.exists()).toBe(false);
  });
});

describe("Firestore — Bonus", () => {
  it("ajoute un bonus d'équipement", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/Aragorn/item-epee`);
    await setDoc(bonusRef, {
      FOR: 2,
      Contact: 1,
      active: true,
      category: "Inventaire",
      name: "Épée enchantée",
    });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.FOR).toBe(2);
    expect(snap.data()?.active).toBe(true);
  });

  it("désactive un bonus sans le supprimer", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/Aragorn/item-epee`);
    await updateDoc(bonusRef, { active: false });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.active).toBe(false);
    expect(snap.data()?.FOR).toBe(2); // le bonus est toujours là
  });
});
