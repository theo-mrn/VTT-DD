/**
 * Gestes du MJ sur la mémoire de l'exploration (docs/exploration.md § 5.4), depuis l'outil
 * Brouillard : marquer une zone comme déjà vue ou la faire oublier, et la mémoire surlignée
 * pendant ces gestes. Chaque geste est une commande annulable.
 */
import type { Container, Sprite, Texture } from 'pixi.js';
import { rasterizeShape, type ExplorationShape } from '@vtt/vision';
import type { RenderContext } from '@/lib/map/engine/entities/entity-kind';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { shapeCommand, type EditOp } from './commands';
import { MaskTexture } from './mask-texture';
import type { ExplorationModel } from './model';
import { explorationModuleOf } from './register';

export type { EditOp } from './commands';
export type { ExplorationShape } from '@vtt/vision';

/** Opacité de la mémoire surlignée, pendant un geste sur elle. */
export const HIGHLIGHT_ALPHA = 0.28;

export const invertOp = (op: EditOp): EditOp => (op === 'reveal' ? 'forget' : 'reveal');

/** La mémoire de la scène affichée est allumée (sinon : pas de geste sur elle). */
export function memoryEnabled(engine: MapEngine): boolean {
  return explorationModuleOf(engine)?.model.enabled ?? false;
}

/**
 * Prête à recevoir un geste du MJ : allumée, et un masque connu (avant toute exploration du
 * groupe, un masque vide à la grille de la scène).
 */
export function memoryReady(engine: MapEngine): boolean {
  const m = explorationModuleOf(engine);
  return Boolean(m?.model.enabled && m.model.ensureMask());
}

/** Marque comme vues ou fait oublier les cases d'une forme : une commande, si elle change. */
export function editMemory(engine: MapEngine, shape: ExplorationShape, op: EditOp): boolean {
  const m = explorationModuleOf(engine);
  if (!m?.api || !m.model.ensureMask()) return false;
  const bounds = m.model.bounds();
  if (!bounds || !m.model.active) return false;
  const win = rasterizeShape(m.model, bounds, shape);
  if (!win) return false;
  const cmd = shapeCommand(m.model, m.api, op, win);
  if (!cmd) return false;
  void engine.execute(cmd);
  return true;
}

/** La mémoire du groupe, teintée de la couleur primaire, sous l'aperçu d'un geste. */
export class MemoryHighlight {
  private sprite: Sprite | null = null;
  private texture: { mask: MaskTexture; texture: Texture } | null = null;

  /** Dessine (ou cache) la surbrillance dans `root`, au fond. */
  render(root: Container, rc: RenderContext, engine: MapEngine, shown: boolean) {
    const model: ExplorationModel | undefined = explorationModuleOf(engine)?.model;
    const bounds = model?.bounds();
    if (!shown || !model || !bounds || !model.active) {
      if (this.sprite) this.sprite.visible = false;
      return;
    }
    if (!this.texture) {
      const mask = new MaskTexture(rc.pixi);
      this.texture = { mask, texture: new rc.pixi.Texture({ source: mask.textureSource }) };
    }
    const t = this.texture;
    if (t.mask.sync(model)) {
      t.texture.destroy();
      t.texture = new rc.pixi.Texture({ source: t.mask.textureSource });
    }
    if (!this.sprite) {
      this.sprite = new rc.pixi.Sprite(t.texture);
      this.sprite.label = 'exploration:highlight';
      this.sprite.alpha = HIGHLIGHT_ALPHA;
    }
    const s = this.sprite;
    if (s.texture !== t.texture) s.texture = t.texture;
    s.tint = rc.theme.primary;
    s.visible = true;
    s.position.set(0, 0);
    s.width = bounds.width;
    s.height = bounds.height;
    if (s.parent !== root) root.addChildAt(s, 0);
  }

  hide() {
    if (this.sprite) this.sprite.visible = false;
  }

  destroy() {
    this.sprite?.destroy();
    this.texture?.texture.destroy();
    this.texture?.mask.destroy();
    this.sprite = null;
    this.texture = null;
  }
}
