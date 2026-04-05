/**
 * Tests E2E — Règles de sécurité Firestore
 *
 * Modèle :
 *   users/{uid}.room_id  → room actuelle
 *   users/{uid}.perso    → "MJ" ou nom du personnage
 *   users/{uid}.persoId  → id du document characters (pour les joueurs)
 *
 * Restrictions joueur :
 *   - Ne peut éditer que son propre personnage (ownsCharacter)
 *   - Ne peut pas créer/supprimer de personnage
 *   - Pas d'accès en écriture : cities, fog, musicZones, portals, settings,
 *     objects, lights, measurements, fond
 */

import { getSecurityTestEnv, cleanupSecurityTestEnv } from "./setup";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from "firebase/firestore";

const ROOM_ID       = "room-aventure";
const OTHER_ROOM_ID = "room-autre";
const UID_MJ        = "uid-mj";
const UID_JOUEUR    = "uid-joueur";
const UID_JOUEUR2   = "uid-joueur2";   // autre joueur dans la même room
const UID_ETRANGER  = "uid-etranger";  // connecté mais dans une autre room
const PERSO_ID      = "perso-aragorn"; // charId appartenant à UID_JOUEUR
const PERSO2_ID     = "perso-legolas"; // charId appartenant à UID_JOUEUR2

beforeAll(async () => {
  const env = await getSecurityTestEnv();
  await env.clearFirestore();

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Salles
    await setDoc(doc(db, `Salle/${ROOM_ID}`),       { creatorId: UID_MJ, title: "Aventure" });
    await setDoc(doc(db, `Salle/${OTHER_ROOM_ID}`),  { creatorId: "uid-autre-mj", title: "Autre" });

    // Profils
    await setDoc(doc(db, `users/${UID_MJ}`),       { displayName: "MJ",      room_id: ROOM_ID,       perso: "MJ",      persoId: null });
    await setDoc(doc(db, `users/${UID_JOUEUR}`),    { displayName: "Aragorn", room_id: ROOM_ID,       perso: "Aragorn", persoId: PERSO_ID });
    await setDoc(doc(db, `users/${UID_JOUEUR2}`),   { displayName: "Legolas", room_id: ROOM_ID,       perso: "Legolas", persoId: PERSO2_ID });
    await setDoc(doc(db, `users/${UID_ETRANGER}`),  { displayName: "Spy",     room_id: OTHER_ROOM_ID, perso: "Gandalf", persoId: "perso-gandalf" });

    // Personnages
    await setDoc(doc(db, `cartes/${ROOM_ID}`), { name: ROOM_ID });
    await setDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO_ID}`),  { Nomperso: "Aragorn", type: "joueurs", PV: 30 });
    await setDoc(doc(db, `cartes/${ROOM_ID}/characters/${PERSO2_ID}`), { Nomperso: "Legolas", type: "joueurs", PV: 25 });
    await setDoc(doc(db, `cartes/${ROOM_ID}/characters/pnj-orc`),      { Nomperso: "Orc",     type: "pnj",    PV: 10 });

    // Données MJ
    await setDoc(doc(db, `cartes/${ROOM_ID}/cities/city-01`),     { name: "Village" });
    await setDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`),         { grid: {}, fullMapFog: false });
    await setDoc(doc(db, `cartes/${ROOM_ID}/settings/general`),   { globalTokenScale: 1 });
  });
});

afterAll(async () => {
  await cleanupSecurityTestEnv();
});

// ─── Non connecté ─────────────────────────────────────────────────────────────

describe("Sécurité — Non connecté", () => {
  it("ne peut pas lire un profil", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `users/${UID_MJ}`)));
  });

  it("ne peut pas lire le contenu d'une room", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `cartes/${ROOM_ID}/characters/${PERSO_ID}`)));
  });

  it("ne peut pas écrire dans une room", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `cartes/${ROOM_ID}/characters/intrus`), { Nomperso: "Intrus" }));
  });
});

// ─── Profil utilisateur ───────────────────────────────────────────────────────

