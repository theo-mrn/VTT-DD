/**
 * Couches de la carte au contrat commun : objets, lumières, obstacles, pièces, zones de
 * brouillard, dessins, textes, zones sonores, portails et gabarits. Schémas : contrat
 * `MAP_LAYERS` de @vtt/contracts (docs/api-map.md).
 *
 *   GET    /v1/campaigns/:id/maps/:mapId/<couche>?bbox=x1,y1,x2,y2   liste (filtrée pour les joueurs)
 *   POST   /v1/campaigns/:id/maps/:mapId/<couche>                    créer
 *   PATCH  /v1/campaigns/:id/maps/:mapId/<couche>/:itemId            modifier ({ version } facultatif)
 *   DELETE /v1/campaigns/:id/maps/:mapId/<couche>/:itemId            supprimer
 *   POST   /v1/campaigns/:id/maps/:mapId/<couche>/batch              { create, update, delete } en une transaction
 *   DELETE /v1/campaigns/:id/maps/:mapId/drawings                     effacer les dessins (les siens pour un joueur)
 *
 * Écriture : MJ seulement, sauf dessins, textes et gabarits (tout membre non
 * spectateur ; modification et suppression par l'auteur ou le MJ) et portes
 * (un joueur ouvre ou ferme une porte non verrouillée).
 */
import {
  DeleteMapLayerQuery,
  MAP_LAYERS,
  mapLayerBatch,
  uuidv7,
  type MapLayerPath,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, sql, type AnyColumn } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import {
  mapDrawings,
  mapFogZones,
  mapLayers,
  mapLights,
  mapMeasurements,
  mapMusicZones,
  mapNotes,
  mapObjects,
  mapObstacles,
  mapPortals,
  mapRooms,
  maps,
  mapTokens,
  type MapPoint,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  Bbox,
  checkLayer,
  envelope,
  hiddenLayerIds,
  loadMap,
  MapParams,
  ItemParams,
  mapEvent,
  notFound,
  requestContext,
  requireGm,
  requireWriter,
  sqlCircle,
  versionConflict,
  viewerOf,
  type MapRow,
  type Viewer,
} from './common.js';
import { moveLayerContent } from './arrange.js';

export type LayerRow = Record<string, unknown> & {
  id: string;
  campaignId: string;
  mapId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
};
type Row = LayerRow;
type Input = Record<string, unknown>;

/** Table d'une couche (colonnes communes : id, campaign_id, map_id, version, dates). */
type LayerTable = typeof mapLights;

export interface LayerDef {
  /** Segment d'URL (clé de `MAP_LAYERS`). */
  path: MapLayerPath;
  /** Nom affiché dans les erreurs. */
  label: string;
  table: unknown;
  /** Colonne géométrique (filtre ?bbox=) ; absente : pas de filtre (calques). */
  geom?: AnyColumn;
  /** Rangé dans un calque du MJ (`layerId`) : invisible des joueurs si le calque leur est masqué. */
  layered?: boolean;
  /** Ordre des listes (défaut : création, puis identifiant). */
  order?: AnyColumn[];
  /** Qui écrit : le MJ, ou tout membre (l'auteur modifie et supprime ses éléments). */
  write: 'gm' | 'author';
  /** L'auteur est enregistré (`created_by`) même si seul le MJ écrit. */
  author?: boolean;
  /** Visible de tous les membres (sinon MJ seulement, sauf `visibleTo`). */
  isPublic?: (row: Row) => boolean;
  /** Personnages qui voient un élément non public (visibilité `custom`). */
  visibleTo?: (row: Row) => string[];
  /** Modification permise à un joueur non auteur (porte non verrouillée). */
  playerPatch?: (row: Row, patch: Input) => boolean;
  /** Valeurs par défaut d'une création (mur à sens unique : bloque à gauche). */
  defaults?: (db: Db | Tx, map: MapRow, input: Input) => Input | Promise<Input>;
  /** Champs API → colonnes (`before` : ligne modifiée, absente à la création). */
  toColumns?: (input: Input, before?: Row) => Input;
  /** Ligne → API (dates et géométries converties). */
  toApi?: (row: Row) => Input;
  /** Contrôles qui demandent la base (cible d'un portail, token suivi, calque). */
  check?: (db: Db | Tx, map: MapRow, input: Input, v: Viewer) => Promise<void>;
  /** Avant une suppression (calque : son contenu change de calque). */
  beforeDelete?: (
    tx: Tx,
    ctx: EventContext,
    v: Viewer,
    map: MapRow,
    row: Row,
    o: { moveTo?: string },
  ) => Promise<void>;
  /** DELETE sur la collection : effacer toute la couche de la carte. */
  clearable?: boolean;
}

