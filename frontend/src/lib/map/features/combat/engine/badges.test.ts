import { describe, expect, it } from 'vitest';
import { badgeLabel, readableSheets, visibleBadges, type MapStateBadge } from './badges';

const state = (name: string, duration: number | null = null): MapStateBadge => ({
  icon: 'etat',
  name,
  duration,
});

describe('badges d’états des tokens', () => {
  it('quatre badges au plus : au-delà, trois et « +n »', () => {
    const three = [state('Aveuglé'), state('Étourdi'), state('À terre')];
    expect(visibleBadges(three)).toEqual({ shown: three, more: 0 });
    const five = [...three, state('Charmé'), state('Empoisonné')];
    const r = visibleBadges(five);
    expect(r.shown.map((s) => s.name)).toEqual(['Aveuglé', 'Étourdi', 'À terre']);
    expect(r.more).toBe(2);
  });

  it('libellé au survol : noms et durées restantes', () => {
    expect(badgeLabel([state('Aveuglé', 2), state('Concentré')])).toBe('Aveuglé (2) · Concentré');
  });

  it('fiches lues : toutes pour le MJ ; pour un joueur, jamais celle d’un PNJ ennemi (Q4)', () => {
    const sides: Record<string, string> = { hero: 'players', ami: 'allies', orc: 'enemies' };
    const ids = ['hero', 'ami', 'orc', 'moi'];
    const sideOf = (id: string) => sides[id];
    expect(readableSheets(ids, { gm: true, mine: [], sideOf })).toEqual(ids);
    expect(readableSheets(ids, { gm: false, mine: ['moi'], sideOf })).toEqual([
      'hero',
      'ami',
      'moi',
    ]);
  });
});
