/**
 * Nettoyage one-shot des bonus d'objet orphelins/vidés d'une salle.
 *
 * Avant correction de inventaire.tsx (handleDeleteItem / handleConsumeItem / handleGiveItem /
 * handleDeleteBonus), deux bugs laissaient des documents Bonus/{roomId}/{Nomperso}/{itemId} morts
 * en base (même ID que l'item, cf handleAddBonus) :
 *   1. supprimer/consommer/donner un item ne supprimait jamais son doc bonus associé (orphelin :
 *      l'item n'existe plus dans Inventaire/{roomId}/{Nomperso}, le bonus reste actif) ;
 *   2. supprimer le dernier stat non-nul d'un bonus le remettait à {stat: 0} au lieu de supprimer le
 *      doc (vidé : l'item existe toujours, mais le bonus n'a plus aucun stat non-nul — la modale
 *      "Gérer les bonus" ne montre alors plus rien à supprimer, cf widget "Effets actifs" qui lui
 *      continue de l'afficher car il lit Bonus/... sans filtrer sur un stat non-nul).
 * Ce script répare les deux cas déjà créés par ces bugs (tous deux corrigés dans le code, donc aucun
 * nouveau cas ne devrait apparaître après coup).
 *
 * Pour chaque personnage de la salle (cartes/{roomId}/characters, champ Nomperso), pour chaque bonus
 * de catégorie "Inventaire" dans Bonus/{roomId}/{Nomperso} :
 *   - orphelin : aucun item avec le même ID dans Inventaire/{roomId}/{Nomperso} → supprimé
 *   - vidé : l'item existe, mais aucun champ numérique non-nul autre que active/category/name/id
 *     (pas de dépendance à un bundle précis : n'importe quel champ numérique non-nul est considéré
 *     comme un stat de bonus légitime) → supprimé
 * Les bonus de catégorie "Competence" (liés aux compétences, pas à un item d'inventaire) ne sont
 * jamais touchés.
 *
 * Credentials : FIREBASE_SERVICE_ACCOUNT_KEY chargé automatiquement depuis .env / .env.local
 * (comme cleanup-group-entities.mjs) — rien à passer à la main.
 *
 * Usage :
 *   node scripts/cleanup-orphan-item-bonuses.mjs <roomId> [--dry-run]
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const file of ['.env', '.env.local']) {
  const envPath = resolve(ROOT, file);
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] = process.env[key] ?? val;
  }
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const roomId = args.find((a) => !a.startsWith('--'));

if (!roomId) {
  console.error('Usage : node scripts/cleanup-orphan-item-bonuses.mjs <roomId> [--dry-run]');
  process.exit(1);
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const app = initializeApp(serviceAccount
  ? { credential: cert(JSON.parse(serviceAccount)) }
  : { credential: applicationDefault() });
const db = getFirestore(app);

const charactersSnap = await db.collection(`cartes/${roomId}/characters`).get();
console.log(`${charactersSnap.size} personnage(s) dans la salle ${roomId}`);

// Champs de métadonnées d'un doc Bonus (jamais un stat de personnage) — tout le reste est traité
// comme un champ de stat générique, peu importe le bundle actif.
const META_FIELDS = new Set(['active', 'category', 'name', 'id']);
const hasNonZeroStat = (data) =>
  Object.entries(data).some(([key, value]) => !META_FIELDS.has(key) && typeof value === 'number' && value !== 0);

const toDelete = [];
for (const charDoc of charactersSnap.docs) {
  const nomperso = charDoc.data().Nomperso;
  if (!nomperso) continue;

  const [bonusSnap, inventorySnap] = await Promise.all([
    db.collection(`Bonus/${roomId}/${nomperso}`).get(),
    db.collection(`Inventaire/${roomId}/${nomperso}`).get(),
  ]);
  const inventoryIds = new Set(inventorySnap.docs.map((d) => d.id));

  for (const bonusDoc of bonusSnap.docs) {
    const data = bonusDoc.data();
    if (data.category !== 'Inventaire') continue; // jamais toucher aux bonus de compétence
    const name = data.name ?? bonusDoc.id;
    if (!inventoryIds.has(bonusDoc.id)) {
      toDelete.push({ nomperso, id: bonusDoc.id, name, reason: 'orphelin (item supprimé)' });
    } else if (!hasNonZeroStat(data)) {
      toDelete.push({ nomperso, id: bonusDoc.id, name, reason: 'vidé (aucun stat non-nul)' });
    }
  }
}

if (toDelete.length === 0) {
  console.log('Rien à supprimer — aucun bonus orphelin/vidé trouvé.');
  process.exit(0);
}

console.log(`${toDelete.length} bonus à nettoyer :`);
for (const d of toDelete) console.log(`  − ${d.nomperso} : ${d.name} [${d.id}] — ${d.reason}`);

if (DRY_RUN) {
  console.log('(dry-run : aucune écriture)');
  process.exit(0);
}

for (let i = 0; i < toDelete.length; i += 500) {
  const batch = db.batch();
  for (const d of toDelete.slice(i, i + 500)) {
    batch.delete(db.doc(`Bonus/${roomId}/${d.nomperso}/${d.id}`));
  }
  await batch.commit();
}
console.log('✓ Nettoyage terminé');
