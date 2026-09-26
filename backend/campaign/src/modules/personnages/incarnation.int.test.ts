/**
 * Personnage incarné par un membre, liste des personnages engagés (résumés
 * de character) et règle `creationPersonnages`.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  appDeTest,
  outils,
  TEST_DATABASE_URL,
  type Contexte,
  type Utilisateur,
} from '../../test/app-de-test.js';

interface Personnage {
  characterId: string;
  nom: string | null;
  avatarUrl: string | null;
  type: string | null;
  camp: string;
  proprietaireId: string;
  incarnePar: string | null;
  creation: boolean;
}

describe.skipIf(!TEST_DATABASE_URL)('personnage incarné', () => {
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

  const incarner = (u: Utilisateur, roomId: string, characterId: string | null) =>
    o.requete(u, 'PUT', `/v1/rooms/${roomId}/moi/personnage`, { characterId });
  const liste = (u: Utilisateur, roomId: string) =>
    o.ok<Personnage[]>(u, 'GET', `/v1/rooms/${roomId}/personnages`);

  it('liste des personnages engagés, avec leur résumé dans character', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const heros = await o.engager(id, alice, { nom: 'Aria', avatarUrl: 'https://img/aria.png' });
    const pnj = await o.engager(id, mj, { nom: 'Gobelin', type: 'pnj' });
    expect(await liste(alice, id)).toEqual([
      {
        characterId: heros,
        nom: 'Aria',
        avatarUrl: 'https://img/aria.png',
        type: 'personnage',
        camp: 'joueurs',
        proprietaireId: alice.id,
        incarnePar: null,
        creation: false,
      },
      {
        characterId: pnj,
        nom: 'Gobelin',
        avatarUrl: null,
        type: 'pnj',
        camp: 'adversaires',
        proprietaireId: mj.id,
        incarnePar: null,
        creation: false,
      },
    ]);
    // Personnage disparu de character : l'engagement reste, sans résumé
    t.character.personnages.delete(pnj);
    expect((await liste(alice, id))[1]).toMatchObject({ characterId: pnj, nom: null, type: null });
    expect((await o.requete(bob, 'GET', `/v1/rooms/${id}/personnages`)).statusCode).toBe(404);
  });

  it('un joueur incarne le sien, le MJ un PNJ ; un seul personnage chacun', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const a1 = await o.engager(id, alice);
    const a2 = await o.engager(id, alice);
    const pnj = await o.engager(id, mj);

    const res = await incarner(alice, id, a1);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as Personnage[]).find((p) => p.characterId === a1)!.incarnePar).toBe(
      alice.id,
    );
    // Changer de personnage libère l'ancien
    const apres = (await incarner(alice, id, a2)).json() as Personnage[];
    expect(apres.map((p) => [p.characterId, p.incarnePar])).toEqual([
      [a1, null],
      [a2, alice.id],
      [pnj, null],
    ]);
    expect((await incarner(mj, id, pnj)).statusCode).toBe(200);
    expect(await o.ok(alice, 'GET', `/v1/rooms/${id}`)).toMatchObject({ personnageIncarne: a2 });
    expect(await o.ok(mj, 'GET', `/v1/rooms/${id}`)).toMatchObject({ personnageIncarne: pnj });

    // Le même choix ne produit pas d'événement ; null libère
    expect((await incarner(alice, id, a2)).statusCode).toBe(200);
    const libre = (await incarner(alice, id, null)).json() as Personnage[];
    expect(libre.filter((p) => p.incarnePar === alice.id)).toEqual([]);

    const payloads = (
      await t
        .db!.select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          sql`${outbox.envelope}->>'roomId' = ${id} and ${outbox.envelope}->>'type' = 'room.character_embodied'`,
        )
        .orderBy(outbox.id)
    ).map((e) => (e.envelope as { payload: object }).payload);
    expect(payloads).toEqual([
      { userId: alice.id, characterId: a1, ancien: null },
      { userId: alice.id, characterId: a2, ancien: a1 },
      { userId: mj.id, characterId: pnj, ancien: null },
      { userId: alice.id, characterId: null, ancien: a2 },
    ]);
  });

  it('refus : personnage pris, d’un autre joueur, non engagé, spectateur', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    const heros = await o.engager(id, alice);
    const deBob = await o.engager(id, bob);

    // Le MJ peut incarner un personnage de joueur… tant que personne ne le joue
    expect((await incarner(mj, id, heros)).statusCode).toBe(200);
    expect((await incarner(alice, id, heros)).json()).toMatchObject({
      status: 409,
      code: 'personnage_pris',
    });
    await incarner(mj, id, null);
    expect((await incarner(alice, id, heros)).statusCode).toBe(200);
    expect((await incarner(mj, id, heros)).json()).toMatchObject({ code: 'personnage_pris' });

    expect((await incarner(alice, id, deBob)).statusCode).toBe(403);
    expect((await incarner(alice, id, crypto.randomUUID())).json()).toMatchObject({
      status: 404,
      code: 'personnage_non_engage',
    });
    expect((await incarner(alice, id, 'pas-un-uuid')).statusCode).toBe(400);
    expect((await incarner(await t.utilisateur(), id, heros)).statusCode).toBe(404);

    // Passé spectateur, Bob n'incarne plus rien
    await incarner(bob, id, deBob);
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${bob.id}`, { role: 'spectateur' });
    expect((await liste(mj, id)).find((p) => p.characterId === deBob)!.incarnePar).toBeNull();
    expect((await incarner(bob, id, deBob)).statusCode).toBe(403);
  });

  it('le départ d’un membre libère le personnage qu’il incarnait', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const pnj = await o.engager(id, mj, { camp: 'allies' });
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${alice.id}`, { role: 'mj' });
    expect((await incarner(alice, id, pnj)).statusCode).toBe(200);
    await o.ok(alice, 'DELETE', `/v1/rooms/${id}/membres/${alice.id}`);
    expect((await liste(mj, id))[0]!.incarnePar).toBeNull();
  });

  it('creationPersonnages faux : un joueur n’engage pas un personnage en création', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}`, { creationPersonnages: false });
    const engager = (u: Utilisateur, characterId: string) =>
      o.requete(u, 'POST', `/v1/rooms/${id}/personnages`, { characterId });

    const nouveau = t.character.ajouter({
      ownerId: alice.id,
      systemeId: 'dnd-classic',
      creation: true,
    });
    expect((await engager(alice, nouveau)).json()).toMatchObject({
      status: 403,
      code: 'creation_interdite',
    });
    // Un personnage terminé passe ; le MJ n'est pas concerné
    const termine = t.character.ajouter({ ownerId: alice.id, systemeId: 'dnd-classic' });
    expect((await engager(alice, termine)).statusCode).toBe(201);
    const pnj = t.character.ajouter({ ownerId: mj.id, systemeId: 'dnd-classic', creation: true });
    expect((await engager(mj, pnj)).statusCode).toBe(201);
    expect((await liste(mj, id)).find((p) => p.characterId === pnj)!.creation).toBe(true);

    // Création permise : le nouveau personnage passe
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}`, { creationPersonnages: true });
    expect((await engager(alice, nouveau)).statusCode).toBe(201);
  });
});
