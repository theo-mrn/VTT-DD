/**
 * Import des comptes Firebase dans identity.
 *
 *   node dist/import/cli.js --auth comptes.json --profils users.ndjson [--dry-run]
 *
 *   --auth     sortie de `firebase auth:export comptes.json --format=json`
 *   --profils  documents Firestore users/{uid} en NDJSON ({"id": uid, "data": {...}} par ligne),
 *              produits par tools/firebase-export
 *   --dry-run  affiche le rapport sans rien écrire
 *
 * Connexion : DATABASE_URL (rôle identity_svc). Rejouable sans risque.
 * Les fichiers d'export contiennent des hash et des e-mails : à garder hors du
 * dépôt et à supprimer après la bascule.
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createDb } from '../db/client.js';
import { FirebaseAuthExport, transformFirebaseUsers } from './firebase.js';
import { loadImportedAccounts } from './load.js';

const { values } = parseArgs({
  options: {
    auth: { type: 'string' },
    profils: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (!values.auth || !values.profils) {
  console.error('usage : cli.js --auth comptes.json --profils users.ndjson [--dry-run]');
  process.exit(2);
}

const auth = FirebaseAuthExport.parse(JSON.parse(await readFile(values.auth, 'utf8')));

const profils = new Map<string, Record<string, unknown>>();
const lignes = (await readFile(values.profils, 'utf8')).split('\n').filter((l) => l.trim());
for (const [i, ligne] of lignes.entries()) {
  const { id, data } = JSON.parse(ligne) as { id?: unknown; data?: unknown };
  if (typeof id !== 'string' || typeof data !== 'object' || data === null) {
    throw new Error(`${values.profils}:${i + 1} : {"id": string, "data": object} attendu`);
  }
  profils.set(id, data as Record<string, unknown>);
}

const { comptes, rapport } = transformFirebaseUsers(auth, profils);

// Uniquement des compteurs et des uid : jamais d'e-mail ni de hash dans la sortie
console.log(
  JSON.stringify(
    {
      transformation: {
        ...rapport,
        aReinitialiser: rapport.aReinitialiser.length,
        emailsInvalides: rapport.emailsInvalides.length,
        emailsEnDouble: rapport.emailsEnDouble.length,
        profilsSansCompte: rapport.profilsSansCompte.length,
      },
      uids: {
        aReinitialiser: rapport.aReinitialiser,
        emailsInvalides: rapport.emailsInvalides,
        emailsEnDouble: rapport.emailsEnDouble,
        profilsSansCompte: rapport.profilsSansCompte,
      },
    },
    null,
    2,
  ),
);

if (values['dry-run']) {
  console.log('--dry-run : rien n’a été écrit');
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant (rôle identity_svc)');
  process.exit(2);
}
const { db, pool } = createDb(url);
try {
  const chargement = await loadImportedAccounts(
    db,
    { correlationId: `import-firebase-${new Date().toISOString()}` },
    comptes,
  );
  console.log(JSON.stringify({ chargement }, null, 2));
  if (chargement.conflits.length) process.exitCode = 1;
} finally {
  await pool.end();
}
