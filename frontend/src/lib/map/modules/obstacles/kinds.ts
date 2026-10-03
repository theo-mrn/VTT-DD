/**
 * Sortes `obstacle` (murs, portes, fenêtres, sens unique) et `room` (pièces) (docs/carte.md
 * § 9, § 10).
 *
 * - Réservées à l'outil obstacles (`editTool`, W) : hors de lui, un mur ne se touche pas (un
 *   token posé contre lui garde son clic).
 * - Porte : son icône se touche toujours. Joueur : un clic ouvre ou ferme (`click`), sauf une
 *   porte verrouillée (règle du serveur, rappelée par un toast). MJ : un clic la sélectionne et
 *   ouvre son panneau (Ouvrir, Verrouiller…), jamais d'ouverture par mégarde.
 * - Plans : murs et pièces dans `gm` (MJ seulement), portes dans `adornments` (icône vue de
 *   tous).
 */
import {
  ArrowLeftRight,
  BrickWall,
  DoorClosed,
  DoorOpen,
  Lock,
  LockOpen,
  Repeat,
  Scan,
  Waypoints,
} from 'lucide-react';
import type { MapEntity } from '../../engine/entities/entity';
import {
  isGm,
  type EntityAction,
  type EntityKind,
  type MapViewer,
  type MenuItem,
} from '../../engine/entities/entity-kind';
import {
  distance,
  distanceToPolyline,
  type EntityGeometry,
  type Point,
  type Rect,
} from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import type { MapDto } from '../../store/map-store';
import { executePlan, patchObstacles, type ObstaclePersistences } from './commands';
import {
  addChain,
  convertedProps,
  convertSegment,
  EditPlan,
  loopOf,
  replaceByWall,
  weldRoomToWalls,
} from './edits';
import { bbox, centroid, pointKey, type Pts } from './geometry';
import {
  defaultProps,
  nextRoomName,
  OBSTACLE_KIND,
  OBSTACLE_LABELS,
  OBSTACLES,
  OBSTACLES_TOOL_ID,
  ROOM_KIND,
  ROOMS,
  type ObstacleData,
  type ObstacleKindId,
  type RoomData,
} from './model';
import { DOOR_ICON_PX, doorCenter, type ObstacleView } from './view';

/** Ce que partagent les sortes, l'outil et les menus du module. */
export interface ObstacleContext {
  engine: MapEngine;
  view: ObstacleView;
  persistences: ObstaclePersistences;
}

const obstacleOf = (e: MapEntity) => e.data as ObstacleData;
const roomOf = (e: MapEntity) => e.data as RoomData;

/** Un plan de travail sur l'état actuel du magasin. */
export function newPlan(engine: MapEngine): EditPlan {
  const s = engine.store.getState();
  return new EditPlan(
    (s.collections[OBSTACLES] ?? new Map()) as ReadonlyMap<string, ObstacleData>,
    (s.collections[ROOMS] ?? new Map()) as ReadonlyMap<string, RoomData>,
    s.mapId,
  );
}

/** Droits : le MJ fait tout ; les autres ne font que voir (la porte passe par `click`). */
const gmOnlyStrict = (action: EntityAction, _e: MapEntity, viewer: MapViewer) =>
  action === 'view' || isGm(viewer);

/** Droits, et le déplacement seulement dans l'outil W (curseur juste sur une icône de porte). */
const obstacleRights =
  (engine: MapEngine) => (action: EntityAction, e: MapEntity, viewer: MapViewer) =>
    action === 'move'
      ? isGm(viewer) && engine.tools.getActiveId() === OBSTACLES_TOOL_ID
      : gmOnlyStrict(action, e, viewer);

function boxGeometry(pts: Pts): EntityGeometry {
  if (!pts.length) return { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
  const [minX, minY, maxX, maxY] = bbox(pts);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
    rotation: 0,
  };
}

