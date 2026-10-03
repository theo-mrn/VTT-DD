/**
 * Module « internal » : routes appelées par les autres services, jamais
 * relayées par la gateway (qui refuse tout /internal/*). Pas de jeton
 * utilisateur : le secret partagé INTERNAL_API_SECRET (en-tête
 * x-internal-secret, comparé à temps constant) est exigé. Sans ce secret
 * configuré, les routes n'existent pas.
 *
 *   GET /internal/campaigns/:campaignId/events?afterSeq=&limit=&userId=&role=
 *       rattrapage d'une campagne : les événements de rang supérieur à afterSeq,
 *       du plus ancien au plus récent, et le dernier rang attribué (lastSeq).
 *       Avec userId et role, la visibilité est appliquée comme pour
 *       GET /v1/history ; sans, tout est renvoyé (l'appelant filtre lui-même).
 *       limit=0 : lastSeq seul. Sans appelant aujourd'hui (realtime rejoue depuis
 *       JetStream) : prévue pour un rattrapage au-delà des 7 jours du flux.
 */
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { requireInternalSecret } from '../../internal/secret.js';
import { lastSeq, listEvents } from '../history/repository.js';
import { CampaignId, HistoryEvent, Seq, toApi, UserId } from '../schemas.js';

export const MAX_DELTA = 500;

export const register: Module = async (app, deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) {
    app.log.warn('INTERNAL_API_SECRET absent : route interne de rattrapage désactivée');
    return;
  }
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;

  r.get(
    '/internal/campaigns/:campaignId/events',
    {
      // Secret vérifié avant la validation : rien ne fuit sans lui
      preValidation: requireInternalSecret(secret),
      // Appels entre services (peu d'IP) : limite large
      config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: {
        hide: true,
        params: z.object({ campaignId: CampaignId }),
        querystring: z
          .object({
            afterSeq: Seq.default(0),
            limit: z.coerce.number().int().min(0).max(MAX_DELTA).default(MAX_DELTA),
            userId: UserId.optional(),
            role: z.enum(['gm', 'player', 'spectator']).optional(),
          })
          .refine((q) => !q.role || q.userId, {
            message: 'role demande userId',
            path: ['userId'],
          }),
        response: {
          200: z.object({
            campaignId: z.string(),
            lastSeq: z.number().int(),
            events: z.array(HistoryEvent),
            hasMore: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { campaignId } = req.params;
      const q = req.query;
      if (q.limit === 0) {
        const last = await lastSeq(db, campaignId);
        return { campaignId, lastSeq: last, events: [], hasMore: last > q.afterSeq };
      }
      const { rows, hasMore } = await listEvents(db, {
        campaignId,
        afterSeq: q.afterSeq,
        limit: q.limit,
        order: 'asc',
        viewer: q.role && q.userId ? { userId: q.userId, role: q.role } : undefined,
      });
      // Tête lue après les événements : elle n'est jamais en retard sur ceux renvoyés
      const last = await lastSeq(db, campaignId);
      return { campaignId, lastSeq: last, events: rows.map(toApi), hasMore };
    },
  );
};
