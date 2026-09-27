/**
 * Couches simples de la carte : objets, lumières, obstacles, dessins, textes,
 * zones sonores, portails et gabarits. Même contrat pour toutes :
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
import { uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, sql, type AnyColumn } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import {
  DIRECTIONS,
  DRAWING_TOOLS,
  MEASUREMENT_SHAPES,
  OBJECT_KINDS,
  OBJECT_VISIBILITIES,
  OBSTACLE_KINDS,
  PORTAL_ICONS,
  PORTAL_KINDS,
  ROOM_MODES,
  mapDrawings,
  mapLights,
  mapMeasurements,
  mapMusicZones,
  mapNotes,
  mapObjects,
  mapObstacles,
  mapPortals,
  maps,
  type MapPoint,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  Bbox,
  Color,
  envelope,
  ItemId,
  ItemParams,
  loadMap,
  MapParams,
  mapEvent,
  MediaUrl,
  Name,
  notFound,
  Point,
  Points,
  requestContext,
  requireGm,
  requireWriter,
  Version,
  versionConflict,
  viewerOf,
  type MapRow,
  type Viewer,
} from './common.js';

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

interface LayerDef {
  /** Segment d'URL. */
  path: string;
  /** Domaine des événements (`<domaine>.created`…). */
  domain: string;
  /** Nom affiché dans les erreurs. */
  label: string;
  table: unknown;
  /** Colonne géométrique (filtre ?bbox=). */
  geom: AnyColumn;
  /** Champs de l'API (tous modifiables). */
  fields: z.ZodRawShape;
  /** Champs obligatoires à la création. */
  required: string[];
  /** Qui écrit : le MJ, ou tout membre (l'auteur modifie et supprime ses éléments). */
  write: 'gm' | 'author';
  /** Visible de tous les membres (sinon MJ seulement, sauf `visibleTo`). */
  isPublic?: (row: Row) => boolean;
  /** Personnages qui voient un élément non public (visibilité `custom`). */
  visibleTo?: (row: Row) => string[];
  /** Modification permise à un joueur non auteur (porte non verrouillée). */
  playerPatch?: (row: Row, patch: Input) => boolean;
  /** Champs API → colonnes. */
  toColumns?: (input: Input) => Input;
  /** Ligne → API (dates et géométries converties). */
  toApi?: (row: Row) => Input;
  /** Contrôles qui demandent la base (cible d'un portail dans la campagne). */
  check?: (db: Db | Tx, map: MapRow, input: Input) => Promise<void>;
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

const Visibility = z.enum(OBJECT_VISIBILITIES);
const CharacterIds = z.array(z.uuid().transform((s) => s.toLowerCase())).max(100);

// ─── Couches ─────────────────────────────────────────────────────────────────

