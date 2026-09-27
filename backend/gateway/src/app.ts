import proxy from '@fastify/http-proxy';
import { BaseConfig, createService, type ServiceOptions } from '@vtt/platform';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { creerEchangeurCles, EN_TETE_SECRET_INTERNE } from './cles-api.js';

export const GatewayConfig = BaseConfig.extend({
  SERVICE_NAME: z.string().default('gateway'),
  /** Services en amont, vides tant qu'ils n'existent pas (phases 2 à 7). */
  UPSTREAM_IDENTITY_URL: z.string().url().optional(),
  UPSTREAM_BILLING_URL: z.string().url().optional(),
  UPSTREAM_CAMPAIGN_URL: z.string().url().optional(),
  UPSTREAM_CHARACTER_URL: z.string().url().optional(),
  UPSTREAM_DICE_URL: z.string().url().optional(),
  UPSTREAM_HISTORY_URL: z.string().url().optional(),
  /**
   * Secret partagé avec identity pour échanger les clés d'API (en-tête
   * x-internal-secret). Absent : « Authorization: ApiKey … » est refusé.
   */
  INTERNAL_API_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(32).optional(),
  ),
});
export type GatewayConfig = z.infer<typeof GatewayConfig>;

/** Préfixe public → variable d'environnement de l'upstream. */
export const ROUTES = {
  '/v1/auth': 'UPSTREAM_IDENTITY_URL',
  '/v1/users': 'UPSTREAM_IDENTITY_URL',
  '/v1/api-keys': 'UPSTREAM_IDENTITY_URL',
  '/v1/friends': 'UPSTREAM_IDENTITY_URL',
  '/v1/titles': 'UPSTREAM_IDENTITY_URL',
  '/v1/billing': 'UPSTREAM_BILLING_URL',
  '/v1/campaigns': 'UPSTREAM_CAMPAIGN_URL',
  '/v1/systems': 'UPSTREAM_CHARACTER_URL',
  '/v1/characters': 'UPSTREAM_CHARACTER_URL',
  // Jets de dés (remplace /api/roll-dice) : jeton ou clé d'API
  '/v1/dice': 'UPSTREAM_DICE_URL',
  '/v1/history': 'UPSTREAM_HISTORY_URL',
} as const satisfies Record<string, keyof GatewayConfig>;

/** Routes accessibles sans jeton (connexion). */
const PUBLIC_PREFIXES = ['/v1/auth'];

/**
 * Webhooks signés, sans jeton : c'est leur signature qui les authentifie,
 * vérifiée par le service sur le corps brut (relayé octet pour octet, jamais
 * re-sérialisé par la gateway). Chemin exact, POST seulement.
 */
const PUBLIC_WEBHOOKS = ['/v1/billing/webhook'];

/** Routes publiques en lecture seule : la liste des systèmes de jeu et leurs documents. */
const PUBLIC_LECTURE = ['/v1/systems'];

/** La requête peut-elle passer sans jeton ? */
export function estPublique(methode: string, url: string): boolean {
  if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return true;
  const chemin = url.split('?')[0] ?? '';
  if (methode === 'POST' && PUBLIC_WEBHOOKS.includes(chemin)) return true;
  return (
    (methode === 'GET' || methode === 'HEAD') &&
    PUBLIC_LECTURE.some((p) => chemin === p || chemin.startsWith(`${p}/`))
  );
}

function decoder(chemin: string): string {
  try {
    return decodeURIComponent(chemin).toLowerCase();
  } catch {
    return chemin.toLowerCase();
  }
}

/**
 * Routes réservées aux échanges entre services (/internal/*) : jamais relayées
 * depuis l'extérieur. Refuse aussi tout chemin à segments « . » ou « .. »
 * (même encodés), qui pourrait y mener une fois résolu par un service en aval.
 */
export function estInterne(url: string): boolean {
  const brut = decoder(url.split('?')[0] ?? '');
  const resolu = decoder(new URL(url, 'http://gateway.local').pathname);
  return (
    /(^|[/\\])\.\.?([/\\]|$)/.test(brut) ||
    /^[/\\]+internal([/\\]|$)/.test(brut) ||
    /^[/\\]+internal([/\\]|$)/.test(resolu)
  );
}

export async function buildGateway(
  config: GatewayConfig,
  extra: Omit<ServiceOptions, 'config'> & {
    /** fetch utilisé pour les appels à identity (tests). */
    fetch?: typeof globalThis.fetch;
  } = {},
) {
  const { fetch: fetchIdentity, ...options } = extra;
  const app = await createService({ config, ...options });

  app.addHook('onRequest', async (req, reply) => {
    if (estInterne(req.url)) {
      reply.callNotFound();
      return reply;
    }
  });

  const cles = creerEchangeurCles({
    identityUrl: config.UPSTREAM_IDENTITY_URL,
    secret: config.INTERNAL_API_SECRET,
    fetch: fetchIdentity,
  });

  /** preHandler : accepte « Bearer <jwt> » ou « ApiKey <clé> », puis vérifie le JWT. */
  const authentifier = async (req: FastifyRequest, reply: FastifyReply) => {
    await cles.convertir(req);
    await app.authenticate(req, reply);
  };

  app.get(
    '/v1/me',
    {
      preHandler: authentifier,
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
        if (!estPublique(req.method, req.url)) {
          await authentifier(req, reply);
        }
      },
      replyOptions: {
        // Propagation de la corrélation ; traceparent est ajouté par l'instrumentation http
        rewriteRequestHeaders: (req, { [EN_TETE_SECRET_INTERNE]: _secret, ...headers }) => ({
          ...headers,
          // Une clé d'API brute n'est jamais relayée (routes publiques)
          authorization: /^ApiKey /i.test(headers.authorization ?? '')
            ? undefined
            : headers.authorization,
          'x-request-id': req.id,
          // Chaîne reçue + IP du client vue par la gateway : le service en aval,
          // qui ne fait confiance qu'à un proxy, lit ainsi l'IP réelle
          'x-forwarded-for': [headers['x-forwarded-for'], req.ip].filter(Boolean).join(', '),
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
