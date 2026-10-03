/**
 * Module « cues » : effets ponctuels (§ 3.6), lancés par le MJ seul (décision Q4).
 *
 *   POST /v1/audio/campaigns/:id/cues                 { cueId, assetId, volume? } → { cueId, startAt }
 *   POST /v1/audio/campaigns/:id/cues/:cueId/stop     MJ ou auteur
 *   POST /v1/audio/campaigns/:id/cues/stop            MJ : tous
 *
 * Un effet est un événement, pas un état : `audio.cue_played` porte un
 * `startAt` serveur un peu dans le futur (CUE_LEAD_MS), pour que tous les
 * clients le démarrent ensemble ; un client le joue s'il date de moins de 3 s.
 * `cueId` (choisi par le client) sert de clé d'idempotence.
 */
import type { CuePlayedPayload } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, count, eq, gt, isNull, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import { assets, cues } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { toPlaybackAsset } from '../assets/view.js';
import {
  actorOf,
  CampaignParams,
  currentUser,
  eventContext,
  memberRole,
  requireGm,
  Uuid,
} from '../common.js';

const RATE_WINDOW_MS = 10_000;

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.post(
    '/v1/audio/campaigns/:id/cues',
    {
      ...auth,
      schema: {
        params: CampaignParams,
        body: z.object({
          cueId: Uuid('Identifiant d’effet invalide'),
          assetId: Uuid('Identifiant de son invalide'),
          volume: z.number().min(0).max(1).optional(),
        }),
        response: { 201: z.object({ cueId: z.string(), startAt: z.iso.datetime() }) },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const campaignId = req.params.id;
      const role = await requireGm(deps, campaignId, userId);
      const { cueId, assetId } = req.body;
      const volume = req.body.volume ?? 1;

      const result = await db.transaction(async (tx) => {
        // Rejoué (même cueId) : même réponse, pas de second événement
        const [known] = await tx.select().from(cues).where(eq(cues.id, cueId));
        if (known) {
          if (known.startedBy !== userId || known.campaignId !== campaignId)
            throw HttpError.conflict('Identifiant d’effet déjà utilisé', 'cue_id_taken');
          return { cueId, startAt: known.startAt.toISOString() };
        }
        const now = deps.now();
        // Débit par utilisateur, compté en base (toutes instances confondues)
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`audio-cues:${userId}`}))`);
        const [{ n } = { n: 0 }] = await tx
          .select({ n: count() })
          .from(cues)
          .where(and(eq(cues.startedBy, userId), gt(cues.startAt, new Date(now - RATE_WINDOW_MS))));
        if (n >= deps.config.CUE_RATE_PER_USER)
          throw new HttpError(
            429,
            'Trop de requêtes',
            'rate_limited',
            'Trop d’effets lancés d’un coup',
          );
        const [asset] = await tx
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, assetId),
              eq(assets.campaignId, campaignId),
              isNull(assets.deletedAt),
            ),
          );
        if (!asset) throw HttpError.notFound('Son introuvable');
        if (asset.status !== 'ready')
          throw new HttpError(
            422,
            'Son indisponible',
            'asset_not_ready',
            'Ce son n’est pas prêt à être joué',
          );
        const startAt = new Date(now + deps.config.CUE_LEAD_MS);
        await tx
          .insert(cues)
          .values({ id: cueId, campaignId, assetId, volume, startedBy: userId, startAt });
        const payload: CuePlayedPayload = {
          cueId,
          asset: toPlaybackAsset(asset, deps.storage),
          startAt: startAt.toISOString(),
          volume,
          startedBy: userId,
        };
        await appendEvent(tx, eventContext(req), {
          type: 'audio.cue_played',
          actor: actorOf(userId, role),
          aggregate: { type: 'audio_cue', id: cueId },
          payload: payload as unknown as Record<string, unknown>,
          visibility: 'public',
          campaignId,
        });
        return { cueId, startAt: payload.startAt };
      });
      reply.code(201);
      return result;
    },
  );

  r.post(
    '/v1/audio/campaigns/:id/cues/:cueId/stop',
    {
      ...auth,
      schema: { params: CampaignParams.extend({ cueId: Uuid('Identifiant d’effet invalide') }) },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const { id: campaignId, cueId } = req.params;
      const role = await memberRole(deps, campaignId, userId);
      await db.transaction(async (tx) => {
        const [cue] = await tx
          .select()
          .from(cues)
          .where(and(eq(cues.id, cueId), eq(cues.campaignId, campaignId)))
          .for('update');
        if (!cue) throw HttpError.notFound('Effet introuvable');
        if (role !== 'gm' && cue.startedBy !== userId)
          throw HttpError.forbidden('Seuls le MJ et l’auteur arrêtent un effet');
        if (cue.stoppedAt) return;
        await tx
          .update(cues)
          .set({ stoppedAt: new Date(deps.now()) })
          .where(eq(cues.id, cueId));
        await appendEvent(tx, eventContext(req), {
          type: 'audio.cues_stopped',
          actor: actorOf(userId, role),
          aggregate: { type: 'audio_cue', id: cueId },
          payload: { cueIds: [cueId] },
          visibility: 'public',
          campaignId,
        });
      });
      reply.code(204);
    },
  );

  r.post(
    '/v1/audio/campaigns/:id/cues/stop',
    { ...auth, schema: { params: CampaignParams } },
    async (req, reply) => {
      const userId = currentUser(req);
      const campaignId = req.params.id;
      const role = await requireGm(deps, campaignId, userId);
      await db.transaction(async (tx) => {
        await tx
          .update(cues)
          .set({ stoppedAt: new Date(deps.now()) })
          .where(and(eq(cues.campaignId, campaignId), isNull(cues.stoppedAt)));
        // Toujours publié : un client arrête aussi les effets qu'il joue localement
        await appendEvent(tx, eventContext(req), {
          type: 'audio.cues_stopped',
          actor: actorOf(userId, role),
          aggregate: { type: 'audio_cue', id: campaignId },
          payload: { all: true },
          visibility: 'public',
          campaignId,
        });
      });
      reply.code(204);
    },
  );
};
