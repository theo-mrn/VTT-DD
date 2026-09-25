import { BaseConfig } from '@vtt/platform';
import type { JWK } from 'jose';
import { z } from 'zod';
import type { FirebaseScryptParams } from './passwords/firebase-scrypt.js';

const jsonJwks = z.string().transform((brut, ctx) => {
  try {
    const valeur: unknown = JSON.parse(brut);
    if (Array.isArray(valeur) && valeur.length > 0) return valeur as JWK[];
  } catch {
    /* signalé ci-dessous */
  }
  ctx.addIssue({
    code: 'custom',
    message: 'JSON attendu : tableau non vide de JWK privées Ed25519',
  });
  return z.NEVER;
});

export const IdentityConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('identity'),
  /** Connexion avec le rôle identity_svc (jamais identity_owner). */
  DATABASE_URL: z.string().min(1),

  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** Clés privées Ed25519 (JWK avec kid), la première signe. Secret k8s. */
  JWT_PRIVATE_JWKS: jsonJwks,

  /** Paramètres de hachage du projet Firebase, requis tant que des comptes importés n'ont pas été re-hashés. */
  FIREBASE_SCRYPT_SIGNER_KEY: z.string().optional(),
  FIREBASE_SCRYPT_SALT_SEPARATOR: z.string().optional(),
  FIREBASE_SCRYPT_ROUNDS: z.coerce.number().int().positive().optional(),
  FIREBASE_SCRYPT_MEM_COST: z.coerce.number().int().positive().optional(),

  /** Cookie du refresh token en Secure (désactivable en dev HTTP local uniquement). */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
export type IdentityConfig = z.infer<typeof IdentityConfig>;

/** Paramètres Firebase complets, ou undefined si un seul manque. */
export function firebaseParams(c: IdentityConfig): FirebaseScryptParams | undefined {
  const {
    FIREBASE_SCRYPT_SIGNER_KEY,
    FIREBASE_SCRYPT_SALT_SEPARATOR,
    FIREBASE_SCRYPT_ROUNDS,
    FIREBASE_SCRYPT_MEM_COST,
  } = c;
  if (
    !FIREBASE_SCRYPT_SIGNER_KEY ||
    !FIREBASE_SCRYPT_SALT_SEPARATOR ||
    !FIREBASE_SCRYPT_ROUNDS ||
    !FIREBASE_SCRYPT_MEM_COST
  ) {
    return undefined;
  }
  return {
    signerKey: FIREBASE_SCRYPT_SIGNER_KEY,
    saltSeparator: FIREBASE_SCRYPT_SALT_SEPARATOR,
    rounds: FIREBASE_SCRYPT_ROUNDS,
    memCost: FIREBASE_SCRYPT_MEM_COST,
  };
}
