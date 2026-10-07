/** Chaque skin de dés a son nom et sa description au catalogue des langues (`diceSkins`). */
import { describe, expect, it } from 'vitest';
import diceSkins from '@/i18n/messages/fr/diceSkins';
import { DICE_SKINS } from './three/dice-definitions';

describe('textes des skins de dés', () => {
  it('un skin des définitions = une entrée du catalogue, et inversement', () => {
    expect(Object.keys(diceSkins).sort()).toEqual(Object.keys(DICE_SKINS).sort());
  });
});
