/**
 * Routage des événements du bus vers les connexions, selon la visibilité de
 * l'enveloppe (`@vtt/contracts`). Fonctions pures : la même règle sert à la
 * diffusion en direct (rooms Socket.IO) et au rejeu d'un client (filtre par
 * connexion).
 *
 * Rooms :
 *  - `user:<id>`          toutes les connexions d'un utilisateur (rejointe au handshake) ;
 *  - `campaign:<id>`      les abonnés d'une campagne (membres vérifiés auprès de campaign) ;
 *  - `campaign:<id>:gm`   les abonnés MJ de la campagne ;
 *  - `replay:<id>`        les connexions en cours de rejeu de la campagne : exclues
 *                         de la diffusion directe, leurs événements passent par un tampon.
 *
 * Visibilité :
 *  - `public`  → toute la campagne ;
 *  - `gm_only` → les MJ ; l'auteur (`actor.userId`) reçoit une version expurgée
 *                (type et agrégat, sans charge utile) : il sait que son action a
 *                eu lieu sans lire ce qui lui est caché (jet caché au MJ) ;
 *  - `owner`   → l'auteur seul, sur toutes ses connexions. Pas le MJ : dice y
 *                range les jets `self` (« l'auteur seul, MJ compris »).
 * Hors campagne (`roomId` null) : l'auteur seul (`public` ou `owner`).
 */
import type { EventEnvelope } from '@vtt/contracts';

export type CampaignRole = 'gm' | 'player' | 'spectator';

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  campaign: (campaignId: string) => `campaign:${campaignId}`,
  gm: (campaignId: string) => `campaign:${campaignId}:gm`,
  replaying: (campaignId: string) => `replay:${campaignId}`,
};

/** Rooms qui reçoivent l'événement complet, et celles qui reçoivent sa version expurgée. */
export interface Targets {
  full: string[];
  redacted: string[];
}

export function targetsFor(event: EventEnvelope): Targets {
  const actor = event.actor.userId;
  if (!event.roomId) {
    const toActor = actor && event.visibility !== 'gm_only';
    return { full: toActor ? [rooms.user(actor)] : [], redacted: [] };
  }
  switch (event.visibility) {
    case 'public':
      return { full: [rooms.campaign(event.roomId)], redacted: [] };
    case 'gm_only':
      return { full: [rooms.gm(event.roomId)], redacted: actor ? [rooms.user(actor)] : [] };
    case 'owner':
      return { full: actor ? [rooms.user(actor)] : [], redacted: [] };
  }
}

export type Delivery = 'full' | 'redacted' | null;

/** Ce que reçoit un abonné de la campagne de l'événement : même règle que `targetsFor`. */
export function deliveryFor(
  event: EventEnvelope,
  viewer: { userId: string; role: CampaignRole },
): Delivery {
  const mine = event.actor.userId !== null && event.actor.userId === viewer.userId;
  switch (event.visibility) {
    case 'public':
      return 'full';
    case 'gm_only':
      return viewer.role === 'gm' ? 'full' : mine ? 'redacted' : null;
    case 'owner':
      return mine ? 'full' : null;
  }
}

/** Version expurgée : l'enveloppe sans sa charge utile. */
export function redact(event: EventEnvelope): EventEnvelope {
  return { ...event, payload: {} };
}

/** Message `event` envoyé au client : la séquence du flux sert de curseur de reprise. */
export interface EventPacket {
  seq: number;
  event: EventEnvelope;
  /** Présent (true) si la charge utile a été retirée. */
  redacted?: true;
}

export function packet(event: EventEnvelope, seq: number, redacted = false): EventPacket {
  return redacted ? { seq, event: redact(event), redacted: true } : { seq, event };
}
