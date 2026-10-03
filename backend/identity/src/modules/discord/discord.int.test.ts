/**
 * Module discord par HTTP, sur un vrai PostgreSQL : connexion depuis l'activité (Discord
 * simulé), jeton délégué au bot, retrait du lien. Ignorés si TEST_DATABASE_URL est absent.
 */
import { createService, loadConfig } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityConfig } from '../../config.js';
import { credentials, oauthAccounts, users } from '../../db/schema.js';
import { pgSessionStore } from '../../db/session-store.js';
import type { Deps, ServiceApp } from '../../deps.js';
import { mailerDeTest } from '../../mail/mailer.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { createJwtSigner, generateSigningJwk } from '../../tokens/jwt.js';
import { clientDiscord } from '../oauth/fournisseurs.js';
import { fauxFournisseurs, type IdentiteDiscord } from '../oauth/simulation.js';
import { DELEGATE_TTL_SECONDS, registerDiscord } from './index.js';

const DISCORD_IDS = { clientId: 'discord-client-test', clientSecret: 'discord-secret-test' };
const SECRET = 'secret-interne-de-test-0123456789abcdef';
const identiteDiscord = (): IdentiteDiscord => ({
  id: String(Math.floor(Math.random() * 1e17)),
  username: 'joueur',
  global_name: 'Joueur Discord',
  email: `discord-${crypto.randomUUID()}@exemple.fr`,
  verified: true,
});

type Base = Awaited<ReturnType<typeof appDeTest>>;

describe.skipIf(!TEST_DATABASE_URL)('module discord', () => {
  let base: Base;
  let app: ServiceApp;
  let faux: Awaited<ReturnType<typeof fauxFournisseurs>>;

  beforeAll(async () => {
    base = await appDeTest({ INTERNAL_API_SECRET: SECRET });
    faux = await fauxFournisseurs(
      { clientId: 'google-client-test', clientSecret: 'google-secret-test' },
      DISCORD_IDS,
    );
    const config = loadConfig(IdentityConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL!,
      JWT_ISSUER: 'https://auth.test.local',
      JWT_AUDIENCE: 'vtt-api',
      JWT_PRIVATE_JWKS: JSON.stringify([await generateSigningJwk('test')]),
      COOKIE_SECURE: 'false',
      APP_URL: 'http://front.test',
      INTERNAL_API_SECRET: SECRET,
    });
    app = await createService({ config, auth: false });
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
    await registerDiscord(app, deps, clientDiscord({ ...DISCORD_IDS, fetch: faux.fetch }));
  });

  afterAll(async () => {
    await app?.close();
    await base?.fermer();
  });

  const connexionActivite = (code: string) =>
    app.inject({ method: 'POST', url: '/v1/auth/discord/activity', payload: { code } });

  it('activité : crée le compte, rend un jeton sans cookie et le jeton Discord', async () => {
    const identite = identiteDiscord();
    const res = await connexionActivite(faux.autoriserActivite(identite));
    expect(res.statusCode).toBe(200);
    const corps = res.json();
    base.suivre(corps.user.id);
    expect(corps.discordAccessToken).toMatch(/^jeton-discord-/);
    expect(decodeJwt(corps.accessToken).sub).toBe(corps.user.id);
    expect(res.cookies).toEqual([]);

    // Deuxième connexion : même compte
    const encore = await connexionActivite(faux.autoriserActivite(identite));
    expect(encore.json().user.id).toBe(corps.user.id);
  });

  it('activité : un code refusé par Discord répond 401 sans détail', async () => {
    const res = await connexionActivite('code-inconnu');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('discord_code_invalid');
  });

  it('jeton délégué : 60 s au nom du joueur lié, amr discord-bot ; 404 sans lien', async () => {
    const identite = identiteDiscord();
    const connexion = (await connexionActivite(faux.autoriserActivite(identite))).json();
    base.suivre(connexion.user.id);

    const delegue = (discordUserId: string, secret = SECRET) =>
      app.inject({
        method: 'POST',
        url: '/internal/discord/delegate',
        headers: { 'x-internal-secret': secret },
        payload: { discordUserId },
      });

    const res = await delegue(identite.id);
    expect(res.statusCode).toBe(200);
    const claims = decodeJwt(res.json().accessToken);
    expect(claims.sub).toBe(connexion.user.id);
    expect(claims.amr).toEqual(['discord-bot']);
    expect(claims.exp! - claims.iat!).toBe(DELEGATE_TTL_SECONDS);

    expect((await delegue('12345')).statusCode).toBe(404);
    expect((await delegue(identite.id, 'mauvais-secret')).statusCode).toBe(401);
  });

  it('délier : retire le lien s’il reste un mot de passe, sinon 409', async () => {
    const joueur = await base.inscrire();
    const discordId = String(Math.floor(Math.random() * 1e17));
    await base.db
      .insert(oauthAccounts)
      .values({ provider: 'discord', providerAccountId: discordId, userId: joueur.id });

    const delier = () =>
      base.app.inject({ method: 'DELETE', url: '/v1/auth/discord/link', headers: joueur.auth });

    // Sans mot de passe ni autre fournisseur : refusé
    const [mdp] = await base.db.select().from(credentials).where(eq(credentials.userId, joueur.id));
    await base.db.delete(credentials).where(eq(credentials.userId, joueur.id));
    expect((await delier()).statusCode).toBe(409);

    await base.db.insert(credentials).values(mdp!);
    expect((await delier()).statusCode).toBe(204);
    const restants = await base.db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, joueur.id), eq(oauthAccounts.provider, 'discord')));
    expect(restants).toEqual([]);
    expect((await delier()).statusCode).toBe(404);
    // Le compte, lui, reste
    expect(await base.db.select().from(users).where(eq(users.id, joueur.id))).toHaveLength(1);
  });
});
