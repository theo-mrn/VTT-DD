/**
 * Outil « Objets » (I, MJ ; docs/carte.md § 6 et § 10) : la bibliothèque s'affiche au-dessus
 * de la barre d'outils, et la carte garde tous les gestes de la sélection (glisser, poignées,
 * lasso) tant qu'aucun objet n'est choisi.
 *
 * | État       | Entrée                                   | Sortie                                        |
 * | ---------- | ---------------------------------------- | --------------------------------------------- |
 * | `browsing` | gestes de la sélection                   | un objet choisi dans la bibliothèque → `armed` |
 * | `armed`    | aperçu sous le pointeur (aimanté)        | bouton → `placing` ; Échap → `browsing`        |
 * | `placing`  | l'aperçu suit le pointeur                | lâcher → pose (⇧ : reste `armed`, sinon        |
 * |            |                                          | `browsing` et l'objet posé est sélectionné) ;  |
 * |            |                                          | Échap → `armed`, rien n'est posé               |
 *
 * Le glisser depuis la bibliothèque (HTML) passe par `hoverAt` et `place` : même aperçu, même
 * pose. Alt : pas d'aimantation.
 */
import type { Container, Graphics, Sprite } from 'pixi.js';
import type { RenderContext } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import { SelectTool } from '../../engine/tools/select-tool';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import { defaultObjectSize, placeObject, placementCenter, type ObjectSource } from './placement';
import { OBJECTS_TOOL_ID } from './types';

export type PlaceToolState = 'browsing' | 'armed' | 'placing';

interface Preview {
  root: Container;
  sprite: Sprite;
  frame: Graphics;
  lasso: Graphics;
  url: string | null;
  /** Ce que le cadre et le lasso dessinent déjà : rien n'est redessiné sans changement. */
  frameW: number;
  frameH: number;
  frameZoom: number;
  frameImage: boolean;
  lassoDrawn: boolean;
}

export class ObjectPlaceTool implements Tool {
  readonly id = OBJECTS_TOOL_ID;
  private readonly select = new SelectTool();
  private armedSource: ObjectSource | null = null;
  private pressed = false;
  /** Point visé (monde), réutilisé d'une image à l'autre. */
  private readonly hover: Point = { x: 0, y: 0 };
  private hovering = false;
  private snap = true;
  private preview: Preview | null = null;
  private readonly listeners = new Set<() => void>();

  get state(): PlaceToolState {
    if (!this.armedSource) return 'browsing';
    return this.pressed ? 'placing' : 'armed';
  }

  /** Objet choisi dans la bibliothèque (null : aucun). */
  get source(): ObjectSource | null {
    return this.armedSource;
  }

  /** Abonnement de la bibliothèque (carte choisie). */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSource = (): ObjectSource | null => this.armedSource;

  private changed() {
    for (const l of this.listeners) l();
  }

  /** Choisit un objet à poser : clic sur la carte (ou glisser) pour le poser. */
  arm(source: ObjectSource, engine: MapEngine) {
    this.select.cancel(engine);
    engine.setHovered(null);
    this.armedSource = source;
    this.pressed = false;
    this.changed();
    engine.refreshCursor();
    engine.invalidate();
  }

  /** Plus d'objet choisi : retour aux gestes de la sélection. */
  disarm(engine: MapEngine) {
    if (!this.armedSource && !this.pressed) return;
    this.armedSource = null;
    this.pressed = false;
    this.hovering = false;
    if (this.preview) this.preview.root.visible = false;
    this.changed();
    engine.refreshCursor();
    engine.invalidate();
  }

  /** Les proportions de l'image sont connues (image chargée) : la taille par défaut les suit. */
  learnAspect(key: string, aspect: number) {
    const s = this.armedSource;
    if (!s || s.key !== key || s.aspect || !(aspect > 0)) return;
    this.armedSource = { ...s, aspect };
    this.changed();
  }

  /** Point visé hors des événements de la carte (glisser depuis la bibliothèque) ; null : ailleurs. */
  hoverAt(world: Point | null, engine: MapEngine, opts: { snap?: boolean } = {}) {
    this.hovering = world !== null;
    if (world) {
      this.hover.x = world.x;
      this.hover.y = world.y;
    }
    this.snap = opts.snap ?? true;
    engine.invalidate();
  }

  /** Pose l'objet choisi en ce point ; `keep` : il reste choisi (⇧). */
  place(world: Point, engine: MapEngine, opts: { snap: boolean; keep?: boolean }): string | null {
    const source = this.armedSource;
    if (!source) return null;
    const id = placeObject(engine, source, world, { snap: opts.snap });
    if (!opts.keep) this.disarm(engine);
    else engine.invalidate();
    return id;
  }

  // ─── Événements de la carte ────────────────────────────────────────────────

  cursor(engine: MapEngine): string | null {
    return this.armedSource ? 'crosshair' : this.select.cursor(engine);
  }

