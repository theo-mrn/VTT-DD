/**
 * Outil brouillard (G) (docs/carte.md § 10, Brouillard) : une machine à états, testée sans
 * rendu.
 *
 * Formes (barre contextuelle, chiffres 1 à 4) : Rectangle (aimanté à la grille si l'option est
 * active), Cercle (depuis le centre ; ⇧ : rayon en cases entières), Main levée (lasso simplifié),
 * Sélection (gestes communs : clic, glisser, poignées de taille, lasso, Suppr).
 * Gestes (barre) : ajouter ou retirer du brouillard ; quand la mémoire de l'exploration de la scène
 * est allumée, marquer une zone comme déjà vue ou la faire oublier (docs/exploration.md § 5.4,
 * mémoire surlignée pendant ces gestes). Alt inverse le geste dans sa famille le temps du geste.
 *
 * | État       | Entrée                                   | Sortie                                     |
 * | ---------- | ---------------------------------------- | ------------------------------------------ |
 * | `idle`     | bouton : forme → `pressing`              | Sélection : gestes communs                 |
 * |            | bouton sur une poignée : sélection       |                                            |
 * | `pressing` | +4 px → `drawing`                        | lâcher : clic (sélectionne la zone touchée) |
 * | `drawing`  | rectangle, cercle ou tracé               | lâcher : une commande ; Échap : rien       |
 */
import { translate } from '@/i18n/runtime';
import type { Container, Graphics } from 'pixi.js';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { RenderContext } from '@/lib/map/engine/entities/entity-kind';
import { rectFromPoints, type Point } from '@/lib/map/engine/geometry';
import { exceedsThreshold } from '@/lib/map/engine/interaction/drag';
import { snapToGridLines } from '@/lib/map/engine/interaction/snapping';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { MapKey, MapPointer, Tool } from '@/lib/map/engine/tools/tool';
import { SelectTool } from '@/lib/map/engine/tools/select-tool';
import { createCommand } from '@/lib/map/store/commands';
import { dashedPolyline } from '@/lib/map/features/obstacles/engine/overlay';
import {
  editMemory,
  invertOp,
  memoryEnabled,
  memoryReady,
  MemoryHighlight,
  type EditOp,
  type ExplorationShape,
} from '@/lib/map/features/exploration/engine/memory';
import { circlePolygon, hatchPolygon, lassoPolygon } from './geometry';
import type { FogContext } from './kind';
import {
  fogModeLabel,
  FOG_TOOL_ID,
  FOG_ZONE_KIND,
  FOG_ZONES,
  fogDraft,
  invertMode,
  nextOrder,
  type FogGeometry,
  type FogMode,
  type FogZoneData,
} from './model';

export type FogShape = 'rect' | 'circle' | 'lasso' | 'select';

/** Formes de l'outil ; nom : `map.fog.shapes.<id>.label`. */
export const FOG_SHAPES: readonly { id: FogShape; key: string }[] = [
  { id: 'rect', key: '1' },
  { id: 'circle', key: '2' },
  { id: 'lasso', key: '3' },
  { id: 'select', key: '4' },
];

/** Geste de l'outil : le brouillard du MJ, ou la mémoire des joueurs. */
export type FogToolMode = FogMode | EditOp;

/** Ordre des gestes dans la barre ; nom et infobulle : `map.fog.modes.<id>`. */
export const FOG_TOOL_MODES: readonly FogToolMode[] = ['fog', 'clear', 'reveal', 'forget'];

export const isMemoryMode = (m: FogToolMode): m is EditOp => m === 'reveal' || m === 'forget';

/** Alt : l'autre geste de la même famille. */
const invertToolMode = (m: FogToolMode): FogToolMode =>
  isMemoryMode(m) ? invertOp(m) : invertMode(m);

/** Forme du brouillard pour la mémoire (un rectangle y est un polygone). */
const memoryShape = (g: FogGeometry): ExplorationShape =>
  g.shape === 'circle'
    ? { shape: 'circle', center: g.center, radius: g.radius }
    : { shape: 'polygon', points: g.points };

export interface FogSettings {
  shape: FogShape;
  mode: FogToolMode;
}

