/**
 * Module « météo » de la carte (docs/carte.md § 10, Météo) : pluie, orage, neige, blizzard,
 * brouillard, feuilles, cendres et braises, sable, alerte rouge, parasites.
 *
 * - État durable de la scène (`maps.weather`), le même pour tous ; le MJ le règle par le bouton
 *   « Météo » (commande annulable), les joueurs n'ont que leurs préférences de confort.
 * - Rendu dans son propre canvas (`overlay.ts`), au-dessus de celui de la carte, en pixels
 *   d'écran, ancré à la carte au déplacement. Une image de météo ne rend que ce canvas et ne
 *   demande jamais d'image à la carte (`engine.invalidate`).
 * - Boucle à part (`requestAnimationFrame` du module) : 30 i/s au plus (20 sur une machine
 *   économe) ; arrêt complet sans météo ; pause (image fixe) quand l'onglet est caché, la vue
 *   nulle, ou l'animation coupée.
 * - Caméra : à chaque image de la carte où la caméra ou la taille de la vue ont changé, la météo
 *   est rendue dans la même image (ancrage et taille sans décalage), sans rien demander de plus
 *   à la carte.
 * - Budget : moitié moins de particules sur une machine économe ; divisé par deux (jusqu'au
 *   huitième) tant que le module coûte plus de 8 ms par image, en moyenne.
 *
 * État sans Pixi : `simulation.ts`, `driver.ts`, `model.ts` (testés à blanc) ; rendu :
 * `renderer.ts` ; canvas : `overlay.ts`.
 */
import type { MapModule } from '../../engine/map-engine';
import { WeatherControls } from '@/components/map/weather/weather-menu';
import { prefersEconomy } from '@/lib/perf/device';
import { browserEnv, WeatherDriver } from './driver';
import { normalizeWeather, WEATHER_FPS, WEATHER_FPS_ECONOMY } from './model';
import { WeatherOverlay } from './overlay';
import { WeatherRenderer } from './renderer';
import { WeatherSim } from './simulation';
import { displayedWeather, weatherPreview, weatherPrefs } from './state';
import { exposeWeatherStats, WeatherStats } from './stats';

/** Coût moyen du module par image au-delà duquel le budget de particules est divisé. */
export const DEGRADE_MS = 8;
const DEGRADE_WINDOW = 60;
const MIN_BUDGET = 1 / 8;