  deactivate(engine: MapEngine) {
    this.select.deactivate(engine);
    this.disarm(engine);
    this.hovering = false;
    if (this.preview) {
      this.preview.root.visible = false;
      this.preview.lasso.clear();
      this.preview.lassoDrawn = false;
    }
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (!this.armedSource) return this.select.down(e, engine);
    if (e.button !== 0) return false;
    this.pressed = true;
    this.hoverAt(e.world, engine, { snap: !e.alt });
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    if (!this.armedSource) {
      this.select.move(e, engine);
      return;
    }
    this.hoverAt(e.world, engine, { snap: !e.alt });
  }

  up(e: MapPointer, engine: MapEngine) {
    if (!this.armedSource) {
      this.select.up(e, engine);
      return;
    }
    if (!this.pressed) return;
    this.pressed = false;
    this.place(e.world, engine, { snap: !e.alt, keep: e.shift });
  }

  doubleClick(e: MapPointer, engine: MapEngine): boolean {
    // Objet choisi : deux clics rapprochés posent deux objets (⇧), pas d'inspecteur
    if (this.armedSource) return false;
    return this.select.doubleClick(e, engine);
  }

  cancel(engine: MapEngine): boolean {
    if (this.pressed) {
      this.pressed = false;
      engine.invalidate();
      return true;
    }
    if (this.armedSource) {
      this.disarm(engine);
      return true;
    }
    return this.select.cancel(engine);
  }

  // ─── Aperçu ────────────────────────────────────────────────────────────────

  renderPreview(layer: Container, ctx: RenderContext) {
    const p = (this.preview ??= this.createPreview(layer, ctx));

    // Lasso de la sélection (le rendu ne le dessine que pour l'outil de sélection)
    const lasso = this.select.lasso;
    if (lasso) {
      const px = 1 / ctx.zoom;
      p.lasso
        .clear()
        .rect(lasso.x, lasso.y, lasso.width, lasso.height)
        .fill({ color: ctx.theme.primary, alpha: 0.08 })
        .stroke({ width: px, color: ctx.theme.primary, alpha: 0.9 });
      p.lassoDrawn = true;
    } else if (p.lassoDrawn) {
      p.lasso.clear();
      p.lassoDrawn = false;
    }

    const source = this.armedSource;
    if (!source || !this.hovering) {
      p.root.visible = false;
      return;
    }
    const size = defaultObjectSize(ctx.pixelsPerUnit, source.aspect);
    const grid = this.snap && ctx.pixelsPerUnit > 0 ? { size: ctx.pixelsPerUnit } : null;
    const c = placementCenter(this.hover, size, grid);
    p.root.visible = true;
    p.root.position.set(c.x, c.y);

    if (p.url !== source.imageUrl) {
      p.url = source.imageUrl;
      p.sprite.visible = false;
      if (source.imageUrl) {
        const url = source.imageUrl;
        const key = source.key;
        void ctx.texture(url).then(
          (t) => {
            if (!this.preview || this.preview.url !== url || p.sprite.destroyed) return;
            p.sprite.texture = t;
            p.sprite.visible = true;
            const w = t.orig?.width ?? t.width;
            const h = t.orig?.height ?? t.height;
            if (w > 0 && h > 0) this.learnAspect(key, w / h);
            ctx.invalidate();
          },
          () => undefined,
        );
      }
    }
    if (p.sprite.visible && (p.sprite.width !== size.width || p.sprite.height !== size.height))
      p.sprite.setSize(size.width, size.height);
    const image = source.imageUrl !== '';
    if (
      p.frameW !== size.width ||
      p.frameH !== size.height ||
      p.frameZoom !== ctx.zoom ||
      p.frameImage !== image
    ) {
      p.frameW = size.width;
      p.frameH = size.height;
      p.frameZoom = ctx.zoom;
      p.frameImage = image;
      const px = 1 / ctx.zoom;
      p.frame
        .clear()
        .rect(-size.width / 2, -size.height / 2, size.width, size.height)
        .fill({ color: ctx.theme.primary, alpha: image ? 0.04 : 0.12 })
        .stroke({ width: 1.5 * px, color: ctx.theme.primary, alpha: 0.9 });
    }
    p.root.alpha = this.pressed ? 0.85 : 0.65;
  }

  private createPreview(layer: Container, ctx: RenderContext): Preview {
    const { pixi } = ctx;
    const root = new pixi.Container({ label: 'object-preview' });
    const sprite = new pixi.Sprite();
    sprite.anchor.set(0.5);
    sprite.visible = false;
    const frame = new pixi.Graphics({ label: 'object-preview-frame' });
    root.addChild(sprite, frame);
    root.visible = false;
    const lasso = new pixi.Graphics({ label: 'object-lasso' });
    layer.addChild(lasso, root);
    return {
      root,
      sprite,
      frame,
      lasso,
      url: null,
      frameW: 0,
      frameH: 0,
      frameZoom: 0,
      frameImage: false,
      lassoDrawn: false,
    };
  }
}
