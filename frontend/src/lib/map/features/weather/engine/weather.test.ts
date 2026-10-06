/**
 * Météo (docs/carte.md § 10, Météo), à blanc : lecture des données (anciennes comprises),
 * budget des particules, simulation (mouvement, bords, ancrage, image fixe, aucune
 * allocation), éclairs doux, cadence et arrêt, préférences, commande annulable.
 */
import type { MapWeather } from '@vtt/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setup } from '@/lib/map/engine/test-kit';
import { FRAME_TARGET_MS, MAX_STEP_S, WeatherDriver, type DriverEnv } from './driver';
import { WEATHER_EFFECTS, WEATHER_TYPES } from './effects';
import { weatherModule } from '../index';
import {
  densityFactor,
  isWindowsPlatform,
  MAX_DENSITY,
  MAX_DENSITY_WINDOWS,
  MAX_INTENSITY,
  MAX_PARTICLES,
  MAX_PARTICLES_WINDOWS,
  normalizeWeather,
  particleBudget,
  STILL_COUNT,
  WEATHER_FPS,
} from './model';
import { flashEnvelope, WeatherSim, WRAP_MARGIN } from './simulation';
import {
  displayedWeather,
  saveWeather,
  setWeatherAnimated,
  setWeatherPreview,
  weatherPrefs,
} from './state';
import { paint, ATLAS_SHADES, tileableNoise } from './textures';

/** Générateur à graine : tirages reproductibles. */
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const settings = (weather: Partial<MapWeather> & { type: string }) =>
  normalizeWeather({ intensity: 1, ...weather })!;

const HD = { width: 1920, height: 1080 };

