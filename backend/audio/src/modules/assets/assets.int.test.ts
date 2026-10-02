/** Bibliothèque : envoi signé, catalogue, YouTube, modification, suppression, droits. */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assets, jobs } from '../../db/schema.js';
import { helpers, TEST_DATABASE_URL, testApp, type TestContext } from '../../test/test-app.js';

const MP3 = Buffer.concat([
  Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00', 'latin1'),
  Buffer.alloc(2000),
]);

describe.skipIf(!TEST_DATABASE_URL)('bibliothèque', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let c: Awaited<ReturnType<TestContext['table']>>;
  const base = () => `/v1/audio/campaigns/${c.id}/assets`;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    c = await t.table();
  });
  afterEach(async () => t.close());

  /** Envoi complet : URL signée, dépôt du fichier, création. */
  async function upload(body = MP3, contentType = 'audio/mpeg', kind = 'music', name = 'Taverne') {
    const ticket = await h.ok(c.gm, 'POST', `${base()}/uploads`, {
      fileName: 'taverne.mp3',
      contentType,
      size: body.length,
      kind,
    });
    const key = new URL(ticket.uploadUrl).pathname.replace(/^\/vtt\//, '');
    t.files.put(key, body, contentType);
    return {
      ticket,
      key,
      res: await h.request(c.gm, 'POST', base(), {
        source: 'upload',
        uploadToken: ticket.uploadToken,
        name,
        kind,
      }),
    };
  }

  it('envoi : jeton signé, type réel vérifié, asset en traitement, job et événement', async () => {
    const { ticket, key, res } = await upload();
    expect(ticket.headers).toEqual({ 'content-type': 'audio/mpeg' });
    expect(key).toMatch(new RegExp(`^audio/incoming/${c.id}/`));
    expect(res.statusCode).toBe(201);
    const asset = res.json();
    expect(asset).toMatchObject({
      status: 'processing',
      source: 'upload',
      kind: 'music',
      url: null,
      sizeBytes: MP3.length,
    });
    const js = await t.db!.select().from(jobs).where(eq(jobs.assetId, asset.id));
    expect(js.map((j) => j.kind)).toEqual(['analyze']);
    const ev = (await h.events(c.id)).filter((e) => e.type === 'audio.asset_created');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.visibility).toBe('gm_only');
    // Rejoué : même asset, pas de second événement
    const again = await h.request(c.gm, 'POST', base(), {
      source: 'upload',
      uploadToken: ticket.uploadToken,
      name: 'Taverne',
      kind: 'music',
    });
    expect(again.json().id).toBe(asset.id);
    expect((await h.events(c.id)).filter((e) => e.type === 'audio.asset_created')).toHaveLength(1);
  });

  it('envoi refusé : type, taille, fichier renommé, fichier absent, jeton d’une autre campagne', async () => {
    const r = (b: Record<string, unknown>) =>
      h.request(c.gm, 'POST', `${base()}/uploads`, {
        fileName: 'x',
        size: 10,
        kind: 'sfx',
        contentType: 'audio/mpeg',
        ...b,
      });
    expect((await r({ contentType: 'image/png' })).statusCode).toBe(415);
    expect((await r({ size: 21 * 1024 * 1024 })).json().code).toBe('file_too_large');
    expect((await r({ size: 21 * 1024 * 1024, kind: 'music' })).statusCode).toBe(201);
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(100),
    ]);
    expect((await upload(png)).res.statusCode).toBe(415);
    const ticket = await h.ok(c.gm, 'POST', `${base()}/uploads`, {
      fileName: 'x.mp3',
      contentType: 'audio/mpeg',
      size: 100,
      kind: 'music',
    });
    const missing = await h.request(c.gm, 'POST', base(), {
      source: 'upload',
      uploadToken: ticket.uploadToken,
      name: 'x',
      kind: 'music',
    });
    expect(missing.json().code).toBe('invalid_upload');
    const other = await t.table();
    const cross = await h.request(other.gm, 'POST', `/v1/audio/campaigns/${other.id}/assets`, {
      source: 'upload',
      uploadToken: ticket.uploadToken,
      name: 'x',
      kind: 'music',
    });
    expect(cross.json().code).toBe('invalid_upload');
    const forged = await h.request(c.gm, 'POST', base(), {
      source: 'upload',
      uploadToken: `${ticket.uploadToken}x`,
      name: 'x',
      kind: 'music',
    });
    expect(forged.json().code).toBe('invalid_upload');
  });

  it('quota de la campagne : place réservée chez campaign, refus transmis', async () => {
    t.campaign.setQuota(3000);
    expect((await upload()).res.statusCode).toBe(201);
    const res = await h.request(c.gm, 'POST', `${base()}/uploads`, {
      fileName: 'x',
      contentType: 'audio/mpeg',
      size: 2000,
      kind: 'music',
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('storage_quota_exceeded');
  });

  it('YouTube : lien nettoyé, prêt tout de suite, doublon fusionné, id invalide refusé', async () => {
    const a = await h.ok(c.gm, 'POST', base(), {
      source: 'youtube',
      url: 'https://youtu.be/dQw4w9WgXcQ?t=3',
      name: 'Épique',
    });
    expect(a).toMatchObject({
      status: 'ready',
      youtubeId: 'dQw4w9WgXcQ',
      kind: 'music',
      url: null,
    });
    const b = await h.ok(c.gm, 'POST', base(), {
      source: 'youtube',
      url: 'dQw4w9WgXcQ\t',
      name: 'Épique 2',
    });
    expect(b.id).toBe(a.id);
    const bad = await h.request(c.gm, 'POST', base(), {
      source: 'youtube',
      url: 'https://vimeo.com/1',
      name: 'x',
    });
    expect(bad.json().code).toBe('invalid_youtube_id');
  });

  it('catalogue : entrée connue, analyse planifiée ; inconnue : 404', async () => {
    const a = await h.ok(c.gm, 'POST', base(), {
      source: 'catalog',
      catalogId: 'default.nature.pluie',
    });
    expect(a).toMatchObject({
      name: 'Pluie',
      kind: 'ambience',
      source: 'catalog',
      status: 'processing',
      catalogId: 'default.nature.pluie',
    });
    expect(
      (await h.request(c.gm, 'POST', base(), { source: 'catalog', catalogId: 'nope' })).json().code,
    ).toBe('catalog_entry_not_found');
  });

  it('droits : joueur (effets prêts seulement), spectateur et étranger', async () => {
    await h.ok(c.gm, 'POST', base(), { source: 'youtube', url: 'dQw4w9WgXcQ', name: 'Musique' });
    await h.ok(c.gm, 'POST', base(), {
      source: 'youtube',
      url: 'aaaaaaaaaaa',
      name: 'Cri',
      kind: 'sfx',
    });
    expect((await h.ok(c.gm, 'GET', base())).items).toHaveLength(2);
    expect((await h.request(c.player, 'GET', base())).statusCode).toBe(403);
    expect(
      (await h.ok(c.player, 'GET', `${base()}?kind=sfx`)).items.map(
        (a: { name: string }) => a.name,
      ),
    ).toEqual(['Cri']);
    expect((await h.request(c.spectator, 'GET', `${base()}?kind=sfx`)).statusCode).toBe(403);
    expect((await h.request(c.stranger, 'GET', base())).statusCode).toBe(404);
    expect(
      (
        await h.request(c.player, 'POST', base(), {
          source: 'youtube',
          url: 'dQw4w9WgXcQ',
          name: 'x',
        })
      ).statusCode,
    ).toBe(403);
  });

  it('recherche et pagination', async () => {
    for (const n of ['Orage', 'Forge', 'Orque'])
      await h.ok(c.gm, 'POST', base(), { source: 'youtube', url: `${n.padEnd(11, 'x')}`, name: n });
    expect(
      (await h.ok(c.gm, 'GET', `${base()}?q=or`)).items.map((a: { name: string }) => a.name),
    ).toEqual(['Forge', 'Orage', 'Orque']);
    expect((await h.ok(c.gm, 'GET', `${base()}?q=%25`)).items).toEqual([]);
  });

  it('modification : version, conflit, sans effet, événement avec changes', async () => {
    const a = await h.ok(c.gm, 'POST', base(), {
      source: 'youtube',
      url: 'dQw4w9WgXcQ',
      name: 'A',
    });
    const b = await h.ok(c.gm, 'PATCH', `${base()}/${a.id}`, {
      name: 'B',
      volume: 0.5,
      durationMs: 180_000,
      version: a.version,
    });
    expect(b).toMatchObject({
      name: 'B',
      volume: 0.5,
      durationMs: 180_000,
      version: a.version + 1,
    });
    const conflict = await h.request(c.gm, 'PATCH', `${base()}/${a.id}`, {
      name: 'C',
      version: a.version,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().current.name).toBe('B');
    expect((await h.ok(c.gm, 'PATCH', `${base()}/${a.id}`, { name: 'B' })).version).toBe(b.version);
    const ev = (await h.events(c.id)).filter((e) => e.type === 'audio.asset_updated');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.payload.changes.map((x: { path: string }) => x.path).sort()).toEqual([
      'durationMs',
      'name',
      'volume',
    ]);
  });

  it('suppression logique : sort des playlists, purge planifiée, résolue « supprimée »', async () => {
    const { res } = await upload();
    const a = res.json();
    const yt = await h.ok(c.gm, 'POST', base(), {
      source: 'youtube',
      url: 'dQw4w9WgXcQ',
      name: 'Y',
    });
    const p = await h.ok(c.gm, 'POST', `/v1/audio/campaigns/${c.id}/playlists`, {
      name: 'L',
      assetIds: [a.id, yt.id],
    });
    expect((await h.request(c.gm, 'DELETE', `${base()}/${a.id}`)).statusCode).toBe(204);
    expect((await h.request(c.gm, 'DELETE', `${base()}/${a.id}`)).statusCode).toBe(404);
    const lists = await h.ok(c.gm, 'GET', `/v1/audio/campaigns/${c.id}/playlists`);
    expect(lists.items[0]).toMatchObject({ id: p.id, assetIds: [yt.id], version: p.version + 1 });
    const purge = await t.db!.select().from(jobs).where(eq(jobs.assetId, a.id));
    expect(purge.find((j) => j.kind === 'purge')!.runAfter.getTime()).toBeGreaterThan(
      Date.now() + 29 * 86_400_000,
    );
    const resolved = await h.ok(c.player, 'GET', `${base()}/resolve?ids=${a.id},${yt.id}`);
    expect(resolved.items.find((x: { id: string }) => x.id === a.id).deleted).toBe(true);
    const [row] = await t.db!.select().from(assets).where(eq(assets.id, a.id));
    expect(row!.deletedAt).not.toBeNull();
  });
});
