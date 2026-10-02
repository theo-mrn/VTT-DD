/**
 * Projection et documents (docs/projection.md) sur un vrai PostgreSQL : bibliothèque du MJ,
 * partage à toute la table ou à certains, projection en cours, arrêt, suppression, événements.
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

interface Doc {
  id: string;
  mode: string;
  recipients: string[] | null;
  stoppedAt: string | null;
  startsAt: string;
  sharedAt: string;
  handout: { id: string; name: string; contentType: string };
}
interface Docs {
  items: Doc[];
  projection: Doc | null;
}

describe.skipIf(!TEST_DATABASE_URL)('projection et documents', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    bob = await t.user();
    campaignId = await h.campaign(gm, 'dnd-classic', [alice, bob]);
  });

  afterEach(async () => {
    await t.close();
  });

  const base = () => `/v1/campaigns/${campaignId}`;
  const file = (ext: string) =>
    `https://cdn.test.local/vtt/campaigns/${campaignId}/${crypto.randomUUID()}.${ext}`;
  const docs = (u: TestUser) => h.ok<Docs>(u, 'GET', `${base()}/documents`);
  const events = async () =>
    t
      .db!.select({
        type: sql<string>`${outbox.envelope}->>'type'`,
        visibility: sql<string>`${outbox.envelope}->>'visibility'`,
        payload: sql<Record<string, unknown>>`${outbox.envelope}->'payload'`,
      })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${campaignId} and ${outbox.envelope}->>'type' like 'handout.%'`,
      )
      .orderBy(outbox.id);

  it('bibliothèque : fichier de la campagne seulement, réservée au MJ', async () => {
    const map = await h.ok<{ id: string; contentType: string }>(gm, 'POST', `${base()}/handouts`, {
      name: 'Carte au trésor',
      url: file('webp'),
    });
    expect(map.contentType).toBe('image/webp');
    const elsewhere = await h.request(gm, 'POST', `${base()}/handouts`, {
      name: 'Ailleurs',
      url: `https://cdn.test.local/vtt/campaigns/${crypto.randomUUID()}/${crypto.randomUUID()}.png`,
    });
    expect(elsewhere.statusCode).toBe(422);
    expect(
      (await h.request(alice, 'POST', `${base()}/handouts`, { name: 'x', url: file('png') }))
        .statusCode,
    ).toBe(403);
    expect((await h.request(alice, 'GET', `${base()}/handouts`)).statusCode).toBe(403);
    await h.ok(gm, 'PATCH', `${base()}/handouts/${map.id}`, { name: 'Carte' });
    const lib = await h.ok<{ items: { name: string }[] }>(gm, 'GET', `${base()}/handouts`);
    expect(lib.items.map((i) => i.name)).toEqual(['Carte']);
    expect((await events()).map((e) => `${e.type}:${e.visibility}`)).toEqual([
      'handout.created:gm_only',
      'handout.updated:gm_only',
    ]);
  });

  it('projeter à tous, envoyer à un seul ; projection en cours, arrêt, suppression', async () => {
    const video = await h.ok<{ id: string }>(gm, 'POST', `${base()}/handouts`, {
      name: 'Le dragon',
      url: file('webm'),
    });
    const letter = await h.ok<{ id: string }>(gm, 'POST', `${base()}/handouts`, {
      name: 'Lettre',
      url: file('png'),
    });
    const shown = await h.ok<{ id: string }>(gm, 'POST', `${base()}/handouts/${video.id}/share`, {
      mode: 'show',
    });
    await h.ok(gm, 'POST', `${base()}/handouts/${letter.id}/share`, {
      mode: 'send',
      recipients: [alice.id],
    });
    // Destinataire hors campagne : refusé
    const stranger = await t.user();
    expect(
      (
        await h.request(gm, 'POST', `${base()}/handouts/${letter.id}/share`, {
          mode: 'send',
          recipients: [stranger.id],
        })
      ).statusCode,
    ).toBe(422);

    const a = await docs(alice);
    const b = await docs(bob);
    expect(a.items.map((d) => d.handout.name)).toEqual(['Lettre', 'Le dragon']);
    expect(b.items.map((d) => d.handout.name)).toEqual(['Le dragon']);
    expect(b.projection).toMatchObject({ id: shown.id, mode: 'show' });
    // Vidéo projetée : départ commun 1,5 s après le partage
    expect(Date.parse(b.projection!.startsAt) - Date.parse(b.projection!.sharedAt)).toBe(1_500);
    expect((await docs(gm)).items).toHaveLength(2);

    const shared = (await events()).filter((e) => e.type === 'handout.shared');
    expect(shared.map((e) => e.visibility)).toEqual(['public', 'gm_only']);
    expect(shared[1]!.payload.visibleToUsers).toEqual([alice.id]);

    // Arrêt : plus de projection en cours, le document reste
    expect(
      (await h.request(alice, 'POST', `${base()}/handout-shares/${shown.id}/stop`)).statusCode,
    ).toBe(403);
    await h.ok(gm, 'POST', `${base()}/handout-shares/${shown.id}/stop`);
    expect((await docs(bob)).projection).toBeNull();
    expect((await docs(bob)).items).toHaveLength(1);
    expect(
      (await h.request(gm, 'POST', `${base()}/handout-shares/${shown.id}/stop`)).statusCode,
    ).toBe(404);

    // Suppression : le document disparaît de chez chacun
    await h.ok(gm, 'DELETE', `${base()}/handouts/${video.id}`);
    expect((await docs(bob)).items).toEqual([]);
    expect((await events()).map((e) => e.type).slice(-2)).toEqual([
      'handout.stopped',
      'handout.deleted',
    ]);
  });
});
