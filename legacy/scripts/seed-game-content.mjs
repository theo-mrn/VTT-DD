/**
 * Seed one-shot du contenu de jeu D&D Classique : public/tabs/*.json → Firestore.
 *
 * Écrit :
 *   gameSystems/dnd-classic                    — doc marqueur { ownerId:'system', visibility:'public',
 *                                                races, profiles, rules } (contenu NARRATIF superposé
 *                                                au module builtin par useGameSystem, jamais les stats)
 *   gameSystems/dnd-classic/content/{id}       — voies (kind:'path'), bestiaire (chunks par catégorie
 *                                                + index), équipement (1 doc/catégorie), descriptions
 *                                                d'objets. Cf src/modules/game-content/types.ts.
 *
 * Idempotent : ids déterministes + set() → relançable sans doublon. Les JSON de public/tabs ne sont
 * plus jamais fetchés à l'exécution une fois toutes les phases de migration terminées — ils deviennent
 * les données de seed de ce script.
 *
 * Usage :
 *   FIREBASE_SERVICE_ACCOUNT_KEY='{"project_id":...}' node scripts/seed-game-content.mjs
 *   # ou GOOGLE_APPLICATION_CREDENTIALS=/chemin/sa.json node scripts/seed-game-content.mjs
 *   # option : --dry-run pour afficher ce qui serait écrit sans toucher Firestore
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TABS = resolve(__dirname, '..', 'public', 'tabs');
const DRY_RUN = process.argv.includes('--dry-run');
const SYSTEM_ID = 'dnd-classic';

// Ces listes décrivent le CORPUS LEGACY de public/tabs (elles disparaissent du code runtime — seul ce
// script de conversion one-shot les connaît encore). Mêmes listes que l'ancien CompetencesContext.
const CLASS_NAMES = ['Barbare', 'Barde', 'Chevalier', 'Druide', 'Ensorceleur', 'Forgesort', 'Guerrier', 'Invocateur', 'Magicien', 'Moine', 'Necromancien', 'Pretre', 'Psionique', 'Rodeur', 'Samourai', 'Voleur'];
const RACE_VOIE_NAMES = ['Ame-forgee', 'Drakonide', 'Elfe', 'Elfesylvain', 'Elfenoir', 'Halfelin', 'Humain', 'Minotaure', 'Ogre', 'Orque', 'Nain'];
const PRESTIGE_FILE_COUNTS = { arquebusier: 3, barbare: 2, barde: 3, chevalier: 3, druide: 2, ensorceleur: 2, forgesort: 3, guerrier: 2, moine: 3, necromancien: 2, pretre: 3, rodeur: 3, voleur: 3 };

// Doit rester ALIGNÉ avec resolvePathDocId (src/modules/game-content/legacy.ts) : les personnages
// existants référencent 'Barbare1.json' et le runtime résout vers ces ids.
function slugId(name) {
  return name.trim().replace(/\.json$/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function readTabs(file) {
  const path = resolve(TABS, file);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** {Affichage1,rang1,type1,...,Voie} → PathDoc (rangs vides ignorés). */
function toPathDoc(json, { legacyFile, category, parentName }) {
  const ranks = [];
  for (let i = 1; i <= 8; i++) {
    const title = json[`Affichage${i}`];
    if (!title) continue;
    const rank = { title: String(title), description: String(json[`rang${i}`] ?? '') };
    if (json[`type${i}`]) rank.type = String(json[`type${i}`]);
    ranks.push(rank);
  }
  return {
    kind: 'path',
    name: String(json.Voie || legacyFile.replace(/\.json$/i, '')),
    legacyFile,
    category,
    parentName,
    ranks,
  };
}

function buildPaths() {
  const docs = new Map();
  for (const cls of CLASS_NAMES) {
    for (let i = 1; i <= 5; i++) {
      const file = `${cls}${i}.json`;
      const json = readTabs(file);
      if (json) docs.set(slugId(file), toPathDoc(json, { legacyFile: file, category: 'class', parentName: cls }));
    }
  }
  for (const race of RACE_VOIE_NAMES) {
    const file = `${race}.json`;
    const json = readTabs(file);
    if (json) docs.set(slugId(file), toPathDoc(json, { legacyFile: file, category: 'race', parentName: race }));
  }
  for (const [cls, count] of Object.entries(PRESTIGE_FILE_COUNTS)) {
    for (let i = 1; i <= count; i++) {
      const file = `prestige_${cls}${i}.json`;
      const json = readTabs(file);
      if (json) docs.set(slugId(file), toPathDoc(json, { legacyFile: file, category: 'prestige', parentName: capitalize(cls) }));
    }
  }
  return docs;
}

/** capacites.json[raceKey] {capacite1: 'Titre : texte'} → RacialAbility[] (label = avant le 1er ':'). */
function toRacialAbilities(raceKey, capacites) {
  if (!capacites) return [];
  return Object.entries(capacites)
    .filter(([k]) => k.startsWith('capacite'))
    .map(([k, text], index) => {
      const str = String(text);
      const colon = str.indexOf(':');
      const label = colon > 0 && colon < 80 ? str.slice(0, colon).trim() : `Capacité ${index + 1}`;
      const description = colon > 0 && colon < 80 ? str.slice(colon + 1).trim() : str;
      return { id: `${raceKey}-${k}`, label, description };
    });
}

