/**
 * Outil obstacles (W) (docs/carte.md § 10) : une machine à états, testée sans rendu.
 *
 * Sous-modes (barre contextuelle, chiffres 1 à 7) : Mur, Rectangle de murs, Porte, Fenêtre,
 * Sens unique, Pièce, Édition.
 *
 * | État       | Entrée                                               | Sortie                                         |
 * | ---------- | ---------------------------------------------------- | ---------------------------------------------- |
 * | `idle`     | survol : aimant, porte visée, sommet sous le pointeur | clic : premier point → `chain`                 |
 * |            | bouton (rectangle, pièce, édition) → `pressing`      |                                                |
 * | `chain`    | clic : point suivant (glisser : un segment)          | double clic, Entrée, premier point : pose      |
 * |            | Retour arrière : retire le dernier point             | Échap : pose les segments déjà posés           |
 * | `pressing` | +4 px : `rect`, `vertex`, `move` ou `lasso`          | lâcher : clic (point, porte, sélection)        |
 * | `rect`     | rectangle aimanté (⇧ : carré)                        | lâcher : une commande ; Échap : rien           |
 * | `vertex`   | sommets soudés ensemble (Alt : détaché)              | lâcher : une commande ; Échap : rien           |
 * | `move`     | murs entiers ; les voisins soudés s'étirent (Alt : non) | lâcher : une commande ; Échap : rien        |
 * | `lasso`    | rectangle de sélection (⇧ : ajoute)                  | lâcher : sélection                             |
 *
 * Aimantation : sommets existants (10 px d'écran), point sur un segment (le mur est scindé :
 * jonction soudée), grille (Alt : sans grille) ; ⇧ aligne à 15° depuis le point précédent.
 * Chaque geste est **une** commande annulable (`/batch`).
 */
import type { BitmapText, Container, Graphics } from 'pixi.js';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '../../engine/entities/entity';
import type { RenderContext } from '../../engine/entities/entity-kind';
import {
  distance,
  inflateRect,
  rectFromPoints,
  type Point,
  type Rect,
} from '../../engine/geometry';
import { DRAG_THRESHOLD_PX, exceedsThreshold } from '../../engine/interaction/drag';
import { constrainAngle } from '../../engine/interaction/snapping';
import type { MapEngine } from '../../engine/map-engine';
import type { MapKey, MapPointer, Tool } from '../../engine/tools/tool';
import { executePlan } from './commands';
import {
  addChain,
  addDoorInWall,
  addRoom,
  addVertex,
  deleteSegment,
  deleteVertex,
  dropDuplicateSegments,
  moveOneVertex,
  moveVertices,
  rectanglePoints,
  translate,
  weldPoints,
  type EditPlan,
  type VertexRef,
} from './edits';
import {
  insertDoor,
  MIN_SEGMENT,
  pointKey,
  polygonSegments,
  polylineSegments,
  roundPoint,
  samePoint,
  segmentTouchesRect,
  type Pts,
} from './geometry';
import { newPlan, roomLabelHit, type ObstacleContext } from './kinds';
import {
  defaultProps,
  nextRoomName,
  OBSTACLE_KIND,
  OBSTACLES_TOOL_ID,
  ROOM_KIND,
  type ObstacleData,
  type ObstacleKindId,
  type RoomData,
} from './model';
import { ObstacleSnapper, SNAP_PX, type SnapTarget } from './snap';
import { dashedPolyline } from './overlay';

export type ObstacleMode = 'wall' | 'rect' | 'door' | 'window' | 'oneway' | 'room' | 'edit';

export interface ObstacleModeInfo {
  id: ObstacleMode;
  label: string;
  /** Chiffre du raccourci (quand l'outil est actif). */
  key: string;
  hint: string;
}

export const OBSTACLE_MODES: readonly ObstacleModeInfo[] = [
  {
    id: 'wall',
    label: 'Mur',
    key: '1',
    hint: 'Clic à clic. Double clic, Entrée ou premier point pour finir. ⇧ : 15°. Alt : sans grille.',
  },
  { id: 'rect', label: 'Rectangle de murs', key: '2', hint: 'Glisser : 4 murs soudés. ⇧ : carré.' },
  {
    id: 'door',
    label: 'Porte',
    key: '3',
    hint: 'Clic sur un mur : porte centrée, le mur est scindé. Ailleurs : deux clics.',
  },
  { id: 'window', label: 'Fenêtre', key: '4', hint: 'Comme un mur ; la vue passe à travers.' },
  {
    id: 'oneway',
    label: 'Sens unique',
    key: '5',
    hint: 'Comme un mur. La flèche montre le sens où l’on voit (menu : Inverser le sens).',
  },
  { id: 'room', label: 'Pièce', key: '6', hint: 'Glisser : rectangle. Clic à clic : polygone.' },
  {
    id: 'edit',
    label: 'Édition',
    key: '7',
    hint: 'Glisser un sommet (Alt : le détacher). Double clic : ajouter un sommet. Suppr : supprimer.',
  },
];

const CHAIN_KIND: Partial<Record<ObstacleMode, ObstacleKindId>> = {
  wall: 'wall',
  window: 'window',
  oneway: 'one_way_wall',
  door: 'door',
};

const CHAIN_LABEL: Partial<Record<ObstacleMode, string>> = {
  wall: 'Poser des murs',
  window: 'Poser une fenêtre',
  oneway: 'Poser un mur à sens unique',
  door: 'Poser une porte',
};

export interface ObstacleSettings {
  mode: ObstacleMode;
  /** Largeur d'une porte posée dans un mur, en cases. */
  doorWidth: number;
  /** Pièce : poser aussi les murs du contour. */
  roomWalls: boolean;
}

export type ObstacleState = 'idle' | 'chain' | 'pressing' | 'rect' | 'vertex' | 'move' | 'lasso';

