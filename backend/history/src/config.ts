import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const HistoryConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('history'),
  PORT: z.coerce.number().int().positive().default(3005),
  /** Connexion avec le rôle history_svc (jamais history_owner). */
  DATABASE_URL: z.string().min(1),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /**
   * Secret partagé entre services (en-tête x-internal-secret) : accompagne les
   * appels de history vers campaign et protège la route /internal appelée par
   * realtime. Absent : ni lecture de l'historique (droits inconnus), ni route interne.
   */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service campaign : rôle de l'appelant dans une campagne (visibilité, droits). */
  CAMPAIGN_URL: optional(z.string().url()),
  /** Durée de vie en mémoire des rôles renvoyés par campaign, en millisecondes. */
  RIGHTS_CACHE_MS: z.coerce.number().int().nonnegative().default(5_000),

  /**
   * Bus NATS JetStream (plusieurs serveurs séparés par des virgules). Absent :
   * le service sert l'historique mais n'enregistre plus rien (avertissement).
   */
  NATS_URL: optional(z.string().min(1)),
  /** Nom du consommateur durable (un seul par environnement, partagé par les réplicas). */
  HISTORY_CONSUMER: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .default('history'),
  /** Partitions mensuelles créées à l'avance (mois courant compris). */
  PARTITION_MONTHS_AHEAD: z.coerce.number().int().min(1).max(24).default(3),
});
export type HistoryConfig = z.infer<typeof HistoryConfig>;
