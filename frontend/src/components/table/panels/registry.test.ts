import { describe, expect, it } from 'vitest';
import { panelsFor, resolvePanelId } from './registry';

describe('registre des panneaux', () => {
  it('plus de panneau Combat : le MJ mène le combat depuis sa barre', () => {
    expect(panelsFor('gm').some((p) => (p.id as string) === 'combat')).toBe(false);
    // La touche M ouvre désormais les Rencontres
    expect(panelsFor('gm').find((p) => p.shortcut?.code === 'KeyM')?.id).toBe('rencontres');
    expect(panelsFor('player').some((p) => p.id === 'rencontres')).toBe(false);
  });

  it('les anciens liens `?panneau=mj` et `?panneau=combat` n’ouvrent aucun panneau', () => {
    expect(resolvePanelId('mj')).toBeNull();
    expect(resolvePanelId('combat')).toBeNull();
    expect(resolvePanelId('notes')).toBe('notes');
    expect(resolvePanelId('inconnu')).toBeNull();
    expect(resolvePanelId(null)).toBeNull();
  });
});
