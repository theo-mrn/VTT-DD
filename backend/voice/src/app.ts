import { connectBus, createService, type Bus, type ServiceOptions } from '@vtt/platform';
import type { FastifyBaseLogger } from 'fastify';
import { campaignRights, noCampaigns } from './clients/campaign.js';
import { cloudflareRealtime, type Realtime } from './clients/cloudflare.js';
import type { VoiceConfig } from './config.js';
import type { Deps } from './deps.js';
import { register as voice } from './modules/voice/index.js';
import { busAnnouncer, silentAnnouncer } from './room/announce.js';
import { memoryRooms, redisRooms } from './room/store.js';

/** Droits lus chez campaign ; sans URL ou secret, salle vocale inaccessible (503). */
function rightsOf(log: FastifyBaseLogger, config: VoiceConfig): Deps['campaigns'] {
  const secret = config.INTERNAL_API_SECRET;
  if (!secret || !config.CAMPAIGN_URL) return noCampaigns;
  return campaignRights({
    url: config.CAMPAIGN_URL,
    secret,
    cacheMs: config.RIGHTS_CACHE_MS,
    onError: (e) => log.warn({ error: (e as Error).message }, 'campaign injoignable'),
  });
}

/** Cloudflare Realtime ; null sans les quatre secrets (voix indisponible). */
function realtimeOf(log: FastifyBaseLogger, c: VoiceConfig): Realtime | null {
  if (
    !c.CLOUDFLARE_REALTIME_APP_ID ||
    !c.CLOUDFLARE_REALTIME_APP_TOKEN ||
    !c.CLOUDFLARE_TURN_KEY_ID ||
    !c.CLOUDFLARE_TURN_KEY_TOKEN
  )
    return null;
  return cloudflareRealtime({
    url: c.CLOUDFLARE_REALTIME_URL,
    appId: c.CLOUDFLARE_REALTIME_APP_ID,
    appToken: c.CLOUDFLARE_REALTIME_APP_TOKEN,
    turnKeyId: c.CLOUDFLARE_TURN_KEY_ID,
    turnKeyToken: c.CLOUDFLARE_TURN_KEY_TOKEN,
    onError: (e) => log.warn({ error: (e as Error).message }, 'Cloudflare Realtime'),
  });
}

export async function buildVoice(
  config: VoiceConfig,
  extra: Omit<ServiceOptions, 'config'> &
    Partial<Pick<Deps, 'campaigns' | 'realtime' | 'rooms' | 'announce'>> & {
      /** Pas de bus (tests) : aucune annonce. */
      bus?: false;
    } = {},
) {
  const { campaigns, realtime, rooms, announce, bus: busOption, ...options } = extra;
  if (!config.JWKS_URL && !options.authKeyResolver) {
    throw new Error('Configuration invalide : JWKS_URL est requis pour vérifier les jetons');
  }
  const bus: Bus | null =
    busOption !== false && config.NATS_URL
      ? await connectBus({ url: config.NATS_URL, name: config.SERVICE_NAME })
      : null;

  const app = await createService({
    config,
    ...options,
    readiness: {
      ...(bus ? { nats: async () => !bus.nc.isClosed() } : {}),
      ...options.readiness,
    },
    onShutdown: [...(options.onShutdown ?? []), async () => bus?.close()],
  });

  if (!config.INTERNAL_API_SECRET || !config.CAMPAIGN_URL)
    app.log.warn('CAMPAIGN_URL ou INTERNAL_API_SECRET absent : salle vocale inaccessible (503)');
  const rt = realtime === undefined ? realtimeOf(app.log, config) : realtime;
  if (!rt) app.log.warn('Cloudflare Realtime non configuré : voix indisponible (503)');
  if (!bus && busOption !== false)
    app.log.warn('NATS_URL absent : arrivées et départs non annoncés');

  const deps: Deps = {
    config,
    campaigns: campaigns ?? rightsOf(app.log, config),
    realtime: rt,
    rooms: rooms ?? (app.redis ? redisRooms(app.redis) : memoryRooms()),
    announce:
      announce ??
      (bus
        ? busAnnouncer(bus, (e) => app.log.warn({ error: (e as Error).message }, 'annonce perdue'))
        : silentAnnouncer),
  };

  for (const module of [voice]) {
    await module(app, deps);
  }
  return app;
}
