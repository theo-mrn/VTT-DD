// @vitest-environment jsdom
/**
 * Barre réelle, tous les modules de l'app chargés (docs/carte.md § 6) : ce que voit chaque rôle,
 * et aucune touche prise deux fois pour un même rôle (outils et actions confondus).
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { MapViewer } from '../engine/entities/entity-kind';
import { toolbarGroups } from '../engine/toolbar';
import { ALICE, GM, mountMap, SPECTATOR, type MapHarness } from './map-harness';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

async function barOf(viewer: MapViewer) {
  h?.destroy();
  h = await mountMap({ viewer });
  const sections = toolbarGroups(
    h.engine.tools.getDefinitions(),
    h.engine.getExtensions().toolbarEntries,
    viewer,
  );
  return Object.fromEntries(sections.map((s) => [s.group, s.slots.map((x) => x.id)]));
}

describe('barre d’outils, modules de l’app', () => {
  it('MJ : historique, vue, aides', async () => {
    const bar = await barOf(GM);
    expect(bar.tools?.[0]).toBe('select');
    expect(bar.history).toEqual(['history.undo', 'history.redo']);
    expect(bar.view).toEqual([
      'vision:view',
      'weather:menu',
      'voice:menu',
      'grid:menu',
      'grid:scale',
      'layers.panel',
      'scene.background',
      'scene.display',
    ]);
    expect(bar.assist).toEqual(['snap', 'movement-path:menu', 'presence.cursor', 'camera.fit']);
  });

  it('joueur : bulle, sans calques ni fond', async () => {
    const bar = await barOf(ALICE);
    expect(bar.history).toEqual(['history.undo', 'history.redo']);
    expect(bar.view?.[0]).toBe('bubbles');
    expect(bar.view).not.toContain('layers.panel');
    expect(bar.view).not.toContain('scene.display');
    expect(bar.assist).toEqual(['snap', 'movement-path:menu', 'presence.cursor', 'camera.fit']);
  });

  it('spectateur : sélection, trajets et recadrer, ni historique ni curseur', async () => {
    const bar = await barOf(SPECTATOR);
    expect(bar.tools).toEqual(['select']);
    expect(bar.history).toBeUndefined();
    expect(bar.assist).toEqual(['movement-path:menu', 'camera.fit']);
  });

  it('surcouches des modules : bulles, sons, groupe, calques (colonne de droite)', async () => {
    h = await mountMap({ viewer: GM });
    const slots = Object.fromEntries(
      h.engine.getExtensions().overlays.map((o) => [o.id, o.slot] as const),
    );
    expect(slots).toMatchObject({
      'bubbles.layer': 'none',
      'sounds.listen': 'none',
      'party.bar': 'none',
      'layers.panel': 'right',
    });
  });

  it.each([GM, ALICE, SPECTATOR])('touches uniques ($role)', async (viewer) => {
    h = await mountMap({ viewer });
    const keys = [
      ...h.engine.tools.availableFor(viewer).flatMap((t) => (t.shortcut ? [t.shortcut.code] : [])),
      ...h.engine
        .allActions()
        .filter((a) => a.shortcut && (!a.available || a.available(viewer)))
        .map((a) => a.shortcut!.code),
    ];
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
  });
});
