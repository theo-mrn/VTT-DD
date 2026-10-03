/**
 * Module « securite » : sessions actives, déconnexion de tous les appareils,
 * changement et réinitialisation du mot de passe, vérification de l'adresse
 * e-mail, suppression du compte.
 *
 * - Les liens envoyés par e-mail portent un jeton aléatoire à usage unique ;
 *   seul son SHA-256 est stocké.
 * - « Mot de passe oublié » répond toujours 202, dans un temps comparable,
 *   que l'adresse existe ou non : aucune énumération des comptes.
 * - Aucune adresse, aucun mot de passe ni jeton dans les logs ou les événements.
 */
import { HttpError } from '@vtt/platform';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { hashPassword, verifyPassword, type StoredPassword } from '../../passwords/passwords.js';
import { CSRF_HEADER, REFRESH_COOKIE } from '../../routes/auth.js';
import {
  changerMotDePasse,
  demanderReinitialisation,
  demanderVerification,
  familleDuJeton,
  lireMotDePasse,
  listerFamilles,
  reinitialiserMotDePasse,
  revoquerFamille,
  revoquerToutes,
  supprimerCompte,
  verifierEmail,
} from './depot.js';
import {
  attendrePlancher,
  echeanceJeton,
  empreinteJeton,
  lienJeton,
  nouveauJeton,
} from './jetons.js';
import { mailReinitialisation, mailVerification } from './mails.js';

/** Même chemin que le cookie posé par routes/auth.ts. */
const COOKIE_PATH = '/v1/auth';

/**
 * Limite stricte, comme les routes de connexion. Sur ces routes, app.authenticate
 * est enveloppé dans une fonction fléchée : passé tel quel, il fige le type de
 * `config` de la route et TypeScript refuse `rateLimit`.
 */
const LIMITE_SENSIBLE = { rateLimit: { max: 10, timeWindow: '1 minute' } };

/** Durée minimale de « mot de passe oublié », que le compte existe ou non. */
const PLANCHER_OUBLI_MS = 250;

const Email = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email({ message: 'Adresse e-mail invalide' }));

const NouveauMotDePasse = z.string().min(8, 'Au moins 8 caractères').max(128);
const Jeton = z.string().min(1).max(256);

const Session = z.object({
  id: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  current: z.boolean(),
});

const JETON_INVALIDE = 'Lien invalide ou expiré';

