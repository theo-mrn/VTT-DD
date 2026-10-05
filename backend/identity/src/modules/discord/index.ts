/**
 * Module « discord » (docs/discord.md) : connexion depuis l'activité Discord, et lien du bot de
 * dés, distinct de la connexion (délier le bot ne retire jamais un moyen de connexion).
 *
 *   POST /v1/auth/discord/activity     { code }  code du SDK de l'activité (sans PKCE ni
 *        redirection) → jeton d'accès, sans cookie de renouvellement (jamais envoyé dans
 *        l'iframe) ; le jeton Discord est rendu pour `authenticate` côté SDK. Même logique de
 *        compte que la connexion Discord du site (comptes.ts).
 *   POST /v1/auth/discord/link         { token }  joueur connecté (tout moyen de connexion) : le
 *        bot agira pour ce compte, même si cette identité Discord sert à se connecter à un autre.
 *
 * Réservées au service discord (secret interne) :
 *   POST /internal/discord/delegate    { discordUserId }  jeton de 60 s (amr discord-bot) pour le
 *        compte du bot : lien explicite (discord_bot_links), sinon le compte connecté avec
 *        Discord ; 404 sans compte ou après /unlink.
 *   POST /internal/discord/link-token  { discordUserId, discordName }  jeton de liaison de 10 min,
 *        remis au joueur par /link.
 *   POST /internal/discord/unlink      { discordUserId }  /unlink : le bot n'agit plus pour cet
 *        identifiant ; la connexion Discord du site reste intacte.
 */
import { HttpError } from '@vtt/platform';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import { appendEvent, type EventContext } from '../../db/outbox.js';
import { discordBotLinks, oauthAccounts, users } from '../../db/schema.js';
import type { Deps, Module, ServiceApp } from '../../deps.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../tokens/jwt.js';
import { secretsEgaux } from '../cles-api/cles.js';
import { EN_TETE_SECRET_INTERNE } from '../cles-api/index.js';
import { journaliserConnexion, resoudreCompte } from '../oauth/comptes.js';
import { cancelDeletion, touchLastSeen } from '../securite/account-lifecycle.js';
import {
  clientsDepuisConfig,
  ErreurFournisseur,
  type ClientDiscord,
} from '../oauth/fournisseurs.js';
import {
  deriveLinkKey,
  LINK_TOKEN_TTL_SECONDS,
  signLinkToken,
  verifyLinkToken,
} from './link-token.js';

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

/**
 * Compte pour lequel le bot agit : lien explicite (/link, /unlink) s'il y en a un, sinon le
 * compte connecté avec cette identité Discord. null : aucun, ou compte désactivé.
 */
export async function botAccount(db: Db, discordUserId: string): Promise<string | null> {
  const [explicit] = await db
    .select({ userId: discordBotLinks.userId })
    .from(discordBotLinks)
    .where(eq(discordBotLinks.discordUserId, discordUserId));
  const query = explicit
    ? explicit.userId
      ? db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.id, explicit.userId),
              isNull(users.disabledAt),
              isNull(users.deletionRequestedAt),
            ),
          )
      : null
    : db
        .select({ id: users.id })
        .from(oauthAccounts)
        .innerJoin(users, eq(users.id, oauthAccounts.userId))
        .where(
          and(
            eq(oauthAccounts.provider, 'discord'),
            eq(oauthAccounts.providerAccountId, discordUserId),
            isNull(users.disabledAt),
            isNull(users.deletionRequestedAt),
          ),
        );
  if (!query) return null;
  const [row] = await query.limit(1);
  return row?.id ?? null;
}

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

  /** Pose (ou retire, userId null) le lien du bot, avec son événement. */
  async function setBotLink(
    req: FastifyRequest,
    discordUserId: string,
    userId: string | null,
    actor: string | null,
  ) {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ userId: discordBotLinks.userId })
        .from(discordBotLinks)
        .where(eq(discordBotLinks.discordUserId, discordUserId))
        .for('update');
      await tx
        .insert(discordBotLinks)
        .values({ discordUserId, userId })
        .onConflictDoUpdate({
          target: discordBotLinks.discordUserId,
          set: { userId, updatedAt: sql`now()` },
        });
      // Événement sur le compte concerné, sans l'identifiant Discord
      const account = userId ?? before?.userId ?? actor;
      if (!account) return;
      await appendEvent(tx, eventContext(req), {
        type: userId ? 'identity.discord_bot_linked' : 'identity.discord_bot_unlinked',
        actor: actor
          ? { userId: actor, role: 'user', characterId: null }
          : { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'user', id: account },
        visibility: 'owner',
        payload: {},
      });
    });
  }

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
      // Se reconnecter annule une suppression demandée (docs/legal.md)
      await cancelDeletion(db, eventContext(req), compte.userId);
      await touchLastSeen(db, compte.userId);
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
      await setBotLink(req, claims.discordUserId, userId, userId);
      return { discordName: claims.discordName, linked: true as const };
    },
  );

  const secret = config.INTERNAL_API_SECRET;
  if (!secret) return;
  const internal = {
    // Une demande par commande du bot
    config: { rateLimit: { max: 3000, timeWindow: '1 minute' } } as FastifyContextConfig,
    // Secret vérifié avant la validation : rien ne fuit sans lui
    preValidation: async (req: FastifyRequest) => {
      const received = req.headers[EN_TETE_SECRET_INTERNE];
      if (!secretsEgaux(typeof received === 'string' ? received : undefined, secret)) {
        throw HttpError.unauthorized('Secret interne invalide');
      }
    },
  };

  r.post(
    '/internal/discord/delegate',
    {
      ...internal,
      schema: {
        hide: true,
        body: z.object({ discordUserId: DiscordUserId }),
        response: {
          200: z.object({ accessToken: z.string(), expiresIn: z.number(), userId: z.string() }),
        },
      },
    },
    async (req) => {
      const userId = await botAccount(db, req.body.discordUserId);
      if (!userId) throw new HttpError(404, 'Ressource introuvable', 'discord_not_linked');
      return {
        accessToken: await signer.sign({
          userId,
          roles: ['user'],
          rooms: {},
          ttlSeconds: DELEGATE_TTL_SECONDS,
          amr: ['discord-bot'],
        }),
        expiresIn: DELEGATE_TTL_SECONDS,
        userId,
      };
    },
  );

  r.post(
    '/internal/discord/link-token',
    {
      ...internal,
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

  r.post(
    '/internal/discord/unlink',
    {
      ...internal,
      schema: {
        hide: true,
        body: z.object({ discordUserId: DiscordUserId }),
        response: { 200: z.object({ unlinked: z.boolean() }) },
      },
    },
    async (req) => {
      const linked = await botAccount(db, req.body.discordUserId);
      await setBotLink(req, req.body.discordUserId, null, linked);
      return { unlinked: linked !== null };
    },
  );
}

/** Module « discord » : client réel, si l'application Discord est configurée. */
export const register: Module = async (app, deps) => {
  await registerDiscord(app, deps, clientsDepuisConfig(deps.config).discord);
};