export type FogState = 'idle' | 'pressing' | 'drawing' | 'select';

/** Pas du tracé à main levée, en pixels d'écran ; tolérance de la simplification. */
const LASSO_STEP_PX = 3;
const LASSO_TOLERANCE_PX = 1.5;

const isZone = (e: MapEntity) => e.kind.id === FOG_ZONE_KIND;

export class FogTool implements Tool {
  readonly id = FOG_TOOL_ID;
  state: FogState = 'idle';
  readonly settings: StoreApi<FogSettings> = createStore<FogSettings>()(() => ({
    shape: 'rect',
    mode: 'fog',
  }));
  /** Gestes communs (sélection, glisser, poignées, lasso), restreints aux zones. */
  private readonly select = new SelectTool();
  private start: MapPointer | null = null;
  /** Aperçu du geste en cours. */
  draft: FogGeometry | null = null;
  /** Geste en cours (Alt l'inverse). */
  gestureMode: FogToolMode = 'fog';
  private readonly highlight = new MemoryHighlight();
  private lasso: Point[] = [];
  private lastScreen: Point | null = null;

  constructor(private readonly ctx: FogContext) {}

  get shape(): FogShape {
    return this.settings.getState().shape;
  }

  get mode(): FogToolMode {
    return this.settings.getState().mode;
  }

  /** Change de geste ; la Sélection ne vaut que pour les zones de brouillard. */
  setMode(mode: FogToolMode) {
    if (mode === this.mode) return;
    this.cancel(this.ctx.engine);
    const shape = isMemoryMode(mode) && this.shape === 'select' ? 'rect' : this.shape;
    this.settings.setState({ mode, shape });
    this.ctx.engine.refreshCursor();
    this.ctx.engine.invalidate();
  }

  setShape(shape: FogShape) {
    if (shape === this.shape) return;
    if (shape === 'select' && isMemoryMode(this.mode)) return;
    this.cancel(this.ctx.engine);
    this.settings.setState({ shape });
    this.ctx.engine.refreshCursor();
  }

  targets(e: MapEntity): boolean {
    return !isMemoryMode(this.mode) && isZone(e);
  }

  cursor(engine: MapEngine): string | null {
    if (isMemoryMode(this.mode)) return memoryEnabled(engine) ? 'crosshair' : 'not-allowed';
    if (this.shape === 'select' || this.state === 'select') return this.select.cursor(engine);
    return 'crosshair';
  }

  activate(engine: MapEngine) {
    const keep = engine.selectedEntities().filter(isZone);
    if (keep.length !== engine.selection.size) engine.selection.replace(keep.map((e) => e.id));
  }

  deactivate(engine: MapEngine) {
    this.select.deactivate(engine);
    this.reset();
    const zones = engine.selectedEntities().filter(isZone);
    if (zones.length) engine.selection.remove(zones.map((e) => e.id));
    this.gfx?.clear();
    this.highlight.hide();
    this.drawn.draft = null;
    this.drawn.lasso = null;
    engine.invalidate();
  }

  private reset() {
    this.state = 'idle';
    this.start = null;
    this.draft = null;
    this.lasso = [];
    this.lastScreen = null;
  }

