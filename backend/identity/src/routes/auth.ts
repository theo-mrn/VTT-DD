/**
 * Routes d'authentification : inscription, connexion, renouvellement,
 * déconnexion et JWKS (le profil courant est dans src/modules/profil).
 *
 * - Jeton d'accès (15 min) dans le corps de la réponse : le front le garde en
 *   mémoire, jamais dans le localStorage.
 * - Refresh token dans un cookie httpOnly, Secure, SameSite=Strict, limité à
 *   /v1/auth : inaccessible au JavaScript de la page.
 * - Les routes qui lisent ce cookie exigent l'en-tête x-vtt-csrf : un site
 *   tiers ne peut pas l'ajouter sans pré-vérification CORS, qui le refuse.
 */
import { HttpError, type createService } from '@vtt/platform';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createPasswordAccount,
  EmailAlreadyUsed,
  findLoginByEmail,
  replacePassword,
} from '../db/accounts.js';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import type { FirebaseScryptParams } from '../passwords/firebase-scrypt.js';
import { hashPassword, verifyPassword } from '../passwords/passwords.js';
import { ACCESS_TOKEN_TTL_SECONDS, type JwtSigner } from '../tokens/jwt.js';
import {
  endSession,
  rotateSession,
  startSession,
  type IssuedRefresh,
  type SessionStore,
} from '../tokens/refresh.js';

export const REFRESH_COOKIE = 'vtt_refresh';
export const CSRF_HEADER = 'x-vtt-csrf';
const COOKIE_PATH = '/v1/auth';

export interface AuthDeps {
  db: Db;
  sessions: SessionStore;
  signer: JwtSigner;
  firebase: FirebaseScryptParams | undefined;
  cookieSecure: boolean;
}

const Email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ message: 'Adresse e-mail invalide' }));

const TokenResponse = z.object({
  accessToken: z.string(),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number(),
  user: z.object({ id: z.string() }),
});

/** Limite stricte sur les routes exposées au bourrage d'identifiants. */
const LIMITE_SENSIBLE = { rateLimit: { max: 10, timeWindow: '1 minute' } };

const MESSAGE_ECHEC = 'E-mail ou mot de passe incorrect';

/** Instance renvoyée par createService (logger pino, fournisseur de types Zod). */
type ServiceApp = Awaited<ReturnType<typeof createService>>;