type PressTarget =
  | { type: 'point'; point: Point }
  | { type: 'door-insert'; hover: DoorHover }
  | { type: 'vertex'; point: Point }
  | { type: 'entity'; entity: MapEntity; segment: number | null }
  | { type: 'void' };

interface DoorHover {
  id: string;
  segment: number;
  at: Point;
  door: [Point, Point];
}

/** Sous-sélection de l'édition : un sommet ou un segment. */
export type SubSelection =
  { type: 'vertex'; ref: VertexRef; point: Point } | { type: 'segment'; id: string; index: number };

interface VertexDrag {
  origin: Point;
  key: string;
  /** Alt : seul ce sommet de cette entité bouge. */
  detach: VertexRef | null;
  affected: { collection: 'obstacles' | 'rooms'; id: string }[];
  target: SnapTarget;
}

interface MoveDrag {
  ids: { obstacles: Set<string>; rooms: Set<string> };
  anchor: Point;
  start: Point;
  stretch: boolean;
  skip: Set<string>;
  affected: { collection: 'obstacles' | 'rooms'; id: string }[];
  delta: Point;
  target: SnapTarget | null;
}

const isMine = (e: MapEntity) => e.kind.id === OBSTACLE_KIND || e.kind.id === ROOM_KIND;
const collectionOfEntity = (e: MapEntity) =>
  e.kind.id === ROOM_KIND ? ('rooms' as const) : ('obstacles' as const);

