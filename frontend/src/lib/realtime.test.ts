// @vitest-environment jsdom
/**
 * Client temps réel (Socket.IO, un par onglet) : connexion à la demande avec un jeton frais,
 * abonnement par campagne (curseur de rejeu, relecture REST demandée), événements dédoublonnés
 * et filtrés par type, présence, canal éphémère, refus et reprises, désabonnement et fermeture
 * différés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@/test/render-hook';

/** Faux socket : ce que le serveur enverrait passe par `fire`, les acquittements par `acks`. */
class FakeSocket {
  connected = false;
  active = true;
  handlers = new Map<string, ((...a: unknown[]) => void)[]>();
  acks: Record<string, (data: unknown) => unknown> = {};
  emitted: [string, unknown][] = [];
  volatileSent: [string, unknown][] = [];
  connects = 0;
  on(ev: string, fn: (...a: unknown[]) => void) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    return this;
  }
  fire(ev: string, ...args: unknown[]) {
    for (const fn of this.handlers.get(ev) ?? []) fn(...args);
  }
  connect() {
    this.connects += 1;
    return this;
  }
  /** Le serveur accepte la connexion. */
  open() {
    this.connected = true;
    this.fire('connect');
  }
  disconnect() {
    this.connected = false;
  }
  removeAllListeners() {
    this.handlers.clear();
  }
  emit(ev: string, data: unknown) {
    this.emitted.push([ev, data]);
  }
  get volatile() {
    return { emit: (ev: string, data: unknown) => this.volatileSent.push([ev, data]) };
  }
  timeout() {
    return {
      emitWithAck: async (ev: string, data: unknown) => {
        this.emitted.push([ev, data]);
        const ack = this.acks[ev];
        if (!ack) throw new Error('timeout');
        return ack(data);
      },
    };
  }
}

const sockets = vi.hoisted(() => ({
  list: [] as unknown[],
  options: [] as { auth: (cb: (a: unknown) => void) => void }[],
}));
const tokens = vi.hoisted(() => ({ expiresAt: null as string | null, refresh: true }));

vi.mock('socket.io-client', () => ({
  io: (_origin: unknown, options: { auth: (cb: (a: unknown) => void) => void }) => {
    const s = new FakeSocket();
    sockets.list.push(s);
    sockets.options.push(options);
    return s;
  },
}));
vi.mock('./api', () => ({
  api: vi.fn(async () => ({ token: 'jeton', expiresAt: tokens.expiresAt })),
  refreshSession: vi.fn(async () => tokens.refresh),
}));
vi.mock('./perf/monitor', () => ({ countRealtime: vi.fn() }));

type RT = typeof import('./realtime');
let rt: RT;
const socket = () => sockets.list.at(-1) as FakeSocket;
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.resetModules();
  sockets.list.length = 0;
  sockets.options.length = 0;
  tokens.expiresAt = null;
  rt = await import('./realtime');
});
afterEach(() => {
  vi.useRealTimers();
});

const envelope = (seq: number, type: string, roomId: string | null = 'camp') => ({
  seq,
  event: { id: `e${seq}`, type, roomId, aggregate: { type: 'x', id: 'x' }, payload: {} },
});

