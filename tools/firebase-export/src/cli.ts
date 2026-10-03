/**
 * Export de collections Firestore en NDJSON sans perte (une ligne par document).
 *
 *   pnpm --filter @vtt/firebase-export export -- --collection users --out ~/vtt-export
 *   pnpm --filter @vtt/firebase-export export -- --collection cartes --recursive --out ~/vtt-export
 *
 *   --collection  collection racine à exporter (répétable)
 *   --recursive   inclut toutes les sous-collections (cartes/{id}/characters…)
 *   --out         dossier de sortie, HORS du dépôt : les exports contiennent des
 *                 données personnelles
 *
 * Chaque ligne : {"path": "users/abc", "id": "abc", "data": {...}}, les types
 * Firestore étant balisés (voir normaliser.ts). Un fichier par collection racine.
 *
 * Identifiants : FIREBASE_SERVICE_ACCOUNT_KEY (JSON du compte de service) ou
 * GOOGLE_APPLICATION_CREDENTIALS, comme l'ancienne app.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import {
  FieldPath,
  getFirestore,
  type CollectionReference,
  type Firestore,
} from 'firebase-admin/firestore';
import { normaliser } from './normaliser.js';

const PAGE = 500;

const { values } = parseArgs({
  options: {
    collection: { type: 'string', multiple: true },
    recursive: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

if (!values.collection?.length || !values.out) {
  console.error(
    'usage : cli.js --collection <nom> [--collection <nom>…] [--recursive] --out <dossier>',
  );
  process.exit(2);
}

// Refus d'écrire dans le dépôt : un export versionné par erreur ferait fuiter des données
const depot = await realpath(resolve(import.meta.dirname, '../../..'));
const dansLeDepot = (chemin: string) => chemin === depot || chemin.startsWith(depot + sep);
function refuser(chemin: string): never {
  console.error(`Refus : ${chemin} est dans le dépôt. Choisissez un dossier hors de ${depot}.`);
  process.exit(2);
}
// Vérifié avant de créer le dossier, puis après résolution des liens symboliques
if (dansLeDepot(resolve(values.out))) refuser(resolve(values.out));
await mkdir(values.out, { recursive: true });
const sortie = await realpath(values.out);
if (dansLeDepot(sortie)) refuser(sortie);

const compteDeService = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
const app = compteDeService
  ? initializeApp({ credential: cert(JSON.parse(compteDeService) as ServiceAccount) })
  : initializeApp();
const db: Firestore = getFirestore(app);

async function exporterCollection(
  col: CollectionReference,
  ecrire: (ligne: string) => Promise<void>,
): Promise<number> {
  let total = 0;

  if (values.recursive) {
    // listDocuments() renvoie aussi les documents « fantômes » : parents qui
    // n'existent pas mais portent des sous-collections (ex. friendships/{uid},
    // requests/{uid} dans l'ancienne app). Une requête ne les verrait pas.
    for (const ref of await col.listDocuments()) {
      const snap = await ref.get();
      if (snap.exists) {
        await ecrire(JSON.stringify({ path: ref.path, id: ref.id, data: normaliser(snap.data()) }));
        total++;
      }
      for (const sous of await ref.listCollections()) {
        total += await exporterCollection(sous, ecrire);
      }
    }
    return total;
  }

  let dernier: string | undefined;
  // Pagination par identifiant : mémoire constante quelle que soit la taille
  for (;;) {
    let requete = col.orderBy(FieldPath.documentId()).limit(PAGE);
    if (dernier) requete = requete.startAfter(dernier);
    const page = await requete.get();
    if (page.empty) break;
    for (const doc of page.docs) {
      await ecrire(
        JSON.stringify({ path: doc.ref.path, id: doc.id, data: normaliser(doc.data()) }),
      );
      total++;
    }
    dernier = page.docs[page.docs.length - 1]!.id;
    if (page.size < PAGE) break;
  }
  return total;
}

for (const nom of values.collection) {
  const fichier = join(sortie, `${nom}.ndjson`);
  // Lecture et écriture réservées au propriétaire
  const flux = createWriteStream(fichier, { mode: 0o600 });
  const ecrire = (ligne: string) =>
    new Promise<void>((ok, ko) => {
      if (flux.write(ligne + '\n')) ok();
      else flux.once('drain', ok).once('error', ko);
    });
  const total = await exporterCollection(db.collection(nom), ecrire);
  await new Promise<void>((ok, ko) => flux.end(() => ok()).once('error', ko));
  console.log(`${nom} : ${total} documents -> ${fichier}`);
}
