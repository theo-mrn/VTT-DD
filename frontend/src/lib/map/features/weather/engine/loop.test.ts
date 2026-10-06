// @vitest-environment jsdom
/**
 * Boucle de la météo dans le moteur monté (docs/carte.md § 10, Météo) : son propre canvas et
 * son propre `requestAnimationFrame`. Une image de météo ne rend que son canvas et ne demande
 * jamais d'image à la carte ; un déplacement de la carte rend la météo dans la même image ; sans
 * météo, rien ne tourne ; la destruction rend le canvas. Rendu de la carte et canvas de la météo
 * factices (pas de WebGL), simulation et objets Pixi réels.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setup } from '@/lib/map/engine/test-kit';
import { weatherModule } from '../index';

const fake = vi.hoisted(() => ({
  viewRender: null as null | ReturnType<typeof vi.fn>,
  overlays: [] as {
    stage: unknown;
    render: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    setShown: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
    setRestoreHandler: ReturnType<typeof vi.fn>;
    visible: boolean;
  }[],
}));

vi.mock('@/lib/map/engine/pixi-view', async () => {
  const pixi = await import('pixi.js');
  return {
    createPixiView: async (_engine: unknown, host: HTMLElement) => {
      const canvas = document.createElement('canvas');
      host.appendChild(canvas);
      const render = vi.fn();
      fake.viewRender = render;
      const fields: Record<string, unknown> = {
        canvas,
        pixi,
        renderer: { resolution: 2 },
        render,
      };
      // Rendu factice : toute autre méthode ne fait rien
      return new Proxy(fields, {
        get: (t, key) => {
          if (key in t) return t[key as string];
          return key === 'then' ? undefined : () => undefined;
        },
      });
    },
  };
});

vi.mock('./overlay', async () => {
  const pixi = await import('pixi.js');
  return {
    WeatherOverlay: {
      create: async () => {
        const o = {
          stage: new pixi.Container(),
          render: vi.fn(),
          resize: vi.fn(),
          setShown: vi.fn((v: boolean) => void (o.visible = v)),
          destroy: vi.fn(),
          setRestoreHandler: vi.fn(),
          visible: false,
        };
        fake.overlays.push(o);
        return o;
      },
    },
  };
});

vi.mock('./textures', async () => {
  const pixi = await import('pixi.js');
  const white = pixi.Texture.WHITE;
  return {
    createWeatherTextures: () => ({
      atlas: new Proxy({}, { get: () => white }),
      mist: white,
      vignette: white,
      grain: white,
      scanlines: white,
      destroy() {},
    }),
  };
});

/** `requestAnimationFrame` à la main : les rappels attendent `flush`. */
const frames = new Map<number, FrameRequestCallback>();
let nextHandle = 1;
function flush() {
  const due = [...frames.values()];
  frames.clear();
  const now = performance.now();
  for (const cb of due) cb(now);
}
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  fake.overlays.length = 0;
  frames.clear();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const h = nextHandle++;
    frames.set(h, cb);
    return h;
  });
  vi.stubGlobal('cancelAnimationFrame', (h: number) => void frames.delete(h));
  // Animation permise, quelles que soient les préférences du navigateur de test
  vi.stubGlobal('localStorage', { getItem: () => '1', setItem: () => undefined });
});

/** Moteurs des tests : détruits même après un échec (aucun minuteur ne déborde). */
const engines: { destroy(): void }[] = [];

afterEach(() => {
  for (const e of engines.splice(0)) e.destroy();
  vi.unstubAllGlobals();
});

async function mounted() {
  const t = setup();
  t.engine.use(weatherModule);
  engines.push(t.engine);
  const host = document.createElement('div');
  await t.engine.mount(host);
  flush();
  return { ...t, host };
}

function setWeather(t: Awaited<ReturnType<typeof mounted>>, weather: unknown) {
  const scene = t.store.getState().scene!;
  t.store.getState().setScene({ ...scene, version: scene.version + 1, weather } as typeof scene, {
    force: true,
  });
}

describe('météo : canvas et boucle à part', () => {
  it('sans météo : ni canvas, ni boucle', async () => {
    const t = await mounted();
    expect(fake.overlays).toHaveLength(0);
    expect(frames.size).toBe(0);
    t.engine.destroy();
  });

  it('une image de météo ne rend que son canvas, jamais la carte', async () => {
    const t = await mounted();
    setWeather(t, { type: 'rain', intensity: 1 });
    // Canvas créé à la première météo active, puis une image
    flush();
    await settle();
    expect(fake.overlays).toHaveLength(1);
    const overlay = fake.overlays[0]!;
    const invalidate = vi.spyOn(t.engine, 'invalidate');
    fake.viewRender!.mockClear();
    const mapFrames = t.engine.perf.frames;
    for (let i = 0; i < 5; i++) {
      flush();
      // Image suivante armée par le minuteur de la météo (~28 ms)
      await new Promise((r) => setTimeout(r, 40));
    }
    flush();
    expect(overlay.render.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(overlay.visible).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
    expect(fake.viewRender).not.toHaveBeenCalled();
    expect(t.engine.perf.weather).toBeGreaterThanOrEqual(5);
    expect(t.engine.perf.frames).toBe(mapFrames);
    t.engine.destroy();
  });

  it('déplacement de la carte : la météo est rendue dans la même image, taille suivie', async () => {
    const t = await mounted();
    setWeather(t, { type: 'snow', intensity: 1 });
    flush();
    await settle();
    flush();
    const overlay = fake.overlays[0]!;
    overlay.render.mockClear();
    t.engine.camera.panBy(40, 0);
    // L'image de la carte (demandée par la caméra) rend aussi la météo ; aucune autre n'attend
    flush();
    expect(fake.viewRender).toHaveBeenCalled();
    expect(overlay.render).toHaveBeenCalledTimes(1);
    t.engine.resize(640, 480);
    flush();
    expect(overlay.resize).toHaveBeenLastCalledWith(640, 480);
    t.engine.destroy();
  });

  it('météo retirée : canvas caché, plus de boucle ; destruction : canvas rendu', async () => {
    const t = await mounted();
    setWeather(t, { type: 'rain', intensity: 1 });
    flush();
    await settle();
    flush();
    const overlay = fake.overlays[0]!;
    setWeather(t, null);
    flush();
    expect(overlay.visible).toBe(false);
    expect(frames.size).toBe(0);
    await new Promise((r) => setTimeout(r, 40));
    expect(frames.size).toBe(0);
    t.engine.destroy();
    expect(overlay.destroy).toHaveBeenCalledTimes(1);
  });

  it('carte détruite pendant la création du canvas : il est rendu aussitôt créé', async () => {
    const t = await mounted();
    setWeather(t, { type: 'rain', intensity: 1 });
    flush();
    t.engine.destroy();
    await settle();
    expect(fake.overlays).toHaveLength(1);
    expect(fake.overlays[0]!.destroy).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
  });
});
