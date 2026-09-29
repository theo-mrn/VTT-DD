/**
 * Module « météo » de la carte (docs/carte.md § 10, Météo) : pluie, orage, neige, blizzard,
 * brouillard, feuilles, cendres et braises, sable, alerte rouge, parasites.
 *
 * - État durable de la scène (`maps.weather`), le même pour tous ; le MJ le règle par le bouton
 *   « Météo » (commande annulable), les joueurs n'ont que leurs préférences de confort.
 * - Rendu dans le plan `weather`, en pixels d'écran, ancré à la carte au déplacement.
 * - Cadence : 30 i/s au plus demandées par la météo ; arrêt complet sans météo ; pause (image
 *   fixe) quand l'onglet est caché, la vue nulle, ou l'animation coupée.
 *
 * État sans Pixi : `simulation.ts`, `driver.ts`, `model.ts` (testés à blanc) ; rendu :
 * `renderer.ts`.
 */
import type { MapModule } from '../../engine/map-engine';
import { WeatherControls } from '@/components/map/weather/weather-menu';
import { WeatherDriver } from './driver';
import { isWindowsPlatform, normalizeWeather } from './model';
import { WeatherRenderer } from './renderer';
import { WeatherSim } from './simulation';
import { displayedWeather, weatherPreview, weatherPrefs } from './state';
import { exposeWeatherStats, WeatherStats } from './stats';

export const weatherModule: MapModule = {
  id: 'weather',
  register(engine) {
    const prefs = weatherPrefs(engine);
    const preview = weatherPreview(engine);
    const stats = new WeatherStats();
    const sim = new WeatherSim();
    const driver = new WeatherDriver(() => engine.invalidate());
    const windows = isWindowsPlatform(typeof navigator !== 'undefined' ? navigator : undefined);
    let renderer: WeatherRenderer | null = null;

    // Entrées de la dernière configuration : comparées par identité, sans allocation
    let lastRaw: unknown = undefined;
    let lastWidth = -1;
    let lastHeight = -1;
    let lastAnimate: boolean | null = null;
    let lastFlashes: boolean | null = null;
    // Caméra de l'image précédente (ancrage au déplacement)
    let camX = 0;
    let camY = 0;
    let camZoom = 0;
    // Caméra lue par le rendu : un objet réutilisé, aucune allocation par image
    const camera = { x: 0, y: 0, zoom: 1, width: 0, height: 0 };
    const camOf = () => {
      const cam = engine.camera;
      camera.x = cam.x;
      camera.y = cam.y;
      camera.zoom = cam.zoom;
      camera.width = cam.viewport.width;
      camera.height = cam.viewport.height;
      return camera;
    };

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible')
        engine.invalidate();
    };
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', onVisibility);

    const cleanups: (() => void)[] = [
      exposeWeatherStats(stats),
      engine.registerToolbarItem({
        id: 'weather:menu',
        slot: 'view',
        order: 15,
        component: WeatherControls,
      }),
      engine.store.subscribe((s, prev) => {
        if (s.scene?.weather !== prev.scene?.weather) engine.invalidate();
      }),
      prefs.subscribe(() => engine.invalidate()),
      preview.subscribe(() => engine.invalidate()),
      () => {
        if (typeof document !== 'undefined')
          document.removeEventListener('visibilitychange', onVisibility);
      },
      () => driver.stop(),
    ];

    cleanups.push(
      engine.onFrame((now) => {
        if (!renderer) return false;
        const started = performance.now();
        const cam = engine.camera;
        const width = cam.viewport.width;
        const height = cam.viewport.height;
        const raw = displayedWeather(engine);
        const { animate, flashes } = prefs.getState();
        if (
          raw !== lastRaw ||
          width !== lastWidth ||
          height !== lastHeight ||
          animate !== lastAnimate ||
          flashes !== lastFlashes
        ) {
          lastRaw = raw;
          lastWidth = width;
          lastHeight = height;
          lastAnimate = animate;
          lastFlashes = flashes;
          sim.configure(normalizeWeather(raw), width, height, {
            windows,
            still: !animate,
            flashes,
          });
        }
        if (!sim.active) {
          // Arrêt complet : ni minuteur, ni simulation, plan caché
          driver.stop();
          renderer.draw(sim, camOf());
          camZoom = 0;
          return false;
        }
        // Ancrage : au déplacement (zoom inchangé), la météo suit la carte
        if (camZoom !== 0 && cam.zoom === camZoom)
          sim.shift((camX - cam.x) * cam.zoom, (camY - cam.y) * cam.zoom);
        camX = cam.x;
        camY = cam.y;
        camZoom = cam.zoom;

        const dt = driver.frame(now, { active: true, animate, visible: width > 0 && height > 0 });
        if (dt > 0) {
          const t = performance.now();
          sim.step(dt);
          stats.record('step', performance.now() - t);
        }
        const t = performance.now();
        renderer.draw(sim, camOf());
        stats.record('draw', performance.now() - t);
        stats.particles = sim.particleCount;
        stats.record('frame', performance.now() - started);
        return false;
      }),
    );

    cleanups.push(
      engine.whenMounted(() => {
        const pixi = engine.pixi;
        const plane = engine.plane('weather');
        if (!pixi || !plane) return;
        try {
          renderer = new WeatherRenderer(pixi, plane);
        } catch (err) {
          console.error('[carte] météo impossible à afficher', err);
          renderer = null;
          return;
        }
        // Tout reconfigurer au premier rendu
        lastRaw = undefined;
        lastWidth = -1;
        engine.invalidate();
        const canvas = engine.canvas;
        const onRestored = () => {
          renderer?.restore();
          engine.invalidate();
        };
        canvas?.addEventListener('webglcontextrestored', onRestored);
        return () => {
          canvas?.removeEventListener('webglcontextrestored', onRestored);
          driver.stop();
          renderer?.destroy();
          renderer = null;
        };
      }),
    );

    return () => {
      for (const c of cleanups.splice(0).reverse()) c();
    };
  },
};
