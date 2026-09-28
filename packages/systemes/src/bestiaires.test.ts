import { checkBestiary } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { idsSystemes, lireBestiaire } from './sources.js';
import { chargerSource } from './test-utils.js';

describe('bestiaires de référence des systèmes', () => {
  for (const id of idsSystemes()) {
    const brut = lireBestiaire(id);
    if (brut === undefined) continue;
    it(`${id} : chaque créature est cohérente avec les règles`, () => {
      const r = checkBestiary(brut, chargerSource(id));
      if (!r.ok) throw new Error(r.erreurs.map((e) => `${e.chemin} : ${e.message}`).join('\n'));
      expect(r.bestiary.creatures.length).toBeGreaterThan(0);
    });
  }
});
