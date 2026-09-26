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

/** Variable facultative : une valeur vide dans le .env (`CLE=`) vaut absence, pas 0 ni "". */
const facultatif = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const IdentityConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('identity'),
  /** Connexion avec le rôle identity_svc (jamais identity_owner). */
  DATABASE_URL: z.string().min(1),

  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** Clés privées Ed25519 (JWK avec kid), la première signe. Secret k8s. */
  JWT_PRIVATE_JWKS: jsonJwks,

  /** Paramètres de hachage du projet Firebase, requis tant que des comptes importés n'ont pas été re-hashés. */
  FIREBASE_SCRYPT_SIGNER_KEY: facultatif(z.string()),
  FIREBASE_SCRYPT_SALT_SEPARATOR: facultatif(z.string()),
  FIREBASE_SCRYPT_ROUNDS: facultatif(z.coerce.number().int().positive()),
  FIREBASE_SCRYPT_MEM_COST: facultatif(z.coerce.number().int().positive()),

  /** URL publique du front : liens des e-mails et retour après connexion Google/Discord. */
  APP_URL: z.string().url().default('http://localhost:3000'),

  /** Envoi des e-mails : smtp://… (Mailpit en dev, Resend en prod). Absent : e-mails journalisés. */
  SMTP_URL: facultatif(z.string().url()),
  MAIL_FROM: z.string().default('YNER <contact@yner.fr>'),

  /** Stockage des avatars et bannières (R2 en prod, SeaweedFS en dev). */
  S3_ENDPOINT: facultatif(z.string().url()),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: facultatif(z.string()),
  S3_ACCESS_KEY_ID: facultatif(z.string()),
  S3_SECRET_ACCESS_KEY: facultatif(z.string()),
  /** URL publique des fichiers envoyés (CDN R2, ou S3_ENDPOINT/bucket en dev). */
  S3_PUBLIC_URL: facultatif(z.string().url()),

  /** OAuth Google et Discord : désactivés tant que les identifiants manquent. */
  GOOGLE_CLIENT_ID: facultatif(z.string()),
  GOOGLE_CLIENT_SECRET: facultatif(z.string()),
  DISCORD_CLIENT_ID: facultatif(z.string()),
  DISCORD_CLIENT_SECRET: facultatif(z.string()),

  /** Secret partagé avec la gateway pour les routes /internal (vérification des clés d'API). */
  INTERNAL_API_SECRET: facultatif(z.string().min(32)),

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