const motDePasseIncorrect = () =>
  new HttpError(403, 'Accès refusé', 'invalid_password', 'Mot de passe incorrect');

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const contexte = (req: FastifyRequest) => ({
    correlationId: req.ctx.correlationId,
    traceparent: (req.headers.traceparent as string | undefined) ?? null,
  });

  function effacerCookie(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: deps.config.COOKIE_SECURE,
      sameSite: 'strict',
      path: COOKIE_PATH,
    });
  }

  function exigerCsrf(req: FastifyRequest) {
    if (req.headers[CSRF_HEADER] !== '1') {
      throw HttpError.forbidden(`En-tête ${CSRF_HEADER} manquant`);
    }
  }

  /** Envoi sans bloquer la réponse ; l'erreur est journalisée sans l'adresse. */
  function envoyerEnArrierePlan(
    req: FastifyRequest,
    userId: string,
    envoi: () => Promise<void>,
  ): void {
    envoi().catch((err: unknown) => {
      req.log.error(
        { userId, code: (err as { code?: unknown })?.code ?? null },
        'envoi d’e-mail impossible',
      );
    });
  }

  /** Vérifie le mot de passe actuel ; lève 403 s'il est faux. */
  async function verifierActuel(stocke: StoredPassword, saisi: string) {
    const { ok } = await verifyPassword(stocke, saisi, deps.firebase);
    if (!ok) throw motDePasseIncorrect();
  }

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------

  r.get(
    '/v1/auth/sessions',
    {
      preHandler: app.authenticate,
      schema: { response: { 200: z.array(Session) } },
    },
    async (req) => {
      const userId = req.user!.userId;
      const [familles, courante] = await Promise.all([
        listerFamilles(deps.db, userId),
        familleDuJeton(deps.db, userId, req.cookies[REFRESH_COOKIE]),
      ]);
      return familles.map((f) => ({
        id: f.id,
        createdAt: f.createdAt.toISOString(),
        lastUsedAt: f.lastUsedAt.toISOString(),
        userAgent: f.userAgent,
        ip: f.ip,
        current: f.id === courante,
      }));
    },
  );

  r.delete(
    '/v1/auth/sessions/:id',
    {
      preHandler: app.authenticate,
      schema: { params: z.object({ id: z.uuid() }) },
    },
    async (req, reply) => {
      const ok = await revoquerFamille(deps.db, contexte(req), req.user!.userId, req.params.id);
      if (!ok) throw HttpError.notFound('Session introuvable');
      reply.code(204);
    },
  );

  r.post('/v1/auth/logout-all', { preHandler: app.authenticate }, async (req, reply) => {
    exigerCsrf(req);
    await revoquerToutes(deps.db, contexte(req), req.user!.userId);
    effacerCookie(reply);
    reply.code(204);
  });

  // ------------------------------------------------------------------
  // Mot de passe
  // ------------------------------------------------------------------

  r.post(
    '/v1/auth/password',
    {
      config: LIMITE_SENSIBLE,
      preHandler: (req, reply) => app.authenticate(req, reply),
      schema: {
        body: z.object({
          currentPassword: z.string().min(1).max(128),
          newPassword: NouveauMotDePasse,
        }),
      },
    },
    async (req, reply) => {
      const userId = req.user!.userId;
      const stocke = await lireMotDePasse(deps.db, userId);
      if (!stocke) {
        throw HttpError.badRequest(
          'Ce compte n’a pas de mot de passe : utilisez « Mot de passe oublié » pour en définir un',
          'no_password',
        );
      }
      await verifierActuel(stocke, req.body.currentPassword);

      const nouveau = await hashPassword(req.body.newPassword);
      if (nouveau.algorithm !== 'argon2id') throw new Error('hash argon2id attendu');
      // L'appareil courant reste connecté ; les autres sont déconnectés
      const courante = await familleDuJeton(deps.db, userId, req.cookies[REFRESH_COOKIE]);
      await changerMotDePasse(deps.db, contexte(req), userId, nouveau, courante);
      reply.code(204);
    },
  );

  r.post(
    '/v1/auth/password/forgot',
    {
      config: LIMITE_SENSIBLE,
      schema: { body: z.object({ email: Email }) },
    },
    async (req, reply) => {
      const debut = Date.now();
      const { jeton, empreinte } = nouveauJeton();
      const cible = await demanderReinitialisation(deps.db, contexte(req), req.body.email, {
        empreinte,
        echeance: echeanceJeton('password_reset'),
      });
      if (cible) {
        const lien = lienJeton(deps.config.APP_URL, 'password_reset', jeton);
        envoyerEnArrierePlan(req, cible.userId, () =>
          deps.mailer.envoyer(mailReinitialisation(cible.email, lien)),
        );
      }
      await attendrePlancher(debut, PLANCHER_OUBLI_MS);
      reply.code(202);
    },
  );

  r.post(
    '/v1/auth/password/reset',
    {
      config: LIMITE_SENSIBLE,
      schema: { body: z.object({ token: Jeton, newPassword: NouveauMotDePasse }) },
    },
    async (req, reply) => {
      const nouveau = await hashPassword(req.body.newPassword);
      if (nouveau.algorithm !== 'argon2id') throw new Error('hash argon2id attendu');
      const ok = await reinitialiserMotDePasse(
        deps.db,
        contexte(req),
        empreinteJeton(req.body.token),
        nouveau,
      );
      if (!ok) throw HttpError.badRequest(JETON_INVALIDE, 'invalid_token');
      // Toutes les sessions sont révoquées, y compris celle de ce navigateur
      effacerCookie(reply);
      reply.code(204);
    },
  );

  // ------------------------------------------------------------------
  // Vérification de l'adresse e-mail
  // ------------------------------------------------------------------

  r.post(
    '/v1/auth/email/verification',
    { config: LIMITE_SENSIBLE, preHandler: (req, reply) => app.authenticate(req, reply) },
    async (req, reply) => {
      const userId = req.user!.userId;
      const { jeton, empreinte } = nouveauJeton();
      const resultat = await demanderVerification(deps.db, contexte(req), userId, {
        empreinte,
        echeance: echeanceJeton('email_verification'),
      });
      if (!resultat.ok) {
        if (resultat.raison === 'deja_verifie') {
          throw HttpError.conflict('Adresse e-mail déjà vérifiée', 'already_verified');
        }
        if (resultat.raison === 'sans_email') {
          throw HttpError.badRequest('Aucune adresse e-mail sur ce compte', 'no_email');
        }
        throw HttpError.notFound('Compte introuvable');
      }
      const lien = lienJeton(deps.config.APP_URL, 'email_verification', jeton);
      envoyerEnArrierePlan(req, userId, () =>
        deps.mailer.envoyer(mailVerification(resultat.email, lien)),
      );
      reply.code(202);
    },
  );

  r.post(
    '/v1/auth/email/verify',
    {
      config: LIMITE_SENSIBLE,
      schema: { body: z.object({ token: Jeton }) },
    },
    async (req, reply) => {
      const ok = await verifierEmail(deps.db, contexte(req), empreinteJeton(req.body.token));
      if (!ok) throw HttpError.badRequest(JETON_INVALIDE, 'invalid_token');
      reply.code(204);
    },
  );

  // ------------------------------------------------------------------
  // Suppression du compte
  // ------------------------------------------------------------------

  r.delete(
    '/v1/users/me',
    {
      config: LIMITE_SENSIBLE,
      preHandler: (req, reply) => app.authenticate(req, reply),
      schema: {
        // Corps facultatif : un compte sans mot de passe n'a rien à envoyer
        body: z.object({ password: z.string().min(1).max(128).optional() }).nullish(),
      },
    },
    async (req, reply) => {
      const userId = req.user!.userId;
      const stocke = await lireMotDePasse(deps.db, userId);
      if (stocke) {
        const saisi = req.body?.password;
        if (!saisi) {
          throw HttpError.badRequest(
            'Mot de passe requis pour supprimer le compte',
            'password_required',
          );
        }
        await verifierActuel(stocke, saisi);
      }
      const ok = await supprimerCompte(deps.db, contexte(req), userId);
      if (!ok) throw HttpError.notFound('Compte introuvable');
      effacerCookie(reply);
      reply.code(204);
    },
  );
};
