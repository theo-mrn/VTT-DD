import { describe, expect, it } from 'vitest';
import { lirePresentation, idsSystemes } from './sources.js';
import { presentationSource } from './test-utils.js';

describe('présentations des systèmes de référence', () => {
  for (const id of idsSystemes()) {
    if (lirePresentation(id) === undefined) continue;
    it(`${id} : présentation cohérente avec les règles`, () => {
      expect(presentationSource(id).systeme).toBe(id);
    });
  }

  it('Star Wars : chaque dé à symboles a son apparence', () => {
    const p = presentationSource('star-wars-eote');
    expect(Object.keys(p.des!.sortes).sort()).toEqual(
      ['aptitude', 'defi', 'difficulte', 'force', 'fortune', 'infortune', 'maitrise'].sort(),
    );
  });
});