function buildSystemDoc() {
  const raceJson = readTabs('race.json') ?? {};
  const capacitesJson = readTabs('capacites.json') ?? {};
  const profileJson = readTabs('profile.json') ?? {};
  const rulesJson = readTabs('Rules.json') ?? { rules: [] };

  const races = Object.entries(raceJson).map(([key, r]) => {
    const race = {
      id: key,
      label: capitalize(key.replace(/_/g, ' ')),
      modifiers: r.modificateurs ?? {},
      abilities: toRacialAbilities(key, capacitesJson[key]),
    };
    if (r.description) race.description = r.description;
    if (r.image) race.image = r.image;
    if (r.tailleMoyenne != null) race.avgHeight = r.tailleMoyenne;
    if (r.poidsMoyen != null) race.avgWeight = r.poidsMoyen;
    return race;
  });

  const profiles = Object.entries(profileJson).map(([key, p]) => {
    const profile = { id: key, label: capitalize(key) };
    if (p.description) profile.description = p.description;
    if (p.image) profile.image = p.image;
    if (p.hitDie) profile.hitDie = p.hitDie;
    return profile;
  });

  const rules = (rulesJson.rules ?? []).map((r) => ({ title: String(r.title ?? ''), description: String(r.description ?? '') }));

  return { systemId: SYSTEM_ID, ownerId: 'system', visibility: 'public', races, profiles, rules };
}

const MAX_CHUNK_BYTES = 700_000;

function buildBestiary() {
  const bestiaire = readTabs('bestiairy.json') ?? {};
  const byCategory = new Map();
  for (const [key, creature] of Object.entries(bestiaire)) {
    const category = String(creature.Category ?? 'divers');
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push([key, creature]);
  }

  const docs = new Map();
  const index = [];
  for (const [category, entries] of byCategory) {
    // Split en chunks < MAX_CHUNK_BYTES sérialisés (garde-fou : le bestiaire actuel tient largement
    // en un chunk par catégorie, mais un doc Firestore est limité à 1MB).
    let chunkIndex = 0;
    let current = {};
    let currentBytes = 0;
    const flush = () => {
      if (Object.keys(current).length === 0) return;
      const chunkId = `bestiary-${slugId(category)}-${chunkIndex}`;
      docs.set(chunkId, { kind: 'bestiary', name: category, category, chunkIndex, entries: current });
      for (const entry of Object.values(current)) {
        index.push({ name: String(entry.Nom ?? ''), category, chunkId });
      }
      chunkIndex++;
      current = {};
      currentBytes = 0;
    };
    for (const [key, creature] of entries) {
      const bytes = JSON.stringify(creature).length;
      if (currentBytes + bytes > MAX_CHUNK_BYTES) flush();
      current[key] = creature;
      currentBytes += bytes;
    }
    flush();
  }
  docs.set('bestiary-index', { kind: 'bestiaryIndex', name: 'Index du bestiaire', creatures: index });
  return docs;
}

function buildEquipment() {
  const data = readTabs('data.json') ?? {};
  const docs = new Map();
  for (const [category, items] of Object.entries(data)) {
    if (!Array.isArray(items)) continue;
    docs.set(`equipment-${slugId(category)}`, { kind: 'equipment', name: category, category, items });
  }
  const itemsJson = readTabs('Items.json') ?? {};
  const entries = {};
  for (let i = 1; i <= 50; i++) {
    const name = itemsJson[`Affichage${i}`];
    if (!name) continue;
    entries[String(name)] = String(itemsJson[`rang${i}`] ?? '');
  }
  docs.set('item-descriptions', { kind: 'itemDescriptions', name: "Descriptions d'objets", entries });
  return docs;
}

async function main() {
  const systemDoc = buildSystemDoc();
  const contentDocs = new Map([...buildPaths(), ...buildBestiary(), ...buildEquipment()]);

  console.log(`Système : ${systemDoc.races.length} races, ${systemDoc.profiles.length} profils, ${systemDoc.rules.length} règles`);
  const byKind = {};
  for (const doc of contentDocs.values()) byKind[doc.kind] = (byKind[doc.kind] ?? 0) + 1;
  console.log(`Contenu : ${contentDocs.size} docs —`, byKind);

  if (DRY_RUN) {
    console.log('--dry-run : rien n\'a été écrit.');
    return;
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const app = initializeApp(serviceAccount
    ? { credential: cert(JSON.parse(serviceAccount)) }
    : { credential: applicationDefault() });
  const db = getFirestore(app);

  await db.doc(`gameSystems/${SYSTEM_ID}`).set(systemDoc);

  const entries = [...contentDocs.entries()];
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [id, doc] of entries.slice(i, i + 400)) {
      batch.set(db.doc(`gameSystems/${SYSTEM_ID}/content/${id}`), doc);
    }
    await batch.commit();
    console.log(`Batch ${Math.floor(i / 400) + 1} : ${Math.min(i + 400, entries.length)}/${entries.length} docs écrits.`);
  }

  console.log('Seed terminé.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
