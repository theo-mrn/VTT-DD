/**
 * Tokens : les personnages engagés posés sur les cartes.
 *
 *   GET    /v1/campaigns/:id/maps/:mapId/tokens?bbox=              tokens présents (filtrés pour un joueur)
 *   GET    /v1/campaigns/:id/maps/:mapId/tokens/near?x=&y=&radius= tokens dans un rayon (ST_DWithin)
 *   POST   /v1/campaigns/:id/maps/:mapId/tokens                    poser un personnage (MJ)
 *   PATCH  /v1/campaigns/:id/maps/:mapId/tokens/:itemId            modifier / déplacer
 *   DELETE /v1/campaigns/:id/maps/:mapId/tokens/:itemId            retirer (MJ) : npcs.ts
 *   POST   /v1/campaigns/:id/maps/:mapId/tokens/move               déplacer plusieurs tokens (fin de drag)
 *   POST   /v1/campaigns/:id/maps/:mapId/travel                    amener des personnages sur la carte
 *
 * Un joueur déplace les tokens de ses personnages (et règle leur vision) ; le
 * reste est réservé au MJ. Un déplacement produit un seul `token.moved`
 * (from/to) : les positions intermédiaires du drag passent par realtime.
 */
import {
  CreateMapToken,
  MoveMapTokens,
  TravelToMap,
  UpdateMapToken,
  uuidv7,
  type MapToken,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import { campaignCharacters, mapSettings, mapTokens, type MapPoint } from '../../db/schema.js';
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
  sqlPoint,
  versionConflict,
  viewerOf,
  type MapRow,
  type Viewer,
} from './common.js';
import {
  eventTarget,
  lostSight,
  notifyVisibilityChanged,
  observersUsers,
  tokenAudience,
  viewerVision,
  type Audience,
} from './vision.js';
import type { MemberVision } from './vision-rules.js';

export type TokenRow = typeof mapTokens.$inferSelect;

