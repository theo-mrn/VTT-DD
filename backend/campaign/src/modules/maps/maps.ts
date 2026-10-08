/**
 * Cartes (scènes), dossiers, réglages, brouillard et requêtes spatiales.
 *
 *   GET    /v1/campaigns/:id/maps                               cartes visibles par l'appelant
 *   POST   /v1/campaigns/:id/maps                               créer (MJ)
 *   GET    /v1/campaigns/:id/maps/:mapId?bbox=                  carte complète (chargement initial)
 *   PATCH  /v1/campaigns/:id/maps/:mapId                        modifier (MJ)
 *   DELETE /v1/campaigns/:id/maps/:mapId                        supprimer (MJ, aucun joueur dessus)
 *   POST   /v1/campaigns/:id/maps/:mapId/rescale                mettre à l'échelle toute la géométrie (MJ)
 *   GET    /v1/campaigns/:id/maps/:mapId/line-of-sight?from=&to= segment coupé (@vtt/vision) ?
 *   GET    /v1/campaigns/:id/maps/:mapId/at?x=&y=               zones sonores, portails, lumières sous un point
 *   GET    /v1/campaigns/:id/map-settings                       réglages de carte de la campagne
 *   PATCH  /v1/campaigns/:id/map-settings                       modifier (MJ)
 *   GET|POST /v1/campaigns/:id/map-groups, PATCH|DELETE …/:groupId   dossiers de scènes (MJ)
 *
 * Brouillard : `fogFull` de la carte (PATCH) et couche `fog-zones` (layers.ts). L'ancien
 * brouillard par cases (`/fog`, table map_fog) est converti en zones par 0017-map-visibility.sql.
 */
