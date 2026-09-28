/**
 * Module « personnages » : CRUD du propriétaire, saisie des valeurs, création
 * par étapes, achats, possessions, repos et actions (contrat :
 * docs/api-character.md). Toutes les routes demandent un jeton d'accès.
 * Le propriétaire a tous les droits ; les membres d'une salle où le
 * personnage est engagé le lisent, son MJ le modifie (voir `autoriser`).
 */
import { HttpError } from '@vtt/platform';
import { achatsPossibles, creationDe, etapesCreation } from '@vtt/rules';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import {
  acheterObjet,
  appliquerEtape,
  basculerEffetPersonnage,
  changerDossiers,
  DemandeBonus,
  DemandeEffet,
  DemandeDon,
  DemandeDossiers,
  DemandePossession,
  donnerObjet,
  etatInitial,
  modifierValeurs,
  poserBonus,
  poserPossession,
  rembourserLigne,
  reposer,
  retirerBonus,
  retirerPossession,
  saisieReserveeMj,
  terminer,
  Valeurs,
  verifierEtat,
  vuePublique,
} from '../../regles/operations.js';
import { CharacterSummary } from '../../regles/summary.js';
import { jouerAction } from './actions.js';
import {
  autoriser,
  changerMiseEnPage,
  creer,
  detailsApi,
  lire,
  lister,
  modifier,
  modifierPaire,
  supprimer,
  systemeDe,
  versApi,
  type Ligne,
  type Mode,
} from './depot.js';
import { MAX_LAYOUT_BYTES, Permissions, SheetLayout } from './layout.js';

const IdPersonnage = z.uuid('Identifiant de personnage invalide').transform((s) => s.toLowerCase());
const Id = z.string().min(1).max(200);
const Version = z.number().int().positive();

const Params = z.object({ id: IdPersonnage });

const Details = z.object({ concept: z.string(), appearance: z.string(), backstory: z.string() });

