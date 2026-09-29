import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Camera,
  cameraStorageKey,
  FIT_MARGIN,
  loadCamera,
  MAX_ZOOM,
  saveCamera,
  wheelZoomFactor,
} from './camera';

function camera(world = { width: 2000, height: 1000 }, viewport = { width: 1000, height: 800 }) {
  const c = new Camera();
  c.setViewport(viewport.width, viewport.height);
  c.setWorld(world.width, world.height);
  return c;
}

describe('Camera', () => {
  it('cadre toute la carte à l’arrivée (« contenir », marge de 24 px)', () => {
    const c = camera();
    // Largeur limitante : (1000 − 48) / 2000
    expect(c.zoom).toBeCloseTo((1000 - 2 * FIT_MARGIN) / 2000);
    expect(c.x).toBe(1000);
    expect(c.y).toBe(500);
    expect(c.fitted).toBe(true);
    const topLeft = c.worldToScreen({ x: 0, y: 0 });
    expect(topLeft.x).toBeCloseTo(FIT_MARGIN);
    expect(topLeft.y).toBeGreaterThanOrEqual(FIT_MARGIN);
  });

  it('convertit monde ⇄ écran sans perte', () => {
    const c = camera();
    c.set({ x: 420, y: 300, zoom: 1.7 });
    for (const p of [
      { x: 0, y: 0 },
      { x: 123.4, y: 987.6 },
      { x: 2000, y: 1000 },
    ]) {
      const back = c.screenToWorld(c.worldToScreen(p));
      expect(back.x).toBeCloseTo(p.x);
      expect(back.y).toBeCloseTo(p.y);
    }
    // Le centre de l'écran est le point (x, y) de la caméra
    expect(c.screenToWorld({ x: 500, y: 400 })).toEqual({ x: 420, y: 300 });
  });

  it('zoome autour du curseur : le point sous le curseur ne bouge pas', () => {
    const c = camera();
    const cursor = { x: 730, y: 210 };
    const before = c.screenToWorld(cursor);
    c.zoomAt(cursor, 2.5);
    const after = c.screenToWorld(cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(c.fitted).toBe(false);
  });

  it('borne le zoom entre fit × 0,25 et 8', () => {
    const c = camera();
    const fit = c.fitZoom();
    c.zoomAt({ x: 500, y: 400 }, 1e-6);
    expect(c.zoom).toBeCloseTo(fit * 0.25);
    c.zoomAt({ x: 500, y: 400 }, 1e9);
    expect(c.zoom).toBe(MAX_ZOOM);
  });

  it('garde le centre sur la carte pendant le pan', () => {
    const c = camera();
    c.panBy(1e6, -1e6);
    expect(c.x).toBe(0);
    expect(c.y).toBe(1000);
  });

  it('reste cadrée quand la fenêtre change de taille, tant qu’on n’a pas bougé', () => {
    const c = camera();
    c.setViewport(500, 500);
    expect(c.zoom).toBeCloseTo((500 - 48) / 2000);
    c.panBy(10, 0);
    const zoom = c.zoom;
    c.setViewport(900, 900);
    expect(c.zoom).toBe(zoom);
  });

  it('anime la vue jusqu’à la cible (flyTo)', () => {
    const c = camera();
    c.flyTo({ x: 100, y: 100, zoom: 2 }, 0, 400);
    expect(c.animating).toBe(true);
    expect(c.step(200)).toBe(true);
    expect(c.x).toBeGreaterThan(100);
    expect(c.x).toBeLessThan(1000);
    expect(c.step(400)).toBe(false);
    expect(c.snapshot()).toEqual({ x: 100, y: 100, zoom: 2 });
  });

  it('prévient ses abonnés à chaque changement', () => {
    const c = camera();
    const listener = vi.fn();
    const off = c.onChange(listener);
    c.panBy(5, 5);
    c.zoomAt({ x: 0, y: 0 }, 1.1);
    off();
    c.panBy(5, 5);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('zoome plus finement au pincement qu’à la molette', () => {
    expect(wheelZoomFactor(-100, 0, false)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100, 0, false)).toBeLessThan(1);
    expect(wheelZoomFactor(-10, 0, true)).toBeGreaterThan(wheelZoomFactor(-10, 0, false));
  });
});

describe('mémoire de la vue', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('garde et relit la vue par utilisateur et par carte', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    });
    const key = cameraStorageKey('moi', 'carte');
    saveCamera(key, { x: 1, y: 2, zoom: 3 });
    expect(loadCamera(key)).toEqual({ x: 1, y: 2, zoom: 3 });
    expect(loadCamera(cameraStorageKey('moi', 'autre'))).toBeNull();
    saveCamera(key, null);
    expect(loadCamera(key)).toBeNull();
  });

  it('ignore un stockage indisponible ou corrompu', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('refusé');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => undefined,
    });
    expect(() => saveCamera('k', { x: 1, y: 1, zoom: 1 })).not.toThrow();
    expect(loadCamera('k')).toBeNull();
    vi.stubGlobal('localStorage', { getItem: () => '{"x":"a"}' });
    expect(loadCamera('k')).toBeNull();
  });
});
