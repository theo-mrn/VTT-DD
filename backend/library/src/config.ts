import { BaseConfig } from '@vtt/platform';
import { z } from 'zod';

export const LibraryConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('library'),
  PORT: z.coerce.number().int().positive().default(3013),
  /** Connexion avec le rôle library_svc (jamais library_owner). */
  DATABASE_URL: z.string().min(1),

  /** Jetons d'accès émis par identity : mêmes valeurs que la gateway. */
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  /** JWKS publié par identity. Facultatif seulement en test (résolveur de clé fourni). */
  JWKS_URL: z.string().url().optional(),
});
export type LibraryConfig = z.infer<typeof LibraryConfig>;