const Personnage = z.object({
  id: z.string(),
  ownerId: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable(),
  etat: z.unknown(),
  fiche: z.unknown(),
  details: Details,
  summary: CharacterSummary,
  /** Mise en page de la fiche (forme : ./layout.ts) ; null : disposition par défaut. */
  sheetLayout: z.unknown().nullable(),
  /** Droits de l'appelant : renvoyés par la lecture et par le changement de mise en page. */
  permissions: Permissions.optional(),
  version: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Tous les droits : le propriétaire, ou le MJ d'une campagne où le personnage est engagé. */
const TOUS_DROITS: Permissions = { write: true, layout: true };

/** Présentation libre modifiable : seuls les champs envoyés changent. */
const DetailsModifies = z.object({
  concept: z.string().trim().max(160, '160 caractères au plus').optional(),
  appearance: z.string().trim().max(2000, '2000 caractères au plus').optional(),
  backstory: z.string().trim().max(8000, '8000 caractères au plus').optional(),
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

  /** Personnage lisible par l'appelant (propriétaire, membre de sa salle). */
  const lecture = async (req: FastifyRequest, id: string) => {
    await autoriser(db, deps.droits, moi(req), [{ id, mode: 'lecture' }]);
    return lire(db, id);
  };
  /**
   * Campagne où annoncer l'écriture d'un MJ (il y mène la partie) : le
   * propriétaire la voit en direct. Réponse de campaign déjà en cache (autoriser).
   */
  const salleDuMj = async (req: FastifyRequest, id: string, role: string) =>
    role === 'gm' ? ((await deps.droits.de(id, moi(req))).campagnesMj?.[0] ?? null) : null;

  /** Modification par le propriétaire ou le MJ d'une salle où le personnage est engagé. */
  const modifierPour = async (
    req: FastifyRequest,
    id: string,
    version: number | undefined,
    calcul: Parameters<typeof modifier>[6],
  ) => {
    const role = await autoriser(db, deps.droits, moi(req), [{ id, mode: 'ecriture' }]);
    const roomId = await salleDuMj(req, id, role);
    return modifier(
      db,
      contexte(req),
      catalogue,
      { userId: moi(req), role, roomId },
      id,
      version,
      calcul,
    );
  };

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
              concept: z.string(),
              summary: CharacterSummary,
              updatedAt: z.string(),
            }),
          ),
        },
      },
    },
    async (req) => lister(db, catalogue, moi(req)),
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
    async (req) => {
      const ligne = await lecture(req, req.params.id);
      // Le front se fie à ces droits : il n'a pas à les recalculer (réponse de campaign en cache)
      const permissions: Permissions =
        ligne.ownerId === moi(req)
          ? TOUS_DROITS
          : await deps.droits.de(ligne.id, moi(req)).then((d) => ({
              write: d.ecriture,
              layout: d.ecriture,
            }));
      // Un joueur qui ne peut pas écrire ne voit pas les objets cachés (propriétaire, MJ : si)
      return { ...versApi(catalogue, ligne, { publique: !permissions.write }), permissions };
    },
  );

  // ─── Mise en page de la fiche ──────────────────────────────────────────────

  r.put(
    '/v1/characters/:id/layout',
    {
      ...auth,
      // Au-delà, 413 avant toute validation (la mise en page elle-même est bornée plus bas)
      bodyLimit: 2 * MAX_LAYOUT_BYTES,
      schema: {
        params: Params,
        body: z.strictObject({ version: Version, layout: SheetLayout.nullable() }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { id } = req.params;
      const role = await autoriser(db, deps.droits, moi(req), [{ id, mode: 'ecriture' }]);
      // Tables où le personnage est engagé et où l'appelant siège (réponse de campaign en cache)
      const campagnes = (await deps.droits.de(id, moi(req))).campagnes ?? [];
      const ligne = await changerMiseEnPage(
        db,
        contexte(req),
        { userId: moi(req), role },
        campagnes,
        id,
        req.body.version,
        req.body.layout,
      );
      return { ...api(ligne), permissions: TOUS_DROITS };
    },
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
          details: DetailsModifies.optional(),
        }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, nom, avatarUrl, details } = req.body;
      const ligne = await modifierPour(req, req.params.id, version, (l) => ({
        changement: {
          ...(nom !== undefined ? { nom } : {}),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
          ...(details !== undefined ? { details: { ...detailsApi(l.details), ...details } } : {}),
        },
        operation: 'profil',
        details: {
          ...(nom !== undefined ? { nom } : {}),
          ...(avatarUrl !== undefined ? { avatarUrl } : {}),
        },
      }));
      return api(ligne);
    },
  );

  r.delete('/v1/characters/:id', { ...auth, schema: { params: Params } }, async (req, reply) => {
    await autoriser(db, deps.droits, moi(req), [{ id: req.params.id, mode: 'proprietaire' }]);
    await supprimer(db, contexte(req), { userId: moi(req), role: 'user' }, req.params.id);
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
      const { id } = req.params;
      const { version, valeurs } = req.body;
      const role = await autoriser(db, deps.droits, moi(req), [{ id, mode: 'ecriture' }]);
      // Le propriétaire est MJ s'il mène une salle où le personnage est engagé :
      // campaign n'est interrogé que si un attribut réservé au MJ est saisi
      let mj = role === 'gm';
      if (!mj) {
        const l = await lire(db, id);
        if (saisieReserveeMj(systemeDe(catalogue, l), l.type, valeurs))
          mj = (await deps.droits.de(id, moi(req))).ecriture;
      }
      const qui = { proprietaire: role === 'user', mj };
      const roomId = await salleDuMj(req, id, role);
      const ligne = await modifier(
        db,
        contexte(req),
        catalogue,
        { userId: moi(req), role, roomId },
        id,
        version,
        (l, systeme) => ({
          changement: { etat: modifierValeurs(systeme, l.etat, valeurs, qui) },
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
      const ligne = await lecture(req, req.params.id);
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
      const ligne = await modifierPour(req, req.params.id, req.body.version, (l, systeme) => ({
        changement: { etat: terminer(systeme, l.etat) },
        operation: 'creation.terminer',
      }));
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
        response: {
          200: Personnage.extend({
            /** Étape « tirer » : le tirage retenu (dés compris), pour l'afficher. */
            tirage: z
              .object({ attributs: z.array(z.string()), retenu: z.unknown(), essais: z.number() })
              .optional(),
          }),
        },
      },
    },
    async (req) => {
      let tirage: { attributs: string[]; retenu: unknown; essais: number } | undefined;
      const ligne = await modifierPour(req, req.params.id, req.body.version, (l, systeme) => {
        const r = appliquerEtape(
          systeme,
          l.etat,
          req.params.etape,
          req.body,
          deps.aleatoire(),
          date(),
          l.pendingRoll,
        );
        const type = creationDe(systeme, l.etat.type)?.etapes.find(
          (e) => e.id === req.params.etape,
        )?.type;
        if (type === 'tirer') tirage = r.details as typeof tirage;
        return {
          changement: {
            etat: r.etat,
            ...(r.enAttente !== undefined ? { pendingRoll: r.enAttente } : {}),
          },
          operation: `creation.${req.params.etape}`,
          details: r.details,
        };
      });
      return { ...api(ligne), ...(tirage ? { tirage } : {}) };
    },
  );

  // ─── Achats ────────────────────────────────────────────────────────────────

  r.get(
    '/v1/characters/:id/achats',
    { ...auth, schema: { params: Params, response: { 200: z.array(z.unknown()) } } },
    async (req) => {
      const ligne = await lecture(req, req.params.id);
      const systeme = systemeDe(catalogue, ligne);
      const etat = verifierEtat(systeme, ligne.etat).etat;
      // Lecteur sans droit d'écriture : sans les objets cachés
      const ecrit =
        ligne.ownerId === moi(req) || (await deps.droits.de(ligne.id, moi(req))).ecriture;
      return achatsPossibles(verifierEtat(systeme, ecrit ? etat : vuePublique(etat)).fiche);
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
      const ligne = await modifierPour(req, req.params.id, version, (l, systeme) => {
        const r = acheterObjet(systeme, l.etat, { achat, objet }, date());
        return { changement: { etat: r.etat }, operation: 'achat', details: r.details };
      });
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
      const ligne = await modifierPour(req, req.params.id, version, (l, systeme) => {
        const r = rembourserLigne(systeme, l.etat, index);
        return { changement: { etat: r.etat }, operation: 'remboursement', details: r.details };
      });
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
      const ligne = await modifierPour(req, req.params.id, version, (l, systeme) => {
        const r = poserPossession(systeme, l.etat, demande);
        return {
          changement: { etat: r.etat },
          operation: 'possession',
          details: {
            possession: {
              ...demande,
              ...(r.exemplaire !== undefined ? { exemplaire: r.exemplaire } : {}),
            },
            cree: r.cree,
          },
        };
      });
      return api(ligne);
    },
  );

  r.delete(
    '/v1/characters/:id/possessions/:entree',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdPersonnage, entree: Id }),
        querystring: z.object({
          version: z.coerce.number().int().positive(),
          /** Exemplaire retiré ; absent : l'exemplaire sans identifiant. */
          exemplaire: Id.optional(),
        }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { entree } = req.params;
      const { version, exemplaire } = req.query;
      const ligne = await modifierPour(req, req.params.id, version, (l, systeme) => ({
        changement: { etat: retirerPossession(systeme, l.etat, entree, exemplaire) },
        operation: 'possession.retrait',
        details: { entree, ...(exemplaire !== undefined ? { exemplaire } : {}) },
      }));
      return api(ligne);
    },
  );

  // ─── Inventaire : dossiers et dons ─────────────────────────────────────────

  r.put(
    '/v1/characters/:id/folders',
    {
      ...auth,
      schema: {
        params: Params,
        body: z.object({ version: Version, folders: DemandeDossiers }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, folders } = req.body;
      const ligne = await modifierPour(req, req.params.id, version, (l) => {
        const r = changerDossiers(l.etat, folders);
        return { changement: { etat: r.etat }, operation: 'dossiers', details: r.details };
      });
      return api(ligne);
    },
  );

  r.post(
    '/v1/characters/:id/possessions/give',
    {
      ...auth,
      schema: {
        params: Params,
        body: DemandeDon.extend({ version: Version, to: IdPersonnage }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { id } = req.params;
      const { version, to, ...don } = req.body;
      if (to === id)
        throw HttpError.badRequest('Un personnage ne se donne pas un objet', 'don_a_soi_meme');
      // Le donneur : son propriétaire ou le MJ ; le receveur doit être lisible par l'appelant
      const role = await autoriser(db, deps.droits, moi(req), [
        { id, mode: 'ecriture' },
        { id: to, mode: 'lecture' },
      ]);
      // Campagne où les deux sont engagés et où l'appelant siège (réponses de campaign en cache)
      const [de, vers] = await Promise.all([
        deps.droits.de(id, moi(req)),
        deps.droits.de(to, moi(req)),
      ]);
      const commune = (de.campagnes ?? []).find((c) => (vers.campagnes ?? []).includes(c));
      if (!commune)
        throw new HttpError(
          403,
          'Accès refusé',
          'hors_campagne',
          'Le receveur doit être engagé dans la même campagne que le donneur',
        );
      const roomId = await salleDuMj(req, id, role);
      const ligne = await modifierPaire(
        db,
        contexte(req),
        catalogue,
        { userId: moi(req), role, roomId },
        commune,
        [id, to],
        version,
        (donneur, receveur, systeme) => {
          const r = donnerObjet(systeme, donneur.etat, receveur.etat, don);
          const details = {
            don: {
              ...don,
              quantity: r.quantite,
              from: donneur.id,
              to: receveur.id,
              ...(r.recu !== undefined ? { received: r.recu } : {}),
            },
          };
          return {
            a: { etat: r.donneur, operation: 'possession.don', details },
            b: { etat: r.receveur, operation: 'possession.recue', details },
          };
        },
      );
      return api(ligne);
    },
  );

  // ─── Bonus libres ──────────────────────────────────────────────────────────

  r.post(
    '/v1/characters/:id/bonus',
    {
      ...auth,
      schema: {
        params: Params,
        body: DemandeBonus.extend({ version: Version }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, ...demande } = req.body;
      const ligne = await modifierPour(req, req.params.id, version, (l, systeme) => ({
        changement: { etat: poserBonus(systeme, l.etat, demande) },
        operation: 'bonus',
        details: { bonus: demande },
      }));
      return api(ligne);
    },
  );

  r.delete(
    '/v1/characters/:id/bonus/:bonusId',
    {
      ...auth,
      schema: {
        params: z.object({ id: IdPersonnage, bonusId: Id }),
        querystring: z.object({ version: z.coerce.number().int().positive() }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const ligne = await modifierPour(req, req.params.id, req.query.version, (l) => ({
        changement: { etat: retirerBonus(l.etat, req.params.bonusId) },
        operation: 'bonus.retrait',
        details: { bonusId: req.params.bonusId },
      }));
      return api(ligne);
    },
  );

  // ─── Effets activés un à un ────────────────────────────────────────────────

  /**
   * Active ou coupe un effet d'une entrée ou d'un exemplaire (`effet` : sa clé
   * `<source>/<index>`), sans déséquiper l'objet. Idempotent.
   */
  r.put(
    '/v1/characters/:id/effets',
    {
      ...auth,
      schema: {
        params: Params,
        body: DemandeEffet.extend({ version: Version }),
        response: { 200: Personnage },
      },
    },
    async (req) => {
      const { version, ...demande } = req.body;
      const ligne = await modifierPour(req, req.params.id, version, (l, systeme) => {
        const r = basculerEffetPersonnage(systeme, l.etat, demande);
        return { changement: { etat: r.etat }, operation: 'effet', details: r.details };
      });
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
      const ligne = await modifierPour(req, req.params.id, version, (l, systeme) => ({
        changement: { etat: reposer(verifierEtat(systeme, l.etat).fiche, attributs) },
        operation: 'repos',
        ...(attributs ? { details: { attributs } } : {}),
      }));
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
            /** Historique des jets (service dice) : campagne du jet et visibilité. */
            campaignId: z
              .uuid('Identifiant de campagne invalide')
              .transform((s) => s.toLowerCase())
              .optional(),
            visibility: z.enum(['public', 'private', 'gm', 'self']).optional(),
          })
          .default({}),
        response: {
          200: z.object({
            resultat: z.unknown(),
            /** Clés de tri, pour l'action d'initiative du système. */
            cles: z.array(z.number()).optional(),
            personnage: Personnage.optional(),
            cible: Personnage.optional(),
          }),
        },
      },
    },
    async (req) => {
      const { id, action } = req.params;
      const { parametres, cibleId, appliquer = false, campaignId, visibility } = req.body;
      // Agir avec un personnage demande de pouvoir le modifier ; la cible doit
      // être lisible, et modifiable si les conséquences lui sont appliquées
      const demandes: { id: string; mode: Mode }[] = [{ id, mode: 'ecriture' }];
      if (cibleId && cibleId !== id)
        demandes.push({ id: cibleId, mode: appliquer ? 'ecriture' : 'lecture' });
      const role = await autoriser(db, deps.droits, moi(req), demandes);
      return jouerAction(
        deps,
        contexte(req),
        { userId: moi(req), role },
        {
          id,
          action,
          ...(parametres ? { parametres } : {}),
          ...(cibleId ? { cibleId } : {}),
          appliquer,
          ...(campaignId ? { campaignId } : {}),
          ...(visibility ? { visibility } : {}),
        },
      );
    },
  );
};