const shifted = (pts: Pts, dx: number, dy: number): Point[] =>
  pts.map((p) => ({
    x: Math.round((p.x + dx) * 100) / 100,
    y: Math.round((p.y + dy) * 100) / 100,
  }));

/** Boîtes gardées par donnée (l'index spatial, le culling et le redessin les lisent souvent). */
const boundsCache = new WeakMap<object, Rect>();

// ─── Portes ──────────────────────────────────────────────────────────────────

/** Écart des échantillons de part et d'autre d'une porte (pixels du monde). */
export const DOOR_SAMPLE_OFFSET = 2;

const doorSamplesCache = new WeakMap<object, Float64Array>();

/**
 * Points où la vision cherche une porte pour un joueur (docs/carte.md § 9) : son milieu, et
 * juste devant et derrière lui. Fermée, la porte borde la vue : le milieu lui-même est sur la
 * limite, un point de son côté est vu.
 */
export function doorSamples(pts: Pts): Float64Array {
  const a = pts[0]!;
  const b = pts.at(-1)!;
  const m = doorCenter(pts);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len === 0) return Float64Array.of(m.x, m.y);
  const nx = (-(b.y - a.y) / len) * DOOR_SAMPLE_OFFSET;
  const ny = ((b.x - a.x) / len) * DOOR_SAMPLE_OFFSET;
  return Float64Array.of(m.x, m.y, m.x + nx, m.y + ny, m.x - nx, m.y - ny);
}

/** L'icône de la porte est sous ce point (rayon à taille constante). */
export function doorIconHit(engine: MapEngine, pts: Pts, p: Point): boolean {
  return distance(doorCenter(pts), p) <= (DOOR_ICON_PX + 2) / engine.camera.zoom;
}

/**
 * Ouvre ou ferme des portes. Joueur : une porte verrouillée refuse (toast) ; spectateur : rien.
 * Hors de la pile d'annulation.
 */
export function toggleDoors(ctx: ObstacleContext, entities: readonly MapEntity[], open?: boolean) {
  const { engine } = ctx;
  if (engine.viewer.role === 'spectator') return false;
  const doors = entities.filter((e) => obstacleOf(e).kind === 'door');
  if (!doors.length) return false;
  const gm = isGm(engine.viewer);
  const allowed = gm ? doors : doors.filter((e) => !obstacleOf(e).isLocked);
  if (!allowed.length) {
    engine.notify('Cette porte est verrouillée.');
    return true;
  }
  const target = open ?? !allowed.every((e) => obstacleOf(e).isOpen);
  void patchObstacles(
    engine,
    allowed,
    () => ({ isOpen: target }),
    target ? 'Ouvrir la porte' : 'Fermer la porte',
    ctx.persistences.obstacles,
    { undoable: false },
  );
  return true;
}

// ─── Sorte « obstacle » ──────────────────────────────────────────────────────

