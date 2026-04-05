/**
 * Tests E2E — Carte (map/page.tsx)
 * Collections : cartes/{roomId}/characters (tokens)
 *               cartes/{roomId}/cities/{cityId}
 *               cartes/{roomId}/objects/{objectId}
 *               cartes/{roomId}/lights/{lightId}
 *               cartes/{roomId}/measurements/{measurementId}
 *               cartes/{roomId}/musicZones/{zoneId}
 *               cartes/{roomId}/settings/general
 *               cartes/{roomId}/settings/layers
 *               cartes/{roomId}/fond/fond1
 *               cartes/{roomId}/fog/fogData
 *               cartes/{roomId} (root — currentMusic)
 */

import { getTestEnv, cleanupTestEnv } from "./setup";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc,
} from "firebase/firestore";

const ROOM_ID = "test-map-room";
const CITY_ID  = "city-01";

beforeAll(async () => {
  const env = await getTestEnv();
  await env.clearFirestore();

  // Le document racine doit exister pour permettre updateDoc dessus
  const db = env.unauthenticatedContext().firestore();
  await setDoc(doc(db, `cartes/${ROOM_ID}`), { name: ROOM_ID });
});

afterAll(async () => {
  await cleanupTestEnv();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createToken(db: any, id: string, overrides = {}) {
  await setDoc(doc(db, `cartes/${ROOM_ID}/characters/${id}`), {
    Nomperso: id,
    type: "pnj",
    x: 100,
    y: 200,
    scale: 1,
    shape: "circle",
    visibility: "visible",
    conditions: [],
    cityId: CITY_ID,
    ...overrides,
  });
}

// ─── Scènes / Villes ──────────────────────────────────────────────────────────

describe("Carte — Scènes (cities)", () => {
  it("crée une scène", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`), {
      name: "Village de Hobbitebourg",
      description: "Un paisible village de hobbits",
      visibleToPlayers: true,
      backgroundUrl: "",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.name).toBe("Village de Hobbitebourg");
  });

  it("met à jour le fond de carte d'une scène (backgroundUrl)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`), {
      backgroundUrl: "https://example.com/map-village.jpg",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`));
    expect(snap.data()?.backgroundUrl).toBe("https://example.com/map-village.jpg");
  });

  it("met à jour le fond global (fond/fond1)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/fond/fond1`), {
      url: "https://example.com/global-bg.jpg",
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/fond/fond1`));
    expect(snap.data()?.url).toBe("https://example.com/global-bg.jpg");
  });

  it("change la scène active (settings/general currentCityId)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/settings/general`), {
      currentCityId: CITY_ID,
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/settings/general`));
    expect(snap.data()?.currentCityId).toBe(CITY_ID);
  });

  it("définit les coordonnées de spawn d'une scène", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`), {
      spawnX: 500,
      spawnY: 300,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`));
    expect(snap.data()?.spawnX).toBe(500);
    expect(snap.data()?.spawnY).toBe(300);
  });

  it("cache une scène aux joueurs", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`), {
      visibleToPlayers: false,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/cities/${CITY_ID}`));
    expect(snap.data()?.visibleToPlayers).toBe(false);
  });
});

// ─── Tokens / Personnages sur la carte ───────────────────────────────────────

describe("Carte — Tokens", () => {
  it("place un token PNJ sur la carte", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createToken(db, "Orc1", { x: 300, y: 150 });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/characters/Orc1`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.x).toBe(300);
    expect(snap.data()?.y).toBe(150);
    expect(snap.data()?.cityId).toBe(CITY_ID);
  });

  it("déplace un token (mise à jour x/y)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createToken(db, "Aragorn", { type: "joueurs", x: 100, y: 100 });
    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);

    await updateDoc(charRef, { x: 450, y: 320 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.x).toBe(450);
    expect(snap.data()?.y).toBe(320);
  });

  it("change la taille (scale) d'un token", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { scale: 2 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.scale).toBe(2);
  });

  it("change la forme d'un token (circle → square)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { shape: "square" });

    const snap = await getDoc(charRef);
    expect(snap.data()?.shape).toBe("square");
  });

  it("fait pivoter un token (rotation)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, { rotation: 90 });

    const snap = await getDoc(charRef);
    expect(snap.data()?.rotation).toBe(90);
  });

  it("change la visibilité d'un token (gm_only)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Orc1`);
    await updateDoc(charRef, { visibility: "gm_only" });

    const snap = await getDoc(charRef);
    expect(snap.data()?.visibility).toBe("gm_only");
  });

  it("rend un token visible aux joueurs", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Orc1`);
    await updateDoc(charRef, { visibility: "visible" });

    const snap = await getDoc(charRef);
    expect(snap.data()?.visibility).toBe("visible");
  });

  it("définit la visibilité custom (visibleToPlayerIds)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Orc1`);
    await updateDoc(charRef, {
      visibility: "custom",
      visibleToPlayerIds: ["user-frodo", "user-sam"],
    });

    const snap = await getDoc(charRef);
    expect(snap.data()?.visibility).toBe("custom");
    expect(snap.data()?.visibleToPlayerIds).toContain("user-frodo");
  });

  it("téléporte un token via un portail (currentSceneId)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const charRef = doc(db, `cartes/${ROOM_ID}/characters/Aragorn`);
    await updateDoc(charRef, {
      currentSceneId: "city-02",
      x: 200,
      y: 200,
    });

    const snap = await getDoc(charRef);
    expect(snap.data()?.currentSceneId).toBe("city-02");
  });

  it("supprime un token de la carte", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await createToken(db, "TokenToDelete");
    const charRef = doc(db, `cartes/${ROOM_ID}/characters/TokenToDelete`);
    await deleteDoc(charRef);

    const snap = await getDoc(charRef);
    expect(snap.exists()).toBe(false);
  });

  it("liste tous les tokens d'une scène (cityId filter)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDocs(collection(db, `cartes/${ROOM_ID}/characters`));
    const cityTokens = snap.docs.filter(d => d.data().cityId === CITY_ID);
    expect(cityTokens.length).toBeGreaterThan(0);
  });
});

