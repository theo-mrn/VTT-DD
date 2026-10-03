/**
 * Outil Dessin (P, docs/carte.md § 10) : main levée, ligne, rectangle, ellipse, gomme.
 *
 * Machine à états, testée sans rendu :
 *
 * | État       | Entrée                                             | Sortie                                           |
 * | ---------- | -------------------------------------------------- | ------------------------------------------------ |
 * | `idle`     | bouton → `drawing` (main levée) ou `shaping`       | bouton (gomme) → `erasing` ; 1 à 5 : forme       |
 * | `drawing`  | points bruts (1,5 px d'écran d'écart au moins)     | lâcher → simplifié (RDP), **une** commande       |
 * | `shaping`  | forme de l'origine au pointeur (⇧ : carré, cercle) | lâcher → une commande (rien si trop petite)      |
 * | `erasing`  | les tracés touchés disparaissent                   | lâcher → **une** commande pour tous              |
 *
 * Échap revient à `idle` sans rien écrire (les tracés gommés reviennent).
 *
 * Direct (§ 8) : le tracé en cours part en continu dans `map.live.stroke` (points ajoutés
 * depuis le dernier envoi ; le canal découpe sous 4 Kio et cadence à 15 Hz), avec la couleur de
 * l'auteur. Une forme envoie son origine puis son extrémité courante. Un tracé annulé se termine
 * par un dernier message `tool: 'eraser'` : le fantôme disparaît chez les autres. Rien ne part
 * pour un calque masqué aux joueurs.
 */
import type { Container, Graphics } from 'pixi.js';
import type { MapEntity } from '../../engine/entities/entity';
import type { RenderContext } from '../../engine/entities/entity-kind';
import { inflateRect, rectFromPoints, type Point } from '../../engine/geometry';
import { HIT_TOLERANCE_PX, type MapEngine } from '../../engine/map-engine';
import type { MapKey, MapPointer, Tool } from '../../engine/tools/tool';
import type { LiveStroke } from '../../live/live-channel';
import { tempId } from '../../store/commands';
import {
  createDrawing,
  drawingDraft,
  eraseDrawings,
  isSecretLayer,
  placement,
  type Placement,
} from './operations';
import { fillFor, withAlpha } from './palette';
import { drawFlatPolyline, drawShape, pixiColor, type StrokeParams } from './render';
import type { DrawingsRuntime } from './runtime';
import { DRAW_SHAPES, type DrawShape } from './settings';
import { constrainEnd, round2, shapeOf, shapePoints, simplify } from './shapes';
import { DRAW_TOOL_ID, DRAWING_KIND, HIT_SLOP_PX, type DrawingData } from './types';

/** Écart minimal entre deux points bruts, en pixels d'écran. */
export const MIN_STEP_PX = 1.5;
/** Tolérance de la simplification au lâcher, en pixels d'écran. */
export const SIMPLIFY_PX = 0.8;
/** Rayon de la gomme, en pixels d'écran. */
export const ERASER_PX = 10;
/** En dessous, une forme n'est pas posée (clic sans glisser). */
export const MIN_SHAPE_PX = 3;
/** Points d'un dessin, au plus (contrat). */
export const MAX_POINTS = 20_000;

const ERASE_MASK = 'drawings:erasing';

export type DrawToolState = 'idle' | 'drawing' | 'shaping' | 'erasing';

interface StrokeStyle {
  color: string;
  width: number;
  fill: string | null;
}

export class DrawTool implements Tool {
  readonly id = DRAW_TOOL_ID;
  state: DrawToolState = 'idle';

  /** Points bruts du tracé en cours, à plat (`x0, y0, x1, y1…`). */
  private readonly flat: number[] = [];
  private start: Point | null = null;
  private end: Point | null = null;
  private shape: DrawShape = 'pen';
  private style: StrokeStyle = { color: '', width: 1, fill: null };
  private place: Placement = { layerId: null, z: 1 };
  private strokeId = '';
  private broadcasting = false;
  private readonly erased = new Map<string, MapEntity>();
  private lastErase: Point | null = null;
  private readonly probe: Point = { x: 0, y: 0 };
  private hover: Point | null = null;

