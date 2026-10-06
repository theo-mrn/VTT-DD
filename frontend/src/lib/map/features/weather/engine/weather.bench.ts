/**
 * Coût CPU de la météo par image (docs/carte.md § 10, Météo), à blanc : pas de simulation et
 * ancrage au déplacement, au pire (orage le plus fort, plafond atteint), plus les calculs faits
 * une fois (changement d'effet, textures). Le rendu GPU se mesure en développement dans le
 * navigateur (`window.__vttWeather.summary()`, étapes `draw` et `frame`).
 *
 * `pnpm --filter @vtt/web exec vitest bench --run src/lib/map/features/weather/engine/weather.bench.ts`
 */
import { bench, describe } from 'vitest';
import { normalizeWeather } from './model';
import { WeatherSim } from './simulation';
import { paintMist, tileableNoise } from './textures';

function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const weather = (type: string, intensity = 2) => normalizeWeather({ type, intensity })!;

function running(type: string, width: number, height: number, windows = false) {
  const sim = new WeatherSim(prng(1));
  sim.configure(weather(type), width, height, { windows });
  return sim;
}

describe('météo : une image (simulation et ancrage)', () => {
  const cases = [
    ['orage le plus fort, 1920 × 1080', running('storm', 1920, 1080)],
    ['orage le plus fort, 3840 × 2160 (plafond)', running('storm', 3840, 2160)],
    ['orage le plus fort, Windows 1920 × 1080', running('storm', 1920, 1080, true)],
    ['blizzard le plus fort, 1920 × 1080', running('blizzard', 1920, 1080)],
    ['feuilles les plus fortes, 1920 × 1080', running('leaves', 1920, 1080)],
  ] as const;
  for (const [name, sim] of cases)
    bench(`${name} (${sim.particleCount} particules)`, () => {
      sim.step(1 / 30);
      sim.shift(2, -1);
    });
});

describe('météo : une fois', () => {
  bench('changement d’effet (pluie ⇄ orage), 1920 × 1080', () => {
    const sim = new WeatherSim(prng(2));
    sim.configure(weather('rain'), 1920, 1080, {});
    sim.configure(weather('storm'), 1920, 1080, {});
  });
  bench('bruit des nappes (256 × 256)', () => {
    paintMist(256, prng(3));
  });
  bench('bruit seul (256 × 256, 4 octaves)', () => {
    tileableNoise(256, [4, 8, 16, 32], prng(4));
  });
});
