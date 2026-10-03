/**
 * Module « discord » (docs/discord.md) : connexion depuis l'activité Discord et jetons délégués
 * au bot de dés.
 *
 *   POST   /v1/auth/discord/activity      { code }  code du SDK de l'activité (sans PKCE ni
 *          redirection) → jeton d'accès, sans cookie de renouvellement (jamais envoyé dans
 *          l'iframe) ; le jeton Discord est rendu pour `authenticate` côté SDK. Même logique de
 *          compte que la connexion Discord du site (comptes.ts).
 *   POST   /internal/discord/delegate     { discordUserId }  réservé au service discord (secret
 *          interne) : jeton de 60 s au nom du joueur lié (amr discord-bot), 404 sans lien.
 *   POST   /internal/discord/link-token   { discordUserId, discordName }  réservé au service
 *          discord : jeton de liaison de 10 minutes, remis au joueur par /link.
 *   POST   /v1/auth/discord/link          { token }  joueur connecté (tout moyen de connexion) : lie
 *          l'identité Discord du jeton à son compte, sans connexion Discord. 409 si elle est déjà
 *          liée à un autre compte, ou si le compte en a déjà une autre.
 *   DELETE /v1/auth/discord/link          retire le lien Discord du compte (/unlink), refusé
 *          (409) s'il ne reste aucun autre moyen de connexion.
 */
import { HttpError } from '@vtt/platform';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { credentials, oauthAccounts, users } from '../../db/schema.js';
import type { Deps, Module, ServiceApp } from '../../deps.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../tokens/jwt.js';
import { secretsEgaux } from '../cles-api/cles.js';
import { EN_TETE_SECRET_INTERNE } from '../cles-api/index.js';
import { journaliserConnexion, resoudreCompte } from '../oauth/comptes.js';
import {
  deriveLinkKey,
  LINK_TOKEN_TTL_SECONDS,
  signLinkToken,
  verifyLinkToken,
} from './link-token.js';
import {
  clientsDepuisConfig,
  ErreurFournisseur,
  type ClientDiscord,
} from '../oauth/fournisseurs.js';

/** Durée d'un jeton délégué : le temps d'une commande du bot. */
export const DELEGATE_TTL_SECONDS = 60;

const DiscordUserId = z.string().regex(/^\d{1,32}$/);

const ActivityResponse = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number(),
  user: z.object({ id: z.string() }),
  discordAccessToken: z.string(),
});

const eventContext = (req: FastifyRequest): EventContext => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

