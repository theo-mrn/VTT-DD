/**
 * Module « profil » : profil du compte connecté (lecture, modification,
 * envoi d'images), profils publics, recherche de joueurs et temps de jeu.
 */
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, Module, ServiceApp } from '../../deps.js';
import { debloquerTitresParTemps } from '../titres/service.js';
import {
  ajouterTempsDeJeu,
  lireMonProfil,
  lireProfilPublic,
  modifierProfil,
  rechercherProfils,
  UrlImageRefusee,
} from './depot.js';
import { cleFichier, creerSignataireS3, EXPIRATION_ENVOI, type Signataire } from './stockage.js';
import {
  AjoutTemps,
  basePublique,
  DemandeEnvoi,
  PatchProfil,
  RechercheUtilisateurs,
} from './validation.js';

const MonProfilReponse = z.object({
  id: z.string(),
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  borderType: z.string(),
  showPremiumBadge: z.boolean(),
  timeSpentMinutes: z.number(),
  emailNotifications: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  hasPassword: z.boolean(),
  providers: z.array(z.enum(['google', 'discord'])),
  createdAt: z.string(),
});

const ProfilPublicReponse = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  title: z.string().nullable(),
  bio: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  borderType: z.string(),
  premium: z.literal(false),
  showPremiumBadge: z.boolean(),
  timeSpentMinutes: z.number(),
});

const ResultatRechercheReponse = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
    title: z.string().nullable(),
  }),
);

/** Limite par IP des routes appelées en boucle par le front (envois, temps de jeu). */
const LIMITE_PAR_MINUTE = { rateLimit: { max: 20, timeWindow: '1 minute' } };

const stockageIndisponible = () =>
  new HttpError(
    503,
    'Service indisponible',
    'storage_unavailable',
    "L'envoi d'images n'est pas configuré sur ce serveur",
  );

const contexte = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

/** Enregistre les routes du profil ; le signataire d'URL est injectable (tests). */
export async function registerProfil(
  app: ServiceApp,
  deps: Pick<Deps, 'config' | 'db'>,
  signataire: Signataire | undefined,
): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const base = basePublique(deps.config.S3_PUBLIC_URL);

  async function monProfil(userId: string) {
    const profil = await lireMonProfil(deps.db, userId);
    if (!profil) throw HttpError.notFound('Profil introuvable');
    return profil;
  }

  r.get(
    '/v1/users/me',
    { preHandler: app.authenticate, schema: { response: { 200: MonProfilReponse } } },
    async (req) => monProfil(req.user!.userId),
  );

  r.patch(
    '/v1/users/me',
    {
      preHandler: app.authenticate,
      schema: { body: PatchProfil, response: { 200: MonProfilReponse } },
    },
    async (req) => {
      const userId = req.user!.userId;
      let champs: string[] | null;
      try {
        champs = await modifierProfil(deps.db, contexte(req), userId, req.body, base);
      } catch (err) {
        if (err instanceof UrlImageRefusee) {
          throw HttpError.badRequest(
            "L'image doit avoir été envoyée par POST /v1/users/me/uploads",
            'invalid_image_url',
          );
        }
        throw err;
      }
      if (champs === null) throw HttpError.notFound('Profil introuvable');
      return monProfil(userId);
    },
  );

  r.post(
    '/v1/users/me/uploads',
    {
      config: LIMITE_PAR_MINUTE,
      // Fonction fléchée : passer app.authenticate tel quel fige le type de `config` sans rateLimit
      preHandler: (req, reply) => app.authenticate(req, reply),
      schema: {
        body: DemandeEnvoi,
        response: {
          200: z.object({ uploadUrl: z.string(), publicUrl: z.string(), expiresIn: z.number() }),
        },
      },
    },
    async (req) => {
      if (!signataire || !base) throw stockageIndisponible();
      const { kind, contentType, size } = req.body;
      const cle = cleFichier(req.user!.userId, kind, contentType);
      let uploadUrl: string;
      try {
        uploadUrl = await signataire({
          cle,
          contentType,
          taille: size,
          expiresIn: EXPIRATION_ENVOI,
        });
      } catch (err) {
        req.log.error({ err }, 'signature de l’URL d’envoi impossible');
        throw stockageIndisponible();
      }
      return { uploadUrl, publicUrl: `${base}/${cle}`, expiresIn: EXPIRATION_ENVOI };
    },
  );

  r.post(
    '/v1/users/me/time',
    {
      config: LIMITE_PAR_MINUTE,
      // Fonction fléchée : passer app.authenticate tel quel fige le type de `config` sans rateLimit
      preHandler: (req, reply) => app.authenticate(req, reply),
      schema: {
        body: AjoutTemps,
        response: {
          200: z.object({ timeSpentMinutes: z.number(), unlockedTitles: z.array(z.string()) }),
        },
      },
    },
    async (req) => {
      const userId = req.user!.userId;
      const total = await ajouterTempsDeJeu(deps.db, contexte(req), userId, req.body.minutes);
      if (total === null) throw HttpError.notFound('Profil introuvable');
      // Le temps est déjà enregistré : un échec ici ne doit pas faire renvoyer l'ajout
      // (il serait compté deux fois) ; les titres seront débloqués au prochain appel.
      let unlockedTitles: string[] = [];
      try {
        unlockedTitles = await debloquerTitresParTemps(deps.db, userId, total);
      } catch (err) {
        req.log.error({ err, userId }, 'déblocage des titres par temps impossible');
      }
      return { timeSpentMinutes: total, unlockedTitles };
    },
  );

  r.get(
    '/v1/users/:id',
    {
      preHandler: app.authenticate,
      schema: { params: z.object({ id: z.uuid() }), response: { 200: ProfilPublicReponse } },
    },
    async (req) => {
      const profil = await lireProfilPublic(deps.db, req.params.id);
      if (!profil) throw HttpError.notFound('Utilisateur introuvable');
      return profil;
    },
  );

  r.get(
    '/v1/users',
    {
      preHandler: app.authenticate,
      schema: { querystring: RechercheUtilisateurs, response: { 200: ResultatRechercheReponse } },
    },
    async (req) => rechercherProfils(deps.db, req.user!.userId, req.query.search, req.query.limit),
  );
}

export const register: Module = async (app, deps) => {
  await registerProfil(app, deps, creerSignataireS3(deps.config));
};
