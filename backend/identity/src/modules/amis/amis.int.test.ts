/**
 * Routes des amis sur un vrai PostgreSQL (rôle identity_svc).
 * Chaque test crée ses propres comptes, supprimés à la fin.
 */
import { and, eq, or, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { friendRequests, friendships, outbox, users } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { importerAmis } from './import.js';
import { paire } from './service.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Joueur = Awaited<ReturnType<Contexte['inscrire']>>;

describe.skipIf(!TEST_DATABASE_URL)('amis par HTTP', () => {
  let t: Contexte;

  // Une instance par test : l'inscription est limitée à 10 par minute et par instance
  beforeEach(async () => {
    t = await appDeTest();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const demander = (de: Joueur, vers: string) =>
    t.app.inject({
      method: 'POST',
      url: '/v1/friends/requests',
      headers: de.auth,
      payload: { userId: vers },
    });
  const amis = async (j: Joueur) =>
    (await t.app.inject({ method: 'GET', url: '/v1/friends', headers: j.auth })).json() as {
      id: string;
      name: string;
      title: string | null;
      since: string;
    }[];
  const demandes = async (j: Joueur) =>
    (
      await t.app.inject({ method: 'GET', url: '/v1/friends/requests', headers: j.auth })
    ).json() as {
      received: { id: string; name: string; createdAt: string }[];
      sent: { id: string; name: string; createdAt: string }[];
    };
  const types = async (userId: string) =>
    (
      await t.db
        .select({ type: sql<string>`${outbox.envelope}->>'type'` })
        .from(outbox)
        .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`)
    ).map((e) => e.type);
  const nbAmities = async (x: string, y: string) => {
    const p = paire(x, y);
    return (
      await t.db
        .select()
        .from(friendships)
        .where(and(eq(friendships.userA, p.userA), eq(friendships.userB, p.userB)))
    ).length;
  };
  const nbDemandes = async (x: string, y: string) =>
    (
      await t.db
        .select()
        .from(friendRequests)
        .where(
          or(
            and(eq(friendRequests.fromUser, x), eq(friendRequests.toUser, y)),
            and(eq(friendRequests.fromUser, y), eq(friendRequests.toUser, x)),
          ),
        )
    ).length;

  it('demande puis acceptation', async () => {
    const a = await t.inscrire('Alice');
    const b = await t.inscrire('Bob');

    const envoi = await demander(a, b.id);
    expect(envoi.statusCode).toBe(201);
    expect(envoi.json()).toEqual({ status: 'pending' });

    expect((await demandes(a)).sent).toEqual([
      { id: b.id, name: 'Bob', avatarUrl: null, createdAt: expect.any(String) },
    ]);
    expect((await demandes(b)).received.map((d) => d.id)).toEqual([a.id]);

    // Seul le destinataire peut accepter
    const mauvaisSens = await t.app.inject({
      method: 'POST',
      url: `/v1/friends/requests/${b.id}/accept`,
      headers: a.auth,
    });
    expect(mauvaisSens.statusCode).toBe(404);

    const accepte = await t.app.inject({
      method: 'POST',
      url: `/v1/friends/requests/${a.id}/accept`,
      headers: b.auth,
    });
    expect(accepte.statusCode).toBe(204);

    expect(await amis(a)).toEqual([
      { id: b.id, name: 'Bob', avatarUrl: null, title: null, since: expect.any(String) },
    ]);
    expect((await amis(b)).map((x) => x.id)).toEqual([a.id]);
    expect(await demandes(a)).toEqual({ received: [], sent: [] });
    expect(await types(a.id)).toContain('identity.friend_request_sent');
    expect(await types(b.id)).toContain('identity.friend_request_accepted');
  });

  it('une demande en retour vaut acceptation', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    expect((await demander(a, b.id)).json()).toEqual({ status: 'pending' });
    const retour = await demander(b, a.id);
    expect(retour.statusCode).toBe(201);
    expect(retour.json()).toEqual({ status: 'accepted' });
    expect(await nbAmities(a.id, b.id)).toBe(1);
    expect(await nbDemandes(a.id, b.id)).toBe(0);
  });

  it('deux demandes croisées simultanées donnent une seule amitié', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    const [r1, r2] = await Promise.all([demander(a, b.id), demander(b, a.id)]);
    expect([r1.statusCode, r2.statusCode]).toEqual([201, 201]);
    const statuts = [r1.json().status, r2.json().status].sort();
    expect(statuts).toEqual(['accepted', 'pending']);
    expect(await nbAmities(a.id, b.id)).toBe(1);
    expect(await nbDemandes(a.id, b.id)).toBe(0);
  });

  it('refuse les doublons, soi-même et les comptes inconnus ou désactivés', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    expect((await demander(a, b.id)).statusCode).toBe(201);

    const doublon = await demander(a, b.id);
    expect(doublon.statusCode).toBe(409);
    expect(doublon.json()).toMatchObject({ code: 'request_already_sent' });

    expect((await demander(b, a.id)).json()).toEqual({ status: 'accepted' });
    const dejaAmis = await demander(a, b.id);
    expect(dejaAmis.statusCode).toBe(409);
    expect(dejaAmis.json()).toMatchObject({ code: 'already_friends' });

    expect((await demander(a, a.id)).statusCode).toBe(400);
    expect((await demander(a, crypto.randomUUID())).statusCode).toBe(404);
    expect((await demander(a, 'pas-un-uuid')).statusCode).toBe(400);

    const c = await t.inscrire();
    await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, c.id));
    expect((await demander(a, c.id)).statusCode).toBe(404);

    const sansJeton = await t.app.inject({
      method: 'POST',
      url: '/v1/friends/requests',
      payload: { userId: b.id },
    });
    expect(sansJeton.statusCode).toBe(401);
  });

  it('refus d’une demande reçue et annulation d’une demande envoyée', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    const c = await t.inscrire();

    await demander(a, b.id);
    const refus = await t.app.inject({
      method: 'DELETE',
      url: `/v1/friends/requests/${a.id}`,
      headers: b.auth,
    });
    expect(refus.statusCode).toBe(204);
    expect(await nbDemandes(a.id, b.id)).toBe(0);
    expect(await types(b.id)).toContain('identity.friend_request_declined');

    await demander(a, c.id);
    const annulation = await t.app.inject({
      method: 'DELETE',
      url: `/v1/friends/requests/${c.id}`,
      headers: a.auth,
    });
    expect(annulation.statusCode).toBe(204);
    expect((await demandes(c)).received).toEqual([]);
    expect(await types(a.id)).toContain('identity.friend_request_cancelled');

    const rien = await t.app.inject({
      method: 'DELETE',
      url: `/v1/friends/requests/${c.id}`,
      headers: a.auth,
    });
    expect(rien.statusCode).toBe(404);
  });

  it('retrait d’un ami', async () => {
    const a = await t.inscrire();
    const b = await t.inscrire();
    await demander(a, b.id);
    await demander(b, a.id);
    expect(await nbAmities(a.id, b.id)).toBe(1);

    const retrait = await t.app.inject({
      method: 'DELETE',
      url: `/v1/friends/${a.id}`,
      headers: b.auth,
    });
    expect(retrait.statusCode).toBe(204);
    expect(await amis(a)).toEqual([]);
    expect(await types(b.id)).toContain('identity.friend_removed');

    const encore = await t.app.inject({
      method: 'DELETE',
      url: `/v1/friends/${a.id}`,
      headers: b.auth,
    });
    expect(encore.statusCode).toBe(404);
  });

  it('importe les amitiés et demandes Firebase, de façon rejouable', async () => {
    const a = await t.inscrire('A');
    const b = await t.inscrire('B');
    const c = await t.inscrire('C');
    const d = await t.inscrire('D');
    const doc = (path: string, data: Record<string, unknown> = {}) => ({
      path,
      id: path.split('/').pop()!,
      data: { name: 'copie', titre: 'x', pp: '', ...data },
    });
    const entrees = {
      amities: [
        doc('friendships/ua/friends/ub', {
          createdAt: { $timestamp: '2024-05-01T10:00:00.000000000Z' },
        }),
        doc('friendships/ub/friends/ua'),
        doc('friendships/ua/friends/uinconnu'),
        doc('friendships/ua/friends'),
      ],
      demandes: [
        doc('requests/uc/received/ua'),
        doc('requests/ua/sent/uc'),
        doc('requests/ud/sent/ub'),
        // Reste d'une demande déjà acceptée
        doc('requests/ub/received/ua'),
      ],
      uuidParUid: new Map([
        ['ua', a.id],
        ['ub', b.id],
        ['uc', c.id],
        ['ud', d.id],
      ]),
    };

    const rapport = await importerAmis(t.db, { correlationId: 'test-import-amis' }, entrees);
    expect(rapport).toEqual({
      amities: 1,
      amitiesDejaPresentes: 0,
      demandes: 2,
      demandesDejaPresentes: 0,
      demandesEntreAmis: 1,
      comptesAbsents: 1,
      cheminsInvalides: 1,
      erreurs: 0,
    });
    const listeA = await amis(a);
    expect(listeA.map((x) => x.id)).toEqual([b.id]);
    expect(listeA[0]!.since).toBe('2024-05-01T10:00:00.000Z');
    expect((await demandes(c)).received.map((x) => x.id)).toEqual([a.id]);
    expect((await demandes(b)).received.map((x) => x.id)).toEqual([d.id]);

    const rejeu = await importerAmis(t.db, { correlationId: 'test-import-amis' }, entrees);
    expect(rejeu).toMatchObject({
      amities: 0,
      amitiesDejaPresentes: 1,
      demandes: 0,
      demandesDejaPresentes: 2,
    });
  });
});
