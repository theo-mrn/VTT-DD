import { ARCHIVE_LIMITS } from '@vtt/contracts';
import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const ArchiveConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('archive'),
  PORT: z.coerce.number().int().positive().default(3014),
  /** Connexion avec le rôle archive_svc (jamais archive_owner). */
  DATABASE_URL: z.string().min(1),
  /** Connexion directe (hors PgBouncer) pour le LISTEN du relais d'outbox. */
  DATABASE_DIRECT_URL: optional(z.string().min(1)),
  /** Bus NATS JetStream : relais d'outbox et consommateur des comptes supprimés. */
  NATS_URL: optional(z.string().min(1)),
  EVENTS_CONSUMER: z.string().default('archive-events'),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWKS_URL: z.string().url().optional(),

  /** Secret partagé entre services (en-tête x-internal-secret). */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Services dont les tables entrent dans une archive. */
  CAMPAIGN_URL: optional(z.string().url()),
  CHARACTER_URL: optional(z.string().url()),
  AUDIO_URL: optional(z.string().url()),
  /** Durée de vie en mémoire des rôles renvoyés par campaign, en millisecondes. */
  RIGHTS_CACHE_MS: z.coerce.number().int().nonnegative().default(5_000),

  R2_ENDPOINT: optional(z.string().url()),
  R2_REGION: z.string().default('auto'),
  R2_BUCKET_NAME: optional(z.string()),
  R2_ACCESS_KEY_ID: optional(z.string()),
  R2_SECRET_ACCESS_KEY: optional(z.string()),
  /** URL publique des fichiers (domaine R2 ou CDN), la même pour tous les services. */
  R2_PUBLIC_URL: optional(z.string().url()),

  /** Conservation d'une archive prête, en jours. */
  ARCHIVE_RETENTION_DAYS: z.coerce.number().int().positive().default(ARCHIVE_LIMITS.retentionDays),
  /** Tâches menées en même temps par ce processus. */
  ARCHIVE_WORKERS: z.coerce.number().int().min(0).max(8).default(1),
  /** Tâches lancées par compte et par jour (exports, imports, duplications confondus). */
  ARCHIVE_JOBS_PER_DAY: z.coerce.number().int().positive().default(10),
});
export type ArchiveConfig = z.infer<typeof ArchiveConfig>;
