/**
 * Tests E2E — Jets de dés
 * Collections : rolls/{roomId}/rolls
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import { doc, setDoc, getDoc, collection, getDocs, addDoc, query, orderBy, limit } from "firebase/firestore";

const ROOM_ID = "test-rolls-room";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();
});

afterAll(async () => {
  await cleanupTestEnv();
});

async function addRoll(db: any, overrides = {}) {
  return addDoc(collection(db, `rolls/${ROOM_ID}/rolls`), {
    userName: "Aragorn",
    diceCount: 1,
    diceFaces: 20,
    modifier: 3,
    results: [15],
    total: 18,
    notation: "1d20+3",
    isPrivate: false,
    isBlind: false,
    timestamp: Date.now(),
    ...overrides,
  });
}

describe("Jets de dés — Enregistrement", () => {
  it("enregistre un jet de dé public", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db);
    const snap = await getDoc(ref);

    expect(snap.data()?.total).toBe(18);
    expect(snap.data()?.isPrivate).toBe(false);
    expect(snap.data()?.notation).toBe("1d20+3");
  });

  it("enregistre un jet privé", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { isPrivate: true, userName: "Gandalf" });
    const snap = await getDoc(ref);

    expect(snap.data()?.isPrivate).toBe(true);
    expect(snap.data()?.userName).toBe("Gandalf");
  });

  it("enregistre un jet aveugle (blind)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { isBlind: true, total: 7, results: [7] });
    const snap = await getDoc(ref);

    expect(snap.data()?.isBlind).toBe(true);
  });

  it("enregistre un jet multi-dés (2d6)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, {
      diceCount: 2,
      diceFaces: 6,
      modifier: 0,
      results: [3, 5],
      total: 8,
      notation: "2d6",
    });
    const snap = await getDoc(ref);

    expect(snap.data()?.results).toHaveLength(2);
    expect(snap.data()?.total).toBe(8);
  });

  it("enregistre un jet avec notation de stat (1d20+FOR)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, {
      notation: "1d20+FOR",
      modifier: 3,
      total: 16,
      results: [13],
    });
    const snap = await getDoc(ref);

    expect(snap.data()?.notation).toBe("1d20+FOR");
  });
});

describe("Jets de dés — Lecture et historique", () => {
  it("récupère les 50 derniers jets triés par timestamp", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const q = query(
      collection(db, `rolls/${ROOM_ID}/rolls`),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const snap = await getDocs(q);
    expect(snap.size).toBeGreaterThan(0);

    // Vérifier que les timestamps sont bien décroissants
    const timestamps = snap.docs.map(d => d.data().timestamp as number);
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
    }
  });

  it("filtre les jets publics vs privés", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `rolls/${ROOM_ID}/rolls`));
    const publicRolls = snap.docs.filter(d => !d.data().isPrivate);
    const privateRolls = snap.docs.filter(d => d.data().isPrivate);

    expect(publicRolls.length).toBeGreaterThan(0);
    expect(privateRolls.length).toBeGreaterThan(0);
  });

  it("identifie les jets d'un joueur spécifique", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `rolls/${ROOM_ID}/rolls`));
    const gandalfRolls = snap.docs.filter(d => d.data().userName === "Gandalf");

    expect(gandalfRolls.length).toBeGreaterThanOrEqual(1);
  });
});