export const weatherModule: MapModule = {
  id: 'weather',
  register(engine) {
    const prefs = weatherPrefs(engine);
    const preview = weatherPreview(engine);
    const stats = new WeatherStats();
    const sim = new WeatherSim();
    const economy = prefersEconomy();

    // Boucle de la météo : son propre `requestAnimationFrame`, jamais celui de la carte
    let handle: number | null = null;
    /** Rendu monté (canvas de la carte présent). */
    let mounted = false;
    const onAnimationFrame = (now: number) => {
      handle = null;
      frame(now);
    };
    const request = () => {
      if (handle !== null || !mounted || typeof requestAnimationFrame === 'undefined') return;
      handle = requestAnimationFrame(onAnimationFrame);
    };
    const cancel = () => {
      if (handle !== null) cancelAnimationFrame(handle);
      handle = null;
    };
    const driver = new WeatherDriver(
      request,
      browserEnv(),
      economy ? WEATHER_FPS_ECONOMY : WEATHER_FPS,
    );
    // Part du budget de particules : divisée quand les images coûtent trop (jamais remontée)
    let budgetScale = 1;
    let checkedAt = 0;
    let overlay: WeatherOverlay | null = null;
    let renderer: WeatherRenderer | null = null;
    // Création du canvas : en cours, ou échouée (pas de nouvel essai avant le prochain montage)
    let opening = false;
    let failed = false;
    /** Montage courant : une création qui aboutit après un démontage est jetée. */
    let generation = 0;

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
    // Taille lue par le rendu : un objet réutilisé, aucune allocation par image
    const viewport = { width: 0, height: 0 };

    /** Crée le canvas de la météo (première météo active du montage). */
    const open = () => {
      if (overlay || opening || failed || !mounted) return;
      const pixi = engine.pixi;
      const above = engine.canvas;
      if (!pixi || !above) return;
      opening = true;
      const token = generation;
      const cam = engine.camera;
      WeatherOverlay.create(pixi, above, {
        resolution: engine.renderer?.resolution ?? 1,
        width: cam.viewport.width,
        height: cam.viewport.height,
      }).then(
        (created) => {
          opening = false;
          if (token !== generation) {
            created.destroy();
            return;
          }
          try {
            renderer = new WeatherRenderer(pixi, created.stage);
          } catch (err) {
            console.error('[carte] météo impossible à afficher', err);
            failed = true;
            created.destroy();
            return;
          }
          overlay = created;
          // Contexte WebGL de la météo restauré : textures de canevas renvoyées, image refaite
          created.setRestoreHandler(() => {
            renderer?.restore();
            request();
          });
          // Tout reconfigurer à la première image
          lastRaw = undefined;
          request();
        },
        (err: unknown) => {
          opening = false;
          if (token !== generation) return;
          failed = true;
          console.error('[carte] météo impossible à afficher', err);
        },
      );
    };

    /** Canvas, rendu et boucle libérés (démontage, destruction de la carte). */
    const close = () => {
      generation += 1;
      cancel();
      driver.stop();
      renderer?.destroy();
      renderer = null;
      overlay?.destroy();
      overlay = null;
      opening = false;
      failed = false;
      camZoom = 0;
    };

    /** Une image de la météo : simulation, objets Pixi, rendu de son seul canvas. */
    const frame = (now: number) => {
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
          windows: economy,
          scale: budgetScale,
          still: !animate,
          flashes,
        });
      }
      if (!sim.active) {
        // Arrêt complet : ni minuteur, ni simulation, canvas caché
        driver.stop();
        if (renderer) renderer.draw(sim, viewport);
        overlay?.setShown(false);
        camZoom = 0;
        return;
      }
      if (!overlay || !renderer) {
        // Première météo : canvas créé (asynchrone), puis une image demandée
        open();
        return;
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
      viewport.width = width;
      viewport.height = height;
      renderer.draw(sim, viewport);
      stats.record('draw', performance.now() - t);
      stats.particles = sim.particleCount;
      const drawn = performance.now();
      stats.record('frame', drawn - started);
      overlay.resize(width, height);
      overlay.setShown(true);
      overlay.render();
      const end = performance.now();
      stats.record('render', end - drawn);
      engine.perf.weather += 1;
      engine.perf.weatherMs += end - started;
      // Dégradation : toutes les 60 images animées, moitié moins de particules si le module
      // dépasse 8 ms en moyenne
      if (dt > 0 && stats.count('frame') - checkedAt >= DEGRADE_WINDOW) {
        checkedAt = stats.count('frame');
        if (budgetScale > MIN_BUDGET && stats.recent('frame', DEGRADE_WINDOW) > DEGRADE_MS) {
          budgetScale /= 2;
          lastRaw = undefined;
        }
      }
    };

    // Onglet en arrière-plan : plus de minuteur ; au retour, une image (reprise d'un pas nul)
    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState === 'hidden') driver.stop();
      else request();
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
        if (s.scene?.weather !== prev.scene?.weather) request();
      }),
      prefs.subscribe(() => request()),
      preview.subscribe(() => request()),
      () => {
        if (typeof document !== 'undefined')
          document.removeEventListener('visibilitychange', onVisibility);
      },
      () => driver.stop(),
    ];

    // Image de la carte : si la caméra ou la taille de la vue ont changé, la météo est rendue
    // tout de suite (même image que la carte : ni retard d'ancrage, ni décalage de taille). Ne
    // demande jamais d'image à la carte.
    cleanups.push(
      engine.onFrame((now) => {
        if (!overlay || !sim.active) return;
        const cam = engine.camera;
        if (
          cam.x !== camX ||
          cam.y !== camY ||
          cam.zoom !== camZoom ||
          cam.viewport.width !== lastWidth ||
          cam.viewport.height !== lastHeight
        ) {
          // L'image déjà demandée par la météo serait la même : remplacée par celle-ci
          cancel();
          frame(now);
        }
      }),
    );

    cleanups.push(
      engine.whenMounted(() => {
        mounted = true;
        // Tout reconfigurer à la première image
        lastRaw = undefined;
        lastWidth = -1;
        request();
        return () => {
          mounted = false;
          close();
        };
      }),
    );

    return () => {
      for (const c of cleanups.splice(0).reverse()) c();
    };
  },
};