export async function registerAuthRoutes(app: ServiceApp, deps: AuthDeps) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Hash factice : un e-mail inconnu coûte le même temps qu'un mauvais mot de passe
  const hashFactice = hashPassword(crypto.randomUUID());

  const contexte = (req: FastifyRequest) => ({
    correlationId: req.ctx.correlationId,
    traceparent: (req.headers.traceparent as string | undefined) ?? null,
  });

  const client = (req: FastifyRequest) => ({
    userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
    ip: req.ip,
  });

  function poserCookie(reply: FastifyReply, refresh: IssuedRefresh) {
    reply.setCookie(REFRESH_COOKIE, refresh.token, {
      httpOnly: true,
      secure: deps.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: refresh.expiresAt,
    });
  }

  function effacerCookie(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: deps.cookieSecure,
      sameSite: 'strict',
      path: COOKIE_PATH,
    });
  }

  function exigerCsrf(req: FastifyRequest) {
    if (req.headers[CSRF_HEADER] !== '1') {
      throw HttpError.forbidden(`En-tête ${CSRF_HEADER} manquant`);
    }
  }

  async function ouvrirSession(req: FastifyRequest, reply: FastifyReply, userId: string) {
    const refresh = await startSession(deps.sessions, userId, client(req));
    poserCookie(reply, refresh);
    return {
      accessToken: await deps.signer.sign({ userId, roles: ['user'], rooms: {} }),
      tokenType: 'Bearer' as const,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user: { id: userId },
    };
  }

  // Clés publiques, lues par la gateway et tous les services
  r.get('/.well-known/jwks.json', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300');
    return deps.signer.jwks();
  });

  r.post(
    '/v1/auth/register',
    {
      config: LIMITE_SENSIBLE,
      schema: {
        body: z.object({
          email: Email,
          password: z.string().min(8, 'Au moins 8 caractères').max(128),
          name: z.string().trim().min(1).max(64),
        }),
        response: { 201: TokenResponse },
      },
    },
    async (req, reply) => {
      let userId: string;
      try {
        userId = await createPasswordAccount(deps.db, contexte(req), {
          email: req.body.email,
          name: req.body.name,
          password: await hashPassword(req.body.password),
        });
      } catch (err) {
        if (err instanceof EmailAlreadyUsed) {
          throw HttpError.conflict('Un compte existe déjà avec cet e-mail', 'email_taken');
        }
        throw err;
      }
      reply.code(201);
      return ouvrirSession(req, reply, userId);
    },
  );

  r.post(
    '/v1/auth/login',
    {
      config: LIMITE_SENSIBLE,
      schema: {
        // Pas de longueur minimale ici : les comptes importés peuvent avoir 6 caractères
        body: z.object({ email: Email, password: z.string().min(1).max(128) }),
        response: { 200: TokenResponse },
      },
    },
    async (req, reply) => {
      const compte = await findLoginByEmail(deps.db, req.body.email);

      if (!compte?.password) {
        await verifyPassword(await hashFactice, req.body.password, undefined);
        throw HttpError.unauthorized(MESSAGE_ECHEC);
      }

      const { ok, needsRehash } = await verifyPassword(
        compte.password,
        req.body.password,
        deps.firebase,
      );
      if (!ok) throw HttpError.unauthorized(MESSAGE_ECHEC);
      // Vérifié après le mot de passe : ne révèle pas l'existence du compte
      if (compte.disabled) throw HttpError.forbidden('Compte désactivé');

      if (needsRehash) {
        // Compte importé de Firebase (ou paramètres argon2 renforcés) : bascule transparente
        try {
          const nouveau = await hashPassword(req.body.password);
          if (nouveau.algorithm === 'argon2id') {
            await replacePassword(deps.db, contexte(req), compte.userId, nouveau, 'rehash');
          }
        } catch (err) {
          req.log.error({ err, userId: compte.userId }, 'rehash impossible, connexion maintenue');
        }
      }

      await deps.db.transaction((tx) =>
        appendEvent(tx, contexte(req), {
          type: 'identity.user_logged_in',
          actor: { userId: compte.userId, role: 'user', characterId: null },
          aggregate: { type: 'user', id: compte.userId },
          payload: { method: 'password' },
        }),
      );
      return ouvrirSession(req, reply, compte.userId);
    },
  );

  r.post(
    '/v1/auth/refresh',
    { schema: { response: { 200: TokenResponse } } },
    async (req, reply) => {
      exigerCsrf(req);
      const jeton = req.cookies[REFRESH_COOKIE];
      if (!jeton) throw HttpError.unauthorized('Session absente');

      const resultat = await rotateSession(deps.sessions, jeton, client(req));
      if (!resultat.ok) {
        effacerCookie(reply);
        if (resultat.reason === 'reused') {
          req.log.warn({ reason: resultat.reason }, 'refresh token réutilisé : famille révoquée');
        }
        throw HttpError.unauthorized('Session expirée, reconnectez-vous');
      }
      poserCookie(reply, resultat);
      return {
        accessToken: await deps.signer.sign({
          userId: resultat.userId,
          roles: ['user'],
          rooms: {},
        }),
        tokenType: 'Bearer' as const,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: { id: resultat.userId },
      };
    },
  );

  r.post('/v1/auth/logout', async (req, reply) => {
    exigerCsrf(req);
    const jeton = req.cookies[REFRESH_COOKIE];
    if (jeton) await endSession(deps.sessions, jeton);
    effacerCookie(reply);
    reply.code(204);
  });
}
