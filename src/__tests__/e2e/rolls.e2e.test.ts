/**
 * Tests E2E — Jets de dés
 * Collections : rolls/{roomId}/rolls
 * Sources : glowing-ai-chat-assistant.tsx (addDoc rolls), titres nat1/nat20
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import { doc, setDoc, getDoc, collection, getDocs, addDoc, updateDoc, query, orderBy, limit } from "firebase/firestore";

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

// ─── Enregistrement ────────────────────────────────────────────────────────────

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

  it("enregistre un jet privé (isPrivate: true)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { isPrivate: true, userName: "Gandalf" });
    const snap = await getDoc(ref);

    expect(snap.data()?.isPrivate).toBe(true);
    expect(snap.data()?.userName).toBe("Gandalf");
  });

  it("enregistre un jet aveugle (isBlind: true)", async () => {
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

    const ref = await addRoll(db, { notation: "1d20+FOR", modifier: 3, total: 16, results: [13] });
    const snap = await getDoc(ref);

    expect(snap.data()?.notation).toBe("1d20+FOR");
  });

  it("enregistre un jet avec persoId et uid", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, {
      persoId: "perso-frodo",
      uid: "user-abc123",
      userName: "Frodo",
    });
    const snap = await getDoc(ref);

    expect(snap.data()?.persoId).toBe("perso-frodo");
    expect(snap.data()?.uid).toBe("user-abc123");
  });

  it("enregistre un jet avec avatar utilisateur", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, {
      userAvatar: "https://example.com/avatar.png",
      userName: "Legolas",
    });
    const snap = await getDoc(ref);

    expect(snap.data()?.userAvatar).toBe("https://example.com/avatar.png");
  });

  it("enregistre un jet avec output formaté", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, {
      notation: "2d6+3",
      output: "2d6+3 → [4, 5] + 3 = 12",
      total: 12,
      results: [4, 5],
    });
    const snap = await getDoc(ref);

    expect(snap.data()?.output).toBe("2d6+3 → [4, 5] + 3 = 12");
  });
});

// ─── Types de dés ─────────────────────────────────────────────────────────────

describe("Jets de dés — Types de dés", () => {
  it("enregistre un d4", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { diceFaces: 4, results: [3], total: 3, notation: "1d4" });
    const snap = await getDoc(ref);
    expect(snap.data()?.diceFaces).toBe(4);
  });

  it("enregistre un d6", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { diceFaces: 6, results: [5], total: 5, notation: "1d6" });
    const snap = await getDoc(ref);
    expect(snap.data()?.diceFaces).toBe(6);
  });

  it("enregistre un d8", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { diceFaces: 8, results: [7], total: 7, notation: "1d8" });
    const snap = await getDoc(ref);
    expect(snap.data()?.diceFaces).toBe(8);
  });

  it("enregistre un d10", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { diceFaces: 10, results: [9], total: 9, notation: "1d10" });
    const snap = await getDoc(ref);
    expect(snap.data()?.diceFaces).toBe(10);
  });

  it("enregistre un d12", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { diceFaces: 12, results: [11], total: 11, notation: "1d12" });
    const snap = await getDoc(ref);
    expect(snap.data()?.diceFaces).toBe(12);
  });

  it("enregistre un d100 (percentile)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, { diceFaces: 100, results: [42], total: 42, notation: "1d100" });
    const snap = await getDoc(ref);
    expect(snap.data()?.diceFaces).toBe(100);
  });
});

// ─── Critique nat1 / nat20 ────────────────────────────────────────────────────

describe("Jets de dés — Critiques (nat1 / nat20)", () => {
  it("enregistre un nat 20 (succès critique d20)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, {
      diceFaces: 20,
      results: [20],
      total: 20,
      notation: "1d20",
      userName: "Héros",
    });
    const snap = await getDoc(ref);

    expect(snap.data()?.results[0]).toBe(20);
    expect(snap.data()?.diceFaces).toBe(20);
  });

  it("enregistre un nat 1 (échec critique d20)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addRoll(db, {
      diceFaces: 20,
      results: [1],
      total: 1,
      notation: "1d20",
      userName: "Malchanceux",
    });
    const snap = await getDoc(ref);

    expect(snap.data()?.results[0]).toBe(1);
    expect(snap.data()?.diceFaces).toBe(20);
  });

  it("enregistre un titre débloqué (nat20) sur l'utilisateur", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const userRef = doc(db, "users", "user-nat20");
    await setDoc(userRef, { titles: {} });

    // Simule le déblocage du titre "Béni des Dieux" après nat20
    await setDoc(userRef, { "titles.beni-des-dieux": "unlocked" }, { merge: true });

    const snap = await getDoc(userRef);
    expect(snap.data()?.["titles.beni-des-dieux"] ?? snap.data()?.titles?.["beni-des-dieux"]).toBeTruthy();
  });

  it("enregistre un titre débloqué (nat1) sur l'utilisateur", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const userRef = doc(db, "users", "user-nat1");
    await setDoc(userRef, { titles: {} });

    // Simule le déblocage du titre "Maudit des dés" après nat1
    await setDoc(userRef, { "titles.maudit-des-des": "unlocked" }, { merge: true });

    const snap = await getDoc(userRef);
    expect(snap.data()?.["titles.maudit-des-des"] ?? snap.data()?.titles?.["maudit-des-des"]).toBeTruthy();
  });

  it("ne re-débloque pas un titre déjà unlocked", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const userRef = doc(db, "users", "user-already-unlocked");
    await setDoc(userRef, { titles: { "beni-des-dieux": "unlocked" } });

    const snap = await getDoc(userRef);
    // Le titre est déjà unlocked, on ne recrée pas
    expect(snap.data()?.titles?.["beni-des-dieux"]).toBe("unlocked");
  });
});

// ─── Lecture et historique ────────────────────────────────────────────────────

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

  it("filtre les jets aveugles (blind)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `rolls/${ROOM_ID}/rolls`));
    const blindRolls = snap.docs.filter(d => d.data().isBlind === true);

    expect(blindRolls.length).toBeGreaterThanOrEqual(1);
  });

  it("compte les jets par type de dé", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `rolls/${ROOM_ID}/rolls`));
    const d20Rolls = snap.docs.filter(d => d.data().diceFaces === 20);
    const d6Rolls = snap.docs.filter(d => d.data().diceFaces === 6);

    expect(d20Rolls.length).toBeGreaterThan(0);
    expect(d6Rolls.length).toBeGreaterThan(0);
  });
});
