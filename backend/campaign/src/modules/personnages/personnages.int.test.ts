/**
 * Personnages engagés dans une salle : qui engage quoi, dans quel camp, qui
 * retire, et les droits que l'engagement donne (route interne de character).
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  appDeTest,
  outils,
  SECRET,
  TEST_DATABASE_URL,
  type Contexte,
  type Utilisateur,
} from '../../test/app-de-test.js';

interface Salle {
  personnages: { characterId: string; ownerId: string; camp: string; ajoutePar: string }[];
  combat?: { ordre: { characterId: string }[] };
}

describe.skipIf(!TEST_DATABASE_URL)('personnages engagés', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let mj: Utilisateur;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    mj = await t.utilisateur();
    alice = await t.utilisateur();
    bob = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const engager = (roomId: string, u: Utilisateur, corps: object) =>
    o.requete(u, 'POST', `/v1/rooms/${roomId}/personnages`, corps);
  const perso = (u: Utilisateur, systemeId = 'dnd-classic') =>
    t.character.ajouter({ ownerId: u.id, systemeId });
  const droits = async (characterId: string, u: Utilisateur) =>
    (
      await t.app.inject({
        method: 'GET',
        url: `/internal/characters/${characterId}/salles-de?userId=${u.id}`,
        headers: { 'x-internal-secret': SECRET },
      })
    ).json() as { lecture: boolean; ecriture: boolean };

  it('camp par défaut : joueurs pour un joueur, adversaires pour le MJ', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const heros = perso(alice);
    const res = await engager(id, alice, { characterId: heros.toUpperCase() });
    expect(res.statusCode, res.body).toBe(201);
    const pnj = perso(mj);
    const s = await o.ok<Salle>(mj, 'POST', `/v1/rooms/${id}/personnages`, { characterId: pnj });
    expect(s.personnages).toEqual([
      {
        characterId: heros,
        ownerId: alice.id,
        camp: 'joueurs',
        ajoutePar: alice.id,
        incarnePar: null,
      },
      { characterId: pnj, ownerId: mj.id, camp: 'adversaires', ajoutePar: mj.id, incarnePar: null },
    ]);
    // Le MJ choisit le camp de ses PNJ, un joueur peut engager un allié
    await o.ok(mj, 'POST', `/v1/rooms/${id}/personnages`, {
      characterId: perso(mj),
      camp: 'allies',
    });
    expect(
      (await engager(id, alice, { characterId: perso(alice), camp: 'allies' })).statusCode,
    ).toBe(201);

    // Le résumé est demandé à character avec le secret interne et l'origine
    const appel = t.character.appels.find((a) => a.chemin === `/internal/characters/${heros}`);
    expect(appel).toMatchObject({ methode: 'GET', secret: SECRET });

    const types = (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${id}`)
    ).map((e) => e.type);
    expect(types.filter((x) => x === 'room.character_added')).toHaveLength(4);
  });

  it('refus : spectateur, adversaire par un joueur, personnage d’un autre, autre système', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${bob.id}`, { role: 'spectateur' });

    expect((await engager(id, bob, { characterId: perso(bob) })).statusCode).toBe(403);
    expect(
      (await engager(id, alice, { characterId: perso(alice), camp: 'adversaires' })).statusCode,
    ).toBe(403);
    // Le personnage d'un autre (même le MJ) est introuvable : on ne l'engage jamais
    expect((await engager(id, mj, { characterId: perso(alice) })).statusCode).toBe(404);
    expect((await engager(id, alice, { characterId: crypto.randomUUID() })).statusCode).toBe(404);
    expect(
      (await engager(id, alice, { characterId: perso(alice, 'star-wars-eote') })).json(),
    ).toMatchObject({ status: 422, code: 'systeme_different' });
    expect((await engager(id, alice, { characterId: 'pas-un-uuid' })).statusCode).toBe(400);
    expect(
      (
        await o.requete(await t.utilisateur(), 'POST', `/v1/rooms/${id}/personnages`, {
          characterId: perso(alice),
        })
      ).statusCode,
    ).toBe(404);

    const heros = perso(alice);
    expect((await engager(id, alice, { characterId: heros })).statusCode).toBe(201);
    expect((await engager(id, alice, { characterId: heros })).json()).toMatchObject({
      status: 409,
      code: 'deja_engage',
    });
  });

  it('retrait : le propriétaire ou le MJ, jamais un autre joueur', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    const a1 = await o.engager(id, alice);
    const a2 = await o.engager(id, alice);
    const retirer = (u: Utilisateur, c: string) =>
      o.requete(u, 'DELETE', `/v1/rooms/${id}/personnages/${c}`);

    expect((await retirer(bob, a1)).statusCode).toBe(403);
    expect((await retirer(alice, a1)).statusCode).toBe(204);
    expect((await retirer(alice, a1)).statusCode).toBe(404);
    expect((await retirer(mj, a2)).statusCode).toBe(204);
    const s = await o.ok<Salle>(mj, 'GET', `/v1/rooms/${id}`);
    expect(s.personnages).toEqual([]);
  });

  it('droits : membre = lecture, MJ = écriture, rien hors de la salle ni après retrait', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    const heros = await o.engager(id, alice);
    const etranger = await t.utilisateur();

    expect(await droits(heros, mj)).toEqual({
      lecture: true,
      ecriture: true,
      salles: [{ roomId: id, role: 'mj' }],
    });
    expect(await droits(heros, bob)).toMatchObject({ lecture: true, ecriture: false });
    expect(await droits(heros, etranger)).toEqual({ lecture: false, ecriture: false, salles: [] });

    // Un spectateur lit, un joueur promu MJ écrit
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${bob.id}`, { role: 'spectateur' });
    expect(await droits(heros, bob)).toMatchObject({ lecture: true, ecriture: false });
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${bob.id}`, { role: 'mj' });
    expect(await droits(heros, bob)).toMatchObject({ lecture: true, ecriture: true });

    await o.ok(alice, 'DELETE', `/v1/rooms/${id}/personnages/${heros}`);
    expect(await droits(heros, mj)).toMatchObject({ lecture: false, ecriture: false });
  });

  it('retirer un personnage le sort du combat en cours', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const heros = await o.engager(id, alice);
    const pnj = await o.engager(id, mj);
    await o.ok(mj, 'POST', `/v1/rooms/${id}/combat`, { participants: [heros, pnj] });
    await o.ok(alice, 'DELETE', `/v1/rooms/${id}/personnages/${heros}`);
    const s = await o.ok<Salle>(mj, 'GET', `/v1/rooms/${id}`);
    expect(s.combat!.ordre.map((p) => p.characterId)).toEqual([pnj]);
  });

  it('character injoignable : 502, rien n’est engagé', async () => {
    const panne = await appDeTest({ CHARACTER_URL: 'http://127.0.0.1:9' });
    try {
      const po = outils(panne);
      const u = await panne.utilisateur();
      const id = await po.salle(u);
      const res = await po.requete(u, 'POST', `/v1/rooms/${id}/personnages`, {
        characterId: crypto.randomUUID(),
      });
      expect(res.json()).toMatchObject({ status: 502, code: 'character_indisponible' });
      expect((await po.ok<Salle>(u, 'GET', `/v1/rooms/${id}`)).personnages).toEqual([]);
    } finally {
      await panne.fermer();
    }
  });
});
