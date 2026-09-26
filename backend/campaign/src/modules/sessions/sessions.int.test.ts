/**
 * Sessions prévues : le MJ les planifie et les annule, les membres les lisent,
 * les sessions passées disparaissent de la liste.
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

interface Session {
  id: string;
  date: string;
  titre: string | null;
}

const JOUR = 24 * 3600 * 1000;
const dans = (ms: number) => new Date(Date.now() + ms).toISOString();

describe.skipIf(!TEST_DATABASE_URL)('sessions prévues', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let mj: Utilisateur;
  let joueur: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    mj = await t.utilisateur();
    joueur = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  it('le MJ planifie, les membres lisent dans l’ordre, le MJ annule', async () => {
    const id = await o.salle(mj, 'dnd-classic', [joueur]);
    const deux = await o.requete(mj, 'POST', `/v1/rooms/${id}/sessions`, {
      date: dans(2 * JOUR),
      titre: '  Le donjon  ',
    });
    expect(deux.statusCode, deux.body).toBe(201);
    expect(deux.json()).toMatchObject({ titre: 'Le donjon' });
    const une = await o.ok<Session>(mj, 'POST', `/v1/rooms/${id}/sessions`, {
      date: dans(JOUR),
      titre: '',
    });
    expect(une.titre).toBeNull();

    const liste = await o.ok<Session[]>(joueur, 'GET', `/v1/rooms/${id}/sessions`);
    expect(liste.map((s) => s.id)).toEqual([une.id, (deux.json() as Session).id]);

    expect(
      (await o.requete(joueur, 'DELETE', `/v1/rooms/${id}/sessions/${une.id}`)).statusCode,
    ).toBe(403);
    expect((await o.requete(mj, 'DELETE', `/v1/rooms/${id}/sessions/${une.id}`)).statusCode).toBe(
      204,
    );
    expect((await o.requete(mj, 'DELETE', `/v1/rooms/${id}/sessions/${une.id}`)).statusCode).toBe(
      404,
    );
    expect(await o.ok<Session[]>(joueur, 'GET', `/v1/rooms/${id}/sessions`)).toHaveLength(1);

    const types = (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${id}`)
    ).map((e) => e.type);
    expect(types.filter((x) => x.startsWith('room.session_')).sort()).toEqual([
      'room.session_cancelled',
      'room.session_scheduled',
      'room.session_scheduled',
    ]);
  });

  it('refus : joueur, non-membre, date passée ou invalide, titre trop long', async () => {
    const id = await o.salle(mj, 'dnd-classic', [joueur]);
    const url = `/v1/rooms/${id}/sessions`;
    expect((await o.requete(joueur, 'POST', url, { date: dans(JOUR) })).statusCode).toBe(403);
    const etranger = await t.utilisateur();
    expect((await o.requete(etranger, 'GET', url)).statusCode).toBe(404);
    expect((await o.requete(mj, 'POST', url, { date: dans(-60_000) })).json()).toMatchObject({
      status: 400,
      code: 'date_passee',
    });
    for (const corps of [{ date: 'demain' }, { date: dans(JOUR), titre: 'x'.repeat(101) }, {}]) {
      expect((await o.requete(mj, 'POST', url, corps)).statusCode).toBe(400);
    }
    expect((await o.requete(mj, 'DELETE', `/v1/rooms/${id}/sessions/pas-un-uuid`)).statusCode).toBe(
      400,
    );
  });

  it('une session passée n’est plus listée', async () => {
    const id = await o.salle(mj);
    await o.ok(mj, 'POST', `/v1/rooms/${id}/sessions`, { date: dans(3600_000) });
    await o.ok(mj, 'POST', `/v1/rooms/${id}/sessions`, { date: dans(3 * 3600_000) });
    t.avancer(2 * 3600_000);
    expect(await o.ok<Session[]>(mj, 'GET', `/v1/rooms/${id}/sessions`)).toHaveLength(1);
  });
});
