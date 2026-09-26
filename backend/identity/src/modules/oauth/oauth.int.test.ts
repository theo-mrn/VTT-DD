/**
 * Parcours Google et Discord complets par HTTP, sur un vrai PostgreSQL, avec
 * des fournisseurs simulés (fetch simulé, clé RSA de test pour les id_token).
 * Ignorés si TEST_DATABASE_URL est absent.
 */
import cookie from '@fastify/cookie';
import { createService, loadConfig } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityConfig } from '../../config.js';
import { pgSessionStore } from '../../db/session-store.js';
import { credentials, oauthAccounts, outbox, profiles, users } from '../../db/schema.js';
import type { Deps, ServiceApp } from '../../deps.js';
import { mailerDeTest } from '../../mail/mailer.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { createJwtSigner, generateSigningJwk } from '../../tokens/jwt.js';
import { OAUTH_COOKIE } from './etat.js';
import { clientDiscord, clientGoogle } from './fournisseurs.js';
import { registerOAuth } from './index.js';
import { fauxFournisseurs, type IdentiteDiscord, type IdentiteGoogle } from './simulation.js';

const GOOGLE_IDS = { clientId: 'google-client-test', clientSecret: 'google-secret-test' };
const DISCORD_IDS = { clientId: 'discord-client-test', clientSecret: 'discord-secret-test' };
const FRONT = 'http://front.test';
const ERREUR = `${FRONT}/connexion?erreur=oauth`;

type Base = Awaited<ReturnType<typeof appDeTest>>;
type Reponse = Awaited<ReturnType<ServiceApp['inject']>>;

const unique = () => crypto.randomUUID();
const adresse = () => `oauth-${unique()}@exemple.fr`;
const cookieDe = (res: Reponse, nom: string) => res.cookies.find((c) => c.name === nom);

