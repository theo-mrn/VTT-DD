/**
 * Recopie les paramètres de hachage Firebase (hash-config.json produit par
 * auth.ts) dans backend/identity/.env, sans jamais les afficher.
 *
 *   node tools/firebase-export/dist/configurer-identity.js ~/vtt-export/hash-config.json
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const fichier = process.argv[2];
if (!fichier) {
  console.error('usage : configurer-identity.js <hash-config.json>');
  process.exit(2);
}

const config = JSON.parse(await readFile(fichier, 'utf8')) as {
  algorithm?: string;
  signerKey?: string;
  saltSeparator?: string;
  rounds?: number;
  memoryCost?: number;
};
if (config.algorithm !== 'SCRYPT' || !config.signerKey || !config.saltSeparator) {
  console.error(`Paramètres inattendus (algorithme : ${config.algorithm ?? 'absent'})`);
  process.exit(1);
}

const valeurs: Record<string, string> = {
  FIREBASE_SCRYPT_SIGNER_KEY: config.signerKey,
  FIREBASE_SCRYPT_SALT_SEPARATOR: config.saltSeparator,
  FIREBASE_SCRYPT_ROUNDS: String(config.rounds ?? ''),
  FIREBASE_SCRYPT_MEM_COST: String(config.memoryCost ?? ''),
};

const env = resolve(import.meta.dirname, '../../../backend/identity/.env');
let contenu = await readFile(env, 'utf8');
for (const [cle, valeur] of Object.entries(valeurs)) {
  const ligne = `${cle}=${valeur}`;
  const motif = new RegExp(`^${cle}=.*$`, 'm');
  contenu = motif.test(contenu)
    ? contenu.replace(motif, ligne)
    : `${contenu.trimEnd()}\n${ligne}\n`;
}
await writeFile(env, contenu, { mode: 0o600 });
console.log('Paramètres de hachage Firebase écrits dans backend/identity/.env');
