import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  interpolate,
  LIVE_BUFFER_MS,
  LIVE_BUDGET_PER_SECOND,
  LIVE_EXPIRE_MS,
  LIVE_KIND,
  LIVE_MAX_BYTES,
  LiveChannel,
  PING_KIND,
  type LiveAudience,
  type LiveMessage,
  type LiveSendOptions,
} from './live-channel';

interface Sent {
  kind: string;
  data: LiveMessage;
  options: LiveSendOptions;
  at: number;
}

function channel(audiences: Record<string, LiveAudience> = {}) {
  const sent: Sent[] = [];
  const live = new LiveChannel({
    mapId: 'carte',
    selfId: 'moi',
    transport: {
      send: (kind, data, options) =>
        sent.push({ kind, data: data as LiveMessage, options, at: Date.now() }),
    },
    audienceOf: (id) => audiences[id] ?? 'public',
    now: () => Date.now(),
  });
  return { live, sent };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('émission', () => {
  it('regroupe un geste à 15 Hz au plus, puis un dernier message avec end', () => {
    const { live, sent } = channel();
    // 60 positions en une seconde (une par image)
    for (let i = 0; i < 60; i++) {
      live.drag([['a', i, i]]);
      vi.advanceTimersByTime(1000 / 60);
    }
    expect(sent.length).toBeGreaterThanOrEqual(14);
    expect(sent.length).toBeLessThanOrEqual(16);
    // Jamais deux envois à moins de 1/15 s d'intervalle
    for (let i = 1; i < sent.length; i++)
      expect(sent[i]!.at - sent[i - 1]!.at).toBeGreaterThanOrEqual(1000 / 15 - 1);
    // Seule la dernière position part à chaque envoi
    expect(sent.every((m) => m.data.drag?.length === 1)).toBe(true);
    live.end();
    vi.advanceTimersByTime(200);
    const last = sent[sent.length - 1]!;
    expect(last.data.end).toBe(true);
    // Compteur croissant
    const s = sent.map((m) => m.data.s);
    expect([...s].sort((a, b) => a - b)).toEqual(s);
  });

  it('un message par audience : public, MJ seulement, certains joueurs', () => {
    const { live, sent } = channel({
      pnj: 'gm',
      garde: { users: ['u2', 'u1'] },
    });
    live.drag([
      ['heros', 1, 1],
      ['pnj', 2, 2],
      ['garde', 3, 3],
    ]);
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(3);
    const pub = sent.find((m) => !m.options.gmOnly && !m.options.toUsers)!;
    const gm = sent.find((m) => m.options.gmOnly)!;
    const some = sent.find((m) => m.options.toUsers)!;
    expect(pub.data.drag).toEqual([['heros', 1, 1]]);
    expect(gm.data.drag).toEqual([['pnj', 2, 2]]);
    expect(some.data.drag).toEqual([['garde', 3, 3]]);
    expect(some.options.toUsers).toEqual(['u1', 'u2']);

    // `end` va à chaque audience qui a reçu le geste
    live.end();
    vi.advanceTimersByTime(100);
    const ends = sent.slice(3);
    expect(ends).toHaveLength(3);
    expect(ends.every((m) => m.data.end)).toBe(true);
  });

  it('découpe au-delà de 50 destinataires nommés', () => {
    const users = Array.from({ length: 120 }, (_, i) => `u${i}`);
    const { live, sent } = channel({ pnj: { users } });
    live.drag([['pnj', 1, 1]]);
    vi.advanceTimersByTime(100);
    expect(sent.map((m) => m.options.toUsers?.length)).toEqual([50, 50, 20]);
  });

  it('respecte le budget de 12 messages par seconde, sans rien perdre', () => {
    const audiences: Record<string, LiveAudience> = {};
    for (let i = 0; i < 6; i++) audiences[`e${i}`] = { users: [`u${i}`] };
    const { live, sent } = channel(audiences);
    // 6 audiences par envoi : le seau se vide vite
    for (let i = 0; i < 30; i++) {
      live.drag(Object.keys(audiences).map((id) => [id, i, i] as [string, number, number]));
      vi.advanceTimersByTime(1000 / 15);
    }
    // 2 s écoulées : le seau plein (12) plus 12 par seconde, au plus
    expect(sent.length).toBeLessThanOrEqual(LIVE_BUDGET_PER_SECOND * 3);
    expect(sent.length).toBeGreaterThanOrEqual(LIVE_BUDGET_PER_SECOND * 2);
    live.end();
    vi.advanceTimersByTime(3_000);
    // Chaque audience a fini par recevoir la fin du geste
    for (let i = 0; i < 6; i++)
      expect(sent.some((m) => m.data.end && m.options.toUsers?.includes(`u${i}`))).toBe(true);
  });

  it('garde chaque message sous 4 Kio : les points du tracé partent au suivant', () => {
    const { live, sent } = channel();
    const points = Array.from({ length: 2_000 }, (_, i) => i * 1.5);
    live.stroke({ id: 't', tool: 'pen', color: '#fff', width: 3 }, points);
    live.end();
    vi.advanceTimersByTime(2_000);
    expect(sent.length).toBeGreaterThan(1);
    for (const m of sent) expect(JSON.stringify(m.data).length).toBeLessThanOrEqual(LIVE_MAX_BYTES);
    const all = sent.flatMap((m) => m.data.stroke?.points ?? []);
    expect(all).toEqual(points);
    expect(sent[sent.length - 1]!.data.end).toBe(true);
    expect(sent.slice(0, -1).every((m) => !m.data.end)).toBe(true);
  });

  it('ping : un message tout de suite ; focus seulement si le MJ le demande', () => {
    const { live, sent } = channel();
    live.ping({ x: 10, y: 20 }, true);
    expect(sent).toMatchObject([
      { kind: PING_KIND, data: { m: 'carte', x: 10, y: 20, focus: true }, options: {} },
    ]);
  });
});

describe('réception', () => {
  const from = (userId = 'autre', role = 'player') => ({ userId, role });

  it('interpole avec un tampon de 100 ms', () => {
    const { live } = channel();
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 1, drag: [['a', 0, 0]] },
      from: from(),
    });
    vi.advanceTimersByTime(100);
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 2, drag: [['a', 100, 50]] },
      from: from(),
    });
    // 150 ms après le premier message, on lit 50 ms : à mi-chemin
    vi.advanceTimersByTime(50);
    const [pose] = live.poses(Date.now());
    expect(pose).toMatchObject({ entityId: 'a', userId: 'autre', ended: false });
    expect(pose!.x).toBeCloseTo(50);
    expect(pose!.y).toBeCloseTo(25);
    // Au-delà du dernier point : tenu
    vi.advanceTimersByTime(500);
    expect(live.poses(Date.now())[0]).toMatchObject({ x: 100, y: 50 });
  });

  it('un fantôme sans nouvelles disparaît après 2 s ; l’événement durable le pose', () => {
    const { live } = channel();
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 1, drag: [['a', 1, 1]] },
      from: from(),
    });
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 2, drag: [['b', 1, 1]] },
      from: from(),
    });
    live.receive({ kind: LIVE_KIND, data: { m: 'carte', s: 3, end: true }, from: from() });
    expect(live.poses(Date.now()).every((p) => p.ended)).toBe(true);
    live.settle('a');
    expect(live.poses(Date.now()).map((p) => p.entityId)).toEqual(['b']);
    vi.advanceTimersByTime(LIVE_EXPIRE_MS + 1);
    expect(live.poses(Date.now())).toEqual([]);
    expect(live.active).toBe(false);
  });

  it('ignore les messages d’une autre carte, invalides, anciens ou les miens', () => {
    const { live } = channel();
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'autre', s: 1, drag: [['a', 1, 1]] },
      from: from(),
    });
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 1, drag: [['a', 'x', 1]] },
      from: from(),
    });
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 1, drag: [['a', 1, 1]] },
      from: from('moi'),
    });
    expect(live.poses(Date.now())).toEqual([]);
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 5, drag: [['a', 5, 5]] },
      from: from(),
    });
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 4, drag: [['a', 4, 4]] },
      from: from(),
    });
    vi.advanceTimersByTime(LIVE_BUFFER_MS + 1);
    expect(live.poses(Date.now())[0]).toMatchObject({ x: 5, y: 5 });
  });

  it('ping d’un joueur : pas de focus, même demandé', () => {
    const { live } = channel();
    const pings = vi.fn();
    live.onPing(pings);
    live.receive({ kind: PING_KIND, data: { m: 'carte', x: 1, y: 2, focus: true }, from: from() });
    live.receive({
      kind: PING_KIND,
      data: { m: 'carte', x: 3, y: 4, focus: true },
      from: from('mj', 'gm'),
    });
    expect(pings.mock.calls.map((c) => c[0].focus)).toEqual([false, true]);
  });

  it('interpolate tient les bords et interpole la rotation par le plus court', () => {
    const samples = [
      { t: 0, x: 0, y: 0, rotation: 350 },
      { t: 100, x: 10, y: 0, rotation: 10 },
    ];
    expect(interpolate(samples, -5)).toMatchObject({ x: 0 });
    expect(interpolate(samples, 500)).toMatchObject({ x: 10 });
    const mid = interpolate(samples, 50)!;
    expect(mid.x).toBeCloseTo(5);
    expect(((mid.rotation! % 360) + 360) % 360).toBeCloseTo(0);
  });
});

