/**
 * Export des comptes Firebase Auth avec leurs hash, et des paramètres de
 * hachage du projet, via le compte de service (pas besoin de la console).
 *
 *   node --env-file=legacy/.env tools/firebase-export/dist/auth.js --out ~/vtt-export
 *
 * Produit, dans --out (hors du dépôt, fichiers en 0600) :
 *   comptes.json      même format que `firebase auth:export --format=json`
 *   hash-config.json  paramètres scrypt du projet (secret : clé de signature)
 * N'affiche que des compteurs, jamais d'e-mail ni de hash.
 */
import { writeFile, mkdir, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) {
  console.error('usage : auth.js --out <dossier hors du dépôt>');
  process.exit(2);
}

const depot = await realpath(resolve(import.meta.dirname, '../../..'));
const dansLeDepot = (c: string) => c === depot || c.startsWith(depot + sep);
if (dansLeDepot(resolve(values.out))) {
  console.error(`Refus : ${resolve(values.out)} est dans le dépôt.`);
  process.exit(2);
}
await mkdir(values.out, { recursive: true, mode: 0o700 });
const sortie = await realpath(values.out);

const brut = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!brut) {
  console.error('FIREBASE_SERVICE_ACCOUNT_KEY manquant (lancer avec --env-file=legacy/.env)');
  process.exit(2);
}
const compte = JSON.parse(brut) as ServiceAccount & { project_id?: string };
const projet = compte.projectId ?? compte.project_id;
const app = initializeApp({ credential: cert(compte) });

// Format de firebase-tools (src/accountExporter.ts)
function versExport(u: UserRecord) {
  return {
    localId: u.uid,
    email: u.email,
    emailVerified: u.emailVerified,
    passwordHash: u.passwordHash,
    salt: u.passwordSalt,
    displayName: u.displayName,
    photoUrl: u.photoURL,
    createdAt: String(Date.parse(u.metadata.creationTime)),
    lastSignedInAt: u.metadata.lastSignInTime
      ? String(Date.parse(u.metadata.lastSignInTime))
      : undefined,
    disabled: u.disabled,
    providerUserInfo: u.providerData
      .filter((p) => p.providerId !== 'password')
      .map((p) => ({
        providerId: p.providerId,
        rawId: p.uid,
        email: p.email,
        displayName: p.displayName,
        photoUrl: p.photoURL,
      })),
  };
}

const users: ReturnType<typeof versExport>[] = [];
let page: string | undefined;
do {
  const r = await getAuth(app).listUsers(1000, page);
  users.push(...r.users.map(versExport));
  page = r.pageToken;
} while (page);
await writeFile(join(sortie, 'comptes.json'), JSON.stringify({ users }, null, 2), { mode: 0o600 });

// Paramètres de hachage : Identity Toolkit, config du projet (signIn.hashConfig)
const { access_token } = await app.options.credential!.getAccessToken();
const res = await fetch(
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${projet}/config`,
  {
    headers: { authorization: `Bearer ${access_token}` },
  },
);
if (!res.ok) {
  console.error(`Lecture des paramètres de hachage refusée : HTTP ${res.status}`);
  process.exit(1);
}
const hashConfig = ((await res.json()) as { signIn?: { hashConfig?: Record<string, unknown> } })
  .signIn?.hashConfig;
if (!hashConfig?.signerKey) {
  console.error('Paramètres de hachage absents de la configuration du projet');
  process.exit(1);
}
await writeFile(join(sortie, 'hash-config.json'), JSON.stringify(hashConfig, null, 2), {
  mode: 0o600,
});

const avecHash = users.filter((u) => u.passwordHash && u.salt).length;
console.log(
  `${users.length} comptes exportés (${avecHash} avec mot de passe) -> ${sortie}/comptes.json`,
);
console.log(
  `Paramètres de hachage : ${hashConfig.algorithm}, rounds ${hashConfig.rounds}, memoryCost ${hashConfig.memoryCost} -> ${sortie}/hash-config.json`,
);