describe('connexion', () => {
  it('ouverte au premier hook, jeton du handshake ; fermée 10 s après le dernier', async () => {
    const r = await renderHook(() => rt.useRealtimeStatus());
    expect(r.result.current).toBe('idle');
    const ev = await renderHook(() => rt.useCampaignEvents(null, ['account.*'], () => undefined));
    expect(socket().connects).toBe(1);
    const auth = vi.fn();
    sockets.options[0]!.auth(auth);
    await flush();
    expect(auth).toHaveBeenCalledWith({ token: 'jeton' });
    await r.act(() => socket().open());
    expect(r.result.current).toBe('connected');
    expect(ev.result.current.live).toBe(true);
    expect(ev.result.current.generation).toBe(1);
    await ev.unmount();
    await r.act(() => vi.advanceTimersByTime(10_500));
    expect(r.result.current).toBe('idle');
    await r.unmount();
  });

  it('jeton proche de l’expiration : session renouvelée d’abord ; jeton illisible : sans jeton', async () => {
    tokens.expiresAt = new Date(Date.now() + 5_000).toISOString();
    const r = await renderHook(() => rt.useCampaignEvents(null, [], () => undefined));
    const auth = vi.fn();
    sockets.options[0]!.auth(auth);
    await flush();
    expect(auth).toHaveBeenCalledWith({ token: 'jeton' });
    const { api } = await import('./api');
    vi.mocked(api).mockRejectedValueOnce(new Error('401'));
    sockets.options[0]!.auth(auth);
    await flush();
    expect(auth).toHaveBeenLastCalledWith({});
    await r.unmount();
  });

  it('refus du handshake : nouvel essai dans 5 s ; fermé par le serveur : reconnexion tout de suite', async () => {
    const r = await renderHook(() => rt.useRealtimeStatus());
    const ev = await renderHook(() => rt.useCampaignEvents(null, [], () => undefined));
    const s = socket();
    s.active = false;
    await r.act(() => s.fire('connect_error', new Error('jeton')));
    expect(r.result.current).toBe('disconnected');
    await r.act(() => vi.advanceTimersByTime(5_100));
    expect(s.connects).toBe(2);
    await r.act(() => s.open());
    await r.act(() => {
      s.connected = false;
      s.fire('disconnect', 'io server disconnect');
    });
    await r.act(() => vi.advanceTimersByTime(10));
    expect(s.connects).toBe(3);
    await ev.unmount();
    await r.unmount();
  });
});

describe('abonnement à une campagne', () => {
  it('abonné à la connexion, relecture demandée ; événements dédoublonnés et filtrés ; présence', async () => {
    const received: string[] = [];
    const r = await renderHook(() => ({
      events: rt.useCampaignEvents('camp', ['dice.*', 'note.created'], (e) =>
        received.push(e.event.type),
      ),
      presence: rt.useCampaignPresence('camp'),
    }));
    const s = socket();
    s.acks.subscribe = () => ({
      ok: true,
      campaignId: 'camp',
      role: 'player',
      seq: 10,
      resync: false,
    });
    s.acks.presence = () => ({ ok: true, users: [{ userId: 'bob' }] });
    await r.act(async () => {
      s.open();
      await flush();
    });
    expect(s.emitted[0]).toEqual(['subscribe', { campaignId: 'camp' }]);
    expect(r.result.current.events).toEqual({ live: true, generation: 1 });
    expect(r.result.current.presence.users).toEqual([{ userId: 'bob' }]);
    await r.act(() => {
      s.fire('event', envelope(11, 'dice.rolled'));
      s.fire('event', envelope(11, 'dice.rolled'));
      s.fire('event', envelope(9, 'dice.rolled'));
      s.fire('event', envelope(12, 'note.created'));
      s.fire('event', envelope(13, 'note.deleted'));
      s.fire('event', envelope(14, 'dice.rolled', 'autre'));
      s.fire('presence', { campaignId: 'camp', users: [] });
      s.fire('presence', { campaignId: 'autre', users: [] });
    });
    expect(received).toEqual(['dice.rolled', 'note.created']);
    expect(r.result.current.presence.users).toEqual([]);
    // Coupure puis reconnexion : reprise après le dernier seq, sans relecture
    await r.act(async () => {
      s.connected = false;
      s.fire('disconnect', 'transport close');
      s.open();
      await flush();
    });
    expect(s.emitted.filter(([e]) => e === 'subscribe').at(-1)).toEqual([
      'subscribe',
      { campaignId: 'camp', afterSeq: 13 },
    ]);
    expect(r.result.current.events.generation).toBe(1);
    // Le serveur coupe l'abonnement (plus membre)
    await r.act(() => s.fire('unsubscribed', { campaignId: 'camp' }));
    expect(r.result.current.events.live).toBe(false);
    await r.unmount();
    await r.act(() => vi.advanceTimersByTime(2_100));
    expect(s.emitted.at(-1)).toEqual(['unsubscribe', { campaignId: 'camp' }]);
  });

  it('refus passager : nouvel essai ; refus définitif (pas membre) : on n’insiste pas', async () => {
    const r = await renderHook(() => rt.useCampaignEvents('camp', [], () => undefined));
    const s = socket();
    let answer: unknown = { ok: false, error: 'unavailable' };
    s.acks.subscribe = () => answer;
    await r.act(async () => {
      s.open();
      await flush();
    });
    expect(r.result.current.live).toBe(false);
    answer = { ok: false, error: 'forbidden' };
    await r.act(async () => {
      vi.advanceTimersByTime(5_100);
      await flush();
    });
    const tries = s.emitted.filter(([e]) => e === 'subscribe').length;
    await r.act(async () => {
      vi.advanceTimersByTime(10_000);
      await flush();
    });
    expect(s.emitted.filter(([e]) => e === 'subscribe')).toHaveLength(tries);
    // Sans réponse (délai dépassé) : traité comme un refus passager
    delete s.acks.subscribe;
    await r.unmount();
  });

  it('démonté puis remonté aussitôt (mode strict) : l’abonnement est gardé', async () => {
    const first = await renderHook(() => rt.useCampaignEvents('camp', [], () => undefined));
    const s = socket();
    s.acks.subscribe = () => ({
      ok: true,
      campaignId: 'camp',
      role: 'gm',
      seq: null,
      resync: true,
    });
    await first.act(async () => {
      s.open();
      await flush();
    });
    await first.unmount();
    const second = await renderHook(() => rt.useCampaignEvents('camp', [], () => undefined));
    await second.act(() => vi.advanceTimersByTime(2_100));
    expect(s.emitted.some(([e]) => e === 'unsubscribe')).toBe(false);
    expect(second.result.current.live).toBe(true);
    await second.unmount();
  });

  it('désactivé : ni connexion ni abonnement', async () => {
    const r = await renderHook(() =>
      rt.useCampaignEvents('camp', [], () => undefined, { enabled: false }),
    );
    expect(sockets.list).toHaveLength(0);
    expect(r.result.current).toEqual({ live: false, generation: 0 });
    const p = await renderHook(() => rt.useCampaignPresence(null));
    expect(p.result.current).toEqual({ users: [], live: false });
    await p.unmount();
    await r.unmount();
  });
});

