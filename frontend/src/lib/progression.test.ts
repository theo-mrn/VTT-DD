import { describe, expect, it } from 'vitest';
import {
  challengePercent,
  levelPercent,
  PLAY_TIME_BATCH,
  PLAY_TIME_MAX,
  PlayTimeCounter,
  stepHref,
  timeLeft,
} from './progression';

describe('progression du compte', () => {
  it('part du niveau en cours', () => {
    expect(levelPercent({ xp: 175, levelXp: 100, nextLevelXp: 250 })).toBe(50);
    expect(levelPercent({ xp: 100, levelXp: 100, nextLevelXp: 250 })).toBe(0);
    expect(levelPercent({ xp: 999, levelXp: 100, nextLevelXp: 250 })).toBe(100);
    expect(levelPercent({ xp: 0, levelXp: 0, nextLevelXp: 0 })).toBe(100);
  });

  it('part d’un défi, accompli compris', () => {
    expect(challengePercent({ progress: 3, target: 10, completed: false })).toBe(30);
    expect(challengePercent({ progress: 3, target: 10, completed: true })).toBe(100);
    expect(challengePercent({ progress: 12, target: 10, completed: false })).toBe(100);
    expect(challengePercent({ progress: 1, target: 0, completed: false })).toBe(0);
  });

  it('temps restant lisible', () => {
    const now = new Date('2026-10-07T10:00:00Z');
    expect(timeLeft('2026-10-07T10:12:00Z', now)).toBe('12 min');
    expect(timeLeft('2026-10-07T13:12:00Z', now)).toBe('3 h 12 min');
    expect(timeLeft('2026-10-07T12:00:00Z', now)).toBe('2 h');
    expect(timeLeft('2026-10-09T14:00:00Z', now)).toBe('2 j 4 h');
    expect(timeLeft('2026-10-06T10:00:00Z', now)).toBe('0 min');
  });

  it('lien d’action de chaque étape', () => {
    expect(stepHref('first_character')).toBe('/personnages/nouveau');
    expect(stepHref('first_friend')).toBe('/amis');
    expect(stepHref('inconnu')).toBe('/campagnes');
  });

  it('compte les minutes d’onglet visible et envoie par lots', () => {
    const c = new PlayTimeCounter();
    for (let i = 1; i < PLAY_TIME_BATCH; i += 1) expect(c.tick(true)).toBe(false);
    expect(c.tick(false)).toBe(false);
    expect(c.value).toBe(PLAY_TIME_BATCH - 1);
    expect(c.tick(true)).toBe(true);
    expect(c.take()).toBe(PLAY_TIME_BATCH);
    expect(c.take()).toBe(0);
    c.restore(PLAY_TIME_MAX + 10);
    expect(c.value).toBe(PLAY_TIME_MAX);
  });
});
