/**
 * Service démarré sur un port local, vrais WebSockets, faux campaign ; les
 * événements du bus sont injectés par `app.realtime.dispatch` (sans NATS).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EventPacket } from './routing.js';
import { settle, TestSocket } from './test/socket-client.js';
import { envelope, testApp, type TestContext } from './test/test-app.js';

let t: TestContext;
beforeAll(async () => {
  t = await testApp({ env: { EPHEMERAL_RATE_PER_SECOND: '5', EPHEMERAL_BURST: '5' } });
});
afterAll(() => t.close());

const events = (s: TestSocket) => s.all<EventPacket>('event');

describe('handshake', () => {
  it('refuse une connexion sans jeton ou avec un jeton invalide', async () => {
    await expect(TestSocket.connect(t.url)).rejects.toThrow('unauthorized');
    await expect(TestSocket.connect(t.url, { token: 'pas-un-jwt' })).rejects.toThrow(
      'unauthorized',
    );
  });

  it('accepte un jeton valide', async () => {
    const s = await t.connect();
    expect(s.open).toBe(true);
  });

  it('ferme la connexion quand le jeton expire', async () => {
    const userId = crypto.randomUUID();
    const s = await t.connect(userId, await t.keys.sign(userId, { expiresIn: '1s' }));
    await s.waitFor('session_expired', undefined, 3000);
    expect(await s.waitClosed()).toBe('io server disconnect');
  });
});

describe('abonnement', () => {
  it('vérifie l’appartenance auprès de campaign', async () => {
    const gm = await t.connect();
    const intrus = await t.connect();
    const c = t.campaign.campaign({ [gm.userId]: 'gm' });
    expect(await intrus.request('subscribe', { campaignId: c })).toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(await gm.request('subscribe', { campaignId: 'pas-un-uuid' })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await gm.request('subscribe', { campaignId: c })).toMatchObject({
      ok: true,
      campaignId: c,
      role: 'gm',
      seq: null,
    });
  });

  it('campaign en panne : aucun droit ouvert', async () => {
    const s = await t.connect();
    const c = t.campaign.campaign({ [s.userId]: 'player' });
    t.campaign.setDown(true);
    try {
      expect(await s.request('subscribe', { campaignId: c })).toEqual({
        ok: false,
        error: 'unavailable',
      });
    } finally {
      t.campaign.setDown(false);
    }
  });
});

describe('diffusion des événements', () => {
  async function table() {
    const [gm, joueur, autre, dehors] = await Promise.all([
      t.connect(),
      t.connect(),
      t.connect(),
      t.connect(),
    ]);
    const c = t.campaign.campaign({
      [gm.userId]: 'gm',
      [joueur.userId]: 'player',
      [autre.userId]: 'player',
    });
    for (const s of [gm, joueur, autre]) await s.request('subscribe', { campaignId: c });
    return { gm, joueur, autre, dehors, c };
  }

  it('public à toute la campagne, rien hors campagne', async () => {
    const { gm, joueur, autre, dehors, c } = await table();
    const e = envelope({ type: 'dice.rolled', roomId: c, payload: { total: 12 } });
    t.app.realtime.dispatch(e, 101);
    for (const s of [gm, joueur, autre]) {
      expect(await s.waitFor<EventPacket>('event', (p) => p.event.id === e.id)).toEqual({
        seq: 101,
        event: e,
      });
    }
    await settle();
    expect(events(dehors)).toEqual([]);
  });

  it('gm_only : MJ complet, auteur expurgé, autres joueurs rien', async () => {
    const { gm, joueur, autre, c } = await table();
    const e = envelope({
      type: 'dice.rolled',
      roomId: c,
      visibility: 'gm_only',
      actor: { userId: joueur.userId, role: 'player', characterId: null },
      payload: { total: 3 },
    });
    t.app.realtime.dispatch(e, 102);
    expect((await gm.waitFor<EventPacket>('event')).event.payload).toEqual({ total: 3 });
    const mine = await joueur.waitFor<EventPacket>('event');
    expect(mine).toMatchObject({ seq: 102, redacted: true, event: { id: e.id, payload: {} } });
    await settle();
    expect(events(autre)).toEqual([]);
    expect(events(gm)).toHaveLength(1);
    expect(events(joueur)).toHaveLength(1);
  });

  it('gm_only avec visibleTo : les joueurs listés en entier, un MJ listé une seule fois', async () => {
    const { gm, joueur, autre, c } = await table();
    const e = envelope({
      type: 'token.updated',
      roomId: c,
      visibility: 'gm_only',
      actor: { userId: gm.userId, role: 'gm', characterId: null },
      payload: { id: 't1', visibleToUsers: [joueur.userId, gm.userId] },
    });
    t.app.realtime.dispatch(e, 110);
    expect((await joueur.waitFor<EventPacket>('event')).event.payload).toEqual(e.payload);
    await gm.waitFor<EventPacket>('event');
    await settle();
    expect(events(gm)).toHaveLength(1);
    expect(events(joueur)).toHaveLength(1);
    expect(events(autre)).toEqual([]);
  });

  it("owner : l'auteur seul, sur toutes ses connexions, pas le MJ", async () => {
    const { gm, joueur, c } = await table();
    const onglet = await t.connect(joueur.userId);
    const e = envelope({
      type: 'dice.rolled',
      roomId: c,
      visibility: 'owner',
      actor: { userId: joueur.userId, role: 'player', characterId: null },
    });
    t.app.realtime.dispatch(e, 103);
    await joueur.waitFor('event');
    await onglet.waitFor('event');
    await settle();
    expect(events(gm)).toEqual([]);
  });

  it("événement sans campagne : l'auteur seul", async () => {
    const s = await t.connect();
    const voisin = await t.connect();
    const e = envelope({
      type: 'dice.preferences_updated',
      visibility: 'owner',
      actor: { userId: s.userId, role: 'user', characterId: null },
    });
    t.app.realtime.dispatch(e, 104);
    expect((await s.waitFor<EventPacket>('event')).seq).toBe(104);
    await settle();
    expect(events(voisin)).toEqual([]);
  });

  it('désabonnement : plus rien de la campagne', async () => {
    const { joueur, c } = await table();
    expect(await joueur.request('unsubscribe', { campaignId: c })).toEqual({ ok: true });
    t.app.realtime.dispatch(envelope({ type: 'dice.rolled', roomId: c }), 105);
    await settle();
    expect(events(joueur)).toEqual([]);
  });

  it('membre exclu : prévenu, retiré, plus rien ensuite', async () => {
    const { gm, joueur, c } = await table();
    const exclusion = envelope({
      type: 'campaign.member_left',
      roomId: c,
      actor: { userId: gm.userId, role: 'gm', characterId: null },
      payload: { userId: joueur.userId, role: 'player', kicked: true, banned: false },
    });
    t.app.realtime.dispatch(exclusion, 106);
    await joueur.waitFor<EventPacket>('event', (p) => p.event.id === exclusion.id);
    expect(await joueur.waitFor('unsubscribed')).toEqual({ campaignId: c, reason: 'removed' });
    t.app.realtime.dispatch(envelope({ type: 'dice.rolled', roomId: c }), 107);
    await gm.waitFor<EventPacket>('event', (p) => p.seq === 107);
    await settle();
    expect(events(joueur).map((p) => p.seq)).toEqual([106]);
  });

  it('promu MJ : reçoit aussitôt les événements réservés au MJ', async () => {
    const { gm, joueur, c } = await table();
    t.app.realtime.dispatch(
      envelope({
        type: 'campaign.member_role_changed',
        roomId: c,
        actor: { userId: gm.userId, role: 'gm', characterId: null },
        payload: { userId: joueur.userId, role: 'gm', previousRole: 'player' },
      }),
      108,
    );
    await joueur.waitFor<EventPacket>('event', (p) => p.seq === 108);
    const secret = envelope({ type: 'combat.started', roomId: c, visibility: 'gm_only' });
    t.app.realtime.dispatch(secret, 109);
    expect((await joueur.waitFor<EventPacket>('event', (p) => p.seq === 109)).redacted).toBe(
      undefined,
    );
  });
});

describe('canal éphémère et présence', () => {
  it('relaie aux autres abonnés, jamais à l’expéditeur ni hors campagne', async () => {
    const [a, b, dehors] = await Promise.all([t.connect(), t.connect(), t.connect()]);
    const c = t.campaign.campaign({ [a.userId]: 'player', [b.userId]: 'gm' });
    await a.request('subscribe', { campaignId: c });
    await b.request('subscribe', { campaignId: c });
    a.emit('ephemeral', { campaignId: c, kind: 'cursor', data: { x: 1, y: 2 } });
    expect(await b.waitFor('ephemeral')).toMatchObject({
      campaignId: c,
      kind: 'cursor',
      data: { x: 1, y: 2 },
      from: { userId: a.userId, role: 'player' },
    });
    // Non abonné : ignoré
    dehors.emit('ephemeral', { campaignId: c, kind: 'cursor', data: {} });
    await settle();
    expect(a.all('ephemeral')).toEqual([]);
    expect(b.all('ephemeral')).toHaveLength(1);
  });

  it('gmOnly : seulement les MJ', async () => {
    const [gm, p1, p2] = await Promise.all([t.connect(), t.connect(), t.connect()]);
    const c = t.campaign.campaign({
      [gm.userId]: 'gm',
      [p1.userId]: 'player',
      [p2.userId]: 'player',
    });
    for (const s of [gm, p1, p2]) await s.request('subscribe', { campaignId: c });
    p1.emit('ephemeral', { campaignId: c, kind: 'drag', data: { token: 't1' }, gmOnly: true });
    await gm.waitFor('ephemeral');
    await settle();
    expect(p2.all('ephemeral')).toEqual([]);
  });

  it('limite le débit par connexion et ignore les messages trop gros', async () => {
    const [a, b] = await Promise.all([t.connect(), t.connect()]);
    const c = t.campaign.campaign({ [a.userId]: 'player', [b.userId]: 'player' });
    await a.request('subscribe', { campaignId: c });
    await b.request('subscribe', { campaignId: c });
    a.emit('ephemeral', { campaignId: c, kind: 'ping', data: 'x'.repeat(10_000) });
    for (let i = 0; i < 10; i++) a.emit('ephemeral', { campaignId: c, kind: 'cursor', data: i });
    await a.waitFor('rate_limited');
    await settle(300);
    // Rafale de 5 : le message trop gros en consomme un, 4 curseurs au plus passent
    // (volatiles : ceux qui arrivent pendant une écriture en cours sont perdus)
    const passed = b.all('ephemeral').map((m) => m.data as number);
    expect(passed[0]).toBe(0);
    expect(passed.every((n) => n < 4)).toBe(true);
    expect(b.all('ephemeral').some((m) => typeof m.data === 'string')).toBe(false);
  });

  it('annonce qui est connecté, et le redit à la demande', async () => {
    const [a, b] = await Promise.all([t.connect(), t.connect()]);
    const onglet = await t.connect(a.userId);
    const c = t.campaign.campaign({ [a.userId]: 'gm', [b.userId]: 'player' });
    await a.request('subscribe', { campaignId: c });
    await onglet.request('subscribe', { campaignId: c });
    await b.request('subscribe', { campaignId: c });
    const complet = (p: { users: unknown[] }) => p.users.length === 2;
    await a.waitFor('presence', complet);
    const ack = await b.request<{ ok: boolean; users: unknown[] }>('presence', { campaignId: c });
    expect(ack.ok).toBe(true);
    expect(ack.users).toEqual(
      expect.arrayContaining([
        { userId: a.userId, role: 'gm', connections: 2 },
        { userId: b.userId, role: 'player', connections: 1 },
      ]),
    );
    b.close();
    await a.waitFor('presence', (p: { users: unknown[] }) => p.users.length === 1);
  });
});

describe('jeton pour le handshake', () => {
  it('rend le jeton porté par le client API, jamais celui d’une clé d’API', async () => {
    const userId = crypto.randomUUID();
    const token = await t.keys.sign(userId);
    const res = await t.app.inject({
      url: '/v1/realtime/token',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ token });
    expect((await t.app.inject({ url: '/v1/realtime/token' })).statusCode).toBe(401);
    const api = await t.keys.sign(userId, { roles: ['user', 'api'] });
    const refused = await t.app.inject({
      url: '/v1/realtime/token',
      headers: { authorization: `Bearer ${api}` },
    });
    expect(refused.statusCode).toBe(403);
  });
});
