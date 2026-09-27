/**
 * Canal durable sur un vrai NATS JetStream (NATS_URL) : diffusion en direct,
 * rejeu après coupure, et plusieurs réplicas reliés par un vrai Redis
 * (REDIS_URL). Ignorés sans ces variables.
 */
import { connectBus, publishEvent, type Bus } from '@vtt/platform';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SubscribeAck } from './protocol.js';
import type { EventPacket } from './routing.js';
import { settle, type TestSocket } from './test/socket-client.js';
import {
  envelope,
  fakeCampaign,
  signer,
  testApp,
  type FakeCampaign,
  type Signer,
  type TestContext,
} from './test/test-app.js';

const NATS_URL = process.env.NATS_URL;
const REDIS_URL = process.env.REDIS_URL;

type Ack = Extract<SubscribeAck, { ok: true }>;
const events = (s: TestSocket, campaignId: string) =>
  s.all<EventPacket>('event').filter((p) => p.event.roomId === campaignId);

describe.skipIf(!NATS_URL)('canal durable (NATS réel)', () => {
  let bus: Bus;
  let t: TestContext;
  beforeAll(async () => {
    bus = await connectBus({ url: NATS_URL!, name: 'test-realtime' });
    t = await testApp({ bus, env: { REPLAY_MAX_EVENTS: '30' } });
  });
  afterAll(async () => {
    await t?.close();
    await bus?.close();
  });

  const publish = async (e: Parameters<typeof envelope>[0]) => {
    const event = envelope(e);
    return { event, seq: (await publishEvent(bus, event)).seq };
  };

  it('diffuse en direct, la séquence du flux sert de curseur', async () => {
    const s = await t.connect();
    const c = t.campaign.campaign({ [s.userId]: 'player' });
    const ack = await s.request<Ack>('subscribe', { campaignId: c });
    expect(ack.ok).toBe(true);
    expect(typeof ack.seq).toBe('number');
    const { event, seq } = await publish({ type: 'dice.rolled', roomId: c });
    const p = await s.waitFor<EventPacket>('event', (x) => x.event.id === event.id);
    expect(p.seq).toBe(seq);
    expect(seq).toBeGreaterThan(ack.seq!);
  });

  it('rejoue après une coupure, dans l’ordre, sans doublon ni événement caché', async () => {
    const gm = await t.connect();
    const joueur = await t.connect();
    const c = t.campaign.campaign({ [gm.userId]: 'gm', [joueur.userId]: 'player' });
    await gm.request('subscribe', { campaignId: c });
    await joueur.request('subscribe', { campaignId: c });
    const asGm = { userId: gm.userId, role: 'gm' as const, characterId: null };
    const asPlayer = { userId: joueur.userId, role: 'player' as const, characterId: null };

    const e1 = await publish({ type: 'dice.rolled', roomId: c, actor: asPlayer });
    await publish({ type: 'dice.rolled', roomId: c, actor: asGm, visibility: 'gm_only' });
    const e3 = await publish({ type: 'dice.rolled', roomId: c, actor: asGm });
    await joueur.waitFor<EventPacket>('event', (p) => p.seq === e3.seq);
    expect(events(joueur, c).map((p) => p.seq)).toEqual([e1.seq, e3.seq]);
    joueur.close();

    // Pendant la coupure
    const e4 = await publish({ type: 'dice.rolled', roomId: c, actor: asGm });
    const e5 = await publish({
      type: 'dice.rolled',
      roomId: c,
      actor: asPlayer,
      visibility: 'gm_only',
      payload: { total: 1 },
    });
    const e6 = await publish({ type: 'dice.rolled', roomId: c, actor: asGm, visibility: 'owner' });

    const retour = await t.connect(joueur.userId);
    const ack = await retour.request<Ack>('subscribe', { campaignId: c, afterSeq: e3.seq });
    expect(ack).toMatchObject({ ok: true, replayed: 2, resync: false, seq: e6.seq });
    // Rejoués avant l'accusé : e4 complet, e5 expurgé (son auteur), pas e6 (au MJ seul)
    const rejoues = events(retour, c);
    expect(rejoues.map((p) => [p.seq, p.redacted ?? false])).toEqual([
      [e4.seq, false],
      [e5.seq, true],
    ]);
    expect(rejoues[1]!.event.payload).toEqual({});

    const e7 = await publish({ type: 'dice.rolled', roomId: c, actor: asGm });
    await retour.waitFor<EventPacket>('event', (p) => p.seq === e7.seq);
    await settle();
    expect(events(retour, c).map((p) => p.seq)).toEqual([e4.seq, e5.seq, e7.seq]);
  });

  it('rejeu pendant que le direct continue : seq croissants, rien de perdu ni doublé', async () => {
    const s = await t.connect();
    const c = t.campaign.campaign({ [s.userId]: 'player' });
    const first = await s.request<Ack>('subscribe', { campaignId: c });
    s.close();
    const avant: number[] = [];
    for (let i = 0; i < 10; i++)
      avant.push((await publish({ type: 'dice.rolled', roomId: c })).seq);

    const retour = await t.connect(s.userId);
    // Publications concurrentes du rejeu
    const pendant = Promise.all(
      Array.from({ length: 10 }, () => publish({ type: 'dice.rolled', roomId: c })),
    );
    const ack = await retour.request<Ack>('subscribe', { campaignId: c, afterSeq: first.seq });
    const seqs = (await pendant).map((p) => p.seq);
    expect(ack.resync).toBe(false);
    await retour.waitFor<EventPacket>('event', (p) => p.seq === Math.max(...seqs));
    await settle();
    const recus = events(retour, c).map((p) => p.seq);
    expect(recus).toEqual([...avant, ...seqs].sort((a, b) => a - b));
  });

  it('demande un rechargement quand le retard dépasse la limite de rejeu', async () => {
    const s = await t.connect();
    const c = t.campaign.campaign({ [s.userId]: 'player' });
    const first = await s.request<Ack>('subscribe', { campaignId: c });
    s.close();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await publish({ type: 'dice.rolled', roomId: c })).seq;
    const retour = await t.connect(s.userId);
    const ack = await retour.request<Ack>('subscribe', { campaignId: c, afterSeq: first.seq });
    expect(ack).toMatchObject({ ok: true, replayed: 0, resync: true });
    expect(ack.seq).toBeGreaterThanOrEqual(last);
    expect(events(retour, c)).toEqual([]);
  });
});

