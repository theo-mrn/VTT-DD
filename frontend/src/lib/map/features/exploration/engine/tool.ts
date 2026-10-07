/**
 * Outil Exploration (MJ, docs/exploration.md § 5.4) : révéler ou oublier une zone de la mémoire
 * du groupe, en machine à états testée sans rendu.
 *
 * Formes (barre contextuelle, chiffres 1 à 3) : Rectangle (aimanté à la grille si l'option est
 * active), Cercle (depuis le centre ; ⇧ : rayon en cases entières), Main levée. Mode Révéler ou
 * Oublier (barre) ; Alt inverse le mode le temps du geste. Chaque geste est une commande
 * annulable. Tant que l'outil est actif, la mémoire est surlignée.
 *
 * | État       | Entrée                      | Sortie                                       |
 * | ---------- | --------------------------- | -------------------------------------------- |
 * | `idle`     | bouton → `pressing`         |                                              |
 * | `pressing` | +4 px → `drawing`           | lâcher : rien (un clic ne change rien)       |
 * | `drawing`  | rectangle, cercle ou tracé  | lâcher : une commande ; Échap : rien         |
 */
import type { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { rasterizeShape, type ExplorationShape } from '@vtt/vision';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { RenderContext } from '@/lib/map/engine/entities/entity-kind';
import { rectFromPoints, type Point } from '@/lib/map/engine/geometry';
import { exceedsThreshold } from '@/lib/map/engine/interaction/drag';
import { snapToGridLines } from '@/lib/map/engine/interaction/snapping';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { MapKey, MapPointer, Tool } from '@/lib/map/engine/tools/tool';
import { circlePolygon, lassoPolygon } from '@/lib/map/features/fog/engine/geometry';
import { dashedPolyline } from '@/lib/map/features/obstacles/engine/overlay';
import type { ExplorationApi } from './api';
import { shapeCommand, type EditOp } from './commands';
import { MaskTexture } from './mask-texture';
import type { ExplorationModel } from './model';

export const EXPLORATION_TOOL_ID = 'exploration';

export type ExplorationShapeId = 'rect' | 'circle' | 'lasso';

export const EXPLORATION_SHAPES: readonly { id: ExplorationShapeId; label: string; key: string }[] =
  [
    { id: 'rect', label: 'Rectangle', key: '1' },
    { id: 'circle', label: 'Cercle', key: '2' },
    { id: 'lasso', label: 'Main levée', key: '3' },
  ];

export interface ExplorationToolSettings {
  shape: ExplorationShapeId;
  mode: EditOp;
}

export type ExplorationToolState = 'idle' | 'pressing' | 'drawing';

/** Opacité du surlignage de la mémoire, tant que l'outil est actif. */
export const HIGHLIGHT_ALPHA = 0.28;

const LASSO_STEP_PX = 3;
const LASSO_TOLERANCE_PX = 1.5;

export const invertOp = (op: EditOp): EditOp => (op === 'reveal' ? 'forget' : 'reveal');

export class ExplorationTool implements Tool {
  readonly id = EXPLORATION_TOOL_ID;
  state: ExplorationToolState = 'idle';
  readonly settings: StoreApi<ExplorationToolSettings> = createStore<ExplorationToolSettings>()(
    () => ({ shape: 'rect', mode: 'reveal' }),
  );
  /** Forme du geste en cours (aperçu). */
  draft: ExplorationShape | null = null;
  /** Mode du geste en cours (Alt l'inverse). */
  gestureMode: EditOp = 'reveal';
  private start: MapPointer | null = null;
  private lasso: Point[] = [];
  private lastScreen: Point | null = null;

  constructor(
    private readonly model: ExplorationModel,
    private readonly api: ExplorationApi | null,
  ) {}

  get shape(): ExplorationShapeId {
    return this.settings.getState().shape;
  }

  setShape(shape: ExplorationShapeId, engine: MapEngine) {
    if (shape === this.shape) return;
    this.cancel(engine);
    this.settings.setState({ shape });
  }

  cursor(): string | null {
    return this.model.enabled ? 'crosshair' : 'not-allowed';
  }

  /** Aucune entité ne se touche avec cet outil : il ne dessine que des zones. */
  targets(): boolean {
    return false;
  }

  activate(engine: MapEngine) {
    engine.selection.clear();
    engine.invalidate();
  }

  deactivate(engine: MapEngine) {
    this.reset();
    this.highlight?.removeFromParent();
    this.gfx?.clear();
    this.drawn.draft = null;
    engine.invalidate();
  }

  private reset() {
    this.state = 'idle';
    this.start = null;
    this.draft = null;
    this.lasso = [];
    this.lastScreen = null;
  }

  private modeOf(e: { alt: boolean }): EditOp {
    const mode = this.settings.getState().mode;
    return e.alt ? invertOp(mode) : mode;
  }

  // ─── Pointeur ────────────────────────────────────────────────────────────────

  down(e: MapPointer): boolean {
    // Avant toute exploration du groupe, le MJ révèle déjà : masque vide à la grille de la scène
    if (e.button !== 0 || !this.model.ensureMask()) return false;
    this.start = e;
    this.gestureMode = this.modeOf(e);
    this.state = 'pressing';
    this.lasso = [e.world];
    this.lastScreen = e.screen;
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    if (this.state === 'idle' || !this.start) return;
    if (this.state === 'pressing') {
      if (!exceedsThreshold(this.start.screen, e.screen)) return;
      this.state = 'drawing';
    }
    this.gestureMode = this.modeOf(e);
    this.draft = this.shapeOf(e, engine);
    engine.invalidate();
  }

  up(e: MapPointer, engine: MapEngine) {
    if (this.state === 'drawing') {
      this.gestureMode = this.modeOf(e);
      const shape = this.shapeOf(e, engine);
      const mode = this.gestureMode;
      this.reset();
      if (shape) this.apply(engine, shape, mode);
    } else this.reset();
    engine.invalidate();
  }

  key(k: MapKey, engine: MapEngine): boolean {
    if (k.ctrl || k.meta || k.alt || k.shift) return false;
    const digit = /^(?:Digit|Numpad)([1-3])$/.exec(k.code);
    if (!digit) return false;
    this.setShape(EXPLORATION_SHAPES[Number(digit[1]) - 1]!.id, engine);
    engine.invalidate();
    return true;
  }

  cancel(engine: MapEngine): boolean {
    const busy = this.state !== 'idle';
    this.reset();
    engine.invalidate();
    return busy;
  }

  // ─── Formes ──────────────────────────────────────────────────────────────────

  /** Forme du geste jusqu'à ce pointeur (null : trop petite). */
  shapeOf(e: MapPointer, engine: MapEngine): ExplorationShape | null {
    const start = this.start;
    if (!start) return null;
    const minPx = engine.camera.screenToWorldLength(4);
    if (this.shape === 'rect') {
      const grid = engine.snapGrid();
      const a = grid ? snapToGridLines(start.world, grid) : start.world;
      const b = grid ? snapToGridLines(e.world, grid) : e.world;
      const r = rectFromPoints(a, b);
      if (r.width < minPx || r.height < minPx) return null;
      return {
        shape: 'polygon',
        points: [
          { x: r.x, y: r.y },
          { x: r.x + r.width, y: r.y },
          { x: r.x + r.width, y: r.y + r.height },
          { x: r.x, y: r.y + r.height },
        ],
      };
    }
    if (this.shape === 'circle') {
      const c = start.world;
      let radius = Math.hypot(e.world.x - c.x, e.world.y - c.y);
      const cell = engine.grid()?.size ?? 0;
      if (e.shift && cell) radius = Math.max(cell, Math.round(radius / cell) * cell);
      return radius < minPx ? null : { shape: 'circle', center: { ...c }, radius };
    }
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

  /** Révèle ou oublie les cases de la forme : une commande, si elle change quelque chose. */
  private apply(engine: MapEngine, shape: ExplorationShape, mode: EditOp) {
    const bounds = this.model.bounds();
    if (!bounds || !this.api || !this.model.active) return;
    const win = rasterizeShape(this.model, bounds, shape);
    if (!win) return;
    const cmd = shapeCommand(this.model, this.api, mode, win);
    if (cmd) void engine.execute(cmd);
  }

  // ─── Aperçu et surlignage ────────────────────────────────────────────────────

  private root: Container | null = null;
  private gfx: Graphics | null = null;
  private highlight: Sprite | null = null;
  private texture: { mask: MaskTexture; texture: Texture } | null = null;
  private readonly drawn: { draft: ExplorationShape | null; zoom: number; mode: EditOp } = {
    draft: null,
    zoom: 0,
    mode: 'reveal',
  };

  renderPreview(layer: Container, rc: RenderContext) {
    if (!this.root) {
      this.root = new rc.pixi.Container({ label: 'exploration-tool' });
      this.gfx = new rc.pixi.Graphics();
      this.root.addChild(this.gfx);
    }
    if (this.root.parent !== layer) layer.addChild(this.root);
    this.renderHighlight(rc);
    const d = this.state === 'drawing' ? this.draft : null;
    const drawn = this.drawn;
    if (drawn.draft === d && drawn.zoom === rc.zoom && drawn.mode === this.gestureMode) return;
    drawn.draft = d;
    drawn.zoom = rc.zoom;
    drawn.mode = this.gestureMode;
    const g = this.gfx!;
    g.clear();
    if (!d) return;
    const u = 1 / rc.zoom;
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
  }

  /** La mémoire du groupe, teintée de la couleur primaire, sous l'aperçu. */
  private renderHighlight(rc: RenderContext) {
    const bounds = this.model.bounds();
    if (!bounds || !this.model.active) {
      if (this.highlight) this.highlight.visible = false;
      return;
    }
    if (!this.texture) {
      const mask = new MaskTexture(rc.pixi);
      this.texture = { mask, texture: new rc.pixi.Texture({ source: mask.textureSource }) };
    }
    const t = this.texture;
    if (t.mask.sync(this.model)) {
      t.texture.destroy();
      t.texture = new rc.pixi.Texture({ source: t.mask.textureSource });
    }
    if (!this.highlight) {
      this.highlight = new rc.pixi.Sprite(t.texture);
      this.highlight.label = 'exploration:highlight';
      this.highlight.alpha = HIGHLIGHT_ALPHA;
    }
    const s = this.highlight;
    if (s.texture !== t.texture) s.texture = t.texture;
    s.tint = rc.theme.primary;
    s.visible = true;
    s.position.set(0, 0);
    s.width = bounds.width;
    s.height = bounds.height;
    if (s.parent !== this.root) this.root!.addChildAt(s, 0);
  }

  destroy() {
    this.highlight?.destroy();
    this.texture?.texture.destroy();
    this.texture?.mask.destroy();
    this.gfx?.destroy();
    this.root?.destroy();
  }
}