export function obstacleKind(ctx: ObstacleContext): EntityKind<MapDto> {
  const { engine, view } = ctx;
  return {
    id: OBSTACLE_KIND,
    label: 'Obstacle',
    collection: OBSTACLES,
    capabilities: ['select', 'move', 'delete', 'inspect', 'duplicate'],
    plane: (o) => ((o as ObstacleData).kind === 'door' ? 'adornments' : 'gm'),
    display: 'obstacles',
    editTool: OBSTACLES_TOOL_ID,
    // Outil sélection : un clic sur un mur (rien d'autre dessous) le sélectionne, Suppr l'efface
    pickOutsideTool: true,
    selfOutline: true,
    transformDisplay: false,
    geometry: (o) => boxGeometry((o as ObstacleData).points),
    applyGeometry(o, g) {
      const d = o as ObstacleData;
      const before = boxGeometry(d.points);
      return { ...d, points: shifted(d.points, g.x - before.x, g.y - before.y) };
    },
    name: (o) => {
      const d = o as ObstacleData;
      if (d.kind !== 'door') return OBSTACLE_LABELS[d.kind];
      if (d.isLocked) return 'Porte verrouillée';
      return d.isOpen ? 'Porte ouverte' : 'Porte fermée';
    },
    can: obstacleRights(engine),
    hitTest(e, p, tol) {
      const pts = view.pointsOf(e);
      if (obstacleOf(e).kind === 'door' && doorIconHit(engine, pts, p)) return true;
      // Le tracé des murs n'est dessiné (et touchable) que pour le MJ
      if (!isGm(engine.viewer)) return false;
      return distanceToPolyline(p, pts) <= tol + 3 / engine.camera.zoom;
    },
    bounds(e) {
      const preview = view.hasPreview(e.id);
      const cached = preview ? undefined : boundsCache.get(e.data);
      if (cached) return cached;
      const [minX, minY, maxX, maxY] = bbox(view.pointsOf(e));
      // Porte : l'icône déborde (taille constante ; marge pour un zoom arrière moyen)
      const pad = obstacleOf(e).kind === 'door' ? 40 : 4;
      const r = {
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + 2 * pad,
        height: maxY - minY + 2 * pad,
      };
      if (!preview) boundsCache.set(e.data, r);
      return r;
    },
    render: (e) => view.mount(e),
    update: (e) => view.draw(e),
    dispose: (e) => view.unmount(e),
    // Joueur seulement : le MJ passe par le panneau de la porte
    click: (e) => obstacleOf(e).kind === 'door' && !isGm(engine.viewer) && toggleDoors(ctx, [e]),
    // Icône de porte : un joueur ne la voit (et ne l'ouvre) que si la porte est dans sa vue
    visionSamples(e) {
      const d = obstacleOf(e);
      if (d.kind !== 'door' || d.points.length < 2) return null;
      let samples = doorSamplesCache.get(e.data);
      if (!samples) {
        samples = doorSamples(d.points);
        doorSamplesCache.set(e.data, samples);
      }
      return samples;
    },
    actions: (entities) => obstacleActions(ctx, entities),
    duplicate: (o, offset) => {
      const d = o as ObstacleData;
      return { ...d, points: shifted(d.points, offset.x, offset.y) };
    },
    // Les murs ne partent jamais dans le direct
    liveAudience: () => 'gm',
    persistence: ctx.persistences.obstacles as never,
  };
}

/**
 * Segment d'un mur de plusieurs segments touché au dernier appui sur la carte (clic, clic droit),
 * à 12 px d'écran près ; null : un seul segment, ou appui ailleurs.
 */
function pressedSegment(ctx: ObstacleContext, e: MapEntity): number | null {
  const press = ctx.engine.lastPress?.world;
  if (!press || e.kind.id !== OBSTACLE_KIND) return null;
  const pts = ctx.view.pointsOf(e);
  if (pts.length < 3) return null;
  const tol = 12 / ctx.engine.camera.zoom;
  let best: number | null = null;
  let bestD = tol;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((press.x - a.x) * dx + (press.y - a.y) * dy) / len2));
    const d = Math.hypot(a.x + dx * t - press.x, a.y + dy * t - press.y);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Entrées du menu des obstacles (MJ : portes, sens, conversion, pièce ; joueur : porte). */
