/**
 * Rendu Pixi de la météo sans WebGL : conteneurs de particules branchés sur la simulation (sans
 * copie), scène en pixels d'écran (aucune caméra), arrêt, changement d'effet, destruction. Les textures
 * (canevas 2D) sont remplacées par la texture blanche de Pixi.
 */
import * as PIXI from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { AtlasFrame } from './effects';
import { normalizeWeather } from './model';
import { WeatherRenderer, type WeatherViewport } from './renderer';
import { WeatherSim } from './simulation';
import type { WeatherTextures } from './textures';

const FRAMES: AtlasFrame[] = ['streak', 'dot', 'flake', 'leaf0', 'leaf1', 'leaf2', 'ring'];

function fakeTextures(): WeatherTextures & { destroyed: boolean } {
  const white = PIXI.Texture.WHITE;
  return {
    atlas: Object.fromEntries(FRAMES.map((f) => [f, white])) as Record<AtlasFrame, PIXI.Texture>,
    mist: white,
    vignette: white,
    grain: white,
    scanlines: white,
    destroyed: false,
    destroy() {
      this.destroyed = true;
    },
  };
}

function harness() {
  const plane = new PIXI.Container();
  const textures = fakeTextures();
  const r = new WeatherRenderer(PIXI, plane, textures);
  const sim = new WeatherSim(() => 0.5);
  const cam: WeatherViewport = { width: 800, height: 600 };
  const root = plane.children[0] as PIXI.Container;
  const particles = () =>
    root.children
      .find((c) => c.label === 'weather:particles')!
      .children.map((c) => c as PIXI.ParticleContainer);
  return { plane, textures, r, sim, cam, root, particles };
}

const weather = (type: string, intensity = 1) => normalizeWeather({ type, intensity });

describe('météo : rendu Pixi (sans WebGL)', () => {
  it('particules de la simulation telles quelles, scène en pixels d’écran', () => {
    const { r, sim, cam, root, particles } = harness();
    sim.configure(weather('rain'), cam.width, cam.height, {});
    r.draw(sim, cam);
    expect(root.visible).toBe(true);
    const [drops, splashes] = particles();
    expect(drops!.particleChildren).toBe(sim.emitters[0]!.particles);
    expect(splashes!.particleChildren).toBe(sim.emitters[1]!.particles);
    expect(drops!.particleChildren[0]!.texture).toBe(PIXI.Texture.WHITE);
    // Canvas à part, sans caméra : un enfant en (0, 0) est au coin haut gauche de la vue
    expect(root.scale.x).toBe(1);
    expect(root.position.x).toBe(0);
    expect(root.position.y).toBe(0);
    const veil = root.children.find((c) => c.label === 'weather:veil')!;
    expect(veil.width).toBe(800);
    expect(veil.height).toBe(600);
  });

  it('aucune création d’objet Pixi par image ; changement d’effet : nouveaux conteneurs', () => {
    const { r, sim, cam, root, particles } = harness();
    sim.configure(weather('snow'), cam.width, cam.height, {});
    r.draw(sim, cam);
    const before = particles();
    const children = root.children.slice();
    for (let i = 0; i < 20; i++) {
      sim.step(1 / 30);
      r.draw(sim, cam);
    }
    expect(particles()).toEqual(before);
    expect(root.children).toEqual(children);
    sim.configure(weather('embers'), cam.width, cam.height, {});
    r.draw(sim, cam);
    expect(particles()).not.toContain(before[0]);
    expect(before[0]!.destroyed).toBe(true);
    expect(particles()[1]!.blendMode).toBe('add');
  });

  it('aucune météo : plan caché ; destruction sans erreur, textures rendues', () => {
    const { r, sim, cam, root, plane, textures } = harness();
    sim.configure(weather('storm', 2), cam.width, cam.height, {});
    r.draw(sim, cam);
    sim.configure(null, cam.width, cam.height, {});
    r.draw(sim, cam);
    expect(root.visible).toBe(false);
    sim.configure(weather('sandstorm'), cam.width, cam.height, {});
    r.draw(sim, cam);
    expect(() => r.destroy()).not.toThrow();
    expect(plane.children).toHaveLength(0);
    expect(textures.destroyed).toBe(true);
  });
});