export const tokenApi = (t: TokenRow): MapToken => ({
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

// ─── Visibilité côté serveur (@vtt/vision, docs/carte.md § 9) ───────────────

/**
 * Tokens présents sur la carte que l'appelant voit ; `null` pour le MJ (tout). Règles :
 * `vision-rules.ts` (ligne de vue, pièces fermées, brouillard, lumières, calques masqués).
 */
export async function visibleTokenIds(
  db: Db | Tx,
  v: Viewer,
  mapId: string,
): Promise<Set<string> | null> {
  if (v.isGm) return null;
  const vision = await viewerVision(db, v, mapId);
  return new Set(vision ? vision.visibleTokens().map((t) => t.id) : []);
}

/** Le token est-il vu de tous les membres non MJ (événement `public`) ? */
export async function isPublicToken(tx: Db | Tx, t: TokenRow) {
  return (await tokenAudience(tx, { id: t.mapId, campaignId: t.campaignId }, t.id)).public;
}

/** Champs du token dont dépend la vue de ses joueurs (observateur). */
const VISION_FIELDS = ['visionRadius', 'visionBoost', 'visibility', 'layerId'];

/**
 * Joueurs dont la vue change quand ce token bouge ou change (observateur, torche) : ils sont
 * prévenus de relire (`map.visibility_changed`).
 */
async function notifyObservers(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  map: { id: string; campaignId: string },
  tokens: readonly Pick<TokenRow, 'id' | 'characterId' | 'visibility'>[],
) {
  const users = new Set<string>();
  for (const t of tokens) {
    const who = await observersUsers(tx, map, t);
    if (who === 'all') return notifyVisibilityChanged(tx, ctx, v, map);
    for (const u of who ?? []) users.add(u);
  }
  if (users.size) await notifyVisibilityChanged(tx, ctx, v, map, [...users]);
}

// ─── Opérations ──────────────────────────────────────────────────────────────

/**
 * `token.created` ou `token.updated`, routé joueur par joueur : ceux qui voient le token le
 * reçoivent (public s'ils le voient tous) ; ceux qui le voyaient (`before`) et ne le voient
 * plus reçoivent `token.hidden`.
 */
export async function tokenEvent(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  t: TokenRow,
  type: 'token.created' | 'token.updated',
  before?: Audience | null,
  known?: Audience,
) {
  const map = { id: t.mapId, campaignId: t.campaignId };
  const after = known ?? (await tokenAudience(tx, map, t.id));
  await mapEvent(tx, ctx, v, {
    type,
    aggregate: { type: 'token', id: t.id },
    payload: tokenApi(t),
    ...eventTarget(after),
  });
  const lost = before ? lostSight(before, after) : [];
  if (lost.length)
    await mapEvent(tx, ctx, v, {
      type: 'token.hidden',
      aggregate: { type: 'token', id: t.id },
      payload: { id: t.id, mapId: t.mapId },
      visibility: 'gm_only',
      toUsers: lost,
    });
  return after;
}

/**
 * Un seul `token.moved` par déplacement, routé joueur par joueur : ceux qui voient le token
 * à l'arrivée le reçoivent ; ceux qui le voyaient au départ (`before`, sur l'ancienne carte
 * s'il en change) et plus à l'arrivée reçoivent `token.hidden` (l'ancien token).
 */
async function movedEvent(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  before: { token: TokenRow; audience: Audience } | null,
  after: TokenRow,
  known?: Audience,
) {
  const audience =
    known ?? (await tokenAudience(tx, { id: after.mapId, campaignId: after.campaignId }, after.id));
  await mapEvent(tx, ctx, v, {
    type: 'token.moved',
    aggregate: { type: 'token', id: after.id },
    payload: {
      tokenId: after.id,
      characterId: after.characterId,
      from: before ? { mapId: before.token.mapId, ...before.token.pos } : null,
      to: { mapId: after.mapId, ...after.pos },
    },
    ...eventTarget(audience),
  });
  if (before) {
    const sameToken = before.token.id === after.id;
    const lost = sameToken ? lostSight(before.audience, audience) : before.audience.users;
    if (lost.length)
      await mapEvent(tx, ctx, v, {
        type: 'token.hidden',
        aggregate: { type: 'token', id: before.token.id },
        payload: { id: before.token.id, mapId: before.token.mapId },
        visibility: 'gm_only',
        toUsers: lost,
      });
  }
  return audience;
}

export async function lockToken(tx: Tx, v: Viewer, mapId: string, tokenId: string) {
  const [t] = await tx
    .select()
    .from(mapTokens)
    .where(and(eq(mapTokens.id, tokenId), eq(mapTokens.mapId, mapId), eq(mapTokens.present, true)))
    .for('update');
  if (!t) throw notFound('Token');
  // Son propre token (sauf invisible) : toujours vu, pas besoin de la scène
  const own = v.characterIds.includes(t.characterId) && t.visibility !== 'invisible';
  if (!v.isGm && !own) {
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
  const moved = !!pos && (pos.x !== before.pos.x || pos.y !== before.pos.y);
  const changed = Object.keys(changes).length > 0;
  const map = { id: mapId, campaignId: before.campaignId };
  // Qui voyait le token avant : ceux qui ne le voient plus reçoivent `token.hidden`
  const seenBefore = moved || changed ? await tokenAudience(tx, map, before.id) : null;
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
  let seenAfter: Audience | undefined;
  if (moved)
    seenAfter = await movedEvent(tx, ctx, v, { token: before, audience: seenBefore! }, after!);
  if (changed)
    await tokenEvent(tx, ctx, v, after!, 'token.updated', moved ? null : seenBefore, seenAfter);
  // Observateur ou torche qui bouge, rayon ou visibilité changés : ses joueurs relisent
  if (moved || VISION_FIELDS.some((f) => f in changes))
    await notifyObservers(tx, ctx, v, map, [before, after!]);
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
  // Qui voyait le personnage là où il était
  const seenBefore = current
    ? await tokenAudience(tx, { id: current.mapId, campaignId: current.campaignId }, current.id)
    : null;
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
  if (
    !current ||
    current.mapId !== after.mapId ||
    current.pos.x !== to.x ||
    current.pos.y !== to.y
  ) {
    await movedEvent(tx, ctx, v, current ? { token: current, audience: seenBefore! } : null, after);
    const places = [map.id, ...(current && current.mapId !== map.id ? [current.mapId] : [])];
    for (const id of places)
      await notifyObservers(tx, ctx, v, { id, campaignId: map.campaignId }, [after]);
  }
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

  // DELETE …/tokens/:itemId (et ?character=delete) : npcs.ts

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
  vision?: Promise<MemberVision | null>,
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
  if (v.isGm) return rows.map(tokenApi);
  const seen = await (vision ?? viewerVision(db, v, mapId));
  const visible = new Set(seen ? seen.visibleTokens().map((t) => t.id) : []);
  return rows.filter((t) => visible.has(t.id)).map(tokenApi);
}
