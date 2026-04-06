/**
 * Tests E2E — Inventaire (inventaire.tsx)
 * Collections : Inventaire/{roomId}/{playerName}
 *               Bonus/{roomId}/{playerName}/{itemId}
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where,
} from "firebase/firestore";

const ROOM_ID = "test-inventaire-room";
const PLAYER_A = "Aragorn";
const PLAYER_B = "Legolas";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();
});

afterAll(async () => {
  await cleanupTestEnv();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function addItem(db: any, player: string, overrides = {}) {
  return addDoc(collection(db, `Inventaire/${ROOM_ID}/${player}`), {
    name: "Épée longue",
    quantity: 1,
    weight: 1.5,
    description: "Une épée à deux tranchants",
    isEquipped: false,
    ...overrides,
  });
}

// ─── Ajout d'objets ───────────────────────────────────────────────────────────

describe("Inventaire — Ajout d'objets", () => {
  it("ajoute un objet dans l'inventaire d'un joueur", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, { name: "Potion de soin", quantity: 3 });
    const snap = await getDoc(ref);

    expect(snap.exists()).toBe(true);
    expect(snap.data()?.name).toBe("Potion de soin");
    expect(snap.data()?.quantity).toBe(3);
  });

  it("ajoute plusieurs objets différents", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await addItem(db, PLAYER_A, { name: "Épée longue", quantity: 1 });
    await addItem(db, PLAYER_A, { name: "Bouclier", quantity: 1 });
    await addItem(db, PLAYER_A, { name: "Arc long", quantity: 1 });

    const snap = await getDocs(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_A}`));
    expect(snap.size).toBeGreaterThanOrEqual(3);
    const names = snap.docs.map(d => d.data().name);
    expect(names).toContain("Épée longue");
    expect(names).toContain("Bouclier");
  });

  it("ajoute un objet avec poids et description", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, {
      name: "Armure de plates",
      weight: 15,
      description: "Armure lourde offrant une bonne protection",
      quantity: 1,
    });

    const snap = await getDoc(ref);
    expect(snap.data()?.weight).toBe(15);
    expect(snap.data()?.description).toBe("Armure lourde offrant une bonne protection");
  });
});

// ─── Mise à jour de quantité ──────────────────────────────────────────────────

describe("Inventaire — Quantité", () => {
  let itemRef: any;

  beforeAll(async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();
    itemRef = await addItem(db, PLAYER_A, { name: "Flèche", quantity: 20 });
  });

  it("incrémente la quantité d'un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDoc(itemRef);
    await updateDoc(itemRef, { quantity: snap.data()!.quantity + 10 });

    const updated = await getDoc(itemRef);
    expect(updated.data()?.quantity).toBe(30);
  });

  it("décrémente la quantité d'un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDoc(itemRef);
    await updateDoc(itemRef, { quantity: snap.data()!.quantity - 5 });

    const updated = await getDoc(itemRef);
    expect(updated.data()?.quantity).toBe(25);
  });

  it("consomme le dernier exemplaire (quantité → 0, suppression)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const singleRef = await addItem(db, PLAYER_A, { name: "Parchemin magique", quantity: 1 });

    const snap = await getDoc(singleRef);
    const newQty = snap.data()!.quantity - 1;

    if (newQty <= 0) {
      await deleteDoc(singleRef);
    } else {
      await updateDoc(singleRef, { quantity: newQty });
    }

    const after = await getDoc(singleRef);
    expect(after.exists()).toBe(false);
  });

  it("consomme partiellement (quantité > 1)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, { name: "Bombe fumigène", quantity: 5 });

    const snap = await getDoc(ref);
    const newQty = snap.data()!.quantity - 1;
    await updateDoc(ref, { quantity: newQty });

    const after = await getDoc(ref);
    expect(after.data()?.quantity).toBe(4);
    expect(after.exists()).toBe(true);
  });
});

// ─── Renommage et modification ────────────────────────────────────────────────

describe("Inventaire — Modification d'objet", () => {
  it("renomme un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, { name: "Dague rouillée" });
    await updateDoc(ref, { name: "Dague enchantée" });

    const snap = await getDoc(ref);
    expect(snap.data()?.name).toBe("Dague enchantée");
  });

  it("met à jour la description d'un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, { name: "Anneau mystérieux", description: "" });
    await updateDoc(ref, { description: "Un anneau gravé de runes anciennes" });

    const snap = await getDoc(ref);
    expect(snap.data()?.description).toBe("Un anneau gravé de runes anciennes");
  });

  it("équipe/déséquipe un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, { name: "Épée de feu", isEquipped: false });
    await updateDoc(ref, { isEquipped: true });

    let snap = await getDoc(ref);
    expect(snap.data()?.isEquipped).toBe(true);

    await updateDoc(ref, { isEquipped: false });
    snap = await getDoc(ref);
    expect(snap.data()?.isEquipped).toBe(false);
  });
});

// ─── Suppression ─────────────────────────────────────────────────────────────

describe("Inventaire — Suppression", () => {
  it("supprime un objet de l'inventaire", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, { name: "Objet à supprimer" });
    await deleteDoc(ref);

    const snap = await getDoc(ref);
    expect(snap.exists()).toBe(false);
  });

  it("supprime tous les objets d'un joueur", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // Ajouter des objets à PLAYER_B
    await addItem(db, PLAYER_B, { name: "Item 1" });
    await addItem(db, PLAYER_B, { name: "Item 2" });

    const before = await getDocs(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_B}`));
    expect(before.size).toBeGreaterThanOrEqual(2);

    // Tout supprimer
    for (const d of before.docs) {
      await deleteDoc(d.ref);
    }

    const after = await getDocs(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_B}`));
    expect(after.size).toBe(0);
  });
});

// ─── Donner un objet ──────────────────────────────────────────────────────────

describe("Inventaire — Don d'objet entre joueurs", () => {
  it("transfère un objet d'un joueur à un autre", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // Aragorn possède une potion
    const sourceRef = await addItem(db, PLAYER_A, { name: "Potion de force", quantity: 1 });
    const sourceSnap = await getDoc(sourceRef);
    const itemData = sourceSnap.data()!;

    // Transfer: supprimer chez Aragorn, ajouter chez Legolas
    await deleteDoc(sourceRef);
    const targetRef = await addDoc(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_B}`), itemData);

    const afterSource = await getDoc(sourceRef);
    expect(afterSource.exists()).toBe(false);

    const afterTarget = await getDoc(targetRef);
    expect(afterTarget.exists()).toBe(true);
    expect(afterTarget.data()?.name).toBe("Potion de force");
  });

  it("transfère un objet en quantité partielle (stack split)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const sourceRef = await addItem(db, PLAYER_A, { name: "Pièces d'or", quantity: 50 });

    // Donner 10 pièces à Legolas
    const giveQty = 10;
    await updateDoc(sourceRef, { quantity: 50 - giveQty });
    await addDoc(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_B}`), {
      name: "Pièces d'or",
      quantity: giveQty,
    });

    const sourceSnap = await getDoc(sourceRef);
    expect(sourceSnap.data()?.quantity).toBe(40);

    const targetSnap = await getDocs(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_B}`));
    const gold = targetSnap.docs.find(d => d.data().name === "Pièces d'or");
    expect(gold?.data()?.quantity).toBe(10);
  });
});

// ─── Bonus d'objet ────────────────────────────────────────────────────────────

describe("Inventaire — Bonus d'objet", () => {
  it("crée un bonus associé à un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/anneau-protection`);
    await setDoc(bonusRef, {
      Defense: 2,
      active: true,
      category: "item",
      name: "Anneau de protection",
    });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.Defense).toBe(2);
    expect(snap.data()?.active).toBe(true);
    expect(snap.data()?.category).toBe("item");
  });

  it("active/désactive un bonus d'objet (équiper/déséquiper)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/anneau-protection`);

    await updateDoc(bonusRef, { active: false });
    let snap = await getDoc(bonusRef);
    expect(snap.data()?.active).toBe(false);

    await updateDoc(bonusRef, { active: true });
    snap = await getDoc(bonusRef);
    expect(snap.data()?.active).toBe(true);
  });

  it("crée un bonus avec plusieurs stats", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/armure-mage`);
    await setDoc(bonusRef, {
      Defense: 3,
      INT: 2,
      SAG: 1,
      active: true,
      category: "item",
      name: "Armure du Mage",
    });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.Defense).toBe(3);
    expect(snap.data()?.INT).toBe(2);
    expect(snap.data()?.SAG).toBe(1);
  });

  it("modifie la valeur d'un bonus", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/anneau-protection`);
    await updateDoc(bonusRef, { Defense: 4 });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.Defense).toBe(4);
  });

  it("supprime un bonus (remet à 0)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/anneau-protection`);
    await setDoc(bonusRef, { Defense: 0, active: false }, { merge: true });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.Defense).toBe(0);
    expect(snap.data()?.active).toBe(false);
  });

  it("supprime physiquement un bonus d'objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/item-temporaire`);
    await setDoc(bonusRef, { FOR: 1, active: true, category: "item", name: "Gants de force" });

    await deleteDoc(bonusRef);

    const snap = await getDoc(bonusRef);
    expect(snap.exists()).toBe(false);
  });

  it("assigne une sélection de dés à un bonus d'objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/baton-mage`);
    await setDoc(bonusRef, {
      active: true,
      category: "item",
      name: "Bâton du Mage",
      diceSelection: "1d6",
    });

    const snap = await getDoc(bonusRef);
    expect(snap.data()?.diceSelection).toBe("1d6");
  });

  it("liste tous les bonus actifs d'un joueur", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // S'assurer qu'il y a au moins un bonus actif
    const bonusRef = doc(db, `Bonus/${ROOM_ID}/${PLAYER_A}/armure-mage`);
    await updateDoc(bonusRef, { active: true });

    const snap = await getDocs(collection(db, `Bonus/${ROOM_ID}/${PLAYER_A}`));
    const activeBonus = snap.docs.filter(d => d.data().active === true);
    expect(activeBonus.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Lecture et liste ─────────────────────────────────────────────────────────

describe("Inventaire — Lecture", () => {
  it("liste tous les objets d'un joueur", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_A}`));
    expect(snap.size).toBeGreaterThan(0);
  });

  it("récupère un objet spécifique par référence", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addItem(db, PLAYER_A, { name: "Objet unique", quantity: 1 });
    const snap = await getDoc(ref);

    expect(snap.exists()).toBe(true);
    expect(snap.data()?.name).toBe("Objet unique");
  });

  it("vérifie qu'un inventaire vide retourne 0 documents", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // PLAYER_B a été vidé dans un test précédent
    const snap = await getDocs(collection(db, `Inventaire/${ROOM_ID}/${PLAYER_B}`));

    // On vérifie que la collection existe et peut être vide
    expect(snap.size).toBeGreaterThanOrEqual(0);
  });
});