/** Enregistre les routes avec un client Discord fourni (réel ou simulé en test). */
export async function registerDiscord(
  app: ServiceApp,
  deps: Deps,
  client: ClientDiscord | undefined,
) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, signer, config } = deps;
  const jwtSecret = config.JWT_PRIVATE_JWKS[0]?.d;
  if (!jwtSecret)
    throw new Error('Clé privée JWT absente : impossible de signer les jetons de liaison');
  const linkKey = deriveLinkKey(jwtSecret);

  r.post(
    '/v1/auth/discord/activity',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      // Le corps porte le code d'autorisation : jamais journalisé
      schema: {
        body: z.object({ code: z.string().min(1).max(512) }),
        response: { 200: ActivityResponse },
      },
    },
    async (req, reply) => {
      if (!client) throw HttpError.notFound('Connexion Discord non configurée');
      reply.header('cache-control', 'no-store');

      let echange: Awaited<ReturnType<ClientDiscord['echangerCodeActivite']>>;
      try {
        echange = await client.echangerCodeActivite(req.body.code);
      } catch (err) {
        if (!(err instanceof ErreurFournisseur)) throw err;
        req.log.warn({ cause: err.message }, 'échec de connexion depuis l’activité Discord');
        throw new HttpError(401, 'Non authentifié', 'discord_code_invalid', 'Code Discord refusé');
      }

      const compte = await resoudreCompte(db, eventContext(req), 'discord', echange.profil);
      if (compte.disabled) throw HttpError.forbidden('Compte désactivé');
      await journaliserConnexion(db, eventContext(req), 'discord', compte.userId);
      req.log.info({ userId: compte.userId, issue: compte.issue }, 'connexion activité Discord');

      return {
        accessToken: await signer.sign({ userId: compte.userId, roles: ['user'], rooms: {} }),
        tokenType: 'Bearer' as const,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: { id: compte.userId },
        discordAccessToken: echange.jeton,
      };
    },
  );

  const secret = config.INTERNAL_API_SECRET;
  if (secret) {
    r.post(
      '/internal/discord/delegate',
      {
        // Une demande par commande du bot
        config: { rateLimit: { max: 3000, timeWindow: '1 minute' } },
        // Secret vérifié avant la validation : rien ne fuit sans lui
        preValidation: async (req) => {
          const received = req.headers[EN_TETE_SECRET_INTERNE];
          if (!secretsEgaux(typeof received === 'string' ? received : undefined, secret)) {
            throw HttpError.unauthorized('Secret interne invalide');
          }
        },
        schema: {
          hide: true,
          body: z.object({ discordUserId: DiscordUserId }),
          response: {
            200: z.object({ accessToken: z.string(), expiresIn: z.number(), userId: z.string() }),
          },
        },
      },
      async (req) => {
        const [lien] = await db
          .select({ userId: users.id })
          .from(oauthAccounts)
          .innerJoin(users, eq(users.id, oauthAccounts.userId))
          .where(
            and(
              eq(oauthAccounts.provider, 'discord'),
              eq(oauthAccounts.providerAccountId, req.body.discordUserId),
              isNull(users.disabledAt),
            ),
          )
          .limit(1);
        if (!lien) throw new HttpError(404, 'Ressource introuvable', 'discord_not_linked');
        return {
          accessToken: await signer.sign({
            userId: lien.userId,
            roles: ['user'],
            rooms: {},
            ttlSeconds: DELEGATE_TTL_SECONDS,
            amr: ['discord-bot'],
          }),
          expiresIn: DELEGATE_TTL_SECONDS,
          userId: lien.userId,
        };
      },
    );

    r.post(
      '/internal/discord/link-token',
      {
        config: { rateLimit: { max: 3000, timeWindow: '1 minute' } },
        preValidation: async (req) => {
          const received = req.headers[EN_TETE_SECRET_INTERNE];
          if (!secretsEgaux(typeof received === 'string' ? received : undefined, secret)) {
            throw HttpError.unauthorized('Secret interne invalide');
          }
        },
        schema: {
          hide: true,
          body: z.object({
            discordUserId: DiscordUserId,
            discordName: z.string().max(100).nullable().optional(),
          }),
          response: { 200: z.object({ token: z.string(), expiresIn: z.number() }) },
        },
      },
      async (req) => ({
        token: await signLinkToken(linkKey, req.body.discordUserId, req.body.discordName ?? null),
        expiresIn: LINK_TOKEN_TTL_SECONDS,
      }),
    );
  }

  r.post(
    '/v1/auth/discord/link',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: {
        body: z.object({ token: z.string().min(1).max(2048) }),
        response: {
          200: z.object({ discordName: z.string().nullable(), linked: z.literal(true) }),
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId.toLowerCase();
      const claims = await verifyLinkToken(linkKey, req.body.token);
      if (!claims)
        throw new HttpError(
          400,
          'Requête invalide',
          'discord_link_invalid',
          'Lien expiré ou invalide : refais /link dans Discord',
        );
      await db.transaction(async (tx) => {
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
        const [existant] = await tx
          .select({ userId: oauthAccounts.userId })
          .from(oauthAccounts)
          .where(
            and(
              eq(oauthAccounts.provider, 'discord'),
              eq(oauthAccounts.providerAccountId, claims.discordUserId),
            ),
          );
        if (existant?.userId === userId) return; // déjà lié à ce compte : rien à faire
        if (existant)
          throw new HttpError(
            409,
            'Conflit',
            'discord_linked_elsewhere',
            'Ce compte Discord est déjà lié à un autre compte Yner',
          );
        const [autre] = await tx
          .select({ id: oauthAccounts.providerAccountId })
          .from(oauthAccounts)
          .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, 'discord')));
        if (autre)
          throw new HttpError(
            409,
            'Conflit',
            'discord_already_linked',
            'Ton compte Yner est déjà lié à un autre compte Discord : `/unlink` depuis celui-ci d’abord',
          );
        await tx
          .insert(oauthAccounts)
          .values({ provider: 'discord', providerAccountId: claims.discordUserId, userId });
        await appendEvent(tx, eventContext(req), {
          type: 'identity.oauth_linked',
          actor: { userId, role: 'user', characterId: null },
          aggregate: { type: 'user', id: userId },
          payload: { provider: 'discord', method: 'bot' },
        });
      });
      return { discordName: claims.discordName, linked: true as const };
    },
  );

  r.delete(
    '/v1/auth/discord/link',
    { preHandler: app.authenticate, schema: { response: { 204: z.null() } } },
    async (req, reply) => {
      const userId = req.user!.userId.toLowerCase();
      const retire = await db.transaction(async (tx) => {
        // Verrou du compte : deux retraits simultanés ne laissent pas un compte sans connexion
        await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
        const liens = await tx
          .select({ provider: oauthAccounts.provider })
          .from(oauthAccounts)
          .where(eq(oauthAccounts.userId, userId));
        if (!liens.some((l) => l.provider === 'discord')) return false;
        const [motDePasse] = await tx
          .select({ userId: credentials.userId })
          .from(credentials)
          .where(eq(credentials.userId, userId));
        if (!motDePasse && !liens.some((l) => l.provider !== 'discord')) {
          throw new HttpError(
            409,
            'Conflit',
            'last_login_method',
            'Seul moyen de connexion du compte : ajoutez un mot de passe avant de délier Discord',
          );
        }
        await tx
          .delete(oauthAccounts)
          .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, 'discord')));
        await tx
          .update(users)
          .set({ updatedAt: sql`now()` })
          .where(eq(users.id, userId));
        await appendEvent(tx, eventContext(req), {
          type: 'identity.oauth_unlinked',
          actor: { userId, role: 'user', characterId: null },
          aggregate: { type: 'user', id: userId },
          payload: { provider: 'discord' },
        });
        return true;
      });
      if (!retire) throw new HttpError(404, 'Ressource introuvable', 'discord_not_linked');
      return reply.code(204).send(null);
    },
  );
}

/** Module « discord » : client réel, si l'application Discord est configurée. */
export const register: Module = async (app, deps) => {
  await registerDiscord(app, deps, clientsDepuisConfig(deps.config).discord);
};