describe.skipIf(!TEST_DATABASE_URL)('connexion OAuth par HTTP', () => {
  let base: Base;
  let app: ServiceApp;
  let faux: Awaited<ReturnType<typeof fauxFournisseurs>>;
  const journaux: string[] = [];

  beforeAll(async () => {
    base = await appDeTest();
    faux = await fauxFournisseurs(GOOGLE_IDS, DISCORD_IDS);

    // Service minimal : socle commun + module OAuth avec des clients simulés
    const config = loadConfig(IdentityConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      DATABASE_URL: TEST_DATABASE_URL!,
      JWT_ISSUER: 'https://auth.test.local',
      JWT_AUDIENCE: 'vtt-api',
      JWT_PRIVATE_JWKS: JSON.stringify([await generateSigningJwk('test')]),
      COOKIE_SECURE: 'false',
      APP_URL: FRONT,
    });
    app = await createService({
      config,
      auth: false,
      logStream: { write: (ligne: string) => void journaux.push(ligne) },
    });
    await app.register(cookie);
    const deps: Deps = {
      config,
      db: base.db,
      sessions: pgSessionStore(base.db),
      signer: await createJwtSigner({
        privateJwks: config.JWT_PRIVATE_JWKS,
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE,
      }),
      mailer: mailerDeTest(),
      firebase: undefined,
    };
    await registerOAuth(app, deps, {
      google: clientGoogle({ ...GOOGLE_IDS, fetch: faux.fetch, cles: faux.cles }),
      discord: clientDiscord({ ...DISCORD_IDS, fetch: faux.fetch }),
    });
  });

  afterAll(async () => {
    await app?.close();
    await base?.fermer();
  });

  /** Départ, consentement simulé chez le fournisseur, puis retour. */
  async function parcours(
    fournisseur: 'google' | 'discord',
    identite: IdentiteGoogle | IdentiteDiscord,
    options: { redirect?: string; revendications?: Record<string, unknown> } = {},
  ) {
    // Adresse IP distincte par parcours : la limite de débit par route ne gêne pas les tests
    const remoteAddress = `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const depart = await app.inject({
      method: 'GET',
      url: `/v1/auth/oauth/${fournisseur}/start`,
      query: options.redirect === undefined ? {} : { redirect: options.redirect },
      remoteAddress,
    });
    expect(depart.statusCode).toBe(302);
    const etat = cookieDe(depart, OAUTH_COOKIE)!.value;
    const { code, state } = faux.autoriser(
      depart.headers.location as string,
      identite,
      options.revendications,
    );
    const retour = await app.inject({
      method: 'GET',
      url: `/v1/auth/oauth/${fournisseur}/callback`,
      query: { code, state },
      cookies: { [OAUTH_COOKIE]: etat },
      remoteAddress,
    });
    return { depart, retour, code };
  }

  /** Compte rattaché à cette identité (et suivi pour être supprimé en fin de test). */
  async function compteDe(fournisseur: 'google' | 'discord', id: string) {
    const [ligne] = await base.db
      .select({ userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, fournisseur), eq(oauthAccounts.providerAccountId, id)));
    if (ligne) base.suivre(ligne.userId);
    return ligne?.userId ?? null;
  }

  async function evenements(userId: string) {
    const lignes = await base.db
      .select({ envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`);
    return lignes.map(
      (l) => l.envelope as { type: string; payload: Record<string, unknown>; visibility: string },
    );
  }

  /** La session ouverte par le retour OAuth est utilisable par /v1/auth/refresh. */
  async function renouveler(res: Reponse) {
    const refresh = cookieDe(res, 'vtt_refresh');
    const r = await base.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { 'x-vtt-csrf': '1' },
      cookies: { vtt_refresh: refresh!.value },
    });
    return r;
  }

  it('crée un compte par Google, ouvre la session et revient au chemin demandé', async () => {
    const email = adresse();
    const sub = unique();
    const { depart, retour } = await parcours(
      'google',
      {
        sub,
        email,
        email_verified: true,
        name: 'Gandalf le Gris',
        picture: 'https://lh3.googleusercontent.com/a/gandalf',
      },
      { redirect: '/salles/42?onglet=carte' },
    );

    // Cookie d'état : httpOnly, Lax, limité au parcours OAuth, 10 minutes
    const etat = cookieDe(depart, OAUTH_COOKIE)!;
    expect(etat).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/v1/auth/oauth' });
    expect(etat.maxAge).toBe(600);

    expect(retour.statusCode).toBe(302);
    expect(retour.headers.location).toBe(`${FRONT}/salles/42?onglet=carte`);
    const refresh = cookieDe(retour, 'vtt_refresh')!;
    expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/v1/auth' });
    expect(refresh.expires!.getTime()).toBeGreaterThan(Date.now());
    // Cookie d'état effacé : usage unique
    expect(cookieDe(retour, OAUTH_COOKIE)?.value).toBe('');

    const userId = await compteDe('google', sub);
    expect(userId).not.toBeNull();
    const [compte] = await base.db
      .select({
        email: users.email,
        emailVerified: users.emailVerified,
        name: profiles.name,
        avatarUrl: profiles.avatarUrl,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId!));
    expect(compte).toEqual({
      email,
      emailVerified: true,
      name: 'Gandalf le Gris',
      avatarUrl: 'https://lh3.googleusercontent.com/a/gandalf',
    });

    const types = (await evenements(userId!)).map((e) => [e.type, e.payload, e.visibility]);
    expect(types).toEqual([
      ['identity.user_registered', { method: 'google' }, 'owner'],
      ['identity.user_logged_in', { method: 'google' }, 'owner'],
    ]);

    const renouvellement = await renouveler(retour);
    expect(renouvellement.statusCode).toBe(200);
    expect(renouvellement.json().user.id).toBe(userId);
  });

  it('reconnecte le même compte au second passage', async () => {
    const sub = unique();
    const identite = { sub, email: adresse(), email_verified: true, name: 'Aragorn' };
    const premier = await parcours('google', identite);
    const second = await parcours('google', { ...identite, name: 'Grand-Pas' });
    expect(premier.retour.headers.location).toBe(`${FRONT}/`);
    expect(second.retour.headers.location).toBe(`${FRONT}/`);

    const userId = await compteDe('google', sub);
    const types = (await evenements(userId!)).map((e) => e.type);
    expect(types.filter((t) => t === 'identity.user_registered')).toHaveLength(1);
    expect(types.filter((t) => t === 'identity.user_logged_in')).toHaveLength(2);
    expect((await renouveler(second.retour)).json().user.id).toBe(userId);
  });

  it('crée un compte par Discord avec son nom affiché et son avatar', async () => {
    const id = String(Date.now()) + String(Math.floor(Math.random() * 1e6));
    const email = adresse();
    const { retour } = await parcours('discord', {
      id,
      username: 'legolas',
      global_name: 'Legolas',
      avatar: '8342729096ea3675442027381ff50dfe',
      email,
      verified: false,
    });
    expect(retour.headers.location).toBe(`${FRONT}/`);

    const userId = await compteDe('discord', id);
    const [compte] = await base.db
      .select({
        email: users.email,
        emailVerified: users.emailVerified,
        name: profiles.name,
        avatarUrl: profiles.avatarUrl,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId!));
    expect(compte).toEqual({
      email,
      emailVerified: false,
      name: 'Legolas',
      avatarUrl: `https://cdn.discordapp.com/avatars/${id}/8342729096ea3675442027381ff50dfe.png`,
    });
    expect((await evenements(userId!)).map((e) => [e.type, e.payload])).toEqual([
      ['identity.user_registered', { method: 'discord' }],
      ['identity.user_logged_in', { method: 'discord' }],
    ]);
  });

  it('rattache à un compte existant par e-mail vérifié (casse ignorée)', async () => {
    const joueur = await base.inscrire('Frodon');
    // Adresse déjà vérifiée sur la plateforme : le mot de passe est conservé
    await base.db.update(users).set({ emailVerified: true }).where(eq(users.id, joueur.id));

    const sub = unique();
    const { retour } = await parcours('google', {
      sub,
      email: joueur.email.toUpperCase(),
      email_verified: true,
      name: 'Autre nom',
    });
    expect(retour.headers.location).toBe(`${FRONT}/`);
    expect(await compteDe('google', sub)).toBe(joueur.id);

    const evts = await evenements(joueur.id);
    expect(evts.find((e) => e.type === 'identity.oauth_linked')?.payload).toEqual({
      provider: 'google',
      emailVerified: true,
    });
    expect(
      evts.some((e) => e.type === 'identity.user_registered' && e.payload.method === 'google'),
    ).toBe(false);

    // Profil inchangé, mot de passe toujours valable
    const [profil] = await base.db
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.userId, joueur.id));
    expect(profil!.name).toBe('Frodon');
    const connexion = await base.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: joueur.email, password: joueur.motDePasse },
    });
    expect(connexion.statusCode).toBe(200);
  });

  it('rattache un compte à l’adresse jamais vérifiée en retirant son mot de passe', async () => {
    // Quelqu'un a pu inscrire l'adresse d'autrui : Google prouve qui la possède
    const joueur = await base.inscrire('Usurpateur');
    const sub = unique();
    await parcours('google', { sub, email: joueur.email, email_verified: true });
    expect(await compteDe('google', sub)).toBe(joueur.id);

    const restants = await base.db
      .select()
      .from(credentials)
      .where(eq(credentials.userId, joueur.id));
    expect(restants).toHaveLength(0);
    const [compte] = await base.db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, joueur.id));
    expect(compte!.emailVerified).toBe(true);
    expect(
      (await evenements(joueur.id)).find((e) => e.type === 'identity.oauth_linked')?.payload,
    ).toEqual({ provider: 'google', emailVerified: true, passwordRemoved: true });

    // L'ancienne session et l'ancien mot de passe ne donnent plus accès
    const ancien = await base.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      headers: { 'x-vtt-csrf': '1' },
      cookies: { vtt_refresh: joueur.refresh! },
    });
    expect(ancien.statusCode).toBe(401);
    const connexion = await base.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: joueur.email, password: joueur.motDePasse },
    });
    expect(connexion.statusCode).toBe(401);
  });

  it('ne rattache pas sur une adresse non vérifiée par le fournisseur : compte distinct sans e-mail', async () => {
    const joueur = await base.inscrire('Sam');
    const id = String(Date.now()) + String(Math.floor(Math.random() * 1e6));
    const { retour } = await parcours('discord', {
      id,
      username: 'imposteur',
      email: joueur.email,
      verified: false,
    });
    expect(retour.headers.location).toBe(`${FRONT}/`);

    const userId = await compteDe('discord', id);
    expect(userId).not.toBeNull();
    expect(userId).not.toBe(joueur.id);
    const [compte] = await base.db
      .select({ email: users.email, emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId!));
    expect(compte).toEqual({ email: null, emailVerified: false });

    // Le compte existant n'a rien reçu
    const liens = await base.db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, joueur.id));
    expect(liens).toHaveLength(0);
    expect((await evenements(joueur.id)).some((e) => e.type === 'identity.oauth_linked')).toBe(
      false,
    );
  });

  it('refuse un compte désactivé', async () => {
    const sub = unique();
    await parcours('google', { sub, email: adresse(), email_verified: true });
    const userId = await compteDe('google', sub);
    await base.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, userId!));

    const { retour } = await parcours('google', { sub });
    expect(retour.headers.location).toBe(ERREUR);
    expect(cookieDe(retour, 'vtt_refresh')).toBeUndefined();
  });

  it('refuse un state invalide ou un cookie absent', async () => {
    const depart = await app.inject({ method: 'GET', url: '/v1/auth/oauth/google/start' });
    const etat = cookieDe(depart, OAUTH_COOKIE)!.value;
    const sub = unique();
    const { code } = faux.autoriser(depart.headers.location as string, { sub });
    const appelsAvant = faux.appels.length;

    const mauvaisState = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/google/callback',
      query: { code, state: 'x'.repeat(43) },
      cookies: { [OAUTH_COOKIE]: etat },
    });
    const sansCookie = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/google/callback',
      query: { code, state: new URL(depart.headers.location as string).searchParams.get('state')! },
    });
    const cookieFalsifie = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/google/callback',
      query: { code, state: 'x' },
      cookies: { [OAUTH_COOKIE]: `${etat.slice(0, -2)}xx` },
    });
    // Cookie Google présenté au retour Discord
    const autreFournisseur = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/discord/callback',
      query: { code, state: new URL(depart.headers.location as string).searchParams.get('state')! },
      cookies: { [OAUTH_COOKIE]: etat },
    });
    const refusFournisseur = await app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/google/callback',
      query: { error: 'access_denied' },
      cookies: { [OAUTH_COOKIE]: etat },
    });

    for (const res of [
      mauvaisState,
      sansCookie,
      cookieFalsifie,
      autreFournisseur,
      refusFournisseur,
    ]) {
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe(ERREUR);
      expect(cookieDe(res, 'vtt_refresh')).toBeUndefined();
    }
    // Aucun échange de code n'a été tenté, aucun compte créé
    expect(faux.appels.length).toBe(appelsAvant);
    expect(await compteDe('google', sub)).toBeNull();
  });

  it.each([
    ['nonce', { nonce: 'nonce-rejoue' }],
    ['audience', { aud: 'client-d-un-autre-site' }],
  ])('refuse un id_token au mauvais %s', async (_nom, revendications) => {
    const sub = unique();
    const { retour } = await parcours(
      'google',
      { sub, email: adresse(), email_verified: true },
      { revendications },
    );
    expect(retour.headers.location).toBe(ERREUR);
    expect(cookieDe(retour, 'vtt_refresh')).toBeUndefined();
    expect(await compteDe('google', sub)).toBeNull();
  });

  it.each(['//evil.com', 'https://evil.com/x', '/\\evil.com'])(
    'refuse la redirection ouverte %s',
    async (redirect) => {
      const sub = unique();
      const { retour } = await parcours('google', { sub }, { redirect });
      expect(retour.headers.location).toBe(`${FRONT}/`);
      await compteDe('google', sub);
    },
  );

  it('ne journalise ni code, ni e-mail, ni jeton', async () => {
    const email = adresse();
    const sub = unique();
    const { code, retour } = await parcours('google', { sub, email, email_verified: true });
    await compteDe('google', sub);
    const refresh = cookieDe(retour, 'vtt_refresh')!.value;
    const tout = journaux.join('\n');
    expect(tout).toContain('/v1/auth/oauth/google/callback');
    expect(tout).not.toContain(code);
    expect(tout).not.toContain(email);
    expect(tout).not.toContain(refresh);
    expect(tout).toContain('échec de connexion OAuth');
  });
});