// ─── Objets de décor ──────────────────────────────────────────────────────────

describe("Carte — Objets (decors)", () => {
  let objectId: string;

  beforeAll(async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `cartes/${ROOM_ID}/objects`), {
      name: "Arbre ancien",
      type: "decors",
      x: 400,
      y: 250,
      width: 64,
      height: 64,
      rotation: 0,
      imageUrl: "https://example.com/tree.png",
      visible: true,
      isLocked: false,
      isBackground: false,
      cityId: CITY_ID,
    });
    objectId = ref.id;
  });

  it("place un objet de décor sur la carte", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.name).toBe("Arbre ancien");
    expect(snap.data()?.type).toBe("decors");
  });

  it("passe un objet en arrière-plan (isBackground)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`), {
      isBackground: true,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.data()?.isBackground).toBe(true);
  });

  it("fait pivoter un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`), {
      rotation: 45,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.data()?.rotation).toBe(45);
  });

  it("cache un objet (visibility: gm_only)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`), {
      visibility: "gm_only",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.data()?.visibility).toBe("gm_only");
  });

  it("verrouille un objet (isLocked)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`), {
      isLocked: true,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.data()?.isLocked).toBe(true);
  });

  it("renomme un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`), {
      name: "Grand chêne",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.data()?.name).toBe("Grand chêne");
  });

  it("ajoute une note à un objet", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`), {
      notes: "Ce chêne cache un passage secret.",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.data()?.notes).toBe("Ce chêne cache un passage secret.");
  });

  it("supprime un objet de la carte", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await deleteDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/objects/${objectId}`));
    expect(snap.exists()).toBe(false);
  });
});

// ─── Lumières ─────────────────────────────────────────────────────────────────

