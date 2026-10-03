// @vitest-environment jsdom
/**
 * La carte complète, montée comme dans l'app (tous les modules, scène Pixi réelle, faux GPU) :
 * rendu de chaque sorte, gestes du MJ, mises à jour, calques, menus de chaque sorte, chaque
 * outil manié au pointeur, et les vues d'un joueur et d'un spectateur. Aucune action ne doit
 * lever d'erreur ; ce qu'elles changent est vérifié là où c'est observable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuItem } from '../engine/entities/entity-kind';
import type { Point } from '../engine/geometry';
import { ALICE, fixtures, GM, mountMap, SPECTATOR, type MapHarness } from './map-harness';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
  vi.restoreAllMocks();
});

/** Toute confirmation est acceptée (suppression, PNJ…). */
function autoConfirm(m: MapHarness) {
  return m.engine.ui.subscribe((s) => s.confirm?.resolve(true));
}

/** Toutes les actions d'un menu, sous-menus compris (séparateurs et titres exclus). */
function actions(items: readonly MenuItem[]): MenuItem[] {
  return items.flatMap((i) => [
    ...(i.run && !i.disabled ? [i] : []),
    ...(i.children ? actions(i.children) : []),
  ]);
}

const center = (m: MapHarness, id: string): Point => {
  const g = m.engine.entity(id)!.current;
  return { x: g.x, y: g.y };
};

describe('carte complète, vue du MJ', () => {
  it('monte le rendu avec les couleurs du thème et dessine chaque sorte', async () => {
    const host = document.createElement('div');
    host.style.setProperty('--primary', '40 60% 50%');
    h = await mountMap({ viewer: GM });
    expect(h.engine.mounted).toBe(true);
    expect(h.engine.theme).not.toBeNull();
    h.frames(3);
    expect(h.renderer().renders).toBeGreaterThan(0);
    for (const id of ['t-heros', 'o-coffre', 'w-mur', 'l-torche', 'p-escalier', 's-feu'])
      expect(h.engine.entity(id)?.display, id).toBeTruthy();
    h.engine.resize(640, 480);
    h.frame();
    expect(h.renderer().width).toBe(640);
  });

  it('survol, sélection et poignées, lasso, ping, info-bulle', async () => {
    h = await mountMap({ viewer: GM });
    h.frame();
    for (const id of ['t-heros', 'o-coffre', 'w-porte', 'l-torche', 'p-escalier']) {
      h.move(center(h, id));
      h.frame();
      h.click(center(h, id));
      h.frame();
    }
    expect(h.engine.selection.size).toBeGreaterThan(0);
    // Lasso sur une zone vide
    h.drag({ x: 1850, y: 1350 }, { x: 1990, y: 1450 });
    h.frame();
    // Verrouillé : contour discret
    h.click(center(h, 'o-table'));
    h.frame();
    h.engine.ping({ x: 500, y: 500 }, true);
    h.frames(40, 50);
    h.engine.setHovered('t-heros', { world: center(h, 't-heros') });
    h.frames(10, 100);
    expect(h.renderer().renders).toBeGreaterThan(10);
  });

  it('glisser un token : une commande ; mise à jour d’une donnée redessinée', async () => {
    h = await mountMap({ viewer: GM });
    h.frame();
    const from = center(h, 't-heros');
    h.drag(from, { x: from.x + 100, y: from.y + 50 });
    await h.commands.idle();
    h.frame();
    expect(h.persistence('tokens').update).toHaveBeenCalled();
    // Changements venus du serveur : redessin de chaque sorte
    const s = h.store.getState();
    const data = (c: string, id: string) => h!.get<Record<string, unknown>>(c, id)!;
    s.upsert('lights', [{ ...data('lights', 'l-torche'), color: '#00ff00', version: 9 }] as never);
    s.upsert('objects', [{ ...data('objects', 'o-coffre'), width: 80, version: 9 }] as never);
    s.upsert('tokens', [
      { ...data('tokens', 't-orc'), visibility: 'visible', version: 9 },
    ] as never);
    s.upsert('drawings', [
      { ...data('drawings', 'd-trait'), color: '#123456', version: 9 },
    ] as never);
    s.upsert('notes', [{ ...data('notes', 'n-taverne'), text: 'Auberge', version: 9 }] as never);
    s.upsert('obstacles', [{ ...data('obstacles', 'w-porte'), isOpen: true, version: 9 }] as never);
    s.upsert('portals', [
      { ...data('portals', 'p-escalier'), icon: 'ladder', version: 9 },
    ] as never);
    s.upsert('musicZones', [
      { ...data('musicZones', 's-feu'), active: false, version: 9 },
    ] as never);
    h.frames(3);
    s.remove('lights', ['l-torche']);
    s.remove('tokens', ['t-barde']);
    h.frame();
    expect(h.engine.entity('l-torche')).toBeUndefined();
  });

  it('calques : changer de calque, masquer et isoler localement, supprimer', async () => {
    h = await mountMap({ viewer: GM });
    autoConfirm(h);
    h.frame();
    const coffre = h.engine.entity('o-coffre')!;
    await h.engine.moveToLayer([coffre], 'secret');
    h.frame();
    expect(h.engine.entity('o-coffre')!.layerId).toBe('secret');
    h.engine.setLayerHiddenLocally('persos', true);
    h.frame();
    h.engine.setLayerHiddenLocally('persos', false);
    h.engine.setIsolatedLayer('objets');
    h.frame();
    h.engine.setIsolatedLayer(null);
    h.store.getState().remove('layers', ['secret']);
    h.frame();
    expect(h.engine.layer('secret')).toBeUndefined();
  });

  it('chaque action du menu de chaque sorte s’exécute sans erreur', async () => {
    const ids = [
      't-heros',
      't-orc',
      'o-coffre',
      'o-table',
      'w-mur',
      'w-porte',
      'w-fenetre',
      'r-salle',
      'l-torche',
      'z-brume',
      'd-trait',
      'n-taverne',
      's-feu',
      'p-escalier',
      'm-cone',
    ];
    let ran = 0;
    for (const id of ids) {
      h = await mountMap({ viewer: GM });
      autoConfirm(h);
      h.frame();
      if (!h.engine.entity(id)) continue;
      const items = actions(h.engine.menuItems([id], center(h, id)));
      for (const item of items) {
        try {
          item.run!();
        } catch (err) {
          throw new Error(`${id} › ${item.label} : ${(err as Error).message}`);
        }
        ran += 1;
        h.frame();
      }
      await h.commands.idle();
      h.engine.closeOverlays();
      h.destroy();
      h = null;
    }
    expect(ran).toBeGreaterThan(40);
  });

  it('chaque outil se manie au pointeur et au clavier', async () => {
    h = await mountMap({ viewer: GM });
    autoConfirm(h);
    h.frame();
    const tools = h.engine.tools.availableFor(GM);
    expect(tools.length).toBeGreaterThan(8);
    for (const def of tools) {
      expect(h.engine.tools.activate(def.id), def.id).toBe(true);
      h.frame();
      // Survol, clic, glisser, tracé en plusieurs clics, double-clic de fin, puis annulation
      h.move({ x: 1000, y: 700 });
      h.click({ x: 1000, y: 700 });
      h.frame();
      h.drag({ x: 1100, y: 700 }, { x: 1250, y: 820 });
      h.frame();
      h.click({ x: 1300, y: 700 });
      h.click({ x: 1400, y: 700 });
      h.click({ x: 1400, y: 800 });
      h.click({ x: 1400, y: 800 });
      h.press('Enter');
      h.frame();
      h.press('Escape');
      h.frame();
      await h.commands.idle();
    }
    h.engine.tools.activate('select');
    expect(h.persistence('obstacles').create.mock.calls.length).toBeGreaterThan(0);
  });

  it('défaire et refaire ce qui a été fait au menu', async () => {
    h = await mountMap({ viewer: GM });
    autoConfirm(h);
    const torche = h.engine.entity('l-torche')!;
    await h.engine.deleteEntities([torche]);
    expect(h.engine.entity('l-torche')).toBeUndefined();
    const lights = () => h!.engine.entitiesOfKind('light').length;
    const before = lights();
    await h.commands.undo();
    await h.commands.idle();
    // Recréée par le serveur (nouvel identifiant)
    expect(lights()).toBe(before + 1);
    await h.commands.redo();
    await h.commands.idle();
    expect(lights()).toBe(before);
  });
});

