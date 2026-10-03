/**
 * Outil brouillard (G) (docs/carte.md § 10, Brouillard) : une machine à états, testée sans
 * rendu.
 *
 * Formes (barre contextuelle, chiffres 1 à 4) : Rectangle (aimanté à la grille si l'option est
 * active), Cercle (depuis le centre ; ⇧ : rayon en cases entières), Main levée (lasso simplifié),
 * Sélection (gestes communs : clic, glisser, poignées de taille, lasso, Suppr).
 * Mode ajouter ou retirer (barre) ; Alt inverse le mode le temps du geste.
 *
 * | État       | Entrée                                   | Sortie                                     |
 * | ---------- | ---------------------------------------- | ------------------------------------------ |
 * | `idle`     | bouton : forme → `pressing`              | Sélection : gestes communs                 |
 * |            | bouton sur une poignée : sélection       |                                            |
 * | `pressing` | +4 px → `drawing`                        | lâcher : clic (sélectionne la zone touchée) |
 * | `drawing`  | rectangle, cercle ou tracé               | lâcher : une commande ; Échap : rien       |
 */
import type { Container, Graphics } from 'pixi.js';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '../../engine/entities/entity';
import type { RenderContext } from '../../engine/entities/entity-kind';
import { rectFromPoints, type Point } from '../../engine/geometry';
import { exceedsThreshold } from '../../engine/interaction/drag';
import { snapToGridLines } from '../../engine/interaction/snapping';
import type { MapEngine } from '../../engine/map-engine';
import type { MapKey, MapPointer, Tool } from '../../engine/tools/tool';
import { SelectTool } from '../../engine/tools/select-tool';
import { createCommand } from '../../store/commands';
import { dashedPolyline } from '../obstacles/overlay';
import { circlePolygon, hatchPolygon, lassoPolygon } from './geometry';
import type { FogContext } from './kind';
import {
  FOG_MODE_LABELS,
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

export const FOG_SHAPES: readonly { id: FogShape; label: string; key: string; hint: string }[] = [
  {
    id: 'rect',
    label: 'Rectangle',
    key: '1',
    hint: 'Glisser un rectangle. Alt : mode inverse le temps du geste.',
  },
  {
    id: 'circle',
    label: 'Cercle',
    key: '2',
    hint: 'Glisser depuis le centre. ⇧ : rayon en cases entières. Alt : mode inverse.',
  },
  {
    id: 'lasso',
    label: 'Main levée',
    key: '3',
    hint: 'Tracer le contour à main levée. Alt : mode inverse.',
  },
  {
    id: 'select',
    label: 'Sélection',
    key: '4',
    hint: 'Cliquer, glisser, redimensionner ou supprimer (Suppr) les zones.',
  },
];

export interface FogSettings {
  shape: FogShape;
  mode: FogMode;
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
  /** Mode du geste en cours (Alt l'inverse). */
  gestureMode: FogMode = 'fog';
  private lasso: Point[] = [];
  private lastScreen: Point | null = null;

  constructor(private readonly ctx: FogContext) {}

  get shape(): FogShape {
    return this.settings.getState().shape;
  }

  setShape(shape: FogShape) {
    if (shape === this.shape) return;
    this.cancel(this.ctx.engine);
    this.settings.setState({ shape });
    this.ctx.engine.refreshCursor();
  }

  targets(e: MapEntity): boolean {
    return isZone(e);
  }

  cursor(engine: MapEngine): string | null {
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
    // Sélection, ou poignée de taille de la zone sélectionnée : gestes communs
    if (this.shape === 'select' || engine.gizmoAt(e.world)) {
      this.state = 'select';
      return this.select.down(e, engine);
    }
    this.start = e;
    this.gestureMode = e.alt
      ? invertMode(this.settings.getState().mode)
      : this.settings.getState().mode;
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
    this.gestureMode = e.alt
      ? invertMode(this.settings.getState().mode)
      : this.settings.getState().mode;
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
      this.gestureMode = e.alt
        ? invertMode(this.settings.getState().mode)
        : this.settings.getState().mode;
      const g = this.geometryOf(e, engine);
      this.reset();
      if (g) this.create(engine, g, this.gestureMode);
    } else if (state === 'pressing' && start) {
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
    const round = (v: number) => Math.round(v * 100) / 100;
    switch (this.shape) {
      case 'rect': {
        // Aimantation commune (Alt inverse ici le mode, pas l'aimantation)
        const grid = engine.snapGrid();
        const a = grid ? snapToGridLines(start.world, grid) : start.world;
        const b = grid ? snapToGridLines(e.world, grid) : e.world;
        const r = rectFromPoints(a, b);
        if (r.width < minPx || r.height < minPx) return null;
        const x0 = round(r.x);
        const y0 = round(r.y);
        const x1 = round(r.x + r.width);
        const y1 = round(r.y + r.height);
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
      case 'circle': {
        const c = start.world;
        let radius = Math.hypot(e.world.x - c.x, e.world.y - c.y);
        const cell = engine.grid()?.size ?? 0;
        if (e.shift && cell) radius = Math.max(cell, Math.round(radius / cell) * cell);
        if (radius < minPx) return null;
        return { shape: 'circle', center: { x: round(c.x), y: round(c.y) }, radius: round(radius) };
      }
      case 'lasso': {
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
      default:
        return null;
    }
  }

  /** Pose la zone : une commande (annulable). */
  private create(engine: MapEngine, g: FogGeometry, mode: FogMode) {
    const s = engine.store.getState();
    const zones = [...(s.collections[FOG_ZONES]?.values() ?? [])] as FogZoneData[];
    const draft = fogDraft(s.mapId, engine.viewer.userId, nextOrder(zones), mode, g);
    void engine.execute(
      createCommand({
        label: FOG_MODE_LABELS[mode],
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
    mode: FogMode;
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
}
