/**
 * Outil de pose d'un point à rayon (lumières, zones sonores) : une machine à états commune,
 * testée sans rendu. Chaque outil ne dit que ce qui lui est propre : les entités qu'il vise,
 * comment il lit, montre et enregistre leur rayon (toujours en unités ici), et comment il pose.
 *
 * | État       | Entrée                                        | Sortie                                    |
 * | ---------- | --------------------------------------------- | ----------------------------------------- |
 * | `idle`     | bouton sur la poignée de rayon → `radius`     | bouton sur une entité : gestes communs    |
 * |            | bouton dans le vide → `pressing`              |                                           |
 * | `pressing` | +4 px : lasso (gestes communs)                | lâcher : une entité posée                 |
 * | `radius`   | rayon en unités (pas de l'outil ; Alt : libre), affiché | lâcher : une commande ; Échap : rien |
 * | `select`   | clic, glisser, lasso (gestes communs, entités de l'outil) | lâcher                          |
 *
 * La poignée de rayon est aussi prêtée à l'outil sélection (`lend`) : une entité seule
 * sélectionnée avec V se règle de la même façon, sans changer d'outil.
 */
import type { BitmapText, Container, Graphics } from 'pixi.js';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { RenderContext } from '@/lib/map/engine/entities/entity-kind';
import type { Point } from '@/lib/map/engine/geometry';
import { exceedsThreshold } from '@/lib/map/engine/interaction/drag';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { formatDistance } from '@/lib/map/engine/distance';
import { SelectTool } from './select-tool';
import type { LentHandles, MapPointer, Tool } from './tool';

export type RadiusToolState = 'idle' | 'pressing' | 'radius' | 'select';

/** Rayon de la poignée, en pixels d'écran. */
export const RADIUS_HANDLE_PX = 8;

export abstract class RadiusTool<S extends object> implements Tool {
  abstract readonly id: string;
  state: RadiusToolState = 'idle';
  /** Réglages des entités posées (barre contextuelle). */
  readonly settings: StoreApi<S>;
  private readonly select = new SelectTool();
  private press: MapPointer | null = null;
  private hoverHandle = false;
  /** Poignée de rayon en cours : entité et rayon affiché (unités). */
  radiusDrag: { entity: MapEntity; radius: number; pointer: Point } | null = null;

  constructor(
    defaults: S,
    /** Nom du conteneur d'aperçu (outils de développement). */
    private readonly previewName: string,
  ) {
    this.settings = createStore<S>()(() => ({ ...defaults }));
  }

  /** Entités de l'outil. */
  protected abstract isTarget(e: MapEntity): boolean;
  /** Rayon affiché d'une entité, en unités (aperçu en cours compris). */
  protected abstract radiusOf(e: MapEntity, ppu: number): number;
  /** Rayon enregistré d'une entité, en unités. */
  protected abstract storedRadius(e: MapEntity, ppu: number): number;
  /** Rayon en unités depuis une distance en pixels du monde (pas de l'outil, sauf `free`). */
  protected abstract radiusFromDistance(px: number, ppu: number, free: boolean): number;
  /** Aperçu du rayon pendant la poignée (null : fin de l'aperçu). */
  protected abstract previewRadius(p: { id: string; radius: number } | null, ppu: number): void;
  /** Enregistre le nouveau rayon (unités), s'il a changé. */
  protected abstract commitRadius(entity: MapEntity, radius: number, ppu: number): void;
  /** Pose une entité au point et la sélectionne. */
  protected abstract place(engine: MapEngine, e: MapPointer): void;

  private ppu(engine: MapEngine): number {
    return engine.kindContext().pixelsPerUnit || 50;
  }

  targets(e: MapEntity): boolean {
    return this.isTarget(e);
  }

  cursor(engine: MapEngine): string | null {
    if (this.state === 'radius') return 'ew-resize';
    if (this.state === 'select') return this.select.cursor(engine);
    if (this.hoverHandle) return 'ew-resize';
    return engine.hovered ? engine.hoverCursor() : 'crosshair';
  }

  activate(engine: MapEngine) {
    const keep = engine.selectedEntities().filter((e) => this.isTarget(e));
    if (keep.length !== engine.selection.size) engine.selection.replace(keep.map((e) => e.id));
    engine.invalidate();
  }

  deactivate(engine: MapEngine) {
    this.cancel(engine);
    this.select.deactivate(engine);
    const own = engine.selectedEntities().filter((e) => this.isTarget(e));
    if (own.length) engine.selection.remove(own.map((e) => e.id));
    this.hoverHandle = false;
    if (this.root) this.root.visible = false;
    this.drawn.zoom = 0;
    engine.invalidate();
  }

  // ─── Poignée de rayon ──────────────────────────────────────────────────────