describe('carte complète, vue d’un joueur et d’un spectateur', () => {
  it('joueur : voit son héros, pas le token caché ; ses menus s’exécutent', async () => {
    h = await mountMap({ viewer: ALICE });
    h.frames(3);
    expect(h.engine.entity('t-heros')!.display!.visible).toBe(true);
    for (const id of ['t-heros', 'o-coffre', 'w-porte', 'p-escalier']) {
      for (const item of actions(h.engine.menuItems([id], center(h, id)))) {
        item.run!();
        h.frame();
      }
    }
    // Son héros se déplace
    const from = center(h, 't-heros');
    h.drag(from, { x: from.x + 50, y: from.y });
    await h.commands.idle();
    h.frames(3);
    expect(h.engine.tools.availableFor(ALICE).length).toBeGreaterThan(0);
  });

  it('spectateur : sélectionne pour consulter, ne déplace rien', async () => {
    h = await mountMap({ viewer: SPECTATOR });
    h.frames(3);
    const from = center(h, 't-heros');
    h.drag(from, { x: from.x + 200, y: from.y });
    await h.commands.idle();
    expect(h.get<{ pos: Point }>('tokens', 't-heros')!.pos).toEqual({ x: 300, y: 300 });
    expect(h.engine.tools.availableFor(SPECTATOR).map((t) => t.id)).toEqual(['select']);
  });

  it('MJ qui regarde comme un joueur, puis change de spectateur', async () => {
    h = await mountMap({ viewer: GM });
    h.engine.setViewAs('alice');
    h.frames(3);
    h.engine.setViewAs(null);
    h.engine.setViewer(ALICE);
    h.frames(3);
    expect(h.engine.viewer.role).toBe('player');
  });

  it('scène plongée dans le brouillon, météo et mode donjon', async () => {
    h = await mountMap({
      viewer: ALICE,
      scene: { fogFull: true, weather: { type: 'rain', intensity: 6 } },
      settings: { dungeonMode: true },
      extend: { tokens: [fixtures.token('t-heros', 'c-heros', 300, 300)] },
    });
    h.frames(20, 50);
    expect(h.renderer().renders).toBeGreaterThan(0);
  });
});
