/**
 * Tokens : les personnages engagés posés sur les cartes.
 *
 *   GET    /v1/campaigns/:id/maps/:mapId/tokens?bbox=              tokens présents (filtrés pour un joueur)
 *   GET    /v1/campaigns/:id/maps/:mapId/tokens/near?x=&y=&radius= tokens dans un rayon (ST_DWithin)
 *   POST   /v1/campaigns/:id/maps/:mapId/tokens                    poser un personnage (MJ)
 *   PATCH  /v1/campaigns/:id/maps/:mapId/tokens/:itemId            modifier / déplacer
 *   DELETE /v1/campaigns/:id/maps/:mapId/tokens/:itemId            retirer (MJ)
 *   POST   /v1/campaigns/:id/maps/:mapId/tokens/move               déplacer plusieurs tokens (fin de drag)
 *   POST   /v1/campaigns/:id/maps/:mapId/travel                    amener des personnages sur la carte
 *
 * Un joueur déplace les tokens de ses personnages (et règle leur vision) ; le
 * reste est réservé au MJ. Un déplacement produit un seul `token.moved`
 * (from/to) : les positions intermédiaires du drag passent par realtime.
 */
import { CreateMapToken, MoveMapTokens, TravelToMap, UpdateMapToken, uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  mapLayers,
  mapSettings,
  mapTokens,
  type MapPoint,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  Bbox,
  checkLayer,
  envelope,
  ItemParams,
  loadMap,
  MapParams,
  mapEvent,
  notFound,
  requestContext,
  requireGm,
  mapSettingsOf,
  requireWriter,
  sqlBlocksSight,
  sqlInFog,
  sqlPoint,
  sqlUuids,
  versionConflict,
  viewerOf,
  type MapRow,
  type Viewer,
} from './common.js';

export type TokenRow = typeof mapTokens.$inferSelect;

export const tokenApi = (t: TokenRow) => ({
  id: t.id,
  mapId: t.mapId,
  characterId: t.characterId,
  layerId: t.layerId,
  z: t.z,
  pos: t.pos,
  scale: t.scale,
  shape: t.shape,
  imageUrl: t.imageUrl,
  visibility: t.visibility,
  visibleTo: t.visibleTo,
  visionRadius: t.visionRadius,
  visionBoost: t.visionBoost,
  notes: t.notes,
  audio: t.audio,
  interactions: t.interactions,
  version: t.version,
  updatedAt: t.updatedAt.toISOString(),
});

/**
 * Champs qu'un joueur modifie sur le token de son personnage. Pas le rayon de
 * vision : il verrait les tokens cachés ; « Vision augmentée » le triple.
 */
const PLAYER_FIELDS = new Set(['pos', 'visionBoost', 'version']);

/** Vision augmentée (ancienne carte) : rayon triplé à l'activation, divisé par 3 ensuite. */
const BOOST = 3;

// ─── Visibilité côté serveur (reprise de utils/visibility-checks.ts) ────────

/**
 * Tokens présents sur la carte que l'appelant voit ; `null` pour le MJ (tout). Règles de
 * l'ancienne carte (utils/visibility-checks.ts), sur les zones de brouillard, la
 * transparence des murs et le côté bloquant des murs à sens unique. Remplacé par
 * @vtt/vision au lot 2 (docs/carte.md § 9).
 */