describe.skipIf(!TEST_DATABASE_URL)('fournisseurs configurés (service complet)', () => {
  it('sans identifiants : aucun fournisseur, départ en 404', async () => {
    const { app, fermer } = await appDeTest();
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/auth/oauth/providers' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ google: false, discord: false });
      for (const url of [
        '/v1/auth/oauth/google/start',
        '/v1/auth/oauth/discord/start',
        '/v1/auth/oauth/twitter/start',
        '/v1/auth/oauth/google/callback?code=x&state=y',
      ]) {
        expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
      }
    } finally {
      await fermer();
    }
  });

  it('avec les identifiants Google : départ vers accounts.google.com', async () => {
    const { app, fermer } = await appDeTest({
      GOOGLE_CLIENT_ID: 'id-google.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'secret-google',
      // Identifiant sans secret : Discord reste désactivé
      DISCORD_CLIENT_ID: 'id-discord',
    });
    try {
      const fournisseurs = await app.inject({ method: 'GET', url: '/v1/auth/oauth/providers' });
      expect(fournisseurs.json()).toEqual({ google: true, discord: false });

      const depart = await app.inject({
        method: 'GET',
        url: '/v1/auth/oauth/google/start?redirect=%2Fprofil',
      });
      expect(depart.statusCode).toBe(302);
      const u = new URL(depart.headers.location as string);
      expect(`${u.origin}${u.pathname}`).toBe('https://accounts.google.com/o/oauth2/v2/auth');
      expect(u.searchParams.get('client_id')).toBe('id-google.apps.googleusercontent.com');
      expect(u.searchParams.get('redirect_uri')).toBe(`${FRONT}/v1/auth/oauth/google/callback`);
      expect(u.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(cookieDe(depart, OAUTH_COOKIE)?.httpOnly).toBe(true);

      const discord = await app.inject({ method: 'GET', url: '/v1/auth/oauth/discord/start' });
      expect(discord.statusCode).toBe(404);
    } finally {
      await fermer();
    }
  });
});
