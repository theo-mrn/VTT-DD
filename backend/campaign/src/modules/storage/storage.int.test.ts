/**
 * Stockage d'une campagne (docs/stockage.md) sur un vrai PostgreSQL : réservation sous quota à
 * l'envoi (route commune et route interne), inventaire d'un stockage en mémoire, résumé de
 * l'écran du MJ, suppression d'un fichier inutilisé seulement.
 */
import { memoryObjectStore } from '@vtt/platform';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  helpers,
  SECRET,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

const HOUR = 3_600_000;

describe.skipIf(!TEST_DATABASE_URL)('stockage', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let campaignId: string;
  const sizes: Record<string, number> = {};
  const mem = memoryObjectStore({}, sizes);
  /** Clés citées par une table : `{ clé: [tables] }`. */
  let cited: Record<string, string[]> = {};

  beforeEach(async () => {
    mem.objects.clear();
    cited = {};
    t = await testApp(
      { CAMPAIGN_STORAGE_QUOTA_BYTES: '1000' },
      {
        store: mem.store,
        places: async (keys) =>
          Object.fromEntries(keys.filter((k) => cited[k]).map((k) => [k, cited[k]!])),
      },
    );
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    campaignId = await h.campaign(gm, 'dnd-classic', [alice]);
  });

  afterEach(async () => {
    await t.close();
  });

  const put = (key: string, size: number, ageMs = 5 * HOUR) => {
    mem.objects.set(key, new Date(Date.now() - ageMs));
    sizes[key] = size;
  };
  const ticket = (size: number) =>
    h.request(gm, 'POST', `/v1/campaigns/${campaignId}/uploads`, {
      usage: 'map-background',
      contentType: 'image/png',
      size,
    });
  const reserve = (body: object) =>
    t.app.inject({
      method: 'POST',
      url: '/internal/storage/reserve',
      headers: { 'x-internal-secret': SECRET },
      payload: body,
    });
  const summary = (refresh = true) =>
    h.ok<{
      usedBytes: number;
      quotaBytes: number;
      byCategory: { category: string; bytes: number }[];
      files: {
        key: string;
        category: string;
        usedBy: string[];
        deletable: boolean;
        pending: boolean;
      }[];
    }>(gm, 'GET', `/v1/campaigns/${campaignId}/storage${refresh ? '?refresh=1' : ''}`);

  it('quota : envois réservés jusqu’à la limite, puis refusés (route commune et interne)', async () => {
    expect((await ticket(600)).statusCode).toBe(200);
    const full = await ticket(500);
    expect(full.statusCode).toBe(422);
    expect(full.json()).toMatchObject({ code: 'storage_quota_exceeded' });
    // Son (audio) : réservé par la route interne
    const key = `audio/incoming/${campaignId}/${crypto.randomUUID()}`;
    const base = { key, usage: 'sound', contentType: 'audio/mpeg' };
    expect((await reserve({ ...base, campaignId, size: 300 })).statusCode).toBe(204);
    expect((await reserve({ ...base, key: `${key}x`, campaignId, size: 200 })).statusCode).toBe(
      422,
    );
    // Personnage hors de toute campagne : rien n'est compté
    expect(
      (await reserve({ ...base, characterId: crypto.randomUUID(), size: 5000 })).statusCode,
    ).toBe(204);
    // Le joueur ne voit pas l'écran du stockage
    expect((await h.request(alice, 'GET', `/v1/campaigns/${campaignId}/storage`)).statusCode).toBe(
      403,
    );
  });

  it('inventaire : fichiers de la campagne et de ses personnages, catégories, réservations expirées', async () => {
    const characterId = await h.engage(campaignId, alice);
    const background = `campaigns/${campaignId}/${crypto.randomUUID()}.png`;
    const portrait = `characters/${characterId}/${crypto.randomUUID()}.webp`;
    const sound = `audio/assets/${campaignId}/${crypto.randomUUID()}/original.mp3`;
    const elsewhere = `campaigns/${crypto.randomUUID()}/${crypto.randomUUID()}.png`;
    put(background, 400);
    put(portrait, 50);
    put(sound, 100);
    put(elsewhere, 999);
    cited = { [background]: ['maps'], [portrait]: ['characters', 'legacy_ids'] };
    expect((await ticket(300)).statusCode).toBe(200);

    let s = await summary();
    // Réservation en cours (300) comptée tant qu'elle n'a pas expiré
    expect(s.usedBytes).toBe(850);
    expect(s.files.find((f) => f.pending)).toBeDefined();
    t.advance(2 * HOUR);
    s = await summary();
    expect(s.usedBytes).toBe(550);
    expect(s.quotaBytes).toBe(1000);
    const byKey = Object.fromEntries(s.files.map((f) => [f.key, f]));
    expect(byKey[background]).toMatchObject({
      category: 'maps',
      usedBy: ['Fond de scène'],
      deletable: false,
    });
    expect(byKey[portrait]).toMatchObject({ category: 'characters', usedBy: ['Personnage'] });
    expect(byKey[sound]).toMatchObject({ category: 'sounds', deletable: false });
    expect(byKey[elsewhere]).toBeUndefined();
    expect(s.byCategory).toContainEqual({ category: 'maps', bytes: 400, count: 1 });

    // Fichier retiré du stockage : il disparaît de l'inventaire
    mem.objects.delete(portrait);
    s = await summary();
    expect(s.files.map((f) => f.key)).not.toContain(portrait);
  });

  it('suppression : seulement un fichier que plus rien n’utilise, vérifié au moment de la demande', async () => {
    const used = `campaigns/${campaignId}/${crypto.randomUUID()}.png`;
    const unused = `campaigns/${campaignId}/${crypto.randomUUID()}.webm`;
    put(used, 10);
    put(unused, 20);
    let s = await summary();
    expect(s.files.find((f) => f.key === unused)?.deletable).toBe(true);
    // Utilisé depuis l'inventaire : refusé
    cited = { [used]: ['map_objects'] };
    const refused = await h.request(
      gm,
      'DELETE',
      `/v1/campaigns/${campaignId}/storage/files?key=${encodeURIComponent(used)}`,
    );
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'file_in_use' });
    expect(mem.objects.has(used)).toBe(true);
    await h.ok(
      gm,
      'DELETE',
      `/v1/campaigns/${campaignId}/storage/files?key=${encodeURIComponent(unused)}`,
    );
    expect(mem.objects.has(unused)).toBe(false);
    s = await summary(false);
    expect(s.files.map((f) => f.key)).not.toContain(unused);
  });
});
