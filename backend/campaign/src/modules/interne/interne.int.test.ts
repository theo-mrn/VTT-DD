/**
 * Routes internes (appelées par character) : secret exigé, droits d'un
 * utilisateur dans une salle et sur un personnage engagé.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appDeTest,
  outils,
  SECRET,
  TEST_DATABASE_URL,
  type Contexte,
  type Utilisateur,
} from '../../test/app-de-test.js';

const interne = { 'x-internal-secret': SECRET };

describe.skipIf(!TEST_DATABASE_URL)('routes internes', () => {
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

  const get = (url: string, headers: Record<string, string> = interne) =>
    t.app.inject({ method: 'GET', url, headers });

  it('exigent le secret interne (401), ignorent un jeton utilisateur', async () => {
    const id = await o.salle(mj);
    const heros = await o.engager(id, mj);
    const urls = [
      `/internal/rooms/${id}/droits?userId=${mj.id}&characterId=${heros}`,
      `/internal/characters/${heros}/salles-de?userId=${mj.id}`,
    ];
    for (const headers of <Record<string, string>[]>[
      {},
      { 'x-internal-secret': 'mauvais-secret-mauvais-secret-mauvais' },
      { 'x-internal-secret': SECRET.slice(0, -1) },
      mj.auth,
    ]) {
      for (const url of urls) expect((await get(url, headers)).statusCode, url).toBe(401);
    }
    for (const url of urls) expect((await get(url)).statusCode, url).toBe(200);
    // Le secret est vérifié avant la validation : un paramètre invalide sans secret reste 401
    expect((await get(`/internal/rooms/pas-un-uuid/droits`, {})).statusCode).toBe(401);
    expect((await get(`/internal/rooms/pas-un-uuid/droits?userId=x`)).statusCode).toBe(400);
  });

  it('sans INTERNAL_API_SECRET configuré, les routes n’existent pas (404)', async () => {
    const sans = await appDeTest({ INTERNAL_API_SECRET: '' });
    try {
      const u = await sans.utilisateur();
      for (const url of [
        `/internal/rooms/${crypto.randomUUID()}/droits?userId=${u.id}`,
        `/internal/characters/${crypto.randomUUID()}/salles-de?userId=${u.id}`,
      ]) {
        for (const headers of [interne, {}]) {
          const res = await sans.app.inject({ method: 'GET', url, headers });
          expect(res.statusCode, url).toBe(404);
        }
      }
    } finally {
      await sans.fermer();
    }
  });

  it('droits dans une salle : rôle, et lecture/écriture sur un personnage engagé', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${bob.id}`, { role: 'spectateur' });
    const heros = await o.engager(id, alice);
    const libre = t.character.ajouter({ ownerId: alice.id, systemeId: 'dnd-classic' });
    const etranger = await t.utilisateur();
    const droits = async (u: Utilisateur, characterId?: string) => {
      const res = await get(
        `/internal/rooms/${id}/droits?userId=${u.id.toUpperCase()}` +
          (characterId ? `&characterId=${characterId}` : ''),
      );
      expect(res.statusCode, res.body).toBe(200);
      return res.json() as unknown;
    };

    expect(await droits(mj)).toEqual({ membre: true, role: 'mj' });
    expect(await droits(etranger)).toEqual({ membre: false, role: null });
    expect(await droits(mj, heros)).toEqual({
      membre: true,
      role: 'mj',
      personnage: { engage: true, camp: 'joueurs', lecture: true, ecriture: true },
    });
    expect(await droits(alice, heros)).toMatchObject({
      role: 'joueur',
      personnage: { lecture: true, ecriture: true },
    });
    expect(await droits(bob, heros)).toMatchObject({
      role: 'spectateur',
      personnage: { lecture: true, ecriture: false },
    });
    expect(await droits(etranger, heros)).toEqual({
      membre: false,
      role: null,
      personnage: { engage: true, camp: 'joueurs', lecture: false, ecriture: false },
    });
    // Personnage non engagé : aucun droit, même pour le MJ
    expect(await droits(mj, libre)).toMatchObject({
      personnage: { engage: false, camp: null, lecture: false, ecriture: false },
    });
    // Salle inconnue : personne n'y est membre
    const inconnue = await get(
      `/internal/rooms/${crypto.randomUUID()}/droits?userId=${mj.id}&characterId=${heros}`,
    );
    expect(inconnue.json()).toMatchObject({ membre: false, personnage: { engage: false } });
  });

  it('salles-de : réponse attendue par character, toutes salles confondues', async () => {
    const s1 = await o.salle(mj, 'dnd-classic', [alice, bob]);
    const s2 = await o.salle(bob, 'dnd-classic', [alice]);
    const heros = await o.engager(s1, alice);
    await o.ok(alice, 'POST', `/v1/rooms/${s2}/personnages`, { characterId: heros });
    const salles = async (u: Utilisateur) =>
      (await get(`/internal/characters/${heros}/salles-de?userId=${u.id}`)).json() as {
        lecture: boolean;
        ecriture: boolean;
        salles: { roomId: string; role: string }[];
      };

    // Bob est joueur dans s1 et MJ de s2 : il écrit grâce à s2
    const b = await salles(bob);
    expect(b).toMatchObject({ lecture: true, ecriture: true });
    expect(b.salles).toEqual(
      expect.arrayContaining([
        { roomId: s1, role: 'joueur' },
        { roomId: s2, role: 'mj' },
      ]),
    );
    expect(await salles(mj)).toEqual({
      lecture: true,
      ecriture: true,
      salles: [{ roomId: s1, role: 'mj' }],
    });
    await o.ok(bob, 'DELETE', `/v1/rooms/${s2}/personnages/${heros}`);
    expect(await salles(bob)).toEqual({
      lecture: true,
      ecriture: false,
      salles: [{ roomId: s1, role: 'joueur' }],
    });
  });
});