export async function visibleTokenIds(
  db: Db | Tx,
  v: Viewer,
  mapId: string,
): Promise<Set<string> | null> {
  if (v.isGm) return null;
  const mine = sqlUuids(v.characterIds);
  const { rows } = await db.execute<{ id: string }>(sql`
    WITH m AS (
      SELECT coalesce((layers->>'obstacles')::boolean, true) AS walls
        FROM campaign.maps WHERE id = ${mapId}
    ),
    t AS (
      -- contenu d'un calque masqué aux joueurs : jamais envoyé (sauf ses propres tokens)
      SELECT t.id, t.pos, t.visibility, t.visible_to, t.vision_radius,
             cc.side = 'players' AS player, t.character_id = ANY(${mine}) AS mine
        FROM campaign.map_tokens t
        JOIN campaign.campaign_characters cc
          ON cc.campaign_id = t.campaign_id AND cc.character_id = t.character_id
        JOIN campaign.map_layers ly ON ly.id = t.layer_id
       WHERE t.map_id = ${mapId} AND t.present
         AND (ly.visible_to_players OR t.character_id = ANY(${mine}))
    ),
    eyes AS (SELECT pos, vision_radius, mine FROM t WHERE mine OR visibility = 'ally'),
    lit AS (
      -- une lumière attachée à un token est là où il est
      SELECT coalesce(tk.pos, l.pos) AS pos, l.radius * coalesce(s.pixels_per_unit, 50) AS r
        FROM campaign.map_lights l
        LEFT JOIN campaign.map_tokens tk ON tk.id = l.attached_token_id AND tk.present
        LEFT JOIN campaign.map_settings s ON s.campaign_id = l.campaign_id
       WHERE l.map_id = ${mapId} AND l.visible
    )
    SELECT t.id FROM t, m
     WHERE t.visibility <> 'invisible' AND (
       t.player OR t.mine OR t.visibility = 'ally'
       OR (t.visibility = 'custom' AND t.visible_to && ${mine})
       OR (t.visibility IN ('visible', 'hidden')
         -- ligne de vue : cachée si chacun de mes tokens la voit coupée par un obstacle
         AND NOT (m.walls AND EXISTS (SELECT 1 FROM eyes WHERE eyes.mine) AND NOT EXISTS (
           SELECT 1 FROM eyes e WHERE e.mine AND NOT EXISTS (
             SELECT 1 FROM campaign.map_obstacles o
              WHERE o.map_id = ${mapId} AND ${sqlBlocksSight(sql`e.pos`, sql`t.pos`)})))
         AND (
           -- éclairé par une lumière allumée
           EXISTS (SELECT 1 FROM lit WHERE ST_DWithin(lit.pos, t.pos, lit.r))
           -- hors du brouillard
           OR (t.visibility = 'visible' AND NOT ${sqlInFog(mapId, sql`t.pos`)})
           -- dans le rayon de vision d'un de mes tokens ou d'un allié
           OR EXISTS (SELECT 1 FROM eyes e WHERE ST_DWithin(e.pos, t.pos, e.vision_radius))
         ))
     )`);
  return new Set(rows.map((r) => r.id));
}

/**
 * Un token est diffusé à tous (événement `public`) s'il est d'un personnage
 * joueur, allié, ou visible hors du brouillard ; sinon au MJ seulement.
 */
export async function isPublicToken(tx: Db | Tx, t: TokenRow) {
  if (await inHiddenLayer(tx, t)) return false;
  if (t.visibility === 'ally') return true;
  if (t.visibility === 'invisible' || t.visibility === 'custom') return false;
  // visible ou hidden : personnage joueur, ou visible hors du brouillard
  const { rows } = await tx.execute<{ public: boolean }>(sql`
    SELECT cc.side = 'players'
           OR (${t.visibility} = 'visible' AND NOT ${sqlInFog(t.mapId, sqlPoint(t.pos))}) AS public
      FROM campaign.campaign_characters cc
     WHERE cc.campaign_id = ${t.campaignId} AND cc.character_id = ${t.characterId}`);
  return rows[0]?.public ?? false;
}

/** Token d'un calque masqué aux joueurs : ses événements sont réservés aux MJ. */
async function inHiddenLayer(tx: Db | Tx, t: Pick<TokenRow, 'layerId'>) {
  const [layer] = await tx
    .select({ visible: mapLayers.visibleToPlayers })
    .from(mapLayers)
    .where(eq(mapLayers.id, t.layerId));
  return layer ? !layer.visible : false;
}

// ─── Opérations ──────────────────────────────────────────────────────────────

async function tokenEvent(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  t: TokenRow,
  type: 'token.created' | 'token.updated',
  wasPublic?: boolean,
) {
  const visible = await isPublicToken(tx, t);
  await mapEvent(tx, ctx, v, {
    type,
    aggregate: { type: 'token', id: t.id },
    payload: tokenApi(t),
    visibility: visible ? 'public' : 'gm_only',
    restricted: await inHiddenLayer(tx, t),
  });
  if (wasPublic && !visible)
    await mapEvent(tx, ctx, v, {
      type: 'token.hidden',
      aggregate: { type: 'token', id: t.id },
      payload: { id: t.id, mapId: t.mapId },
    });
  return visible;
}

async function movedEvent(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  before: { mapId: string; pos: MapPoint } | null,
  after: TokenRow,
) {
  const wasPublic = before ? await isPublicToken(tx, { ...after, ...before }) : false;
  const visible = await isPublicToken(tx, after);
  await mapEvent(tx, ctx, v, {
    type: 'token.moved',
    aggregate: { type: 'token', id: after.id },
    payload: {
      tokenId: after.id,
      characterId: after.characterId,
      from: before ? { mapId: before.mapId, ...before.pos } : null,
      to: { mapId: after.mapId, ...after.pos },
    },
    // Visible au départ ou à l'arrivée : les joueurs le voient bouger (entrer ou sortir du brouillard)
    visibility: visible || wasPublic ? 'public' : 'gm_only',
  });
}

