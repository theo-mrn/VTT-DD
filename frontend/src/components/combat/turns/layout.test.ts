import { describe, expect, it } from 'vitest';
import { combatLayout } from './layout';

describe('mise en page selon la largeur du panneau', () => {
  it('téléphone : une colonne, en-tête serré', () => {
    expect(combatLayout(375)).toEqual({ mode: 'stack', reportColumns: 1, compactHeader: true });
  });

  it('panneau moyen : empilé, rapports sur deux colonnes', () => {
    expect(combatLayout(640)).toEqual({ mode: 'stack', reportColumns: 2, compactHeader: false });
  });

  it('tablette et grand panneau : ordre à gauche, rapports à droite', () => {
    expect(combatLayout(768)).toEqual({ mode: 'split', reportColumns: 1, compactHeader: false });
    // Panneau « full » d'un écran de bureau (72 rem)
    expect(combatLayout(1152)).toEqual({ mode: 'split', reportColumns: 2, compactHeader: false });
  });

  it('pas encore mesuré : empilé, sans rien replier', () => {
    expect(combatLayout(0)).toEqual({ mode: 'stack', reportColumns: 1, compactHeader: false });
    expect(combatLayout(Number.NaN).mode).toBe('stack');
  });
});