/** Longueur en cases, lisible (« 2,5 m »). */
export function formatLength(px: number, ppu: number, unit: string): string {
  const v = px / (ppu || 50);
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${unit}`;
}

export class ObstacleTool implements Tool {
  readonly id = OBSTACLES_TOOL_ID;
  state: ObstacleState = 'idle';
  readonly settings: StoreApi<ObstacleSettings> = createStore<ObstacleSettings>()(() => ({
    mode: 'wall',
    doorWidth: 1,
    roomWalls: true,
  }));
  readonly snapper = new ObstacleSnapper();

  /** Points posés de la chaîne en cours. */
  chain: Point[] = [];
  /** Aimant sous le pointeur (aperçu). */
  snap: SnapTarget | null = null;
  doorHover: DoorHover | null = null;
  rect: { a: Point; b: Point } | null = null;
  lasso: Rect | null = null;
  sub: SubSelection | null = null;
  hoverVertex: Point | null = null;

  private press: { pointer: MapPointer; target: PressTarget } | null = null;
  private chainPress: { start: MapPointer; moved: boolean } | null = null;
  private vertexDrag: VertexDrag | null = null;
  private moveDrag: MoveDrag | null = null;
  private engine: MapEngine | null = null;
  /** Une chaîne vient d'être posée par un clic : le second clic d'un double clic est ignoré. */
  private justFinished = false;

  constructor(private readonly ctx: ObstacleContext) {}

  get mode(): ObstacleMode {
    return this.settings.getState().mode;
  }

  setMode(mode: ObstacleMode) {
    if (mode === this.mode) return;
    const engine = this.engine ?? this.ctx.engine;
    // Le geste en cours s'arrête (une chaîne pose ses segments déjà posés)
    for (let i = 0; i < 3 && this.state !== 'idle'; i++) this.cancel(engine);
    this.settings.setState({ mode });
    this.sub = null;
    this.doorHover = null;
    this.snap = null;
    this.dirty = true;
    engine.invalidate();
    engine.refreshCursor();
  }

  targets(e: MapEntity): boolean {
    return isMine(e);
  }

  cursor(): string | null {
    if (this.mode !== 'edit') return 'crosshair';
    if (this.state === 'vertex' || this.state === 'move') return 'grabbing';
    if (this.state === 'lasso') return 'crosshair';
    if (this.hoverVertex) return 'move';
    return this.ctx.engine.hovered ? 'pointer' : 'default';
  }

  activate(engine: MapEngine) {
    this.engine = engine;
    // On ne garde sélectionnés que des murs et des pièces
    const keep = engine.selectedEntities().filter(isMine);
    if (keep.length !== engine.selection.size) engine.selection.replace(keep.map((e) => e.id));
    this.dirty = true;
    engine.invalidate();
  }

  deactivate(engine: MapEngine) {
    this.chain = [];
    this.press = null;
    this.chainPress = null;
    this.vertexDrag = null;
    this.moveDrag = null;
    this.rect = null;
    this.lasso = null;
    this.snap = null;
    this.doorHover = null;
    this.hoverVertex = null;
    this.sub = null;
    this.state = 'idle';
    this.ctx.view.setPreviews(null);
    const mine = engine.selectedEntities().filter(isMine);
    if (mine.length) engine.selection.remove(mine.map((e) => e.id));
    engine.setHovered(null);
    if (this.root) this.root.visible = false;
    engine.invalidate();
  }

  // ─── Aimant ────────────────────────────────────────────────────────────────

  private refresh(engine: MapEngine) {
    this.engine = engine;
    this.snapper.refresh(engine.store.getState());
  }

  private tolerance(engine: MapEngine, px = SNAP_PX) {
    return engine.camera.screenToWorldLength(px);
  }

  /** Point aimanté ; ⇧ : angle de 15° depuis `from` (seuls les sommets l'emportent). */
  private snapAt(engine: MapEngine, e: MapPointer, from: Point | null): SnapTarget {
    const tolerance = this.tolerance(engine);
    if (e.shift && from) {
      const constrained = constrainAngle(from, e.world, 15);
      const s = this.snapper.snap(constrained, { tolerance, grid: null, extraPoints: this.chain });
      if (s.kind === 'point') return s;
      return { point: roundPoint(constrained), kind: 'angle' };
    }
    return this.snapper.snap(e.world, {
      tolerance,
      grid: e.alt ? null : engine.grid(),
      extraPoints: this.chain,
    });
  }

  // ─── Pointeur ──────────────────────────────────────────────────────────────

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    this.justFinished = false;
    this.refresh(engine);
    this.dirty = true;
    const mode = this.mode;
    if (mode === 'edit') return this.editDown(e, engine);

    const chainMode = mode !== 'rect' && !(mode === 'room' && !this.chain.length);
    if (!chainMode) {
      const s = this.snapAt(engine, e, null);
      this.press = { pointer: e, target: { type: 'point', point: s.point } };
      this.state = 'pressing';
      return true;
    }
    if (mode === 'door' && !this.chain.length) {
      const hover = this.doorHoverAt(engine, e.world);
      if (hover) {
        this.press = { pointer: e, target: { type: 'door-insert', hover } };
        this.state = 'pressing';
        return true;
      }
    }
    const last = this.chain[this.chain.length - 1] ?? null;
    this.addChainPoint(engine, this.snapAt(engine, e, last).point);
    if (this.state === 'chain') this.chainPress = { start: e, moved: false };
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    this.refresh(engine);
    this.dirty = true;
    const last = this.chain[this.chain.length - 1] ?? null;
    switch (this.state) {
      case 'idle':
        if (e.buttons !== 0) break;
        if (this.mode === 'edit') this.editHover(e, engine);
        else {
          this.doorHover = this.mode === 'door' ? this.doorHoverAt(engine, e.world) : null;
          this.snap = this.doorHover ? null : this.snapAt(engine, e, null);
        }
        break;
      case 'chain':
        this.snap = this.snapAt(engine, e, last);
        if (
          this.chainPress &&
          e.buttons !== 0 &&
          exceedsThreshold(this.chainPress.start.screen, e.screen)
        )
          this.chainPress.moved = true;
        break;
      case 'pressing': {
        const press = this.press;
        if (!press || !exceedsThreshold(press.pointer.screen, e.screen, DRAG_THRESHOLD_PX)) break;
        this.startDrag(press, e, engine);
        break;
      }
      case 'rect': {
        if (!this.rect) break;
        const s = this.snapAt(engine, { ...e, shift: false }, null);
        this.snap = s;
        let b = s.point;
        if (e.shift) {
          const a = this.rect.a;
          const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          b = roundPoint({
            x: a.x + Math.sign(b.x - a.x || 1) * side,
            y: a.y + Math.sign(b.y - a.y || 1) * side,
          });
        }
        this.rect = { a: this.rect.a, b };
        break;
      }
      case 'vertex':
        this.updateVertexDrag(e, engine);
        break;
      case 'move':
        this.updateMoveDrag(e, engine);
        break;
      case 'lasso':
        if (this.press) this.lasso = rectFromPoints(this.press.pointer.world, e.world);
        break;
    }
    engine.invalidate();
    engine.refreshCursor();
  }

  up(e: MapPointer, engine: MapEngine) {
    this.refresh(engine);
    this.dirty = true;
    const state = this.state;
    const press = this.press;
    this.press = null;
    switch (state) {
      case 'chain': {
        const cp = this.chainPress;
        this.chainPress = null;
        // Glisser : le lâcher pose le point suivant (un segment)
        if (cp?.moved) {
          const last = this.chain[this.chain.length - 1] ?? null;
          this.addChainPoint(engine, this.snapAt(engine, e, last).point);
        }
        break;
      }
      case 'pressing':
        this.state = this.chain.length ? 'chain' : 'idle';
        if (press) this.click(press, engine);
        break;
      case 'rect':
        this.state = 'idle';
        this.commitRect(engine);
        break;
      case 'vertex':
        this.state = 'idle';
        this.commitVertexDrag(engine);
        break;
      case 'move':
        this.state = 'idle';
        this.commitMoveDrag(engine);
        break;
      case 'lasso': {
        this.state = 'idle';
        const rect = this.lasso;
        this.lasso = null;
        if (rect && press) this.selectInRect(engine, rect, press.pointer.shift);
        break;
      }
    }
    engine.invalidate();
    engine.refreshCursor();
  }

  doubleClick(e: MapPointer, engine: MapEngine): boolean {
    this.refresh(engine);
    this.dirty = true;
    if (this.mode === 'edit') return this.editDoubleClick(e, engine);
    // Boucle fermée au premier clic d'un double clic : le second ne commence pas de chaîne
    if (this.justFinished) {
      this.justFinished = false;
      return true;
    }
    if (this.state === 'chain' && this.chain.length) {
      // Le premier clic du double clic a déjà posé le point : on finit là
      this.chainPress = null;
      this.finishChain(engine);
      return true;
    }
    return false;
  }

  key(k: MapKey, engine: MapEngine): boolean {
    if (k.ctrl || k.meta) return false;
    const digit = /^(?:Digit|Numpad)([1-7])$/.exec(k.code);
    if (digit && !k.alt && !k.shift) {
      this.setMode(OBSTACLE_MODES[Number(digit[1]) - 1]!.id);
      return true;
    }
    if (k.alt) return false;
    if (k.key === 'Enter') {
      if (this.state === 'chain' && this.chain.length) {
        this.finishChain(engine);
        return true;
      }
      return false;
    }
    if (k.key === 'Backspace' || k.key === 'Delete') {
      if (this.state === 'chain') {
        this.chain.pop();
        if (!this.chain.length) this.state = 'idle';
        this.dirty = true;
        engine.invalidate();
        return true;
      }
      if (this.state === 'idle' && this.sub) {
        this.deleteSub(engine);
        return true;
      }
      return false;
    }
    if (
      this.mode === 'edit' &&
      this.state === 'idle' &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k.key)
    ) {
      const ids = this.selectedIds(engine);
      if (!ids.obstacles.size && !ids.rooms.size) return false;
      const step = (engine.grid()?.size ?? 50) * (k.shift ? 5 : 1);
      const dx = k.key === 'ArrowLeft' ? -step : k.key === 'ArrowRight' ? step : 0;
      const dy = k.key === 'ArrowUp' ? -step : k.key === 'ArrowDown' ? step : 0;
      const plan = newPlan(engine);
      translate(plan, ids, { x: dx, y: dy }, true);
      dropDuplicateSegments(plan, ids.obstacles);
      void this.execute(engine, 'Déplacer', plan);
      this.sub = null;
      return true;
    }
    return false;
  }

  /**
   * Échap : annule le geste en cours ; une chaîne pose ses segments déjà posés (seul le segment
   * en cours est abandonné) ; sinon la sous-sélection s'efface.
   */
  cancel(engine: MapEngine): boolean {
    this.dirty = true;
    engine.invalidate();
    switch (this.state) {
      case 'pressing':
        this.press = null;
        this.state = this.chain.length ? 'chain' : 'idle';
        return true;
      case 'rect':
        this.rect = null;
        this.press = null;
        this.state = 'idle';
        return true;
      case 'vertex':
      case 'move':
        this.vertexDrag = null;
        this.moveDrag = null;
        this.press = null;
        this.ctx.view.setPreviews(null);
        this.state = 'idle';
        return true;
      case 'lasso':
        this.lasso = null;
        this.press = null;
        this.state = 'idle';
        return true;
      case 'chain':
        this.chainPress = null;
        this.finishChain(engine);
        return true;
      case 'idle':
        if (this.sub) {
          this.sub = null;
          return true;
        }
        return false;
    }
  }

  // ─── Chaîne ────────────────────────────────────────────────────────────────

  private addChainPoint(engine: MapEngine, p: Point) {
    const mode = this.mode;
    if (!this.chain.length) {
      this.chain = [p];
      this.state = 'chain';
      return;
    }
    const last = this.chain[this.chain.length - 1]!;
    if (samePoint(p, last) || distance(p, last) < MIN_SEGMENT) return;
    const first = this.chain[0]!;
    if (samePoint(p, first) && this.chain.length >= 3) {
      // Clic sur le premier point : la boucle se ferme
      if (mode !== 'room') this.chain.push(first);
      this.finishChain(engine);
      return;
    }
    this.chain.push(p);
    if (mode === 'door' && this.chain.length === 2) this.finishChain(engine);
  }

  /** Pose la chaîne (murs, fenêtres, sens unique, porte libre) ou la pièce en polygone. */
  finishChain(engine: MapEngine) {
    const mode = this.mode;
    const points = this.chain;
    this.chain = [];
    this.chainPress = null;
    this.state = 'idle';
    this.justFinished = true;
    this.dirty = true;
    engine.invalidate();
    if (mode === 'room') {
      if (points.length < 3) return;
      const plan = newPlan(engine);
      const room = addRoom(
        plan,
        points,
        nextRoomName(plan.rooms()),
        this.settings.getState().roomWalls,
      );
      if (room) void this.execute(engine, 'Créer une pièce', plan);
      return;
    }
    const kind = CHAIN_KIND[mode];
    if (!kind || points.length < 2) return;
    const plan = newPlan(engine);
    // Tout existait déjà (doublons) : rien n'est écrit
    if (addChain(plan, points, defaultProps(kind)).length)
      void this.execute(engine, CHAIN_LABEL[mode]!, plan);
  }

  private execute(engine: MapEngine, label: string, plan: EditPlan) {
    return executePlan(engine, label, plan, this.ctx.persistences);
  }

  // ─── Porte dans un mur ─────────────────────────────────────────────────────

  /** Mur visé par le mode Porte (pas une porte), et la porte qui y serait posée. */
  private doorHoverAt(engine: MapEngine, world: Point): DoorHover | null {
    const hit = this.snapper.nearestSegment(world, this.tolerance(engine), (s) => {
      const o = engine.entity(s.id)?.data as ObstacleData | undefined;
      return !!o && o.kind !== 'door';
    });
    if (!hit) return null;
    const o = engine.entity(hit.id)?.data as ObstacleData | undefined;
    if (!o) return null;
    const width = this.settings.getState().doorWidth * engine.kindContext().pixelsPerUnit;
    const at = roundPoint(hit.point);
    const { door } = insertDoor(o.points, hit.index, at, width);
    if (distance(door[0], door[1]) < MIN_SEGMENT) return null;
    return { id: hit.id, segment: hit.index, at, door };
  }

  // ─── Rectangles ────────────────────────────────────────────────────────────

  private commitRect(engine: MapEngine) {
    const r = this.rect;
    this.rect = null;
    if (!r) return;
    const { a, b } = r;
    if (Math.abs(b.x - a.x) < MIN_SEGMENT || Math.abs(b.y - a.y) < MIN_SEGMENT) return;
    const plan = newPlan(engine);
    if (this.mode === 'room') {
      const pts = rectanglePoints(a, b).slice(0, 4);
      addRoom(plan, pts, nextRoomName(plan.rooms()), this.settings.getState().roomWalls);
      void this.execute(engine, 'Créer une pièce', plan);
    } else {
      addChain(plan, rectanglePoints(a, b), defaultProps('wall'));
      void this.execute(engine, 'Poser un rectangle de murs', plan);
    }
  }

  // ─── Clic et glisser ───────────────────────────────────────────────────────

  private startDrag(
    press: { pointer: MapPointer; target: PressTarget },
    e: MapPointer,
    engine: MapEngine,
  ) {
    const t = press.target;
    switch (t.type) {
      case 'point':
        this.state = 'rect';
        this.rect = { a: t.point, b: t.point };
        this.move(e, engine);
        return;
      case 'door-insert':
        // Un glisser depuis un mur en mode Porte : rien (on reste sur le clic)
        return;
      case 'vertex':
        this.startVertexDrag(t.point, e, engine);
        return;
      case 'entity':
        this.startMoveDrag(t.entity, e, engine);
        return;
      case 'void':
        this.state = 'lasso';
        this.lasso = rectFromPoints(press.pointer.world, e.world);
        return;
    }
  }

  private click(press: { pointer: MapPointer; target: PressTarget }, engine: MapEngine) {
    const t = press.target;
    const shift = press.pointer.shift;
    switch (t.type) {
      case 'point':
        // Pièce : un clic sans glisser commence un polygone
        if (this.mode === 'room') this.addChainPoint(engine, t.point);
        return;
      case 'door-insert': {
        const plan = newPlan(engine);
        const width = this.settings.getState().doorWidth * engine.kindContext().pixelsPerUnit;
        const door = addDoorInWall(plan, t.hover.id, t.hover.segment, t.hover.at, width);
        if (door) void this.execute(engine, 'Poser une porte', plan);
        this.doorHover = null;
        return;
      }
      case 'vertex': {
        const ref = this.preferredRef(engine, t.point);
        if (!ref) return;
        if (shift) engine.selection.add([ref.id]);
        else engine.selection.replace([ref.id]);
        this.sub = { type: 'vertex', ref, point: t.point };
        return;
      }
      case 'entity':
        if (shift) {
          engine.selection.toggle(t.entity.id);
          this.sub = null;
        } else {
          engine.selection.replace([t.entity.id]);
          this.sub =
            t.segment !== null ? { type: 'segment', id: t.entity.id, index: t.segment } : null;
        }
        return;
      case 'void':
        if (!shift) engine.selection.clear();
        this.sub = null;
        return;
    }
  }

  // ─── Édition ───────────────────────────────────────────────────────────────

  private editDown(e: MapPointer, engine: MapEngine): boolean {
    // Dans l'outil W, un clic édite : l'icône d'une porte la sélectionne (on l'ouvre par le
    // menu, l'inspecteur ou l'outil sélection)
    const vertex = this.vertexAt(engine, e.world);
    let target: PressTarget;
    if (vertex) target = { type: 'vertex', point: vertex };
    else {
      const hit = this.entityAt(engine, e.world);
      target = hit
        ? { type: 'entity', entity: hit, segment: this.segmentOf(hit, e.world) }
        : { type: 'void' };
    }
    this.press = { pointer: e, target };
    this.state = 'pressing';
    return true;
  }

  private editHover(e: MapPointer, engine: MapEngine) {
    const v = this.vertexAt(engine, e.world);
    this.hoverVertex = v;
    engine.setHovered(v ? null : (this.entityAt(engine, e.world)?.id ?? null), e);
  }

  private editDoubleClick(e: MapPointer, engine: MapEngine): boolean {
    if (this.vertexAt(engine, e.world)) return true;
    const hit = this.entityAt(engine, e.world);
    if (!hit) return false;
    const segment = this.segmentOf(hit, e.world);
    const onRoomName =
      hit.kind.id === ROOM_KIND && roomLabelHit(engine, this.ctx.view.pointsOf(hit), e.world);
    const isDoor = hit.kind.id === OBSTACLE_KIND && (hit.data as ObstacleData).kind === 'door';
    if (segment === null || onRoomName || isDoor) {
      engine.selection.replace([hit.id]);
      engine.openInspector([hit.id]);
      return true;
    }
    const pts = this.ctx.view.pointsOf(hit);
    const a = pts[segment]!;
    const b = pts[(segment + 1) % pts.length]!;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((e.world.x - a.x) * (b.x - a.x) + (e.world.y - a.y) * (b.y - a.y)) /
          (distance(a, b) ** 2 || 1),
      ),
    );
    const p = roundPoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    if (distance(p, a) < MIN_SEGMENT || distance(p, b) < MIN_SEGMENT) return true;
    const plan = newPlan(engine);
    const collection = collectionOfEntity(hit);
    addVertex(plan, collection, hit.id, segment, p);
    // Les murs superposés à ce segment (pièce sur un mur) gardent la soudure
    weldPoints(plan, [p], new Set([hit.id]));
    void this.execute(engine, 'Ajouter un sommet', plan);
    engine.selection.replace([hit.id]);
    this.sub = { type: 'vertex', ref: { collection, id: hit.id, index: segment + 1 }, point: p };
    return true;
  }

  /** Sommet sous le pointeur (8 px d'écran), le plus proche. */
  private vertexAt(engine: MapEngine, world: Point): Point | null {
    const tol = this.tolerance(engine, 8);
    let best: Point | null = null;
    let bestD = tol;
    for (const v of this.snapper.allVertices()) {
      if (Math.abs(v.x - world.x) > bestD || Math.abs(v.y - world.y) > bestD) continue;
      const d = distance(v, world);
      if (d <= bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  /** Mur sous le pointeur, sinon pièce. */
  private entityAt(engine: MapEngine, world: Point): MapEntity | null {
    return (
      engine.hitTest(world, { filter: (x) => x.kind.id === OBSTACLE_KIND }) ??
      engine.hitTest(world, { filter: (x) => x.kind.id === ROOM_KIND })
    );
  }

  /** Segment de l'entité le plus proche du point (null : trop loin, ou sur le nom d'une pièce). */
  private segmentOf(e: MapEntity, world: Point): number | null {
    const pts = this.ctx.view.pointsOf(e);
    const segs = e.kind.id === ROOM_KIND ? polygonSegments(pts) : polylineSegments(pts);
    const tol = this.tolerance(this.ctx.engine, 8);
    let best: number | null = null;
    let bestD = tol;
    segs.forEach(([a, b], i) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.y - a.y) * dy) / len2));
      const d = Math.hypot(a.x + dx * t - world.x, a.y + dy * t - world.y);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Entité à laquelle rattacher un sommet cliqué : la sélectionnée qui l'a, sinon un mur, sinon une pièce. */
  private preferredRef(engine: MapEngine, v: Point): VertexRef | null {
    const refs: VertexRef[] = [];
    for (const e of engine.entitiesOfKind(OBSTACLE_KIND)) {
      const i = (e.data as ObstacleData).points.findIndex((p) => samePoint(p, v));
      if (i >= 0) refs.push({ collection: 'obstacles', id: e.id, index: i });
    }
    for (const e of engine.entitiesOfKind(ROOM_KIND)) {
      const i = (e.data as RoomData).points.findIndex((p) => samePoint(p, v));
      if (i >= 0) refs.push({ collection: 'rooms', id: e.id, index: i });
    }
    return refs.find((r) => engine.selection.has(r.id)) ?? refs[0] ?? null;
  }

  private selectedIds(engine: MapEngine) {
    const obstacles = new Set<string>();
    const rooms = new Set<string>();
    for (const e of engine.selectedEntities()) {
      if (e.kind.id === OBSTACLE_KIND) obstacles.add(e.id);
      else if (e.kind.id === ROOM_KIND) rooms.add(e.id);
    }
    return { obstacles, rooms };
  }

  /** Entités qui ont un sommet à l'une de ces clés. */
  private entitiesWith(engine: MapEngine, keys: ReadonlySet<string>) {
    const out: { collection: 'obstacles' | 'rooms'; id: string }[] = [];
    for (const e of engine.entitiesOfKind(OBSTACLE_KIND))
      if ((e.data as ObstacleData).points.some((p) => keys.has(pointKey(p))))
        out.push({ collection: 'obstacles', id: e.id });
    for (const e of engine.entitiesOfKind(ROOM_KIND))
      if ((e.data as RoomData).points.some((p) => keys.has(pointKey(p))))
        out.push({ collection: 'rooms', id: e.id });
    return out;
  }

  // ── Glisser un sommet ──

  private startVertexDrag(v: Point, e: MapPointer, engine: MapEngine) {
    const key = pointKey(v);
    const detach = e.alt || this.press?.pointer.alt ? this.preferredRef(engine, v) : null;
    const affected = detach
      ? [{ collection: detach.collection, id: detach.id }]
      : this.entitiesWith(engine, new Set([key]));
    this.vertexDrag = {
      origin: v,
      key,
      detach,
      affected,
      target: { point: v, kind: 'none' },
    };
    this.state = 'vertex';
    this.hoverVertex = null;
    engine.setHovered(null);
    this.updateVertexDrag(e, engine);
  }

  private vertexPlan(engine: MapEngine, drag: VertexDrag): EditPlan {
    const plan = newPlan(engine);
    if (drag.detach) moveOneVertex(plan, drag.detach, drag.target.point);
    else moveVertices(plan, new Map([[drag.key, drag.target.point]]));
    return plan;
  }

  private updateVertexDrag(e: MapPointer, engine: MapEngine) {
    const drag = this.vertexDrag;
    if (!drag) return;
    const origin = drag.origin;
    const target = this.snapper.snap(e.world, {
      tolerance: this.tolerance(engine),
      grid: e.alt ? null : engine.grid(),
      skipVertices: new Set([drag.key]),
      skipSegment: (s) => samePoint(s.a, origin) || samePoint(s.b, origin),
    });
    drag.target = target;
    this.snap = target;
    const plan = this.vertexPlan(engine, drag);
    this.ctx.view.setPreviews(this.previewsOf(plan, drag.affected));
  }

  private commitVertexDrag(engine: MapEngine) {
    const drag = this.vertexDrag;
    this.vertexDrag = null;
    this.ctx.view.setPreviews(null);
    if (!drag || samePoint(drag.target.point, drag.origin)) return;
    const plan = this.vertexPlan(engine, drag);
    const moved = drag.affected.map((a) => a.id);
    if (drag.target.kind === 'segment') weldPoints(plan, [drag.target.point], new Set(moved));
    dropDuplicateSegments(plan, moved);
    void this.execute(engine, 'Déplacer un sommet', plan);
    if (this.sub?.type === 'vertex' && samePoint(this.sub.point, drag.origin))
      this.sub = { ...this.sub, point: drag.target.point };
  }

  // ── Déplacer des murs entiers ──

  private startMoveDrag(hit: MapEntity, e: MapPointer, engine: MapEngine) {
    const shift = this.press?.pointer.shift ?? false;
    if (!engine.selection.has(hit.id)) {
      if (shift) engine.selection.add([hit.id]);
      else engine.selection.replace([hit.id]);
    }
    const ids = this.selectedIds(engine);
    const keys = new Set<string>();
    for (const id of ids.obstacles)
      for (const p of (engine.entity(id)?.data as ObstacleData | undefined)?.points ?? [])
        keys.add(pointKey(p));
    for (const id of ids.rooms)
      for (const p of (engine.entity(id)?.data as RoomData | undefined)?.points ?? [])
        keys.add(pointKey(p));
    const start = this.press?.pointer.world ?? e.world;
    const pts = this.ctx.view.pointsOf(hit);
    let anchor = pts[0]!;
    for (const p of pts) if (distance(p, start) < distance(anchor, start)) anchor = p;
    const stretch = !(e.alt || this.press?.pointer.alt);
    const affected = stretch
      ? this.entitiesWith(engine, keys)
      : [
          ...[...ids.obstacles].map((id) => ({ collection: 'obstacles' as const, id })),
          ...[...ids.rooms].map((id) => ({ collection: 'rooms' as const, id })),
        ];
    this.moveDrag = {
      ids,
      anchor,
      start,
      stretch,
      skip: keys,
      affected,
      delta: { x: 0, y: 0 },
      target: null,
    };
    this.sub = null;
    this.state = 'move';
    engine.setHovered(null);
    this.updateMoveDrag(e, engine);
  }

  private updateMoveDrag(e: MapPointer, engine: MapEngine) {
    const drag = this.moveDrag;
    if (!drag) return;
    const raw = {
      x: drag.anchor.x + e.world.x - drag.start.x,
      y: drag.anchor.y + e.world.y - drag.start.y,
    };
    const moving = new Set(drag.affected.map((a) => a.id));
    const target = this.snapper.snap(raw, {
      tolerance: this.tolerance(engine),
      grid: e.alt ? null : engine.grid(),
      skipVertices: drag.skip,
      skipSegment: (s) =>
        moving.has(s.id) || drag.skip.has(pointKey(s.a)) || drag.skip.has(pointKey(s.b)),
    });
    drag.target = target;
    drag.delta = { x: target.point.x - drag.anchor.x, y: target.point.y - drag.anchor.y };
    this.snap = target;
    const plan = newPlan(engine);
    translate(plan, drag.ids, drag.delta, drag.stretch);
    this.ctx.view.setPreviews(this.previewsOf(plan, drag.affected));
  }

  private commitMoveDrag(engine: MapEngine) {
    const drag = this.moveDrag;
    this.moveDrag = null;
    this.ctx.view.setPreviews(null);
    if (!drag || (!drag.delta.x && !drag.delta.y)) return;
    const plan = newPlan(engine);
    translate(plan, drag.ids, drag.delta, drag.stretch);
    const moved = drag.affected.map((a) => a.id);
    if (drag.target?.kind === 'segment') weldPoints(plan, [drag.target.point], new Set(moved));
    dropDuplicateSegments(plan, moved);
    const n = drag.ids.obstacles.size + drag.ids.rooms.size;
    void this.execute(engine, n > 1 ? `Déplacer ${n} éléments` : 'Déplacer', plan);
  }

  private previewsOf(
    plan: EditPlan,
    affected: readonly { collection: 'obstacles' | 'rooms'; id: string }[],
  ): Map<string, Point[]> {
    const out = new Map<string, Point[]>();
    for (const a of affected) out.set(a.id, [...(plan.points(a.collection, a.id) ?? [])]);
    return out;
  }

  // ── Supprimer la sous-sélection ──

  private deleteSub(engine: MapEngine) {
    const sub = this.sub;
    this.sub = null;
    if (!sub) return;
    const plan = newPlan(engine);
    if (sub.type === 'vertex') {
      deleteVertex(plan, sub.ref);
      void this.execute(engine, 'Supprimer le sommet', plan);
    } else {
      deleteSegment(plan, sub.id, sub.index);
      void this.execute(engine, 'Supprimer le segment', plan);
    }
    this.dirty = true;
    engine.invalidate();
  }

  // ── Lasso ──

  private selectInRect(engine: MapEngine, rect: Rect, additive: boolean) {
    const ids = engine
      .entitiesInRect(rect)
      .filter(isMine)
      .filter((e) => {
        const pts = this.ctx.view.pointsOf(e);
        const segs = e.kind.id === ROOM_KIND ? polygonSegments(pts) : polylineSegments(pts);
        return segs.some(([a, b]) => segmentTouchesRect(a, b, rect));
      })
      .map((e) => e.id);
    if (additive) engine.selection.add(ids);
    else engine.selection.replace(ids);
    this.sub = null;
  }

  // ─── Aperçu (plan `tool`) ──────────────────────────────────────────────────

  private root: Container | null = null;
  private handles: Graphics | null = null;
  private overlay: Graphics | null = null;
  private label: BitmapText | null = null;
  /** L'aperçu dynamique est à redessiner. */
  private dirty = true;
  /** Ce que montrent les poignées dessinées (redessinées seulement si cela change). */
  private readonly drawn = {
    obstacles: null as unknown,
    rooms: null as unknown,
    zoom: 0,
    x: NaN,
    y: NaN,
    hover: null as Point | null,
    sub: null as SubSelection | null,
    vertexDrag: null as VertexDrag | null,
    moveDrag: null as MoveDrag | null,
  };

  renderPreview(layer: Container, rc: RenderContext) {
    const pixi = rc.pixi;
    if (!this.root) {
      this.root = new pixi.Container({ label: 'obstacles-tool' });
      this.handles = new pixi.Graphics();
      this.overlay = new pixi.Graphics();
      this.label = new pixi.BitmapText({
        text: '',
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          fill: rc.theme.foreground,
        },
      });
      this.label.anchor.set(0, 0);
      this.root.addChild(this.handles, this.overlay, this.label);
    }
    if (this.root.parent !== layer) layer.addChild(this.root);
    this.root.visible = true;
    this.snapper.refresh(this.ctx.engine.store.getState());
    this.drawHandles(rc);
    if (this.dirty || this.lastZoom !== rc.zoom) {
      this.dirty = false;
      this.lastZoom = rc.zoom;
      this.drawOverlay(rc);
    }
  }

  private lastZoom = 0;

  /** Poignées des sommets dans la vue : jonction soudée pleine, bout libre creux. */
  private drawHandles(rc: RenderContext) {
    const engine = this.ctx.engine;
    const cam = engine.camera;
    const s = engine.store.getState();
    const drag = this.vertexDrag;
    const d = this.drawn;
    if (
      d.obstacles === s.collections.obstacles &&
      d.rooms === s.collections.rooms &&
      d.zoom === cam.zoom &&
      d.x === cam.x &&
      d.y === cam.y &&
      d.hover === this.hoverVertex &&
      d.sub === this.sub &&
      d.vertexDrag === drag &&
      d.moveDrag === this.moveDrag
    )
      return;
    d.obstacles = s.collections.obstacles;
    d.rooms = s.collections.rooms;
    d.zoom = cam.zoom;
    d.x = cam.x;
    d.y = cam.y;
    d.hover = this.hoverVertex;
    d.sub = this.sub;
    d.vertexDrag = drag;
    d.moveDrag = this.moveDrag;
    const g = this.handles!;
    g.clear();
    const u = 1 / rc.zoom;
    const view = inflateRect(cam.visibleRect(), 20 * u);
    const { primary, background, muted } = rc.theme;
    const moving = this.moveDrag?.skip;
    for (const v of this.snapper.allVertices()) {
      if (v.x < view.x || v.y < view.y || v.x > view.x + view.width || v.y > view.y + view.height)
        continue;
      const k = pointKey(v);
      if (drag?.key === k || moving?.has(k)) continue;
      const degree = this.snapper.degree.get(k) ?? 0;
      if (degree >= 2) g.circle(v.x, v.y, 3.5 * u).fill({ color: primary });
      else if (degree === 1)
        g.circle(v.x, v.y, 4 * u)
          .fill({ color: background })
          .stroke({ width: 1.5 * u, color: primary });
      else g.rect(v.x - 3 * u, v.y - 3 * u, 6 * u, 6 * u).fill({ color: muted });
    }
    const hv = this.hoverVertex;
    if (hv) g.circle(hv.x, hv.y, 8 * u).stroke({ width: 2 * u, color: primary, alpha: 0.9 });
    const sub = this.sub;
    if (sub?.type === 'vertex')
      g.circle(sub.point.x, sub.point.y, 8 * u)
        .fill({ color: primary, alpha: 0.3 })
        .stroke({ width: 2 * u, color: primary });
    if (sub?.type === 'segment') {
      const e = engine.entity(sub.id);
      const pts = e ? this.ctx.view.pointsOf(e) : null;
      const a = pts?.[sub.index];
      const b = pts?.[sub.index + 1];
      if (a && b)
        g.moveTo(a.x, a.y)
          .lineTo(b.x, b.y)
          .stroke({ width: 6 * u, color: primary, alpha: 0.7, cap: 'round' });
    }
  }

  private drawOverlay(rc: RenderContext) {
    const g = this.overlay!;
    const label = this.label!;
    g.clear();
    label.visible = false;
    const u = 1 / rc.zoom;
    const { primary, background, foreground, muted, success } = rc.theme;
    const ppu = rc.pixelsPerUnit;
    const unit = rc.unitName;
    const showLabel = (text: string, at: Point) => {
      label.text = text;
      label.visible = true;
      label.scale.set(u);
      label.position.set(at.x + 14 * u, at.y + 12 * u);
      const w = label.width + 8 * u;
      const h = label.height + 4 * u;
      g.roundRect(at.x + 10 * u, at.y + 10 * u, w, h, 4 * u).fill({
        color: background,
        alpha: 0.85,
      });
    };

    // Chaîne en cours
    if (this.chain.length) {
      const pts = this.chain;
      const color = this.mode === 'room' ? primary : this.mode === 'door' ? success : primary;
      if (pts.length > 1) {
        g.moveTo(pts[0]!.x, pts[0]!.y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
        g.stroke({ width: 3 * u, color, join: 'round', cap: 'round' });
      }
      const last = pts[pts.length - 1]!;
      const cursor = this.snap?.point;
      if (cursor && this.state === 'chain') {
        dashedPolyline(g, [last, cursor], 6 * u, 4 * u);
        g.stroke({ width: 2 * u, color, alpha: 0.9 });
        showLabel(formatLength(distance(last, cursor), ppu, unit), cursor);
      }
      // Premier point : cible de fermeture
      const first = pts[0]!;
      if (pts.length >= 3)
        g.circle(first.x, first.y, 7 * u).stroke({ width: 2 * u, color, alpha: 0.9 });
      for (const p of pts) g.circle(p.x, p.y, 3 * u).fill({ color });
    }

    // Rectangle en cours
    if (this.rect) {
      const { a, b } = this.rect;
      const pts: Pts = [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      g.poly(
        pts.flatMap((p) => [p.x, p.y]),
        true,
      ).fill({ color: primary, alpha: 0.06 });
      dashedPolyline(g, pts, 8 * u, 5 * u, true);
      g.stroke({ width: 2 * u, color: primary });
      showLabel(
        `${formatLength(Math.abs(b.x - a.x), ppu, unit)} × ${formatLength(Math.abs(b.y - a.y), ppu, unit)}`,
        b,
      );
    }

    // Porte visée
    const dh = this.doorHover;
    if (dh && this.state === 'idle') {
      const [a, b] = dh.door;
      g.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: 8 * u, color: success, alpha: 0.85, cap: 'butt' });
      for (const p of [a, b])
        g.circle(p.x, p.y, 3.5 * u)
          .fill({ color: background })
          .stroke({ width: 1.5 * u, color: success });
      showLabel(formatLength(distance(a, b), ppu, unit), dh.at);
    }

    // Aimant sous le pointeur
    const s = this.snap;
    if (s && (this.mode !== 'edit' || this.state === 'vertex' || this.state === 'move') && !dh) {
      const p = s.point;
      switch (s.kind) {
        case 'point':
          g.circle(p.x, p.y, 7 * u)
            .fill({ color: primary, alpha: 0.25 })
            .stroke({ width: 2 * u, color: primary });
          g.circle(p.x, p.y, 2.5 * u).fill({ color: primary });
          break;
        case 'segment': {
          const seg = s.segment!;
          g.moveTo(seg.a.x, seg.a.y)
            .lineTo(seg.b.x, seg.b.y)
            .stroke({ width: 5 * u, color: primary, alpha: 0.35 });
          const r = 6 * u;
          g.poly([p.x, p.y - r, p.x + r, p.y, p.x, p.y + r, p.x - r, p.y], true)
            .fill({ color: background })
            .stroke({ width: 2 * u, color: primary });
          break;
        }
        case 'grid':
        case 'angle': {
          const r = 5 * u;
          g.moveTo(p.x - r, p.y)
            .lineTo(p.x + r, p.y)
            .moveTo(p.x, p.y - r)
            .lineTo(p.x, p.y + r);
          g.stroke({
            width: 1.5 * u,
            color: s.kind === 'angle' ? primary : foreground,
            alpha: 0.9,
          });
          break;
        }
        default:
          g.circle(p.x, p.y, 2.5 * u).fill({ color: muted });
      }
      // Glisser un sommet : longueur des segments voisins
      if (this.state === 'vertex' && this.vertexDrag) {
        showLabel(formatLength(distance(this.vertexDrag.origin, p), ppu, unit), p);
      }
    }

    // Lasso
    if (this.lasso) {
      const r = this.lasso;
      g.rect(r.x, r.y, r.width, r.height)
        .fill({ color: primary, alpha: 0.08 })
        .stroke({ width: u, color: primary, alpha: 0.9 });
    }
  }
}
