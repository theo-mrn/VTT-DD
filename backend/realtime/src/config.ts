import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const RealtimeConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('realtime'),
  PORT: z.coerce.number().int().positive().default(3006),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /**
   * Bus NATS JetStream (canal durable : diffusion et rejeu des événements).
   * Absent : seul le canal éphémère fonctionne (avertissement au démarrage).
   */
  NATS_URL: optional(z.string().min(1)),

  /**
   * Secret partagé entre services (en-tête x-internal-secret), pour demander à
   * campaign le rôle d'un utilisateur. Absent (ou CAMPAIGN_URL absent) : aucun
   * abonnement à une campagne n'est possible.
   */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service campaign : appartenance et rôle dans une campagne. */
  CAMPAIGN_URL: optional(z.string().url()),
  /** Durée de vie des rôles renvoyés par campaign (cache Redis partagé), en secondes. */
  RIGHTS_CACHE_SECONDS: z.coerce.number().int().nonnegative().default(30),

  /** Au-delà, un client qui se reconnecte ne reçoit pas le rejeu : il recharge son état. */
  REPLAY_MAX_EVENTS: z.coerce.number().int().positive().default(1000),
  /** Campagnes suivies en même temps par une connexion. */
  MAX_SUBSCRIPTIONS: z.coerce.number().int().positive().default(20),

  /** Canal éphémère : messages par seconde et par connexion, rafale tolérée, taille maximale. */
  // Un glisser de la carte et un curseur ensemble (docs/carte.md § 8)
  EPHEMERAL_RATE_PER_SECOND: z.coerce.number().positive().default(30),
  EPHEMERAL_BURST: z.coerce.number().int().positive().default(60),
  EPHEMERAL_MAX_BYTES: z.coerce.number().int().positive().default(4096),
});
export type RealtimeConfig = z.infer<typeof RealtimeConfig>;
