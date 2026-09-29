/**
 * Protocole Socket.IO du service (docs/api-realtime.md). Les accusés de
 * réception (`ack`) sont facultatifs côté client.
 */
import { z } from 'zod';
import type { CampaignRole, EventPacket } from './routing.js';

/** Chemin du serveur Socket.IO, relayé tel quel par la gateway. */
export const SOCKET_PATH = '/v1/realtime/socket.io';

const CampaignId = z.uuid();

export const SubscribeInput = z.object({
  campaignId: CampaignId,
  /** Dernière séquence reçue : les événements suivants sont rejoués avant l'accusé. */
  afterSeq: z.number().int().nonnegative().optional(),
});

export const CampaignInput = z.object({ campaignId: CampaignId });

export const EphemeralInput = z.object({
  campaignId: CampaignId,
  /** `cursor`, `drag`, `ping`… : libre, relayé tel quel. */
  kind: z.string().regex(/^[a-z][a-z0-9_.:-]{0,39}$/),
  data: z.unknown().optional(),
  /** Réservé aux MJ de la campagne (ex. déplacement d'un jeton caché). */
  gmOnly: z.boolean().optional(),
  /**
   * Destinataires nommés (50 au plus) : ces utilisateurs, s'ils suivent la campagne, et les
   * MJ ; jamais les autres (ex. PNJ vu de certains joueurs seulement). Ignoré avec `gmOnly`.
   */
  toUsers: z
    .array(z.uuid().transform((s) => s.toLowerCase()))
    .max(50)
    .optional(),
});

export type SubscribeError =
  'invalid' | 'forbidden' | 'unavailable' | 'busy' | 'rate_limited' | 'too_many_subscriptions';

export type SubscribeAck =
  | {
      ok: true;
      campaignId: string;
      role: CampaignRole;
      /** Curseur à garder : dernier `seq` couvert (rejeu compris). null sans bus. */
      seq: number | null;
      /** Événements rejoués avant cet accusé. */
      replayed: number;
      /** Rejeu impossible (trop ancien, trop long, bus indisponible) : recharger l'état en REST. */
      resync: boolean;
    }
  | { ok: false; error: SubscribeError };

export interface PresenceUser {
  userId: string;
  role: CampaignRole;
  /** Onglets ou appareils connectés. */
  connections: number;
}

export interface PresencePayload {
  campaignId: string;
  users: PresenceUser[];
}

export type PresenceAck = ({ ok: true } & PresencePayload) | { ok: false; error: 'not_subscribed' };

export interface EphemeralMessage {
  campaignId: string;
  kind: string;
  data: unknown;
  from: { userId: string; role: CampaignRole };
  /** Horodatage du serveur (ms), pour ignorer un message plus ancien que le dernier reçu. */
  at: number;
}

export interface ClientToServerEvents {
  subscribe(input: unknown, ack?: (r: SubscribeAck) => void): void;
  unsubscribe(input: unknown, ack?: (r: { ok: boolean }) => void): void;
  ephemeral(input: unknown): void;
  presence(input: unknown, ack?: (r: PresenceAck) => void): void;
}

export interface ServerToClientEvents {
  event(packet: EventPacket): void;
  ephemeral(message: EphemeralMessage): void;
  presence(payload: PresencePayload): void;
  /** Abonnement retiré par le serveur : membre exclu ou parti, campagne supprimée. */
  unsubscribed(payload: { campaignId: string; reason: 'removed' | 'left' | 'deleted' }): void;
  /** Jeton expiré : la connexion est fermée, le client se reconnecte avec un jeton neuf. */
  session_expired(): void;
  rate_limited(payload: { channel: 'ephemeral' }): void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

/** Données de connexion (sérialisables : lues par les autres réplicas via fetchSockets). */
export interface SocketData {
  userId: string;
  /** Campagnes suivies et rôle au moment de l'abonnement. */
  campaigns: Record<string, CampaignRole>;
}
