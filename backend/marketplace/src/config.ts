import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const uuidList = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  )
  .pipe(z.array(z.uuid('MARKETPLACE_MODERATORS : identifiants de comptes attendus')));

export const MarketplaceConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('marketplace'),
  PORT: z.coerce.number().int().positive().default(3011),
  /** Connexion avec le rôle marketplace_svc (jamais marketplace_owner). */
  DATABASE_URL: z.string().min(1),
  /** Connexion directe (hors PgBouncer) pour le LISTEN du relais d'outbox. */
  DATABASE_DIRECT_URL: optional(z.string().min(1)),
  /** Bus NATS JetStream : relais d'outbox et consommateur des ventes et des comptes. */
  NATS_URL: optional(z.string().min(1)),
  /** Consommateur durable des événements de billing et d'identity. */
  EVENTS_CONSUMER: z.string().default('marketplace-events'),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /** Secret partagé entre services (en-tête x-internal-secret) : campaign et billing. */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service campaign : rôle de l'appelant dans une campagne (installation d'un pack). */
  CAMPAIGN_URL: optional(z.string().url()),
  /** Service billing : sessions de vente (Stripe Checkout). */
  BILLING_URL: optional(z.string().url()),
  /** Durée de vie en mémoire des rôles renvoyés par campaign, en millisecondes. */
  RIGHTS_CACHE_MS: z.coerce.number().int().nonnegative().default(5_000),

  /** Stockage des fichiers (R2), comme les autres services. */
  R2_ENDPOINT: optional(z.string().url()),
  R2_REGION: z.string().default('auto'),
  R2_BUCKET_NAME: optional(z.string()),
  R2_ACCESS_KEY_ID: optional(z.string()),
  R2_SECRET_ACCESS_KEY: optional(z.string()),
  /** URL publique des fichiers (domaine R2 ou CDN), la même pour tous les services. */
  R2_PUBLIC_URL: optional(z.string().url()),

  /**
   * Vente des packs (docs/marketplace.md § 5) : off, seules les fiches gratuites se publient et
   * un prix non nul est refusé. À passer à on avec STRIPE_CONNECT=on dans billing.
   */
  MARKETPLACE_PAID_LISTINGS: z.enum(['on', 'off']).default('off'),
  /** Comptes modérateurs (identifiants séparés par des virgules). */
  MARKETPLACE_MODERATORS: uuidList,
  /** Soumissions de versions par créateur et par jour. */
  SUBMISSIONS_PER_DAY: z.coerce.number().int().positive().default(10),
  /** Fiches non publiées (brouillons) par créateur. */
  DRAFTS_PER_CREATOR: z.coerce.number().int().positive().default(20),
});
export type MarketplaceConfig = z.infer<typeof MarketplaceConfig>;
