import { BaseConfig, OrphanSweepSettings } from '@vtt/platform';
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
  /**
   * Connexion directe à Postgres (hors PgBouncer) pour le LISTEN du relais
   * d'outbox : LISTEN ne traverse pas un pooler en mode transaction. Absent : DATABASE_URL.
   */
  DATABASE_DIRECT_URL: facultatif(z.string().min(1)),
  /**
   * Bus NATS JetStream (`nats://hôte:4222`, plusieurs séparés par des virgules) :
   * le relais y publie l'outbox. Absent : les événements restent dans l'outbox.
   */
  NATS_URL: facultatif(z.string().min(1)),

  /** Inscriptions et connexions par minute et par IP (bourrage d'identifiants). */
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),

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

  /**
   * Envoi des e-mails par Kourrier (http://localhost:8090 en dev, Mailpit derrière ;
   * http://kourrier.kourrier.svc:8080 en cluster, AWS SES derrière). Absent : e-mails journalisés.
   */
  KOURRIER_URL: facultatif(z.string().url()),
  /** Clé d'API du tenant yner chez Kourrier (kr_…). Obligatoire avec KOURRIER_URL. */
  KOURRIER_API_KEY: facultatif(z.string().startsWith('kr_')),
  /** Expéditeur : doit être autorisé pour la clé (allowed_senders du tenant, *@yner.fr). */
  MAIL_FROM: z.string().default('YNER <contact@yner.fr>'),

  /** Stockage des avatars et bannières (R2). */
  R2_ENDPOINT: facultatif(z.string().url()),
  R2_REGION: z.string().default('auto'),
  R2_BUCKET_NAME: facultatif(z.string()),
  R2_ACCESS_KEY_ID: facultatif(z.string()),
  R2_SECRET_ACCESS_KEY: facultatif(z.string()),
  /** URL publique des fichiers envoyés (CDN R2, ou R2_ENDPOINT/bucket en dev). */
  R2_PUBLIC_URL: facultatif(z.string().url()),

  /** OAuth Google et Discord : désactivés tant que les identifiants manquent. */
  GOOGLE_CLIENT_ID: facultatif(z.string()),
  GOOGLE_CLIENT_SECRET: facultatif(z.string()),
  DISCORD_CLIENT_ID: facultatif(z.string()),
  DISCORD_CLIENT_SECRET: facultatif(z.string()),

  /** Secret partagé avec la gateway pour les routes /internal (vérification des clés d'API). */
  INTERNAL_API_SECRET: facultatif(z.string().min(32)),

  /**
   * Migration à la première connexion : clé web PUBLIQUE de Firebase (celle
   * envoyée aux navigateurs par l'ancienne app) et identifiant du projet.
   * Un compte inconnu d'identity est vérifié auprès de Firebase puis créé.
   */
  FIREBASE_WEB_API_KEY: facultatif(z.string()),
  FIREBASE_PROJECT_ID: facultatif(z.string()),

  /** Cookie du refresh token en Secure (désactivable en dev HTTP local uniquement). */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** Fichiers orphelins de ses dossiers du stockage (docs/nettoyage.md § Fichiers). */
  ...OrphanSweepSettings,
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
