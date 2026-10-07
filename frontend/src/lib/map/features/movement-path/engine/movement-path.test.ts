// @vitest-environment jsdom
/**
 * Trajet des déplacements sur la carte complète (banc `map-harness`) : mon trajet (départ,
 * points de passage par Espace, clic droit ou arrêt, Retour arrière, Échap), envoyé au direct
 * sans jamais révéler un passage d'un PNJ caché ; trajets des autres dessinés puis effacés ;
 * déplacement du personnage ; bascule (⇧T) et règle de la table.
 */
import type { Container } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_KIND, type LiveMessage, type LiveSendOptions } from '@/lib/map/live/live-channel';
import { ALICE, fixtures, GM, mountMap, type MapHarness } from '@/lib/map/test/map-harness';
import { movementPathOf } from './register';
import { pathPrefs, setTableRule, tableRule } from './rule';
import { speedDirectory } from './speeds';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const liveSent = (m: MapHarness) =>
  m.sent
    .filter((s) => s.kind === LIVE_KIND)
    .map((s) => ({ data: s.data as LiveMessage, options: s.options as LiveSendOptions }));

/** Textes des étiquettes de trajet dessinées dans le plan `live`. */
function labels(m: MapHarness): string[] {
  const out: string[] = [];
  const visit = (c: Container, inPath: boolean) => {
    const here = inPath || c.label === 'movement-path';
    const text = (c as unknown as { text?: unknown }).text;
    if (here && typeof text === 'string' && text) out.push(text);
    for (const child of c.children) visit(child as Container, here);
  };
  visit(m.engine.plane('live')!, false);
  return out;
}

const tracker = (m: MapHarness) => movementPathOf(m.engine)!.tracker;

