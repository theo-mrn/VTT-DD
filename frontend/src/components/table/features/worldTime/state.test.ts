import { describe, expect, it } from 'vitest';
import { currentMinutes, DAY, nextHour, normalizeWorldTime, partsOf, periodOf } from './state';

describe('temps du monde', () => {
  it('découpe les minutes en jour, heure et minute', () => {
    expect(partsOf(0)).toEqual({ day: 1, hour: 0, minute: 0 });
    expect(partsOf(DAY + 14 * 60 + 30)).toEqual({ day: 2, hour: 14, minute: 30 });
  });

  it('nomme le moment de la journée', () => {
    expect(periodOf(6)).toBe('dawn');
    expect(periodOf(12)).toBe('noon');
    expect(periodOf(19)).toBe('dusk');
    expect(periodOf(2)).toBe('night');
  });

  it('le matin suivant : le jour même avant 7 h, sinon le lendemain', () => {
    expect(nextHour(5 * 60, 7)).toBe(7 * 60);
    expect(nextHour(9 * 60, 7)).toBe(DAY + 7 * 60);
  });

  it('refuse une valeur illisible ; l’heure reçue vaut à partir de la réception', () => {
    expect(normalizeWorldTime({ minutes: 'x' })).toBeNull();
    expect(normalizeWorldTime({ minutes: 61.6, rate: 60 }, 1000)).toEqual({
      minutes: 61.6,
      visible: true,
      rate: 60,
      since: 1000,
    });
  });

  it('s’écoule à la vitesse choisie, figé à 0', () => {
    const t = { minutes: 600, visible: true, rate: 60, since: 0 };
    expect(currentMinutes(t, 60_000)).toBe(660);
    expect(currentMinutes({ ...t, rate: 0 }, 60_000)).toBe(600);
    expect(partsOf(currentMinutes(t, 90_000))).toEqual({ day: 1, hour: 11, minute: 30 });
  });
});
