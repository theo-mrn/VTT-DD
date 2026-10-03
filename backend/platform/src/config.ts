import { z } from 'zod';

const csv = z.string().transform((s) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

/** Variables communes à tous les services. Chaque service étend ce schéma. */
export const BaseConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().min(1),
  SERVICE_VERSION: z.string().default('0.0.0-dev'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  REDIS_URL: z.string().url().optional(),
  CACHE_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive().default(60),

  CORS_ORIGINS: csv.default([]),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  /**
   * Nombre de proxys de confiance devant le service (Traefik devant la gateway,
   * la gateway devant les services). L'IP du client est lue à cette profondeur
   * dans X-Forwarded-For : ce que le client y écrit lui-même est ignoré, sinon
   * il contournerait les limites de débit en changeant d'IP à chaque requête.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),

  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
  JWKS_URL: z.string().url().optional(),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
});
export type BaseConfig = z.infer<typeof BaseConfig>;

/**
 * Valide l'environnement au démarrage. Un service mal configuré doit
 * refuser de démarrer plutôt que d'échouer à la première requête.
 */
export function loadConfig<S extends z.ZodObject>(
  schema: S = BaseConfig as unknown as S,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<S> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${issues}`);
  }
  return result.data;
}
