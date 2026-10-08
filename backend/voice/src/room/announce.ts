/**
 * Annonces de la salle vocale sur le bus (`vtt.<campagne>.voice.*`), relayées par realtime à
 * toute la campagne : arrivée, changement (micro coupé), départ. Sans bus : rien n'est annoncé,
 * les navigateurs se recalent sur la salle rendue par le battement.
 */
import {
  uuidv7,
  type EventEnvelope,
  type VoiceEventType,
  type VoiceParticipant,
} from '@vtt/contracts';
import { publishEvent, type Bus } from '@vtt/platform';
import type { CampaignRole } from '../clients/campaign.js';

export interface Announcer {
  (o: {
    type: VoiceEventType;
    campaignId: string;
    userId: string;
    role: CampaignRole;
    participant?: VoiceParticipant;
    correlationId: string;
  }): Promise<void>;
}

export const silentAnnouncer: Announcer = async () => undefined;

export function busAnnouncer(bus: Bus, onError: (e: unknown) => void): Announcer {
  return async (o) => {
    const event: EventEnvelope = {
      id: uuidv7(),
      type: o.type,
      version: 1,
      occurredAt: new Date().toISOString(),
      roomId: o.campaignId,
      actor: { userId: o.userId, role: o.role === 'gm' ? 'gm' : 'player', characterId: null },
      aggregate: { type: 'voice', id: o.campaignId },
      visibility: 'public',
      payload: { userId: o.userId, ...(o.participant ? { participant: o.participant } : {}) },
      correlationId: o.correlationId,
      causationId: null,
      traceparent: null,
    };
    // Une annonce perdue n'empêche rien : le battement recale chaque navigateur
    await publishEvent(bus, event).catch(onError);
  };
}
