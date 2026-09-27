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
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  mapSettings,
  mapTokens,
  TOKEN_SHAPES,
  TOKEN_VISIBILITIES,
  type MapPoint,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { CharacterId } from '../schemas.js';
import {
  Bbox,
  envelope,
  ItemId,
  ItemParams,
  loadMap,
  MapParams,
  mapEvent,
  MediaUrl,
  notFound,
  Point,
  requestContext,
  requireGm,
  requireWriter,
  sqlPoint,
  sqlUuids,
  Version,
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

const TokenFields = {
  scale: z.number().positive().max(100),
  shape: z.enum(TOKEN_SHAPES),
  imageUrl: MediaUrl.nullable(),
  visibility: z.enum(TOKEN_VISIBILITIES),
  visibleTo: z.array(CharacterId).max(100),
  visionRadius: z.number().min(0).max(100_000),
  visionBoost: z.boolean(),
  notes: z.string().max(10_000).nullable(),
  audio: z
    .object({
      url: MediaUrl,
      radius: z.number().min(0).max(100_000),
      volume: z.number().min(0).max(1),
      loop: z.boolean().optional(),
      name: z.string().max(200).optional(),
    })
    .nullable(),
  interactions: z.array(z.record(z.string(), z.unknown())).max(50).nullable(),
};

/** Champs qu'un joueur modifie sur le token de son personnage. */
const PLAYER_FIELDS = new Set(['pos', 'visionRadius', 'visionBoost', 'version']);

// ─── Visibilité côté serveur (reprise de utils/visibility-checks.ts) ────────

/**
 * Tokens présents sur la carte que l'appelant voit ; `null` pour le MJ (tout).
 * Taille de case du brouillard : round(min(largeur, hauteur) / 20), 100 px si
 * la taille de l'image est inconnue, comme l'ancienne carte.
 */
export async function visibleTokenIds(
  db: Db | Tx,
  v: Viewer,
  mapId: string,
): Promise<Set<string> | null> {
  if (v.isGm) return null;
  const mine = sqlUuids(v.characterIds);
  const fog = sql`(SELECT f FROM campaign.map_fog f WHERE f.map_id = ${mapId})`;
  const { rows } = await db.execute<{ id: string }>(sql`
    WITH m AS (
      SELECT greatest(coalesce(round(least(width, height) / 20.0), 100), 1)::float8 AS cell,
             coalesce((layers->>'obstacles')::boolean, true) AS walls
        FROM campaign.maps WHERE id = ${mapId}
    ),
    t AS (
      SELECT t.id, t.pos, t.visibility, t.visible_to, t.vision_radius,
             cc.side = 'players' AS player, t.character_id = ANY(${mine}) AS mine
        FROM campaign.map_tokens t
        JOIN campaign.campaign_characters cc
          ON cc.campaign_id = t.campaign_id AND cc.character_id = t.character_id
       WHERE t.map_id = ${mapId} AND t.present
    ),
    eyes AS (SELECT pos, vision_radius, mine FROM t WHERE mine OR visibility = 'ally'),
    lit AS (
      SELECT l.pos, l.radius * coalesce(s.pixels_per_unit, 50) AS r
        FROM campaign.map_lights l
        LEFT JOIN campaign.map_settings s ON s.campaign_id = l.campaign_id
       WHERE l.map_id = ${mapId} AND l.visible
    )
    SELECT t.id FROM t, m
     WHERE t.visibility <> 'invisible' AND (
       t.player OR t.mine OR t.visibility = 'ally'
       OR (t.visibility = 'custom' AND t.visible_to && ${mine})
       OR (t.visibility IN ('visible', 'hidden')
         -- ligne de vue : cachée si chacun de mes tokens la voit coupée par un mur ou une porte fermée
         AND NOT (m.walls AND EXISTS (SELECT 1 FROM eyes WHERE eyes.mine) AND NOT EXISTS (
           SELECT 1 FROM eyes e WHERE e.mine AND NOT EXISTS (
             SELECT 1 FROM campaign.map_obstacles o
              WHERE o.map_id = ${mapId}
                AND (o.kind IN ('wall', 'one_way_wall') OR (o.kind = 'door' AND NOT o.is_open))
                AND ST_Intersects(o.geom, ST_MakeLine(e.pos, t.pos)))))
         AND (
           -- éclairé par une lumière allumée
           EXISTS (SELECT 1 FROM lit WHERE ST_DWithin(lit.pos, t.pos, lit.r))
           -- hors du brouillard
           OR (t.visibility = 'visible' AND NOT (
             coalesce((${fog}).full_map, false)
             OR (floor(ST_X(t.pos) / m.cell)::bigint || ',' || floor(ST_Y(t.pos) / m.cell)::bigint)
                = ANY(coalesce((${fog}).cells, '{}'))))
           -- dans le rayon de vision d'un de mes tokens ou d'un allié
           OR EXISTS (SELECT 1 FROM eyes e
                       WHERE ST_DWithin(e.pos, t.pos, e.vision_radius + m.cell * sqrt(2) / 2))
         ))
     )`);
  return new Set(rows.map((r) => r.id));
}

/**
 * Un token est diffusé à tous (événement `public`) s'il est d'un personnage
 * joueur, allié, ou visible hors du brouillard ; sinon au MJ seulement.
 */
async function isPublicToken(tx: Tx, t: TokenRow) {
  if (t.visibility === 'ally') return true;
  if (t.visibility === 'invisible' || t.visibility === 'custom') return false;
  // visible ou hidden : personnage joueur, ou visible hors du brouillard
  const { rows } = await tx.execute<{ public: boolean }>(sql`
    SELECT cc.side = 'players' OR (${t.visibility} = 'visible' AND NOT coalesce((
      SELECT f.full_map OR (floor(${t.pos.x}::float8 / m.cell)::bigint || ','
               || floor(${t.pos.y}::float8 / m.cell)::bigint) = ANY(f.cells)
        FROM campaign.map_fog f,
             (SELECT greatest(coalesce(round(least(width, height) / 20.0), 100), 1)::float8 AS cell
                FROM campaign.maps WHERE id = ${t.mapId}) m
       WHERE f.map_id = ${t.mapId}), false)) AS public
      FROM campaign.campaign_characters cc
     WHERE cc.campaign_id = ${t.campaignId} AND cc.character_id = ${t.characterId}`);
  return rows[0]?.public ?? false;
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

async function updateToken(
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
  if (version !== undefined && version !== before.version) throw versionConflict();
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
        body: z.strictObject({
          characterId: CharacterId,
          pos: Point,
          ...Object.fromEntries(Object.entries(TokenFields).map(([k, s]) => [k, s.optional()])),
        }),
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
        body: z
          .strictObject({ pos: Point, ...TokenFields })
          .partial()
          .extend({ version: Version }),
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
        body: z.strictObject({
          moves: z
            .array(z.strictObject({ tokenId: ItemId, pos: Point, version: Version }))
            .min(1)
            .max(200),
        }),
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
        body: z.strictObject({
          /** Absent : tous les personnages joueurs, et la carte devient celle du groupe (MJ). */
          characterIds: z.array(CharacterId).min(1).max(200).optional(),
          pos: Point.optional(),
        }),
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
          const [settings] = await tx
            .insert(mapSettings)
            .values({ campaignId: map.campaignId, partyMapId: map.id })
            .onConflictDoUpdate({
              target: mapSettings.campaignId,
              set: {
                partyMapId: map.id,
                version: sql`${mapSettings.version} + 1`,
                updatedAt: sql`now()`,
              },
            })
            .returning();
          await mapEvent(tx, ctx, v, {
            type: 'map_settings.updated',
            aggregate: { type: 'map_settings', id: map.campaignId },
            payload: { partyMapId: map.id, version: settings!.version },
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
