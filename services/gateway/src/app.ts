import proxy from '@fastify/http-proxy';
import { BaseConfig, createService, type ServiceOptions } from '@vtt/platform';
import { z } from 'zod';

export const GatewayConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('gateway'),
  /** Services en amont, vides tant qu'ils n'existent pas (phases 2 à 7). */
  UPSTREAM_IDENTITY_URL: z.string().url().optional(),
  UPSTREAM_BILLING_URL: z.string().url().optional(),
  UPSTREAM_CAMPAIGN_URL: z.string().url().optional(),
  UPSTREAM_CHARACTER_URL: z.string().url().optional(),
  UPSTREAM_HISTORY_URL: z.string().url().optional(),
});
export type GatewayConfig = z.infer<typeof GatewayConfig>;

/** Préfixe public → variable d'environnement de l'upstream. */
export const ROUTES = {
  '/v1/auth': 'UPSTREAM_IDENTITY_URL',
  '/v1/users': 'UPSTREAM_IDENTITY_URL',
  '/v1/billing': 'UPSTREAM_BILLING_URL',
  '/v1/rooms': 'UPSTREAM_CAMPAIGN_URL',
  '/v1/characters': 'UPSTREAM_CHARACTER_URL',
  '/v1/history': 'UPSTREAM_HISTORY_URL',
} as const satisfies Record<string, keyof GatewayConfig>;

/** Routes accessibles sans jeton (connexion, webhooks signés). */
const PUBLIC_PREFIXES = ['/v1/auth', '/v1/billing/webhooks'];

export async function buildGateway(
  config: GatewayConfig,
  extra: Omit<ServiceOptions, 'config'> = {},
) {
  const app = await createService({ config, ...extra });

  app.get(
    '/v1/me',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: z.object({ userId: z.string(), roles: z.array(z.string()) }),
        },
      },
    },
    async (req) => ({ userId: req.user!.userId, roles: req.user!.roles }),
  );

  for (const [prefix, key] of Object.entries(ROUTES)) {
    const upstream = config[key as keyof GatewayConfig] as string | undefined;
    if (!upstream) continue;
    await app.register(proxy, {
      upstream,
      prefix,
      rewritePrefix: prefix,
      http2: false,
      preHandler: async (req, reply) => {
        if (!PUBLIC_PREFIXES.some((p) => req.url.startsWith(p))) {
          await app.authenticate(req, reply);
        }
      },
      replyOptions: {
        // Propagation de la corrélation ; traceparent est ajouté par l'instrumentation http
        rewriteRequestHeaders: (req, headers) => ({
          ...headers,
          'x-request-id': req.id,
          'x-correlation-id': (req as unknown as { ctx: { correlationId: string } }).ctx
            .correlationId,
          'x-forwarded-user': (req as unknown as { user?: { userId: string } }).user?.userId ?? '',
        }),
      },
    });
    app.log.info({ prefix, upstream }, 'route registered');
  }

  return app;
}
