/**
 * Combat complet sur un vrai PostgreSQL, avec un faux character (serveur
 * HTTP local) : démarrage, initiative D&D en individuel et Star Wars en
 * créneaux, tours, fin de round avec décompte des durées, fin du combat.
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

interface Combat {
  id: string;
  round: number;
  mode: string;
  ordre: { characterId: string; camp: string; cles: number[]; aAgi: boolean }[];
  courant: number;
  creneaux?: { camp: string }[];
  initiative: boolean;
  version: number;
  decomptes?: { characterId: string; retirees: string[] }[];
  echecsDecompte?: string[];
}

describe.skipIf(!TEST_DATABASE_URL)('combat', () => {
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

  const url = (roomId: string, suite = '') => `/v1/rooms/${roomId}/combat${suite}`;
  const evenements = async (roomId: string) =>
    (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${roomId}`)
        .orderBy(outbox.id)
    )
      .map((e) => e.type)
      .filter((x) => x.startsWith('combat.'));
  const appelsDe = (chemin: string) => t.character.appels.filter((a) => a.chemin.endsWith(chemin));

  it('démarrage : MJ seulement, participants engagés, un seul combat par salle', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const heros = await o.engager(id, alice);
    const pnj = await o.engager(id, mj);

    expect((await o.requete(mj, 'GET', url(id))).statusCode).toBe(404);
    expect((await o.requete(alice, 'POST', url(id), { participants: [heros] })).statusCode).toBe(
      403,
    );
    expect(
      (await o.requete(mj, 'POST', url(id), { participants: [heros, heros] })).json(),
    ).toMatchObject({ status: 400, code: 'participant_double' });
    expect(
      (await o.requete(mj, 'POST', url(id), { participants: [heros, crypto.randomUUID()] })).json(),
    ).toMatchObject({ status: 422, code: 'personnage_non_engage' });
    expect((await o.requete(mj, 'POST', url(id), { participants: [] })).statusCode).toBe(400);

    const res = await o.requete(mj, 'POST', url(id), { participants: [heros, pnj] });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      round: 1,
      mode: 'individuel',
      courant: 0,
      initiative: false,
      ordre: [
        { characterId: heros, camp: 'joueurs', cles: [], aAgi: false },
        { characterId: pnj, camp: 'adversaires', cles: [], aAgi: false },
      ],
    });
    expect((res.json() as Combat).creneaux).toBeUndefined();
    // Tout membre lit le combat, aussi dans le détail de la salle
    expect(await o.ok<Combat>(alice, 'GET', url(id))).toMatchObject({ round: 1 });
    expect(await o.ok(alice, 'GET', `/v1/rooms/${id}`)).toMatchObject({ combat: { round: 1 } });

    expect((await o.requete(mj, 'POST', url(id), { participants: [pnj] })).json()).toMatchObject({
      status: 409,
      code: 'combat_en_cours',
    });
    expect(await evenements(id)).toEqual(['combat.started']);
  });

  it('D&D individuel : initiative par character, tri, joueurs d’abord à égalité', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    const gobelin = await o.engager(id, mj, { cles: [15] });
    const aria = await o.engager(id, alice, { cles: [15] });
    const dragon = await o.engager(id, mj, { cles: [21] });
    const brom = await o.engager(id, bob, { cles: [15] });
    const loup = await o.engager(id, mj, { cles: [8], camp: 'allies' });
    await o.ok(mj, 'POST', url(id), { participants: [gobelin, aria, dragon, brom, loup] });

    expect((await o.requete(alice, 'POST', url(id, '/initiative'), {})).statusCode).toBe(403);
    expect(
      (
        await o.requete(mj, 'POST', url(id, '/initiative'), {
          parametres: { [crypto.randomUUID()]: { bonus: 1 } },
        })
      ).json(),
    ).toMatchObject({ status: 400, code: 'participant_inconnu' });

    const c = await o.ok<Combat>(mj, 'POST', url(id, '/initiative'), {
      parametres: { [aria.toUpperCase()]: { avantage: true } },
    });
    expect(c.initiative).toBe(true);
    expect(c.ordre.map((p) => p.characterId)).toEqual([dragon, aria, brom, gobelin, loup]);
    expect(c.ordre.map((p) => p.cles)).toEqual([[21], [15], [15], [15], [8]]);

    // Action d'initiative du système, appliquée, avec l'origine (MJ, salle)
    const lances = appelsDe('/actions/initiative');
    expect(lances).toHaveLength(5);
    for (const a of lances) {
      expect(a).toMatchObject({
        methode: 'POST',
        secret: SECRET,
        corps: { appliquer: true, userId: mj.id, roomId: id },
      });
    }
    expect(lances.find((a) => a.chemin.includes(aria))!.corps.parametres).toEqual({
      avantage: true,
    });
    expect(lances.find((a) => a.chemin.includes(brom))!.corps.parametres).toBeUndefined();
  });

  it('initiative refusée par les règles : 422, l’ordre ne change pas', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const aria = await o.engager(id, alice, { refus: 'Paramètre manquant : competence' });
    const pnj = await o.engager(id, mj, { cles: [3] });
    const avant = await o.ok<Combat>(mj, 'POST', url(id), { participants: [aria, pnj] });
    const res = await o.requete(mj, 'POST', url(id, '/initiative'), {});
    expect(res.json()).toMatchObject({ status: 422, code: 'initiative_refusee' });
    expect(res.json().detail).toContain('competence');
    expect(await o.ok<Combat>(mj, 'GET', url(id))).toMatchObject({
      initiative: false,
      version: avant.version,
    });
  });

  it('tours : le joueur finit son tour, fin de round avec décompte des durées', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    const aria = await o.engager(id, alice, { cles: [18], durees: { beni: 1, rage: 2 } });
    const pnj = await o.engager(id, mj, { cles: [12], durees: { aveugle: 2 } });
    const brom = await o.engager(id, bob, { cles: [5] });
    await o.ok(mj, 'POST', url(id), { participants: [aria, pnj, brom] });
    await o.ok(mj, 'POST', url(id, '/initiative'), {});

    // Tour d'Aria : Bob ne peut pas finir le tour d'un autre, un spectateur non plus
    expect((await o.requete(bob, 'POST', url(id, '/suivant'), {})).statusCode).toBe(403);
    expect(
      (await o.requete(bob, 'POST', url(id, '/suivant'), { characterId: brom })).json(),
    ).toMatchObject({ status: 409, code: 'pas_son_tour' });
    let c = await o.ok<Combat>(alice, 'POST', url(id, '/suivant'), {});
    expect(c).toMatchObject({ round: 1, courant: 1 });
    expect(c.ordre[0]!.aAgi).toBe(true);
    expect(c.decomptes).toBeUndefined();
    // Tour du PNJ : le MJ le passe
    expect((await o.requete(alice, 'POST', url(id, '/suivant'), {})).statusCode).toBe(403);
    c = await o.ok<Combat>(mj, 'POST', url(id, '/suivant'), {});
    expect(c.courant).toBe(2);
    expect(appelsDe('/durees/decompter')).toHaveLength(0);

    // Dernier tour : nouveau round, chaque participant décompte ses durées une fois
    c = await o.ok<Combat>(bob, 'POST', url(id, '/suivant'), { characterId: brom });
    expect(c).toMatchObject({ round: 2, courant: 0 });
    expect(c.ordre.every((p) => !p.aAgi)).toBe(true);
    expect(c.decomptes).toEqual(
      expect.arrayContaining([
        { characterId: aria, retirees: ['beni'] },
        { characterId: pnj, retirees: [] },
        { characterId: brom, retirees: [] },
      ]),
    );
    expect(c.echecsDecompte).toBeUndefined();
    const decomptes = appelsDe('/durees/decompter');
    expect(decomptes).toHaveLength(3);
    for (const a of decomptes)
      expect(a).toMatchObject({ secret: SECRET, corps: { userId: bob.id, roomId: id } });

    // Round 2 complet par le MJ : les états suivants arrivent à 0
    await o.ok(mj, 'POST', url(id, '/suivant'), {});
    await o.ok(mj, 'POST', url(id, '/suivant'), {});
    c = await o.ok<Combat>(mj, 'POST', url(id, '/suivant'), {});
    expect(c.round).toBe(3);
    expect(c.decomptes).toEqual(
      expect.arrayContaining([
        { characterId: aria, retirees: ['rage'] },
        { characterId: pnj, retirees: ['aveugle'] },
      ]),
    );
    expect(appelsDe('/durees/decompter')).toHaveLength(6);

    const types = await evenements(id);
    expect(types.filter((x) => x === 'combat.turn_changed')).toHaveLength(7);
  });

  it('un décompte en échec est signalé sans bloquer le round', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const aria = await o.engager(id, alice, { cles: [10] });
    const pnj = await o.engager(id, mj, { cles: [5], durees: { lent: 1 } });
    await o.ok(mj, 'POST', url(id), { participants: [aria, pnj] });
    await o.ok(mj, 'POST', url(id, '/initiative'), {});
    // Le personnage disparaît de character : 404 au décompte
    t.character.personnages.delete(aria);
    await o.ok(mj, 'POST', url(id, '/suivant'), {});
    const c = await o.ok<Combat>(mj, 'POST', url(id, '/suivant'), {});
    expect(c.round).toBe(2);
    expect(c.decomptes).toEqual([{ characterId: pnj, retirees: ['lent'] }]);
    expect(c.echecsDecompte).toEqual([aria]);
  });

  it('Star Wars en créneaux : chaque créneau est ouvert à tout son camp', async () => {
    const id = await o.salle(mj, 'star-wars-eote', [alice, bob]);
    // Clés : succès nets puis avantages nets, selon la compétence choisie
    const cles = (base: number[]) => (parametres: Record<string, unknown>) =>
      parametres.competence === 'calme' ? [base[0]! + 1, base[1]!] : base;
    const kesh = await o.engager(id, alice, { systemeId: 'star-wars-eote', cles: cles([1, 1]) });
    const vara = await o.engager(id, bob, { systemeId: 'star-wars-eote', cles: cles([1, 0]) });
    const soldat = await o.engager(id, mj, { systemeId: 'star-wars-eote', cles: [3, 0] });
    const sonde = await o.engager(id, mj, { systemeId: 'star-wars-eote', cles: [2, 1] });

    await o.ok(mj, 'POST', url(id), {
      participants: [soldat, sonde, kesh, vara],
      mode: 'creneaux',
    });
    let c = await o.ok<Combat>(mj, 'POST', url(id, '/initiative'), {
      parametres: {
        [kesh]: { competence: 'calme' },
        [vara]: { competence: 'vigilance' },
      },
    });
    // Kesh (2,1) à égalité parfaite avec la sonde : le camp joueurs passe d'abord
    expect(c.ordre.map((p) => [p.characterId, p.cles])).toEqual([
      [soldat, [3, 0]],
      [kesh, [2, 1]],
      [sonde, [2, 1]],
      [vara, [1, 0]],
    ]);
    expect(c.creneaux).toEqual([
      { camp: 'adversaires' },
      { camp: 'joueurs' },
      { camp: 'adversaires' },
      { camp: 'joueurs' },
    ]);
    expect(
      appelsDe('/actions/initiative').find((a) => a.chemin.includes(vara))!.corps,
    ).toMatchObject({ parametres: { competence: 'vigilance' } });

    // Créneau adversaires : le MJ fait agir la sonde, pourtant classée après le soldat
    c = await o.ok<Combat>(mj, 'POST', url(id, '/suivant'), { characterId: sonde });
    expect(c.courant).toBe(1);
    // Créneau joueurs : Vara agit avant Kesh ; un joueur doit dire qui agit
    expect((await o.requete(bob, 'POST', url(id, '/suivant'), {})).json()).toMatchObject({
      status: 400,
      code: 'personnage_requis',
    });
    expect(
      (await o.requete(bob, 'POST', url(id, '/suivant'), { characterId: kesh })).statusCode,
    ).toBe(403);
    c = await o.ok<Combat>(bob, 'POST', url(id, '/suivant'), { characterId: vara });
    expect(c.courant).toBe(2);
    // Créneau adversaires : Kesh n'y joue pas, la sonde a déjà agi
    expect(
      (await o.requete(alice, 'POST', url(id, '/suivant'), { characterId: kesh })).json(),
    ).toMatchObject({ status: 409, code: 'pas_son_tour' });
    expect(
      (await o.requete(mj, 'POST', url(id, '/suivant'), { characterId: sonde })).json(),
    ).toMatchObject({ status: 409, code: 'pas_son_tour' });
    await o.ok(mj, 'POST', url(id, '/suivant'), { characterId: soldat });
    // Dernier créneau (joueurs) : Kesh, puis nouveau round et décompte
    c = await o.ok<Combat>(alice, 'POST', url(id, '/suivant'), { characterId: kesh });
    expect(c).toMatchObject({ round: 2, courant: 0 });
    expect(c.ordre.every((p) => !p.aAgi)).toBe(true);
    expect(c.decomptes).toHaveLength(4);
  });

  it('fin : MJ seulement, le combat disparaît et peut reprendre', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const aria = await o.engager(id, alice);
    await o.ok(mj, 'POST', url(id), { participants: [aria] });
    expect((await o.requete(alice, 'POST', url(id, '/fin'))).statusCode).toBe(403);
    expect((await o.requete(mj, 'POST', url(id, '/fin'))).statusCode).toBe(204);
    expect((await o.requete(mj, 'POST', url(id, '/fin'))).statusCode).toBe(404);
    expect((await o.requete(alice, 'GET', url(id))).statusCode).toBe(404);
    expect((await o.requete(mj, 'POST', url(id, '/suivant'), {})).statusCode).toBe(404);
    expect(await o.ok(mj, 'GET', `/v1/rooms/${id}`)).not.toHaveProperty('combat');
    expect((await o.requete(mj, 'POST', url(id), { participants: [aria] })).statusCode).toBe(201);
    expect(await evenements(id)).toEqual(['combat.started', 'combat.ended', 'combat.started']);
  });
});
