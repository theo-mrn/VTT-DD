/**
 * Module « oauth » : connexion par Google (OpenID Connect) et Discord (OAuth2),
 * flux authorization code + PKCE (S256) + state.
 *
 * - GET /v1/auth/oauth/providers : fournisseurs configurés ;
 * - GET /v1/auth/oauth/:provider/start?redirect=/chemin : pose un cookie signé
 *   (state, code_verifier, nonce, chemin de retour) puis 302 vers le fournisseur ;
 * - GET /v1/auth/oauth/:provider/callback : vérifie state et cookie, échange le
 *   code, retrouve, rattache ou crée le compte, ouvre la session (cookie
 *   vtt_refresh, comme /v1/auth/login) puis 302 vers le front. Le front obtient
 *   ensuite son jeton d'accès par POST /v1/auth/refresh.
 *
 * Tout échec renvoie vers {APP_URL}/connexion?erreur=oauth, sans détail ; la
 * cause est journalisée sans code, jeton ni e-mail.
 */
import { HttpError } from '@vtt/platform';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, Module, ServiceApp } from '../../deps.js';
import { REFRESH_COOKIE } from '../../routes/auth.js';
import { startSession } from '../../tokens/refresh.js';
import { journaliserConnexion, resoudreCompte } from './comptes.js';
import {
  cheminDeRetour,
  deriverCleEtat,
  egalesSecretes,
  FOURNISSEURS,
  nouvelEtat,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  OAUTH_TTL_SECONDS,
  ouvrirEtat,
  scellerEtat,
  urlDuFront,
  type Fournisseur,
} from './etat.js';
import {
  clientsDepuisConfig,
  ErreurFournisseur,
  type ClientFournisseur,
  type ClientsFournisseurs,
} from './fournisseurs.js';

export type { ClientFournisseur, ClientsFournisseurs, ProfilFournisseur } from './fournisseurs.js';

/** Identique à routes/auth.ts : le cookie de session n'est lu que sous /v1/auth. */
const REFRESH_COOKIE_PATH = '/v1/auth';
export const CHEMIN_ERREUR = '/connexion?erreur=oauth';

/** Assez large pour quelques essais, assez serré contre l'abus des échanges de code. */
const LIMITE_OAUTH = { rateLimit: { max: 30, timeWindow: '1 minute' } };

const ParamsFournisseur = z.object({ provider: z.string().max(32) });

const RequeteRetour = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(256).optional(),
});

/** Journal de requête sans la chaîne de requête (code et state OAuth). */
function requeteSansParametres(req: FastifyRequest) {
  return { method: req.method, url: req.url.split('?')[0], remoteAddress: req.ip };
}

/** Échec attendu du parcours : sa raison est journalisée, jamais renvoyée. */
class EchecOAuth extends Error {
  constructor(public readonly raison: string) {
    super(raison);
    this.name = 'EchecOAuth';
  }
}