describe('météo : lecture de maps.weather', () => {
  it('aucune, type inconnu, intensité nulle : rien ; au-delà de 2 (contrat : 10) : 2', () => {
    expect(normalizeWeather(null)).toBeNull();
    expect(normalizeWeather({ type: 'none', intensity: 1 })).toBeNull();
    expect(normalizeWeather({ type: 'aurore', intensity: 1 })).toBeNull();
    expect(normalizeWeather({ type: 'rain', intensity: 0 })).toBeNull();
    expect(normalizeWeather({ type: 'rain', intensity: 1 })?.intensity).toBe(1);
    expect(normalizeWeather({ type: 'rain', intensity: 2 })?.intensity).toBe(MAX_INTENSITY);
    expect(normalizeWeather({ type: 'rain', intensity: 10 })?.intensity).toBe(MAX_INTENSITY);
    expect(normalizeWeather({ type: 'snow', intensity: 0.4 })?.effect.id).toBe('snow');
    // Tous les types du catalogue se lisent
    for (const t of WEATHER_TYPES)
      expect(normalizeWeather({ type: t, intensity: 1 })).not.toBeNull();
  });

  it('vent : celui de l’effet sans réglage, celui du MJ sinon, avec le plancher de l’effet', () => {
    const rain = settings({ type: 'rain' }).wind;
    expect(rain.direction).toBe(0);
    expect(rain.strength).toBeCloseTo(0.2);
    expect(rain.x).toBeGreaterThan(0);
    const south = settings({ type: 'snow', wind: { direction: 90, strength: 0.5 } }).wind;
    expect(south.x).toBeCloseTo(0);
    expect(south.y).toBeCloseTo(0.5);
    // « Sans vent » : le sable file encore, l'alerte n'a pas de vent
    expect(settings({ type: 'sandstorm', wind: { direction: 0, strength: 0 } }).wind.strength).toBe(
      0.35,
    );
    expect(settings({ type: 'alert', wind: { direction: 90, strength: 1 } }).wind.strength).toBe(0);
    expect(settings({ type: 'rain', wind: { direction: 360, strength: 1 } }).wind.direction).toBe(
      0,
    );
  });

  it('Windows d’après le navigateur', () => {
    expect(isWindowsPlatform({ platform: 'Win32' })).toBe(true);
    expect(isWindowsPlatform({ userAgentData: { platform: 'Windows' } })).toBe(true);
    expect(isWindowsPlatform({ platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' })).toBe(
      false,
    );
    expect(isWindowsPlatform(undefined)).toBe(false);
  });
});

describe('météo : budget des particules', () => {
  const rain = WEATHER_EFFECTS.rain;

  it('proportionnel à la surface de la vue et à l’intensité', () => {
    const [drops] = particleBudget(rain, { ...HD, intensity: 0.5 });
    const [bigger] = particleBudget(rain, { width: 1920, height: 2160, intensity: 0.5 });
    const [lighter] = particleBudget(rain, { ...HD, intensity: 0.25 });
    expect(drops).toBe(Math.floor(380 * 2.0736 * 0.5));
    expect(bigger! / drops!).toBeCloseTo(2, 1);
    expect(lighter! / drops!).toBeCloseTo(0.5, 1);
    // Brouillard, alerte, parasites : aucune particule
    expect(particleBudget(WEATHER_EFFECTS.fog, { ...HD, intensity: 1 })).toEqual([]);
  });

  it('plafonné (plus bas sous Windows), toute la vue confondue', () => {
    const huge = { width: 3840, height: 2160, intensity: 1 };
    for (const t of WEATHER_TYPES) {
      const sum = (o: object) =>
        particleBudget(WEATHER_EFFECTS[t], { ...huge, ...o }).reduce((a, b) => a + b, 0);
      expect(sum({})).toBeLessThanOrEqual(MAX_PARTICLES);
      expect(sum({ windows: true })).toBeLessThanOrEqual(MAX_PARTICLES_WINDOWS);
    }
    const storm = particleBudget(WEATHER_EFFECTS.storm, huge);
    expect(storm.reduce((a, b) => a + b, 0)).toBeGreaterThan(MAX_PARTICLES - 3);
    // Les émetteurs gardent leurs proportions
    expect(storm[0]! / storm[1]!).toBeCloseTo(520 / 60, 0);
  });

  it('intensité : 1 (ancien maximum) au milieu, puis jusqu’à 2,4 fois plus dense, sans palier', () => {
    for (const t of WEATHER_TYPES) {
      const effect = WEATHER_EFFECTS[t];
      expect(densityFactor(effect, 1)).toBe(1);
      expect(densityFactor(effect, 2)).toBe(effect.strong.density);
      // Montée continue : aucun saut entre deux crans du curseur (5 %, soit 0,1)
      let prev = 0;
      for (let i = 0.1; i <= 2 + 1e-9; i += 0.1) {
        const d = densityFactor(effect, i);
        expect(d).toBeGreaterThanOrEqual(prev);
        expect(d - prev).toBeLessThanOrEqual(0.15);
        prev = d;
      }
    }
    const rain = WEATHER_EFFECTS.rain;
    const at = (intensity: number) =>
      particleBudget(rain, { ...HD, intensity }).reduce((a, b) => a + b, 0);
    expect(at(2) / at(1)).toBeCloseTo(2.4, 1);
    expect(at(1.5) / at(1)).toBeCloseTo(1.7, 1);
    for (const t of ['rain', 'blizzard', 'sandstorm', 'storm'] as const)
      expect(WEATHER_EFFECTS[t].strong).toMatchObject({
        density: expect.toSatisfy((v: number) => v >= 2 && v <= 2.5),
        speed: expect.toSatisfy((v: number) => v > 1.2),
        alpha: expect.toSatisfy((v: number) => v > 1.2),
      });
    expect(WEATHER_EFFECTS.storm.strong.lightning).toBe(2);
  });

  it('plafond proportionnel à la surface de la vue, et en tout ; plus bas sous Windows', () => {
    const dense = WEATHER_EFFECTS.blizzard;
    const laptop = { width: 1280, height: 720, intensity: 2 };
    const area = 0.9216;
    const sum = (o: object) =>
      particleBudget(dense, { ...laptop, ...o }).reduce((a, b) => a + b, 0);
    expect(sum({})).toBeLessThanOrEqual(MAX_DENSITY * area);
    expect(sum({ windows: true })).toBeLessThanOrEqual(MAX_DENSITY_WINDOWS * area);
    expect(sum({ windows: true })).toBeLessThan(sum({}));
    // Même densité à l'écran sur une vue deux fois plus grande
    expect(sum({ width: 2560 }) / sum({})).toBeCloseTo(2, 1);
    // Écran 4K : le plafond total (arrondis de chaque émetteur compris)
    expect(sum({ width: 3840, height: 2160 })).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(sum({ width: 3840, height: 2160 })).toBeGreaterThanOrEqual(MAX_PARTICLES - 2);
    expect(sum({ width: 3840, height: 2160, windows: true })).toBeLessThanOrEqual(
      MAX_PARTICLES_WINDOWS,
    );
  });

  it('image fixe : 35 % des particules, sans éclaboussures', () => {
    const [drops, splash] = particleBudget(rain, { ...HD, intensity: 1, still: true });
    expect(drops).toBe(Math.floor(380 * 2.0736 * STILL_COUNT));
    expect(splash).toBe(0);
  });
});

describe('météo : simulation', () => {
  const sim = (seed = 1) => new WeatherSim(prng(seed));

  it('pluie : les gouttes tombent, penchées par le vent ; tout reste dans la vue élargie', () => {
    const s = sim();
    s.configure(settings({ type: 'rain' }), HD.width, HD.height, {});
    const drops = s.emitters[0]!.particles;
    expect(drops).toHaveLength(particleBudget(WEATHER_EFFECTS.rain, { ...HD, intensity: 1 })[0]);
    for (const p of drops) {
      expect(p.vy).toBeGreaterThan(400);
      expect(p.vx).toBeGreaterThan(0);
      // La traînée est tournée dans le sens de sa vitesse
      expect(Math.abs(p.rotation)).toBeLessThan(0.4);
    }
    const before = drops.map((p) => p.y);
    s.step(1 / 60);
    const moved = drops.filter((p, i) => p.y > before[i]!).length;
    expect(moved / drops.length).toBeGreaterThan(0.95);
    for (let i = 0; i < 300; i++) s.step(1 / 30);
    for (const e of s.emitters)
      for (const p of e.particles) {
        expect(p.x).toBeGreaterThanOrEqual(-WRAP_MARGIN);
        expect(p.x).toBeLessThanOrEqual(HD.width + WRAP_MARGIN);
        expect(p.y).toBeGreaterThanOrEqual(-WRAP_MARGIN);
        expect(p.y).toBeLessThanOrEqual(HD.height + WRAP_MARGIN);
      }
  });

  it('intensité la plus forte : pluie, blizzard et sable plus rapides et plus opaques', () => {
    for (const type of ['rain', 'blizzard', 'sandstorm'] as const) {
      const mean = (intensity: number) => {
        const s = sim();
        s.configure(settings({ type, intensity }), 1000, 1000, {});
        const list = s.emitters[0]!.particles;
        const speed = list.reduce((a, p) => a + Math.hypot(p.vx, p.vy), 0) / list.length;
        const alpha = list.reduce((a, p) => a + p.alpha, 0) / list.length;
        return { speed, alpha, veil: s.frame.veil.alpha, count: list.length };
      };
      const mid = mean(1);
      const max = mean(2);
      expect(max.speed / mid.speed).toBeGreaterThan(1.25);
      expect(max.alpha / mid.alpha).toBeGreaterThan(1.2);
      expect(max.veil).toBeGreaterThan(mid.veil);
      expect(max.count / mid.count).toBeGreaterThan(2);
    }
  });

  it('braises qui montent, sable qui file avec le vent, feuilles qui tournoient', () => {
    const embers = sim();
    embers.configure(settings({ type: 'embers' }), 800, 600, {});
    expect(embers.emitters[1]!.particles.every((p) => p.vy < 0)).toBe(true);
    const sand = sim();
    sand.configure(
      settings({ type: 'sandstorm', wind: { direction: 180, strength: 1 } }),
      800,
      600,
      {},
    );
    expect(sand.emitters[0]!.particles.every((p) => p.vx < -100)).toBe(true);
    const leaves = sim();
    leaves.configure(settings({ type: 'leaves' }), 800, 600, {});
    const leaf = leaves.emitters[0]!.particles[0]!;
    const rotation = leaf.rotation;
    leaves.step(0.1);
    expect(leaf.rotation).not.toBe(rotation);
    expect(new Set(leaves.emitters[0]!.particles.map((p) => p.frame)).size).toBeGreaterThan(1);
  });

  it('aucune allocation par image : mêmes tableaux, mêmes particules, mêmes valeurs de couches', () => {
    const s = sim();
    s.configure(settings({ type: 'storm' }), HD.width, HD.height, {});
    const emitters = s.emitters;
    const lists = emitters.map((e) => e.particles);
    const first = lists.map((l) => l.slice());
    const frame = s.frame;
    const veil = s.frame.veil;
    for (let i = 0; i < 200; i++) {
      s.step(1 / 30);
      s.shift(3, -2);
    }
    expect(s.emitters).toBe(emitters);
    s.emitters.forEach((e, k) => {
      expect(e.particles).toBe(lists[k]);
      e.particles.forEach((p, i) => expect(p).toBe(first[k]![i]));
    });
    expect(s.frame).toBe(frame);
    expect(s.frame.veil).toBe(veil);
  });

  it('intensité changée : les particules restent ; effet changé : tout repart', () => {
    const s = sim();
    s.configure(settings({ type: 'rain', intensity: 1 }), 1000, 1000, {});
    const drops = s.emitters[0]!.particles;
    const kept = drops.slice(0, 50);
    const structure = s.structure;
    s.configure(settings({ type: 'rain', intensity: 0.4 }), 1000, 1000, {});
    expect(s.structure).toBe(structure);
    expect(s.emitters[0]!.particles).toHaveLength(Math.floor(380 * 0.4));
    kept.forEach((p, i) => expect(s.emitters[0]!.particles[i]).toBe(p));
    s.configure(settings({ type: 'snow' }), 1000, 1000, {});
    expect(s.structure).toBe(structure + 1);
    expect(s.emitters.map((e) => e.spec.id)).toEqual(['far', 'near']);
    s.configure(null, 1000, 1000, {});
    expect(s.active).toBe(false);
    expect(s.particleCount).toBe(0);
  });

  it('ancrage : un déplacement de la carte décale tout, puis revient par l’autre bord', () => {
    const s = sim();
    s.configure(settings({ type: 'snow' }), 1000, 800, {});
    const p = s.emitters[0]!.particles[0]!;
    p.x = 100;
    p.y = 100;
    s.shift(40, -30);
    expect(p.x).toBeCloseTo(140);
    expect(p.y).toBeCloseTo(70);
    s.shift(1000 + 2 * WRAP_MARGIN, 0);
    expect(p.x).toBeCloseTo(140);
  });

  it('image fixe : rien ne bouge, opacité réduite, ni éclair ni bande', () => {
    const s = sim();
    s.configure(settings({ type: 'storm' }), 1000, 800, { still: true });
    const drops = s.emitters[0]!.particles;
    expect(drops).toHaveLength(Math.floor(520 * 0.8 * STILL_COUNT));
    expect(s.emitters[1]!.particles).toHaveLength(0);
    const xs = drops.map((p) => p.x);
    for (let i = 0; i < 100; i++) s.step(1 / 30);
    expect(drops.map((p) => p.x)).toEqual(xs);
    expect(s.frame.flash.alpha).toBe(0);
  });

  it('vue nulle (carte cachée) : inactive', () => {
    const s = sim();
    s.configure(settings({ type: 'rain' }), 0, 0, {});
    expect(s.active).toBe(false);
    expect(s.particleCount).toBe(0);
  });
});

describe('météo : pas de clignotement brutal', () => {
  it('enveloppe d’un éclair : montée douce, extinction en moins d’une seconde', () => {
    expect(flashEnvelope(-0.1)).toBe(0);
    expect(flashEnvelope(0)).toBe(0);
    expect(flashEnvelope(0.03)).toBeLessThan(0.3);
    expect(flashEnvelope(0.09)).toBeCloseTo(1);
    expect(flashEnvelope(0.75)).toBeLessThan(0.06);
  });

  it('orage : éclairs espacés, jamais au-dessus de 0,28 ; aucun sans « Éclairs »', () => {
    const run = (flashes: boolean, intensity = 1) => {
      const s = new WeatherSim(prng(7));
      s.configure(settings({ type: 'storm', intensity }), 800, 600, { flashes });
      let max = 0;
      let strikes = 0;
      let lit = false;
      let jump = 0;
      let prev = 0;
      for (let i = 0; i < 30 * 120; i++) {
        s.step(1 / 30);
        const a = s.frame.flash.alpha;
        max = Math.max(max, a);
        jump = Math.max(jump, a - prev);
        prev = a;
        if (a > 0.05 && !lit) strikes += 1;
        lit = a > 0.05;
      }
      return { max, strikes, jump };
    };
    const on = run(true);
    expect(on.strikes).toBeGreaterThan(5);
    // Deux minutes : un éclair (parfois doublé) toutes les 4 s au moins
    expect(on.strikes).toBeLessThanOrEqual(2 * (120 / 4) + 2);
    expect(on.max).toBeLessThanOrEqual(0.28 + 1e-9);
    // Pas plus des deux tiers du sommet en une image de 33 ms
    expect(on.jump).toBeLessThan(0.2);
    expect(run(false)).toMatchObject({ max: 0, strikes: 0 });
    // Intensité la plus forte : deux fois plus d'éclairs, toujours doux
    const strong = run(true, 2);
    expect(strong.strikes).toBeGreaterThan(on.strikes * 1.4);
    expect(strong.max).toBeLessThanOrEqual(0.28 + 1e-9);
    expect(strong.jump).toBeLessThan(0.2);
  });

  it('alerte : pulsation lente, fixe sans clignotements ; parasites sans bandes', () => {
    const alert = new WeatherSim(prng(3));
    alert.configure(settings({ type: 'alert' }), 800, 600, {});
    const seen = new Set<number>();
    for (let i = 0; i < 66; i++) {
      alert.step(1 / 30);
      seen.add(Math.round(alert.frame.vignette.alpha * 100));
    }
    expect(seen.size).toBeGreaterThan(10);
    alert.configure(settings({ type: 'alert' }), 800, 600, { flashes: false });
    const a = alert.frame.vignette.alpha;
    alert.step(0.5);
    expect(alert.frame.vignette.alpha).toBe(a);

    const noise = new WeatherSim(prng(3));
    noise.configure(settings({ type: 'static' }), 800, 600, {});
    noise.step(0.2);
    expect(noise.frame.bandCount).toBe(5);
    noise.configure(settings({ type: 'static' }), 800, 600, { flashes: false });
    noise.step(0.2);
    expect(noise.frame.bandCount).toBe(0);
    expect(noise.frame.noise.alpha).toBeGreaterThan(0);
  });
});

describe('météo : cadence et arrêt', () => {
  function env(hidden = false) {
    let clock = 0;
    const timers: { cb: () => void; at: number }[] = [];
    const e: DriverEnv & { hidden: () => boolean; set(v: boolean): void } = {
      now: () => clock,
      setTimeout: (cb, ms) => {
        const t = { cb, at: clock + ms };
        timers.push(t);
        return t;
      },
      clearTimeout: (h) => {
        const i = timers.indexOf(h as (typeof timers)[number]);
        if (i >= 0) timers.splice(i, 1);
      },
      hidden: () => hidden,
      set: (v) => void (hidden = v),
    };
    return {
      env: e,
      timers,
      advance(ms: number) {
        clock += ms;
        const due = timers.filter((t) => t.at <= clock);
        for (const t of due) timers.splice(timers.indexOf(t), 1);
        for (const t of due) t.cb();
      },
      get clock() {
        return clock;
      },
    };
  }

  const on = { active: true, animate: true, visible: true };

  it('anime : une image demandée ~30 ms après la précédente, pas borné', () => {
    const t = env();
    const request = vi.fn();
    const driver = new WeatherDriver(request, t.env);
    // Image commencée à 0 ms, rappel de la météo à 4 ms : l'image suivante vers 28 ms
    t.advance(4);
    expect(driver.frame(0, on)).toBe(0);
    expect(t.timers).toHaveLength(1);
    expect(t.timers[0]!.at).toBeCloseTo(FRAME_TARGET_MS);
    t.advance(FRAME_TARGET_MS);
    expect(request).toHaveBeenCalledTimes(1);
    expect(driver.frame(33, on)).toBeCloseTo(0.033);
    // Retour d'un onglet longtemps en arrière-plan : pas borné
    expect(driver.frame(9000, on)).toBe(MAX_STEP_S);
  });

  it('30 i/s au plus demandées, même sur un écran à 144 Hz', () => {
    const t = env();
    let frames = 0;
    let pending = false;
    const driver = new WeatherDriver(() => void (pending = true), t.env);
    // Écran à 144 Hz : une image à chaque synchronisation où elle a été demandée
    const vsync = 1000 / 144;
    driver.frame(0, on);
    for (let k = 1; k * vsync <= 2000; k++) {
      t.advance(vsync);
      if (!pending) continue;
      pending = false;
      frames += 1;
      driver.frame(t.clock, on);
    }
    expect(frames / 2).toBeLessThanOrEqual(WEATHER_FPS);
    expect(frames / 2).toBeGreaterThan(WEATHER_FPS * 0.8);
  });

  it('pause ou arrêt : aucun minuteur (aucune météo, onglet caché, vue nulle, animation coupée)', () => {
    for (const state of [
      { ...on, active: false },
      { ...on, animate: false },
      { ...on, visible: false },
    ]) {
      const t = env();
      const driver = new WeatherDriver(vi.fn(), t.env);
      driver.frame(0, on);
      expect(driver.scheduled).toBe(true);
      expect(driver.frame(33, state)).toBe(0);
      expect(driver.scheduled).toBe(false);
      expect(t.timers).toHaveLength(0);
    }
    const t = env(true);
    const driver = new WeatherDriver(vi.fn(), t.env);
    expect(driver.frame(0, on)).toBe(0);
    expect(t.timers).toHaveLength(0);
    // Retour sur l'onglet : reprise d'un pas nul
    t.env.set(false);
    expect(driver.frame(5000, on)).toBe(0);
    expect(driver.scheduled).toBe(true);
  });
});

describe('météo : textures calculées', () => {
  it('bruit périodique : il se raccorde sur ses bords, de 0 à 1', () => {
    const size = 64;
    const n = tileableNoise(size, [4, 8], prng(5));
    let seam = 0;
    let step = 0;
    for (let y = 0; y < size; y++) {
      seam = Math.max(seam, Math.abs(n[y * size]! - n[y * size + size - 1]!));
      step = Math.max(step, Math.abs(n[y * size + 1]! - n[y * size]!));
    }
    // L'écart entre les bords opposés vaut celui entre deux pixels voisins
    expect(seam).toBeLessThan(step * 2 + 0.02);
    for (const v of n) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('atlas : une feuille pleine au centre, vide aux coins', () => {
    const px = paint(32, 20, ATLAS_SHADES.leaf1);
    const alphaAt = (x: number, y: number) => px[(y * 32 + x) * 4 + 3]!;
    expect(alphaAt(16, 10)).toBeGreaterThan(200);
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(31, 19)).toBe(0);
  });
});

describe('météo dans le moteur', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('le MJ la règle par une commande annulable, envoyée par PATCH', async () => {
    const t = setup();
    const rain: MapWeather = { type: 'rain', intensity: 0.6 };
    await saveWeather(t.engine, rain);
    expect(t.backend.updateScene).toHaveBeenLastCalledWith({ weather: rain }, 1);
    expect(t.store.getState().scene?.weather).toEqual(rain);
    expect(t.commands.getSnapshot().undoLabel).toBe('Météo');
    // La même météo : rien n'est écrit
    expect(saveWeather(t.engine, { type: 'rain', intensity: 0.6 })).toBeNull();
    await t.engine.commands.undo();
    expect(t.backend.updateScene).toHaveBeenLastCalledWith({ weather: null }, 2);
    expect(t.store.getState().scene?.weather ?? null).toBeNull();
  });

  it('aperçu du MJ pendant un geste, effacé par l’enregistrement', async () => {
    const t = setup();
    const snow: MapWeather = { type: 'snow', intensity: 0.3 };
    setWeatherPreview(t.engine, snow);
    expect(displayedWeather(t.engine)).toBe(snow);
    await saveWeather(t.engine, { ...snow, intensity: 0.5 }, 'Intensité de la météo');
    expect(displayedWeather(t.engine)).toEqual({ ...snow, intensity: 0.5 });
  });

  it('préférences locales : gardées dans le navigateur ; « mouvement réduit » éteint l’animation', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const t = setup();
    expect(weatherPrefs(t.engine).getState()).toEqual({ animate: false, flashes: false });
    setWeatherAnimated(t.engine, true);
    expect(storage.get('vtt:carte:meteo-animee')).toBe('1');
    const again = setup();
    expect(weatherPrefs(again.engine).getState().animate).toBe(true);
  });

  it('sans rendu monté, le module ne fait pas tourner la boucle', () => {
    const t = setup();
    t.engine.use(weatherModule);
    expect(t.engine.getExtensions().toolbarEntries.map((i) => i.id)).toContain('weather:menu');
    t.store
      .getState()
      .setScene(
        { ...t.store.getState().scene!, version: 5, weather: { type: 'rain', intensity: 1 } },
        { force: true },
      );
    expect(t.engine.tick(1000)).toBe(false);
    t.engine.destroy();
  });
});