export const LAYERS: LayerDef[] = [
  {
    path: 'objects',
    domain: 'map_object',
    label: 'Objet',
    table: mapObjects,
    geom: mapObjects.pos,
    fields: {
      name: Name,
      kind: z.enum(OBJECT_KINDS),
      imageUrl: MediaUrl.or(z.literal('')),
      pos: Point,
      width: z.number().positive().max(100_000),
      height: z.number().positive().max(100_000),
      rotation: z.number().finite(),
      isBackground: z.boolean(),
      isLocked: z.boolean(),
      visibility: Visibility,
      visibleTo: CharacterIds,
      notes: z.string().max(10_000).nullable(),
      items: z.array(z.record(z.string(), z.unknown())).max(500),
      linkedId: z.string().max(200).nullable(),
      groupEntityId: z.string().max(200).nullable(),
    },
    required: ['pos'],
    write: 'gm',
    isPublic: (r) => r.visibility === 'visible',
    visibleTo: (r) => (r.visibility === 'custom' ? (r.visibleTo as string[]) : []),
  },
  {
    path: 'lights',
    domain: 'map_light',
    label: 'Lumière',
    table: mapLights,
    geom: mapLights.pos,
    fields: {
      name: Name,
      pos: Point,
      radius: z.number().min(0).max(100_000),
      visible: z.boolean(),
    },
    required: ['pos'],
    write: 'gm',
    isPublic: (r) => r.visible === true,
  },
  {
    path: 'obstacles',
    domain: 'map_obstacle',
    label: 'Obstacle',
    table: mapObstacles,
    geom: mapObstacles.geom,
    fields: {
      kind: z.enum(OBSTACLE_KINDS),
      points: Points(2, 1000),
      direction: z.enum(DIRECTIONS).nullable(),
      isOpen: z.boolean(),
      isLocked: z.boolean(),
      color: Color.nullable(),
      opacity: z.number().min(0).max(1).nullable(),
      roomMode: z.enum(ROOM_MODES).nullable(),
    },
    required: ['points'],
    write: 'gm',
    playerPatch: (r, patch) =>
      r.kind === 'door' &&
      !r.isLocked &&
      Object.keys(patch).every((k) => k === 'isOpen' || k === 'version'),
    toColumns: pointsToGeom,
  },
  {
    path: 'drawings',
    domain: 'map_drawing',
    label: 'Dessin',
    table: mapDrawings,
    geom: mapDrawings.geom,
    fields: {
      tool: z.enum(DRAWING_TOOLS),
      points: Points(1, 20_000),
      color: Color,
      width: z.number().positive().max(1000),
      fill: Color.nullable(),
      closed: z.boolean(),
      smooth: z.boolean(),
    },
    required: ['points'],
    write: 'author',
    toColumns: pointsToGeom,
    clearable: true,
  },
  {
    path: 'notes',
    domain: 'map_note',
    label: 'Texte',
    table: mapNotes,
    geom: mapNotes.pos,
    fields: {
      text: z.string().max(5000),
      pos: Point,
      color: Color,
      fontSize: z.number().positive().max(1000),
      fontFamily: z.string().trim().max(100).nullable(),
    },
    required: ['text', 'pos'],
    write: 'author',
  },
  {
    path: 'music-zones',
    domain: 'map_music_zone',
    label: 'Zone sonore',
    table: mapMusicZones,
    geom: mapMusicZones.pos,
    fields: {
      name: Name,
      pos: Point,
      radius: z.number().min(0).max(100_000),
      /** Fichier audio (https) ou identifiant de vidéo YouTube. */
      url: MediaUrl.or(z.string().regex(/^[\w-]{6,20}$/, 'URL ou id YouTube attendu')).nullable(),
      volume: z.number().min(0).max(1),
      color: Color.nullable(),
    },
    required: ['pos'],
    write: 'gm',
  },
  {
    path: 'portals',
    domain: 'map_portal',
    label: 'Portail',
    table: mapPortals,
    geom: mapPortals.pos,
    fields: {
      name: Name,
      pos: Point,
      radius: z.number().min(0).max(100_000),
      kind: z.enum(PORTAL_KINDS),
      targetMapId: z
        .uuid()
        .transform((s) => s.toLowerCase())
        .nullable(),
      target: Point.nullable(),
      icon: z.enum(PORTAL_ICONS).nullable(),
      color: Color.nullable(),
      visible: z.boolean(),
    },
    required: ['pos'],
    write: 'gm',
    isPublic: (r) => r.visible === true,
    check: async (db, map, input) => {
      if (!input.targetMapId) return;
      const [target] = await db
        .select({ id: maps.id })
        .from(maps)
        .where(and(eq(maps.id, input.targetMapId as string), eq(maps.campaignId, map.campaignId)));
      if (!target)
        throw new HttpError(422, 'Refusé', 'unknown_target_map', 'Carte cible introuvable');
    },
  },
  {
    path: 'measurements',
    domain: 'map_measurement',
    label: 'Gabarit',
    table: mapMeasurements,
    geom: mapMeasurements.geom,
    fields: {
      shape: z.enum(MEASUREMENT_SHAPES),
      start: Point,
      end: Point,
      color: Color,
      skin: z.string().trim().max(200).nullable(),
      /** Réglages du gabarit (cône : coneWidth, coneAngle, coneShape, coneMode, fixedLength…). */
      options: z.record(z.string(), z.unknown()),
    },
    required: ['shape', 'start', 'end'],
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

// ─── Opérations ──────────────────────────────────────────────────────────────

const table = (def: LayerDef) => def.table as LayerTable;
export const layerItemApi = (def: LayerDef, row: Row) => (def.toApi ?? baseApi)(row);
const toApi = layerItemApi;
const isPublic = (def: LayerDef, row: Row) => def.isPublic?.(row) ?? true;

/** Un joueur voit les éléments publics et ceux `custom` qui visent un de ses personnages. */
export function visibleFor(def: LayerDef, v: Viewer, row: Row) {
  return (
    v.isGm ||
    isPublic(def, row) ||
    (def.visibleTo?.(row) ?? []).some((id) => v.characterIds.includes(id))
  );
}

/** Éléments d'une couche sur une carte, filtrés pour l'appelant. */
export async function listLayer(
  db: Db | Tx,
  def: LayerDef,
  v: Viewer,
  mapId: string,
  bbox?: [number, number, number, number],
) {
  const t = table(def);
  const rows = (await db
    .select()
    .from(t)
    .where(and(eq(t.mapId, mapId), bbox ? sql`${def.geom} && ${envelope(bbox)}` : undefined))
    .orderBy(asc(t.createdAt), asc(t.id))) as unknown as Row[];
  return rows.filter((r) => visibleFor(def, v, r)).map((r) => toApi(def, r));
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
  await def.check?.(tx, map, input);
  const values = {
    ...(def.toColumns ?? ((x: Input) => x))(input),
    id: uuidv7(),
    campaignId: map.campaignId,
    mapId: map.id,
    ...(def.write === 'author' ? { createdBy: v.userId } : {}),
  };
  const [row] = (await tx
    .insert(table(def))
    .values(values as never)
    .returning()) as unknown as Row[];
  const api = toApi(def, row!);
  await mapEvent(tx, ctx, v, {
    type: `${def.domain}.created`,
    aggregate: { type: def.domain, id: row!.id },
    payload: api,
    visibility: isPublic(def, row!) ? 'public' : 'gm_only',
  });
  return api;
}

async function lockItem(tx: Tx, def: LayerDef, v: Viewer, mapId: string, itemId: string) {
  const t = table(def);
  const [row] = (await tx
    .select()
    .from(t)
    .where(and(eq(t.id, itemId), eq(t.mapId, mapId)))
    .for('update')) as unknown as Row[];
  if (!row || !visibleFor(def, v, row)) throw notFound(def.label);
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

async function updateItem(
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
  await def.check?.(tx, map, changes);
  const t = table(def);
  const [after] = (await tx
    .update(t)
    .set({
      ...(def.toColumns ?? ((x: Input) => x))(changes),
      version: sql`${t.version} + 1`,
      updatedAt: sql`now()`,
    } as never)
    .where(eq(t.id, itemId))
    .returning()) as unknown as Row[];
  const api = toApi(def, after!);
  const visible = isPublic(def, after!);
  await mapEvent(tx, ctx, v, {
    type: `${def.domain}.updated`,
    aggregate: { type: def.domain, id: itemId },
    payload: api,
    visibility: visible ? 'public' : 'gm_only',
  });
  // Élément qui vient d'être caché : les joueurs le retirent
  if (isPublic(def, before) && !visible)
    await mapEvent(tx, ctx, v, {
      type: `${def.domain}.hidden`,
      aggregate: { type: def.domain, id: itemId },
      payload: { id: itemId, mapId: map.id },
    });
  return api;
}

async function deleteItem(
  tx: Tx,
  ctx: EventContext,
  def: LayerDef,
  v: Viewer,
  map: MapRow,
  itemId: string,
) {
  const before = await lockItem(tx, def, v, map.id, itemId);
  requireEdit(def, v, before);
  const t = table(def);
  await tx.delete(t).where(eq(t.id, itemId));
  await mapEvent(tx, ctx, v, {
    type: `${def.domain}.deleted`,
    aggregate: { type: def.domain, id: itemId },
    payload: { id: itemId, mapId: map.id },
    visibility: isPublic(def, before) ? 'public' : 'gm_only',
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/** Schéma de création : champs obligatoires, les autres facultatifs (valeurs par défaut en base). */
function createSchema(def: LayerDef) {
  const shape: Record<string, z.ZodType> = {};
  for (const [k, s] of Object.entries(def.fields))
    shape[k] = def.required.includes(k) ? (s as z.ZodType) : (s as z.ZodType).optional();
  return z.strictObject(shape);
}

const patchSchema = (def: LayerDef) =>
  z.strictObject(def.fields).partial().extend({ version: Version });

export const registerLayers: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  for (const def of LAYERS) {
    const base = `/v1/campaigns/:id/maps/:mapId/${def.path}`;
    const Create = createSchema(def);
    const Patch = patchSchema(def);

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
        return createItem(tx, ctx, def, v, map, req.body);
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
          return updateItem(tx, ctx, def, v, map, req.params.itemId, req.body);
        });
      },
    );

    r.delete(`${base}/:itemId`, { ...auth, schema: { params: ItemParams } }, async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const map = await loadMap(tx, v, req.params.mapId);
        await deleteItem(tx, ctx, def, v, map, req.params.itemId);
      });
      reply.code(204);
    });

    r.post(
      `${base}/batch`,
      {
        ...auth,
        schema: {
          params: MapParams,
          body: z.strictObject({
            create: z.array(Create).max(500).default([]),
            update: z
              .array(Patch.extend({ id: ItemId }))
              .max(500)
              .default([]),
            delete: z.array(ItemId).max(500).default([]),
          }),
        },
      },
      async (req) => {
        const { userId, ctx } = requestContext(req);
        return db.transaction(async (tx) => {
          const v = await viewerOf(tx, req.params.id, userId);
          const map = await loadMap(tx, v, req.params.mapId);
          const created = [];
          for (const input of req.body.create)
            created.push(await createItem(tx, ctx, def, v, map, input));
          const updated = [];
          for (const { id, ...patch } of req.body.update)
            updated.push(await updateItem(tx, ctx, def, v, map, id as string, patch));
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
              type: `${def.domain}.cleared`,
              aggregate: { type: 'map', id: map.id },
              payload: { mapId: map.id, ids: removed.map((x) => x.id) },
            });
        });
        reply.code(204);
      });
  }
};
