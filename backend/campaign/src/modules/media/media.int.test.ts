/**
 * Médiathèque sur un vrai PostgreSQL : dossiers sur trois niveaux, visibilité décidée par le MJ
 * (un dossier visible montre son contenu), ce qu'un joueur voit et range, suppression d'un
 * dossier qui remonte son contenu.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { campaignStorageFiles } from '../../db/schema.js';
import {
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../../test/test-app.js';

interface Folder {
  id: string;
  name: string;
  mine: boolean;
  version: number;
}
interface Listing {
  path: { id: string; name: string }[];
  folders: Folder[];
  files: { key: string; mine: boolean }[];
}

describe.skipIf(!TEST_DATABASE_URL)('médiathèque', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let gm: TestUser;
  let alice: TestUser;
  let campaignId: string;

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    gm = await t.user();
    alice = await t.user();
    campaignId = await h.campaign(gm, 'dnd-classic', [alice]);
  });

  afterEach(async () => {
    await t.close();
  });

  const url = (rest = '') => `/v1/campaigns/${campaignId}/media${rest}`;
  const fichier = (key: string, folderId: string | null, uploadedBy: string | null) =>
    t.db!.insert(campaignStorageFiles).values({
      key,
      campaignId,
      size: 10,
      contentType: 'image/webp',
      usage: 'map-object',
      state: 'stored',
      folderId,
      uploadedBy,
    });

  it('dossiers sur trois niveaux, visibles des joueurs seulement si le MJ le décide', async () => {
    const cartes = await h.ok<Folder>(gm, 'POST', url('/folders'), { name: 'Cartes' });
    const donjon = await h.ok<Folder>(gm, 'POST', url('/folders'), {
      name: 'Donjon',
      parentId: cartes.id,
    });
    const etage = await h.ok<Folder>(gm, 'POST', url('/folders'), {
      name: 'Étage 2',
      parentId: donjon.id,
    });
    expect(
      (await h.request(gm, 'POST', url('/folders'), { name: 'Trop', parentId: etage.id }))
        .statusCode,
    ).toBe(422);

    await fichier(`campaigns/${campaignId}/a.webp`, donjon.id, gm.id);
    await fichier(`campaigns/${campaignId}/b.webp`, null, alice.id);

    // Joueur : rien du MJ, mais son propre envoi
    let vue = await h.ok<Listing>(alice, 'GET', url());
    expect(vue.folders).toEqual([]);
    expect(vue.files.map((f) => f.key)).toEqual([`campaigns/${campaignId}/b.webp`]);
    expect((await h.request(alice, 'GET', url(`?folder=${donjon.id}`))).statusCode).toBe(404);

    // Le MJ rend « Cartes » visible : son contenu l'est aussi
    expect(
      (await h.request(alice, 'PATCH', url(`/folders/${cartes.id}`), { visibleToPlayers: true }))
        .statusCode,
    ).toBe(403);
    await h.ok(gm, 'PATCH', url(`/folders/${cartes.id}`), { visibleToPlayers: true });
    vue = await h.ok<Listing>(alice, 'GET', url(`?folder=${donjon.id}`));
    expect(vue.path.map((p) => p.name)).toEqual(['Cartes', 'Donjon']);
    expect(vue.files.map((f) => f.key)).toEqual([`campaigns/${campaignId}/a.webp`]);

    // Un joueur ne range pas les fichiers du MJ
    expect(
      (
        await h.request(alice, 'PATCH', url(`/files?key=campaigns/${campaignId}/a.webp`), {
          folderId: null,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('supprimer un dossier remonte son contenu, jamais un fichier', async () => {
    const parent = await h.ok<Folder>(alice, 'POST', url('/folders'), { name: 'Portraits' });
    const enfant = await h.ok<Folder>(alice, 'POST', url('/folders'), {
      name: 'Anciens',
      parentId: parent.id,
    });
    await fichier(`characters/x/c.webp`, enfant.id, alice.id);
    expect((await h.request(alice, 'DELETE', url(`/folders/${enfant.id}`))).statusCode).toBe(204);
    const vue = await h.ok<Listing>(alice, 'GET', url(`?folder=${parent.id}`));
    expect(vue.files.map((f) => f.key)).toEqual(['characters/x/c.webp']);
  });
});
