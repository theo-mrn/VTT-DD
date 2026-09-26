/**
 * Module « interne » : routes appelées par le service campaign, jamais
 * relayées par la gateway (qui refuse tout /internal/*). Pas de jeton
 * utilisateur : le secret partagé INTERNAL_API_SECRET (en-tête
 * x-internal-secret) est exigé. Sans ce secret configuré, les routes
 * n'existent pas.
 *
 *   GET  /internal/characters/:id                    résumé (propriétaire, système)
 *   POST /internal/characters/:id/actions/:action    action jouée par le serveur
 *        (initiative d'un combat : la réponse porte les clés de tri `cles`)
 *   POST /internal/characters/:id/durees/decompter   fin de round : durées -1,
 *        possessions arrivées à 0 retirées
 */
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { exigerSecretInterne } from '../../interne/secret.js';
import { decompterDurees, Valeurs } from '../../regles/operations.js';
import { jouerAction } from '../personnages/actions.js';
import { enregistrer, lire, verrouiller, versApi, type Appelant } from '../personnages/depot.js';

const IdPersonnage = z.uuid('Identifiant de personnage invalide').transform((s) => s.toLowerCase());
const IdUtilisateur = z.uuid().transform((s) => s.toLowerCase());
const Id = z.string().min(1).max(200);

/** Qui a déclenché l'appel (MJ de la salle), pour les événements. */
const Origine = z.object({
  userId: IdUtilisateur.optional(),
  roomId: z
    .uuid()
    .transform((s) => s.toLowerCase())
    .optional(),
});

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

const contexte = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

const appelant = (o: z.output<typeof Origine>): Appelant => ({
  userId: o.userId ?? null,
  role: o.userId ? 'gm' : 'system',
  roomId: o.roomId ?? null,
});

export const register: Module = async (app, deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) {
    app.log.warn('INTERNAL_API_SECRET absent : routes internes (combat de campaign) désactivées');
    return;
  }
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalogue } = deps;

  const interne = {
    // Secret vérifié avant la validation du corps : rien ne fuit sans lui
    preValidation: exigerSecretInterne(secret),
    // Toutes les requêtes viennent de campaign (peu d'IP) : limite large
    config: { rateLimit: { max: 3000, timeWindow: '1 minute' } } as FastifyContextConfig,
  };

  r.get(
    '/internal/characters/:id',
    {
      ...interne,
      schema: {
        hide: true,
        params: z.object({ id: IdPersonnage }),
        response: {
          200: z.object({
            id: z.string(),
            ownerId: z.string(),
            nom: z.string(),
            avatarUrl: z.string().nullable(),
            systeme: z.object({ id: z.string(), version: z.string() }),
            type: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const l = await lire(db, req.params.id);
      return {
        id: l.id,
        ownerId: l.ownerId,
        nom: l.nom,
        avatarUrl: l.avatarUrl,
        systeme: { id: l.systemId, version: l.systemVersion },
        type: l.type,
      };
    },
  );

  r.post(
    '/internal/characters/:id/actions/:action',
    {
      ...interne,
      schema: {
        hide: true,
        params: z.object({ id: IdPersonnage, action: Id }),
        body: Origine.extend({
          parametres: Valeurs.optional(),
          cibleId: IdPersonnage.optional(),
          appliquer: z.boolean().optional(),
        }).default({}),
        response: {
          200: z.object({
            resultat: z.unknown(),
            cles: z.array(z.number()).optional(),
            personnage: Personnage.optional(),
            cible: Personnage.optional(),
          }),
        },
      },
    },
    async (req) => {
      const { parametres, cibleId, appliquer = false, ...origine } = req.body;
      return jouerAction(deps, contexte(req), appelant(origine), {
        id: req.params.id,
        action: req.params.action,
        ...(parametres ? { parametres } : {}),
        ...(cibleId ? { cibleId } : {}),
        appliquer,
      });
    },
  );

  r.post(
    '/internal/characters/:id/durees/decompter',
    {
      ...interne,
      schema: {
        hide: true,
        params: z.object({ id: IdPersonnage }),
        body: Origine.default({}),
        response: {
          200: z.object({
            modifie: z.boolean(),
            retirees: z.array(z.string()),
            version: z.number().int(),
            personnage: Personnage.optional(),
          }),
        },
      },
    },
    async (req) => {
      const ctx = contexte(req);
      return db.transaction(async (tx) => {
        const [ligne] = await verrouiller(tx, [req.params.id]);
        const { etat, retirees } = decompterDurees(ligne!.etat);
        if (!etat) return { modifie: false, retirees, version: ligne!.version };
        const suivante = await enregistrer(
          tx,
          ctx,
          catalogue,
          appelant(req.body),
          ligne!,
          { etat },
          { operation: 'durees.decompte', details: { retirees } },
        );
        return {
          modifie: true,
          retirees,
          version: suivante.version,
          personnage: versApi(catalogue, suivante),
        };
      });
    },
  );
};