// ─── Conversions communes ────────────────────────────────────────────────────

/** Une ligne a au moins deux points : un clic sans mouvement en donne deux identiques. */
const line = (points: MapPoint[]) => (points.length === 1 ? [points[0]!, points[0]!] : points);

const pointsToGeom = (input: Input) => {
  const { points, ...rest } = input;
  return points ? { ...rest, geom: line(points as MapPoint[]) } : rest;
};

const baseApi = (row: Row): Input => {
  const { campaignId: _c, createdAt: _d, updatedAt, geom, ...rest } = row;
  return { ...rest, ...(geom ? { points: geom } : {}), updatedAt: updatedAt.toISOString() };
};

const refused = (message: string, code: string) => new HttpError(422, 'Refusé', code, message);

// ─── Couches ─────────────────────────────────────────────────────────────────

/** Calque cible d'un élément créé ou modifié (`layerId`). */
const layerCheck = (db: Db | Tx, map: MapRow, input: Input, v: Viewer) =>
  input.layerId !== undefined ? checkLayer(db, v, map.id, input.layerId) : Promise.resolve();

export const LAYERS: LayerDef[] = [
  {
    path: 'layers',
    label: 'Calque',
    table: mapLayers,
    order: [mapLayers.sortOrder, mapLayers.id],
    write: 'gm',
    isPublic: (r) => r.visibleToPlayers === true,
    // Sans ordre : en haut de la pile
    defaults: async (db, map, input) => {
      if (input.sortOrder !== undefined) return input;
      const [top] = await db
        .select({ top: sql<number | null>`max(${mapLayers.sortOrder})` })
        .from(mapLayers)
        .where(eq(mapLayers.mapId, map.id));
      return { ...input, sortOrder: (top?.top ?? -1) + 1 };
    },
    beforeDelete: (tx, ctx, v, map, row, o) => moveLayerContent(tx, ctx, v, map, row, o.moveTo),
  },
  {
    path: 'objects',
    label: 'Objet',
    table: mapObjects,
    geom: mapObjects.pos,
    layered: true,
    write: 'gm',
    check: layerCheck,
    isPublic: (r) => r.visibility === 'visible',
    visibleTo: (r) => (r.visibility === 'custom' ? (r.visibleTo as string[]) : []),
    // `isBackground` : colonne legacy (calque par défaut à l'insertion), hors contrat
    toApi: (row) => {
      const { isBackground: _b, ...rest } = baseApi(row);
      return rest;
    },
  },
  {
    path: 'lights',
    label: 'Lumière',
    table: mapLights,
    geom: mapLights.pos,
    write: 'gm',
    isPublic: (r) => r.visible === true,
    check: async (db, map, input) => {
      if (!input.attachedTokenId) return;
      const [token] = await db
        .select({ id: mapTokens.id })
        .from(mapTokens)
        .where(
          and(
            eq(mapTokens.id, input.attachedTokenId as string),
            eq(mapTokens.mapId, map.id),
            eq(mapTokens.present, true),
          ),
        );
      if (!token) throw refused('Token introuvable sur cette carte', 'unknown_token');
    },
  },
  {
    path: 'obstacles',
    label: 'Obstacle',
    table: mapObstacles,
    geom: mapObstacles.geom,
    write: 'gm',
    playerPatch: (r, patch) =>
      r.kind === 'door' &&
      !r.isLocked &&
      Object.keys(patch).every((k) => k === 'isOpen' || k === 'version'),
    defaults: (_db, _map, input) =>
      input.kind === 'one_way_wall' && input.blocksFrom == null
        ? { ...input, blocksFrom: 'left' }
        : input,
    toColumns: pointsToGeom,
    // `direction` : colonne obsolète (0017), remplacée par `blocksFrom`
    toApi: (row) => {
      const { direction: _d, ...rest } = baseApi(row);
      return rest;
    },
  },
  {
    path: 'rooms',
    label: 'Pièce',
    table: mapRooms,
    geom: mapRooms.geom,
    write: 'gm',
    toColumns: (input) => {
      const { points, ...rest } = input;
      return points ? { ...rest, geom: points } : rest;
    },
  },
  {
    path: 'fog-zones',
    label: 'Zone de brouillard',
    table: mapFogZones,
    geom: mapFogZones.geom,
    order: [mapFogZones.seq],
    write: 'gm',
    author: true,
    toColumns: (input, before) => {
      const { points, center, radius, ...rest } = input as Input & {
        points?: MapPoint[];
        center?: MapPoint;
        radius?: number;
      };
      const shape = (before?.shape ?? input.shape) as string;
      if (shape === 'circle') {
        if (points !== undefined)
          throw refused('Un cercle se règle par center et radius', 'fog_zone_shape');
        if (center === undefined && radius === undefined) return rest;
        const c = center ?? (before!.center as MapPoint);
        const r = radius ?? (before!.radius as number);
        return { ...rest, center: c, radius: r, geom: sqlCircle(c, r) };
      }
      if (center !== undefined || radius !== undefined)
        throw refused('Seul un cercle a un centre et un rayon', 'fog_zone_shape');
      if (points === undefined) return rest;
      if (shape === 'rect' && points.length !== 4)
        throw refused('Un rectangle a 4 points', 'fog_zone_shape');
      return { ...rest, geom: points };
    },
    toApi: (row) => {
      const { seq, geom, center, radius, ...rest } = row as Row & {
        seq: number;
        geom: MapPoint[];
      };
      const circle = rest.shape === 'circle';
      return {
        ...baseApi(rest as Row),
        points: circle ? [] : geom,
        center: circle ? center : null,
        radius: circle ? radius : null,
        order: Number(seq),
      };
    },
  },
  {
    path: 'drawings',
    label: 'Dessin',
    table: mapDrawings,
    geom: mapDrawings.geom,
    layered: true,
    write: 'author',
    check: layerCheck,
    toColumns: pointsToGeom,
    clearable: true,
  },
  {
    path: 'notes',
    label: 'Texte',
    table: mapNotes,
    geom: mapNotes.pos,
    layered: true,
    write: 'author',
    check: layerCheck,
  },
  {
    path: 'music-zones',
    label: 'Zone sonore',
    table: mapMusicZones,
    geom: mapMusicZones.pos,
    write: 'gm',
  },
  {
    path: 'portals',
    label: 'Portail',
    table: mapPortals,
    geom: mapPortals.pos,
    write: 'gm',
    isPublic: (r) => r.visible === true,
    check: async (db, map, input) => {
      if (!input.targetMapId) return;
      const [target] = await db
        .select({ id: maps.id })
        .from(maps)
        .where(and(eq(maps.id, input.targetMapId as string), eq(maps.campaignId, map.campaignId)));
      if (!target) throw refused('Carte cible introuvable', 'unknown_target_map');
    },
  },
  {
    path: 'measurements',
    label: 'Gabarit',
    table: mapMeasurements,
    geom: mapMeasurements.geom,
    write: 'author',
    toColumns: ({ start, end, ...rest }) => {
      if (!start !== !end)
        throw HttpError.badRequest('start et end se modifient ensemble', 'start_end_together');
      return start ? { ...rest, geom: [start, end] } : rest;
    },
    toApi: (row) => {
      const { points, ...rest } = baseApi(row) as { points: MapPoint[] };
      return { ...rest, start: points[0], end: points[1] };
    },
  },
];

