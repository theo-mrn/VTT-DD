/**
 * Salles, membres et rôles sur un vrai PostgreSQL (rôle campaign_svc).
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

interface Salle {
  id: string;
  nom: string;
  description: string;
  systeme: { id: string; version: string };
  proprietaireId: string;
  role: string;
  membres: { userId: string; nom: string | null; role: string }[];
  personnages: { characterId: string; camp: string }[];
  version: number;
}

describe.skipIf(!TEST_DATABASE_URL)('salles et membres', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let mj: Utilisateur;
  let joueur: Utilisateur;
  let etranger: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    mj = await t.utilisateur('Maître');
    joueur = await t.utilisateur('Aria');
    etranger = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const evenements = async (roomId: string) =>
    (
      await t
        .db!.select({ type: sql<string>`${outbox.envelope}->>'type'`, subject: outbox.subject })
        .from(outbox)
        .where(sql`${outbox.envelope}->>'roomId' = ${roomId}`)
        .orderBy(outbox.id)
    ).map((e) => e.type);

  it('crée une salle : le créateur est MJ propriétaire, événement room.created', async () => {
    const res = await o.requete(mj, 'POST', '/v1/rooms', {
      nom: '  La Table  ',
      systemeId: 'star-wars-eote',
      description: 'Campagne du jeudi',
    });
    expect(res.statusCode).toBe(201);
    const s = res.json() as Salle;
    expect(s).toMatchObject({
      nom: 'La Table',
      description: 'Campagne du jeudi',
      systeme: { id: 'star-wars-eote', version: '1.0.0' },
      proprietaireId: mj.id,
      role: 'mj',
      membres: [{ userId: mj.id, nom: 'Maître', role: 'mj' }],
      personnages: [],
      version: 1,
    });
    expect(await evenements(s.id)).toEqual(['room.created']);
    const [sujet] = await t
      .db!.select({ subject: outbox.subject })
      .from(outbox)
      .where(sql`${outbox.envelope}->>'roomId' = ${s.id}`);
    expect(sujet!.subject).toBe(`vtt.${s.id}.room.created`);

    const liste = await o.ok<unknown[]>(mj, 'GET', '/v1/rooms');
    expect(liste).toEqual([
      {
        id: s.id,
        nom: 'La Table',
        role: 'mj',
        description: 'Campagne du jeudi',
        systeme: { id: 'star-wars-eote', version: '1.0.0' },
        membres: 1,
        joueurs: 0,
        code: expect.stringMatching(/^[2-9A-HJ-NP-Z]{6}$/),
        imageUrl: null,
        maxJoueurs: 4,
        publique: false,
        creationPersonnages: true,
        complete: false,
        proprietaire: { id: mj.id, nom: 'Maître', avatarUrl: null },
        updatedAt: expect.any(String),
      },
    ]);
    expect(await o.ok(etranger, 'GET', '/v1/rooms')).toEqual([]);
  });

  it('refuse un système inconnu, un nom vide, un anonyme', async () => {
    expect(
      (await o.requete(mj, 'POST', '/v1/rooms', { nom: 'X', systemeId: 'inconnu' })).json(),
    ).toMatchObject({ status: 400, code: 'systeme_inconnu' });
    expect(
      (await o.requete(mj, 'POST', '/v1/rooms', { nom: ' ', systemeId: 'dnd-classic' })).statusCode,
    ).toBe(400);
    const anonyme = await t.app.inject({ method: 'GET', url: '/v1/rooms' });
    expect(anonyme.statusCode).toBe(401);
  });

  it('404 pour un non-membre, 403 pour un joueur sur les routes du MJ', async () => {
    const id = await o.salle(mj, 'dnd-classic', [joueur]);
    for (const [method, url, payload] of [
      ['GET', `/v1/rooms/${id}`, undefined],
      ['PATCH', `/v1/rooms/${id}`, { nom: 'Volée' }],
      ['DELETE', `/v1/rooms/${id}`, undefined],
      ['POST', `/v1/rooms/${id}/invitations`, {}],
      ['PATCH', `/v1/rooms/${id}/membres/${joueur.id}`, { role: 'mj' }],
    ] as const) {
      expect((await o.requete(etranger, method, url, payload)).statusCode, url).toBe(404);
    }
    for (const [method, url, payload] of [
      ['PATCH', `/v1/rooms/${id}`, { nom: 'Volée' }],
      ['DELETE', `/v1/rooms/${id}`, undefined],
      ['POST', `/v1/rooms/${id}/invitations`, {}],
      ['PATCH', `/v1/rooms/${id}/membres/${joueur.id}`, { role: 'mj' }],
      ['POST', `/v1/rooms/${id}/combat`, { participants: [crypto.randomUUID()] }],
    ] as const) {
      expect((await o.requete(joueur, method, url, payload)).statusCode, url).toBe(403);
    }
    const vue = await o.ok<Salle>(joueur, 'GET', `/v1/rooms/${id}`);
    expect(vue.role).toBe('joueur');
    expect(vue.membres.map((m) => [m.nom, m.role])).toEqual([
      ['Maître', 'mj'],
      ['Aria', 'joueur'],
    ]);
  });

  it('le MJ modifie la salle ; le système ne change plus une fois des personnages engagés', async () => {
    const id = await o.salle(mj);
    const s = await o.ok<Salle>(mj, 'PATCH', `/v1/rooms/${id}`, {
      nom: 'Nouvelle table',
      systemeId: 'nooblies',
    });
    expect(s).toMatchObject({ nom: 'Nouvelle table', systeme: { id: 'nooblies' }, version: 2 });
    await o.engager(id, mj, { systemeId: 'nooblies' });
    const refus = await o.requete(mj, 'PATCH', `/v1/rooms/${id}`, { systemeId: 'dnd-classic' });
    expect(refus.json()).toMatchObject({ status: 409, code: 'personnages_engages' });
  });

  it('rôles : le MJ promeut et rétrograde ; le propriétaire reste MJ', async () => {
    const id = await o.salle(mj, 'dnd-classic', [joueur]);
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${joueur.id}`, { role: 'spectateur' });
    expect(
      (
        await o.requete(joueur, 'POST', `/v1/rooms/${id}/personnages`, {
          characterId: crypto.randomUUID(),
        })
      ).statusCode,
    ).toBe(403);
    await o.ok(mj, 'PATCH', `/v1/rooms/${id}/membres/${joueur.id}`, { role: 'mj' });
    // Co-MJ : il peut inviter, mais pas rétrograder le propriétaire ni supprimer la salle
    expect((await o.requete(joueur, 'POST', `/v1/rooms/${id}/invitations`, {})).statusCode).toBe(
      201,
    );
    const proprio = await o.requete(joueur, 'PATCH', `/v1/rooms/${id}/membres/${mj.id}`, {
      role: 'joueur',
    });
    expect(proprio.json()).toMatchObject({ status: 409, code: 'proprietaire' });
    expect((await o.requete(joueur, 'DELETE', `/v1/rooms/${id}`)).statusCode).toBe(403);
    const inconnu = await o.requete(mj, 'PATCH', `/v1/rooms/${id}/membres/${etranger.id}`, {
      role: 'joueur',
    });
    expect(inconnu.statusCode).toBe(404);
    expect(await evenements(id)).toEqual([
      'room.created',
      'room.member_joined',
      'room.member_role_changed',
      'room.member_role_changed',
    ]);
  });

  it('quitter, exclure : ses personnages quittent la salle ; le propriétaire ne part pas', async () => {
    const autre = await t.utilisateur();
    const id = await o.salle(mj, 'dnd-classic', [joueur, autre]);
    await o.engager(id, joueur);
    expect(
      (await o.requete(autre, 'DELETE', `/v1/rooms/${id}/membres/${joueur.id}`)).statusCode,
    ).toBe(403);
    expect(
      (await o.requete(joueur, 'DELETE', `/v1/rooms/${id}/membres/${joueur.id}`)).statusCode,
    ).toBe(204);
    const s = await o.ok<Salle>(mj, 'GET', `/v1/rooms/${id}`);
    expect(s.membres.map((m) => m.userId)).toEqual([mj.id, autre.id]);
    expect(s.personnages).toEqual([]);
    expect((await o.requete(joueur, 'GET', `/v1/rooms/${id}`)).statusCode).toBe(404);

    expect((await o.requete(mj, 'DELETE', `/v1/rooms/${id}/membres/${autre.id}`)).statusCode).toBe(
      204,
    );
    const proprio = await o.requete(mj, 'DELETE', `/v1/rooms/${id}/membres/${mj.id}`);
    expect(proprio.json()).toMatchObject({ status: 409, code: 'proprietaire' });
  });

  it('le propriétaire supprime la salle et tout ce qu’elle contient', async () => {
    const id = await o.salle(mj, 'dnd-classic', [joueur]);
    const perso = await o.engager(id, joueur);
    await o.ok(mj, 'POST', `/v1/rooms/${id}/combat`, { participants: [perso] });
    expect((await o.requete(mj, 'DELETE', `/v1/rooms/${id}`)).statusCode).toBe(204);
    expect((await o.requete(mj, 'GET', `/v1/rooms/${id}`)).statusCode).toBe(404);
    expect(await o.ok(joueur, 'GET', '/v1/rooms')).toEqual([]);
    expect((await evenements(id)).at(-1)).toBe('room.deleted');
  });
});
