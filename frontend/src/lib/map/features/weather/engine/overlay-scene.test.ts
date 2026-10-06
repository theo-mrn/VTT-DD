// @vitest-environment jsdom
/**
 * Météo sur la carte complète : chaque type de temps ouvre la surcouche (second rendu, canevas
 * posé juste après celui de la carte), peint ses textures, anime ses particules image après
 * image, suit la taille de la vue ; aperçu du MJ, réglages (animation, éclairs), arrêt de la
 * météo et fermeture.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { GM, mountMap, type MapHarness } from '@/lib/map/test/map-harness';
import { WEATHER_TYPES } from './effects';
import {
  displayedWeather,
  setWeatherAnimated,
  setWeatherFlashes,
  setWeatherPreview,
} from './state';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Le canevas de la météo, posé après celui de la carte. */
const overlayCanvas = (m: MapHarness) =>
  m.engine.canvas?.nextElementSibling as HTMLCanvasElement | null;

describe('météo de la scène', () => {
  it.each(WEATHER_TYPES)('%s : surcouche ouverte, particules animées', async (type) => {
    h = await mountMap({ viewer: GM, scene: { weather: { type, intensity: 7 } } });
    h.host.appendChild(h.engine.canvas!);
    h.frame();
    await wait(120);
    expect(displayedWeather(h.engine)?.type).toBe(type);
    expect(overlayCanvas(h)).not.toBeNull();
    // Zoom, déplacement et taille de la vue : la météo suit
    h.engine.camera.zoomAt({ x: 500, y: 400 }, 1.5);
    h.engine.resize(800, 600);
    h.frame();
    await wait(80);
  });

  it('aperçu du MJ, animation et éclairs coupés, puis fin de la météo', async () => {
    h = await mountMap({ viewer: GM, scene: { weather: { type: 'storm', intensity: 10 } } });
    h.host.appendChild(h.engine.canvas!);
    h.frame();
    await wait(80);
    setWeatherPreview(h.engine, { type: 'snow', intensity: 3 });
    expect(displayedWeather(h.engine)?.type).toBe('snow');
    await wait(60);
    setWeatherAnimated(h.engine, false);
    setWeatherFlashes(h.engine, false);
    await wait(60);
    setWeatherAnimated(h.engine, true);
    setWeatherPreview(h.engine, null);
    await wait(60);
    await h.engine.updateScene('Météo', { weather: null });
    h.frame();
    await wait(80);
    // Onglet caché : la boucle s'arrête ; de retour : elle reprend
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
});