describe("Sécurité — Profil utilisateur", () => {
  it("peut lire son propre profil", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `users/${UID_JOUEUR}`)));
  });

  it("peut lire le profil d'un autre utilisateur connecté", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `users/${UID_MJ}`)));
  });

  it("peut modifier son propre profil", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `users/${UID_JOUEUR}`), { bio: "Mis à jour" }));
  });

  it("ne peut pas modifier le profil d'un autre", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(updateDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `users/${UID_MJ}`), { bio: "Piraté" }));
  });

  it("ne peut pas supprimer le profil d'un autre", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(deleteDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `users/${UID_MJ}`)));
  });
});

// ─── MJ — accès complet à sa room ────────────────────────────────────────────

describe("Sécurité — MJ (sa room)", () => {
  it("peut lire un personnage", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${ROOM_ID}/characters/${PERSO_ID}`)));
  });

  it("peut créer un PNJ", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(setDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${ROOM_ID}/characters/pnj-new`), {
      Nomperso: "Nouveau PNJ", type: "pnj", PV: 5,
    }));
  });

  it("peut modifier n'importe quel personnage", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { PV: 10 }));
  });

  it("peut supprimer un PNJ", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(deleteDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${ROOM_ID}/characters/pnj-new`)));
  });

  it("peut modifier les cities", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${ROOM_ID}/cities/city-01`), { name: "Bourg" }));
  });

  it("peut modifier le fog", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${ROOM_ID}/fog/fogData`), { fullMapFog: true }));
  });

  it("peut modifier les settings", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${ROOM_ID}/settings/general`), { globalTokenScale: 2 }));
  });

  it("ne peut pas lire dans une room dont il n'est pas membre", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(getDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${OTHER_ROOM_ID}/characters/hero`)));
  });

  it("ne peut pas écrire dans une room dont il n'est pas membre", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(setDoc(doc(env.authenticatedContext(UID_MJ).firestore(), `cartes/${OTHER_ROOM_ID}/characters/spy`), { Nomperso: "Espion" }));
  });
});

// ─── Joueur — son propre personnage ───────────────────────────────────────────

describe("Sécurité — Joueur (son propre perso)", () => {
  it("peut lire son personnage", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/characters/${PERSO_ID}`)));
  });

  it("peut modifier son propre personnage", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(updateDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/characters/${PERSO_ID}`), { PV: 25 }));
  });

  it("peut lire le personnage d'un autre joueur", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/characters/${PERSO2_ID}`)));
  });

  it("ne peut pas modifier le personnage d'un autre joueur", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(updateDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/characters/${PERSO2_ID}`), { PV: 1 }));
  });

  it("ne peut pas créer un PNJ", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(setDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/characters/pnj-joueur`), {
      Nomperso: "PNJ illégitime", type: "pnj", PV: 5,
    }));
  });

  it("ne peut pas supprimer un personnage", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(deleteDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/characters/pnj-orc`)));
  });
});

// ─── Zones MJ uniquement : MJ peut écrire, joueur ne peut pas ────────────────

const mjOnlyCollections: Array<{ name: string; path: string; data: object }> = [
  { name: "cities",      path: `cartes/${ROOM_ID}/cities/city-01`,       data: { name: "Modifié" } },
  { name: "fog",         path: `cartes/${ROOM_ID}/fog/fogData`,           data: { fullMapFog: true } },
  { name: "settings",    path: `cartes/${ROOM_ID}/settings/general`,      data: { globalTokenScale: 99 } },
  { name: "fond",        path: `cartes/${ROOM_ID}/fond/fond1`,            data: { url: "hack.jpg" } },
];

const mjOnlyCreate: Array<{ name: string; col: string; data: object }> = [
  { name: "musicZones",   col: `cartes/${ROOM_ID}/musicZones`,   data: { name: "Zone", radius: 100 } },
  { name: "objects",      col: `cartes/${ROOM_ID}/objects`,       data: { name: "Objet" } },
  { name: "lights",       col: `cartes/${ROOM_ID}/lights`,        data: { name: "Torche", radius: 5 } },
  { name: "measurements", col: `cartes/${ROOM_ID}/measurements`,  data: { coneAngle: 45 } },
  { name: "portals",      col: `cartes/${ROOM_ID}/portals`,       data: { name: "Portail" } },
];

describe("Sécurité — Collections MJ uniquement (update)", () => {
  for (const col of mjOnlyCollections) {
    it(`MJ peut modifier ${col.name}`, async () => {
      const env = await getSecurityTestEnv();
      await assertSucceeds(setDoc(
        doc(env.authenticatedContext(UID_MJ).firestore(), col.path),
        col.data, { merge: true }
      ));
    });

    it(`Joueur ne peut pas modifier ${col.name}`, async () => {
      const env = await getSecurityTestEnv();
      await assertFails(setDoc(
        doc(env.authenticatedContext(UID_JOUEUR).firestore(), col.path),
        col.data, { merge: true }
      ));
    });
  }
});

describe("Sécurité — Collections MJ uniquement (create)", () => {
  for (const col of mjOnlyCreate) {
    it(`MJ peut créer dans ${col.name}`, async () => {
      const env = await getSecurityTestEnv();
      await assertSucceeds(addDoc(
        collection(env.authenticatedContext(UID_MJ).firestore(), col.col),
        col.data
      ));
    });

    it(`Joueur ne peut pas créer dans ${col.name}`, async () => {
      const env = await getSecurityTestEnv();
      await assertFails(addDoc(
        collection(env.authenticatedContext(UID_JOUEUR).firestore(), col.col),
        col.data
      ));
    });
  }
});

describe("Sécurité — Collections MJ uniquement (lecture joueur OK)", () => {
  it("joueur peut lire les cities", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/cities/city-01`)));
  });

  it("joueur peut lire le fog", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/fog/fogData`)));
  });

  it("joueur peut lire les settings", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(getDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `cartes/${ROOM_ID}/settings/general`)));
  });
});

// ─── Joueur — accès autorisé (inventaire, dés, historique) ───────────────────

describe("Sécurité — Joueur (accès autorisé)", () => {
  it("peut écrire dans l'inventaire", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(addDoc(collection(env.authenticatedContext(UID_JOUEUR).firestore(), `Inventaire/${ROOM_ID}/Aragorn`), {
      name: "Épée", quantity: 1,
    }));
  });

  it("peut écrire un jet de dés", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(addDoc(collection(env.authenticatedContext(UID_JOUEUR).firestore(), `rolls/${ROOM_ID}/rolls`), {
      userName: "Aragorn", total: 15, diceFaces: 20, timestamp: Date.now(),
    }));
  });

  it("peut écrire dans l'historique", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(addDoc(collection(env.authenticatedContext(UID_JOUEUR).firestore(), `Historique/${ROOM_ID}/events`), {
      type: "combat", message: "Aragorn attaque", timestamp: Date.now(),
    }));
  });

  it("peut écrire un bonus", async () => {
    const env = await getSecurityTestEnv();
    await assertSucceeds(setDoc(doc(env.authenticatedContext(UID_JOUEUR).firestore(), `Bonus/${ROOM_ID}/Aragorn/anneau`), {
      Defense: 2, active: true,
    }));
  });
});

// ─── Étranger (autre room) ────────────────────────────────────────────────────

describe("Sécurité — Étranger (autre room)", () => {
  it("ne peut pas lire le contenu de la room", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(getDoc(doc(env.authenticatedContext(UID_ETRANGER).firestore(), `cartes/${ROOM_ID}/characters/${PERSO_ID}`)));
  });

  it("ne peut pas écrire dans la room", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(setDoc(doc(env.authenticatedContext(UID_ETRANGER).firestore(), `cartes/${ROOM_ID}/characters/spy`), { Nomperso: "Espion" }));
  });

  it("ne peut pas lire l'inventaire", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(getDoc(doc(env.authenticatedContext(UID_ETRANGER).firestore(), `Inventaire/${ROOM_ID}/Aragorn/item-1`)));
  });

  it("ne peut pas lire les jets de dés", async () => {
    const env = await getSecurityTestEnv();
    await assertFails(getDoc(doc(env.authenticatedContext(UID_ETRANGER).firestore(), `rolls/${ROOM_ID}/rolls/some-roll`)));
  });
});