describe.skipIf(!NATS_URL || !REDIS_URL)('plusieurs réplicas (NATS et Redis réels)', () => {
  let campaign: FakeCampaign;
  let keys: Signer;
  const buses: Bus[] = [];
  const replicas: TestContext[] = [];
  beforeAll(async () => {
    campaign = await fakeCampaign();
    keys = await signer();
    for (const name of ['a', 'b']) {
      const bus = await connectBus({ url: NATS_URL!, name: `test-realtime-${name}` });
      buses.push(bus);
      replicas.push(await testApp({ campaign, keys, bus, env: { REDIS_URL: REDIS_URL! } }));
    }
  });
  afterAll(async () => {
    for (const r of replicas) await r.close();
    for (const b of buses) await b.close();
    await campaign?.close();
  });

  it('un événement du bus est reçu une seule fois, quel que soit le réplica', async () => {
    const [ra, rb] = replicas as [TestContext, TestContext];
    const a = await ra.connect();
    const b = await rb.connect();
    const b2 = await rb.connect();
    const c = campaign.campaign({ [a.userId]: 'gm', [b.userId]: 'player', [b2.userId]: 'player' });
    for (const s of [a, b, b2]) await s.request('subscribe', { campaignId: c });
    const e = envelope({ type: 'dice.rolled', roomId: c });
    const { seq } = await publishEvent(buses[0]!, e);
    for (const s of [a, b, b2]) await s.waitFor<EventPacket>('event', (p) => p.seq === seq);
    await settle(300);
    for (const s of [a, b, b2]) expect(events(s, c)).toHaveLength(1);
  });

  it('canal éphémère et présence traversent les réplicas', async () => {
    const [ra, rb] = replicas as [TestContext, TestContext];
    const a = await ra.connect();
    const b = await rb.connect();
    const c = campaign.campaign({ [a.userId]: 'gm', [b.userId]: 'player' });
    await a.request('subscribe', { campaignId: c });
    await b.request('subscribe', { campaignId: c });
    await a.waitFor('presence', (p: { users: unknown[] }) => p.users.length === 2);
    b.emit('ephemeral', { campaignId: c, kind: 'cursor', data: { x: 4 } });
    expect(await a.waitFor('ephemeral')).toMatchObject({
      kind: 'cursor',
      data: { x: 4 },
      from: { userId: b.userId, role: 'player' },
    });
    await settle(200);
    expect(a.all('ephemeral')).toHaveLength(1);
    expect(b.all('ephemeral')).toHaveLength(0);
  });
});
