/**
 * Module « soundboard » : table d'effets du MJ, une par campagne. Il y range les sons de la
 * bibliothèque qu'il veut avoir sous la main, quels que soient leur type et leur provenance
 * (fichier, YouTube, catalogue), dans son ordre.
 *
 *   GET /v1/audio/campaigns/:id/soundboard
 *   PUT /v1/audio/campaigns/:id/soundboard   { assetIds, version? }
 *
 * Un son supprimé de la bibliothèque disparaît de la lecture (filtré), sans réécriture.
 */
import { changesPayload, Soundboard, SOUNDBOARD_MAX } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent } from '../../db/outbox.js';
import { assets, soundboards } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  actorOf,
  CampaignParams,
  currentUser,
  eventContext,
  requireGm,
  sendProblem,
  Uuid,
} from '../common.js';

type Reader = Pick<Db, 'select'>;

const AssetIds = z
  .array(Uuid('Identifiant de son invalide'))
  .max(SOUNDBOARD_MAX, `${SOUNDBOARD_MAX} sons au plus`)
  .refine((a) => new Set(a).size === a.length, 'Un son en double');

/** Table d'effets lue en base, sans les sons supprimés depuis. Sans ligne : vide, version 0. */
export async function soundboardOf(db: Reader, campaignId: string): Promise<Soundboard> {
  const [row] = await db.select().from(soundboards).where(eq(soundboards.campaignId, campaignId));
  if (!row || !row.assetIds.length) return { assetIds: [], version: row?.version ?? 0 };
  const living = await db
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(
        eq(assets.campaignId, campaignId),
        inArray(assets.id, row.assetIds),
        isNull(assets.deletedAt),
      ),
    );
  const ids = new Set(living.map((a) => a.id));
  return { assetIds: row.assetIds.filter((id) => ids.has(id)), version: row.version };
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/audio/campaigns/:id/soundboard',
    { ...auth, schema: { params: CampaignParams, response: { 200: Soundboard } } },
    async (req) => {
      await requireGm(deps, req.params.id, currentUser(req));
      return soundboardOf(db, req.params.id);
    },
  );

  r.put(
    '/v1/audio/campaigns/:id/soundboard',
    {
      ...auth,
      schema: {
        params: CampaignParams,
        body: z.object({
          assetIds: AssetIds,
          version: z.number().int().nonnegative().optional(),
        }),
        response: { 200: Soundboard },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const campaignId = req.params.id;
      const role = await requireGm(deps, campaignId, userId);
      const result = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`audio-soundboard:${campaignId}`}))`,
        );
        const current = await soundboardOf(tx, campaignId);
        if (req.body.version !== undefined && req.body.version !== current.version)
          return { conflict: current } as const;
        const assetIds = req.body.assetIds;
        if (assetIds.length) {
          const found = await tx
            .select({ id: assets.id })
            .from(assets)
            .where(
              and(
                eq(assets.campaignId, campaignId),
                inArray(assets.id, assetIds),
                isNull(assets.deletedAt),
              ),
            );
          if (found.length !== assetIds.length)
            throw new HttpError(
              422,
              'Son invalide',
              'asset_not_found',
              'Un son de la table d’effets est introuvable',
            );
        }
        const same =
          assetIds.length === current.assetIds.length &&
          assetIds.every((a, i) => a === current.assetIds[i]);
        if (same && current.version > 0) return { board: current } as const;
        const version = current.version + 1;
        await tx
          .insert(soundboards)
          .values({ campaignId, assetIds, version, updatedBy: userId })
          .onConflictDoUpdate({
            target: soundboards.campaignId,
            set: { assetIds, version, updatedBy: userId, updatedAt: sql`now()` },
          });
        const board: Soundboard = { assetIds, version };
        await appendEvent(tx, eventContext(req), {
          type: 'audio.soundboard_updated',
          actor: actorOf(userId, role),
          aggregate: { type: 'audio_soundboard', id: campaignId },
          payload: {
            soundboard: board,
            ...changesPayload({ assetIds: current.assetIds }, { assetIds }),
          },
          visibility: 'gm_only',
          campaignId,
        });
        return { board } as const;
      });
      if ('conflict' in result)
        return sendProblem(reply, 409, 'Conflit', 'version_conflict', {
          detail: 'La table d’effets a été modifiée entre-temps',
          current: result.conflict,
        });
      return result.board;
    },
  );
};