describe("Carte — Lumières", () => {
  let lightId: string;

  beforeAll(async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `cartes/${ROOM_ID}/lights`), {
      name: "Torche",
      x: 200,
      y: 300,
      radius: 5,
      visible: true,
      cityId: CITY_ID,
    });
    lightId = ref.id;
  });

  it("place une lumière sur la carte", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/lights/${lightId}`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.name).toBe("Torche");
    expect(snap.data()?.radius).toBe(5);
  });

  it("modifie le rayon d'une lumière", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/lights/${lightId}`), {
      radius: 10,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/lights/${lightId}`));
    expect(snap.data()?.radius).toBe(10);
  });

  it("cache une lumière", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/lights/${lightId}`), {
      visible: false,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/lights/${lightId}`));
    expect(snap.data()?.visible).toBe(false);
  });

  it("supprime une lumière", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await deleteDoc(doc(db, `cartes/${ROOM_ID}/lights/${lightId}`));

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/lights/${lightId}`));
    expect(snap.exists()).toBe(false);
  });
});

// ─── Mesures ──────────────────────────────────────────────────────────────────

describe("Carte — Mesures (measurements)", () => {
  let measureId: string;

  beforeAll(async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `cartes/${ROOM_ID}/measurements`), {
      coneAngle: 60,
      coneShape: "cone",
      coneMode: "degrees",
      fixedLength: null,
      coneWidth: null,
      cityId: CITY_ID,
      ownerId: "user-mj",
      timestamp: Date.now(),
      permanent: false,
    });
    measureId = ref.id;
  });

  it("crée une mesure (cône)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/measurements/${measureId}`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.coneAngle).toBe(60);
    expect(snap.data()?.coneShape).toBe("cone");
  });

  it("modifie l'angle du cône", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/measurements/${measureId}`), {
      coneAngle: 90,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/measurements/${measureId}`));
    expect(snap.data()?.coneAngle).toBe(90);
  });

  it("définit une longueur fixe", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/measurements/${measureId}`), {
      fixedLength: 30,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/measurements/${measureId}`));
    expect(snap.data()?.fixedLength).toBe(30);
  });

  it("rend une mesure permanente", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/measurements/${measureId}`), {
      permanent: true,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/measurements/${measureId}`));
    expect(snap.data()?.permanent).toBe(true);
  });

  it("supprime une mesure temporaire (auto-cleanup)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const tempRef = await addDoc(collection(db, `cartes/${ROOM_ID}/measurements`), {
      coneAngle: 45,
      coneShape: "line",
      permanent: false,
      timestamp: Date.now() - 10000, // vieille de 10s
      cityId: CITY_ID,
      ownerId: "user-mj",
    });

    await deleteDoc(tempRef);

    const snap = await getDoc(tempRef);
    expect(snap.exists()).toBe(false);
  });
});

// ─── Zones musicales ──────────────────────────────────────────────────────────