/** Commence un glisser du token posé en `from` et l'amène en `to` (sans lâcher). */
function grab(m: MapHarness, from: { x: number; y: number }, to: { x: number; y: number }) {
  const c = m.engine.controller;
  c.pointerDown(m.pointer(from));
  c.pointerMove(m.pointer({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, { button: -1 }));
  c.pointerMove(m.pointer(to, { button: -1 }));
  m.frame();
}

const moveTo = (m: MapHarness, to: { x: number; y: number }) => {
  m.engine.controller.pointerMove(m.pointer(to, { button: -1 }));
  m.frame();
};

const release = (m: MapHarness, at: { x: number; y: number }) =>
  m.engine.controller.pointerUp(m.pointer(at, { buttons: 0 }));

describe('mon trajet', () => {
  it('Espace et clic droit posent un point de passage, Retour arrière le retire ; le trajet part au direct', async () => {
    h = await mountMap({ viewer: GM });
    grab(h, { x: 300, y: 300 }, { x: 450, y: 300 });
    expect(tracker(h).active?.entityId).toBe('t-heros');
    expect(h.engine.controller.keyDown(h.key(' ', { code: 'Space' }))).toBe(true);
    moveTo(h, { x: 450, y: 500 });
    h.engine.controller.pointerChord(h.pointer({ x: 450, y: 500 }, { button: 2, buttons: 3 }));
    expect(tracker(h).active!.points).toHaveLength(3);
    h.engine.controller.keyDown(h.key('Backspace'));
    expect(tracker(h).active!.points).toHaveLength(2);
    // Trop près du dernier point : rien
    h.engine.controller.keyDown(h.key(' ', { code: 'Space' }));
    h.engine.controller.keyUp(h.key(' ', { code: 'Space' }));
    expect(tracker(h).active!.points).toHaveLength(3);
    h.engine.controller.keyDown(h.key(' ', { code: 'Space' }));
    expect(tracker(h).active!.points).toHaveLength(3);
    // Espace maintenu : pris, sans rafale de points ni vue qui se déplace
    h.engine.controller.keyDown(h.key(' ', { code: 'Space', repeat: true }));
    expect(tracker(h).active!.points).toHaveLength(3);
    expect(h.engine.controller.spaceHeld).toBe(false);
    // Dessiné chez moi, avec la distance
    expect(labels(h)).toHaveLength(1);
    await wait(150);
    release(h, { x: 450, y: 500 });
    await wait(150);
    const msgs = liveSent(h);
    const paths = msgs.flatMap((m) => m.data.path ?? []);
    expect(paths.at(-1)![0]).toBe('t-heros');
    expect(paths.at(-1)![1]).toHaveLength(6);
    expect(msgs.at(-1)!.data.end).toBe(true);
    // Posé : il s'efface, puis disparaît
    h.frames(20, 50);
    expect(labels(h)).toEqual([]);
    expect(tracker(h).active).toBeNull();
  });

  it('un arrêt pose un point de passage, une seule fois', async () => {
    h = await mountMap({ viewer: GM });
    grab(h, { x: 300, y: 300 }, { x: 450, y: 300 });
    h.frames(4, 150);
    expect(tracker(h).active!.points).toHaveLength(2);
    h.frames(10, 150);
    expect(tracker(h).active!.points).toHaveLength(2);
    moveTo(h, { x: 450, y: 450 });
    h.frames(4, 150);
    expect(tracker(h).active!.points).toHaveLength(3);
    release(h, { x: 450, y: 450 });
  });

  it('Échap : le trajet disparaît aussitôt ; un objet glissé n’en a pas', async () => {
    h = await mountMap({ viewer: GM });
    grab(h, { x: 300, y: 300 }, { x: 450, y: 300 });
    h.engine.controller.keyDown(h.key('Escape'));
    h.frame();
    expect(tracker(h).active).toBeNull();
    expect(labels(h)).toEqual([]);
    grab(h, { x: 500, y: 500 }, { x: 600, y: 500 });
    expect(tracker(h).active).toBeNull();
    // Espace pendant le glisser d'un objet : le geste commun (la vue au prochain appui)
    h.engine.controller.keyDown(h.key(' ', { code: 'Space' }));
    expect(h.engine.controller.spaceHeld).toBe(true);
  });

  it('PNJ derrière un mur : son trajet ne va qu’au MJ, même quand il devient visible', async () => {
    const f = fixtures;
    // Un mur sépare le gobelin des héros (x = 600, sur toute la hauteur)
    const collections = {
      layers: [f.layer('persos', 2, 'tokens')],
      tokens: [
        f.token('t-heros', 'c-heros', 300, 300),
        f.token('t-barde', 'c-barde', 300, 400),
        f.token('t-gob', 'c-gobelin', 900, 300),
      ],
      obstacles: [
        f.obstacle('w-mur', 'wall', [
          { x: 600, y: 0 },
          { x: 600, y: 1500 },
        ]),
      ],
    };
    h = await mountMap({ viewer: GM, collections });
    h.frame();
    // Derrière le mur (x = 600) : personne ne le voit ; à l'ouest, tous
    expect(h.engine.liveAudience('t-gob')).toBe('gm');
    grab(h, { x: 900, y: 300 }, { x: 450, y: 300 });
    expect(h.engine.liveAudience('t-gob')).toBe('public');
    h.engine.controller.keyDown(h.key(' ', { code: 'Space' }));
    moveTo(h, { x: 450, y: 450 });
    await wait(150);
    release(h, { x: 450, y: 450 });
    await wait(150);
    const msgs = liveSent(h);
    expect(msgs.some((m) => m.data.drag?.some((d) => d[0] === 't-gob') && !m.options.gmOnly)).toBe(
      true,
    );
    const withPath = msgs.filter((m) => m.data.path);
    expect(withPath.length).toBeGreaterThan(0);
    expect(withPath.every((m) => m.options.gmOnly === true)).toBe(true);
  });

  it('déplacement du personnage connu : « distance / déplacement »', async () => {
    h = await mountMap({ viewer: GM });
    speedDirectory(h.engine).replace(new Map([['c-heros', 2]]));
    grab(h, { x: 300, y: 300 }, { x: 500, y: 300 });
    expect(labels(h)).toEqual(['4 / 2 m']);
    release(h, { x: 500, y: 300 });
  });
});

describe('trajets des autres', () => {
  it('dessiné avec le fantôme du token, effacé après la fin du geste', async () => {
    h = await mountMap({ viewer: ALICE });
    h.receive('mj', { drag: [['t-barde', 450, 300]], path: [['t-barde', [400, 300]]] });
    h.frames(3, 40);
    expect(movementPathOf(h.engine)!.remote.size).toBe(1);
    expect(labels(h)).toHaveLength(1);
    h.receive('mj', { end: true });
    h.frames(30, 50);
    expect(labels(h)).toEqual([]);
    expect(movementPathOf(h.engine)!.remote.size).toBe(0);
  });

  it('effacé par une liste vide (audience qui change)', async () => {
    h = await mountMap({ viewer: ALICE });
    h.receive('mj', { drag: [['t-barde', 450, 300]], path: [['t-barde', [400, 300]]] });
    h.frames(2, 40);
    h.receive('mj', { path: [['t-barde', []]] });
    h.frames(2, 40);
    expect(labels(h)).toEqual([]);
  });
});

describe('bascule et règle de la table', () => {
  it('⇧T coupe mes trajets ; ils partent quand même aux autres', async () => {
    h = await mountMap({ viewer: GM });
    h.press('T', { shift: true, code: 'KeyT' });
    expect(pathPrefs(h.engine).getState().shown).toBe(false);
    grab(h, { x: 300, y: 300 }, { x: 450, y: 300 });
    expect(labels(h)).toEqual([]);
    await wait(150);
    release(h, { x: 450, y: 300 });
    await wait(150);
    expect(liveSent(h).some((m) => m.data.path)).toBe(true);
    h.press('T', { shift: true, code: 'KeyT' });
    expect(pathPrefs(h.engine).getState().shown).toBe(true);
  });

  it('règle du MJ : enregistrée dans l’affichage de la scène, annulable', async () => {
    h = await mountMap({ viewer: GM });
    const scene = () => h!.store.getState().scene;
    await setTableRule(h.engine, 'hidden');
    expect(tableRule(scene())).toBe('hidden');
    await setTableRule(h.engine, 'free');
    expect((scene()!.display as Record<string, unknown>).movement_paths).toBeUndefined();
    await h.commands.undo();
    expect(tableRule(scene())).toBe('hidden');
  });

  it('règle « Masqués » : un joueur ne voit aucun trajet, et ⇧T n’y change rien', async () => {
    h = await mountMap({ viewer: ALICE, scene: { display: { movement_paths: false } } });
    h.receive('mj', { drag: [['t-barde', 450, 300]], path: [['t-barde', [400, 300]]] });
    h.frames(3, 40);
    expect(labels(h)).toEqual([]);
    h.press('T', { shift: true, code: 'KeyT' });
    expect(pathPrefs(h.engine).getState().shown).toBe(true);
  });

  it('règle « Toujours affichés » : imposée au joueur malgré sa préférence', async () => {
    h = await mountMap({ viewer: ALICE, scene: { display: { movement_paths: true } } });
    pathPrefs(h.engine).setState({ shown: false });
    h.receive('mj', { drag: [['t-barde', 450, 300]], path: [['t-barde', [400, 300]]] });
    h.frames(3, 40);
    expect(labels(h)).toHaveLength(1);
  });
});
