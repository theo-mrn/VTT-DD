/**
 * Rendu Pixi de la météo (docs/carte.md § 10, Météo), dans le plan `weather`.
 *
 * - Le conteneur racine annule la caméra : ses enfants sont en pixels d'écran (CSS).
 * - Du bas vers le haut : voile, nappes (`TilingSprite`), un `ParticleContainer` par émetteur
 *   (particules de la simulation, sans copie), grain et trames, bandes, vignette, éclair.
 * - Les objets Pixi sont créés au montage ou au changement d'effet ; à chaque image, seules des
 *   propriétés changent (positions, opacités, tailles) : aucune allocation.
 * - Ni filtre, ni mode de fusion avancé : 8 appels de dessin au plus.
 */
import type * as Pixi from 'pixi.js';
import type { Container, ParticleContainer, Sprite, TilingSprite } from 'pixi.js';
import { destroyDisplay } from '../../engine/destroy-display';
import { MAX_BANDS, type EmitterState, type WeatherSim } from './simulation';
import { createWeatherTextures, type WeatherTextures } from './textures';

export interface WeatherCamera {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
}

export class WeatherRenderer {
  private readonly root: Container;
  private readonly textures: WeatherTextures;
  private readonly veil: Sprite;
  private readonly mists: TilingSprite[] = [];
  private readonly particles: Container;
  private containers: ParticleContainer[] = [];
  private readonly grain: TilingSprite;
  private readonly scanlines: TilingSprite;
  private readonly bands: Sprite[] = [];
  private readonly vignette: Sprite;
  private readonly flash: Sprite;
  private structure = -1;
  private width = 0;
  private height = 0;

  constructor(
    private readonly pixi: typeof Pixi,
    plane: Container,
    /** Textures faites une fois (canevas 2D) ; données par les tests, sans DOM. */
    textures?: WeatherTextures,
  ) {
    this.textures = textures ?? createWeatherTextures(pixi);
    const { Container, Sprite, Texture, TilingSprite } = pixi;
    this.root = new Container({ label: 'weather' });
    this.root.visible = false;
    this.veil = new Sprite({ texture: Texture.WHITE, label: 'weather:veil' });
    this.particles = new Container({ label: 'weather:particles' });
    this.grain = new TilingSprite({ texture: this.textures.grain, label: 'weather:grain' });
    this.grain.tileScale.set(2.5);
    this.grain.tint = 0xb4b9be;
    this.scanlines = new TilingSprite({
      texture: this.textures.scanlines,
      label: 'weather:scanlines',
    });
    this.scanlines.tint = 0x969ba0;
    for (let i = 0; i < MAX_BANDS; i++) {
      const band = new Sprite({ texture: Texture.WHITE, label: 'weather:band' });
      band.tint = 0xb4b9be;
      this.bands.push(band);
    }
    this.vignette = new Sprite({ texture: this.textures.vignette, label: 'weather:vignette' });
    this.flash = new Sprite({ texture: Texture.WHITE, label: 'weather:flash' });
    // Deux nappes au plus par effet
    for (let i = 0; i < 2; i++)
      this.mists.push(new TilingSprite({ texture: this.textures.mist, label: 'weather:mist' }));
    this.root.addChild(
      this.veil,
      ...this.mists,
      this.particles,
      this.grain,
      this.scanlines,
      ...this.bands,
      this.vignette,
      this.flash,
    );
    plane.addChild(this.root);
  }

  /** Recrée les conteneurs de particules quand les émetteurs changent (nouvel effet). */
  private syncStructure(sim: WeatherSim) {
    if (sim.structure === this.structure) return;
    this.structure = sim.structure;
    this.dropContainers();
    this.containers = sim.emitters.map((e) => this.containerFor(e));
    for (const c of this.containers) this.particles.addChild(c);
  }

  /**
   * Détruit les conteneurs de particules (pas leurs particules, ni l'atlas). À part de
   * `destroyDisplay` : `ParticleContainer.removeChildren()` lève une erreur.
   */
  private dropContainers() {
    for (const c of this.containers) {
      c.particleChildren = [];
      c.removeFromParent();
      c.destroy();
    }
    this.containers = [];
  }

