/** Schémas Zod partagés par les routes du service. */
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ACTOR_ROLES, VISIBILITIES, type EventRow } from '../db/schema.js';

export const Uuid = (message: string) => z.uuid(message).transform((s) => s.toLowerCase());
export const CampaignId = Uuid('Identifiant de campagne invalide');
export const CharacterId = Uuid('Identifiant de personnage invalide');
export const UserId = Uuid('Identifiant d’utilisateur invalide');

/** Rang dans une campagne (querystring). */
export const Seq = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/**
 * Types filtrés, séparés par des virgules : exacts (`character.hp_changed`)
 * ou par domaine (`legacy.*`).
 */
export const Types = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  )
  .pipe(
    z
      .array(
        z
          .string()
          .regex(
            /^[a-z][a-z0-9_]*\.(?:[a-z][a-z0-9_]*|\*)$/,
            'Type attendu : domaine.action ou domaine.*',
          ),
      )
      .max(20, '20 types au plus'),
  );

/**
 * Un événement tel que l'API le renvoie : l'enveloppe du bus (`roomId` est
 * l'identifiant de la campagne), son rang `seq` dans la campagne et le
 * personnage concerné (`characterId`, dérivé : agrégat personnage, sinon
 * personnage incarné par l'auteur).
 */
export const HistoryEvent = z.object({
  id: z.string(),
  seq: z.number().int().nullable(),
  type: z.string(),
  version: z.number().int(),
  occurredAt: z.string(),
  recordedAt: z.string(),
  roomId: z.string().nullable(),
  actor: z.object({
    userId: z.string().nullable(),
    role: z.enum(ACTOR_ROLES),
    characterId: z.string().nullable(),
  }),
  aggregate: z.object({ type: z.string(), id: z.string() }),
  characterId: z.string().nullable(),
  visibility: z.enum(VISIBILITIES),
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.string(),
  causationId: z.string().nullable(),
});
export type HistoryEventApi = z.output<typeof HistoryEvent>;

/** Colonnes lues pour l'API (ni hash ni traceparent). */
export type ApiRow = Omit<EventRow, 'hash' | 'prevHash' | 'traceparent'>;

export function toApi(r: ApiRow): HistoryEventApi {
  return {
    id: r.id,
    seq: r.seq,
    type: r.type,
    version: r.version,
    occurredAt: r.occurredAt.toISOString(),
    recordedAt: r.recordedAt.toISOString(),
    roomId: r.campaignId,
    actor: { userId: r.actorId, role: r.actorRole, characterId: r.actorCharacterId },
    aggregate: { type: r.aggregateType, id: r.aggregateId },
    characterId: r.characterId,
    visibility: r.visibility,
    payload: r.payload,
    correlationId: r.correlationId,
    causationId: r.causationId,
  };
}

export const currentUser = (req: FastifyRequest) => req.user!.userId.toLowerCase();
