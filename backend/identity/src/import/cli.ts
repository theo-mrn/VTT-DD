/**
 * Import des comptes Firebase dans identity.
 *
 *   node dist/import/cli.js --auth comptes.json --profils users.ndjson
 *     [--titres titles.ndjson] [--amis friendships.ndjson] [--demandes requests.ndjson]
 *     [--cles apiKeys.ndjson] [--discord discordLinks.ndjson] [--dry-run]
 *
 *   --auth      sortie de `firebase auth:export comptes.json --format=json`
 *   --profils   documents Firestore users/{uid} en NDJSON, produits par tools/firebase-export
 *   --titres    catalogue des titres (collection titles)
 *   --amis      friendships/{uid}/friends/{amiUid} (export --recursive)
 *   --demandes  requests/{uid}/received|sent/{uid} (export --recursive)
 *   --cles      clés d'API (collection apiKeys)
 *   --discord   liens du bot Discord (collection discordLinks) ; les comptes
 *               créés par la connexion Discord sont repris depuis les profils
 *   --dry-run   affiche le rapport sans rien écrire
 *
 * Chaque ligne NDJSON : {"path", "id", "data"}. Connexion : DATABASE_URL (rôle
 * identity_svc). Rejouable sans risque. Les fichiers d'export contiennent des
 * hash et des e-mails : à garder hors du dépôt et à supprimer après la bascule.
 * La sortie ne contient que des compteurs et des uid, jamais d'e-mail ni de hash.
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { createDb } from '../db/client.js';
import { importerAmis } from '../modules/amis/import.js';
import { importerTitres, type DocFirestore } from '../modules/titres/import.js';
import { chargerClesApi, transformerClesApi } from './cles-api.js';
import { chargerLiensDiscord, transformerLiensDiscord } from './discord.js';
import { FirebaseAuthExport, transformFirebaseUsers } from './firebase.js';
import { loadImportedAccounts, lireUuidParUid } from './load.js';
import { lireNdjson } from './ndjson.js';

const { values } = parseArgs({
  options: {
    auth: { type: 'string' },
    profils: { type: 'string' },
    titres: { type: 'string' },
    amis: { type: 'string' },
    demandes: { type: 'string' },
    cles: { type: 'string' },
    discord: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

if (!values.auth || !values.profils) {
  console.error(
    'usage : cli.js --auth comptes.json --profils users.ndjson [--titres titles.ndjson] ' +
      '[--amis friendships.ndjson] [--demandes requests.ndjson] [--cles apiKeys.ndjson] ' +
      '[--discord discordLinks.ndjson] [--dry-run]',
  );
  process.exit(2);
}

const facultatif = async (fichier: string | undefined): Promise<DocFirestore[] | undefined> =>
  fichier ? lireNdjson(fichier) : undefined;

const auth = FirebaseAuthExport.parse(JSON.parse(await readFile(values.auth, 'utf8')));

const profils = new Map<string, Record<string, unknown>>();
for (const doc of await lireNdjson(values.profils)) {
  // Uniquement les documents racine users/{uid}
  if (doc.path.split('/').length <= 2) profils.set(doc.id, doc.data);
}

const titres = await facultatif(values.titres);
const amis = await facultatif(values.amis);
const demandes = await facultatif(values.demandes);
const cles = await facultatif(values.cles);
const discord = await facultatif(values.discord);

const { comptes, rapport } = transformFirebaseUsers(auth, profils);

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
      fichiers: {
        titres: titres?.length ?? null,
        amis: amis?.length ?? null,
        demandes: demandes?.length ?? null,
        cles: cles?.length ?? null,
        discord: discord?.length ?? null,
      },
    },
    null,
    2,
  ),
);

if (values['dry-run']) {
  // Aperçu des rattachements avec les comptes de cet export (sans la base)
  const apercu = new Map(comptes.map((c) => [c.legacyUid, c.user.id]));
  console.log(
    JSON.stringify(
      {
        apercu: {
          cles: cles ? transformerClesApi(cles, apercu).rapport : null,
          discord: transformerLiensDiscord(discord ?? [], profils, apercu).rapport,
        },
      },
      null,
      2,
    ),
  );
  console.log('--dry-run : rien n’a été écrit');
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquant (rôle identity_svc)');
  process.exit(2);
}
const { db, pool } = createDb(url);
const ctx = { correlationId: `import-firebase-${new Date().toISOString()}` };
try {
  const chargement = await loadImportedAccounts(db, ctx, comptes);
  console.log(JSON.stringify({ chargement }, null, 2));
  if (chargement.conflits.length) process.exitCode = 1;

  // Comptes déjà présents compris : les imports suivants se rattachent à legacy_ids
  const uuidParUid = await lireUuidParUid(db);
  const suite: Record<string, unknown> = {};

  if (titres) {
    suite.titres = await importerTitres(db, ctx, { catalogue: titres, profils, uuidParUid });
  }
  if (amis || demandes) {
    suite.amis = await importerAmis(db, ctx, {
      amities: amis ?? [],
      demandes: demandes ?? [],
      uuidParUid,
    });
  }
  if (cles) {
    const t = transformerClesApi(cles, uuidParUid);
    suite.cles = { transformation: t.rapport, chargement: await chargerClesApi(db, ctx, t.cles) };
  }
  // Toujours : les comptes créés par la connexion Discord viennent des profils
  const d = transformerLiensDiscord(discord ?? [], profils, uuidParUid);
  suite.discord = {
    transformation: d.rapport,
    chargement: await chargerLiensDiscord(db, ctx, d.liens),
  };

  console.log(JSON.stringify(suite, null, 2));
} finally {
  await pool.end();
}
