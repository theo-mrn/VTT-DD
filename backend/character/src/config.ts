import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

export const CharacterConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('character'),
  PORT: z.coerce.number().int().positive().default(3002),
  /** Connexion avec le rôle characters_svc (jamais characters_owner). */
  DATABASE_URL: z.string().min(1),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),

  /** Actions (jets de dés tirés par le serveur) par minute et par IP. */
  RATE_LIMIT_ACTIONS_MAX: z.coerce.number().int().positive().default(120),
});
export type CharacterConfig = z.infer<typeof CharacterConfig>;
