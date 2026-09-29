/**
 * Outil lumières (L) (docs/carte.md § 10, Lumières) : une machine à états, testée sans rendu.
 *
 * | État       | Entrée                                        | Sortie                                    |
 * | ---------- | --------------------------------------------- | ----------------------------------------- |
 * | `idle`     | bouton sur la poignée de rayon → `radius`     | bouton sur une lumière : gestes communs   |
 * |            | bouton dans le vide → `pressing`              |                                           |
 * | `pressing` | +4 px : lasso (gestes communs)                | lâcher : une lumière posée et sélectionnée |
 * | `radius`   | rayon en unités (pas d'une demi-case ; Alt : libre), affiché | lâcher : une commande ; Échap : rien |
 * | `select`   | clic, glisser, lasso (gestes communs, lumières seulement) | lâcher                          |
 *
 * La pose s'aimante au centre de la case, comme le glisser commun (Alt : libre).
 */
import type { BitmapText, Container, Graphics } from 'pixi.js';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '../../engine/entities/entity';
import type { RenderContext } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import { exceedsThreshold } from '../../engine/interaction/drag';
import { snapToCellCenter } from '../../engine/interaction/snapping';
import type { MapEngine } from '../../engine/map-engine';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import { SelectTool } from '../../engine/tools/select-tool';
import { createCommand } from '../../store/commands';
import { patchLights, type LightContext, type LightView } from './kind';
import {
  DEFAULT_LIGHT,
  LIGHT_KIND,
  lightDraft,
  LIGHTS,
  LIGHTS_TOOL_ID,
  RADIUS_RANGE,
  type LightData,
  type LightDefaults,
} from './model';

export type LightState = 'idle' | 'pressing' | 'radius' | 'select';

/** Rayon de la poignée, en pixels d'écran. */
export const RADIUS_HANDLE_PX = 8;

const isLight = (e: MapEntity) => e.kind.id === LIGHT_KIND;

/** Rayon en unités depuis une distance en pixels du monde (pas d'une demi-case, sauf `free`). */
export function radiusFromDistance(px: number, ppu: number, free: boolean): number {
  const raw = px / (ppu || 50);
  const v = free
    ? Math.round(raw * 100) / 100
    : Math.round(raw / RADIUS_RANGE.step) * RADIUS_RANGE.step;
  return Math.min(RADIUS_RANGE.max, Math.max(free ? 0.1 : RADIUS_RANGE.min, v));
}

export class LightTool implements Tool {
  readonly id = LIGHTS_TOOL_ID;
  state: LightState = 'idle';
  /** Réglages des lumières posées (barre contextuelle). */
  readonly settings: StoreApi<LightDefaults> = createStore<LightDefaults>()(() => ({
    ...DEFAULT_LIGHT,
  }));
  private readonly select = new SelectTool();
  private press: MapPointer | null = null;
  /** Poignée de rayon en cours : lumière et rayon affiché (unités). */
  radiusDrag: { entity: MapEntity; radius: number; pointer: Point } | null = null;

  constructor(
    private readonly ctx: LightContext,
    private readonly view: LightView,
  ) {}

  targets(e: MapEntity): boolean {
    return isLight(e);
  }

  cursor(engine: MapEngine): string | null {
    if (this.state === 'radius') return 'ew-resize';
    if (this.state === 'select') return this.select.cursor(engine);
    if (this.hoverHandle) return 'ew-resize';
    return engine.hovered ? engine.hoverCursor() : 'crosshair';
  }

  private hoverHandle = false;

  activate(engine: MapEngine) {
    const keep = engine.selectedEntities().filter(isLight);
    if (keep.length !== engine.selection.size) engine.selection.replace(keep.map((e) => e.id));
    engine.invalidate();
  }

  deactivate(engine: MapEngine) {
    this.cancel(engine);
    this.select.deactivate(engine);
    const lights = engine.selectedEntities().filter(isLight);
    if (lights.length) engine.selection.remove(lights.map((e) => e.id));
    this.hoverHandle = false;
    if (this.root) this.root.visible = false;
    this.drawn.zoom = 0;
    engine.invalidate();
  }