export const layerDef = (path: MapLayerPath) => LAYERS.find((d) => d.path === path)!;
/** Domaine des événements d'une couche (`map_object`…). */
export const layerDomain = (def: LayerDef) => MAP_LAYERS[def.path].domain;
/** Clé d'une couche dans le chargement initial (`fogZones`…). */
export const layerKey = (def: LayerDef) => MAP_LAYERS[def.path].key;

// ─── Opérations ──────────────────────────────────────────────────────────────

const table = (def: LayerDef) => def.table as LayerTable;
export const layerItemApi = (def: LayerDef, row: Row) => (def.toApi ?? baseApi)(row);
const toApi = layerItemApi;
/** Élément d'un calque masqué aux joueurs. */
const inHiddenLayer = (def: LayerDef, row: Row, hidden: Set<string>) =>
  def.layered === true && typeof row.layerId === 'string' && hidden.has(row.layerId);

/** Visible de tous les membres : public par sa couche et hors d'un calque masqué. */
export const isPublicItem = (def: LayerDef, row: Row, hidden: Set<string>) =>
  (def.isPublic?.(row) ?? true) && !inHiddenLayer(def, row, hidden);
const isPublic = isPublicItem;

/**
 * Un joueur voit les éléments publics et ceux `custom` qui visent un de ses personnages,
 * jamais le contenu d'un calque qui lui est masqué.
 */