describe('mesure (outil Mesurer)', () => {
  const m = {
    id: 'm1',
    shape: 'line' as const,
    from: [10.04, 20] as [number, number],
    to: [110, 20.06] as [number, number],
    color: '#ffd700',
  };

  it('part à 15 Hz, puis avec end ; MJ seulement pour une mesure privée', () => {
    const { live, sent } = channel();
    live.measure(m);
    vi.advanceTimersByTime(100);
    expect(sent[0]!.data.measure).toMatchObject({ id: 'm1', from: [10, 20], to: [110, 20.1] });
    expect(sent[0]!.options).toEqual({});
    live.measure({ ...m, to: [200, 20] });
    live.end();
    vi.advanceTimersByTime(200);
    const last = sent[sent.length - 1]!;
    expect(last.data).toMatchObject({ end: true, measure: { to: [200, 20] } });

    live.measure(m, 'gm');
    vi.advanceTimersByTime(200);
    expect(sent[sent.length - 1]!.options).toEqual({ gmOnly: true });
    live.measure(null, 'gm');
    live.end();
    vi.advanceTimersByTime(200);
    expect(sent[sent.length - 1]!.data).toMatchObject({ measure: null, end: true });
  });

  it('réception : mesure, effacement et fin du geste de l’auteur', () => {
    const { live } = channel();
    const got: unknown[] = [];
    live.onMeasure((e) => got.push(e));
    const from = { userId: 'u2', role: 'player' };
    live.receive({ kind: LIVE_KIND, data: { m: 'carte', s: 1, measure: m }, from });
    live.receive({ kind: LIVE_KIND, data: { m: 'carte', s: 2, end: true }, from });
    live.receive({ kind: LIVE_KIND, data: { m: 'carte', s: 3, measure: null }, from });
    // Une autre carte, ou une forme inconnue : ignorées
    live.receive({ kind: LIVE_KIND, data: { m: 'autre', s: 4, measure: m }, from });
    live.receive({
      kind: LIVE_KIND,
      data: { m: 'carte', s: 5, measure: { ...m, shape: 'star' } },
      from,
    });
    expect(got).toEqual([
      { userId: 'u2', measure: m, end: false },
      { userId: 'u2', measure: undefined, end: true },
      { userId: 'u2', measure: null, end: false },
    ]);
  });
});