export function obstacleActions(ctx: ObstacleContext, entities: readonly MapEntity[]): MenuItem[] {
  const { engine } = ctx;
  const items: MenuItem[] = [];
  const data = entities.map(obstacleOf);
  const doors = entities.filter((e) => obstacleOf(e).kind === 'door');
  const gm = isGm(engine.viewer);

  if (doors.length === entities.length && engine.viewer.role !== 'spectator') {
    const allOpen = doors.every((e) => obstacleOf(e).isOpen);
    const lockedForMe = !gm && doors.every((e) => obstacleOf(e).isLocked);
    items.push({
      id: 'door:toggle',
      label: allOpen ? 'Fermer la porte' : 'Ouvrir la porte',
      icon: allOpen ? DoorClosed : DoorOpen,
      // MJ : l'action principale de son panneau ; joueur : le clic sur la porte
      ...(gm ? { primary: true } : { shortcut: 'Clic' }),
      disabled: lockedForMe,
      run: () => void toggleDoors(ctx, doors, !allOpen),
    });
    if (gm) {
      const allLocked = doors.every((e) => obstacleOf(e).isLocked);
      items.push({
        id: 'door:lock',
        label: allLocked ? 'Déverrouiller la porte' : 'Verrouiller la porte',
        icon: allLocked ? LockOpen : Lock,
        run: () =>
          void patchObstacles(
            engine,
            doors,
            () => ({ isLocked: !allLocked }),
            allLocked ? 'Déverrouiller la porte' : 'Verrouiller la porte',
            ctx.persistences.obstacles,
          ),
      });
    }
  }
  if (!gm) return items;

  if (data.every((o) => o.kind === 'one_way_wall'))
    items.push({
      id: 'oneway:flip',
      label: 'Inverser le sens',
      icon: ArrowLeftRight,
      run: () =>
        void patchObstacles(
          engine,
          entities,
          (o) => ({ blocksFrom: (o.blocksFrom ?? 'left') === 'left' ? 'right' : 'left' }),
          'Inverser le sens',
          ctx.persistences.obstacles,
        ),
    });

  const kinds: ObstacleKindId[] = ['wall', 'door', 'window', 'one_way_wall'];
  const same = data.every((o) => o.kind === data[0]!.kind) ? data[0]!.kind : null;
  // Un mur de plusieurs segments : la conversion ne vise que le segment touché (dernier appui)
  const segment = entities.length === 1 ? pressedSegment(ctx, entities[0]!) : null;
  items.push({
    id: 'obstacle:convert',
    label: segment === null ? 'Convertir en' : 'Convertir le segment en',
    icon: Repeat,
    children: kinds.map((k) => ({
      id: `obstacle:convert:${k}`,
      label: OBSTACLE_LABELS[k],
      checked: same === k,
      run: () => {
        const label = `Convertir en ${OBSTACLE_LABELS[k].toLowerCase()}`;
        if (segment === null) {
          void patchObstacles(
            engine,
            entities,
            (o) => convertedProps(o, k),
            label,
            ctx.persistences.obstacles,
          );
          return;
        }
        const plan = newPlan(engine);
        const converted = convertSegment(plan, entities[0]!.id, segment, k);
        void executePlan(engine, label, plan, ctx.persistences);
        engine.selection.replace([converted]);
      },
    })),
  });

  if (entities.length === 1 && data[0]!.kind !== 'wall')
    items.push({
      id: 'obstacle:to-wall',
      label: 'Remplacer par un mur',
      icon: BrickWall,
      run: () => {
        const plan = newPlan(engine);
        const kept = replaceByWall(plan, entities[0]!.id);
        void executePlan(engine, 'Remplacer par un mur', plan, ctx.persistences);
        engine.selection.replace([kept]);
      },
    });

  items.push({
    id: 'obstacle:connected',
    label: 'Sélectionner les murs reliés',
    icon: Waypoints,
    run: () =>
      engine.selection.replace(
        connectedObstacles(
          engine,
          entities.map((e) => e.id),
        ),
      ),
  });

  const loop = loopOf(data);
  if (loop)
    items.push({
      id: 'obstacle:room',
      label: 'Créer une pièce',
      icon: Scan,
      run: () => {
        const plan = newPlan(engine);
        const room = plan.createRoom(nextRoomName(plan.rooms()), loop);
        weldRoomToWalls(plan, room.id);
        void executePlan(engine, 'Créer une pièce', plan, ctx.persistences);
      },
    });
  return items;
}