export function visibleFor(def: LayerDef, v: Viewer, row: Row, hidden: Set<string>) {
  if (v.isGm) return true;
  if (inHiddenLayer(def, row, hidden)) return false;
  return (
    (def.isPublic?.(row) ?? true) ||
    (def.visibleTo?.(row) ?? []).some((id) => v.characterIds.includes(id))
  );
}

/** Calques masqués de la carte, si la couche en dépend. */
export const hiddenFor = (db: Db | Tx, def: LayerDef, mapId: string) =>
  def.layered ? hiddenLayerIds(db, mapId) : Promise.resolve(new Set<string>());

/** Éléments d'une couche sur une carte, filtrés pour l'appelant. */
export async function listLayer(
  db: Db | Tx,
  def: LayerDef,
  v: Viewer,
  mapId: string,
  bbox?: [number, number, number, number],
) {
  const t = table(def);
  const hidden = await hiddenFor(db, def, mapId);
  const rows = (await db
    .select()
    .from(t)
    .where(
      and(eq(t.mapId, mapId), bbox && def.geom ? sql`${def.geom} && ${envelope(bbox)}` : undefined),
    )
    .orderBy(...(def.order ?? [t.createdAt, t.id]).map((c) => asc(c)))) as unknown as Row[];
  return rows.filter((r) => visibleFor(def, v, r, hidden)).map((r) => toApi(def, r));
}

async function createItem(
  tx: Tx,
  ctx: EventContext,
  def: LayerDef,
  v: Viewer,
  map: MapRow,
  input: Input,
) {
  if (def.write === 'gm') requireGm(v);
  else requireWriter(v);
  const withDefaults = def.defaults ? await def.defaults(tx, map, input) : input;
  await def.check?.(tx, map, withDefaults, v);
  const values = {
    ...(def.toColumns ?? ((x: Input) => x))(withDefaults),
    id: uuidv7(),
    campaignId: map.campaignId,
    mapId: map.id,
    ...(def.write === 'author' || def.author ? { createdBy: v.userId } : {}),
  };
  const [row] = (await tx
    .insert(table(def))
    .values(values as never)
    .returning()) as unknown as Row[];
  const api = toApi(def, row!);
  const hidden = await hiddenFor(tx, def, map.id);
  await mapEvent(tx, ctx, v, {
    type: `${layerDomain(def)}.created`,
    aggregate: { type: layerDomain(def), id: row!.id },
    payload: api,
    visibility: isPublic(def, row!, hidden) ? 'public' : 'gm_only',
    restricted: inHiddenLayer(def, row!, hidden),
  });
  return api;
}