async function lockToken(tx: Tx, v: Viewer, mapId: string, tokenId: string) {
  const [t] = await tx
    .select()
    .from(mapTokens)
    .where(and(eq(mapTokens.id, tokenId), eq(mapTokens.mapId, mapId), eq(mapTokens.present, true)))
    .for('update');
  if (!t) throw notFound('Token');
  if (!v.isGm) {
    const visible = await visibleTokenIds(tx, v, mapId);
    if (!visible!.has(t.id)) throw notFound('Token');
  }
  return t;
}

export async function updateToken(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  mapId: string,
  tokenId: string,
  patch: Record<string, unknown> & { pos?: MapPoint; version?: number },
) {
  const before = await lockToken(tx, v, mapId, tokenId);
  if (!v.isGm) {
    requireWriter(v);
    if (!v.characterIds.includes(before.characterId))
      throw HttpError.forbidden('Seul le MJ déplace les personnages des autres');
    const extra = Object.keys(patch).filter((k) => !PLAYER_FIELDS.has(k));
    if (extra.length) throw HttpError.forbidden(`Réservé au MJ : ${extra.join(', ')}`);
  }
  const { version, pos, ...changes } = patch;
  if (
    typeof changes.visionBoost === 'boolean' &&
    changes.visionBoost !== before.visionBoost &&
    changes.visionRadius === undefined
  )
    changes.visionRadius = Math.min(
      100_000,
      changes.visionBoost ? before.visionRadius * BOOST : before.visionRadius / BOOST,
    );
  if (version !== undefined && version !== before.version) throw versionConflict();
  if (changes.layerId !== undefined) await checkLayer(tx, v, mapId, changes.layerId);
  const wasPublic = Object.keys(changes).length ? await isPublicToken(tx, before) : false;
  const [after] = await tx
    .update(mapTokens)
    .set({
      ...changes,
      ...(pos ? { pos } : {}),
      version: sql`${mapTokens.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(mapTokens.id, tokenId))
    .returning();
  if (pos && (pos.x !== before.pos.x || pos.y !== before.pos.y))
    await movedEvent(tx, ctx, v, { mapId: before.mapId, pos: before.pos }, after!);
  if (Object.keys(changes).length) await tokenEvent(tx, ctx, v, after!, 'token.updated', wasPublic);
  return after!;
}

/** Personnages engagés dans la campagne (côté et propriétaire), 422 sinon. */
async function engaged(tx: Tx, campaignId: string, ids: string[]) {
  const rows = ids.length
    ? await tx
        .select()
        .from(campaignCharacters)
        .where(
          and(
            eq(campaignCharacters.campaignId, campaignId),
            inArray(campaignCharacters.characterId, ids),
          ),
        )
    : [];
  const missing = ids.filter((id) => !rows.some((r) => r.characterId === id));
  if (missing.length)
    throw new HttpError(
      422,
      'Refusé',
      'character_not_engaged',
      `Personnages non engagés dans la campagne : ${missing.join(', ')}`,
    );
  return rows;
}

/**
 * Amène un personnage sur la carte : sa position mémorisée sur cette carte est
 * reprise (sinon un token est créé avec l'apparence de son token actuel), et
 * il quitte la carte où il était. Position : `pos`, sinon le point
 * d'apparition, sinon la dernière position connue ici, sinon l'origine.
 */
async function travel(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  map: MapRow,
  characterId: string,
  pos: MapPoint | undefined,
) {
  const [current] = await tx
    .select()
    .from(mapTokens)
    .where(
      and(
        eq(mapTokens.campaignId, map.campaignId),
        eq(mapTokens.characterId, characterId),
        eq(mapTokens.present, true),
      ),
    )
    .for('update');
  const [remembered] = await tx
    .select()
    .from(mapTokens)
    .where(and(eq(mapTokens.mapId, map.id), eq(mapTokens.characterId, characterId)))
    .for('update');
  const to = pos ?? map.spawn ?? remembered?.pos ?? { x: 0, y: 0 };
  if (current && current.mapId !== map.id)
    await tx
      .update(mapTokens)
      .set({ present: false, version: sql`${mapTokens.version} + 1`, updatedAt: sql`now()` })
      .where(eq(mapTokens.id, current.id));
  let after: TokenRow;
  if (remembered) {
    [after] = (await tx
      .update(mapTokens)
      .set({
        present: true,
        pos: to,
        version: sql`${mapTokens.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(mapTokens.id, remembered.id))
      .returning()) as [TokenRow];
  } else {
    const look = current
      ? {
          scale: current.scale,
          shape: current.shape,
          imageUrl: current.imageUrl,
          visibility: current.visibility,
          visibleTo: current.visibleTo,
          visionRadius: current.visionRadius,
          visionBoost: current.visionBoost,
          notes: current.notes,
          audio: current.audio,
          interactions: current.interactions,
        }
      : {};
    [after] = (await tx
      .insert(mapTokens)
      .values({
        ...look,
        id: uuidv7(),
        campaignId: map.campaignId,
        mapId: map.id,
        characterId,
        pos: to,
      })
      .returning()) as [TokenRow];
  }
  const from = current ? { mapId: current.mapId, pos: current.pos } : null;
  if (!from || from.mapId !== after.mapId || from.pos.x !== to.x || from.pos.y !== to.y)
    await movedEvent(tx, ctx, v, from, after);
  return after;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const registerTokens: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const base = '/v1/campaigns/:id/maps/:mapId/tokens';

  r.get(
    base,
    { ...auth, schema: { params: MapParams, querystring: z.object({ bbox: Bbox.optional() }) } },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      const map = await loadMap(db, v, req.params.mapId);
      return { items: await listTokens(db, v, map.id, req.query.bbox) };
    },
  );

  r.get(
    `${base}/near`,
    {
      ...auth,
      schema: {
        params: MapParams,
        querystring: z.object({
          x: z.coerce.number().finite(),
          y: z.coerce.number().finite(),
          radius: z.coerce.number().min(0).max(1_000_000),
        }),
      },
    },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      const map = await loadMap(db, v, req.params.mapId);
      const center = sqlPoint(req.query);
      const rows = await db
        .select({
          token: mapTokens,
          distance: sql<number>`ST_Distance(${mapTokens.pos}, ${center})`,
        })
        .from(mapTokens)
        .where(
          and(
            eq(mapTokens.mapId, map.id),
            eq(mapTokens.present, true),
            sql`ST_DWithin(${mapTokens.pos}, ${center}, ${req.query.radius})`,
          ),
        )
        .orderBy(sql`2`, asc(mapTokens.id));
      const visible = await visibleTokenIds(db, v, map.id);
      return {
        items: rows
          .filter((x) => !visible || visible.has(x.token.id))
          .map((x) => ({ ...tokenApi(x.token), distance: Number(x.distance) })),
      };
    },
  );

  r.post(
    base,
    {
      ...auth,
      schema: {
        params: MapParams,
        body: CreateMapToken,
      },
    },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const token = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const map = await loadMap(tx, v, req.params.mapId);
        const { characterId, pos, ...look } = req.body;
        await engaged(tx, map.campaignId, [characterId]);
        if (look.layerId !== undefined) await checkLayer(tx, v, map.id, look.layerId);
        const [elsewhere] = await tx
          .select({ mapId: mapTokens.mapId })
          .from(mapTokens)
          .where(
            and(
              eq(mapTokens.campaignId, map.campaignId),
              eq(mapTokens.characterId, characterId),
              eq(mapTokens.present, true),
              ne(mapTokens.mapId, map.id),
            ),
          );
        if (elsewhere)
          throw HttpError.conflict(
            'Ce personnage est sur une autre carte : utilisez /travel pour le déplacer',
            'character_on_other_map',
          );
        const [existing] = await tx
          .select()
          .from(mapTokens)
          .where(and(eq(mapTokens.mapId, map.id), eq(mapTokens.characterId, characterId)))
          .for('update');
        if (existing?.present)
          throw HttpError.conflict('Ce personnage a déjà un token sur cette carte', 'token_exists');
        // Dernière position mémorisée sur cette carte : le token y revient
        const [row] = existing
          ? await tx
              .update(mapTokens)
              .set({
                ...(look as Partial<TokenRow>),
                pos,
                present: true,
                version: sql`${mapTokens.version} + 1`,
                updatedAt: sql`now()`,
              })
              .where(eq(mapTokens.id, existing.id))
              .returning()
          : await tx
              .insert(mapTokens)
              .values({
                ...(look as Partial<TokenRow>),
                id: uuidv7(),
                campaignId: map.campaignId,
                mapId: map.id,
                characterId,
                pos,
              })
              .returning();
        await tokenEvent(tx, ctx, v, row!, 'token.created');
        return row!;
      });
      reply.code(201);
      return tokenApi(token);
    },
  );

  r.patch(
    `${base}/:itemId`,
    {
      ...auth,
      schema: {
        params: ItemParams,
        body: UpdateMapToken,
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const token = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const map = await loadMap(tx, v, req.params.mapId);
        return updateToken(tx, ctx, v, map.id, req.params.itemId, req.body);
      });
      return tokenApi(token);
    },
  );

  r.delete(`${base}/:itemId`, { ...auth, schema: { params: ItemParams } }, async (req, reply) => {
    const { userId, ctx } = requestContext(req);
    await db.transaction(async (tx) => {
      const v = await viewerOf(tx, req.params.id, userId);
      requireGm(v);
      const map = await loadMap(tx, v, req.params.mapId);
      const before = await lockToken(tx, v, map.id, req.params.itemId);
      const wasPublic = await isPublicToken(tx, before);
      await tx.delete(mapTokens).where(eq(mapTokens.id, before.id));
      await mapEvent(tx, ctx, v, {
        type: 'token.deleted',
        aggregate: { type: 'token', id: before.id },
        payload: { id: before.id, mapId: map.id, characterId: before.characterId },
        visibility: wasPublic ? 'public' : 'gm_only',
      });
    });
    reply.code(204);
  });

  r.post(
    `${base}/move`,
    {
      ...auth,
      schema: {
        params: MapParams,
        body: MoveMapTokens,
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const moved = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const map = await loadMap(tx, v, req.params.mapId);
        const out: TokenRow[] = [];
        for (const m of req.body.moves)
          out.push(
            await updateToken(tx, ctx, v, map.id, m.tokenId, {
              pos: m.pos,
              ...(m.version !== undefined ? { version: m.version } : {}),
            }),
          );
        return out;
      });
      return { items: moved.map(tokenApi) };
    },
  );

  r.post(
    '/v1/campaigns/:id/maps/:mapId/travel',
    {
      ...auth,
      schema: {
        params: MapParams,
        body: TravelToMap,
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const moved = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireWriter(v);
        const map = await loadMap(tx, v, req.params.mapId);
        const party = !req.body.characterIds;
        if (party) requireGm(v);
        const ids = party
          ? (
              await tx
                .select({ id: campaignCharacters.characterId })
                .from(campaignCharacters)
                .where(
                  and(
                    eq(campaignCharacters.campaignId, map.campaignId),
                    eq(campaignCharacters.side, 'players'),
                  ),
                )
                .orderBy(asc(campaignCharacters.characterId))
            ).map((x) => x.id)
          : [...new Set(req.body.characterIds)];
        await engaged(tx, map.campaignId, ids);
        if (!v.isGm) {
          const others = ids.filter((id) => !v.characterIds.includes(id));
          if (others.length)
            throw HttpError.forbidden('Un joueur ne déplace que ses propres personnages');
        }
        const out: TokenRow[] = [];
        for (const id of ids) out.push(await travel(tx, ctx, v, map, id, req.body.pos));
        if (party) {
          await tx
            .insert(mapSettings)
            .values({ campaignId: map.campaignId, partyMapId: map.id })
            .onConflictDoUpdate({
              target: mapSettings.campaignId,
              set: {
                partyMapId: map.id,
                version: sql`${mapSettings.version} + 1`,
                updatedAt: sql`now()`,
              },
            });
          await mapEvent(tx, ctx, v, {
            type: 'map_settings.updated',
            aggregate: { type: 'map_settings', id: map.campaignId },
            payload: await mapSettingsOf(tx, map.campaignId),
          });
        }
        return out;
      });
      return { items: moved.map(tokenApi) };
    },
  );
};

/** Tokens présents sur la carte que l'appelant voit. */
export async function listTokens(
  db: Db | Tx,
  v: Viewer,
  mapId: string,
  bbox?: [number, number, number, number],
) {
  const rows = await db
    .select()
    .from(mapTokens)
    .where(
      and(
        eq(mapTokens.mapId, mapId),
        eq(mapTokens.present, true),
        bbox ? sql`${mapTokens.pos} && ${envelope(bbox)}` : undefined,
      ),
    )
    .orderBy(asc(mapTokens.createdAt), asc(mapTokens.id));
  const visible = await visibleTokenIds(db, v, mapId);
  return rows.filter((t) => !visible || visible.has(t.id)).map(tokenApi);
}
