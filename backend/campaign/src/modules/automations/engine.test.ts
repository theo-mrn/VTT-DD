import { describe, expect, it } from 'vitest';
import {
  actorsOf,
  conditionsHold,
  depthOf,
  hourOf,
  matches,
  nextHourMinutes,
  realTimeOfHour,
  sceneSignals,
  tableSignals,
} from './engine.js';

const clock = (filled: number, segments = 4) => ({
  id: 'c1',
  name: 'La garde',
  segments,
  filled,
  visible: true,
});

describe('moteur des automatismes', () => {
  it('scène du groupe : départ puis arrivée, rien si elle ne change pas', () => {
    expect(sceneSignals({ partyMapId: 'a' }, 'b')).toEqual([
      { type: 'scene.leave', mapId: 'a' },
      { type: 'scene.enter', mapId: 'b' },
    ]);
    expect(sceneSignals({ partyMapId: 'a' }, 'a')).toEqual([]);
    expect(sceneSignals({}, 'a')).toEqual([{ type: 'scene.enter', mapId: 'a' }]);
  });

  it('horloges : un segment, puis pleine une seule fois ; jeton dépensé', () => {
    const premier = tableSignals({}, { clocks: [clock(1)], fate: null });
    expect(premier.signals).toEqual([]);
    const plus = tableSignals(premier.memory, { clocks: [clock(4)], fate: null });
    expect(plus.signals.map((s) => s.type)).toEqual(['clock.segment', 'clock.full']);
    const pareil = tableSignals(plus.memory, { clocks: [clock(4)], fate: null });
    expect(pareil.signals).toEqual([]);
    const jeton = tableSignals(pareil.memory, {
      clocks: [clock(4)],
      fate: { count: 2, max: 5, last: { userId: 'u', at: '2026-10-13T10:00:00Z' } },
    });
    expect(jeton.signals).toEqual([{ type: 'fate.spent', userId: 'u' }]);
    expect(actorsOf(jeton.signals[0]!)).toEqual(['u']);
  });

  it('tour d’un joueur précis ; joueur concerné', () => {
    const tour = { type: 'combat.turn' as const, side: 'players', userIds: ['alice'] };
    expect(matches({ type: 'combat.turn', userId: 'alice' }, tour)).toBe(true);
    expect(matches({ type: 'combat.turn', userId: 'bob' }, tour)).toBe(false);
    expect(matches({ type: 'combat.turn', side: 'players', userId: 'alice' }, tour)).toBe(true);
    expect(actorsOf(tour)).toEqual(['alice']);
  });

  it('déclencheurs et filtres', () => {
    expect(matches({ type: 'scene.enter' }, { type: 'scene.enter', mapId: 'x' })).toBe(true);
    expect(matches({ type: 'scene.enter', mapId: 'y' }, { type: 'scene.enter', mapId: 'x' })).toBe(
      false,
    );
    expect(matches({ type: 'combat.round', every: 2 }, { type: 'combat.round', round: 3 })).toBe(
      false,
    );
    expect(
      matches({ type: 'clock.full', clock: 'la GARDE' }, { type: 'clock.full', clock: 'La garde' }),
    ).toBe(true);
    expect(matches({ type: 'combat.end' }, { type: 'combat.start' })).toBe(false);
  });

  it('conditions : scène, combat, heure à cheval sur minuit, chance', () => {
    const c = { partyMapId: 'm', combatActive: true, hour: 23, random: () => 0.5 };
    expect(conditionsHold([{ type: 'scene.is', mapId: 'm' }], c)).toBe(true);
    expect(conditionsHold([{ type: 'combat.active', value: false }], c)).toBe(false);
    expect(conditionsHold([{ type: 'time.between', from: 22, to: 6 }], c)).toBe(true);
    expect(conditionsHold([{ type: 'time.between', from: 8, to: 20 }], c)).toBe(false);
    expect(conditionsHold([{ type: 'chance', percent: 40 }], c)).toBe(false);
    expect(conditionsHold([{ type: 'chance', percent: 60 }], c)).toBe(true);
  });

  it('temps du monde : heure, prochaine occurrence, instant réel', () => {
    expect(hourOf(1440 + 21 * 60 + 30)).toBe(21);
    expect(nextHourMinutes(600, 8)).toBe(1440 + 480);
    const w = { minutes: 600, rate: 60, anchorAt: new Date(0).toISOString() };
    // 10 h, une heure de jeu par minute : 12 h dans deux minutes
    expect(realTimeOfHour(w, 12, 0)).toBe(120_000);
    expect(realTimeOfHour({ ...w, rate: 0 }, 12, 0)).toBeNull();
  });

  it('profondeur d’enchaînement', () => {
    expect(depthOf('auto:2:abc')).toBe(2);
    expect(depthOf('req-123')).toBe(0);
  });
});