describe("Carte — Zones musicales", () => {
  let zoneId: string;

  beforeAll(async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const ref = await addDoc(collection(db, `cartes/${ROOM_ID}/musicZones`), {
      name: "Taverne",
      x: 600,
      y: 400,
      radius: 200,
      volume: 0.7,
      cityId: CITY_ID,
      url: null,
    });
    zoneId = ref.id;
  });

  it("crée une zone musicale", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.name).toBe("Taverne");
    expect(snap.data()?.radius).toBe(200);
  });

  it("renomme une zone musicale", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`), {
      name: "Grande Salle",
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`));
    expect(snap.data()?.name).toBe("Grande Salle");
  });

  it("modifie le volume d'une zone", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`), {
      volume: 0.5,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`));
    expect(snap.data()?.volume).toBe(0.5);
  });

  it("modifie le rayon d'une zone", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await updateDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`), {
      radius: 300,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`));
    expect(snap.data()?.radius).toBe(300);
  });

  it("lance une musique rapide (currentMusic sur root)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}`), {
      currentMusic: {
        url: "https://example.com/tavern.mp3",
        title: "Musique de taverne",
        volume: 0.8,
        loop: true,
        isPlaying: true,
        startTime: Date.now(),
      },
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}`));
    expect(snap.data()?.currentMusic?.title).toBe("Musique de taverne");
    expect(snap.data()?.currentMusic?.isPlaying).toBe(true);
  });

  it("supprime une zone musicale", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await deleteDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`));

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/musicZones/${zoneId}`));
    expect(snap.exists()).toBe(false);
  });
});

// ─── Paramètres globaux ───────────────────────────────────────────────────────

describe("Carte — Paramètres (settings)", () => {
  it("met à jour l'échelle globale des tokens (globalTokenScale)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/settings/general`), {
      globalTokenScale: 1.5,
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/settings/general`));
    expect(snap.data()?.globalTokenScale).toBe(1.5);
  });

  it("calibre les pixels par unité (pixelsPerUnit)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/settings/general`), {
      pixelsPerUnit: 70,
      unitName: "m",
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/settings/general`));
    expect(snap.data()?.pixelsPerUnit).toBe(70);
    expect(snap.data()?.unitName).toBe("m");
  });

  it("sauvegarde la visibilité des calques", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const layers = [
      { id: "tokens",  label: "Tokens",  isVisible: true,  order: 0 },
      { id: "decors",  label: "Décors",  isVisible: true,  order: 1 },
      { id: "fog",     label: "Brouillard", isVisible: false, order: 2 },
    ];

    await setDoc(doc(db, `cartes/${ROOM_ID}/settings/layers`), {
      layers,
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/settings/layers`));
    expect(snap.data()?.layers).toHaveLength(3);
    const fog = snap.data()?.layers.find((l: any) => l.id === "fog");
    expect(fog?.isVisible).toBe(false);
  });

  it("sauvegarde les calques d'une scène spécifique (layers_cityId)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/settings/layers_${CITY_ID}`), {
      layers: [
        { id: "tokens", label: "Tokens", isVisible: true, order: 0 },
      ],
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/settings/layers_${CITY_ID}`));
    expect(snap.data()?.layers[0].id).toBe("tokens");
  });
});

// ─── Brouillard de guerre ─────────────────────────────────────────────────────

describe("Carte — Brouillard de guerre (fog)", () => {
  it("initialise le brouillard (grille vide)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`), {
      grid: {},
      fullMapFog: false,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`));
    expect(snap.exists()).toBe(true);
    expect(snap.data()?.fullMapFog).toBe(false);
  });

  it("active le brouillard total", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`), {
      fullMapFog: true,
    }, { merge: true });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`));
    expect(snap.data()?.fullMapFog).toBe(true);
  });

  it("révèle des cellules spécifiques (grid)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    const grid: Record<string, boolean> = {
      "10_20": true,
      "11_20": true,
      "12_20": true,
    };

    await setDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`), {
      grid,
      fullMapFog: false,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`));
    expect(snap.data()?.grid["10_20"]).toBe(true);
    expect(snap.data()?.grid["11_20"]).toBe(true);
  });

  it("sauvegarde le brouillard d'une scène spécifique (fog_cityId)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/fog/fog_${CITY_ID}`), {
      grid: { "5_5": true, "5_6": true },
      fullMapFog: false,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/fog/fog_${CITY_ID}`));
    expect(snap.data()?.grid["5_5"]).toBe(true);
  });

  it("efface tout le brouillard (grille vide)", async () => {
    const env = await getTestEnv();
    const db = env.unauthenticatedContext().firestore();

    await setDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`), {
      grid: {},
      fullMapFog: false,
    });

    const snap = await getDoc(doc(db, `cartes/${ROOM_ID}/fog/fogData`));
    expect(Object.keys(snap.data()?.grid ?? {})).toHaveLength(0);
  });
});
