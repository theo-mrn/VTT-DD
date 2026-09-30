/**
 * Module « interne » : routes appelées par les services campaign et dice, jamais
 * relayées par la gateway (qui refuse tout /internal/*). Pas de jeton
 * utilisateur : le secret partagé INTERNAL_API_SECRET (en-tête
 * x-internal-secret) est exigé. Sans ce secret configuré, les routes
 * n'existent pas.
 *
 *   GET  /internal/characters/:id                    résumé (propriétaire, système, joueur ou
 *        PNJ, création en cours, et résumé des listes : entrées uniques et valeurs clés)
 *   GET  /internal/characters/:id/sheet?userId=      valeurs calculées de la fiche, pour
 *        les variables des jets de dice (`1d20+FOR`) ; 404/403 si `userId` ne peut
 *        pas agir avec ce personnage (mêmes droits qu'une action)
 *   POST /internal/characters/:id/actions/:action    action jouée par le serveur
 *        (initiative d'un combat : la réponse porte les clés de tri `cles`)
 *   POST /internal/characters/:id/durees/decompter   fin de round : durées -1,
 *        possessions arrivées à 0 retirées ; `tickId` : une seule fois par passage de round
 *        (reprise : réponse d'origine), annulable par /internal/modifications/revert
 *   POST /internal/npcs, /internal/npcs/delete, /internal/characters/:id/possessions/receive
 *        instances de PNJ et butin de la carte (./npcs.ts)
 *   POST /internal/actions/prepare, /internal/actions/resolve   attaques du combat (./actions.ts)
 *   POST /internal/modifications/apply, /internal/modifications/revert   décisions du MJ
 *        appliquées sans relancer un dé, et leur annulation (./modifications.ts)
 */
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Valeur } from '@vtt/rules';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import { exigerSecretInterne } from '../../interne/secret.js';
import { decompterDurees, Valeurs } from '../../regles/operations.js';
import { jouerAction } from '../personnages/actions.js';
import {
  autoriser,
  enregistrer,
  lire,
  resumeDe,
  verrouiller,
  versApi,
  type Appelant,
} from '../personnages/depot.js';
import { CharacterSummary } from '../../regles/summary.js';
import { registerActionRoutes } from './actions.js';
import {
  decompteDejaFait,
  enregistrerDecompte,
  registerModificationRoutes,
} from './modifications.js';
import { registerNpcRoutes } from './npcs.js';

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

  // Instances de PNJ de la carte et butin (docs/carte.md § 12)
  registerNpcRoutes(app, deps, interne);
  // Attaques du combat : préparer, résoudre ; appliquer, annuler (docs/combat.md § 11.2)
  registerActionRoutes(app, deps, interne);
  registerModificationRoutes(app, deps, interne);

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
            /** Personnage joueur ou PNJ (campaign filtre ainsi ses listes). */
            kind: z.enum(['pc', 'npc']),
            /** Création non terminée (campaign : `creationPersonnages`). */
            creation: z.boolean(),
            /** Résumé des listes (table de la campagne). */
            summary: CharacterSummary,
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
        kind: l.kind,
        creation: l.etat.creation,
        summary: resumeDe(catalogue, l, await deps.droits.options(l.id)),
      };
    },
  );

  r.get(
    '/internal/characters/:id/sheet',
    {
      ...interne,
      schema: {
        hide: true,
        params: z.object({ id: IdPersonnage }),
        querystring: z.object({ userId: IdUtilisateur }),
        response: {
          200: z.object({
            id: z.string(),
            ownerId: z.string(),
            nom: z.string(),
            avatarUrl: z.string().nullable(),
            systeme: z.object({ id: z.string(), version: z.string() }),
            valeurs: z.record(
              z.string(),
              z.object({
                valeur: z.union([z.number(), z.boolean(), z.string()]),
                modificateur: z.number().optional(),
              }),
            ),
          }),
        },
      },
    },
    async (req) => {
      // Lancer avec un personnage, c'est agir avec lui : mêmes droits qu'une action
      await autoriser(db, deps.droits, req.query.userId, [{ id: req.params.id, mode: 'ecriture' }]);
      const l = await lire(db, req.params.id);
      // Valeurs de la fiche avec les règles optionnelles de sa campagne (Contact en surcharge…)
      const { fiche } = versApi(catalogue, l, { options: await deps.droits.options(l.id) });
      const valeurs: Record<string, { valeur: Valeur; modificateur?: number }> = {};
      for (const [cle, v] of Object.entries(fiche.valeurs)) {
        valeurs[cle] = {
          valeur: v.valeur,
          ...(v.modificateur !== undefined ? { modificateur: v.modificateur } : {}),
        };
      }
      return {
        id: l.id,
        ownerId: l.ownerId,
        nom: l.nom,
        avatarUrl: l.avatarUrl,
        systeme: { id: l.systemId, version: l.systemVersion },
        valeurs,
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
        // Jet d'initiative lancé par le MJ : dans l'historique de sa campagne
        ...(origine.roomId ? { campaignId: origine.roomId } : {}),
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
        body: Origine.extend({
          /** Passage de round (`tick:<combatId>:<round>`) : décompté une seule fois. */
          tickId: z.string().trim().min(1).max(200).optional(),
        }).default({}),
        response: {
          200: z.object({
            modifie: z.boolean(),
            retirees: z.array(z.string()),
            version: z.number().int(),
            /** Même `tickId` déjà décompté : réponse d'origine, rien de plus. */
            replayed: z.boolean().optional(),
            personnage: Personnage.optional(),
          }),
        },
      },
    },
    async (req) => {
      const ctx = contexte(req);
      const { tickId, ...origine } = req.body;
      const options = await deps.droits.options(req.params.id);
      return db.transaction(async (tx) => {
        const [ligne] = await verrouiller(tx, [req.params.id]);
        if (tickId) {
          const fait = await decompteDejaFait(tx, tickId, ligne!.id);
          if (fait) return { ...fait, replayed: true };
        }
        const { etat, retirees } = decompterDurees(ligne!.etat);
        const suivante = etat
          ? await enregistrer(
              tx,
              ctx,
              catalogue,
              appelant(origine),
              ligne!,
              { etat },
              {
                operation: 'durees.decompte',
                details: { retirees, ...(tickId ? { tickId } : {}) },
              },
              options,
            )
          : ligne!;
        const resultat = { modifie: Boolean(etat), retirees, version: suivante.version };
        if (tickId)
          await enregistrerDecompte(tx, {
            tickId,
            characterId: ligne!.id,
            campaignId: origine.roomId ?? null,
            userId: origine.userId ?? null,
            avant: ligne!.etat,
            apres: suivante.etat,
            resultat,
          });
        if (!etat) return { ...resultat, ...(tickId ? { replayed: false } : {}) };
        return {
          ...resultat,
          ...(tickId ? { replayed: false } : {}),
          personnage: versApi(catalogue, suivante, { options }),
        };
      });
    },
  );
};
