import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const VoiceConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('voice'),
  PORT: z.coerce.number().int().positive().default(3012),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /** Secret partagé entre services : appels vers campaign (droits). */
  INTERNAL_API_SECRET: optional(z.string().min(32)),
  /** Service campaign : rôle de l'appelant dans une campagne. */
  CAMPAIGN_URL: optional(z.string().url()),
  /** Durée de vie en mémoire des rôles renvoyés par campaign, en millisecondes. */
  RIGHTS_CACHE_MS: z.coerce.number().int().nonnegative().default(10_000),

  /** Bus NATS JetStream : annonces `voice.*`. Absent : pas d'annonce (avertissement). */
  NATS_URL: optional(z.string().min(1)),

  /**
   * Cloudflare Realtime (docs/voix.md § 10) : application SFU et clé TURN. Absents : la voix
   * répond 503 `voice_unconfigured`.
   */
  CLOUDFLARE_REALTIME_APP_ID: optional(z.string().min(1)),
  CLOUDFLARE_REALTIME_APP_TOKEN: optional(z.string().min(1)),
  CLOUDFLARE_TURN_KEY_ID: optional(z.string().min(1)),
  CLOUDFLARE_TURN_KEY_TOKEN: optional(z.string().min(1)),
  /** API Cloudflare Realtime (surchargée par les tests). */
  CLOUDFLARE_REALTIME_URL: z.string().url().default('https://rtc.live.cloudflare.com/v1'),
  /** Durée des identifiants TURN remis au navigateur, en secondes. */
  TURN_TTL_S: z.coerce.number().int().min(60).max(172_800).default(3_600),
});
export type VoiceConfig = z.infer<typeof VoiceConfig>;