describe('canal éphémère', () => {
  it('reçoit les messages de sa campagne et de ses types ; n’envoie qu’abonné, audience choisie', async () => {
    const got: string[] = [];
    const r = await renderHook(() =>
      rt.useCampaignEphemeral<{ x: number }>('camp', ['map.live'], (m) => got.push(m.kind)),
    );
    r.result.current.send('map.live', { x: 1 });
    expect(socket().volatileSent).toHaveLength(0);
    const s = socket();
    s.acks.subscribe = () => ({ ok: true, campaignId: 'camp', role: 'gm', seq: 1, resync: false });
    await r.act(async () => {
      s.open();
      await flush();
    });
    r.result.current.send('map.live', { x: 1 }, { gmOnly: true });
    r.result.current.send('map.live', { x: 2 }, { toUsers: ['bob'] });
    r.result.current.send('map.ping', { x: 3 });
    expect(s.volatileSent).toEqual([
      ['ephemeral', { campaignId: 'camp', kind: 'map.live', data: { x: 1 }, gmOnly: true }],
      ['ephemeral', { campaignId: 'camp', kind: 'map.live', data: { x: 2 }, toUsers: ['bob'] }],
      ['ephemeral', { campaignId: 'camp', kind: 'map.ping', data: { x: 3 } }],
    ]);
    s.fire('ephemeral', { campaignId: 'camp', kind: 'map.live', data: {} });
    s.fire('ephemeral', { campaignId: 'camp', kind: 'map.ping', data: {} });
    s.fire('ephemeral', { campaignId: 'autre', kind: 'map.live', data: {} });
    expect(got).toEqual(['map.live']);
    await r.unmount();
  });
});