  private containerFor(e: EmitterState): ParticleContainer {
    const spec = e.spec;
    const c = new this.pixi.ParticleContainer({
      label: `weather:${spec.id}`,
      texture: this.textures.atlas[spec.frames[0] ?? 'dot'],
      dynamicProperties: {
        position: true,
        rotation: spec.spin !== undefined,
        vertex: spec.flip !== undefined || spec.life !== undefined,
        color: spec.flicker !== undefined || spec.life !== undefined,
        uvs: false,
      },
    });
    c.blendMode = spec.blend === 'add' ? 'add' : 'normal';
    c.particleChildren = e.particles;
    e.staticDirty = true;
    return c;
  }

  /** Une image : la météo de la simulation, à la place de la caméra. */
  draw(sim: WeatherSim, cam: WeatherCamera) {
    const root = this.root;
    if (!sim.active) {
      if (root.visible) root.visible = false;
      return;
    }
    root.visible = true;
    // Le conteneur annule la caméra : ses enfants sont en pixels d'écran
    const z = cam.zoom || 1;
    root.scale.set(1 / z);
    root.position.set(cam.x - cam.width / (2 * z), cam.y - cam.height / (2 * z));
    if (cam.width !== this.width || cam.height !== this.height) {
      this.width = cam.width;
      this.height = cam.height;
      this.resize(cam.width, cam.height);
    }

    this.syncStructure(sim);
    const atlas = this.textures.atlas;
    const emitters = sim.emitters;
    for (let i = 0; i < emitters.length; i++) {
      const e = emitters[i]!;
      const c = this.containers[i];
      if (!c) continue;
      if (c.particleChildren !== e.particles) c.particleChildren = e.particles;
      c.visible = e.particles.length > 0;
      if (e.staticDirty) {
        // Nouvelles particules, nouveau vent : textures et propriétés fixes renvoyées une fois
        for (const p of e.particles) p.texture = atlas[p.frame];
        c.update();
        e.staticDirty = false;
      }
    }

    const f = sim.frame;
    this.veil.visible = f.veil.alpha > 0.001;
    this.veil.tint = f.veil.color;
    this.veil.alpha = f.veil.alpha;

    for (let i = 0; i < this.mists.length; i++) {
      const mist = this.mists[i]!;
      const m = f.mists[i];
      mist.visible = !!m && m.alpha > 0.001;
      if (!m || !mist.visible) continue;
      mist.tint = m.color;
      mist.alpha = m.alpha;
      mist.tileScale.set(m.scale);
      mist.tilePosition.set(m.x, m.y);
    }

    this.grain.visible = f.noise.alpha > 0.001;
    this.grain.alpha = f.noise.alpha;
    this.grain.tilePosition.set(f.noise.x, f.noise.y);
    this.scanlines.visible = f.scanlines.alpha > 0.001;
    this.scanlines.alpha = f.scanlines.alpha;
    this.scanlines.tilePosition.set(0, f.scanlines.y);
    for (let i = 0; i < this.bands.length; i++) {
      const band = this.bands[i]!;
      const b = f.bands[i]!;
      band.visible = i < f.bandCount;
      if (!band.visible) continue;
      band.position.set(b.shift, b.y);
      band.width = cam.width;
      band.height = b.h;
      band.alpha = b.alpha;
    }

    this.vignette.visible = f.vignette.alpha > 0.001;
    this.vignette.tint = f.vignette.color;
    this.vignette.alpha = f.vignette.alpha;
    this.flash.visible = f.flash.alpha > 0.001;
    this.flash.tint = f.flash.color;
    this.flash.alpha = f.flash.alpha;
  }

  /** Taille de la vue : les couches pleines la couvrent. */
  private resize(w: number, h: number) {
    for (const s of [this.veil, this.vignette, this.flash]) {
      s.width = w;
      s.height = h;
    }
    for (const t of [...this.mists, this.grain, this.scanlines]) {
      t.width = w;
      t.height = h;
    }
    const bounds = new this.pixi.Rectangle(0, 0, w, h);
    for (const c of this.containers) c.boundsArea = bounds;
  }

  /** Contexte WebGL restauré : les textures de canevas sont renvoyées au GPU. */
  restore() {
    for (const t of [
      ...Object.values(this.textures.atlas),
      this.textures.mist,
      this.textures.grain,
      this.textures.scanlines,
      this.textures.vignette,
    ])
      t.source.update();
    for (const c of this.containers) c.update();
  }

  destroy() {
    this.dropContainers();
    this.root.removeFromParent();
    destroyDisplay(this.root);
    this.textures.destroy();
  }
}