  /** Entité seule sélectionnée, et la position de sa poignée (à l'est du cercle). */
  handle(engine: MapEngine): { entity: MapEntity; at: Point } | null {
    if (engine.selection.size !== 1) return null;
    const e = engine.entity(engine.selection.ids[0]!);
    if (!e || !this.isTarget(e) || !e.kind.can('select', e, engine.viewer)) return null;
    const ppu = this.ppu(engine);
    const r = this.radiusOf(e, ppu) * ppu;
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
    if (this.startRadius(e, engine)) return true;
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
        this.hoverRadius(e, engine);
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
      case 'radius':
        this.moveRadius(e, engine);
        return;
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
      case 'radius':
        this.endRadius(engine, true);
        break;
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
    if (state === 'radius') this.endRadius(engine, false);
    engine.invalidate();
    return state !== 'idle';
  }

  // ─── Geste de la poignée (cet outil, ou prêté à l'outil sélection) ─────────

  /** Bouton sur la poignée : le rayon se règle (vrai), sinon rien. */
  private startRadius(e: MapPointer, engine: MapEngine): boolean {
    const grabbed = this.onHandle(engine, e.world);
    if (!grabbed) return false;
    this.state = 'radius';
    this.radiusDrag = {
      entity: grabbed,
      radius: this.storedRadius(grabbed, this.ppu(engine)),
      pointer: e.world,
    };
    engine.setHovered(null);
    engine.refreshCursor();
    return true;
  }

  private moveRadius(e: MapPointer, engine: MapEngine) {
    const drag = this.radiusDrag;
    if (!drag) return;
    const c = drag.entity.current;
    const ppu = this.ppu(engine);
    drag.radius = this.radiusFromDistance(Math.hypot(e.world.x - c.x, e.world.y - c.y), ppu, e.alt);
    drag.pointer = e.world;
    this.previewRadius({ id: drag.entity.id, radius: drag.radius }, ppu);
    engine.invalidate();
  }

  /** Fin du geste : le rayon est enregistré (`commit`), ou l'aperçu simplement retiré. */
  private endRadius(engine: MapEngine, commit: boolean) {
    const drag = this.radiusDrag;
    this.radiusDrag = null;
    this.state = 'idle';
    this.previewRadius(null, this.ppu(engine));
    if (commit && drag) this.commitRadius(drag.entity, drag.radius, this.ppu(engine));
  }

  private hoverRadius(e: MapPointer, engine: MapEngine) {
    const on = !!this.onHandle(engine, e.world);
    if (on === this.hoverHandle) return;
    this.hoverHandle = on;
    engine.invalidate();
  }

  /** La poignée de rayon, prêtée à l'outil sélection (V). */
  readonly lend: LentHandles = {
    down: (e, engine) => e.button === 0 && this.startRadius(e, engine),
    move: (e, engine) => this.moveRadius(e, engine),
    up: (_e, engine) => {
      this.endRadius(engine, true);
      engine.refreshCursor();
      engine.invalidate();
    },
    cancel: (engine) => {
      this.endRadius(engine, false);
      engine.invalidate();
    },
    hover: (e, engine) => this.hoverRadius(e, engine),
    cursor: () => (this.state === 'radius' || this.hoverHandle ? 'ew-resize' : null),
    render: (layer, rc) => this.renderPreview(layer, rc),
    hide: () => {
      this.hoverHandle = false;
      if (this.root) this.root.visible = false;
      this.drawn.zoom = 0;
    },
  };

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

  /** Moteur de la carte, pour l'aperçu (la poignée y est lue). */
  protected abstract engineOf(): MapEngine;

  renderPreview(layer: Container, rc: RenderContext) {
    if (!this.root) {
      this.root = new rc.pixi.Container({ label: this.previewName });
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
    const h = this.handle(this.engineOf());
    const lasso = this.select.lasso;
    const d = this.drawn;
    const radius = h ? this.radiusOf(h.entity, rc.pixelsPerUnit || 50) : 0;
    const active = this.state === 'radius' || this.hoverHandle;
    if (
      d.entity === (h?.entity ?? null) &&
      d.x === h?.entity.current.x &&
      d.y === h?.entity.current.y &&
      d.radius === radius &&
      d.active === active &&
      d.lasso === lasso &&
      d.zoom === rc.zoom
    )
      return;
    d.entity = h?.entity ?? null;
    d.x = h?.entity.current.x;
    d.y = h?.entity.current.y;
    d.radius = radius;
    d.active = active;
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
    g.moveTo(c.x, c.y).lineTo(h.at.x, h.at.y).stroke({ width: u, color: primary, alpha: 0.6 });
    g.circle(h.at.x, h.at.y, (active ? RADIUS_HANDLE_PX + 1 : RADIUS_HANDLE_PX) * u * 0.8)
      .fill({ color: background })
      .stroke({ width: 1.5 * u, color: primary });
    // Valeur du rayon : cases × distance par case
    label.text = formatDistance(radius, rc, 2);
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
