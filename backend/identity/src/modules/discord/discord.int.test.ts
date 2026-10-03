/**
 * Module discord par HTTP, sur un vrai PostgreSQL : connexion depuis l'activité (Discord
 * simulé), jeton délégué au bot, retrait du lien. Ignorés si TEST_DATABASE_URL est absent.
 */
import { createService, loadConfig } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityConfig } from '../../config.js';
import { oauthAccounts } from '../../db/schema.js';
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

  it('lien du bot : /link vers un autre compte, /unlink, sans jamais toucher à la connexion', async () => {
    // Compte créé par la connexion Discord (seul moyen de connexion)
    const identite = identiteDiscord();
    const discordSeul = (await connexionActivite(faux.autoriserActivite(identite))).json();
    base.suivre(discordSeul.user.id);

    const interne = (url: string, payload: unknown) =>
      base.app.inject({
        method: 'POST',
        url,
        headers: { 'x-internal-secret': SECRET },
        payload: payload as object,
      });
    const compteDuBot = async () => {
      const res = await interne('/internal/discord/delegate', { discordUserId: identite.id });
      return res.statusCode === 200 ? (decodeJwt(res.json().accessToken).sub as string) : null;
    };
    const lier = async (auth: Record<string, string>) => {
      const { token } = (
        await interne('/internal/discord/link-token', {
          discordUserId: identite.id,
          discordName: 'theo',
        })
      ).json();
      return base.app.inject({
        method: 'POST',
        url: '/v1/auth/discord/link',
        headers: auth,
        payload: { token },
      });
    };
    const connexionDiscordIntacte = async () =>
      (
        await base.db
          .select()
          .from(oauthAccounts)
          .where(
            and(
              eq(oauthAccounts.provider, 'discord'),
              eq(oauthAccounts.providerAccountId, identite.id),
            ),
          )
      ).map((l) => l.userId);

    // Sans lien explicite : le compte connecté avec Discord
    expect(await compteDuBot()).toBe(discordSeul.user.id);

    // /link depuis un compte e-mail : le bot le suit, la connexion Discord reste à l'autre
    const principal = await base.inscrire();
    const res = await lier(principal.auth);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ discordName: 'theo', linked: true });
    expect(await compteDuBot()).toBe(principal.id);
    expect(await connexionDiscordIntacte()).toEqual([discordSeul.user.id]);

    // /unlink : toujours accepté, plus aucun compte pour le bot, connexion intacte
    const delier = await interne('/internal/discord/unlink', { discordUserId: identite.id });
    expect(delier.json()).toEqual({ unlinked: true });
    expect(await compteDuBot()).toBeNull();
    expect(await connexionDiscordIntacte()).toEqual([discordSeul.user.id]);
    expect((await connexionActivite(faux.autoriserActivite(identite))).json().user.id).toBe(
      discordSeul.user.id,
    );

    // Puis de nouveau /link, vers n'importe quel compte
    expect((await lier(principal.auth)).statusCode).toBe(200);
    expect(await compteDuBot()).toBe(principal.id);

    // Jeton invalide, ou sans être connecté
    const invalide = await base.app.inject({
      method: 'POST',
      url: '/v1/auth/discord/link',
      headers: principal.auth,
      payload: { token: 'abc.def.ghi' },
    });
    expect(invalide.json().code).toBe('discord_link_invalid');
    expect(
      (
        await base.app.inject({
          method: 'POST',
          url: '/v1/auth/discord/link',
          payload: { token: 'abc.def.ghi' },
        })
      ).statusCode,
    ).toBe(401);
  });
});
