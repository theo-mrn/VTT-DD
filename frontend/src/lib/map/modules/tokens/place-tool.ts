/**
 * Outil « Personnages » (A, MJ) : la bibliothèque des PNJ est ouverte tant qu'il est actif.
 *
 * | État      | Entrée                                             | Sortie                                    |
 * | --------- | -------------------------------------------------- | ----------------------------------------- |
 * | `idle`    | gestes de l'outil sélection (clic, glisser, lasso) | carte de la bibliothèque choisie → `armed` |
 * | `armed`   | fantômes sous le pointeur (N exemplaires, grille)  | clic → pose (`placing`) ; Échap → `idle`  |
 * | `placing` | appel au serveur ; les fantômes sont des brouillons | réponse → `idle` (⇧ au clic : `armed`)   |
 *
 * Sans carte armée, l'outil se comporte comme la sélection : on range ses PNJ sans quitter la
 * bibliothèque. Chiffres 1 à 9 (0 : 10) pendant qu'une carte est armée : nombre d'exemplaires.
 * Un glisser depuis la bibliothèque passe par `hoverAt` (fantôme) et `dropAt` (pose).
 */
import type { Container, Graphics } from 'pixi.js';
import type { RenderContext } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import type { MapEngine } from '../../engine/map-engine';
import { SelectTool } from '../../engine/tools/select-tool';
import type { MapKey, MapPointer, Tool } from '../../engine/tools/tool';
import { cellSize, clampCount, gridAround } from './model';
import { placeArmed, snapPlacement } from './placement';
import { sideColor } from './render';
import type { PlacementSource, TokensState } from './state';

export const TOKENS_TOOL_ID = 'tokens';

export type PlaceToolState = 'idle' | 'armed' | 'placing';

export class TokenPlaceTool implements Tool {
  readonly id = TOKENS_TOOL_ID;
  /** Gestes communs quand rien n'est armé. */
  readonly select = new SelectTool();
  /** Point du monde sous le pointeur (fantôme), ou null hors de la carte. */
  hover: Point | null = null;
  /** Alt tenu : pas d'aimantation. */
  private free = false;
  /** Le bouton pressé a posé : son lâcher ne va pas à la sélection. */
  private pressedToPlace = false;
  private ghost: Graphics | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly tokens: TokensState) {}

  get state(): PlaceToolState {
    const lib = this.tokens.library.getState();
    if (lib.placing) return 'placing';
    return lib.armed ? 'armed' : 'idle';
  }

  /** Arme une carte de la bibliothèque (clic sur la carte ensuite). */
  arm(source: PlacementSource | null) {
    this.tokens.library.setState({ armed: source });
  }

  cursor(engine: MapEngine): string | null {
    switch (this.state) {
      case 'placing':
        return 'progress';
      case 'armed':
        return 'copy';
      default:
        return this.select.cursor(engine);
    }
  }

  activate(engine: MapEngine) {
    this.unsubscribe?.();
    this.unsubscribe = this.tokens.library.subscribe((s, prev) => {
      if (s.armed !== prev.armed || s.placing !== prev.placing || s.count !== prev.count) {
        engine.refreshCursor();
        engine.invalidate();
      }
    });
  }

  deactivate(engine: MapEngine) {
    this.select.deactivate(engine);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.hover = null;
    this.pressedToPlace = false;
    this.tokens.library.setState({ armed: null });
    this.ghost?.clear();
    engine.invalidate();
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    const state = this.state;
    if (state === 'idle') return this.select.down(e, engine);
    if (e.button !== 0) return false;
    this.pressedToPlace = true;
    if (state === 'armed') {
      this.hover = e.world;
      void placeArmed(this.tokens, e.world, { snap: !e.alt, keepArmed: e.shift });
    }
    // Pose en cours : le clic est pris, sans rien faire
    return true;
  }

  move(e: MapPointer, engine: MapEngine) {
    this.free = e.alt;
    if (this.pressedToPlace || this.state !== 'idle') {
      this.hoverAt(e.world, engine, e.alt);
      return;
    }
    this.select.move(e, engine);
  }

  up(e: MapPointer, engine: MapEngine) {
    if (this.pressedToPlace) {
      this.pressedToPlace = false;
      return;
    }
    this.select.up(e, engine);
  }

  doubleClick(e: MapPointer, engine: MapEngine): boolean {
    if (this.state !== 'idle') return true;
    return this.select.doubleClick(e, engine);
  }

  key(k: MapKey): boolean {
    if (this.state !== 'armed' || k.ctrl || k.meta || k.alt) return false;
    const m = /^(?:Digit|Numpad)(\d)$/.exec(k.code);
    if (!m) return false;
    const n = Number(m[1]);
    this.tokens.library.setState({ count: clampCount(n === 0 ? 10 : n) });
    return true;
  }

  cancel(engine: MapEngine): boolean {
    if (this.state === 'armed') {
      this.arm(null);
      this.ghost?.clear();
      engine.invalidate();
      return true;
    }
    if (this.state === 'placing') return true;
    return this.select.cancel(engine);
  }

  /** Fantôme au point du monde (pointeur, ou glisser depuis la bibliothèque). */
  hoverAt(world: Point | null, engine: MapEngine, free = false) {
    this.hover = world;
    this.free = free;
    engine.invalidate();
  }

  /** Dépôt d'une carte glissée depuis la bibliothèque : elle est posée là. */
  dropAt(source: PlacementSource, world: Point, opts: { free?: boolean } = {}) {
    if (this.state === 'placing') return null;
    this.arm(source);
    this.hover = null;
    return placeArmed(this.tokens, world, { snap: !opts.free });
  }

  renderPreview(layer: Container, ctx: RenderContext) {
    const lib = this.tokens.library.getState();
    const armed = lib.armed && !lib.placing ? lib.armed : null;
    let g = this.ghost;
    if (!g || g.destroyed) {
      g = new ctx.pixi.Graphics({ label: 'pose-pnj' });
      this.ghost = g;
    }
    if (g.parent !== layer) layer.addChild(g);
    g.clear();
    // Lasso de la sélection (outil sélection embarqué)
    const lasso = this.select.lasso;
    const px = 1 / Math.max(ctx.zoom, 1e-6);
    if (lasso)
      g.rect(lasso.x, lasso.y, lasso.width, lasso.height)
        .fill({ color: ctx.theme.primary, alpha: 0.08 })
        .stroke({ width: px, color: ctx.theme.primary, alpha: 0.9 });
    if (!armed || !this.hover) return;
    const count = clampCount(lib.count);
    const engine = this.tokens.engine;
    const center = snapPlacement(this.hover, count, ctx, engine.snapGrid(this.free));
    const step = cellSize(ctx);
    const color = sideColor(ctx.theme, lib.side);
    for (const p of gridAround(center, count, step)) {
      const r = step / 2;
      if (lib.shape === 'square') g.roundRect(p.x - r, p.y - r, r * 2, r * 2, r * 0.18);
      else g.circle(p.x, p.y, r);
      g.fill({ color: ctx.theme.background, alpha: 0.35 }).stroke({
        width: Math.max(2 * px, step * 0.05),
        color,
        alpha: 0.9,
      });
    }
  }

  /** Libère le fantôme (démontage du module). */
  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.ghost && !this.ghost.destroyed) {
      this.ghost.removeFromParent();
      this.ghost.destroy();
    }
    this.ghost = null;
  }
}
