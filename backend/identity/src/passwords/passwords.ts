/**
 * Hachage et vérification des mots de passe.
 *
 * Nouveaux mots de passe : argon2id (paramètres recommandés par l'OWASP).
 * Comptes importés de Firebase : hash scrypt Firebase vérifié à la connexion,
 * puis `needsRehash` demande à l'appelant de le remplacer par un hash argon2id.
 * L'utilisateur garde son mot de passe et ne voit rien de la bascule.
 */
import { hash, verify } from '@node-rs/argon2';
import { verifyFirebaseScrypt, type FirebaseScryptParams } from './firebase-scrypt.js';

/**
 * OWASP (Password Storage Cheat Sheet) : 19 Mio, 2 itérations, parallélisme 1.
 * L'algorithme par défaut de @node-rs/argon2 est argon2id (vérifié par les tests
 * sur le préfixe du hash) ; son enum `Algorithm` est un const enum inutilisable
 * avec verbatimModuleSyntax.
 */
export const ARGON2_PARAMS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Identifiant stocké en base (table identity.credentials). */
export type StoredPassword =
  | { algorithm: 'argon2id'; hash: string }
  /** Importé de Firebase : sel propre au compte, paramètres communs au projet. */
  | { algorithm: 'firebase-scrypt'; hash: string; salt: string };

export interface VerifyResult {
  ok: boolean;
  /** Vrai si le hash doit être remplacé par `hashPassword()` après une connexion réussie. */
  needsRehash: boolean;
}

export async function hashPassword(password: string): Promise<StoredPassword> {
  return { algorithm: 'argon2id', hash: await hash(password, ARGON2_PARAMS) };
}

/** Paramètres argon2id encodés dans un hash PHC : `$argon2id$v=19$m=…,t=…,p=…$…`. */
function parametresArgon2(phc: string): { m: number; t: number; p: number } | null {
  const m = /\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
  return m ? { m: Number(m[1]), t: Number(m[2]), p: Number(m[3]) } : null;
}

export async function verifyPassword(
  stored: StoredPassword,
  password: string,
  firebase: FirebaseScryptParams | undefined,
): Promise<VerifyResult> {
  if (stored.algorithm === 'argon2id') {
    let ok = false;
    try {
      ok = await verify(stored.hash, password);
    } catch {
      ok = false; // hash illisible : refus, jamais d'exception vers l'appelant
    }
    const p = parametresArgon2(stored.hash);
    // Paramètres renforcés depuis : on re-hashe au passage
    const obsolete =
      !p ||
      p.m < ARGON2_PARAMS.memoryCost ||
      p.t < ARGON2_PARAMS.timeCost ||
      p.p < ARGON2_PARAMS.parallelism;
    return { ok, needsRehash: ok && obsolete };
  }

  if (!firebase) {
    // Configuration manquante : on refuse plutôt que de laisser passer
    throw new Error(
      'Paramètres scrypt Firebase absents : impossible de vérifier un compte importé',
    );
  }
  const ok = await verifyFirebaseScrypt(password, stored.hash, stored.salt, firebase);
  return { ok, needsRehash: ok };
}
