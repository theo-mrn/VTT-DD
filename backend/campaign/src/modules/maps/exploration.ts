/**
 * Mémoire de l'exploration (docs/exploration.md) : un masque raster par scène, partagé par le
 * groupe, calculé ici à partir de l'état de la base (le client ne fait que le montrer).
 *
 *   GET  /v1/campaigns/:id/maps/:mapId/exploration         masque (null : coupée)
 *   POST /v1/campaigns/:id/maps/:mapId/exploration/trail   traînées d'un glisser (qui bouge)
 *   POST /v1/campaigns/:id/maps/:mapId/exploration         révéler, oublier, réinitialiser (MJ)
 *
 * - `exploreMap` : vue des observateurs du groupe (`loadMapVision`, scène gardée en mémoire) et
 *   points des traînées, marqués sur une copie du masque hors transaction ; les seules cases
 *   neuves sont ensuite fusionnées (OU) sous verrou : rien de ce qu'un autre a écrit n'est perdu.
 * - Appelée par le travailleur (`exploration-worker.ts`) pour chaque scène mise en file par une
 *   écriture (`queueExploration`), et par la route des traînées.
 * - `map.exploration_updated` : nouvel état du rectangle des cases changées, audience de la
 *   carte. Rien d'autre n'est envoyé : PNJ et objets restent filtrés par la vue en direct.
 */