  // ─── Pointeur ──────────────────────────────────────────────────────────────

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    const memory = isMemoryMode(this.mode);
    // Mémoire coupée : pas de geste sur elle
    if (memory && !memoryReady(engine)) return false;
    // Sélection, ou poignée de taille de la zone sélectionnée : gestes communs
    if (!memory && (this.shape === 'select' || engine.gizmoAt(e.world))) {
      this.state = 'select';
      return this.select.down(e, engine);
    }
    this.start = e;
    this.gestureMode = this.modeOf(e);
    this.state = 'pressing';
    this.lasso = [e.world];
    this.lastScreen = e.screen;
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    if (this.state === 'select' || (this.state === 'idle' && this.shape === 'select')) {
      this.select.move(e, engine);
      return;
    }
    if (this.state === 'idle') return;
    const start = this.start;
    if (!start) return;
    if (this.state === 'pressing') {
      if (!exceedsThreshold(start.screen, e.screen)) return;
      this.state = 'drawing';
      engine.selection.clear();
    }
    this.gestureMode = this.modeOf(e);
    this.draft = this.geometryOf(e, engine);
    engine.invalidate();
  }

  up(e: MapPointer, engine: MapEngine) {
    if (this.state === 'select') {
      this.select.up(e, engine);
      this.state = 'idle';
      return;
    }
    const state = this.state;
    const start = this.start;
    if (state === 'drawing') {
      this.gestureMode = this.modeOf(e);
      const g = this.geometryOf(e, engine);
      const mode = this.gestureMode;
      this.reset();
      if (g && isMemoryMode(mode)) editMemory(engine, memoryShape(g), mode);
      else if (g) this.create(engine, g, mode as FogMode);
    } else if (state === 'pressing' && start && !isMemoryMode(this.mode)) {
      // Clic sans glisser : sélectionne la zone touchée
      this.reset();
      const hit = engine.hitTest(e.world);
      if (hit) engine.selection.replace([hit.id]);
      else engine.selection.clear();
    } else this.reset();
    engine.invalidate();
  }

  doubleClick(e: MapPointer, engine: MapEngine): boolean {
    return this.select.doubleClick(e, engine);
  }

  private modeOf(e: { alt: boolean }): FogToolMode {
    return e.alt ? invertToolMode(this.mode) : this.mode;
  }

  key(k: MapKey, engine: MapEngine): boolean {
    if (k.ctrl || k.meta || k.alt || k.shift) return false;
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(k.code);
    if (digit) {
      this.setShape(FOG_SHAPES[Number(digit[1]) - 1]!.id);
      engine.invalidate();
      return true;
    }
    return false;
  }

  cancel(engine: MapEngine): boolean {
    if (this.state === 'select') {
      const took = this.select.cancel(engine);
      this.state = 'idle';
      return took;
    }
    const busy = this.state !== 'idle';
    this.reset();
    engine.invalidate();
    return busy;
  }

  // ─── Formes ────────────────────────────────────────────────────────────────

  /** Géométrie du geste jusqu'à ce pointeur (null : trop petite). */
  private geometryOf(e: MapPointer, engine: MapEngine): FogGeometry | null {
    const start = this.start;
    if (!start) return null;
    const minPx = engine.camera.screenToWorldLength(4);
    switch (this.shape) {
      case 'rect':
        return rectGeometry(start.world, e.world, engine, minPx);
      case 'circle':
        return circleGeometry(start.world, e, engine, minPx);
      case 'lasso':
        return this.lassoGeometry(e, engine, minPx);
      default:
        return null;
    }
  }

  /** Lasso : un point de plus tous les quelques pixels, puis le polygone simplifié. */
  private lassoGeometry(e: MapPointer, engine: MapEngine, minPx: number): FogGeometry | null {
    const last = this.lastScreen;
    if (!last || exceedsThreshold(last, e.screen, LASSO_STEP_PX)) {
      this.lasso.push(e.world);
      this.lastScreen = e.screen;
    }
    const polygon = lassoPolygon(
      this.lasso,
      engine.camera.screenToWorldLength(LASSO_TOLERANCE_PX),
      minPx * minPx,
    );
    return polygon ? { shape: 'polygon', points: polygon } : null;
  }

  /** Pose la zone : une commande (annulable). */
  private create(engine: MapEngine, g: FogGeometry, mode: FogMode) {
    const s = engine.store.getState();
    const zones = [...(s.collections[FOG_ZONES]?.values() ?? [])] as FogZoneData[];
    const draft = fogDraft(s.mapId, engine.viewer.userId, nextOrder(zones), mode, g);
    void engine.execute(
      createCommand({
        label: fogModeLabel(mode),
        collection: FOG_ZONES,
        persistence: this.ctx.persistence,
        items: [draft],
      }),
    );
  }

  // ─── Aperçu ────────────────────────────────────────────────────────────────

  private gfx: Graphics | null = null;
  private root: Container | null = null;
  /** Ce que montre l'aperçu dessiné (redessiné seulement si cela change). */
  private readonly drawn: {
    draft: FogGeometry | null;
    lasso: unknown;
    zoom: number;
    mode: FogToolMode;
  } = {
    draft: null,
    lasso: null,
    zoom: 0,
    mode: 'fog',
  };

  renderPreview(layer: Container, rc: RenderContext) {
    if (!this.root) {
      this.root = new rc.pixi.Container({ label: 'fog-tool' });
      this.gfx = new rc.pixi.Graphics();
      this.root.addChild(this.gfx);
    }
    if (this.root.parent !== layer) layer.addChild(this.root);
    // Gestes sur la mémoire : elle est surlignée, sous l'aperçu
    this.highlight.render(this.root, rc, this.ctx.engine, isMemoryMode(this.mode));
    const d = this.state === 'drawing' ? this.draft : null;
    const lasso = this.select.lasso;
    const drawn = this.drawn;
    if (
      drawn.draft === d &&
      drawn.lasso === lasso &&
      drawn.zoom === rc.zoom &&
      drawn.mode === this.gestureMode
    )
      return;
    drawn.draft = d;
    drawn.lasso = lasso;
    drawn.zoom = rc.zoom;
    drawn.mode = this.gestureMode;
    const g = this.gfx!;
    g.clear();
    const u = 1 / rc.zoom;
    // Lasso de sélection (gestes communs)
    if (lasso)
      g.rect(lasso.x, lasso.y, lasso.width, lasso.height)
        .fill({ color: rc.theme.primary, alpha: 0.08 })
        .stroke({ width: u, color: rc.theme.primary, alpha: 0.9 });
    if (!d) return;
    if (isMemoryMode(this.gestureMode)) {
      const outline = d.shape === 'circle' ? circlePolygon(d.center, d.radius, 64) : d.points;
      if (this.gestureMode === 'forget') {
        dashedPolyline(g, outline, 8 * u, 5 * u, true);
        g.stroke({ width: 2 * u, color: rc.theme.foreground });
      } else
        g.poly(
          outline.flatMap((p) => [p.x, p.y]),
          true,
        )
          .fill({ color: rc.theme.primary, alpha: 0.18 })
          .stroke({ width: 2 * u, color: rc.theme.primary });
      return;
    }
    const clear = this.gestureMode === 'clear';
    const color = clear ? rc.theme.primary : rc.theme.foreground;
    const outline = d.shape === 'circle' ? circlePolygon(d.center, d.radius, 64) : d.points;
    if (clear) {
      for (const [a, b] of hatchPolygon(outline, 10 * u)) g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      g.stroke({ width: 1.5 * u, color, alpha: 0.6 });
      dashedPolyline(g, outline, 8 * u, 5 * u, true);
      g.stroke({ width: 2 * u, color });
    } else {
      g.poly(
        outline.flatMap((p) => [p.x, p.y]),
        true,
      )
        .fill({ color: rc.theme.background, alpha: 0.35 })
        .stroke({ width: 2 * u, color });
    }
  }

  destroy() {
    this.highlight.destroy();
  }
}

