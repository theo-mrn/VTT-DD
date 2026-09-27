import proxy, { type FastifyHttpProxyOptions } from '@fastify/http-proxy';
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
  UPSTREAM_REALTIME_URL: z.string().url().optional(),
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
  // Toutes mes notes, toutes campagnes confondues (service campaign, docs/api-notes.md)
  '/v1/notes': 'UPSTREAM_CAMPAIGN_URL',
  '/v1/systems': 'UPSTREAM_CHARACTER_URL',
  '/v1/characters': 'UPSTREAM_CHARACTER_URL',
  // Jets de dés (remplace /api/roll-dice) : jeton ou clé d'API
  '/v1/dice': 'UPSTREAM_DICE_URL',
  '/v1/history': 'UPSTREAM_HISTORY_URL',
  // Temps réel : WebSocket (Socket.IO) relayé, et routes HTTP du service
  '/v1/realtime': 'UPSTREAM_REALTIME_URL',
} as const satisfies Record<string, keyof GatewayConfig>;

/**
 * Sous-routes d'un préfixe servies par un autre service, relayées par leur propre
 * proxy : le routeur de Fastify préfère ces préfixes paramétrés au joker du préfixe
 * parent. (Un upstream choisi requête par requête ne marche pas : reply-from fige
 * l'origine sur l'upstream de base avec undici.)
 * Ex. les modèles du MJ vivent sous /v1/campaigns/:id/… mais appartiennent à character.
 */
export const SUB_ROUTES = {
  '/v1/campaigns/:campaignId/npc-templates': 'UPSTREAM_CHARACTER_URL',
  '/v1/campaigns/:campaignId/npc-template-categories': 'UPSTREAM_CHARACTER_URL',
  '/v1/campaigns/:campaignId/object-templates': 'UPSTREAM_CHARACTER_URL',
} as const satisfies Record<string, keyof GatewayConfig>;

/** Préfixes dont la gateway relaie aussi les WebSockets. */
const WEBSOCKET_PREFIXES: readonly string[] = ['/v1/realtime'];

/**
 * Poignée de main WebSocket du temps réel : un navigateur ne peut pas y
 * joindre d'en-tête Authorization, le jeton voyage dans le premier message
 * Socket.IO et c'est realtime qui le vérifie. Seul ce chemin passe sans jeton,
 * et seulement pour une demande d'upgrade (Node ne la traite jamais comme une
 * requête HTTP ordinaire).
 */
export function estPoigneeTempsReel(
  url: string,
  headers: { upgrade?: string | string[] | undefined },
): boolean {
  const chemin = url.split('?')[0] ?? '';
  return (
    typeof headers.upgrade === 'string' &&
    headers.upgrade.toLowerCase() === 'websocket' &&
    chemin.startsWith('/v1/realtime/socket.io/')
  );
}

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

/**
 * Options du proxy pour un préfixe qui relaie aussi les WebSockets : l'IP du
 * client et l'identifiant de requête suivent, comme en HTTP (jamais le cookie).
 * `rewriteRequestHeaders` existe à l'exécution mais pas dans les types du plugin.
 */
function optionsWebSocket(prefix: string) {
  if (!WEBSOCKET_PREFIXES.includes(prefix)) return { websocket: false as const };
  const wsClientOptions = {
    rewriteRequestHeaders: (_headers: unknown, req: FastifyRequest) => ({
      'x-request-id': req.id,
      'x-forwarded-for': [req.headers['x-forwarded-for'], req.ip].filter(Boolean).join(', '),
    }),
  } as unknown as NonNullable<FastifyHttpProxyOptions['wsClientOptions']>;
  return {
    websocket: true as const,
    // Messages Socket.IO petits (64 Kio côté service) : pas de trames géantes
    wsServerOptions: { maxPayload: 256 * 1024 },
    wsClientOptions,
  };
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

  // WebSocket hors des préfixes prévus : refusé tout de suite, sinon la connexion resterait pendante
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers.upgrade && !WEBSOCKET_PREFIXES.some((p) => req.url.startsWith(`${p}/`))) {
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

  for (const [prefix, key] of [...Object.entries(ROUTES), ...Object.entries(SUB_ROUTES)]) {
    const upstream = config[key as keyof GatewayConfig] as string | undefined;
    if (!upstream) continue;
    await app.register(proxy, {
      upstream,
      prefix,
      rewritePrefix: prefix,
      http2: false,
      preHandler: async (req, reply) => {
        if (!estPublique(req.method, req.url) && !estPoigneeTempsReel(req.url, req.headers)) {
          await authentifier(req, reply);
        }
      },
      ...optionsWebSocket(prefix),
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
