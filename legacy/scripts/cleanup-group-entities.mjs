/**
 * Nettoyage one-shot des entités de groupe (vaisseaux...) dupliquées d'une salle.
 *
 * Chaque ré-import de bundle faisait un addDoc par entité sans dédoublonnage
 * (ExportImportPanel — corrigé depuis : les labels déjà présents sont sautés), ce qui a empilé des
 * dizaines de copies des mêmes vaisseaux dans Salle/{roomId}/groupEntities. Ce script :
 *   1. supprime les doublons de label (garde la PREMIÈRE occurrence ; les entités SANS label,
 *      créées à la main et pas encore nommées, ne sont jamais touchées) ;
 *   2. avec --purge-label "X" (répétable) : supprime TOUTES les occurrences de ce label (ex les
 *      anciens modèles obsolètes remplacés par la nouvelle liste officielle).
 *
 * Credentials : FIREBASE_SERVICE_ACCOUNT_KEY chargé automatiquement depuis .env / .env.local
 * (comme optimize-r2-images.mjs) — rien à passer à la main.
 *
 * Usage :
 *   node scripts/cleanup-group-entities.mjs <roomId> [--dry-run] [--purge-label "Label"]...
 *
 * Exemple (doublons + anciens modèles remplacés par la liste officielle) :
 *   node scripts/cleanup-group-entities.mjs 248399 \
 *     --purge-label "Wayfarer (Transport moyen)" \
 *     --purge-label "YT-1300 (Cargo léger)" \
 *     --purge-label "Firespray (Patrouilleur)"
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Charge .env puis .env.local (les variables déjà posées dans l'environnement gardent la priorité).
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
const roomId = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--purge-label');
const purgeLabels = new Set(
  args.flatMap((a, i) => (a === '--purge-label' && args[i + 1] ? [args[i + 1]] : []))
);

if (!roomId) {
  console.error('Usage : node scripts/cleanup-group-entities.mjs <roomId> [--dry-run] [--purge-label "Label"]...');
  process.exit(1);
}

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const app = initializeApp(serviceAccount
  ? { credential: cert(JSON.parse(serviceAccount)) }
  : { credential: applicationDefault() });
const db = getFirestore(app);

const snap = await db.collection(`Salle/${roomId}/groupEntities`).orderBy('__name__').get();
console.log(`${snap.size} entité(s) dans Salle/${roomId}/groupEntities`);

const seen = new Set();
const toDelete = [];
for (const docSnap of snap.docs) {
  const label = docSnap.data().label ?? '';
  if (!label) continue; // jamais toucher aux entités sans nom (créées à la main)
  if (purgeLabels.has(label)) {
    toDelete.push({ id: docSnap.id, label, reason: 'purge' });
  } else if (seen.has(label)) {
    toDelete.push({ id: docSnap.id, label, reason: 'doublon' });
  } else {
    seen.add(label);
  }
}

if (toDelete.length === 0) {
  console.log('Rien à supprimer.');
  process.exit(0);
}

const counts = {};
for (const d of toDelete) counts[`${d.label} [${d.reason}]`] = (counts[`${d.label} [${d.reason}]`] ?? 0) + 1;
for (const [label, n] of Object.entries(counts)) console.log(`  − ${n} × ${label}`);
console.log(`${toDelete.length} suppression(s), ${snap.size - toDelete.length} entité(s) conservée(s)`);

if (DRY_RUN) {
  console.log('(dry-run : aucune écriture)');
  process.exit(0);
}

// Suppression par lots de 500 (limite batch Firestore).
for (let i = 0; i < toDelete.length; i += 500) {
  const batch = db.batch();
  for (const d of toDelete.slice(i, i + 500)) {
    batch.delete(db.doc(`Salle/${roomId}/groupEntities/${d.id}`));
  }
  await batch.commit();
}
console.log('✓ Nettoyage terminé');
