import { BaseConfig, withoutTrailingSlashes } from '@vtt/platform';
import { z } from 'zod';

/** Variable facultative : une valeur vide dans le .env vaut absente. */
const optional = <S extends z.ZodType>(schema: S) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const DiscordConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('discord'),
  PORT: z.coerce.number().int().positive().default(3010),

  /**
   * Application Discord (identifiant client) et sa clé publique (hexadécimal, signature
   * Ed25519 des interactions). Absentes (dev sans Discord) : le service démarre, la route des
   * interactions répond 503.
   */
  DISCORD_APPLICATION_ID: optional(z.string().regex(/^\d{1,32}$/)),
  DISCORD_PUBLIC_KEY: optional(
    z.string().regex(/^[0-9a-f]{64}$/i, 'clé publique hexadécimale attendue'),
  ),
  /** Jeton du bot : enregistrement des commandes seulement (commands:register). */
  DISCORD_BOT_TOKEN: optional(z.string().min(1)),

  /** Secret partagé entre services : demande des jetons délégués à identity. */
  INTERNAL_API_SECRET: z.string().min(32),
  IDENTITY_URL: z.string().url(),
  CAMPAIGN_URL: z.string().url(),
  DICE_URL: z.string().url(),
  CHARACTER_URL: z.string().url(),

  /** URL publique du site : bouton « Lier mon compte », lien de l'activité. */
  APP_URL: z.string().url().default('http://localhost:3000').transform(withoutTrailingSlashes),
});
export type DiscordConfig = z.infer<typeof DiscordConfig>;
