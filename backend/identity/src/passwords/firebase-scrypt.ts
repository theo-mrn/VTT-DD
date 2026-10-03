/**
 * Vérification des mots de passe exportés de Firebase Auth (`firebase auth:export`).
 *
 * Firebase n'utilise pas scrypt tel quel (implémentation de référence :
 * github.com/firebase/scrypt) :
 *   1. clé = scrypt(motDePasse, sel ‖ séparateurDeSel, N = 2^memCost, r = rounds, p = 1, 32 octets)
 *   2. hash = AES-256-CTR(clé, IV = 16 octets nuls) appliqué à la clé de signature du projet
 *
 * Les paramètres (clé de signature, séparateur, rounds, memCost) sont communs à
 * tout le projet Firebase et se trouvent dans la console (Authentication →
 * Utilisateurs → « Paramètres de hachage du mot de passe »). La clé de
 * signature est un secret : elle vient d'un Secret k8s, jamais du dépôt.
 */
import { createCipheriv, scrypt, timingSafeEqual } from 'node:crypto';

export interface FirebaseScryptParams {
  /** Clé de signature du projet (base64). */
  signerKey: string;
  /** Séparateur de sel (base64). */
  saltSeparator: string;
  rounds: number;
  memCost: number;
}

function scryptAsync(
  motDePasse: Buffer,
  sel: Buffer,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(motDePasse, sel, 32, options, (err, cle) => (err ? reject(err) : resolve(cle)));
  });
}

/** Calcule le hash Firebase d'un mot de passe (base64). */
export async function firebaseScryptHash(
  password: string,
  saltBase64: string,
  params: FirebaseScryptParams,
): Promise<string> {
  const N = 2 ** params.memCost;
  const r = params.rounds;
  const cle = await scryptAsync(
    Buffer.from(password, 'utf8'),
    Buffer.concat([Buffer.from(saltBase64, 'base64'), Buffer.from(params.saltSeparator, 'base64')]),
    // Mémoire nécessaire : 128 × N × r octets, avec de la marge
    { N, r, p: 1, maxmem: 256 * N * r },
  );
  const chiffreur = createCipheriv('aes-256-ctr', cle, Buffer.alloc(16, 0));
  const hash = Buffer.concat([
    chiffreur.update(Buffer.from(params.signerKey, 'base64')),
    chiffreur.final(),
  ]);
  return hash.toString('base64');
}

/** Vérifie un mot de passe contre un hash Firebase, en temps constant. */
export async function verifyFirebaseScrypt(
  password: string,
  hashBase64: string,
  saltBase64: string,
  params: FirebaseScryptParams,
): Promise<boolean> {
  const attendu = Buffer.from(hashBase64, 'base64');
  const calcule = Buffer.from(await firebaseScryptHash(password, saltBase64, params), 'base64');
  return attendu.length === calcule.length && timingSafeEqual(attendu, calcule);
}
