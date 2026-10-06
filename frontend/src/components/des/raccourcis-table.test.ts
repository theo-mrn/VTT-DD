// @vitest-environment jsdom
/** Raccourcis de dés à la table : la visibilité choisie dans le panneau est relue à chaque jet. */
import { afterEach, describe, expect, it } from 'vitest';
import { visibiliteChoisie } from './raccourcis-table';
import { visibiliteDuBrouillon } from './visibilite';

afterEach(() => localStorage.clear());

describe('visibiliteChoisie', () => {
  it('lit le brouillon du panneau de cette campagne, à chaque appel', () => {
    localStorage.setItem('yner:ui:des:table:c1', JSON.stringify({ visibilite: 'gm', version: 2 }));
    expect(visibiliteChoisie('c1')).toBe('gm');
    localStorage.setItem(
      'yner:ui:des:table:c1',
      JSON.stringify({ visibilite: 'public', version: 2 }),
    );
    expect(visibiliteChoisie('c1')).toBe('public');
  });

  it('sans brouillon ou illisible : la visibilité par défaut', () => {
    const defaut = visibiliteDuBrouillon(undefined, undefined);
    expect(visibiliteChoisie('autre')).toBe(defaut);
    localStorage.setItem('yner:ui:des:table:c2', '{pas du json');
    expect(visibiliteChoisie('c2')).toBe(defaut);
  });
});
