/**
 * Module « playlists » : playlists du MJ (§ 4.1).
 *
 *   GET    /v1/audio/campaigns/:id/playlists
 *   POST   /v1/audio/campaigns/:id/playlists                 { name, assetIds? }
 *   PATCH  /v1/audio/campaigns/:id/playlists/:playlistId     { name?, assetIds?, version? }
 *   DELETE /v1/audio/campaigns/:id/playlists/:playlistId
 *
 * Pistes : sons vivants de la campagne, sans doublon. Modifier une playlist en
 * cours de lecture recalcule la file du canal autour de la piste courante.
 */
import { changesPayload, Playlist, uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Tx } from '../../db/outbox.js';
import { assets, playlists } from '../../db/schema.js';
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
import {
  listPlaylists,
  playlistEvent,
  playlistView,
  setItems,
  syncChannelsWithPlaylist,
} from './repository.js';

const Name = z.string().trim().min(1, 'Nom vide').max(100, '100 caractères au plus');
const AssetIds = z
  .array(Uuid('Identifiant de son invalide'))
  .max(500)
  .refine((a) => new Set(a).size === a.length, 'Une piste en double');
const PlaylistParams = CampaignParams.extend({
  playlistId: Uuid('Identifiant de playlist invalide'),
});

/** Toutes les pistes doivent être des sons vivants de la campagne. */
async function checkAssets(tx: Tx, campaignId: string, ids: string[]) {
  if (!ids.length) return;
  const found = await tx
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(eq(assets.campaignId, campaignId), inArray(assets.id, ids), isNull(assets.deletedAt)),
    );
  if (found.length !== ids.length)
    throw new HttpError(
      422,
      'Piste invalide',
      'asset_not_found',
      'Un son de la playlist est introuvable',
    );
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/audio/campaigns/:id/playlists',
    {
      ...auth,
      schema: { params: CampaignParams, response: { 200: z.object({ items: z.array(Playlist) }) } },
    },
    async (req) => {
      await requireGm(deps, req.params.id, currentUser(req));
      return { items: await listPlaylists(db, req.params.id) };
    },
  );

  r.post(
    '/v1/audio/campaigns/:id/playlists',
    {
      ...auth,
      schema: {
        params: CampaignParams,
        body: z.object({ name: Name, assetIds: AssetIds.optional() }),
        response: { 201: Playlist },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const campaignId = req.params.id;
      const role = await requireGm(deps, campaignId, userId);
      const playlist = await db.transaction(async (tx) => {
        const assetIds = req.body.assetIds ?? [];
        await checkAssets(tx, campaignId, assetIds);
        const [row] = await tx
          .insert(playlists)
          .values({ id: uuidv7(), campaignId, name: req.body.name, createdBy: userId })
          .returning();
        await setItems(tx, row!.id, assetIds);
        const view = await playlistView(tx, row!);
        await playlistEvent(
          tx,
          eventContext(req),
          'audio.playlist_created',
          campaignId,
          row!.id,
          actorOf(userId, role),
          {
            playlist: view,
          },
        );
        return view;
      });
      reply.code(201);
      return playlist;
    },
  );

  r.patch(
    '/v1/audio/campaigns/:id/playlists/:playlistId',
    {
      ...auth,
      schema: {
        params: PlaylistParams,
        body: z
          .object({
            name: Name.optional(),
            assetIds: AssetIds.optional(),
            version: z.number().int().positive().optional(),
          })
          .refine((b) => b.name !== undefined || b.assetIds !== undefined, 'Rien à modifier'),
        response: { 200: Playlist },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const { id: campaignId, playlistId } = req.params;
      const role = await requireGm(deps, campaignId, userId);
      const actor = actorOf(userId, role);
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(playlists)
          .where(and(eq(playlists.id, playlistId), eq(playlists.campaignId, campaignId)))
          .for('update');
        if (!row) throw HttpError.notFound('Playlist introuvable');
        const before = await playlistView(tx, row);
        if (req.body.version !== undefined && req.body.version !== row.version)
          return { conflict: before } as const;
        const name = req.body.name ?? row.name;
        const assetIds = req.body.assetIds ?? before.assetIds;
        const sameItems =
          assetIds.length === before.assetIds.length &&
          assetIds.every((a, i) => a === before.assetIds[i]);
        if (name === row.name && sameItems) return { playlist: before } as const;
        if (!sameItems) {
          await checkAssets(tx, campaignId, assetIds);
          await setItems(tx, playlistId, assetIds);
        }
        const [updated] = await tx
          .update(playlists)
          .set({ name, version: sql`${playlists.version} + 1`, updatedAt: sql`now()` })
          .where(eq(playlists.id, playlistId))
          .returning();
        const after = await playlistView(tx, updated!);
        const ctx = eventContext(req);
        await playlistEvent(tx, ctx, 'audio.playlist_updated', campaignId, playlistId, actor, {
          playlist: after,
          ...changesPayload(
            { name: before.name, assetIds: before.assetIds },
            { name: after.name, assetIds: after.assetIds },
          ),
        });
        if (!sameItems)
          await syncChannelsWithPlaylist(tx, {
            campaignId,
            playlistId,
            assetIds,
            storage: deps.storage,
            ctx,
            actor,
            nowMs: deps.now(),
          });
        return { playlist: after } as const;
      });
      if ('conflict' in result)
        return sendProblem(reply, 409, 'Conflit', 'version_conflict', {
          detail: 'La playlist a été modifiée entre-temps',
          current: result.conflict,
        });
      return result.playlist;
    },
  );

  r.delete(
    '/v1/audio/campaigns/:id/playlists/:playlistId',
    { ...auth, schema: { params: PlaylistParams } },
    async (req, reply) => {
      const userId = currentUser(req);
      const { id: campaignId, playlistId } = req.params;
      const role = await requireGm(deps, campaignId, userId);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .delete(playlists)
          .where(and(eq(playlists.id, playlistId), eq(playlists.campaignId, campaignId)))
          .returning();
        if (!row) throw HttpError.notFound('Playlist introuvable');
        // Un canal qui la jouait garde sa file (playlist_id passe à null par la clé étrangère)
        await playlistEvent(
          tx,
          eventContext(req),
          'audio.playlist_deleted',
          campaignId,
          playlistId,
          actorOf(userId, role),
          {
            playlistId,
          },
        );
      });
      reply.code(204);
    },
  );
};
