import { describe, expect, it } from 'vitest';
import type { Attribut } from '@vtt/rules';
import { dataFor, FIELDS, generateNpc, rollValues } from './generate';

describe('générateur de PNJ', () => {
  it('respecte le peuple et le genre demandés, remplit chaque ligne', () => {
    const data = dataFor('fr');
    const npc = generateNpc(data, 'dwarf', 'female');
    const nains = data.cultures.find((c) => c.id === 'dwarf')!;
    expect(npc.culture).toBe('dwarf');
    expect(nains.female).toContain(npc.first);
    expect(nains.last).toContain(npc.last);
    for (const f of FIELDS) expect(npc[f]).toBeTruthy();
  });

  it('les deux langues ont les mêmes peuples', () => {
    expect(dataFor('en').cultures.map((c) => c.id)).toEqual(
      dataFor('fr').cultures.map((c) => c.id),
    );
  });

  it('tire les valeurs autour du défaut, dans les bornes ; un choix parmi ses options', () => {
    const attributs = [
      { cle: 'FOR', nom: 'Force', nature: 'base', defaut: 10, min: '8', max: '11' },
      { cle: 'camp', nom: 'Camp', nature: 'choix', options: [{ valeur: 'a', nom: 'A' }] },
    ] as unknown as Attribut[];
    for (const r of [0, 0.5, 0.999]) {
      const v = rollValues(attributs, () => r);
      expect(v.FOR).toBeGreaterThanOrEqual(8);
      expect(v.FOR).toBeLessThanOrEqual(11);
      expect(v.camp).toBe('a');
    }
  });
});
