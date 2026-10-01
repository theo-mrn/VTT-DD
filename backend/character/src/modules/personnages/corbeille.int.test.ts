/**
 * Corbeille (docs/nettoyage.md) : un personnage ou un modèle supprimé
 * disparaît des listes, reste restaurable TRASH_DAYS jours par son
 * propriétaire (le MJ pour un modèle), puis ne l'est plus.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { characters, npcTemplates, objectTemplates, outbox } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

const SECRET = 'secret-interne-de-test-0123456789abcdef';

describe.skipIf(!TEST_DATABASE_URL)('corbeille', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let alice: Utilisateur;
  let bob: Utilisateur;
  let campagne: string;
  let base: string;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET }, { droits: salles.droits });
    o = outils(t);
    [alice, bob] = await Promise.all([t.utilisateur(), t.utilisateur()]);
    campagne = crypto.randomUUID();
    salles.nommer(campagne, alice.id, 'gm');
    salles.nommer(campagne, bob.id, 'player');
    base = `/v1/campaigns/${campagne}`;
  });

  afterEach(async () => {
    await t.db!.delete(npcTemplates).where(eq(npcTemplates.campaignId, campagne));
    await t.db!.delete(objectTemplates).where(eq(objectTemplates.campaignId, campagne));
    await t.db!.delete(outbox).where(sql`${outbox.envelope}->>'roomId' = ${campagne}`);
    await t.fermer();
  });

  const json = async (
    u: Utilisateur,
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body?: object,
  ) => {
    const res = await o.requete(u, method, url, body);
    if (res.statusCode >= 300) throw new Error(`${method} ${url} : ${res.statusCode} ${res.body}`);
    return res.statusCode === 204 ? undefined : res.json();
  };
  const types = async (id: string) =>
    (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${id}`)
        .orderBy(outbox.id)
    ).map((e) => (e.envelope as { type: string }).type);
  /** Recule la date de suppression au-delà de la fenêtre de restauration. */
  const vieillir = (table: typeof characters | typeof npcTemplates, id: string) =>
    t
      .db!.update(table)
      .set({ deletedAt: sql`now() - interval '8 days'` })
      .where(inArray(table.id, [id]));

  it('personnage : corbeille, restauration par son propriétaire seulement, puis expiration', async () => {
    const p = await o.ok(alice, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom: 'Thorin',
    });
    expect(await json(alice, 'GET', '/v1/characters/trash')).toEqual([]);

    await json(alice, 'DELETE', `/v1/characters/${p.id}`);
    expect(await json(alice, 'GET', '/v1/characters')).toEqual([]);
    const [ligne] = (await json(alice, 'GET', '/v1/characters/trash')) as Record<string, string>[];
    expect(ligne).toMatchObject({ id: p.id, kind: 'character', name: 'Thorin', imageUrl: null });
    const ecart = Date.parse(ligne!.purgeAt!) - Date.parse(ligne!.deletedAt!);
    expect(ecart).toBe(7 * 86_400_000);
    // La corbeille des autres ne montre rien, ils ne peuvent pas restaurer
    expect(await json(bob, 'GET', '/v1/characters/trash')).toEqual([]);
    expect((await o.requete(bob, 'POST', `/v1/characters/${p.id}/restore`)).statusCode).toBe(404);

    await json(alice, 'POST', `/v1/characters/${p.id}/restore`);
    expect(await json(alice, 'GET', `/v1/characters/${p.id}`)).toMatchObject({
      nom: 'Thorin',
      version: 3,
    });
    expect(await json(alice, 'GET', '/v1/characters/trash')).toEqual([]);
    expect(await types(p.id)).toEqual([
      'character.created',
      'character.deleted',
      'character.restored',
    ]);
    // Déjà restauré : plus rien à restaurer
    expect((await o.requete(alice, 'POST', `/v1/characters/${p.id}/restore`)).statusCode).toBe(404);

    await json(alice, 'DELETE', `/v1/characters/${p.id}`);
    await vieillir(characters, p.id);
    expect(await json(alice, 'GET', '/v1/characters/trash')).toEqual([]);
    expect((await o.requete(alice, 'POST', `/v1/characters/${p.id}/restore`)).statusCode).toBe(404);
  });

  it('instance de PNJ : jamais dans la corbeille (son modèle demeure)', async () => {
    const p = await o.ok(alice, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom: 'Gobelin 1',
    });
    await t.db!.update(characters).set({ kind: 'npc' }).where(eq(characters.id, p.id));
    await json(alice, 'DELETE', `/v1/characters/${p.id}`);
    expect(await json(alice, 'GET', '/v1/characters/trash')).toEqual([]);
    expect((await o.requete(alice, 'POST', `/v1/characters/${p.id}/restore`)).statusCode).toBe(404);
  });

  it('modèles : corbeille du MJ, exclus des listes et de l’instanciation, restaurables', async () => {
    const orque = (await json(alice, 'POST', `${base}/npc-templates`, {
      name: 'Orque',
      systemeId: 'dnd-classic',
      type: 'personnage',
      imageUrl: 'https://assets.test/orque.png',
    })) as { id: string };
    const coffre = (await json(alice, 'POST', `${base}/object-templates`, {
      name: 'Coffre',
    })) as { id: string };

    await json(alice, 'DELETE', `${base}/npc-templates/${orque.id}`);
    await json(alice, 'DELETE', `${base}/object-templates/${coffre.id}`);
    expect(await json(alice, 'GET', `${base}/npc-templates`)).toEqual([]);
    expect(await json(alice, 'GET', `${base}/object-templates`)).toEqual([]);
    const corbeille = (await json(alice, 'GET', `${base}/template-trash`)) as object[];
    expect(corbeille).toHaveLength(2);
    expect(corbeille).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: orque.id,
          kind: 'npc_template',
          name: 'Orque',
          imageUrl: 'https://assets.test/orque.png',
        }),
        expect.objectContaining({ id: coffre.id, kind: 'object_template', name: 'Coffre' }),
      ]),
    );
    // Réservée au MJ
    expect((await o.requete(bob, 'GET', `${base}/template-trash`)).statusCode).toBe(403);
    expect(
      (await o.requete(bob, 'POST', `${base}/npc-templates/${orque.id}/restore`)).statusCode,
    ).toBe(403);

    // Un modèle à la corbeille ne s'instancie plus
    const instancier = () =>
      t.app.inject({
        method: 'POST',
        url: '/internal/npcs',
        headers: { 'x-internal-secret': SECRET },
        payload: {
          ownerId: alice.id,
          campaignId: campagne,
          systemId: 'dnd-classic',
          count: 1,
          source: { templateId: orque.id },
        },
      });
    expect((await instancier()).statusCode).toBe(404);

    expect(await json(alice, 'POST', `${base}/npc-templates/${orque.id}/restore`)).toMatchObject({
      id: orque.id,
      name: 'Orque',
    });
    expect(
      await json(alice, 'POST', `${base}/object-templates/${coffre.id}/restore`),
    ).toMatchObject({ id: coffre.id, name: 'Coffre' });
    expect(await json(alice, 'GET', `${base}/template-trash`)).toEqual([]);
    expect(await json(alice, 'GET', `${base}/npc-templates`)).toHaveLength(1);
    expect(await json(alice, 'GET', `${base}/object-templates`)).toHaveLength(1);
    expect((await instancier()).statusCode).toBe(201);
    expect(await types(orque.id)).toEqual([
      'npc_template.created',
      'npc_template.deleted',
      'npc_template.restored',
    ]);

    // Passé le délai : ni listé ni restaurable
    await json(alice, 'DELETE', `${base}/npc-templates/${orque.id}`);
    await vieillir(npcTemplates, orque.id);
    expect(await json(alice, 'GET', `${base}/template-trash`)).toEqual([]);
    expect(
      (await o.requete(alice, 'POST', `${base}/npc-templates/${orque.id}/restore`)).statusCode,
    ).toBe(404);
  });
});