  // Aperçu (plan `tool`)
  private gfx: Graphics | null = null;
  private dirty = true;
  private drawnZoom = 0;

  constructor(private readonly rt: DrawingsRuntime) {}

  private get engine(): MapEngine {
    return this.rt.engine;
  }

  cursor() {
    return 'crosshair';
  }

  // ─── Pointeur ──────────────────────────────────────────────────────────────

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0 || this.state !== 'idle') return false;
    if (e.alt) {
      engine.ping(e.world);
      return true;
    }
    const s = this.rt.settings.getState();
    this.shape = s.shape;
    this.hover = e.world;
    if (s.shape === 'eraser') {
      this.state = 'erasing';
      this.erased.clear();
      this.lastErase = e.world;
      this.eraseAlong(e.world, e.world);
      this.changed();
      return true;
    }
    const color = withAlpha(s.color, s.opacity);
    this.style = { color, width: s.width, fill: s.fill ? fillFor(color) : null };
    this.place = placement(engine, s.target);
    this.strokeId = tempId();
    this.broadcasting = false;
    // La fin du tracé précédent part avant le nouveau (sinon le canal la confondrait)
    engine.live?.flush();
    if (s.shape === 'pen') {
      this.state = 'drawing';
      this.flat.length = 0;
      this.flat.push(round2(e.world.x), round2(e.world.y));
    } else {
      this.state = 'shaping';
      this.start = { x: e.world.x, y: e.world.y };
      this.end = { x: e.world.x, y: e.world.y };
    }
    this.changed();
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    this.hover = e.world;
    switch (this.state) {
      case 'idle':
        // Anneau de la gomme sous le pointeur
        if (this.rt.settings.getState().shape === 'eraser') this.changed();
        return;
      case 'drawing': {
        const n = this.flat.length;
        const dx = e.world.x - this.flat[n - 2]!;
        const dy = e.world.y - this.flat[n - 1]!;
        if (Math.hypot(dx, dy) < engine.camera.screenToWorldLength(MIN_STEP_PX)) return;
        const x = round2(e.world.x);
        const y = round2(e.world.y);
        this.flat.push(x, y);
        this.broadcast(this.broadcasting ? [x, y] : this.flat.slice());
        this.changed();
        return;
      }
      case 'shaping': {
        if (!this.start) return;
        this.end = constrainEnd(this.shape, this.start, e.world, e.shift);
        if (this.broadcasting) this.broadcast([this.end.x, this.end.y]);
        else if (this.bigEnough())
          this.broadcast([this.start.x, this.start.y, this.end.x, this.end.y]);
        this.changed();
        return;
      }
      case 'erasing':
        this.eraseAlong(this.lastErase ?? e.world, e.world);
        this.lastErase = e.world;
        this.changed();
        return;
    }
  }

  up(_e: MapPointer, engine: MapEngine) {
    switch (this.state) {
      case 'drawing':
        this.finishStroke(engine);
        break;
      case 'shaping':
        this.finishShape(engine);
        break;
      case 'erasing':
        this.finishErase();
        break;
    }
    this.reset();
  }

  /** Échap : rien n'est écrit, les tracés gommés reviennent. */
  cancel(engine: MapEngine): boolean {
    if (this.state === 'idle') return false;
    if (this.state === 'erasing') this.restoreErased();
    this.cancelBroadcast();
    this.reset();
    engine.invalidate();
    return true;
  }

  deactivate(engine: MapEngine) {
    this.cancel(engine);
    this.hover = null;
    this.gfx?.clear();
    engine.invalidate();
  }

  /** 1 à 5 : main levée, ligne, rectangle, ellipse, gomme. */
  key(k: MapKey): boolean {
    if (k.ctrl || k.meta || k.alt || k.repeat || this.state !== 'idle') return false;
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(k.code);
    if (!m) return false;
    this.rt.settings.patch({ shape: DRAW_SHAPES[Number(m[1]) - 1]! });
    this.changed();
    return true;
  }

  // ─── Fins de geste ─────────────────────────────────────────────────────────

  private finishStroke(engine: MapEngine) {
    const raw: Point[] = [];
    for (let i = 0; i < this.flat.length; i += 2)
      raw.push({ x: this.flat[i]!, y: this.flat[i + 1]! });
    let epsilon = engine.camera.screenToWorldLength(SIMPLIFY_PX);
    let points = simplify(raw, epsilon);
    while (points.length > MAX_POINTS) {
      epsilon *= 2;
      points = simplify(raw, epsilon);
    }
    // Un clic sans glisser : un point (le serveur veut deux points)
    if (points.length === 1) points = [points[0]!, { ...points[0]! }];
    engine.live?.end();
    void createDrawing(
      this.rt,
      drawingDraft(
        engine,
        {
          tool: 'pen',
          points,
          color: this.style.color,
          width: this.style.width,
          fill: null,
          closed: false,
          smooth: points.length >= 3,
        },
        this.place,
        this.strokeId,
      ),
    );
  }

  private bigEnough(): boolean {
    if (!this.start || !this.end) return false;
    const w = Math.abs(this.end.x - this.start.x);
    const h = Math.abs(this.end.y - this.start.y);
    const min = this.engine.camera.screenToWorldLength(MIN_SHAPE_PX);
    return this.shape === 'line' ? Math.hypot(w, h) >= min : Math.max(w, h) >= min;
  }

  private finishShape(engine: MapEngine) {
    if (!this.start || !this.end || !this.bigEnough()) {
      this.cancelBroadcast();
      return;
    }
    const closed = this.shape !== 'line';
    engine.live?.end();
    void createDrawing(
      this.rt,
      drawingDraft(
        engine,
        {
          tool: this.shape as 'line' | 'rectangle' | 'circle',
          points: shapePoints(this.start, this.end),
          color: this.style.color,
          width: this.style.width,
          fill: closed ? this.style.fill : null,
          closed,
          smooth: false,
        },
        this.place,
        this.strokeId,
      ),
    );
  }

  private finishErase() {
    const engine = this.engine;
    // Seulement ce qui existe encore (un autre a pu l'effacer pendant le geste)
    const items = [...this.erased.values()]
      .filter((e) => engine.entity(e.id) === e)
      .map((e) => e.data as DrawingData);
    this.restoreErased();
    void eraseDrawings(this.rt, items);
  }

  // ─── Gomme ─────────────────────────────────────────────────────────────────

  /** Tracés touchés le long du segment [a, b] : cachés tout de suite, supprimés au lâcher. */
  private eraseAlong(a: Point, b: Point) {
    const engine = this.engine;
    const radius = engine.camera.screenToWorldLength(ERASER_PX);
    // Tolérance passée au toucher du dessin (qui la porte de 4 à 6 px) : le rayon de la gomme
    const tolerance = (radius * HIT_TOLERANCE_PX) / HIT_SLOP_PX;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / Math.max(radius / 2, 1e-3)));
    const candidates = engine.entitiesInRect(inflateRect(rectFromPoints(a, b), radius));
    for (const e of candidates) {
      if (e.kind.id !== DRAWING_KIND || this.erased.has(e.id)) continue;
      if (!e.kind.can('delete', e, engine.viewer)) continue;
      for (let i = 0; i <= steps; i++) {
        this.probe.x = a.x + ((b.x - a.x) * i) / steps;
        this.probe.y = a.y + ((b.y - a.y) * i) / steps;
        if (!e.hitTest(this.probe, tolerance)) continue;
        this.erased.set(e.id, e);
        engine.setMask(e, ERASE_MASK, true);
        break;
      }
    }
  }

  private restoreErased() {
    for (const e of this.erased.values()) this.engine.setMask(e, ERASE_MASK, false);
    this.erased.clear();
  }

  // ─── Direct ────────────────────────────────────────────────────────────────

  private liveMeta(): Omit<LiveStroke, 'points'> {
    const tool = this.shape === 'eraser' ? 'pen' : this.shape;
    const meta: Omit<LiveStroke, 'points'> = {
      id: this.strokeId,
      tool,
      color: this.style.color,
      width: this.style.width,
    };
    // Forme fermée remplie : le remplissage part avec elle (le fantôme est rempli chez les autres)
    const closed = tool === 'rectangle' || tool === 'circle';
    if (closed && this.style.fill) meta.fill = this.style.fill;
    return meta;
  }

  private broadcast(points: readonly number[]) {
    const live = this.engine.live;
    if (!live || isSecretLayer(this.engine, this.place.layerId)) return;
    live.stroke(this.liveMeta(), points);
    this.broadcasting = true;
  }

  /** Tracé abandonné : un dernier message `eraser` retire le fantôme chez les autres. */
  private cancelBroadcast() {
    const live = this.engine.live;
    if (!live || !this.broadcasting) return;
    const n = this.flat.length;
    const last = this.end ?? (n ? { x: this.flat[n - 2]!, y: this.flat[n - 1]! } : null);
    if (last) live.stroke({ ...this.liveMeta(), tool: 'eraser' }, [last.x, last.y]);
    live.end();
    this.broadcasting = false;
  }

  private reset() {
    this.state = 'idle';
    this.start = null;
    this.end = null;
    this.lastErase = null;
    this.flat.length = 0;
    this.broadcasting = false;
    this.changed();
  }

  private changed() {
    this.dirty = true;
    this.engine.invalidate();
  }

  // ─── Aperçu ────────────────────────────────────────────────────────────────

  renderPreview(layer: Container, ctx: RenderContext) {
    let g = this.gfx;
    if (!g || g.destroyed) {
      g = new ctx.pixi.Graphics({ label: 'draw-preview' });
      this.gfx = g;
      this.dirty = true;
    }
    if (g.parent !== layer) layer.addChild(g);
    if (!this.dirty && ctx.zoom === this.drawnZoom) return;
    this.dirty = false;
    this.drawnZoom = ctx.zoom;
    g.clear();
    const px = 1 / ctx.zoom;
    const c = pixiColor(ctx.pixi, this.style.color);
    const stroke = { width: this.style.width, color: c.color, alpha: c.alpha };
    switch (this.state) {
      case 'drawing':
        drawFlatPolyline(g, this.flat, this.flat.length / 2, stroke);
        return;
      case 'shaping':
        this.previewShape(g, ctx, stroke);
        return;
      default:
        this.previewEraser(g, ctx, px);
    }
  }

  /** Forme en cours, de l'origine à l'extrémité (remplie si elle est fermée). */
  private previewShape(g: Graphics, ctx: RenderContext, stroke: StrokeParams) {
    if (!this.start || !this.end) return;
    const closed = this.shape !== 'line';
    const shape = shapeOf({
      tool: this.shape,
      points: [this.start, this.end],
      width: this.style.width,
      closed,
    });
    const fill = closed && this.style.fill ? pixiColor(ctx.pixi, this.style.fill) : null;
    drawShape(g, shape, stroke, fill);
  }

  /** Cercle de la gomme sous le pointeur. */
  private previewEraser(g: Graphics, ctx: RenderContext, px: number) {
    const eraser = this.state === 'erasing' || this.rt.settings.getState().shape === 'eraser';
    if (!eraser || !this.hover) return;
    const r = ERASER_PX * px;
    g.circle(this.hover.x, this.hover.y, r)
      .fill({ color: ctx.theme.foreground, alpha: 0.08 })
      .stroke({ width: 1.5 * px, color: ctx.theme.foreground, alpha: 0.9 });
  }
}