/** Enregistre les routes avec des clients fournis (réels ou simulés en test). */
export async function registerOAuth(app: ServiceApp, deps: Deps, clients: ClientsFournisseurs) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { config } = deps;

  const secret = config.JWT_PRIVATE_JWKS[0]?.d;
  if (!secret) throw new Error('Clé privée JWT absente : impossible de signer le cookie OAuth');
  const cle = deriverCleEtat(secret);

  const appUrl = config.APP_URL.replace(/\/+$/, '');
  const redirectUri = (f: Fournisseur) => `${appUrl}/v1/auth/oauth/${f}/callback`;

  const clientDe = (
    nom: string,
  ): { fournisseur: Fournisseur; client: ClientFournisseur } | null => {
    const fournisseur = FOURNISSEURS.find((f) => f === nom);
    const client = fournisseur ? clients[fournisseur] : undefined;
    return fournisseur && client ? { fournisseur, client } : null;
  };

  const contexte = (req: FastifyRequest) => ({
    correlationId: req.ctx.correlationId,
    traceparent: (req.headers.traceparent as string | undefined) ?? null,
  });

  function effacerCookieOAuth(reply: FastifyReply) {
    reply.clearCookie(OAUTH_COOKIE, {
      httpOnly: true,
      secure: config.COOKIE_SECURE,
      sameSite: 'lax',
      path: OAUTH_COOKIE_PATH,
    });
  }

  r.get(
    '/v1/auth/oauth/providers',
    {
      schema: {
        response: { 200: z.object({ google: z.boolean(), discord: z.boolean() }) },
      },
    },
    async () => ({ google: Boolean(clients.google), discord: Boolean(clients.discord) }),
  );

  r.get(
    '/v1/auth/oauth/:provider/start',
    {
      config: LIMITE_OAUTH,
      schema: {
        params: ParamsFournisseur,
        // Chemin invalide : remplacé par « / », pas d'erreur 400
        querystring: z.object({ redirect: z.unknown().optional() }),
      },
    },
    async (req, reply) => {
      const trouve = clientDe(req.params.provider);
      if (!trouve) throw HttpError.notFound('Fournisseur de connexion non configuré');

      const etat = nouvelEtat(trouve.fournisseur, cheminDeRetour(req.query.redirect));
      reply.setCookie(OAUTH_COOKIE, scellerEtat(cle, etat), {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        // Lax : le retour est une navigation depuis le site du fournisseur
        sameSite: 'lax',
        path: OAUTH_COOKIE_PATH,
        maxAge: OAUTH_TTL_SECONDS,
      });
      reply.header('cache-control', 'no-store');
      return reply.redirect(
        trouve.client.urlAutorisation({
          state: etat.state,
          codeVerifier: etat.codeVerifier,
          nonce: etat.nonce,
          redirectUri: redirectUri(trouve.fournisseur),
        }),
        302,
      );
    },
  );

  r.get(
    '/v1/auth/oauth/:provider/callback',
    {
      config: LIMITE_OAUTH,
      // L'URL porte le code d'autorisation : le journal de la requête n'en garde que le chemin.
      // Option de route prise en charge par Fastify mais absente de ses types.
      ...{ logSerializers: { req: requeteSansParametres } },
      schema: { params: ParamsFournisseur, hide: true },
    },
    async (req, reply) => {
      const trouve = clientDe(req.params.provider);
      if (!trouve) throw HttpError.notFound('Fournisseur de connexion non configuré');
      const { fournisseur, client } = trouve;

      // Le cookie est à usage unique, quel que soit le résultat
      const lecture = ouvrirEtat(cle, req.cookies[OAUTH_COOKIE]);
      effacerCookieOAuth(reply);
      reply.header('cache-control', 'no-store');

      try {
        if (!lecture.ok) throw new EchecOAuth(`cookie OAuth ${lecture.raison}`);
        const { etat } = lecture;
        if (etat.fournisseur !== fournisseur) throw new EchecOAuth('fournisseur différent');

        const requete = RequeteRetour.safeParse(req.query);
        if (!requete.success) throw new EchecOAuth('paramètres de retour invalides');
        const { code, state, error } = requete.data;
        if (error) {
          // Code d'erreur OAuth (ex. access_denied) : sûr à journaliser s'il en a la forme
          throw new EchecOAuth(
            `refus du fournisseur (${/^[a-z_]{1,64}$/.test(error) ? error : 'inconnu'})`,
          );
        }
        if (!state || !egalesSecretes(state, etat.state)) throw new EchecOAuth('state invalide');
        if (!code) throw new EchecOAuth('code absent');

        const profil = await client.echangerCode({
          code,
          codeVerifier: etat.codeVerifier,
          nonce: etat.nonce,
          redirectUri: redirectUri(fournisseur),
        });

        const compte = await resoudreCompte(deps.db, contexte(req), fournisseur, profil);
        if (compte.disabled) throw new EchecOAuth('compte désactivé');

        await journaliserConnexion(deps.db, contexte(req), fournisseur, compte.userId);
        const refresh = await startSession(deps.sessions, compte.userId, {
          userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
          ip: req.ip,
        });
        reply.setCookie(REFRESH_COOKIE, refresh.token, {
          httpOnly: true,
          secure: config.COOKIE_SECURE,
          sameSite: 'strict',
          path: REFRESH_COOKIE_PATH,
          expires: refresh.expiresAt,
        });
        req.log.info(
          { provider: fournisseur, userId: compte.userId, issue: compte.issue },
          'connexion OAuth réussie',
        );
        return reply.redirect(urlDuFront(appUrl, etat.retour), 302);
      } catch (err) {
        const cause =
          err instanceof EchecOAuth || err instanceof ErreurFournisseur
            ? err.message
            : // Erreur inattendue (base…) : son message peut citer une donnée, on n'en garde que la nature
              `erreur inattendue (${(err as Error)?.name ?? 'inconnue'}${
                (err as { code?: string })?.code ? ` ${(err as { code?: string }).code}` : ''
              })`;
        req.log.warn({ provider: fournisseur, cause }, 'échec de connexion OAuth');
        return reply.redirect(urlDuFront(appUrl, CHEMIN_ERREUR), 302);
      }
    },
  );
}

/** Module « oauth » : clients réels, pour les fournisseurs configurés. */
export const register: Module = async (app, deps) => {
  await registerOAuth(app, deps, clientsDepuisConfig(deps.config));
};