import {
  EditMapExploration,
  MapExplorationTrail,
  type Actor,
  type MapExploration,
  type MapExplorationUpdatedPayload,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import {
  applyWindow,
  decodeWindow,
  encodeMask,
  encodeWindow,
  explorationGrid,
  ExplorationMask,
  markView,
  packBits,
  playerView,
  unionRect,
  unpackBits,
  viewerView,
  windowFits,
  windowOf,
  type CellRect,
  type CellWindow,
  type ExplorationGrid,
  type Vec,
  type Viewer as VisionViewer,
} from '@vtt/vision';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { mapExplorations, maps, mapTokens } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { actorRole } from '../campaigns/repository.js';
import {
  loadMap,
  MapParams,
  type MapRow,
  notFound,
  requestContext,
  requireGm,
  requireWriter,
  sceneSettingsOf,
  type Viewer,
  viewerOf,
} from './common.js';
import { queueExploration } from './exploration-queue.js';
import { campaignPlayers, loadMapVision } from './vision.js';

type Conn = Db | Tx;
type Row = typeof mapExplorations.$inferSelect;

/** Seule portée pour l'instant : le groupe (docs/exploration.md § 8, D1). */
export const PARTY_SCOPE = 'party' as const;

/** Acteur des calculs du travailleur. */
export const SYSTEM_ACTOR: Actor = { userId: null, role: 'system', characterId: null };

export const actorOf = (v: Viewer): Actor => ({
  userId: v.userId,
  role: actorRole(v.access.role),
  characterId: null,
});

const maskOf = (row: Row) =>
  new ExplorationMask(row.cols, row.rows, unpackBits(row.cells, row.cols * row.rows));

export const explorationApi = (row: Row, mask: ExplorationMask = maskOf(row)): MapExploration => ({
  mapId: row.mapId,
  scope: row.scope,
  cols: row.cols,
  rows: row.rows,
  version: row.version,
  window: encodeMask(mask),
});

async function readRow(db: Conn, mapId: string): Promise<Row | null> {
  const [row] = await db
    .select()
    .from(mapExplorations)
    .where(and(eq(mapExplorations.mapId, mapId), eq(mapExplorations.scope, PARTY_SCOPE)));
  return row ?? null;
}

/** Ligne du masque, créée vide au besoin, verrouillée jusqu'à la fin de la transaction. */
async function lockRow(tx: Tx, map: MapRow, grid: ExplorationGrid): Promise<Row> {
  await tx
    .insert(mapExplorations)
    .values({
      mapId: map.id,
      scope: PARTY_SCOPE,
      campaignId: map.campaignId,
      cols: grid.cols,
      rows: grid.rows,
      cells: packBits(new Uint8Array(grid.cols * grid.rows)),
    })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(mapExplorations)
    .where(and(eq(mapExplorations.mapId, map.id), eq(mapExplorations.scope, PARTY_SCOPE)))
    .for('update');
  return row!;
}

/** Masque de la scène pour qui la regarde (null : exploration coupée, ou rien encore). */
export async function explorationFor(db: Conn, map: MapRow): Promise<MapExploration | null> {
  if (map.exploration === 'off') return null;
  const row = await readRow(db, map.id);
  return row ? explorationApi(row) : null;
}

// ─── Événement ───────────────────────────────────────────────────────────────

/**
 * Audience de la carte : tous si elle est visible des joueurs ; sinon les MJ et les joueurs qui
 * y ont un personnage présent (ceux qui peuvent l'ouvrir).
 */
async function audienceOf(
  tx: Tx,
  map: MapRow,
): Promise<{ visibility: 'public' } | { visibility: 'gm_only'; users: string[] }> {
  if (map.visibleToPlayers) return { visibility: 'public' };
  const present = await tx
    .select({ characterId: mapTokens.characterId })
    .from(mapTokens)
    .where(and(eq(mapTokens.mapId, map.id), eq(mapTokens.present, true)));
  const here = new Set(present.map((t) => t.characterId));
  const members = await campaignPlayers(tx, map.campaignId);
  const users = members.filter((m) => m.characterIds.some((c) => here.has(c))).map((m) => m.userId);
  return { visibility: 'gm_only', users };
}

/** Enregistre le masque (version + 1) et publie le rectangle changé. */
async function saveMask(
  tx: Tx,
  ctx: EventContext,
  actor: Actor,
  map: MapRow,
  mask: ExplorationMask,
  changed: CellRect,
): Promise<Row> {
  const [saved] = await tx
    .update(mapExplorations)
    .set({
      cols: mask.cols,
      rows: mask.rows,
      cells: packBits(mask.cells),
      version: sql`${mapExplorations.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(mapExplorations.mapId, map.id), eq(mapExplorations.scope, PARTY_SCOPE)))
    .returning();
  const payload: MapExplorationUpdatedPayload = {
    mapId: map.id,
    scope: PARTY_SCOPE,
    version: saved!.version,
    cols: mask.cols,
    rows: mask.rows,
    window: encodeWindow(windowOf(mask, changed)),
  };
  const target = await audienceOf(tx, map);
  await appendEvent(tx, ctx, {
    type: 'map.exploration_updated',
    campaignId: map.campaignId,
    actor,
    aggregate: { type: 'map', id: map.id },
    payload:
      target.visibility === 'public' ? payload : { ...payload, visibleToUsers: target.users },
    visibility: target.visibility,
  });
  return saved!;
}

// ─── Exploration ─────────────────────────────────────────────────────────────

/** Points d'une traînée : le token, et les positions de son chemin. */
export interface TrailSample {
  readonly tokenId: string;
  readonly points: readonly Vec[];
}

/** Cases à 1 dans `after` et à 0 dans `before`, sur le rectangle. */
function addedCells(before: ExplorationMask, after: ExplorationMask, rect: CellRect): CellWindow {
  const win = windowOf(after, rect);
  const old = windowOf(before, rect);
  for (let i = 0; i < win.cells.length; i++) if (old.cells[i]) win.cells[i] = 0;
  return win;
}

/**
 * Explore la scène : la vue actuelle des observateurs du groupe, plus les points des traînées
 * (seulement pour les tokens qui sont des observateurs du groupe, avec leur rayon actuel).
 * Renvoie la version du masque (null : exploration coupée, carte sans taille ou sans masque).
 */
export async function exploreMap(
  db: Db,
  ref: { id: string; campaignId: string },
  ctx: EventContext,
  actor: Actor,
  trails: readonly TrailSample[] = [],
): Promise<number | null> {
  const [map] = await db
    .select()
    .from(maps)
    .where(and(eq(maps.id, ref.id), eq(maps.campaignId, ref.campaignId)));
  if (!map || map.exploration === 'off' || !map.width || !map.height) return null;
  const vision = await loadMapVision(db, map.id, map.campaignId);
  if (!vision) return null;
  const observers = new Map<string, VisionViewer>();
  for (const m of await campaignPlayers(db, map.campaignId))
    for (const o of vision.forMember(m).observers) observers.set(o.id, o);
  const existing = await readRow(db, map.id);
  const grid = existing ?? explorationGrid(map.width, map.height, vision.opts.pixelsPerUnit);
  const before = existing ? maskOf(existing) : ExplorationMask.empty(grid);
  const mask = before.clone();
  const prep = vision.opts.prep;
  let rect = observers.size
    ? markView(mask, prep, playerView(prep, [...observers.values()]))
    : null;
  for (const trail of trails) {
    const o = observers.get(trail.tokenId);
    if (!o) continue;
    for (const pos of trail.points)
      rect = unionRect(
        rect,
        markView(mask, prep, viewerView(prep, { id: o.id, pos, visionRadius: o.visionRadius })),
      );
  }
  if (!rect) return existing?.version ?? null;
  const added = addedCells(before, mask, rect);
  return db.transaction(async (tx) => {
    // Sous verrou : la scène a pu changer de mode, et le masque d'état
    const [current] = await tx.select().from(maps).where(eq(maps.id, map.id)).for('share');
    if (!current || current.exploration === 'off') return null;
    const locked = await lockRow(tx, current, grid);
    // Réinitialisé entre-temps avec une autre grille : la réinitialisation a remis la scène en
    // file, le prochain passage repart de là
    if (locked.cols !== grid.cols || locked.rows !== grid.rows) return locked.version;
    const target = maskOf(locked);
    const changed = applyWindow(target, added, 'reveal');
    if (!changed) return locked.version;
    return (await saveMask(tx, ctx, actor, current, target, changed)).version;
  });
}

// ─── Gestes du MJ ────────────────────────────────────────────────────────────

const invalidWindow = () =>
  new HttpError(422, 'Refusé', 'invalid_exploration_window', 'Fenêtre d’exploration invalide');

/** Révéler, oublier ou réinitialiser (MJ), dans la transaction de la route. */
export async function editExploration(
  tx: Tx,
  ctx: EventContext,
  v: Viewer,
  map: MapRow,
  body: EditMapExploration,
): Promise<MapExploration> {
  requireGm(v);
  if (map.exploration === 'off')
    throw HttpError.conflict('L’exploration est coupée sur cette scène', 'exploration_off');
  if (!map.width || !map.height)
    throw new HttpError(422, 'Refusé', 'map_without_size', 'La scène n’a pas encore de taille');
  const { pixelsPerUnit } = await sceneSettingsOf(tx, map);
  const fresh = explorationGrid(map.width, map.height, pixelsPerUnit);
  const row = await lockRow(tx, map, fresh);
  const actor = actorOf(v);
  if (body.op === 'reset') {
    const mask = ExplorationMask.empty(fresh);
    const saved = await saveMask(tx, ctx, actor, map, mask, {
      x: 0,
      y: 0,
      w: mask.cols,
      h: mask.rows,
    });
    // Ce que le groupe voit en ce moment est exploré de nouveau, tout de suite
    await queueExploration(tx, map);
    return explorationApi(saved, mask);
  }
  if (body.cols !== row.cols || body.rows !== row.rows)
    throw HttpError.conflict(
      'La grille d’exploration a changé : rechargez la scène',
      'exploration_grid_changed',
    );
  let win: CellWindow;
  try {
    win = decodeWindow(body.window);
  } catch {
    throw invalidWindow();
  }
  if (!windowFits(row, win)) throw invalidWindow();
  const mask = maskOf(row);
  const changed = applyWindow(mask, win, body.op);
  if (!changed) return explorationApi(row, mask);
  return explorationApi(await saveMask(tx, ctx, actor, map, mask, changed), mask);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export const registerExploration: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };
  const base = '/v1/campaigns/:id/maps/:mapId/exploration';

  r.get(base, { ...auth, schema: { params: MapParams } }, async (req) => {
    const { userId } = requestContext(req);
    const v = await viewerOf(db, req.params.id, userId);
    const map = await loadMap(db, v, req.params.mapId);
    return { exploration: await explorationFor(db, map) };
  });

  r.post(
    base,
    { ...auth, schema: { params: MapParams, body: EditMapExploration } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const exploration = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const map = await loadMap(tx, v, req.params.mapId, true);
        return editExploration(tx, ctx, v, map, req.body);
      });
      return { exploration };
    },
  );

  r.post(
    `${base}/trail`,
    { ...auth, schema: { params: MapParams, body: MapExplorationTrail } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      requireWriter(v);
      const map = await loadMap(db, v, req.params.mapId);
      if (map.exploration === 'off') return { version: null };
      const ids = [...new Set(req.body.trails.map((t) => t.tokenId))];
      const tokens = await db
        .select({ id: mapTokens.id, characterId: mapTokens.characterId })
        .from(mapTokens)
        .where(
          and(eq(mapTokens.mapId, map.id), eq(mapTokens.present, true), inArray(mapTokens.id, ids)),
        );
      if (tokens.length !== ids.length) throw notFound('Token');
      // Même droit que le déplacement : un joueur pour ses personnages, le MJ pour tous
      if (!v.isGm && tokens.some((t) => !v.characterIds.includes(t.characterId)))
        throw HttpError.forbidden('Seulement les tokens de vos personnages');
      const version = await exploreMap(db, map, ctx, actorOf(v), req.body.trails);
      return { version };
    },
  );
};
