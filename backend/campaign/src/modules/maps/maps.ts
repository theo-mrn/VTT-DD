/**
 * Cartes (scènes), dossiers, réglages, brouillard et requêtes spatiales.
 *
 *   GET    /v1/campaigns/:id/maps                               cartes visibles par l'appelant
 *   POST   /v1/campaigns/:id/maps                               créer (MJ)
 *   GET    /v1/campaigns/:id/maps/:mapId?bbox=                  carte complète (chargement initial)
 *   PATCH  /v1/campaigns/:id/maps/:mapId                        modifier (MJ)
 *   DELETE /v1/campaigns/:id/maps/:mapId                        supprimer (MJ, aucun joueur dessus)
 *   GET    /v1/campaigns/:id/maps/:mapId/fog                    brouillard
 *   PUT    /v1/campaigns/:id/maps/:mapId/fog                    remplacer (MJ)
 *   PATCH  /v1/campaigns/:id/maps/:mapId/fog                    ajouter / retirer des cases (MJ)
 *   GET    /v1/campaigns/:id/maps/:mapId/line-of-sight?from=&to= segment coupé par un obstacle ?
 *   GET    /v1/campaigns/:id/maps/:mapId/at?x=&y=               zones sonores, portails, lumières sous un point
 *   GET    /v1/campaigns/:id/map-settings                       réglages de carte de la campagne
 *   PATCH  /v1/campaigns/:id/map-settings                       modifier (MJ)
 *   GET|POST /v1/campaigns/:id/map-groups, PATCH|DELETE …/:groupId   dossiers de scènes (MJ)
 */
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  mapFog,
  mapGroups,
  mapLights,
  mapMusicZones,
  mapObstacles,
  mapPortals,
  maps,
  mapSettings,
  mapTokens,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { CampaignId, Description, Uuid } from '../schemas.js';
import {
  Bbox,
  loadMap,
  MapParams,
  mapEvent,
  MediaUrl,
  notFound,
  Point,
  requestContext,
  requireGm,
  sqlPoint,
  sqlUuids,
  Version,
  versionConflict,
  viewerOf,
  type MapRow,
  type Viewer,
} from './common.js';
import { LAYERS, layerItemApi, listLayer, visibleFor, type LayerRow } from './layers.js';
import { listTokens } from './tokens.js';

export const mapApi = (m: MapRow) => ({
  id: m.id,
  name: m.name,
  description: m.description,
  groupId: m.groupId,
  backgroundUrl: m.backgroundUrl,
  isDefault: m.isDefault,
  visibleToPlayers: m.visibleToPlayers,
  spawn: m.spawn,
  width: m.width,
  height: m.height,
  weather: m.weather,
  layers: m.layers,
  version: m.version,
  updatedAt: m.updatedAt.toISOString(),
});

/** Taille d'une case de brouillard, comme l'ancienne carte (100 px si l'image est inconnue). */
export const fogCellSize = (m: Pick<MapRow, 'width' | 'height'>) =>
  m.width && m.height ? Math.max(1, Math.round(Math.min(m.width, m.height) / 20)) : 100;

type FogRow = typeof mapFog.$inferSelect;
const fogApi = (map: MapRow, f: FogRow | undefined) => ({
  mapId: map.id,
  fullMap: f?.fullMap ?? false,
  cells: f?.cells ?? [],
  cellSize: fogCellSize(map),
  version: f?.version ?? 0,
});

type SettingsRow = typeof mapSettings.$inferSelect;
const settingsApi = (campaignId: string, s: SettingsRow | undefined) => ({
  campaignId,
  partyMapId: s?.partyMapId ?? null,
  tokenScale: s?.tokenScale ?? 1,
  pixelsPerUnit: s?.pixelsPerUnit ?? 50,
  unitName: s?.unitName ?? 'm',
  shadowOpacity: s?.shadowOpacity ?? 1,
  dungeonMode: s?.dungeonMode ?? false,
  music: s?.music ?? null,
  version: s?.version ?? 0,
});

