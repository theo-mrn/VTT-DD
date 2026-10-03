import { BaseConfig, withoutTrailingSlashes } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const MIB = 1024 * 1024;

export const AudioConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('audio'),
  PORT: z.coerce.number().int().positive().default(3008),
  /** Connexion avec le rôle audio_svc (jamais audio_owner). */
  DATABASE_URL: z.string().min(1),
  /** Connexion directe (hors PgBouncer) pour les LISTEN du relais d'outbox et du worker. */
  DATABASE_DIRECT_URL: optional(z.string().min(1)),
  /** Bus NATS JetStream : relais d'outbox et consommateur `campaign.deleted`. */
  NATS_URL: optional(z.string().min(1)),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /** Secret partagé entre services (en-tête x-internal-secret) : appels vers campaign. */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service campaign : rôle de l'appelant dans une campagne. */
  CAMPAIGN_URL: optional(z.string().url()),
  /** Durée de vie en mémoire des rôles renvoyés par campaign, en millisecondes. */
  RIGHTS_CACHE_MS: z.coerce.number().int().nonnegative().default(5_000),

  /** Stockage des fichiers (R2 en prod, SeaweedFS en dev), comme campaign. */
  S3_ENDPOINT: optional(z.string().url()),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional(z.string()),
  S3_ACCESS_KEY_ID: optional(z.string()),
  S3_SECRET_ACCESS_KEY: optional(z.string()),
  /** URL publique des fichiers (CDN R2, ou S3_ENDPOINT/bucket en dev). */
  S3_PUBLIC_URL: optional(z.string().url()),

  /** Signe les jetons d'envoi (HMAC), 32 caractères minimum. Absent : envoi désactivé. */
  AUDIO_UPLOAD_SECRET: optional(z.string().min(32)),
  /** Origines admises pour le catalogue intégré (séparées par des virgules). */
  AUDIO_CATALOG_ORIGINS: z.string().default('https://assets.yner.fr'),
  /** URL publique du catalogue publié dans le bucket (sons Star Wars). Absent : S3_PUBLIC_URL/audio/catalog. */
  AUDIO_CATALOG_PUBLISHED_URL: optional(z.string().url()),
  AUDIO_MAX_BYTES_LONG: z.coerce
    .number()
    .int()
    .positive()
    .default(100 * MIB),
  AUDIO_MAX_BYTES_SFX: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * MIB),
  AUDIO_LOUDNESS_TARGET_LUFS: z.coerce.number().min(-40).max(-5).default(-16),

  /** Période du planificateur des enchaînements (ms). */
  SCHEDULER_INTERVAL_MS: z.coerce.number().int().min(50).default(500),
  /**
   * Départ différé d'un effet et d'une lecture (play, reprise, seek, suivante) :
   * l'ancre est posée un peu dans le futur, le temps que l'événement arrive
   * chez tous ; chacun démarre alors au même instant, depuis le début.
   */
  CUE_LEAD_MS: z.coerce.number().int().min(0).max(2_000).default(250),
  CHANNEL_START_LEAD_MS: z.coerce.number().int().min(0).max(2_000).default(250),
  /** Effets par 10 s et par utilisateur (comptés en base). */
  CUE_RATE_PER_USER: z.coerce.number().int().positive().default(10),
  /** Commandes par seconde et par canal. */
  COMMAND_RATE_PER_CHANNEL: z.coerce.number().int().positive().default(5),
  /** Consommateur durable des suppressions de campagne. */
  CAMPAIGN_CONSUMER: z.string().default('audio-campaigns'),

  // ─── Worker ────────────────────────────────────────────────────────────────
  /** Binaires ffmpeg et ffprobe (image du worker : /usr/bin). */
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  /** Port des sondes du worker (/healthz, /readyz). */
  WORKER_PORT: z.coerce.number().int().positive().default(3009),
  /** Jobs traités en même temps par le worker. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  /** Dossier de travail du worker (emptyDir en prod). */
  WORKER_TMP_DIR: z.string().default('/tmp'),
  /** Délai avant la purge des fichiers d'un asset supprimé. */
  PURGE_AFTER_DAYS: z.coerce.number().int().nonnegative().default(30),
});
export type AudioConfig = z.infer<typeof AudioConfig>;

export const catalogOrigins = (c: Pick<AudioConfig, 'AUDIO_CATALOG_ORIGINS'>) =>
  c.AUDIO_CATALOG_ORIGINS.split(',')
    .map((s) => withoutTrailingSlashes(s.trim()))
    .filter(Boolean);
