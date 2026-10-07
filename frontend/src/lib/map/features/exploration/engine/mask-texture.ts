/**
 * Texture Pixi de la mémoire de l'exploration : un texel par case (RGBA, 255 si explorée),
 * filtrage linéaire (bord adouci sur une case), refaite seulement quand la révision de la mémoire
 * change. Le rendu de la visibilité la lit dans son shader de composition ; l'outil du MJ la
 * montre en surlignage. Aucune allocation tant que la grille ne change pas.
 */
import type * as Pixi from 'pixi.js';
import type { MemorySource } from './model';

export class MaskTexture {
  private source: Pixi.BufferImageSource;
  private data: Uint8Array;
  private revision = -1;
  private cols = 1;
  private rows = 1;

  constructor(private readonly pixi: typeof Pixi) {
    this.data = new Uint8Array(4);
    this.source = this.makeSource(1, 1);
  }

  private makeSource(width: number, height: number): Pixi.BufferImageSource {
    return new this.pixi.BufferImageSource({
      resource: this.data,
      width,
      height,
      format: 'rgba8unorm',
      scaleMode: 'linear',
      autoGenerateMipmaps: false,
    });
  }

  /** Source GPU actuelle (elle change quand la grille change : relire après `sync`). */
  get textureSource(): Pixi.TextureSource {
    return this.source;
  }

  /**
   * Met la texture à jour depuis la mémoire ; renvoie vrai si la source a été remplacée (grille
   * changée : le shader doit la reprendre).
   */
  sync(memory: MemorySource): boolean {
    if (memory.revision === this.revision) return false;
    this.revision = memory.revision;
    const cols = Math.max(1, memory.cols);
    const rows = Math.max(1, memory.rows);
    let replaced = false;
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.data = new Uint8Array(cols * rows * 4);
      const old = this.source;
      this.source = this.makeSource(cols, rows);
      old.destroy();
      replaced = true;
    }
    if (memory.active) memory.write(this.data);
    else this.data.fill(0);
    this.source.update();
    return replaced;
  }

  /** Oublie la révision vue (contexte WebGL restauré : tout est renvoyé au GPU). */
  invalidate() {
    this.revision = -1;
  }

  destroy() {
    this.source.destroy();
  }
}
