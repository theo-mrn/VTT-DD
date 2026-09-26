/**
 * Module « personnages » : CRUD du propriétaire, saisie des valeurs, création
 * par étapes, achats, possessions, repos et actions (contrat :
 * docs/api-character.md). Toutes les routes demandent un jeton d'accès ;
 * seul le propriétaire voit et modifie ses personnages.
 */
import { HttpError } from '@vtt/platform';
import { achatsPossibles, etapesCreation } from '@vtt/rules';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import {
  acheterObjet,
  appliquerEtape,
  DemandePossession,
  etatInitial,
  modifierValeurs,
  poserPossession,
  rembourserLigne,
  reposer,
  resoudreAction,
  retirerPossession,
  terminer,
  Valeurs,
  verifierEtat,
} from '../../regles/operations.js';
import {
  creer,
  enregistrer,
  journaliserAction,
  lire,
  lister,
  modifier,
  supprimer,
  systemeDe,
  verrouiller,
  versApi,
  type Ligne,
} from './depot.js';

const IdPersonnage = z.uuid('Identifiant de personnage invalide').transform((s) => s.toLowerCase());
const Id = z.string().min(1).max(200);
const Version = z.number().int().positive();

const Params = z.object({ id: IdPersonnage });

const Personnage = z.object({
  id: z.string(),
  ownerId: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable(),
  etat: z.unknown(),
  fiche: z.unknown(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const Nom = z.string().trim().min(1, 'Nom requis').max(100, '100 caractères au plus');
const AvatarUrl = z.url({ protocol: /^https?$/, error: 'URL http(s) attendue' }).max(2048);

const contexte = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalogue } = deps;
  const moi = (req: FastifyRequest) => req.user!.userId.toLowerCase();
  // Jeton vérifié juste avant la validation du corps (un anonyme reçoit toujours
  // 401) et après les limites de débit (onRequest), qui comptent aussi les anonymes
  const auth = { preValidation: app.authenticate };
  const api = (ligne: Ligne) => versApi(catalogue, ligne);
  const date = () => deps.maintenant().toISOString();

  /**
   * Limite des actions (jets de dés tirés par le serveur), par IP comme la
   * limite globale. Types de @fastify/rate-limit non chargés ici, d'où la conversion.
   */
  const LIMITE_ACTIONS = {
    rateLimit: { max: deps.config.RATE_LIMIT_ACTIONS_MAX, timeWindow: '1 minute' },
  } as FastifyContextConfig;

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  r.get(
    '/v1/characters',
    {
      ...auth,
      schema: {
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              nom: z.string(),
              avatarUrl: z.string().nullable(),
              systeme: z.object({ id: z.string(), version: z.string() }),
              type: z.string(),
              creation: z.boolean(),
              updatedAt: z.string(),
            }),
          ),
        },
      },
    },
    async (req) => lister(db, moi(req)),
  );

  r.post(
    '/v1/characters',
    {
      ...auth,
      schema: {
        body: z.object({ systemeId: Id, type: Id, nom: Nom }),
        response: { 201: Personnage },
      },
    },
    async (req, reply) => {
      const systeme = catalogue.charge(req.body.systemeId);
      if (!systeme)
        throw HttpError.badRequest(`Système inconnu : ${req.body.systemeId}`, 'systeme_inconnu');
      const etat = verifierEtat(systeme, etatInitial(systeme, req.body.type)).etat;
      const ligne = await creer(db, contexte(req), moi(req), { nom: req.body.nom, etat });
      reply.code(201);
      return api(ligne);
    },
  );

  r.get(
    '/v1/characters/:id',
    { ...auth, schema: { params: Params, response: { 200: Personnage } } },
    async (req) => api(await lire(db, moi(req), req.params.id)),
  );

  r.patch(
    '/v1/characters/:id',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({
          version: Version,
          nom: Nom.optional(),
          avatarUrl: AvatarUrl.nullable().optional(),
        }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, nom, avatarUrl } = req.body;
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        version,
        () => ({
          changement: {
            ...(nom !== undefined ? { nom } : {}),
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          },
          operation: 'profil',
          details: {
            ...(nom !== undefined ? { nom } : {}),
            ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          },
        }),
      );
      return api(ligne);
    },
  );

  r.delete('/v1/characters/:id', { ...auth, schema: { params: Params } }, async (req, reply) => {
    await supprimer(db, contexte(req), moi(req), req.params.id);
    reply.code(204);
  });

  // ─── Valeurs saisies ───────────────────────────────────────────────────────

  r.put(
    '/v1/characters/:id/valeurs',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ version: Version, valeurs: Valeurs }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, valeurs } = req.body;
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        version,
        (l, systeme) => ({
          changement: { etat: modifierValeurs(systeme, l.etat, valeurs) },
          operation: 'valeurs',
          details: { valeurs },
        }),
      );
      return api(ligne);
    },
  );

  // ─── Création par étapes ───────────────────────────────────────────────────

  r.get(
    '/v1/characters/:id/creation',
    {
      ...auth,
      schema: {
        params: Params,
        response: {
          200: z.array(
            z.object({
              etape: z.unknown(),
              statut: z.enum(['faite', 'a-faire', 'invalide']),
              raisons: z.array(z.string()),
              budget: z.number().optional(),
              depense: z.number().optional(),
            }),
          ),
        },
      },
    },
    async (req) => {
      const ligne = await lire(db, moi(req), req.params.id);
      const systeme = systemeDe(catalogue, ligne);
      return etapesCreation(systeme, verifierEtat(systeme, ligne.etat).etat);
    },
  );

  // Route statique : prioritaire sur /creation/:etape
  r.post(
    '/v1/characters/:id/creation/terminer',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ version: Version }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        req.body.version,
        (l, systeme) => ({
          changement: { etat: terminer(systeme, l.etat) },
          operation: 'creation.terminer',
        }),
      );
      return api(ligne);
    },
  );

  r.post(
    '/v1/characters/:id/creation/:etape',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdPersonnage, etape: Id }),
        // Le reste du corps dépend du type de l'étape (lu par appliquerEtape)
        body: z.looseObject({ version: Version }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        req.body.version,
        (l, systeme) => {
          const r = appliquerEtape(
            systeme,
            l.etat,
            req.params.etape,
            req.body,
            deps.aleatoire(),
            date(),
          );
          return {
            changement: { etat: r.etat },
            operation: `creation.${req.params.etape}`,
            details: r.details,
          };
        },
      );
      return api(ligne);
    },
  );

  // ─── Achats ────────────────────────────────────────────────────────────────

  r.get(
    '/v1/characters/:id/achats',
    { ...auth, schema: { params: Params, response: { 200: z.array(z.unknown()) } } },
    async (req) => {
      const ligne = await lire(db, moi(req), req.params.id);
      return achatsPossibles(verifierEtat(systemeDe(catalogue, ligne), ligne.etat).fiche);
    },
  );

  r.post(
    '/v1/characters/:id/achats',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ version: Version, achat: Id, objet: z.string().min(1).max(400) }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, achat, objet } = req.body;
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        version,
        (l, systeme) => {
          const r = acheterObjet(systeme, l.etat, { achat, objet }, date());
          return { changement: { etat: r.etat }, operation: 'achat', details: r.details };
        },
      );
      return api(ligne);
    },
  );

  r.post(
    '/v1/characters/:id/achats/rembourser',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ version: Version, index: z.number().int().nonnegative() }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, index } = req.body;
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        version,
        (l, systeme) => {
          const r = rembourserLigne(systeme, l.etat, index);
          return { changement: { etat: r.etat }, operation: 'remboursement', details: r.details };
        },
      );
      return api(ligne);
    },
  );

  // ─── Possessions ───────────────────────────────────────────────────────────

  r.post(
    '/v1/characters/:id/possessions',
    {
      ...auth,
      schema: {
        params: Params,
        body: DemandePossession.extend({ version: Version }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, ...demande } = req.body;
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        version,
        (l, systeme) => ({
          changement: { etat: poserPossession(systeme, l.etat, demande) },
          operation: 'possession',
          details: { possession: demande },
        }),
      );
      return api(ligne);
    },
  );

  r.delete(
    '/v1/characters/:id/possessions/:entree',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdPersonnage, entree: Id }),
        querystring: z.object({ version: z.coerce.number().int().positive() }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        req.query.version,
        (l, systeme) => ({
          changement: { etat: retirerPossession(systeme, l.etat, req.params.entree) },
          operation: 'possession.retrait',
          details: { entree: req.params.entree },
        }),
      );
      return api(ligne);
    },
  );

  // ─── Repos ─────────────────────────────────────────────────────────────────

  r.post(
    '/v1/characters/:id/repos',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ version: Version, attributs: z.array(Id).max(200).optional() }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, attributs } = req.body;
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        moi(req),
        req.params.id,
        version,
        (l, systeme) => ({
          changement: { etat: reposer(verifierEtat(systeme, l.etat).fiche, attributs) },
          operation: 'repos',
          ...(attributs ? { details: { attributs } } : {}),
        }),
      );
      return api(ligne);
    },
  );

  // ─── Actions ───────────────────────────────────────────────────────────────

  r.post(
    '/v1/characters/:id/actions/:action',
    {
      ...auth,
      config: LIMITE_ACTIONS,
      schema: {
        params: z.object({ id: IdPersonnage, action: Id }),
        body: z
          .object({
            parametres: Valeurs.optional(),
            cibleId: IdPersonnage.optional(),
            appliquer: z.boolean().optional(),
          })
          .default({}),
        response: {
          200: z.object({
            resultat: z.unknown(),
            personnage: Personnage.optional(),
            cible: Personnage.optional(),
          }),
        },
      },
    },
    async (req) => {
      const owner = moi(req);
      const { id, action } = req.params;
      const { parametres, cibleId, appliquer = false } = req.body;
      const memeEntite = cibleId === id;
      const ids = cibleId && !memeEntite ? [id, cibleId] : [id];
      const ctx = contexte(req);

      return db.transaction(async (tx) => {
        // En lecture seule, pas de verrou ; pour appliquer, acteur et cible sont
        // verrouillés ensemble jusqu'à la fin de la transaction
        const lignes = appliquer
          ? await verrouiller(tx, owner, ids)
          : await Promise.all(ids.map((i) => lire(tx, owner, i)));
        const acteur = lignes[0]!;
        const cible = cibleId ? (memeEntite ? acteur : lignes[1]!) : undefined;

        const systeme = systemeDe(catalogue, acteur);
        if (cible && cible.systemId !== acteur.systemId)
          throw HttpError.badRequest(
            'La cible appartient à un autre système de jeu',
            'systeme_different',
          );
        const ficheActeur = verifierEtat(systeme, acteur.etat).fiche;
        const ficheCible = cible
          ? memeEntite
            ? ficheActeur
            : verifierEtat(systeme, cible.etat).fiche
          : undefined;

        const r = resoudreAction(systeme, {
          action,
          acteur: ficheActeur,
          ...(ficheCible ? { cible: ficheCible } : {}),
          memeEntite,
          ...(parametres ? { parametres } : {}),
          appliquer,
          aleatoire: deps.aleatoire(),
        });

        const details = { details: { action, cibleId: cibleId ?? null } };
        const acteurFinal = r.acteur
          ? await enregistrer(
              tx,
              ctx,
              catalogue,
              owner,
              acteur,
              { etat: r.acteur },
              { operation: 'action', ...details },
            )
          : acteur;
        const cibleFinale =
          r.cible && cible
            ? await enregistrer(
                tx,
                ctx,
                catalogue,
                owner,
                cible,
                { etat: r.cible },
                { operation: 'action.cible', ...details },
              )
            : cible;

        await journaliserAction(tx, ctx, owner, id, {
          action,
          cibleId: cibleId ?? null,
          applique: appliquer,
          resultat: r.resultat,
        });

        if (!appliquer) return { resultat: r.resultat };
        return {
          resultat: r.resultat,
          personnage: api(acteurFinal),
          ...(cibleFinale ? { cible: api(memeEntite ? acteurFinal : cibleFinale) } : {}),
        };
      });
    },
  );
};
