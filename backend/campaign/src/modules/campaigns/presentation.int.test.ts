/**
 * Présentation d'une campagne (accroche, couleur d'accent, genres, couverture
 * de la bibliothèque), liste de mes campagnes enrichie, et nouveau code.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Campaign {
  id: string;
  code: string;
  pitch: string;
  accent: string;
  tags: string[];
  imageUrl: string | null;
  version: number;
}

interface MyCampaign extends Campaign {
  role: string;
  memberCount: number;
  members: { userId: string; name: string | null; role: string }[];
  nextSession: { id: string; date: string; title: string | null } | null;
  playedCharacterId: string | null;
  characterIds: string[];
}

const COVER = 'https://assets.yner.fr/Map/Tavern/Illustration/Static/RuralTavern night01.webp';

describe.skipIf(!TEST_DATABASE_URL)('campagnes : présentation, liste enrichie, code', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user('Maître');
    alice = await t.user('Alice');
  });

  afterEach(async () => {
    await t.close();
  });

  const events = async (campaignId: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${campaignId}`)
        .orderBy(outbox.id)
    ).map((e) => e.envelope as { type: string; payload: Record<string, unknown> });

  it('accroche, couleur, genres et couverture : à la création, puis modifiés par le MJ', async () => {
    const res = await h.request(gm, 'POST', '/v1/campaigns', {
      name: 'La Crypte',
      systemId: 'dnd-classic',
      pitch: '  Sous les collines, quelque chose s’est réveillé.  ',
      accent: 'ember',
      tags: ['Horreur', 'Donjon', 'Horreur'],
      imageUrl: COVER,
    });
    expect(res.statusCode).toBe(201);
    const c = res.json() as Campaign;
    expect(c).toMatchObject({
      pitch: 'Sous les collines, quelque chose s’est réveillé.',
      accent: 'ember',
      tags: ['Horreur', 'Donjon'],
      imageUrl: COVER,
    });
    expect((await events(c.id))[0]).toMatchObject({
      type: 'campaign.created',
      payload: { pitch: c.pitch, accent: 'ember', tags: ['Horreur', 'Donjon'], imageUrl: COVER },
    });

    const patched = await h.ok<Campaign>(gm, 'PATCH', `/v1/campaigns/${c.id}`, {
      pitch: 'Le col est tombé.',
      accent: 'frost',
      tags: [],
      imageUrl: null,
    });
    expect(patched).toMatchObject({ pitch: 'Le col est tombé.', accent: 'frost', tags: [] });
    const updated = (await events(c.id)).find((e) => e.type === 'campaign.updated')!;
    expect(updated.payload).toMatchObject({ accent: 'frost', pitch: 'Le col est tombé.' });
    expect(updated.payload.changes).toEqual(
      expect.arrayContaining([
        { path: 'accent', before: 'ember', after: 'frost' },
        { path: 'imageUrl', before: COVER, after: null },
      ]),
    );

    // Un joueur ne modifie pas la présentation
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    expect(
      (await h.request(alice, 'PATCH', `/v1/campaigns/${id}`, { pitch: 'Pirate' })).statusCode,
    ).toBe(403);
  });

  it('refuse une couleur inconnue, trop de genres, une accroche trop longue, une image tierce', async () => {
    const post = (body: Record<string, unknown>) =>
      h.request(gm, 'POST', '/v1/campaigns', { name: 'X', systemId: 'dnd-classic', ...body });
    expect((await post({ accent: 'rose' })).statusCode).toBe(400);
    expect((await post({ tags: Array.from({ length: 11 }, (_, i) => `G${i}`) })).statusCode).toBe(
      400,
    );
    expect((await post({ pitch: 'x'.repeat(161) })).statusCode).toBe(400);
    for (const imageUrl of [
      'https://pistage.example/image.webp',
      'http://assets.yner.fr/Map/a.webp',
      'https://assets.yner.fr/Map/a.webp?x=1',
      'https://assets.yner.fr/Map/%2e%2e/a.webp',
    ])
      expect((await post({ imageUrl })).json()).toMatchObject({
        status: 400,
        code: 'invalid_image',
      });

    // Bibliothèque désactivée : seule une image envoyée est acceptée
    const strict = await testApp({ PRESET_IMAGES_URL: '' });
    try {
      const s = helpers(strict);
      const u = await strict.user();
      const r = await s.request(u, 'POST', '/v1/campaigns', {
        name: 'X',
        systemId: 'dnd-classic',
        imageUrl: COVER,
      });
      expect(r.json()).toMatchObject({ code: 'invalid_image' });
    } finally {
      await strict.close();
    }
  });

  it('mes campagnes : premiers membres (MJ d’abord), prochaine session, personnages engagés', async () => {
    const others = await Promise.all(Array.from({ length: 5 }, () => t.user()));
    const id = await h.campaign(gm, 'dnd-classic', [alice, ...others]);
    const later = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const sooner = new Date(Date.now() + 86_400_000).toISOString();
    await h.ok(gm, 'POST', `/v1/campaigns/${id}/sessions`, { date: later });
    const next = await h.ok<{ id: string }>(gm, 'POST', `/v1/campaigns/${id}/sessions`, {
      date: sooner,
      title: 'Le col',
    });
    const hero = await h.engage(id, alice);
    const npc = await h.engage(id, gm);
    await h.ok(alice, 'PUT', `/v1/campaigns/${id}/me/character`, { characterId: hero });

    const [mine] = await h.ok<MyCampaign[]>(alice, 'GET', '/v1/campaigns');
    expect(mine).toMatchObject({
      id,
      role: 'player',
      memberCount: 7,
      nextSession: { id: next.id, title: 'Le col' },
      playedCharacterId: hero,
      characterIds: [hero, npc],
    });
    expect(mine!.members).toHaveLength(5);
    expect(mine!.members[0]).toMatchObject({ userId: gm.id, name: 'Maître', role: 'gm' });
    expect(new Date(mine!.nextSession!.date).toISOString()).toBe(sooner);
    const [asGm] = await h.ok<MyCampaign[]>(gm, 'GET', '/v1/campaigns');
    expect(asGm).toMatchObject({ playedCharacterId: null, characterIds: [hero, npc] });
  });

  it('nouveau code : MJ seulement, l’ancien ne vaut plus, campaign.updated', async () => {
    const id = await h.campaign(gm, 'dnd-classic', [alice]);
    const before = await h.ok<Campaign>(gm, 'GET', `/v1/campaigns/${id}`);
    expect((await h.request(alice, 'POST', `/v1/campaigns/${id}/code`)).statusCode).toBe(403);

    const after = await h.ok<Campaign>(gm, 'POST', `/v1/campaigns/${id}/code`);
    expect(after.code).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(after.code).not.toBe(before.code);
    expect(after.version).toBe(before.version + 1);
    const updated = (await events(id)).filter((e) => e.type === 'campaign.updated').at(-1)!;
    expect(updated.payload).toMatchObject({
      code: after.code,
      changes: [{ path: 'code', before: before.code, after: after.code }],
    });

    const bob = await t.user();
    expect(
      (await h.request(bob, 'POST', '/v1/campaigns/join', { code: before.code })).statusCode,
    ).toBe(404);
    expect(
      (await h.request(bob, 'POST', '/v1/campaigns/join', { code: after.code })).json(),
    ).toMatchObject({ id, role: 'player' });
  });
});