type GroupRow = typeof mapGroups.$inferSelect;
const groupApi = (g: GroupRow) => ({
  id: g.id,
  name: g.name,
  sortOrder: g.sortOrder,
  version: g.version,
});

const Weather = z.strictObject({
  type: z.string().trim().min(1).max(50),
  intensity: z.number().min(0).max(10),
});

const MapFields = {
  name: z.string().trim().min(1, 'Nom requis').max(100),
  description: Description,
  groupId: Uuid('Identifiant de dossier invalide').nullable(),
  backgroundUrl: MediaUrl.nullable(),
  isDefault: z.boolean(),
  visibleToPlayers: z.boolean(),
  spawn: Point.nullable(),
  width: z.number().int().min(1).max(100_000).nullable(),
  height: z.number().int().min(1).max(100_000).nullable(),
  weather: Weather.nullable(),
  /** Calques affichés (réglage MJ) : lights, obstacles, notes, drawings, objects, characters, fog, music. */
  layers: z.record(z.string().regex(/^[a-z_]{1,30}$/), z.boolean()),
};

/** Case de brouillard « cx,cy » (l'ancienne app ajoutait une espace finale). */
const Cell = z
  .string()
  .trim()
  .regex(/^-?\d{1,7},-?\d{1,7}$/, 'case attendue : cx,cy');
const Cells = z.array(Cell).max(100_000);

const GroupParams = z.object({ id: CampaignId, groupId: Uuid('Identifiant de dossier invalide') });

/** Clé de réponse d'une couche (`music-zones` → `musicZones`). */
const layerKey = (path: string) => path.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Contraintes uniques et étrangères de `maps` traduites en erreurs HTTP. */
function mapWriteError(err: unknown): never {
  // Drizzle enveloppe l'erreur de PostgreSQL dans `cause`
  const e = ((err as { cause?: unknown }).cause ?? err) as { code?: string; constraint?: string };
  if (e.code === '23505' && e.constraint === 'maps_default')
    throw HttpError.conflict('La campagne a déjà une carte par défaut', 'default_map_exists');
  if (e.code === '23503' && e.constraint === 'maps_group')
    throw new HttpError(422, 'Refusé', 'unknown_group', 'Dossier introuvable');
  throw err;
}

async function listMaps(db: Db | Tx, v: Viewer) {
  const rows = await db
    .select()
    .from(maps)
    .where(
      and(
        eq(maps.campaignId, v.access.campaign.id),
        v.isGm
          ? undefined
          : or(
              eq(maps.visibleToPlayers, true),
              sql`exists (select 1 from ${mapTokens} where ${mapTokens.mapId} = ${maps.id}
                  and ${mapTokens.present} and ${mapTokens.characterId} = any(${sqlUuids(v.characterIds)}))`,
            ),
      ),
    )
    .orderBy(asc(maps.createdAt), asc(maps.id));
  return rows.map(mapApi);
}

