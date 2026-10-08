/**
 * Dépendances partagées par les modules du service. Chaque module
 * (src/modules/<nom>/index.ts) reçoit l'instance Fastify et ces dépendances.
 */
import type { createService } from '@vtt/platform';
import type { CampaignRights } from './clients/campaign.js';
import type { Realtime } from './clients/cloudflare.js';
import type { VoiceConfig } from './config.js';
import type { Announcer } from './room/announce.js';
import type { RoomStore } from './room/store.js';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
export type ServiceApp = Awaited<ReturnType<typeof createService>>;

export interface Deps {
  config: VoiceConfig;
  /** Rôle de l'appelant dans une campagne (campaign). */
  campaigns: CampaignRights;
  /** API Cloudflare Realtime ; null : voix non configurée (503). */
  realtime: Realtime | null;
  rooms: RoomStore;
  announce: Announcer;
}

export type Module = (app: ServiceApp, deps: Deps) => Promise<void>;