export async function lockItem(tx: Tx, def: LayerDef, v: Viewer, mapId: string, itemId: string) {
  const t = table(def);
  const [row] = (await tx
    .select()
    .from(t)
    .where(and(eq(t.id, itemId), eq(t.mapId, mapId)))
    .for('update')) as unknown as Row[];
  if (!row || !visibleFor(def, v, row, await hiddenFor(tx, def, mapId))) throw notFound(def.label);
  return row;
}

/** Le MJ modifie tout ; l'auteur ses éléments (couches « author ») ; un joueur ouvre une porte. */
function requireEdit(def: LayerDef, v: Viewer, row: Row, patch?: Input) {
  if (v.isGm) return;
  requireWriter(v);
  if (def.write === 'author' && row.createdBy === v.userId) return;
  if (patch && def.playerPatch?.(row, patch)) return;
  throw HttpError.forbidden(
    def.write === 'author'
      ? 'Seuls l’auteur et le MJ modifient cet élément'
      : 'Réservé au MJ de la campagne',
  );
}

/**
 * Écrit la nouvelle version d'un élément verrouillé (`before`) et ses événements :
 * `<domaine>.updated`, et `<domaine>.hidden` public s'il vient d'être caché.
 */
export async function writeItem(
  tx: Tx,
  ctx: EventContext,
  def: LayerDef,
  v: Viewer,
  map: MapRow,
  before: Row,
  columns: Input,
) {
  const t = table(def);
  const [after] = (await tx
    .update(t)
    .set({ ...columns, version: sql`${t.version} + 1`, updatedAt: sql`now()` } as never)
    .where(eq(t.id, before.id))
    .returning()) as unknown as Row[];
  const api = toApi(def, after!);
  const hidden = await hiddenFor(tx, def, map.id);
  const visible = isPublic(def, after!, hidden);
  await mapEvent(tx, ctx, v, {
    type: `${layerDomain(def)}.updated`,
    aggregate: { type: layerDomain(def), id: before.id },
    payload: api,
    visibility: visible ? 'public' : 'gm_only',
    restricted: inHiddenLayer(def, after!, hidden),
  });
  // Élément qui vient d'être caché (visibilité, calque masqué) : les joueurs le retirent
  if (isPublic(def, before, hidden) && !visible)
    await mapEvent(tx, ctx, v, {
      type: `${layerDomain(def)}.hidden`,
      aggregate: { type: layerDomain(def), id: before.id },
      payload: { id: before.id, mapId: map.id },
    });
  return api;
}

export async function updateItem(
  tx: Tx,
  ctx: EventContext,
  def: LayerDef,
  v: Viewer,
  map: MapRow,
  itemId: string,
  patch: Input,
) {
  const before = await lockItem(tx, def, v, map.id, itemId);
  requireEdit(def, v, before, patch);
  const { version, ...changes } = patch;
  if (version !== undefined && version !== before.version) throw versionConflict();
  await def.check?.(tx, map, changes, v);
  const columns = (def.toColumns ?? ((x: Input) => x))(changes, before);
  return writeItem(tx, ctx, def, v, map, before, columns);
}

