/**
 * Module « history » : timeline d'une campagne et vérification de sa chaîne
 * de hash (contrat : docs/api-history.md). Remplace la lecture directe de
 * `Historique/{roomId}/events` par l'ancienne app (Historique.tsx).
 *
 * Toutes les routes demandent un jeton d'accès ; l'appelant doit être membre
 * de la campagne (404 sinon, comme si elle n'existait pas).
 *
 *   GET /v1/history?campaignId=&afterSeq=&beforeSeq=&from=&to=&characterId=&types=&limit=&order=
 *       événements visibles par l'appelant : tout pour le MJ ; `public` et
 *       `owner` dont il est l'auteur pour les autres, jamais `gm_only`.
 *       Ordre par défaut : du plus récent au plus ancien, sauf avec afterSeq
 *       (rattrapage : du plus ancien au plus récent).
 *   GET /v1/history/verify?campaignId=
 *       recalcule la chaîne de hash de la campagne (MJ seulement).
 */
import { HttpError } from '@vtt/platform';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CampaignRole } from '../../clients/campaign.js';
import type { Deps, Module } from '../../deps.js';
import {
  CampaignId,
  CharacterId,
  currentUser,
  HistoryEvent,
  Seq,
  toApi,
  Types,
} from '../schemas.js';
import { listEvents, verifyChain } from './repository.js';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export function campaignNotFound(): HttpError {
  return new HttpError(404, 'Ressource introuvable', 'campaign_not_found', 'Campagne introuvable');
}

/** Rôle de l'appelant dans la campagne ; 404 s'il n'en est pas membre. */
export async function memberRole(
  deps: Pick<Deps, 'campaigns'>,
  campaignId: string,
  userId: string,
): Promise<CampaignRole> {
  const role = await deps.campaigns.role(campaignId, userId);
  if (!role) throw campaignNotFound();
  return role;
}

const ListQuery = z
  .object({
    campaignId: CampaignId,
    afterSeq: Seq.optional(),
    beforeSeq: Seq.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    characterId: CharacterId.optional(),
    types: Types.optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    order: z.enum(['asc', 'desc']).optional(),
  })
  .refine(
    (q) => q.afterSeq === undefined || q.beforeSeq === undefined || q.afterSeq < q.beforeSeq,
    {
      message: 'afterSeq doit être inférieur à beforeSeq',
      path: ['afterSeq'],
    },
  );

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  // Jeton vérifié juste avant la validation (un anonyme reçoit toujours 401)
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/history',
    {
      ...auth,
      schema: {
        querystring: ListQuery,
        response: { 200: z.object({ events: z.array(HistoryEvent), hasMore: z.boolean() }) },
      },
    },
    async (req) => {
      const q = req.query;
      const userId = currentUser(req);
      const role = await memberRole(deps, q.campaignId, userId);
      const { rows, hasMore } = await listEvents(db, {
        campaignId: q.campaignId,
        afterSeq: q.afterSeq,
        beforeSeq: q.beforeSeq,
        from: q.from ? new Date(q.from) : undefined,
        to: q.to ? new Date(q.to) : undefined,
        characterId: q.characterId,
        types: q.types,
        limit: q.limit,
        order: q.order ?? (q.afterSeq !== undefined ? 'asc' : 'desc'),
        viewer: { userId, role },
      });
      return { events: rows.map(toApi), hasMore };
    },
  );

  r.get(
    '/v1/history/verify',
    {
      ...auth,
      // Recalcule toute la chaîne : limite serrée
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: {
        querystring: z.object({ campaignId: CampaignId }),
        response: {
          200: z.object({
            campaignId: z.string(),
            ok: z.boolean(),
            events: z.number().int(),
            lastSeq: z.number().int(),
            firstBroken: z
              .object({ seq: z.number().int(), id: z.string().nullable(), reason: z.string() })
              .nullable(),
          }),
        },
      },
    },
    async (req) => {
      const { campaignId } = req.query;
      const role = await memberRole(deps, campaignId, currentUser(req));
      if (role !== 'gm')
        throw new HttpError(
          403,
          'Accès refusé',
          'gm_only',
          'Seul le MJ vérifie la chaîne de l’historique',
        );
      const report = await verifyChain(db, campaignId);
      if (!report.ok)
        req.log.warn({ campaignId, ...report.firstBroken }, 'chaîne d’historique cassée');
      return { campaignId, ...report };
    },
  );
};
