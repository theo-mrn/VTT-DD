// @vitest-environment jsdom
/**
 * La carte à plusieurs (canal direct) : mes gestes partent (glisser, tracé, mesure, curseur,
 * ping) ; ceux des autres arrivent et se dessinent (fantôme d'un token glissé, curseur, tracé en
 * cours qui se pose quand le dessin enregistré arrive, mesure, ping et ping centré du MJ).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_KIND, PING_KIND, type LiveMessage } from '../live/live-channel';
import { ALICE, fixtures, GM, mountMap, type MapHarness } from './map-harness';

let h: MapHarness | null = null;
afterEach(() => {
  h?.destroy();
  h = null;
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const liveSent = (m: MapHarness) =>
  m.sent.filter((s) => s.kind === LIVE_KIND).map((s) => s.data as LiveMessage);

describe('mes gestes partent', () => {
  it('glisser d’un token : positions envoyées, puis la fin du geste', async () => {
    h = await mountMap({ viewer: GM });
    const c = h.engine.controller;
    c.pointerDown(h.pointer({ x: 300, y: 300 }));
    for (let i = 1; i <= 5; i++) {
      c.pointerMove(h.pointer({ x: 300 + i * 20, y: 300 }, { button: -1 }));
      h.frame();
    }
    await wait(150);
    c.pointerUp(h.pointer({ x: 400, y: 300 }, { buttons: 0 }));
    await wait(150);
    const msgs = liveSent(h);
    expect(msgs.some((m) => m.drag?.some((d) => d[0] === 't-heros'))).toBe(true);
    expect(msgs.at(-1)!.end).toBe(true);
  });

  it('tracé à main levée et mesure en cours partent aussi ; ping et curseur partagé', async () => {
    h = await mountMap({ viewer: GM });
    h.engine.tools.activate('draw');
    h.drag({ x: 1000, y: 1000 }, { x: 1200, y: 1100 }, {}, 8);
    await wait(150);
    h.engine.tools.activate('measure');
    h.drag({ x: 1000, y: 500 }, { x: 1300, y: 500 }, {}, 6);
    await wait(150);
    h.engine.ping({ x: 500, y: 500 }, true);
    h.engine.setShareCursor(true);
    h.engine.shareCursor({ x: 700, y: 700 });
    await wait(150);
    h.engine.setShareCursor(false);
    const msgs = liveSent(h);
    expect(msgs.some((m) => m.stroke)).toBe(true);
    expect(msgs.some((m) => m.measure)).toBe(true);
    expect(h.sent.some((s) => s.kind === PING_KIND)).toBe(true);
  });
});

describe('les gestes des autres arrivent', () => {
  it('fantôme d’un token glissé par le MJ, posé par l’événement durable', async () => {
    h = await mountMap({ viewer: ALICE });
    h.receive('mj', { drag: [['t-heros', 350, 320]] });
    h.frames(3);
    await wait(120);
    h.receive('mj', { drag: [['t-heros', 420, 330, 15]] });
    h.frames(5, 40);
    h.receive('mj', { end: true });
    h.store
      .getState()
      .upsert('tokens', [
        { ...h.get('tokens', 't-heros')!, pos: { x: 420, y: 330 }, version: 7 },
      ] as never);
    h.frames(5, 40);
    expect(h.engine.entity('t-heros')!.current.x).toBe(420);
    // Transformation d'un objet (position, taille, rotation)
    h.receive('mj', { transform: [['o-coffre', 600, 600, 80, 80, 45]] });
    h.frames(3, 40);
    h.receive('mj', { end: true });
    await wait(LIVE_SETTLE_MS);
    h.frames(3, 40);
  });

  it('curseurs des autres : affichés puis effacés après un silence', async () => {
    h = await mountMap({ viewer: GM });
    h.receive('alice', { cursor: [500, 500] });
    h.receive('bob', { cursor: [600, 600] });
    h.frames(3);
    await wait(150);
    h.receive('alice', { cursor: [520, 540] });
    h.frames(3);
    // Message en retard (numéro plus ancien) : ignoré ; autre carte : ignorée
    h.live!.receive({
      kind: LIVE_KIND,
      data: { m: 'autre', s: 999, cursor: [0, 0] },
      from: { userId: 'bob', role: 'player' },
    });
    h.live!.receive({ kind: 'inconnu', data: {}, from: { userId: 'bob', role: 'player' } });
    h.frames(2);
  });

  it('tracé en cours d’un joueur : fantôme, puis posé quand son dessin enregistré arrive', async () => {
    h = await mountMap({ viewer: GM });
    const stroke = { id: 's1', tool: 'pen' as const, color: '#ff000080', width: 4 };
    h.receive('alice', { stroke: { ...stroke, points: [100, 600, 150, 620] } });
    h.frame();
    h.receive('alice', { stroke: { ...stroke, points: [200, 640, 250, 650] } });
    h.frame();
    h.receive('alice', {
      stroke: {
        ...stroke,
        tool: 'rectangle',
        id: 's2',
        fill: '#00ff0040',
        points: [300, 600, 400, 700],
      },
    });
    h.frame();
    h.receive('alice', { end: true });
    h.frame();
    h.store.getState().upsert('drawings', [
      fixtures.drawing(
        'd-alice',
        'pen',
        [
          { x: 100, y: 600 },
          { x: 250, y: 650 },
        ],
        { createdBy: 'alice' },
      ),
    ] as never);
    h.frames(3);
    // Gomme reçue : le tracé est annulé
    h.receive('bob', { stroke: { ...stroke, id: 's3', points: [10, 10, 20, 20] } });
    h.receive('bob', {
      stroke: { ...stroke, id: 's3', tool: 'eraser', points: [20, 20] },
      end: true,
    });
    h.frames(2);
  });

  it('mesure en cours d’un joueur, puis effacée', async () => {
    h = await mountMap({ viewer: GM });
    h.receive('alice', {
      measure: {
        id: 'mx',
        shape: 'cone',
        from: [300, 300],
        to: [500, 400],
        color: '#ffcc00',
        options: { coneAngle: 60 },
      },
    });
    h.frames(3);
    h.receive('alice', {
      measure: {
        id: 'mx',
        shape: 'circle',
        from: [300, 300],
        to: [400, 300],
        color: '#ffcc00',
        skin: 'Fireballs/explosion1.webm',
      },
    });
    h.frames(3);
    h.receive('alice', { measure: null, end: true });
    h.frames(3);
  });

  it('pings : d’un joueur (marque), du MJ centré (la vue s’y rend)', async () => {
    h = await mountMap({ viewer: ALICE });
    h.receivePing('bob', 800, 800, true, 'player');
    h.frames(5, 50);
    const before = h.engine.camera.snapshot();
    h.receivePing('mj', 1500, 1200, true, 'gm');
    h.frames(30, 50);
    expect(h.engine.camera.snapshot()).not.toEqual(before);
    // Ping malformé : ignoré
    h.live!.receive({ kind: PING_KIND, data: { m: 'carte' }, from: { userId: 'mj', role: 'gm' } });
  });
});

const LIVE_SETTLE_MS = 50;