async function deleteItem(
  tx: Tx,
  ctx: EventContext,
  def: LayerDef,
  v: Viewer,
  map: MapRow,
  itemId: string,
  o: { moveTo?: string } = {},
) {
  const before = await lockItem(tx, def, v, map.id, itemId);
  requireEdit(def, v, before);
  await def.beforeDelete?.(tx, ctx, v, map, before, o);
  const t = table(def);
  const hidden = await hiddenFor(tx, def, map.id);
  await tx.delete(t).where(eq(t.id, itemId));
  await mapEvent(tx, ctx, v, {
    type: `${layerDomain(def)}.deleted`,
    aggregate: { type: layerDomain(def), id: itemId },
    payload: { id: itemId, mapId: map.id },
    visibility: isPublic(def, before, hidden) ? 'public' : 'gm_only',
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const registerLayers: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  for (const def of LAYERS) {
    const base = `/v1/campaigns/:id/maps/:mapId/${def.path}`;
    const { create: Create, update: Patch } = MAP_LAYERS[def.path];

    r.get(
      base,
      { ...auth, schema: { params: MapParams, querystring: z.object({ bbox: Bbox.optional() }) } },
      async (req) => {
        const { userId } = requestContext(req);
        const v = await viewerOf(db, req.params.id, userId);
        const map = await loadMap(db, v, req.params.mapId);
        return { items: await listLayer(db, def, v, map.id, req.query.bbox) };
      },
    );

    r.post(base, { ...auth, schema: { params: MapParams, body: Create } }, async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const created = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const map = await loadMap(tx, v, req.params.mapId);
        return createItem(tx, ctx, def, v, map, req.body as Input);
      });
      reply.code(201);
      return created;
    });

    r.patch(
      `${base}/:itemId`,
      { ...auth, schema: { params: ItemParams, body: Patch } },
      async (req) => {
        const { userId, ctx } = requestContext(req);
        return db.transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          const map = await loadMap(tx, v, req.params.mapId);
          return updateItem(tx, ctx, def, v, map, req.params.itemId, req.body as Input);
        });
      },
    );

    r.delete(
      `${base}/:itemId`,
      {
        ...auth,
        schema: {
          params: ItemParams,
          querystring: def.beforeDelete ? DeleteMapLayerQuery : z.object({}),
        },
      },
      async (req, reply) => {
        const { userId, ctx } = requestContext(req);
        const { moveTo } = req.query as { moveTo?: string };
        await db.transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          const map = await loadMap(tx, v, req.params.mapId);
          await deleteItem(tx, ctx, def, v, map, req.params.itemId, moveTo ? { moveTo } : {});
        });
        reply.code(204);
      },
    );

    r.post(
      `${base}/batch`,
      { ...auth, schema: { params: MapParams, body: mapLayerBatch(Create, Patch) } },
      async (req) => {
        const { userId, ctx } = requestContext(req);
        return db.transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          const map = await loadMap(tx, v, req.params.mapId);
          const created = [];
          for (const input of req.body.create)
            created.push(await createItem(tx, ctx, def, v, map, input as Input));
          const updated = [];
          for (const { id, ...patch } of req.body.update)
            updated.push(await updateItem(tx, ctx, def, v, map, id as string, patch as Input));
          for (const id of req.body.delete) await deleteItem(tx, ctx, def, v, map, id);
          return { created, updated, deleted: req.body.delete };
        });
      },
    );

    if (def.clearable)
      r.delete(base, { ...auth, schema: { params: MapParams } }, async (req, reply) => {
        const { userId, ctx } = requestContext(req);
        await db.transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          requireWriter(v);
          const map = await loadMap(tx, v, req.params.mapId);
          const t = table(def) as unknown as typeof mapDrawings;
          const removed = await tx
            .delete(t)
            .where(and(eq(t.mapId, map.id), v.isGm ? undefined : eq(t.createdBy, v.userId)))
            .returning({ id: t.id });
          if (removed.length)
            await mapEvent(tx, ctx, v, {
              type: `${layerDomain(def)}.cleared`,
              aggregate: { type: 'map', id: map.id },
              payload: { mapId: map.id, ids: removed.map((x) => x.id) },
            });
        });
        reply.code(204);
      });
  }
};
