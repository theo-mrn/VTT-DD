/**
 * Tests E2E — Historique & Notes
 * Collections : Historique/{roomId}/events, Notes, SharedNotes
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from "firebase/firestore";

const ROOM_ID = "test-histo-room";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();
});

afterAll(async () => {
  await cleanupTestEnv();
});

describe("Historique — Événements", () => {
  it("enregistre un événement d'inventaire", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `Historique/${ROOM_ID}/events`), {
      type: "inventaire",
      message: "**Aragorn** a reçu **1x [Épée longue]**",
      characterName: "Aragorn",
      timestamp: Date.now(),
    });

    const snap = await getDoc(ref);
    expect(snap.data()?.type).toBe("inventaire");
    expect(snap.data()?.characterName).toBe("Aragorn");
  });

  it("enregistre un événement de combat", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `Historique/${ROOM_ID}/events`), {
      type: "combat",
      message: "**Aragorn** a infligé **12 dégâts** à **Orc**",
      characterName: "Aragorn",
      timestamp: Date.now(),
    });

    const snap = await getDoc(ref);
    expect(snap.data()?.type).toBe("combat");
  });

  it("liste tous les événements d'une room", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `Historique/${ROOM_ID}/events`));
    expect(snap.size).toBeGreaterThanOrEqual(2);
  });
});

describe("Notes — Privées et partagées", () => {
  it("crée une note privée", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `Notes/${ROOM_ID}/perso-1`), {
      content: "Méfie-toi du traître.",
      createdAt: Date.now(),
    });

    const snap = await getDoc(ref);
    expect(snap.data()?.content).toBe("Méfie-toi du traître.");
  });

  it("crée une note partagée", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `SharedNotes/${ROOM_ID}/notes`), {
      content: "Le roi est revenu.",
      author: "Aragorn",
      createdAt: Date.now(),
    });

    const snap = await getDoc(ref);
    expect(snap.data()?.content).toBe("Le roi est revenu.");
    expect(snap.data()?.author).toBe("Aragorn");
  });

  it("modifie une note existante", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `Notes/${ROOM_ID}/perso-1`), {
      content: "Brouillon initial",
      createdAt: Date.now(),
    });

    await updateDoc(ref, { content: "Note finale mise à jour" });

    const snap = await getDoc(ref);
    expect(snap.data()?.content).toBe("Note finale mise à jour");
  });

  it("supprime une note", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `Notes/${ROOM_ID}/perso-1`), {
      content: "À supprimer",
      createdAt: Date.now(),
    });

    await deleteDoc(ref);

    const snap = await getDoc(ref);
    expect(snap.exists()).toBe(false);
  });
});
