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
});
