import { hostname } from 'node:os';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  connectBus,
  consumeEvents,
  createService,
  HttpError,
  type Bus,
  type ServiceOptions,
} from '@vtt/platform';
import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { z } from 'zod';
import { verifyToken } from './auth.js';
import { campaignRights, noCampaigns, type CampaignRights } from './clients/campaign.js';
import type { RealtimeConfig } from './config.js';
import { createHub, type Hub, type IoServer } from './hub.js';
import { SOCKET_PATH } from './protocol.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Serveur Socket.IO attaché au serveur HTTP du service. */
    io: IoServer;
    /** Diffusion des événements du bus (injectable en test sans NATS). */
    realtime: Hub;
  }
}

export async function buildRealtime(
  config: RealtimeConfig,
  extra: Omit<ServiceOptions, 'config'> & {
    /** Bus fourni (tests) ; null : sans NATS même si NATS_URL est défini. */
    bus?: Bus | null;
    campaigns?: CampaignRights;
    /** Délai de regroupement des annonces de présence (tests). */
    presenceDelayMs?: number;
  } = {},
) {
  const { bus: providedBus, campaigns, presenceDelayMs, ...options } = extra;
  if (!config.JWKS_URL && !options.authKeyResolver) {
    throw new Error('Configuration invalide : JWKS_URL est requis pour vérifier les jetons');
  }

  const withBus = providedBus !== undefined ? providedBus !== null : !!config.NATS_URL;
  let bus: Bus | null = providedBus ?? null;
  let stopLive: (() => Promise<void>) | undefined;
  let closeHub: (() => void) | undefined;
  let adapterClients: Redis[] = [];

  const app = await createService({
    config,
    ...options,
    readiness: {
      ...(withBus
        ? {
            nats: async () => {
              if (!bus) return false;
              await bus.nc.flush();
              return true;
            },
          }
        : {}),
      ...options.readiness,
    },
    onShutdown: [
      ...(options.onShutdown ?? []),
      async () => {
        await stopLive?.();
        closeHub?.();
        // Le bus fourni par un test reste à sa charge
        if (bus && providedBus === undefined) await bus.close();
        await app.io?.close().catch(() => undefined);
        await Promise.all(adapterClients.map((c) => c.quit().catch(() => undefined)));
      },
    ],
  });

  if (withBus && !bus) {
    try {
      bus = await connectBus({
        url: config.NATS_URL!,
        name: `realtime-${hostname()}`,
        logger: app.log,
      });
    } catch (err) {
      await app.close();
      throw err;
    }
  }
  if (!bus) app.log.warn('NATS_URL absent : canal durable (événements du bus) désactivé');
  const secret = config.INTERNAL_API_SECRET;
  if (!secret || !config.CAMPAIGN_URL)
    app.log.warn('CAMPAIGN_URL ou INTERNAL_API_SECRET absent : aucun abonnement possible');

  // Socket.IO sur le serveur HTTP de Fastify, WebSocket seulement : pas de long polling,
  // qui exigerait des sessions collantes entre réplicas
  const io: IoServer = new Server(app.server, {
    path: SOCKET_PATH,
    transports: ['websocket'],
    serveClient: false,
    maxHttpBufferSize: 64 * 1024,
    cors: { origin: config.CORS_ORIGINS, credentials: true },
  });
  if (config.REDIS_URL) {
    // Adaptateur Redis : canal éphémère et présence entre réplicas (pub/sub dédiés)
    const pub = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
    const sub = pub.duplicate();
    for (const c of [pub, sub])
      c.on('error', (err) => app.log.warn({ error: err }, 'adaptateur redis en erreur'));
    adapterClients = [pub, sub];
    io.adapter(createAdapter(pub, sub, { key: 'vtt-realtime' }));
  }
  app.decorate('io', io);

  const hub = createHub({
    io,
    bus,
    rights:
      campaigns ??
      (secret && config.CAMPAIGN_URL
        ? campaignRights({
            url: config.CAMPAIGN_URL,
            secret,
            cache: app.cache,
            ttlSeconds: config.RIGHTS_CACHE_SECONDS,
            onError: (e) => app.log.warn({ error: (e as Error).message }, 'campaign injoignable'),
          })
        : noCampaigns),
    verify: async (token) => {
      const user = await verifyToken(app, token);
      return { userId: user.userId, exp: user.claims.exp };
    },
    log: app.log,
    limits: {
      replayMax: config.REPLAY_MAX_EVENTS,
      maxSubscriptions: config.MAX_SUBSCRIPTIONS,
      ephemeralRatePerSecond: config.EPHEMERAL_RATE_PER_SECOND,
      ephemeralBurst: config.EPHEMERAL_BURST,
      ephemeralMaxBytes: config.EPHEMERAL_MAX_BYTES,
    },
    ...(presenceDelayMs !== undefined ? { presenceDelayMs } : {}),
  });
  app.decorate('realtime', hub);
  closeHub = () => hub.close();

  // Arrêt : connexions fermées avant le serveur HTTP (sinon il attend les WebSockets ouverts) ;
  // les clients se reconnectent sur un autre réplica et rattrapent avec leur dernier seq
  app.addHook('preClose', async () => {
    io.local.disconnectSockets(true);
  });

  // Canal durable : ce réplica lit tout le flux et n'émet qu'à ses propres connexions
  if (bus) {
    stopLive = await consumeEvents(bus, {
      deliver: 'new',
      subjects: ['vtt.>'],
      logger: app.log,
      handler: async (event, msg) => hub.dispatch(event, msg.seq),
    });
  }

  /**
   * Jeton pour le handshake : le front garde son jeton d'accès dans le client
   * API (jamais exposé) ; il le relit ici, porté et renouvelé par ce client.
   */
  app.get(
    '/v1/realtime/token',
    {
      preHandler: app.authenticate,
      schema: {
        response: {
          200: z.object({ token: z.string(), expiresAt: z.string().nullable() }),
        },
      },
    },
    async (req, reply) => {
      // Jeton échangé par la gateway contre une clé d'API : il ne doit pas en sortir
      if (req.user!.roles.includes('api'))
        throw HttpError.forbidden('Temps réel indisponible avec une clé d’API');
      reply.header('cache-control', 'no-store');
      const exp = req.user!.claims.exp;
      return {
        token: req.headers.authorization!.slice(7).trim(),
        expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
      };
    },
  );

  return app;
}
