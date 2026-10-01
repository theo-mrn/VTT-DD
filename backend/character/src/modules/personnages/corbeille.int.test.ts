/**
 * Corbeille (docs/nettoyage.md) : un personnage supprimé disparaît des listes,
 * reste restaurable TRASH_DAYS jours par son propriétaire, puis ne l'est plus.
 */
import { eq, inArray, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { characters, outbox } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

describe.skipIf(!TEST_DATABASE_URL)('corbeille', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    [alice, bob] = await Promise.all([t.utilisateur(), t.utilisateur()]);
  });

  afterEach(async () => {
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
  const vieillir = (id: string) =>
    t
      .db!.update(characters)
      .set({ deletedAt: sql`now() - interval '8 days'` })
      .where(inArray(characters.id, [id]));

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
    await vieillir(p.id);
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
});