/** Murs reliés (par des sommets soudés) à ces murs, eux compris. */
export function connectedObstacles(engine: MapEngine, ids: readonly string[]): string[] {
  const all = [...engine.entitiesOfKind(OBSTACLE_KIND)].map((e) => obstacleOf(e));
  const byVertex = new Map<string, string[]>();
  for (const o of all)
    for (const p of o.points) {
      const k = pointKey(p);
      const list = byVertex.get(k) ?? [];
      if (!list.includes(o.id)) list.push(o.id);
      byVertex.set(k, list);
    }
  const byId = new Map(all.map((o) => [o.id, o]));
  const seen = new Set<string>(ids);
  const queue = [...ids];
  while (queue.length) {
    const o = byId.get(queue.pop()!);
    if (!o) continue;
    for (const p of o.points)
      for (const next of byVertex.get(pointKey(p)) ?? [])
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
  }
  return [...seen];
}

// ─── Sorte « room » ──────────────────────────────────────────────────────────

/** Le nom de la pièce (au centre, taille constante) est sous ce point. */
export function roomLabelHit(engine: MapEngine, pts: Pts, p: Point): boolean {
  if (pts.length < 3) return false;
  const c = centroid(pts);
  const z = engine.camera.zoom;
  return Math.abs(p.x - c.x) * z <= 40 && Math.abs(p.y - c.y) * z <= 12;
}

export function roomKind(ctx: ObstacleContext): EntityKind<MapDto> {
  const { engine, view } = ctx;
  return {
    id: ROOM_KIND,
    label: 'Pièce',
    collection: ROOMS,
    capabilities: ['select', 'move', 'delete', 'inspect', 'duplicate'],
    plane: 'gm',
    display: 'obstacles',
    editTool: OBSTACLES_TOOL_ID,
    pickOutsideTool: true,
    selfOutline: true,
    transformDisplay: false,
    geometry: (r) => boxGeometry((r as RoomData).points),
    applyGeometry(r, g) {
      const d = r as RoomData;
      const before = boxGeometry(d.points);
      return { ...d, points: shifted(d.points, g.x - before.x, g.y - before.y) };
    },
    name: (r) => (r as RoomData).name?.trim() || 'Pièce',
    can: obstacleRights(engine),
    hitTest(e, p, tol) {
      const pts = view.pointsOf(e);
      if (roomLabelHit(engine, pts, p)) return true;
      if (distanceToPolyline(p, pts, true) > tol) return false;
      // Sur un contour partagé avec un mur, le mur l'emporte
      return !engine.hitTest(p, { filter: (x) => x.kind.id === OBSTACLE_KIND });
    },
    bounds(e) {
      const preview = view.hasPreview(e.id);
      const cached = preview ? undefined : boundsCache.get(e.data);
      if (cached) return cached;
      const [minX, minY, maxX, maxY] = bbox(view.pointsOf(e));
      const r = { x: minX - 4, y: minY - 4, width: maxX - minX + 8, height: maxY - minY + 8 };
      if (!preview) boundsCache.set(e.data, r);
      return r;
    },
    render: (e) => view.mount(e),
    update: (e) => view.draw(e),
    dispose: (e) => view.unmount(e),
    actions: (entities) =>
      isGm(engine.viewer)
        ? [
            {
              id: 'room:walls',
              label: 'Poser les murs du contour',
              icon: BrickWall,
              run: () => {
                const plan = newPlan(engine);
                for (const e of entities) {
                  const pts = roomOf(e).points;
                  if (pts.length >= 3) addChain(plan, [...pts, pts[0]!], defaultProps('wall'));
                }
                void executePlan(engine, 'Poser les murs', plan, ctx.persistences);
              },
            },
          ]
        : [],
    duplicate: (r, offset) => {
      const d = r as RoomData;
      return { ...d, points: shifted(d.points, offset.x, offset.y) };
    },
    liveAudience: () => 'gm',
    persistence: ctx.persistences.rooms as never,
  };
}
