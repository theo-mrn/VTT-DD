import { describe, expect, it } from 'vitest';
import { dataFor, FIELDS, generateNpc } from './generate';

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
});