export const registerMaps: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const Params = z.object({ id: CampaignId });

  // ─── Cartes ──────────────────────────────────────────────────────────────

  r.get('/v1/campaigns/:id/maps', { ...auth, schema: { params: Params } }, async (req) => {
    const { userId } = requestContext(req);
    const v = await viewerOf(db, req.params.id, userId);
    return { items: await listMaps(db, v) };
  });

  r.post(
    '/v1/campaigns/:id/maps',
    {
      ...auth,
      schema: {
        params: Params,
        body: z
          .strictObject(MapFields)
          .partial()
          .required({ name: true })
          .refine((b) => (b.width == null) === (b.height == null), {
            message: 'width et height vont ensemble',
          }),
      },
    },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const map = await db
        .transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          requireGm(v);
          const [row] = await tx
            .insert(maps)
            .values({ ...req.body, id: uuidv7(), campaignId: v.access.campaign.id })
            .returning();
          await mapEvent(tx, ctx, v, {
            type: 'map.created',
            aggregate: { type: 'map', id: row!.id },
            payload: mapApi(row!),
            visibility: row!.visibleToPlayers ? 'public' : 'gm_only',
          });
          return row!;
        })
        .catch(mapWriteError);
      reply.code(201);
      return mapApi(map);
    },
  );

  r.get(
    '/v1/campaigns/:id/maps/:mapId',
    { ...auth, schema: { params: MapParams, querystring: z.object({ bbox: Bbox.optional() }) } },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      const map = await loadMap(db, v, req.params.mapId);
      const bbox = req.query.bbox;
      const [[fog], tokens, ...layers] = await Promise.all([
        db.select().from(mapFog).where(eq(mapFog.mapId, map.id)),
        listTokens(db, v, map.id, bbox),
        ...LAYERS.map((def) => listLayer(db, def, v, map.id, bbox)),
      ]);
      return {
        map: mapApi(map),
        fog: fogApi(map, fog),
        tokens,
        ...Object.fromEntries(LAYERS.map((def, i) => [layerKey(def.path), layers[i]])),
      };
    },
  );

  r.patch(
    '/v1/campaigns/:id/maps/:mapId',
    {
      ...auth,
      schema: {
        params: MapParams,
        body: z.strictObject(MapFields).partial().extend({ version: Version }),
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const map = await db
        .transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          requireGm(v);
          const before = await loadMap(tx, v, req.params.mapId, true);
          const { version, ...changes } = req.body;
          if (version !== undefined && version !== before.version) throw versionConflict();
          const width = changes.width !== undefined ? changes.width : before.width;
          const height = changes.height !== undefined ? changes.height : before.height;
          if ((width == null) !== (height == null))
            throw HttpError.badRequest('width et height vont ensemble', 'size_incomplete');
          const [after] = await tx
            .update(maps)
            .set({ ...changes, version: sql`${maps.version} + 1`, updatedAt: sql`now()` })
            .where(eq(maps.id, before.id))
            .returning();
          await mapEvent(tx, ctx, v, {
            type: 'map.updated',
            aggregate: { type: 'map', id: before.id },
            payload: mapApi(after!),
            visibility: after!.visibleToPlayers ? 'public' : 'gm_only',
          });
          if (before.visibleToPlayers && !after!.visibleToPlayers)
            await mapEvent(tx, ctx, v, {
              type: 'map.hidden',
              aggregate: { type: 'map', id: before.id },
              payload: { id: before.id },
            });
          return after!;
        })
        .catch(mapWriteError);
      return mapApi(map);
    },
  );

  r.delete(
    '/v1/campaigns/:id/maps/:mapId',
    { ...auth, schema: { params: MapParams } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const map = await loadMap(tx, v, req.params.mapId, true);
        // Comme l'ancienne app : on ne supprime pas une scène où se trouvent des joueurs
        const [player] = await tx
          .select({ id: mapTokens.id })
          .from(mapTokens)
          .innerJoin(
            campaignCharacters,
            and(
              eq(campaignCharacters.campaignId, mapTokens.campaignId),
              eq(campaignCharacters.characterId, mapTokens.characterId),
            ),
          )
          .where(
            and(
              eq(mapTokens.mapId, map.id),
              eq(mapTokens.present, true),
              eq(campaignCharacters.side, 'players'),
            ),
          )
          .limit(1);
        if (player)
          throw HttpError.conflict(
            'Des personnages joueurs sont sur cette carte : déplacez-les d’abord',
            'players_present',
          );
        await tx.delete(maps).where(eq(maps.id, map.id));
        await mapEvent(tx, ctx, v, {
          type: 'map.deleted',
          aggregate: { type: 'map', id: map.id },
          payload: { id: map.id },
          visibility: map.visibleToPlayers ? 'public' : 'gm_only',
        });
      });
      reply.code(204);
    },
  );

  // ─── Brouillard ──────────────────────────────────────────────────────────

  r.get(
    '/v1/campaigns/:id/maps/:mapId/fog',
    { ...auth, schema: { params: MapParams } },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      const map = await loadMap(db, v, req.params.mapId);
      const [fog] = await db.select().from(mapFog).where(eq(mapFog.mapId, map.id));
      return fogApi(map, fog);
    },
  );

  /** Écrit le brouillard (nouvel état calculé depuis l'ancien) et son événement. */
  const writeFog = (
    req: { params: { id: string; mapId: string } },
    userId: string,
    ctx: ReturnType<typeof requestContext>['ctx'],
    next: (f: { fullMap: boolean; cells: string[] }) => { fullMap: boolean; cells: string[] },
    version: number | undefined,
  ) =>
    db.transaction(async (tx) => {
      const v = await viewerOf(tx, req.params.id, userId);
      requireGm(v);
      const map = await loadMap(tx, v, req.params.mapId);
      const [before] = await tx.select().from(mapFog).where(eq(mapFog.mapId, map.id)).for('update');
      if (version !== undefined && version !== (before?.version ?? 0)) throw versionConflict();
      const state = next({ fullMap: before?.fullMap ?? false, cells: before?.cells ?? [] });
      const cells = [...new Set(state.cells)].sort();
      const [fog] = await tx
        .insert(mapFog)
        .values({ mapId: map.id, campaignId: map.campaignId, fullMap: state.fullMap, cells })
        .onConflictDoUpdate({
          target: mapFog.mapId,
          set: {
            fullMap: state.fullMap,
            cells,
            version: sql`${mapFog.version} + 1`,
            updatedAt: sql`now()`,
          },
        })
        .returning();
      const api = fogApi(map, fog);
      await mapEvent(tx, ctx, v, {
        type: 'map_fog.updated',
        aggregate: { type: 'map', id: map.id },
        payload: api,
      });
      return api;
    });

  r.put(
    '/v1/campaigns/:id/maps/:mapId/fog',
    {
      ...auth,
      schema: {
        params: MapParams,
        body: z.strictObject({ fullMap: z.boolean().optional(), cells: Cells, version: Version }),
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const { fullMap, cells, version } = req.body;
      return writeFog(req, userId, ctx, (f) => ({ fullMap: fullMap ?? f.fullMap, cells }), version);
    },
  );

  r.patch(
    '/v1/campaigns/:id/maps/:mapId/fog',
    {
      ...auth,
      schema: {
        params: MapParams,
        body: z.strictObject({
          fullMap: z.boolean().optional(),
          add: Cells.default([]),
          remove: Cells.default([]),
          version: Version,
        }),
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const { fullMap, add, remove, version } = req.body;
      const removed = new Set(remove);
      return writeFog(
        req,
        userId,
        ctx,
        (f) => ({
          fullMap: fullMap ?? f.fullMap,
          cells: [...f.cells.filter((c) => !removed.has(c)), ...add],
        }),
        version,
      );
    },
  );

  // ─── Requêtes spatiales ──────────────────────────────────────────────────

  const XY = z
    .string()
    .regex(/^-?[\d.]+,-?[\d.]+$/, 'point attendu : x,y')
    .transform((s) => {
      const [x, y] = s.split(',').map(Number) as [number, number];
      return { x, y };
    });

  r.get(
    '/v1/campaigns/:id/maps/:mapId/line-of-sight',
    { ...auth, schema: { params: MapParams, querystring: z.object({ from: XY, to: XY }) } },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      const map = await loadMap(db, v, req.params.mapId);
      const segment = sql`ST_MakeLine(${sqlPoint(req.query.from)}, ${sqlPoint(req.query.to)})`;
      const blocking = await db
        .select({ id: mapObstacles.id })
        .from(mapObstacles)
        .where(
          and(
            eq(mapObstacles.mapId, map.id),
            sql`(${mapObstacles.kind} in ('wall', 'one_way_wall')
                 or (${mapObstacles.kind} = 'door' and not ${mapObstacles.isOpen}))`,
            sql`ST_Intersects(${mapObstacles.geom}, ${segment})`,
          ),
        )
        .orderBy(asc(mapObstacles.id));
      return { blocked: blocking.length > 0, obstacleIds: blocking.map((o) => o.id) };
    },
  );

  r.get(
    '/v1/campaigns/:id/maps/:mapId/at',
    {
      ...auth,
      schema: {
        params: MapParams,
        querystring: z.object({ x: z.coerce.number().finite(), y: z.coerce.number().finite() }),
      },
    },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      const map = await loadMap(db, v, req.params.mapId);
      const p = sqlPoint(req.query);
      const [settings] = await db
        .select({ ppu: mapSettings.pixelsPerUnit })
        .from(mapSettings)
        .where(eq(mapSettings.campaignId, map.campaignId));
      const ppu = settings?.ppu ?? 50;
      const [zones, portals, lights] = await Promise.all([
        db
          .select()
          .from(mapMusicZones)
          .where(
            and(
              eq(mapMusicZones.mapId, map.id),
              sql`ST_DWithin(${mapMusicZones.pos}, ${p}, ${mapMusicZones.radius})`,
            ),
          ),
        db
          .select()
          .from(mapPortals)
          .where(
            and(
              eq(mapPortals.mapId, map.id),
              sql`ST_DWithin(${mapPortals.pos}, ${p}, ${mapPortals.radius})`,
            ),
          ),
        db
          .select()
          .from(mapLights)
          .where(
            and(
              eq(mapLights.mapId, map.id),
              sql`ST_DWithin(${mapLights.pos}, ${p}, ${mapLights.radius} * ${ppu}::float8)`,
            ),
          ),
      ]);
      const pick = (path: string, rows: object[]) => {
        const def = LAYERS.find((d) => d.path === path)!;
        return (rows as LayerRow[])
          .filter((row) => visibleFor(def, v, row))
          .map((row) => layerItemApi(def, row));
      };
      return {
        musicZones: pick('music-zones', zones),
        portals: pick('portals', portals),
        lights: pick('lights', lights),
      };
    },
  );

  // ─── Réglages ────────────────────────────────────────────────────────────

  r.get('/v1/campaigns/:id/map-settings', { ...auth, schema: { params: Params } }, async (req) => {
    const { userId } = requestContext(req);
    const v = await viewerOf(db, req.params.id, userId);
    const [s] = await db
      .select()
      .from(mapSettings)
      .where(eq(mapSettings.campaignId, v.access.campaign.id));
    return settingsApi(v.access.campaign.id, s);
  });

  r.patch(
    '/v1/campaigns/:id/map-settings',
    {
      ...auth,
      schema: {
        params: Params,
        body: z
          .strictObject({
            partyMapId: Uuid('Identifiant de carte invalide').nullable(),
            tokenScale: z.number().positive().max(100),
            pixelsPerUnit: z.number().positive().max(100_000),
            unitName: z.string().trim().min(1).max(20),
            shadowOpacity: z.number().min(0).max(1),
            dungeonMode: z.boolean(),
            /** Musique d'ambiance en cours : { videoId, videoTitle, templateId, isPlaying, … }. */
            music: z.record(z.string(), z.unknown()).nullable(),
          })
          .partial()
          .extend({ version: Version }),
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const campaignId = v.access.campaign.id;
        const { version, ...changes } = req.body;
        if (changes.partyMapId) {
          const [target] = await tx
            .select({ id: maps.id })
            .from(maps)
            .where(and(eq(maps.id, changes.partyMapId), eq(maps.campaignId, campaignId)));
          if (!target) throw notFound('Carte');
        }
        const [before] = await tx
          .select()
          .from(mapSettings)
          .where(eq(mapSettings.campaignId, campaignId))
          .for('update');
        if (version !== undefined && version !== (before?.version ?? 0)) throw versionConflict();
        const [s] = await tx
          .insert(mapSettings)
          .values({ campaignId, ...changes })
          .onConflictDoUpdate({
            target: mapSettings.campaignId,
            set: { ...changes, version: sql`${mapSettings.version} + 1`, updatedAt: sql`now()` },
          })
          .returning();
        const api = settingsApi(campaignId, s);
        await mapEvent(tx, ctx, v, {
          type: 'map_settings.updated',
          aggregate: { type: 'map_settings', id: campaignId },
          payload: api,
        });
        return api;
      });
    },
  );

  // ─── Dossiers de scènes (MJ) ─────────────────────────────────────────────

  const GroupFields = {
    name: z.string().trim().min(1, 'Nom requis').max(100),
    sortOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  };

  r.get('/v1/campaigns/:id/map-groups', { ...auth, schema: { params: Params } }, async (req) => {
    const { userId } = requestContext(req);
    const v = await viewerOf(db, req.params.id, userId);
    requireGm(v);
    const rows = await db
      .select()
      .from(mapGroups)
      .where(eq(mapGroups.campaignId, v.access.campaign.id))
      .orderBy(asc(mapGroups.sortOrder), asc(mapGroups.name), asc(mapGroups.id));
    return { items: rows.map(groupApi) };
  });

  r.post(
    '/v1/campaigns/:id/map-groups',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.strictObject({
          name: GroupFields.name,
          sortOrder: GroupFields.sortOrder.optional(),
        }),
      },
    },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const group = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const [g] = await tx
          .insert(mapGroups)
          .values({ id: uuidv7(), campaignId: v.access.campaign.id, ...req.body })
          .returning();
        await mapEvent(tx, ctx, v, {
          type: 'map_group.created',
          aggregate: { type: 'map_group', id: g!.id },
          payload: groupApi(g!),
          visibility: 'gm_only',
        });
        return g!;
      });
      reply.code(201);
      return groupApi(group);
    },
  );

  r.patch(
    '/v1/campaigns/:id/map-groups/:groupId',
    {
      ...auth,
      schema: {
        params: GroupParams,
        body: z.strictObject(GroupFields).partial().extend({ version: Version }),
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const { version, ...changes } = req.body;
        const where = and(
          eq(mapGroups.id, req.params.groupId),
          eq(mapGroups.campaignId, v.access.campaign.id),
        );
        const [before] = await tx.select().from(mapGroups).where(where).for('update');
        if (!before) throw notFound('Dossier');
        if (version !== undefined && version !== before.version) throw versionConflict();
        const [g] = await tx
          .update(mapGroups)
          .set({ ...changes, version: sql`${mapGroups.version} + 1`, updatedAt: sql`now()` })
          .where(where)
          .returning();
        await mapEvent(tx, ctx, v, {
          type: 'map_group.updated',
          aggregate: { type: 'map_group', id: g!.id },
          payload: groupApi(g!),
          visibility: 'gm_only',
        });
        return groupApi(g!);
      });
    },
  );

  r.delete(
    '/v1/campaigns/:id/map-groups/:groupId',
    { ...auth, schema: { params: GroupParams } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const [g] = await tx
          .delete(mapGroups)
          .where(
            and(
              eq(mapGroups.id, req.params.groupId),
              eq(mapGroups.campaignId, v.access.campaign.id),
            ),
          )
          .returning({ id: mapGroups.id });
        if (!g) throw notFound('Dossier');
        await mapEvent(tx, ctx, v, {
          type: 'map_group.deleted',
          aggregate: { type: 'map_group', id: g.id },
          payload: { id: g.id },
          visibility: 'gm_only',
        });
      });
      reply.code(204);
    },
  );
};