import {
  CreateMapGroup,
  CreateMapScene,
  RescaleMap,
  UpdateMapGroup,
  UpdateMapScene,
  UpdateMapSettings,
  playGridOf,
  uuidv7,
  type MapGroup,
  type MapScene,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  mapGroups,
  mapLights,
  mapMusicZones,
  mapPortals,
  maps,
  mapSettings,
  mapTokens,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { CampaignId, Uuid } from '../schemas.js';
import {
  Bbox,
  loadMap,
  mapEvent,
  MapParams,
  type MapRow,
  notFound,
  requestContext,
  requireGm,
  sceneSettingsOf,
  settingsApi,
  sqlPoint,
  sqlUuids,
  versionConflict,
  type Viewer,
  viewerOf,
} from './common.js';
import {
  LAYERS,
  layerDef,
  layerItemFor,
  layerKey,
  listLayer,
  visibleFor,
  type LayerRow,
} from './layers.js';
import { rescaleMap } from './rescale.js';
import { listTokens } from './tokens.js';
import { explorationFor } from './exploration.js';
import { queueExploration } from './exploration-queue.js';
import { lineOfSight, notifyVisibilityChanged, viewerVision } from './vision.js';
import { occlusionOn } from './vision-rules.js';

export const mapApi = (m: MapRow): MapScene => ({
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
  display: m.layers,
  fogFull: m.fogFull,
  grids: m.grids,
  exploration: m.exploration,
  voice: m.voice,
  version: m.version,
  updatedAt: m.updatedAt.toISOString(),
});

type GroupRow = typeof mapGroups.$inferSelect;
const groupApi = (g: GroupRow): MapGroup => ({
  id: g.id,
  name: g.name,
  sortOrder: g.sortOrder,
  version: g.version,
});

const GroupParams = z.object({ id: CampaignId, groupId: Uuid('Identifiant de dossier invalide') });

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

/** Chargement initial : la carte et toutes ses couches, filtrées pour l'appelant. */
export async function mapSnapshot(
  db: Db | Tx,
  v: Viewer,
  map: MapRow,
  bbox?: [number, number, number, number],
) {
  // Une seule lecture de la visibilité pour tokens et objets (joueur)
  const vision = viewerVision(db, v, map.id);
  const [exploration, tokens, ...layers] = await Promise.all([
    explorationFor(db, map),
    listTokens(db, v, map.id, bbox, vision),
    ...LAYERS.map((def) => listLayer(db, def, v, map.id, bbox, vision)),
  ]);
  return {
    map: mapApi(map),
    tokens,
    ...Object.fromEntries(LAYERS.map((def, i) => [layerKey(def), layers[i]])),
    exploration,
  };
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
        body: CreateMapScene,
      },
    },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const map = await db
        .transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          requireGm(v);
          const { display, ...fields } = req.body;
          // Les calques Sol, Objets et Personnages naissent avec la carte (déclencheur 0018)
          const [row] = await tx
            .insert(maps)
            .values({
              ...fields,
              ...(display !== undefined ? { layers: display } : {}),
              id: uuidv7(),
              campaignId: v.access.campaign.id,
            })
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
      return mapSnapshot(db, v, map, req.query.bbox);
    },
  );

  r.patch(
    '/v1/campaigns/:id/maps/:mapId',
    {
      ...auth,
      schema: {
        params: MapParams,
        body: UpdateMapScene,
      },
    },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const map = await db
        .transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          requireGm(v);
          const before = await loadMap(tx, v, req.params.mapId, true);
          const { version, display, ...changes } = req.body;
          if (version !== undefined && version !== before.version) throw versionConflict();
          const width = changes.width !== undefined ? changes.width : before.width;
          const height = changes.height !== undefined ? changes.height : before.height;
          if ((width == null) !== (height == null))
            throw HttpError.badRequest('width et height vont ensemble', 'size_incomplete');
          const [after] = await tx
            .update(maps)
            .set({
              ...changes,
              ...(display !== undefined ? { layers: display } : {}),
              version: sql`${maps.version} + 1`,
              updatedAt: sql`now()`,
            })
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
          // Brouillard, taille ou occlusion changés : la vue des joueurs aussi
          // (la case de la scène change les rayons des lumières)
          if (
            before.fogFull !== after!.fogFull ||
            playGridOf(before)?.size !== playGridOf(after)?.size ||
            before.width !== after!.width ||
            before.height !== after!.height ||
            occlusionOn(before.layers) !== occlusionOn(after!.layers)
          )
            await notifyVisibilityChanged(tx, ctx, v, after!);
          // Exploration activée : ce que le groupe voit en ce moment est exploré tout de suite
          if (before.exploration === 'off' && after!.exploration !== 'off')
            await queueExploration(tx, after!);
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

  // ─── Mise à l'échelle ────────────────────────────────────────────────────

  r.post(
    '/v1/campaigns/:id/maps/:mapId/rescale',
    { ...auth, schema: { params: MapParams, body: RescaleMap } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const { v, after } = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const before = await loadMap(tx, v, req.params.mapId, true);
        const after = await rescaleMap(tx, before, req.body);
        await mapEvent(tx, ctx, v, {
          type: 'map.updated',
          aggregate: { type: 'map', id: after.id },
          payload: mapApi(after),
          visibility: after.visibleToPlayers ? 'public' : 'gm_only',
        });
        await mapEvent(tx, ctx, v, {
          type: 'map.rescaled',
          aggregate: { type: 'map', id: after.id },
          payload: { mapId: after.id, ...req.body, version: after.version },
          visibility: after.visibleToPlayers ? 'public' : 'gm_only',
        });
        return { v, after };
      });
      // La carte relue après validation (lectures parallèles sur le pool)
      return mapSnapshot(db, v, after);
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
      return lineOfSight(db, map.id, req.query.from, req.query.to);
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
      const ppu = (await sceneSettingsOf(db, map)).pixelsPerUnit;
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
        // Lumière attachée à un token : elle est où il est
        db
          .select({ light: mapLights })
          .from(mapLights)
          .leftJoin(
            mapTokens,
            and(eq(mapTokens.id, mapLights.attachedTokenId), eq(mapTokens.present, true)),
          )
          .where(
            and(
              eq(mapLights.mapId, map.id),
              sql`ST_DWithin(coalesce(${mapTokens.pos}, ${mapLights.pos}), ${p}, ${mapLights.radius} * ${ppu}::float8)`,
            ),
          )
          .then((rows) => rows.map((x) => x.light)),
      ]);
      const pick = (path: 'music-zones' | 'portals' | 'lights', rows: object[]) => {
        const def = layerDef(path);
        return (rows as LayerRow[])
          .filter((row) => visibleFor(def, v, row, new Set()))
          .map((row) => layerItemFor(def, v, row));
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
        body: UpdateMapSettings,
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
        body: CreateMapGroup,
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
        body: UpdateMapGroup,
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
