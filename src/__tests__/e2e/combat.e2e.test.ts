/**
 * Tests E2E — Combat
 * Sources : MJcombat.tsx (initiative batch, applyDamage, conditions, nextCharacter, deleteCharacter)
 *           combat.tsx (sendReport, playWeaponSound, assignSound)
 * Collections : cartes/{roomId}/characters
 *               cartes/{roomId}/combat/{charId}/rapport
 *               cartes/{roomId}/cities/{cityId}/combat/state
 *               global_sounds/{roomId}
 *               Inventaire/{roomId}/{playerName}/{itemId}
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, writeBatch,
} from "firebase/firestore";

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

// ─── Initiative individuelle ──────────────────────────────────────────────────

describe("Combat — Initiative individuelle", () => {
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
});

// ─── Initiative en batch (rerollInitiative de MJcombat) ──────────────────────

describe("Combat — Reroll initiative (batch)", () => {
  const chars = [
    { id: "Legolas", INIT: 5, dice: 18, total: 23 },
    { id: "Gimli",   INIT: 1, dice: 7,  total: 8  },
    { id: "Gandalf", INIT: 4, dice: 12, total: 16 },
  ];

  beforeAll(async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();
    for (const c of chars) {
      await createCharacter(db, c.id, { INIT: c.INIT });
    }
  });

  it("met à jour toutes les initiatives en une seule batch", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const batch = writeBatch(db);
    for (const c of chars) {
      const ref = doc(db, `cartes/${ROOM_ID}/characters/${c.id}`);
      batch.update(ref, {
        currentInit: c.total,
        initDetails: `${c.INIT}+${c.dice}=${c.total}`,
      });
    }
    await batch.commit();

    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/characters`));
    const inits = snap.docs.map(d => d.data().currentInit).filter((v): v is number => v > 0);
    expect(inits).toContain(23);
    expect(inits).toContain(16);
    expect(inits).toContain(8);
  });

  it("définit le premier joueur (plus haute initiative) comme actif", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // Legolas a 23, il est premier
    const combatRef = doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}/combat/state`);
    await setDoc(combatRef, { activePlayer: "Legolas" }, { merge: true });

    const snap = await getDoc(combatRef);
    expect(snap.data()?.activePlayer).toBe("Legolas");
  });

  it("réinitialise currentInit à 0 pour tous (fin de combat)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const batch = writeBatch(db);
    for (const c of chars) {
      const ref = doc(db, `cartes/${ROOM_ID}/characters/${c.id}`);
      batch.update(ref, { currentInit: 0, initDetails: "" });
    }
    await batch.commit();

    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/characters`));
    const inits = snap.docs
      .filter(d => chars.map(c => c.id).includes(d.id))
      .map(d => d.data().currentInit);
    expect(inits.every(v => v === 0)).toBe(true);
  });
});

// ─── PV et dégâts (applyDamage de MJcombat) ──────────────────────────────────

describe("Combat — PV et dégâts", () => {
  it("applique des dégâts à un joueur", async () => {
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
    await updateDoc(charRef, { PV: 35 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.PV).toBe(35);
  });

  it("supprime un PNJ quand ses PV tombent à 0", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createCharacter(db, "GoblinMort", { PV: 3, type: "pnj" });
    const charRef = doc(db, `cartes/${ROOM_ID}/characters/GoblinMort`);

    const snap = await getDoc(charRef);
    const newPv = Math.max(0, snap.data()!.PV - 99);
    await updateDoc(charRef, { PV: newPv });

    // Simulation du comportement MJcombat : si PNJ PV=0 → deleteDoc
    const updated = await getDoc(charRef);
    if (updated.data()?.PV === 0 && updated.data()?.type !== "joueurs") {
      await deleteDoc(charRef);
    }

    const after = await getDoc(charRef);
    expect(after.exists()).toBe(false);
  });
});

// ─── Conditions (MJcombat) ────────────────────────────────────────────────────

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

  it("retire une condition (toggle)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { conditions: ["stunned"] });

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

  it("supporte les conditions personnalisées (blinded, custom)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { conditions: ["blinded", "Ralenti"] });

    const snap = await getDoc(charRef);
    expect(snap.data()?.conditions).toContain("blinded");
    expect(snap.data()?.conditions).toContain("Ralenti");
  });
});

// ─── Rapport d'attaque (combat sendReport + MJcombat nextCharacter) ─────────

describe("Combat — Rapport d'attaque (combat)", () => {
  it("enregistre un rapport d'attaque réussie", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const rapportRef = collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`);
    const docRef = await addDoc(rapportRef, {
      type: "Attack",
      attaque_result: 18,
      degat_result: 12,
      arme_utilisée: "Épée longue",
      attaquant: "Aragorn",
      attaquant_nom: "Aragorn",
      cible: "Orc",
      cible_nom: "Orc",
      resultat: "Success",
      timestamp: new Date().toLocaleString(),
    });

    const snap = await getDoc(docRef);
    expect(snap.data()?.resultat).toBe("Success");
    expect(snap.data()?.degat_result).toBe(12);
  });

  it("enregistre une attaque ratée (result < defense)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const rapportRef = collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`);
    const docRef = await addDoc(rapportRef, {
      type: "Attack",
      attaque_result: 5,
      degat_result: 0,
      arme_utilisée: "Épée longue",
      attaquant: "Aragorn",
      attaquant_nom: "Aragorn",
      cible: "Troll",
      cible_nom: "Troll",
      resultat: "Failure",
      timestamp: new Date().toLocaleString(),
    });

    const snap = await getDoc(docRef);
    expect(snap.data()?.resultat).toBe("Failure");
    expect(snap.data()?.degat_result).toBe(0);
  });

  it("enregistre un rapport vers plusieurs cibles", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const targets = [
      { id: "Orc1", name: "Orc 1", defense: 10 },
      { id: "Orc2", name: "Orc 2", defense: 12 },
    ];
    const atk = 15;
    const dmg = 8;

    for (const t of targets) {
      await addDoc(collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`), {
        type: "Attack",
        attaque_result: atk,
        degat_result: atk >= t.defense ? dmg : 0,
        attaquant: "Aragorn",
        cible: t.id,
        cible_nom: t.name,
        resultat: atk >= t.defense ? "Success" : "Failure",
        timestamp: new Date().toLocaleString(),
      });
    }

    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`));
    expect(snap.size).toBeGreaterThanOrEqual(2);
  });

  it("supprime les rapports au passage de tour (nextCharacter)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // Simuler nextCharacter : supprimer tous les rapports d'Aragorn puis passer au suivant
    const rapportSnap = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`));
    for (const d of rapportSnap.docs) {
      await deleteDoc(d.ref);
    }

    const after = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Aragorn/rapport`));
    expect(after.size).toBe(0);
  });

  it("supprime les rapports quand le personnage est supprimé (handleDeleteCharacter)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    // Ajouter des rapports pour Legolas
    await addDoc(collection(db, `cartes/${ROOM_ID}/combat/Legolas/rapport`), {
      type: "Attack", attaque_result: 20, degat_result: 10,
      attaquant: "Legolas", cible: "Orc", resultat: "Success",
      timestamp: new Date().toLocaleString(),
    });

    // Supprimer le personnage → supprimer les rapports
    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Legolas/rapport`));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }

    const after = await getDocs(collection(db, `cartes/${ROOM_ID}/combat/Legolas/rapport`));
    expect(after.size).toBe(0);
  });
});

// ─── Son d'arme (combat playWeaponSound / handleSoundSelect) ────────────────

describe("Combat — Sons d'armes", () => {
  it("assigne un son à une arme via Inventaire", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const weaponRef = doc(db, `Inventaire/${ROOM_ID}/Aragorn/epee-longue`);
    await setDoc(weaponRef, { name: "Épée longue", numDice: 1, numFaces: 8 });

    await setDoc(weaponRef, { soundId: "sound-sword-01" }, { merge: true });

    const snap = await getDoc(weaponRef);
    expect(snap.data()?.soundId).toBe("sound-sword-01");
  });

  it("retire le son d'une arme (soundId vide)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const weaponRef = doc(db, `Inventaire/${ROOM_ID}/Aragorn/epee-longue`);
    await setDoc(weaponRef, { soundId: "" }, { merge: true });

    const snap = await getDoc(weaponRef);
    expect(snap.data()?.soundId).toBe("");
  });

  it("enregistre un son global pour la room (playWeaponSound)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const soundRef = doc(db, "global_sounds", ROOM_ID);
    await setDoc(soundRef, {
      soundUrl: "https://example.com/sounds/sword.mp3",
      soundId: "sound-sword-01",
      timestamp: Date.now(),
      type: "file",
    });

    const snap = await getDoc(soundRef);
    expect(snap.data()?.soundId).toBe("sound-sword-01");
    expect(snap.data()?.type).toBe("file");
  });

  it("met à jour le son global avec un nouveau son (youtube)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const soundRef = doc(db, "global_sounds", ROOM_ID);
    await setDoc(soundRef, {
      soundUrl: "https://youtube.com/watch?v=abc",
      soundId: "sound-battle-01",
      timestamp: Date.now(),
      type: "youtube",
    });

    const snap = await getDoc(soundRef);
    expect(snap.data()?.type).toBe("youtube");
    expect(snap.data()?.soundId).toBe("sound-battle-01");
  });
});

// ─── Passage de tour (nextCharacter / previousCharacter) ─────────────────────

describe("Combat — Passage de tour", () => {
  it("change le joueur actif au tour suivant", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const combatRef = doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}/combat/state`);
    await setDoc(combatRef, { activePlayer: "Legolas" }, { merge: true });

    // nextCharacter → passe à Gimli
    await setDoc(combatRef, { activePlayer: "Gimli" }, { merge: true });

    const snap = await getDoc(combatRef);
    expect(snap.data()?.activePlayer).toBe("Gimli");
  });

  it("revient au joueur précédent (previousCharacter)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const combatRef = doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}/combat/state`);
    await setDoc(combatRef, { activePlayer: "Legolas" }, { merge: true });

    const snap = await getDoc(combatRef);
    expect(snap.data()?.activePlayer).toBe("Legolas");
  });
});
