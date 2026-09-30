/**
 * Envoi d'un portrait (`POST /v1/characters/:id/uploads`, docs/uploads.md) : billet signé pour
 * qui a la main sur le personnage, clé dans son dossier ; format, taille et usage vérifiés.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

const STOCKAGE = {
  S3_ENDPOINT: 'http://localhost:8333',
  S3_BUCKET: 'vtt-test',
  S3_ACCESS_KEY_ID: 'cle',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_URL: 'https://cdn.test/vtt',
};

describe.skipIf(!TEST_DATABASE_URL)('envoi d’un portrait', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  let o: ReturnType<typeof outils>;
  let proprietaire: Utilisateur;
  let etranger: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest(STOCKAGE);
    o = outils(t);
    [proprietaire, etranger] = await Promise.all([t.utilisateur(), t.utilisateur()]);
  });
  afterEach(async () => {
    await t.fermer();
  });

  it('billet signé pour le propriétaire, dans le dossier du personnage', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    const res = await o.requete(proprietaire, 'POST', `/v1/characters/${p.id}/uploads`, {
      usage: 'portrait',
      contentType: 'image/webp',
      size: 120_000,
      name: 'thorin.webp',
    });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'image/webp' } });
    expect(b.key).toMatch(new RegExp(`^characters/${p.id}/[0-9a-f-]+\\.webp$`));
    expect(b.publicUrl).toBe(`https://cdn.test/vtt/${b.key}`);
    expect(b.url).toContain('X-Amz-Signature');
  });

  it('refus : étranger 403/404, autre usage 422, format 415, taille 413', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    const url = `/v1/characters/${p.id}/uploads`;
    const demande = { usage: 'portrait', contentType: 'image/png', size: 1000 };
    expect([403, 404]).toContain((await o.requete(etranger, 'POST', url, demande)).statusCode);
    expect(
      (await o.requete(proprietaire, 'POST', url, { ...demande, usage: 'avatar' })).statusCode,
    ).toBe(422);
    expect(
      (await o.requete(proprietaire, 'POST', url, { ...demande, contentType: 'video/mp4' }))
        .statusCode,
    ).toBe(415);
    expect(
      (await o.requete(proprietaire, 'POST', url, { ...demande, size: 50_000_000 })).statusCode,
    ).toBe(413);
  });

  it('import d’une image d’un autre site : droits, adresses locales et protocoles refusés', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    const url = `/v1/characters/${p.id}/uploads/import`;
    const demande = { usage: 'portrait', url: 'http://127.0.0.1/portrait.png' };
    expect([403, 404]).toContain((await o.requete(etranger, 'POST', url, demande)).statusCode);
    const local = await o.requete(proprietaire, 'POST', url, demande);
    expect(local.statusCode).toBe(422);
    expect(local.json().code).toBe('address_not_allowed');
    expect(
      (await o.requete(proprietaire, 'POST', url, { ...demande, url: 'file:///etc/passwd' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await o.requete(proprietaire, 'POST', url, { ...demande, usage: 'avatar' })).statusCode,
    ).toBe(422);
  });

  it('Studio : token et réglages enregistrés, relus ; réglages invalides refusés', async () => {
    const p = await o.nainGuerrier(proprietaire, 'Thorin');
    const ticket = (
      await o.requete(proprietaire, 'POST', `/v1/characters/${p.id}/uploads`, {
        usage: 'token',
        contentType: 'image/webp',
        size: 50_000,
      })
    ).json();
    expect(ticket.key).toMatch(new RegExp(`^characters/${p.id}/`));
    const studio = {
      source: 'https://cdn.test/vtt/characters/source.webp',
      portrait: { x: 0.1, y: 0, width: 0.6, height: 0.8 },
      token: { x: 0.2, y: 0.05, width: 0.4, height: 0.4 },
      frame: 'https://assets.yner.fr/Token/Token1.png',
      radius: 50,
      inset: 8,
    };
    const res = await o.requete(proprietaire, 'PATCH', `/v1/characters/${p.id}`, {
      version: p.version,
      tokenUrl: ticket.publicUrl,
      portraitStudio: studio,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ tokenUrl: ticket.publicUrl, portraitStudio: studio });
    const relu = (await o.requete(proprietaire, 'GET', `/v1/characters/${p.id}`)).json();
    expect(relu).toMatchObject({ tokenUrl: ticket.publicUrl, portraitStudio: studio });
    const mauvais = await o.requete(proprietaire, 'PATCH', `/v1/characters/${p.id}`, {
      version: relu.version,
      portraitStudio: { ...studio, radius: 80 },
    });
    expect(mauvais.statusCode).toBe(400);
  });
});
