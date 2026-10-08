/**
 * Voix à la table (docs/voix.md) : contrat entre le front et le service voice
 * (`/v1/voice/campaigns/:id/*`), et charges des événements `voice.*` du bus.
 *
 * Le navigateur ne parle jamais à l'API Cloudflare : il envoie ses descriptions SDP au service,
 * qui crée la session, pousse et tire les pistes, et ne révèle jamais les identifiants de
 * session des autres participants.
 */
import { z } from 'zod';

/** Description SDP échangée avec le SFU (offre ou réponse). */
export const VoiceSdp = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1).max(100_000),
});
export type VoiceSdp = z.infer<typeof VoiceSdp>;

/** Serveurs ICE (STUN, TURN à durée courte) pour la `RTCPeerConnection`. */
export const VoiceIceServers = z.object({
  iceServers: z.array(
    z.object({
      urls: z.union([z.string(), z.array(z.string())]),
      username: z.string().optional(),
      credential: z.string().optional(),
    }),
  ),
});
export type VoiceIceServers = z.infer<typeof VoiceIceServers>;

/** Un participant de la salle vocale d'une campagne, tel que les autres le voient. */
export const VoiceParticipant = z.object({
  userId: z.uuid(),
  /** Peut parler (MJ, joueur) ; un spectateur écoute seulement. */
  speaker: z.boolean(),
  muted: z.boolean(),
  joinedAt: z.iso.datetime({ offset: true }),
  /**
   * Canal privé MJ ↔ joueur (docs/voix.md § 5) : avec qui il parle en privé (vu de toute la
   * table : pastille « privé »), null sinon.
   */
  privateWith: z.uuid().nullable().default(null),
  /** Sa voix privée est envoyée : son correspondant peut la tirer. */
  privateLive: z.boolean().default(false),
});
export type VoiceParticipant = z.infer<typeof VoiceParticipant>;

export const VoiceRoom = z.object({ participants: z.array(VoiceParticipant) });
export type VoiceRoom = z.infer<typeof VoiceRoom>;

/**
 * Rejoindre : l'offre de la `RTCPeerConnection` (avec la piste du micro, `mid` de son
 * émetteur, pour qui parle) ; réponse : la réponse SDP du SFU et la salle.
 */
export const JoinVoice = z.object({
  offer: VoiceSdp,
  /** `mid` du transceiver du micro ; absent : écoute seulement. */
  micMid: z.string().min(1).max(32).optional(),
  muted: z.boolean().default(false),
});
export type JoinVoice = z.input<typeof JoinVoice>;

export const JoinVoiceResult = z.object({
  answer: VoiceSdp,
  room: VoiceRoom,
});
export type JoinVoiceResult = z.infer<typeof JoinVoiceResult>;

/**
 * Tirer les voix de ces participants (et la voix privée de son correspondant) ; réponse :
 * l'offre du SFU et le `mid` de chaque voix.
 */
export const PullVoice = z
  .object({
    userIds: z.array(z.uuid()).max(50).default([]),
    /** Voix privée de ce participant : seulement s'il est en privé avec l'appelant. */
    privateUserIds: z.array(z.uuid()).max(1).default([]),
  })
  .refine((b) => b.userIds.length + b.privateUserIds.length > 0, 'Rien à tirer');
export type PullVoice = z.input<typeof PullVoice>;

export const PullVoiceResult = z.object({
  /** Absente si aucune piste n'a pu être tirée (participants partis). */
  offer: VoiceSdp.optional(),
  tracks: z.array(
    z.object({ userId: z.uuid(), mid: z.string(), private: z.boolean().default(false) }),
  ),
});
export type PullVoiceResult = z.infer<typeof PullVoiceResult>;

/** Ouvrir un canal privé (MJ seulement) avec ce joueur. */
export const OpenPrivateVoice = z.object({ userId: z.uuid() });
export type OpenPrivateVoice = z.infer<typeof OpenPrivateVoice>;

/** Envoyer sa voix privée : offre avec le transceiver de la copie du micro (`mid`). */
export const PushPrivateVoice = z.object({ offer: VoiceSdp, mid: z.string().min(1).max(32) });
export type PushPrivateVoice = z.infer<typeof PushPrivateVoice>;

export const PushPrivateVoiceResult = z.object({ answer: VoiceSdp });
export type PushPrivateVoiceResult = z.infer<typeof PushPrivateVoiceResult>;

/** Réponse à une offre du SFU (après un tirage). */
export const RenegotiateVoice = z.object({ answer: VoiceSdp });
export type RenegotiateVoice = z.infer<typeof RenegotiateVoice>;

/** Battement (toutes les 30 s) et état du micro ; réponse : la salle à jour. */
export const VoiceHeartbeat = z.object({ muted: z.boolean().optional() });
export type VoiceHeartbeat = z.infer<typeof VoiceHeartbeat>;

/** Charges des événements `voice.joined`, `voice.updated`, `voice.left`. */
export const VoiceEventPayload = z.object({
  participant: VoiceParticipant.optional(),
  userId: z.uuid(),
});
export type VoiceEventPayload = z.infer<typeof VoiceEventPayload>;

export const VOICE_EVENTS = ['voice.joined', 'voice.updated', 'voice.left'] as const;
export type VoiceEventType = (typeof VOICE_EVENTS)[number];

/** Battement attendu du navigateur ; sans lui pendant `VOICE_PRESENCE_TTL_S`, il est parti. */
export const VOICE_HEARTBEAT_S = 30;
export const VOICE_PRESENCE_TTL_S = 90;
