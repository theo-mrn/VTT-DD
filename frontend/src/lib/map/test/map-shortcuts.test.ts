// @vitest-environment jsdom
/**
 * Catalogue des raccourcis de la carte (`lib/map/shortcuts.ts`) contre ce que déclarent les
 * fonctions chargées : chaque outil de la barre et chaque action y est, avec la même touche
 * par défaut et les mêmes rôles. Une fonction qui ajoute un outil ou une action ajoute sa ligne.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { MapViewer } from '../engine/entities/entity-kind';
import { MAP_SHORTCUTS, mapActionShortcut, mapToolShortcut } from '../shortcuts';
import { ALICE, GM, mountMap, SPECTATOR, type MapHarness } from './map-harness';

/** Disponibles selon le navigateur, pas selon le rôle. */
const BY_DEVICE = new Set(['map.action.fullscreen.toggle']);

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

const roleOf = (v: MapViewer) => v.role;

describe('catalogue des raccourcis de la carte', () => {
  it('chaque outil et action déclaré est au catalogue, avec sa touche par défaut', async () => {
    h = await mountMap({ viewer: GM });
    const declared = [
      ...h.engine.tools
        .getDefinitions()
        .filter((t) => !t.hidden)
        .map(mapToolShortcut),
      // Annuler, Refaire : leur touche (⌘Z…) est un geste standard, au catalogue à part
      ...h.engine
        .allActions()
        .filter((a) => !a.hint)
        .map(mapActionShortcut),
    ];
    const catalog = new Map(MAP_SHORTCUTS.map((d) => [d.id, d]));
    for (const d of declared) {
      expect(catalog.get(d.id), `${d.id} manque dans lib/map/shortcuts.ts`).toBeDefined();
      expect(catalog.get(d.id)!.defaultBinding, d.id).toBe(d.defaultBinding);
    }
    expect(MAP_SHORTCUTS.map((d) => d.id).sort()).toEqual(declared.map((d) => d.id).sort());
  });

  it.each([GM, ALICE, SPECTATOR])('rôles du catalogue ($role)', async (viewer) => {
    h = await mountMap({ viewer });
    const available = new Set([
      ...h.engine.tools
        .availableFor(viewer)
        .filter((t) => !t.hidden)
        .map((t) => mapToolShortcut(t).id),
      ...h.engine
        .allActions()
        .filter((a) => !a.available || a.available(viewer))
        .map((a) => mapActionShortcut(a).id),
    ]);
    for (const d of MAP_SHORTCUTS) {
      if (BY_DEVICE.has(d.id)) continue;
      const inCatalog = !d.roles || d.roles.includes(roleOf(viewer));
      expect(available.has(d.id), d.id).toBe(inCatalog);
    }
  });

  it('touche choisie : l’outil et l’action suivent', async () => {
    h = await mountMap({ viewer: GM });
    h.engine.setBindingResolver((d) =>
      d.id === 'map.tool.draw'
        ? 'Shift+KeyD'
        : d.id === 'map.action.grid.toggle'
          ? null
          : d.defaultBinding,
    );
    expect(h.engine.tools.byShortcut('KeyP')).toBeUndefined();
    expect(h.engine.tools.byShortcut('Shift+KeyD')?.id).toBe('draw');
    expect(h.engine.actionForKey('KeyQ')).toBeNull();
    expect(h.engine.actionForKey('KeyK')?.id).toBe('layers.panel');
  });
});
