/**
 * Clés d'API par HTTP, sur un vrai PostgreSQL (rôle identity_svc).
 * Ignorés si TEST_DATABASE_URL est absent.
 */
import { eq, sql } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiKeys, outbox, users } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { empreinteCle } from './cles.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';

describe.skipIf(!TEST_DATABASE_URL)("clés d'API", () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;

  beforeAll(async () => {
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET });
  });
  afterAll(async () => {
    await t?.fermer();
  });

  const creer = (auth: Record<string, string>, name = 'Mon bot') =>
    t.app.inject({ method: 'POST', url: '/v1/api-keys', headers: auth, payload: { name } });

  const echanger = (key: string, secret: string | null = SECRET) =>
    t.app.inject({
      method: 'POST',
      url: '/internal/api-keys/exchange',
      headers: secret === null ? {} : { 'x-internal-secret': secret },
      payload: { key },
    });

  it('crée une clé affichée une seule fois, stockée sous forme de SHA-256', async () => {
    const u = await t.inscrire();
    const res = await creer(u.auth, '  CLI perso  ');
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const corps = res.json() as { id: string; name: string; prefix: string; key: string };
    expect(corps.name).toBe('CLI perso');
    expect(corps.key).toMatch(/^vtt_[A-Za-z0-9_-]{43}$/);
    expect(corps.prefix).toBe(corps.key.slice(0, 12));

    const [ligne] = await t.db.select().from(apiKeys).where(eq(apiKeys.id, corps.id));
    expect(ligne!.keyHash.equals(empreinteCle(corps.key))).toBe(true);
    expect(JSON.stringify(ligne)).not.toContain(corps.key);

    // La liste ne redonne ni la clé ni son empreinte
    const liste = await t.app.inject({ url: '/v1/api-keys', headers: u.auth });
    expect(liste.statusCode).toBe(200);
    expect(liste.json()).toEqual([
      {
        id: corps.id,
        name: 'CLI perso',
        prefix: corps.prefix,
        createdAt: expect.any(String),
        lastUsedAt: null,
      },
    ]);
    expect(liste.body).not.toContain(corps.key);
    expect(liste.body).not.toContain(ligne!.keyHash.toString('hex'));

    // L'événement ne contient pas la clé
    const evenements = await t.db
      .select({ envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${u.id}`);
    const cree = evenements.find(
      (e) => (e.envelope as { type: string }).type === 'identity.api_key_created',
    );
    expect(cree).toBeDefined();
    expect(JSON.stringify(cree)).not.toContain(corps.key);
    expect((cree!.envelope as { visibility: string }).visibility).toBe('owner');
  });

  it('refuse un nom vide ou trop long, et exige une session', async () => {
    const u = await t.inscrire();
    expect((await creer(u.auth, '   ')).statusCode).toBe(400);
    expect((await creer(u.auth, 'x'.repeat(65))).statusCode).toBe(400);
    expect((await creer({}, 'sans jeton')).statusCode).toBe(401);
    expect((await t.app.inject({ url: '/v1/api-keys' })).statusCode).toBe(401);
  });

  it('liste les clés les plus récentes d’abord, sans celles des autres', async () => {
    const u = await t.inscrire();
    const autre = await t.inscrire();
    await creer(autre.auth, 'autre');
    const a = (await creer(u.auth, 'première')).json() as { id: string };
    const b = (await creer(u.auth, 'seconde')).json() as { id: string };
    const liste = (await t.app.inject({ url: '/v1/api-keys', headers: u.auth })).json() as {
      id: string;
    }[];
    expect(liste.map((c) => c.id)).toEqual([b.id, a.id]);
  });

  it('limite à 10 clés actives', async () => {
    const u = await t.inscrire();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await creer(u.auth, `clé ${i}`);
      expect(res.statusCode).toBe(201);
      ids.push((res.json() as { id: string }).id);
    }
    const trop = await creer(u.auth, 'onzième');
    expect(trop.statusCode).toBe(409);
    expect(trop.json()).toMatchObject({ code: 'api_key_limit' });

    // Une révocation libère une place
    await t.app.inject({ method: 'DELETE', url: `/v1/api-keys/${ids[0]}`, headers: u.auth });
    expect((await creer(u.auth, 'onzième')).statusCode).toBe(201);
  });

  it('révoque une clé : elle disparaît de la liste et ne s’échange plus', async () => {
    const u = await t.inscrire();
    const autre = await t.inscrire();
    const cle = (await creer(u.auth)).json() as { id: string; key: string };

    // Pas à lui, identifiant invalide : 404
    const volee = await t.app.inject({
      method: 'DELETE',
      url: `/v1/api-keys/${cle.id}`,
      headers: autre.auth,
    });
    expect(volee.statusCode).toBe(404);
    const invalide = await t.app.inject({
      method: 'DELETE',
      url: '/v1/api-keys/pas-un-uuid',
      headers: u.auth,
    });
    expect(invalide.statusCode).toBe(404);
    expect((await echanger(cle.key)).statusCode).toBe(200);

    const res = await t.app.inject({
      method: 'DELETE',
      url: `/v1/api-keys/${cle.id}`,
      headers: u.auth,
    });
    expect(res.statusCode).toBe(204);
    const liste = await t.app.inject({ url: '/v1/api-keys', headers: u.auth });
    expect(liste.json()).toEqual([]);
    expect((await echanger(cle.key)).statusCode).toBe(401);

    // Déjà révoquée : 404
    const encore = await t.app.inject({
      method: 'DELETE',
      url: `/v1/api-keys/${cle.id}`,
      headers: u.auth,
    });
    expect(encore.statusCode).toBe(404);

    const types = (
      await t.db
        .select({ envelope: outbox.envelope })
        .from(outbox)
        .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${u.id}`)
    ).map((e) => (e.envelope as { type: string }).type);
    expect(types).toContain('identity.api_key_revoked');
  });

  it('échange une clé valide contre un jeton « api » et note son utilisation', async () => {
    const u = await t.inscrire();
    const cle = (await creer(u.auth)).json() as { id: string; key: string };
    const res = await echanger(cle.key);
    expect(res.statusCode).toBe(200);
    const corps = res.json() as { userId: string; accessToken: string; expiresIn: number };
    expect(corps.userId).toBe(u.id);
    expect(corps.expiresIn).toBe(900);
    const claims = decodeJwt(corps.accessToken);
    expect(claims.sub).toBe(u.id);
    expect(claims.roles).toEqual(['user', 'api']);
    expect(claims.rooms).toEqual({});

    // Le jeton est accepté par identity…
    const moi = await t.app.inject({
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${corps.accessToken}` },
    });
    expect(moi.statusCode).toBe(200);
    // … mais ne permet pas de créer une autre clé
    const autreCle = await creer({ authorization: `Bearer ${corps.accessToken}` });
    expect(autreCle.statusCode).toBe(403);

    const liste = (await t.app.inject({ url: '/v1/api-keys', headers: u.auth })).json() as {
      lastUsedAt: string | null;
    }[];
    expect(liste[0]!.lastUsedAt).not.toBeNull();
  });

  it('refuse un secret interne faux ou absent, et une clé inconnue', async () => {
    const u = await t.inscrire();
    const cle = (await creer(u.auth)).json() as { key: string };
    expect((await echanger(cle.key, 'mauvais-secret')).statusCode).toBe(401);
    expect((await echanger(cle.key, SECRET + 'x')).statusCode).toBe(401);
    expect((await echanger(cle.key, null)).statusCode).toBe(401);
    // Sans secret, même un corps invalide ne révèle rien : 401 et non 400
    const vide = await t.app.inject({
      method: 'POST',
      url: '/internal/api-keys/exchange',
      payload: {},
    });
    expect(vide.statusCode).toBe(401);
    expect((await echanger('vtt_inconnue_' + crypto.randomUUID())).statusCode).toBe(401);
  });

  it('refuse la clé d’un compte désactivé', async () => {
    const u = await t.inscrire();
    const cle = (await creer(u.auth)).json() as { key: string };
    await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, u.id));
    expect((await echanger(cle.key)).statusCode).toBe(401);
  });

  it('n’expose pas la route interne sans INTERNAL_API_SECRET', async () => {
    const sans = await appDeTest();
    try {
      const res = await sans.app.inject({
        method: 'POST',
        url: '/internal/api-keys/exchange',
        headers: { 'x-internal-secret': SECRET },
        payload: { key: 'vtt_abc' },
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await sans.fermer();
    }
  });
});
