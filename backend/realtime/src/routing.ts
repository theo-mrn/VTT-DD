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
 *  - `gm_only` → les MJ, et les utilisateurs de `payload.visibleTo` (carte :
 *                éléments cachés ou en visibilité `custom`), complet ; l'auteur
 *                (`actor.userId`), s'il n'est pas parmi eux, reçoit une version
 *                expurgée (type et agrégat, sans charge utile) : il sait que son
 *                action a eu lieu sans lire ce qui lui est caché (jet caché au MJ) ;
 *  - `owner`   → l'auteur seul, sur toutes ses connexions. Pas le MJ : dice y
 *                range les jets `self` (« l'auteur seul, MJ compris »).
 * Hors campagne (`roomId` null) : l'auteur seul (`public` ou `owner`), les
 * utilisateurs de `visibleTo` pour `gm_only`.
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

/**
 * Utilisateurs autorisés en plus des MJ pour un événement `gm_only`
 * (`payload.visibleTo`, identifiants d'utilisateurs), sans doublon.
 */
export function visibleToOf(event: EventEnvelope): string[] {
  const list = event.payload.visibleTo;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((id): id is string => typeof id === 'string' && id !== ''))];
}

export function targetsFor(event: EventEnvelope): Targets {
  const actor = event.actor.userId;
  // Un MJ ou un utilisateur présent dans plusieurs rooms ne reçoit l'événement qu'une fois
  // (Socket.IO dédoublonne les connexions d'une même émission)
  const allowed = event.visibility === 'gm_only' ? visibleToOf(event).map(rooms.user) : [];
  if (!event.roomId) {
    const toActor = actor && event.visibility !== 'gm_only';
    return { full: toActor ? [rooms.user(actor)] : allowed, redacted: [] };
  }
  switch (event.visibility) {
    case 'public':
      return { full: [rooms.campaign(event.roomId)], redacted: [] };
    case 'gm_only':
      return {
        full: [rooms.gm(event.roomId), ...allowed],
        redacted: actor && !allowed.includes(rooms.user(actor)) ? [rooms.user(actor)] : [],
      };
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
      if (viewer.role === 'gm' || visibleToOf(event).includes(viewer.userId)) return 'full';
      return mine ? 'redacted' : null;
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
