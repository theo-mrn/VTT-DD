/**
 * Éléments superposés : un clic sur deux éléments presque confondus demande lequel prendre ;
 * le choix sélectionne l'un, met les autres de côté (intouchables) jusqu'à ce que la
 * sélection change. Un élément posé sur un bien plus grand n'est pas ambigu.
 */
import { describe, expect, it } from 'vitest';
import { rectsConfusable } from '../geometry';
import { box, setup } from '../test-kit';

describe('éléments superposés', () => {
  it('boîtes confondues : même taille à peu près, recouvertes à 60 % au moins', () => {
    const a = { x: 0, y: 0, width: 40, height: 40 };
    expect(rectsConfusable(a, { x: 5, y: 5, width: 40, height: 40 })).toBe(true);
    expect(rectsConfusable(a, { x: 30, y: 30, width: 40, height: 40 })).toBe(false);
    // Un petit sur un grand (token sur un tapis) : pas d'ambiguïté
    expect(rectsConfusable(a, { x: -100, y: -100, width: 400, height: 400 })).toBe(false);
  });

  it('clic sur une pile : menu de choix, rien de sélectionné ni de déplacé', () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 104, 103)] });
    t.click({ x: 102, y: 101 });
    expect(t.engine.ui.getState().picker?.ids).toEqual(['b', 'a']);
    expect(t.engine.selection.ids).toEqual([]);
  });

  it('choisir : l’un sélectionné, l’autre intouchable, puis de retour quand la sélection change', () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 104, 103)] });
    t.engine.chooseAmong('a', ['b', 'a']);
    expect(t.engine.selection.ids).toEqual(['a']);
    expect(t.engine.ui.getState().picker).toBeNull();
    const b = t.engine.entity('b')!;
    expect(b.state.sidelined).toBe(true);
    expect(t.engine.isInteractive(b)).toBe(false);
    // Plus de menu : le clic prend l'élément choisi, qu'on peut glisser
    t.click({ x: 102, y: 101 });
    expect(t.engine.ui.getState().picker).toBeNull();
    expect(t.engine.selection.ids).toEqual(['a']);
    // Clic dans le vide : sélection vidée, l'autre revient
    t.click({ x: 700, y: 700 });
    expect(b.state.sidelined).toBe(false);
    expect(t.engine.isInteractive(b)).toBe(true);
  });

  it('un élément de la pile déjà sélectionné est pris sans menu ; ⇧ ne demande rien', () => {
    const t = setup({ boxes: [box('a', 100, 100), box('b', 104, 103)] });
    t.engine.selection.replace(['a']);
    t.click({ x: 102, y: 101 });
    expect(t.engine.ui.getState().picker).toBeNull();
    expect(t.engine.selection.ids).toEqual(['a']);
    t.engine.selection.clear();
    t.click({ x: 102, y: 101 }, { shift: true });
    expect(t.engine.ui.getState().picker).toBeNull();
  });
});