/** Arrondi au centième. */
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Rectangle aimanté (Alt inverse ici le mode, pas l'aimantation). */
function rectGeometry(
  from: Point,
  to: Point,
  engine: MapEngine,
  minPx: number,
): FogGeometry | null {
  const grid = engine.snapGrid();
  const a = grid ? snapToGridLines(from, grid) : from;
  const b = grid ? snapToGridLines(to, grid) : to;
  const r = rectFromPoints(a, b);
  if (r.width < minPx || r.height < minPx) return null;
  const x0 = round2(r.x);
  const y0 = round2(r.y);
  const x1 = round2(r.x + r.width);
  const y1 = round2(r.y + r.height);
  return {
    shape: 'rect',
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  };
}

/** Cercle depuis son centre (⇧ : rayon en cases entières). */
function circleGeometry(
  c: Point,
  e: MapPointer,
  engine: MapEngine,
  minPx: number,
): FogGeometry | null {
  let radius = Math.hypot(e.world.x - c.x, e.world.y - c.y);
  const cell = engine.grid()?.size ?? 0;
  if (e.shift && cell) radius = Math.max(cell, Math.round(radius / cell) * cell);
  if (radius < minPx) return null;
  return { shape: 'circle', center: { x: round2(c.x), y: round2(c.y) }, radius: round2(radius) };
}
