/**
 * Module « securite » par HTTP, sur un vrai PostgreSQL (rôle identity_svc).
 * Ignorés si TEST_DATABASE_URL est absent. Chaque bloc a sa propre instance :
 * les limites de débit (10 appels par minute et par route) ne se cumulent pas.
 */
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentials, emailTokens, outbox, users } from '../../db/schema.js';
import { CSRF_HEADER, REFRESH_COOKIE } from '../../routes/auth.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { empreinteJeton } from './jetons.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Reponse = Awaited<ReturnType<Contexte['app']['inject']>>;

const cookieDe = (res: Reponse) => res.cookies.find((c) => c.name === REFRESH_COOKIE);

/** Nouvelle connexion (nouvelle famille de sessions). */
async function connecter(t: Contexte, email: string, motDePasse: string, appareil = 'Navigateur') {
  const res = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { 'user-agent': appareil },
    payload: { email, password: motDePasse },
  });
  return {
    statut: res.statusCode,
    refresh: cookieDe(res)?.value,
    auth: { authorization: `Bearer ${(res.json() as { accessToken?: string }).accessToken}` },
  };
}

async function renouveler(t: Contexte, refresh: string | undefined) {
  return t.app.inject({
    method: 'POST',
    url: '/v1/auth/refresh',
    headers: { [CSRF_HEADER]: '1' },
    cookies: { [REFRESH_COOKIE]: refresh ?? '' },
  });
}

async function listerSessions(t: Contexte, auth: Record<string, string>, refresh?: string) {
  return t.app.inject({
    method: 'GET',
    url: '/v1/auth/sessions',
    headers: auth,
    ...(refresh ? { cookies: { [REFRESH_COOKIE]: refresh } } : {}),
  });
}

/** Jeton du dernier lien reçu par cette adresse. */
function jetonRecu(t: Contexte, email: string, page: string): string {
  const mail = t.mailer.envoyes.filter((m) => m.to === email).at(-1);
  if (!mail) throw new Error(`aucun e-mail pour ${email}`);
  const m = new RegExp(`http://front\\.test${page}\\?jeton=([A-Za-z0-9_-]{43})$`, 'm').exec(
    mail.text,
  );
  if (!m) throw new Error(`lien introuvable dans : ${mail.text}`);
  return m[1]!;
}

