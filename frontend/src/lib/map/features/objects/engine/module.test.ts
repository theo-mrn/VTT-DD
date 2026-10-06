/**
 * Branchement du module « objets » : la fouille des joueurs et les avis du MJ passent par une
 * surcouche sans emplacement (`registerOverlay`), jamais par une entrée de barre d'outils vide.
 */
import { describe, expect, it } from 'vitest';
import { setup } from '@/lib/map/engine/test-kit';
import { objectsFeature } from '../index';
import { PLAYER, SPECTATOR, GM } from './objects-test-kit';

describe('module objets', () => {
  it('surcouche « objects-host » sans emplacement, pour le MJ et les joueurs', () => {
    const t = setup();
    t.engine.use(objectsFeature);
    const { overlays, toolbarEntries } = t.engine.getExtensions();
    const host = overlays.find((o) => o.id === 'objects-host');
    expect(host?.slot).toBe('none');
    expect(toolbarEntries.map((i) => i.id)).not.toContain('objects-host');
    expect(host?.available?.(GM)).toBe(true);
    expect(host?.available?.(PLAYER)).toBe(true);
    expect(host?.available?.(SPECTATOR)).toBe(false);
  });
});