  // ─── Poignée de rayon ──────────────────────────────────────────────────────

  /** Lumière seule sélectionnée, et la position de sa poignée (à l'est du cercle). */
  handle(engine: MapEngine): { entity: MapEntity; at: Point } | null {
    if (engine.selection.size !== 1) return null;
    const e = engine.entity(engine.selection.ids[0]!);
    if (!e || !isLight(e) || !e.kind.can('select', e, engine.viewer)) return null;
    const r = this.view.radiusOf(e) * engine.kindContext().pixelsPerUnit;
    return { entity: e, at: { x: e.current.x + r, y: e.current.y } };
  }

  private onHandle(engine: MapEngine, world: Point): MapEntity | null {
    const h = this.handle(engine);
    if (!h) return null;
    const tol = engine.camera.screenToWorldLength(RADIUS_HANDLE_PX + 2);
    return Math.hypot(world.x - h.at.x, world.y - h.at.y) <= tol ? h.entity : null;
  }

  // ─── Pointeur ──────────────────────────────────────────────────────────────

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    const grabbed = this.onHandle(engine, e.world);
    if (grabbed) {
      this.state = 'radius';
      this.radiusDrag = {
        entity: grabbed,
        radius: (grabbed.data as LightData).radius,
        pointer: e.world,
      };
      engine.setHovered(null);
      engine.refreshCursor();
      return true;
    }
    if (engine.hitTest(e.world)) {
      this.state = 'select';
      return this.select.down(e, engine);
    }
    this.press = e;
    this.state = 'pressing';
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    switch (this.state) {
      case 'idle': {
        if (e.buttons !== 0) return;
        const on = !!this.onHandle(engine, e.world);
        if (on !== this.hoverHandle) {
          this.hoverHandle = on;
          engine.invalidate();
        }
        this.select.move(e, engine);
        engine.refreshCursor();
        return;
      }
      case 'select':
        this.select.move(e, engine);
        return;
      case 'pressing': {
        const press = this.press;
        if (!press || !exceedsThreshold(press.screen, e.screen)) return;
        // Glisser dans le vide : lasso des gestes communs
        this.state = 'select';
        this.press = null;
        this.select.down(press, engine);
        this.select.move(e, engine);
        return;
      }
      case 'radius': {
        const drag = this.radiusDrag;
        if (!drag) return;
        const c = drag.entity.current;
        const ppu = engine.kindContext().pixelsPerUnit;
        drag.radius = radiusFromDistance(Math.hypot(e.world.x - c.x, e.world.y - c.y), ppu, e.alt);
        drag.pointer = e.world;
        this.view.setRadiusPreview({ id: drag.entity.id, radius: drag.radius });
        engine.invalidate();
        return;
      }
    }
  }

  up(e: MapPointer, engine: MapEngine) {
    const state = this.state;
    this.state = 'idle';
    switch (state) {
      case 'select':
        this.select.up(e, engine);
        break;
      case 'pressing':
        this.press = null;
        this.place(engine, e);
        break;
      case 'radius': {
        const drag = this.radiusDrag;
        this.radiusDrag = null;
        this.view.setRadiusPreview(null);
        if (drag && drag.radius !== (drag.entity.data as LightData).radius)
          void patchLights(
            this.ctx,
            [drag.entity],
            () => ({ radius: drag.radius }),
            'Rayon de la lumière',
          );
        break;
      }
    }
    engine.refreshCursor();
    engine.invalidate();
  }

  doubleClick(e: MapPointer, engine: MapEngine): boolean {
    return this.select.doubleClick(e, engine);
  }

  cancel(engine: MapEngine): boolean {
    const state = this.state;
    this.state = 'idle';
    this.press = null;
    if (state === 'select') return this.select.cancel(engine);
    if (state === 'radius') {
      this.radiusDrag = null;
      this.view.setRadiusPreview(null);
    }
    engine.invalidate();
    return state !== 'idle';
  }

  /** Pose une lumière au point (aimantation de la carte, Alt l'inverse) et la sélectionne. */
  private place(engine: MapEngine, e: MapPointer) {
    const grid = engine.snapGrid(e.alt);
    const p = grid ? snapToCellCenter(e.world, grid) : e.world;
    const pos = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    const s = engine.store.getState();
    const draft = lightDraft(s.mapId, pos, this.settings.getState());
    void engine.execute(
      createCommand({
        label: 'Poser une lumière',
        collection: LIGHTS,
        persistence: this.ctx.persistence,
        items: [draft],
      }),
    );
    engine.selection.replace([draft.id]);
  }

  // ─── Aperçu ────────────────────────────────────────────────────────────────

  private root: Container | null = null;
  private gfx: Graphics | null = null;
  private label: BitmapText | null = null;
  private readonly drawn = {
    entity: null as MapEntity | null,
    x: undefined as number | undefined,
    y: undefined as number | undefined,
    radius: 0,
    active: false,
    lasso: null as unknown,
    zoom: 0,
  };

  renderPreview(layer: Container, rc: RenderContext) {
    if (!this.root) {
      this.root = new rc.pixi.Container({ label: 'lights-tool' });
      this.gfx = new rc.pixi.Graphics();
      this.label = new rc.pixi.BitmapText({
        text: '',
        style: {
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 12,
          fill: rc.theme.foreground,
        },
      });
      this.root.addChild(this.gfx, this.label);
    }
    if (this.root.parent !== layer) layer.addChild(this.root);
    this.root.visible = true;
    // Redessiné seulement si ce qu'il montre a changé
    const h = this.handle(this.ctx.engine);
    const lasso = this.select.lasso;
    const d = this.drawn;
    const radius = h ? this.view.radiusOf(h.entity) : 0;
    if (
      d.entity === (h?.entity ?? null) &&
      d.x === h?.entity.current.x &&
      d.y === h?.entity.current.y &&
      d.radius === radius &&
      d.active === (this.state === 'radius' || this.hoverHandle) &&
      d.lasso === lasso &&
      d.zoom === rc.zoom
    )
      return;
    d.entity = h?.entity ?? null;
    d.x = h?.entity.current.x;
    d.y = h?.entity.current.y;
    d.radius = radius;
    d.active = this.state === 'radius' || this.hoverHandle;
    d.lasso = lasso;
    d.zoom = rc.zoom;
    const g = this.gfx!;
    const label = this.label!;
    g.clear();
    label.visible = false;
    const u = 1 / rc.zoom;
    const { primary, background } = rc.theme;
    // Lasso des gestes communs
    if (lasso)
      g.rect(lasso.x, lasso.y, lasso.width, lasso.height)
        .fill({ color: primary, alpha: 0.08 })
        .stroke({ width: u, color: primary, alpha: 0.9 });
    if (!h) return;
    const c = h.entity.current;
    const active = this.state === 'radius' || this.hoverHandle;
    g.moveTo(c.x, c.y).lineTo(h.at.x, h.at.y).stroke({ width: u, color: primary, alpha: 0.6 });
    g.circle(h.at.x, h.at.y, (active ? RADIUS_HANDLE_PX + 1 : RADIUS_HANDLE_PX) * u * 0.8)
      .fill({ color: background })
      .stroke({ width: 1.5 * u, color: primary });
    // Valeur du rayon, en unités
    const unit = rc.unitName;
    label.text = `${radius.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unit}`;
    label.visible = true;
    label.scale.set(u);
    label.position.set(h.at.x + 12 * u, h.at.y - 8 * u);
    g.roundRect(
      h.at.x + 8 * u,
      h.at.y - 10 * u,
      label.width + 8 * u,
      label.height + 4 * u,
      4 * u,
    ).fill({
      color: background,
      alpha: 0.85,
    });
  }
}