async function evenements(t: Contexte, userId: string) {
  const lignes = await t.db
    .select({ envelope: outbox.envelope })
    .from(outbox)
    .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`);
  return lignes.map((l) => l.envelope as { type: string; payload: unknown; visibility: string });
}

describe.skipIf(!TEST_DATABASE_URL)('sessions actives', () => {
  let t: Contexte;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  it('exige d’être connecté', async () => {
    expect((await t.app.inject({ method: 'GET', url: '/v1/auth/sessions' })).statusCode).toBe(401);
  });

  it('liste une entrée par famille active, marque l’appareil courant, suit les rotations', async () => {
    const u = await t.inscrire();
    const b = await connecter(t, u.email, u.motDePasse, 'Firefox');
    await connecter(t, u.email, u.motDePasse, 'Safari');

    // Rotation sur la famille b : toujours une seule entrée pour elle
    const rotation = await renouveler(t, b.refresh);
    expect(rotation.statusCode).toBe(200);
    const bApres = cookieDe(rotation)!.value;

    const res = await listerSessions(t, u.auth, bApres);
    expect(res.statusCode).toBe(200);
    const liste = res.json() as Array<{
      id: string;
      createdAt: string;
      lastUsedAt: string;
      userAgent: string | null;
      ip: string | null;
      current: boolean;
    }>;
    expect(liste).toHaveLength(3);
    const courantes = liste.filter((s) => s.current);
    expect(courantes).toHaveLength(1);
    expect(courantes[0]!.userAgent).toBe('lightMyRequest');
    expect(courantes[0]!.ip).toBe('127.0.0.1');
    expect(new Date(courantes[0]!.lastUsedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(courantes[0]!.createdAt).getTime(),
    );
    expect(liste.map((s) => s.userAgent)).toEqual(
      expect.arrayContaining(['Safari', 'lightMyRequest']),
    );
    for (const s of liste) {
      expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Number.isNaN(Date.parse(s.createdAt))).toBe(false);
    }

    // Sans cookie : aucune entrée courante
    const sansCookie = (await listerSessions(t, u.auth)).json() as Array<{ current: boolean }>;
    expect(sansCookie.some((s) => s.current)).toBe(false);
  });

  it('révoque une famille : son refresh token est ensuite refusé', async () => {
    const u = await t.inscrire();
    const b = await connecter(t, u.email, u.motDePasse, 'Autre appareil');
    const avant = (await listerSessions(t, u.auth, b.refresh)).json() as Array<{
      id: string;
      current: boolean;
    }>;
    const familleB = avant.find((s) => s.current)!.id;

    const res = await t.app.inject({
      method: 'DELETE',
      url: `/v1/auth/sessions/${familleB}`,
      headers: u.auth,
    });
    expect(res.statusCode).toBe(204);
    expect((await renouveler(t, b.refresh)).statusCode).toBe(401);
    // L'autre appareil n'est pas touché
    expect((await renouveler(t, u.refresh)).statusCode).toBe(200);

    const apres = (await listerSessions(t, u.auth)).json() as Array<{ id: string }>;
    expect(apres.map((s) => s.id)).not.toContain(familleB);
    // Déjà révoquée : 404
    const encore = await t.app.inject({
      method: 'DELETE',
      url: `/v1/auth/sessions/${familleB}`,
      headers: u.auth,
    });
    expect(encore.statusCode).toBe(404);

    const types = (await evenements(t, u.id)).map((e) => e.type);
    expect(types).toContain('identity.session_revoked');
  });

  it('ne permet pas de révoquer la session d’un autre utilisateur', async () => {
    const victime = await t.inscrire('Victime');
    const attaquant = await t.inscrire('Attaquant');
    const [famille] = (await listerSessions(t, victime.auth)).json() as Array<{ id: string }>;

    const res = await t.app.inject({
      method: 'DELETE',
      url: `/v1/auth/sessions/${famille!.id}`,
      headers: attaquant.auth,
    });
    expect(res.statusCode).toBe(404);
    expect((await renouveler(t, victime.refresh)).statusCode).toBe(200);

    const inconnue = await t.app.inject({
      method: 'DELETE',
      url: `/v1/auth/sessions/${crypto.randomUUID()}`,
      headers: attaquant.auth,
    });
    expect(inconnue.statusCode).toBe(404);
    const invalide = await t.app.inject({
      method: 'DELETE',
      url: '/v1/auth/sessions/pas-un-uuid',
      headers: attaquant.auth,
    });
    expect(invalide.statusCode).toBe(400);
  });

  it('déconnecte tous les appareils (en-tête anti-CSRF exigé) et efface le cookie', async () => {
    const u = await t.inscrire();
    const b = await connecter(t, u.email, u.motDePasse);

    const sansCsrf = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout-all',
      headers: u.auth,
    });
    expect(sansCsrf.statusCode).toBe(403);

    const res = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/logout-all',
      headers: { ...u.auth, [CSRF_HEADER]: '1' },
      cookies: { [REFRESH_COOKIE]: u.refresh! },
    });
    expect(res.statusCode).toBe(204);
    const efface = cookieDe(res);
    expect(efface?.value).toBe('');
    expect(efface?.path).toBe('/v1/auth');

    expect((await renouveler(t, u.refresh)).statusCode).toBe(401);
    expect((await renouveler(t, b.refresh)).statusCode).toBe(401);
    expect((await listerSessions(t, u.auth)).json()).toEqual([]);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('mot de passe', () => {
  let t: Contexte;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  const changer = (auth: Record<string, string>, corps: object, refresh?: string) =>
    t.app.inject({
      method: 'POST',
      url: '/v1/auth/password',
      headers: auth,
      payload: corps,
      ...(refresh ? { cookies: { [REFRESH_COOKIE]: refresh } } : {}),
    });

  const oublier = (email: string) =>
    t.app.inject({ method: 'POST', url: '/v1/auth/password/forgot', payload: { email } });

  const reinitialiser = (token: string, newPassword = 'nouveau-mot-de-passe') =>
    t.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, newPassword },
    });

  it('change le mot de passe, garde l’appareil courant et déconnecte les autres', async () => {
    const u = await t.inscrire();
    const autre = await connecter(t, u.email, u.motDePasse);

    const faux = await changer(u.auth, {
      currentPassword: 'pas-le-bon',
      newPassword: 'x'.repeat(8),
    });
    expect(faux.statusCode).toBe(403);
    const court = await changer(u.auth, { currentPassword: u.motDePasse, newPassword: 'court' });
    expect(court.statusCode).toBe(400);

    const res = await changer(
      u.auth,
      { currentPassword: u.motDePasse, newPassword: 'nouveau-solide' },
      u.refresh,
    );
    expect(res.statusCode).toBe(204);

    expect((await renouveler(t, autre.refresh)).statusCode).toBe(401);
    expect((await renouveler(t, u.refresh)).statusCode).toBe(200);
    expect((await connecter(t, u.email, u.motDePasse)).statut).toBe(401);
    expect((await connecter(t, u.email, 'nouveau-solide')).statut).toBe(200);

    const [stocke] = await t.db
      .select({ algorithm: credentials.algorithm, hash: credentials.hash })
      .from(credentials)
      .where(eq(credentials.userId, u.id));
    expect(stocke?.algorithm).toBe('argon2id');
    expect(stocke?.hash.startsWith('$argon2id$')).toBe(true);

    const evt = (await evenements(t, u.id)).find((e) => e.type === 'identity.password_changed');
    expect(evt?.visibility).toBe('owner');
    expect(JSON.stringify(evt)).not.toContain('nouveau-solide');
  });

  it('refuse le changement (400) pour un compte sans mot de passe', async () => {
    const u = await t.inscrire();
    await t.db.delete(credentials).where(eq(credentials.userId, u.id));
    const res = await changer(u.auth, {
      currentPassword: 'quelconque',
      newPassword: 'nouveau-solide',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('no_password');
  });

  it('« mot de passe oublié » répond pareil que le compte existe ou non', async () => {
    const u = await t.inscrire();
    const inconnue = `absent-${crypto.randomUUID()}@exemple.fr`;

    const debutConnu = Date.now();
    const connu = await oublier(u.email.toUpperCase());
    const dureeConnu = Date.now() - debutConnu;
    const debutInconnu = Date.now();
    const absent = await oublier(inconnue);
    const dureeInconnu = Date.now() - debutInconnu;

    expect(connu.statusCode).toBe(202);
    expect(absent.statusCode).toBe(202);
    expect(absent.body).toBe(connu.body);
    expect(dureeConnu).toBeGreaterThanOrEqual(240);
    expect(dureeInconnu).toBeGreaterThanOrEqual(240);

    expect(t.mailer.envoyes.some((m) => m.to === inconnue)).toBe(false);
    const mail = t.mailer.envoyes.filter((m) => m.to === u.email).at(-1)!;
    expect(mail.subject).toBe('Réinitialisation de votre mot de passe');
    const jeton = jetonRecu(t, u.email, '/reinitialisation');

    // Seule l'empreinte est stockée, valable une heure
    const [ligne] = await t.db
      .select()
      .from(emailTokens)
      .where(eq(emailTokens.tokenHash, empreinteJeton(jeton)));
    expect(ligne?.purpose).toBe('password_reset');
    const duree = ligne!.expiresAt.getTime() - ligne!.createdAt.getTime();
    expect(Math.abs(duree - 3_600_000)).toBeLessThan(5_000);

    // Ni adresse ni jeton dans les événements
    const evts = JSON.stringify(await evenements(t, u.id));
    expect(evts).toContain('identity.password_reset_requested');
    expect(evts.toLowerCase()).not.toContain(u.email.toLowerCase());
    expect(evts).not.toContain(jeton);
  });

  it('réinitialise avec un jeton à usage unique et révoque toutes les sessions', async () => {
    const u = await t.inscrire();
    expect((await oublier(u.email)).statusCode).toBe(202);
    const jeton = jetonRecu(t, u.email, '/reinitialisation');

    const res = await reinitialiser(jeton);
    expect(res.statusCode).toBe(204);
    expect((await renouveler(t, u.refresh)).statusCode).toBe(401);
    expect((await connecter(t, u.email, u.motDePasse)).statut).toBe(401);
    expect((await connecter(t, u.email, 'nouveau-mot-de-passe')).statut).toBe(200);

    // Réutilisé : refusé
    const encore = await reinitialiser(jeton, 'encore-un-autre');
    expect(encore.statusCode).toBe(400);
    expect(encore.json().code).toBe('invalid_token');
    expect((await reinitialiser('n-importe-quoi')).statusCode).toBe(400);
  });

  it('refuse un jeton expiré ou remplacé par une demande plus récente', async () => {
    const u = await t.inscrire();
    await oublier(u.email);
    const premier = jetonRecu(t, u.email, '/reinitialisation');
    await oublier(u.email);
    const second = jetonRecu(t, u.email, '/reinitialisation');
    expect(second).not.toBe(premier);
    expect((await reinitialiser(premier)).statusCode).toBe(400);

    await t.db
      .update(emailTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(emailTokens.tokenHash, empreinteJeton(second)));
    expect((await reinitialiser(second)).statusCode).toBe(400);
    expect((await connecter(t, u.email, u.motDePasse)).statut).toBe(200);
  });

  it('définit un mot de passe pour un compte qui n’en avait pas', async () => {
    const u = await t.inscrire();
    await t.db.delete(credentials).where(eq(credentials.userId, u.id));
    await oublier(u.email);
    const res = await reinitialiser(jetonRecu(t, u.email, '/reinitialisation'), 'tout-neuf-123');
    expect(res.statusCode).toBe(204);
    expect((await connecter(t, u.email, 'tout-neuf-123')).statut).toBe(200);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('vérification de l’adresse e-mail', () => {
  let t: Contexte;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  const demander = (auth: Record<string, string>) =>
    t.app.inject({ method: 'POST', url: '/v1/auth/email/verification', headers: auth });
  const verifier = (token: string) =>
    t.app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { token } });
  const estVerifie = async (id: string) =>
    (await t.db.select({ v: users.emailVerified }).from(users).where(eq(users.id, id)))[0]?.v;

  it('exige d’être connecté', async () => {
    expect(
      (await t.app.inject({ method: 'POST', url: '/v1/auth/email/verification' })).statusCode,
    ).toBe(401);
  });

  it('envoie un lien valable 24 h, vérifie l’adresse une seule fois, puis 409', async () => {
    const u = await t.inscrire();
    expect((await demander(u.auth)).statusCode).toBe(202);
    const jeton = jetonRecu(t, u.email, '/verification-email');

    const [ligne] = await t.db
      .select()
      .from(emailTokens)
      .where(eq(emailTokens.tokenHash, empreinteJeton(jeton)));
    expect(ligne?.purpose).toBe('email_verification');
    const duree = ligne!.expiresAt.getTime() - ligne!.createdAt.getTime();
    expect(Math.abs(duree - 24 * 3_600_000)).toBeLessThan(5_000);

    expect(await estVerifie(u.id)).toBe(false);
    expect((await verifier(jeton)).statusCode).toBe(204);
    expect(await estVerifie(u.id)).toBe(true);

    expect((await verifier(jeton)).statusCode).toBe(400);
    const deja = await demander(u.auth);
    expect(deja.statusCode).toBe(409);

    const types = (await evenements(t, u.id)).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining(['identity.email_verification_requested', 'identity.email_verified']),
    );
  });

  it('refuse un jeton expiré', async () => {
    const u = await t.inscrire();
    await demander(u.auth);
    const jeton = jetonRecu(t, u.email, '/verification-email');
    await t.db
      .update(emailTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(emailTokens.tokenHash, empreinteJeton(jeton)));
    expect((await verifier(jeton)).statusCode).toBe(400);
    expect(await estVerifie(u.id)).toBe(false);
  });

  it('refuse le jeton si l’adresse du compte a changé depuis l’envoi', async () => {
    const u = await t.inscrire();
    await demander(u.auth);
    const jeton = jetonRecu(t, u.email, '/verification-email');
    await t.db
      .update(users)
      .set({ email: `change-${crypto.randomUUID()}@exemple.fr` })
      .where(eq(users.id, u.id));
    expect((await verifier(jeton)).statusCode).toBe(400);
    expect(await estVerifie(u.id)).toBe(false);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('suppression du compte', () => {
  let t: Contexte;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  const supprimer = (auth: Record<string, string>, payload?: object) =>
    t.app.inject({
      method: 'DELETE',
      url: '/v1/users/me',
      headers: auth,
      ...(payload ? { payload } : {}),
    });

  it('exige le mot de passe, puis supprime le compte et tout ce qui en dépend', async () => {
    const u = await t.inscrire();

    const sans = await supprimer(u.auth);
    expect(sans.statusCode).toBe(400);
    expect(sans.json().code).toBe('password_required');
    expect((await supprimer(u.auth, { password: 'pas-le-bon' })).statusCode).toBe(403);

    const res = await supprimer(u.auth, { password: u.motDePasse });
    expect(res.statusCode).toBe(204);
    const efface = cookieDe(res);
    expect(efface?.value).toBe('');
    expect(efface?.path).toBe('/v1/auth');

    expect(await t.db.select().from(users).where(eq(users.id, u.id))).toHaveLength(0);
    expect(await t.db.select().from(credentials).where(eq(credentials.userId, u.id))).toHaveLength(
      0,
    );
    expect((await renouveler(t, u.refresh)).statusCode).toBe(401);
    expect((await connecter(t, u.email, u.motDePasse)).statut).toBe(401);

    const evts = await evenements(t, u.id);
    const suppression = evts.find((e) => e.type === 'identity.user_deleted');
    expect(suppression?.visibility).toBe('owner');
    expect(JSON.stringify(evts)).not.toContain(u.motDePasse);

    // Jeton d'accès encore valable quelques minutes, mais plus de compte
    expect((await supprimer(u.auth, { password: u.motDePasse })).statusCode).toBe(404);
  });

  it('supprime sans mot de passe un compte qui n’en a pas (Google/Discord seul)', async () => {
    const u = await t.inscrire();
    await t.db.delete(credentials).where(eq(credentials.userId, u.id));
    const res = await supprimer(u.auth);
    expect(res.statusCode).toBe(204);
    expect(await t.db.select().from(users).where(eq(users.id, u.id))).toHaveLength(0);
  });

  it('supprime les jetons en attente avec le compte', async () => {
    const u = await t.inscrire();
    await t.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: u.email },
    });
    const jeton = jetonRecu(t, u.email, '/reinitialisation');
    await t.app.inject({
      method: 'DELETE',
      url: '/v1/users/me',
      headers: u.auth,
      payload: { password: u.motDePasse },
    });
    const restants = await t.db
      .select()
      .from(emailTokens)
      .where(eq(emailTokens.tokenHash, empreinteJeton(jeton)));
    expect(restants).toHaveLength(0);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('limite de débit', () => {
  let t: Contexte;
  beforeAll(async () => {
    t = await appDeTest();
  });
  afterAll(async () => {
    await t?.fermer();
  });

  it('bloque « mot de passe oublié » au-delà de 10 demandes par minute', async () => {
    const email = `absent-${crypto.randomUUID()}@exemple.fr`;
    // En série : le magasin mémoire de @fastify/rate-limit compte mal les requêtes simultanées
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await t.app.inject({
        method: 'POST',
        url: '/v1/auth/password/forgot',
        payload: { email },
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(202));
    expect(codes[10]).toBe(429);
  });
});
