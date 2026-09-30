import { describe, expect, it } from 'vitest';
import { panelsFor, resolvePanelId } from './registry';

describe('registre des panneaux', () => {
  it('le panneau Combat remplace le panneau MJ (touche M, MJ seul)', () => {
    const combat = panelsFor('gm').find((p) => p.id === 'combat');
    expect(combat?.shortcut.label).toBe('M');
    // L'ancien tableau de bord : ordre à gauche, rapports à droite, toute la largeur
    expect(combat?.width).toBe('full');
    expect(panelsFor('player').some((p) => p.id === 'combat')).toBe(false);
  });

  it('les anciens liens `?panneau=mj` mènent au panneau Combat', () => {
    expect(resolvePanelId('mj')).toBe('combat');
    expect(resolvePanelId('combat')).toBe('combat');
    expect(resolvePanelId('inconnu')).toBeNull();
    expect(resolvePanelId(null)).toBeNull();
  });
});
