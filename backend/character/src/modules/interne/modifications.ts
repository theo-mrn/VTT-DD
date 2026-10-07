/**
 * Application des décisions du MJ (docs/combat.md § 7.2, § 7.3, § 11.2) : routes internes
 * appelées par campaign.
 *
 *   POST /internal/modifications/apply    modifications décidées écrites sans relancer un dé,
 *        toutes les fiches touchées dans une seule transaction (tout ou rien) ; idempotent par
 *        `applicationId` (une reprise rend la réponse d'origine) ; par fiche : version, diff,
 *        hors de combat (formule `horsCombat` du système)
 *   POST /internal/modifications/revert   valeurs d'avant rendues, si la fiche n'a pas changé
 *        depuis sur les mêmes éléments (409 `revert_conflict` sinon, `force` passe outre) ;
 *        rend aussi un décompte des durées (`applicationId = tickId`)
 *
 * Chaque écriture passe par `enregistrer` (état validé, version, `character.updated` annoncé
 * aux MJ de la campagne et au joueur qui incarne le personnage).
 */
import {
  AttackModificationInput,
  changesPayload,
  deepEqual,
  type Change,
  compareCodeUnits,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import {
  appliquerModifications,
  estHorsCombat,
  type EtatEntite,
  type Modification,
  type ReglagesOptions,
  type SystemeCharge,
} from '@vtt/rules';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { EventContext, Tx } from '../../db/outbox.js';
import { applicationItems, applications, characters } from '../../db/schema.js';
import type { Deps, ServiceApp } from '../../deps.js';
import {
  annuler,
  deltaEtat,
  deltaVide,
  modificationsDecidees,
  type DeltaEtat,
} from '../../regles/combat.js';
import { verifierEtat } from '../../regles/operations.js';
import {
  enregistrer,
  etatNormalise,
  IDENTITES,
  systemeDe,
  type Appelant,
  type Ligne,
} from '../personnages/depot.js';

const Id = z.uuid('Identifiant invalide').transform((s) => s.toLowerCase());
const IdApplication = z.string().trim().min(1).max(200);
const uniques = (ids: readonly string[]) => new Set(ids).size === ids.length;

const CorpsAppliquer = z.object({
  applications: z
    .array(
      z.object({
        applicationId: IdApplication,
        userId: Id.nullable().optional(),
        campaignId: Id,
        items: z
          .array(
            z.object({
              characterId: Id,
              modifications: z.array(AttackModificationInput).max(50),
              tables: z
                .array(
                  z.object({
                    table: z.string().trim().min(1).max(200),
                    entry: z.string().trim().min(1).max(200).nullable(),
                  }),
                )
                .max(10)
                .optional(),
            }),
          )
          .min(1)
          .max(100),
      }),
    )
    .min(1)
    .max(50)
    .refine((a) => uniques(a.map((x) => x.applicationId)), 'Application en double'),
});
type CorpsAppliquer = z.output<typeof CorpsAppliquer>;

const CorpsAnnuler = z.object({
  applicationId: IdApplication,
  characterIds: z.array(Id).max(100).optional(),
  force: z.boolean().optional(),
  userId: Id.nullable().optional(),
  /**
   * Décompte des durées inconnu (encore en vol, ou jamais arrivé) : une pierre tombale est
   * posée, le décompte arrivé ensuite ne fera rien (« Précédent », docs/combat.md § 18.5).
   */
  cancelIfMissing: z.boolean().optional(),
});

/** Résultat d'une fiche touchée (gardé tel quel pour une reprise). */
const ItemApplique = z.object({
  characterId: z.string(),
  version: z.number().int(),
  changes: z.array(z.custom<Change>()),
  truncated: z.literal(true).optional(),
  defeated: z.boolean(),
});
type ItemApplique = z.infer<typeof ItemApplique>;

const ReponseAppliquer = z.object({
  applications: z.array(
    z.object({ applicationId: z.string(), replayed: z.boolean(), items: z.array(ItemApplique) }),
  ),
});

const ReponseAnnuler = z.object({
  applicationId: z.string(),
  items: z.array(
    z.object({
      characterId: z.string(),
      status: z.enum(['reverted', 'already_reverted', 'missing']),
      version: z.number().int().nullable(),
      changes: z.array(z.custom<Change>()),
      truncated: z.literal(true).optional(),
      defeated: z.boolean().optional(),
    }),
  ),
});
type ItemAnnule = z.infer<typeof ReponseAnnuler>['items'][number];

/** Refus détaillé (problem+json avec `errors` ou `conflicts`) : rien n'est écrit. */
class Refus extends HttpError {
  constructor(
    status: number,
    title: string,
    code: string,
    detail: string,
    public readonly extensions: Record<string, unknown>,
  ) {
    super(status, title, code, detail);
  }
}

function repondreRefus(req: FastifyRequest, reply: FastifyReply, e: Refus) {
  return reply
    .code(e.status)
    .type('application/problem+json')
    .send({
      type: 'about:blank',
      title: e.title,
      status: e.status,
      code: e.code,
      detail: e.detail,
      ...e.extensions,
      instance: req.url,
      requestId: req.id,
    });
}

const introuvable = (id: string) =>
  new HttpError(
    404,
    'Ressource introuvable',
    'character_not_found',
    `Personnage introuvable : ${id}`,
  );

/** Verrouille les personnages (ordre des identifiants) ; 404 `character_not_found` sinon. */
async function verrouillerTous(tx: Tx, ids: string[]): Promise<Map<string, Ligne>> {
  const uniquesIds = [...new Set(ids)].sort(compareCodeUnits);
  const lignes = await tx
    .select()
    .from(characters)
    .where(and(inArray(characters.id, uniquesIds), isNull(characters.deletedAt)))
    .orderBy(characters.id)
    .for('update');
  const parId = new Map(lignes.map((l) => [l.id, l] as const));
  for (const id of uniquesIds) if (!parId.has(id)) throw introuvable(id);
  return parId;
}

/**
 * Ressources et attributs de base touchés ramenés dans leurs bornes calculées (pas au-dessus
 * du maximum d'une ressource non plafonnée : des blessures au-delà du seuil restent permises).
 */
function borner(systeme: SystemeCharge, etat: EtatEntite, touches: Set<string>): EtatEntite {
  if (!touches.size) return etat;
  const fiche = verifierEtat(systeme, etat).fiche;
  const valeurs = { ...etat.valeurs };
  for (const cle of touches) {
    const a = fiche.entite.attributs.get(cle);
    const v = valeurs[cle];
    const c = fiche.valeurs.get(cle);
    if (!a || typeof v !== 'number' || !c) continue;
    let borne = v;
    if (c.min !== undefined) borne = Math.max(c.min, borne);
    const plafond = a.nature === 'ressource' ? a.plafonnee : true;
    if (c.max !== undefined && plafond) borne = Math.min(c.max, borne);
    valeurs[cle] = borne;
  }
  return { ...etat, valeurs };
}

const horsCombat = (systeme: SystemeCharge, etat: EtatEntite) =>
  estHorsCombat(verifierEtat(systeme, etat).fiche) ?? false;

const diff = (avant: Ligne, apres: Ligne) =>
  changesPayload(
    { etat: etatNormalise(avant.etat) },
    { etat: etatNormalise(apres.etat) },
    IDENTITES,
  );

export interface Contexte {
  deps: Deps;
  ctx: EventContext;
  /** Règles optionnelles de la campagne de chaque personnage. */
  options: Map<string, ReglagesOptions>;
  /** Joueur qui incarne chaque personnage dans la campagne (événements en direct). */
  joueurs: Map<string, string | null>;
}

export async function preparerContexte(
  deps: Deps,
  ctx: EventContext,
  personnages: { characterId: string; userId: string | null; campaignId: string | null }[],
): Promise<Contexte> {
  const options = new Map<string, ReglagesOptions>();
  const joueurs = new Map<string, string | null>();
  await Promise.all(
    personnages.map(async (p) => {
      if (!options.has(p.characterId))
        options.set(p.characterId, await deps.droits.options(p.characterId));
      if (!p.userId || !p.campaignId) return;
      const dr = await deps.droits.de(p.characterId, p.userId);
      joueurs.set(`${p.campaignId}:${p.characterId}`, dr.incarnateurs?.[p.campaignId] ?? null);
    }),
  );
  return { deps, ctx, options, joueurs };
}

export const appelantDe = (
  c: Contexte,
  characterId: string,
  userId: string | null,
  campaignId: string | null,
): Appelant => ({
  userId,
  role: userId ? 'gm' : 'system',
  roomId: campaignId,
  joueur: campaignId ? (c.joueurs.get(`${campaignId}:${characterId}`) ?? null) : null,
});

// ─── Appliquer ─────────────────────────────────────────────────────────────────

interface Plan {
  applicationId: string;
  characterId: string;
  etat: EtatEntite;
}

type ApplicationDemandee = CorpsAppliquer['applications'][number];
type SystemeDe = (id: string, l: Ligne) => SystemeCharge;

/**
 * En-têtes d'abord : une reprise concurrente attend la fin de cette transaction. Renvoie
 * les applications insérées ici (les autres sont traitées par une requête concurrente).
 */
async function insererEntetes(
  tx: Tx,
  nouvelles: ApplicationDemandee[],
): Promise<ApplicationDemandee[]> {
  const inserees = new Set<string>();
  for (const a of nouvelles) {
    const r = await tx
      .insert(applications)
      .values({
        applicationId: a.applicationId,
        kind: 'application',
        campaignId: a.campaignId,
        userId: a.userId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: applications.applicationId });
    if (r.length) inserees.add(a.applicationId);
  }
  return nouvelles.filter((a) => inserees.has(a.applicationId));
}

/** Items d'une application regroupés par fiche touchée. */
function itemsParPerso(a: ApplicationDemandee): Map<string, ApplicationDemandee['items']> {
  const parPerso = new Map<string, ApplicationDemandee['items']>();
  for (const i of a.items) parPerso.set(i.characterId, [...(parPerso.get(i.characterId) ?? []), i]);
  return parPerso;
}

/** Nouvel état d'une fiche après des modifications, borné et vérifié ; message d'erreur sinon. */
function etatApres(
  s: SystemeCharge,
  ligne: Ligne,
  modifications: Modification[],
): { etat: EtatEntite } | { erreur: string } {
  try {
    const fiche = verifierEtat(s, ligne.etat).fiche;
    let etat = appliquerModifications(fiche, modifications);
    const attributs = modifications.flatMap((m) => ('attribut' in m ? [m.attribut] : []));
    etat = borner(s, etat, new Set(attributs));
    etat = verifierEtat(s, etat).etat;
    return { etat };
  } catch (e) {
    return { erreur: (e as Error).message };
  }
}

/** 1. Calcul de tous les nouveaux états, sans rien écrire : toutes les erreurs d'un coup. */
function simuler(
  aTraiter: ApplicationDemandee[],
  verrouillees: Map<string, Ligne>,
  systeme: SystemeDe,
): Plan[] {
  const simulees = new Map(verrouillees);
  const plans: Plan[] = [];
  const erreurs: { characterId: string; message: string }[] = [];
  for (const a of aTraiter) {
    for (const [id, items] of itemsParPerso(a)) {
      const ligne = simulees.get(id)!;
      const s = systeme(id, ligne);
      const d = modificationsDecidees(
        s,
        ligne.type,
        items.flatMap((i) => i.modifications),
        items.flatMap((i) => i.tables ?? []),
      );
      if (d.erreurs.length) {
        erreurs.push(...d.erreurs.map((message) => ({ characterId: id, message })));
        continue;
      }
      const r = etatApres(s, ligne, d.modifications as Modification[]);
      if ('erreur' in r) {
        erreurs.push({ characterId: id, message: r.erreur });
        continue;
      }
      plans.push({ applicationId: a.applicationId, characterId: id, etat: r.etat });
      simulees.set(id, { ...ligne, etat: r.etat });
    }
  }
  if (erreurs.length)
    throw new Refus(
      422,
      'Refusé par les règles du système',
      'modification_invalide',
      erreurs.map((e) => e.message).join(' ; '),
      { errors: erreurs },
    );
  return plans;
}

/** Écrit un plan sur la fiche telle que l'a laissée le plan précédent ; renvoie son item. */
async function ecrirePlan(
  c: Contexte,
  tx: Tx,
  a: ApplicationDemandee,
  p: Plan,
  courantes: Map<string, Ligne>,
  systeme: SystemeDe,
): Promise<ItemApplique> {
  const { catalogue } = c.deps;
  const ligne = courantes.get(p.characterId)!;
  const s = systeme(p.characterId, ligne);
  const change = !deepEqual(etatNormalise(ligne.etat), etatNormalise(p.etat));
  const suivante = change
    ? await enregistrer(
        tx,
        c.ctx,
        catalogue,
        appelantDe(c, p.characterId, a.userId ?? null, a.campaignId),
        ligne,
        { etat: p.etat },
        { operation: 'combat.application', details: { applicationId: p.applicationId } },
        c.options.get(p.characterId),
      )
    : ligne;
  courantes.set(p.characterId, suivante);
  const changes = change ? diff(ligne, suivante) : { changes: [] };
  const item: ItemApplique = {
    characterId: p.characterId,
    version: suivante.version,
    ...changes,
    defeated: horsCombat(s, suivante.etat),
  };
  const delta: DeltaEtat = deltaEtat(
    etatNormalise(ligne.etat) as EtatEntite,
    etatNormalise(suivante.etat) as EtatEntite,
  );
  await tx.insert(applicationItems).values({
    applicationId: p.applicationId,
    characterId: p.characterId,
    delta,
    result: item,
  });
  return item;
}

/** 2. Écriture, dans l'ordre : chaque fiche part de l'état écrit juste avant. */
async function ecrirePlans(
  c: Contexte,
  tx: Tx,
  aTraiter: ApplicationDemandee[],
  plans: Plan[],
  verrouillees: Map<string, Ligne>,
  systeme: SystemeDe,
): Promise<void> {
  const courantes = new Map(verrouillees);
  const reponses = new Map<string, ItemApplique[]>();
  for (const p of plans) {
    const a = aTraiter.find((x) => x.applicationId === p.applicationId)!;
    const item = await ecrirePlan(c, tx, a, p, courantes, systeme);
    reponses.set(p.applicationId, [...(reponses.get(p.applicationId) ?? []), item]);
  }
  for (const a of aTraiter)
    await tx
      .update(applications)
      .set({ response: { items: reponses.get(a.applicationId) ?? [] } })
      .where(eq(applications.applicationId, a.applicationId));
}

async function appliquerTout(
  c: Contexte,
  corps: CorpsAppliquer,
): Promise<z.infer<typeof ReponseAppliquer>> {
  const { db, catalogue } = c.deps;
  const ids = corps.applications.map((a) => a.applicationId);
  const lire = async () =>
    db.select().from(applications).where(inArray(applications.applicationId, ids));
  const connues = new Map((await lire()).map((a) => [a.applicationId, a] as const));
  for (const a of connues.values())
    if (a.kind !== 'application')
      throw HttpError.conflict(
        `${a.applicationId} désigne un décompte des durées, pas une application`,
        'application_conflict',
      );
  const nouvelles = corps.applications.filter((a) => !connues.has(a.applicationId));

  if (nouvelles.length)
    await db.transaction(async (tx) => {
      const aTraiter = await insererEntetes(tx, nouvelles);
      if (!aTraiter.length) return;

      const touches = aTraiter.flatMap((a) => a.items.map((i) => i.characterId));
      const verrouillees = await verrouillerTous(tx, touches);
      const systeme = (id: string, l: Ligne) => systemeDe(catalogue, l, c.options.get(id));
      const plans = simuler(aTraiter, verrouillees, systeme);
      await ecrirePlans(c, tx, aTraiter, plans, verrouillees, systeme);
    });

  // Réponse : les nouvelles comme les reprises, depuis ce qui est enregistré
  const enregistrees = new Map((await lire()).map((a) => [a.applicationId, a] as const));
  return {
    applications: corps.applications.map((a) => {
      const e = enregistrees.get(a.applicationId);
      const items = (e?.response as { items?: ItemApplique[] } | null)?.items ?? [];
      return { applicationId: a.applicationId, replayed: connues.has(a.applicationId), items };
    }),
  };
}

// ─── Annuler ───────────────────────────────────────────────────────────────────

type ItemEnregistre = typeof applicationItems.$inferSelect;

/**
 * États rendus, fiche par fiche. Conflits d'abord : rien n'est écrit si une fiche a changé
 * depuis (sauf `force`).
 */
function etatsRendus(
  items: ItemEnregistre[],
  parId: Map<string, Ligne>,
  corps: z.output<typeof CorpsAnnuler>,
): Map<string, EtatEntite> {
  const conflits: { characterId: string; paths: string[] }[] = [];
  const rendus = new Map<string, EtatEntite>();
  for (const i of items) {
    const ligne = parId.get(i.characterId);
    if (!ligne || i.revertedAt) continue;
    const r = annuler(
      etatNormalise(ligne.etat) as EtatEntite,
      i.delta as DeltaEtat,
      corps.force === true,
    );
    if (r.conflits.length) conflits.push({ characterId: i.characterId, paths: r.conflits });
    rendus.set(i.characterId, r.etat);
  }
  if (conflits.length && !corps.force)
    throw new Refus(
      409,
      'Conflit',
      'revert_conflict',
      'La fiche a changé depuis l’application : relisez-la, ou forcez l’annulation',
      { conflicts: conflits },
    );
  return rendus;
}

/** Annulation en cours d'une application. */
interface Annulation {
  c: Contexte;
  tx: Tx;
  corps: z.output<typeof CorpsAnnuler>;
  entete: typeof applications.$inferSelect;
  userId: string | null;
  /** Fiches verrouillées, à jour des annulations déjà écrites. */
  parId: Map<string, Ligne>;
  rendus: Map<string, EtatEntite>;
}

/** Rend une fiche à son état d'avant l'application ; renvoie son item de réponse. */
async function annulerItem(n: Annulation, i: ItemEnregistre): Promise<ItemAnnule> {
  const { c, tx, corps, entete, userId, parId, rendus } = n;
  const { catalogue } = c.deps;
  const ligne = parId.get(i.characterId);
  if (!ligne) return { characterId: i.characterId, status: 'missing', version: null, changes: [] };
  const s = systemeDe(catalogue, ligne, c.options.get(i.characterId));
  if (i.revertedAt)
    return {
      characterId: i.characterId,
      status: 'already_reverted',
      version: ligne.version,
      changes: [],
      defeated: horsCombat(s, ligne.etat),
    };
  const etat = rendus.get(i.characterId)!;
  const change = !deltaVide(i.delta as DeltaEtat) && !deepEqual(etatNormalise(ligne.etat), etat);
  const suivante = change
    ? await enregistrer(
        tx,
        c.ctx,
        catalogue,
        appelantDe(c, i.characterId, userId, entete.campaignId),
        ligne,
        { etat },
        {
          operation: 'combat.annulation',
          details: { applicationId: corps.applicationId, forced: corps.force === true },
        },
        c.options.get(i.characterId),
      )
    : ligne;
  parId.set(i.characterId, suivante);
  await tx
    .update(applicationItems)
    .set({ revertedAt: new Date() })
    .where(
      and(
        eq(applicationItems.applicationId, i.applicationId),
        eq(applicationItems.characterId, i.characterId),
      ),
    );
  return {
    characterId: i.characterId,
    status: 'reverted',
    version: suivante.version,
    ...(change ? diff(ligne, suivante) : { changes: [] }),
    defeated: horsCombat(s, suivante.etat),
  };
}

async function annulerApplication(
  c: Contexte,
  corps: z.output<typeof CorpsAnnuler>,
  entete: typeof applications.$inferSelect,
): Promise<z.infer<typeof ReponseAnnuler>> {
  const { db } = c.deps;
  return db.transaction(async (tx) => {
    const items = await tx
      .select()
      .from(applicationItems)
      .where(
        and(
          eq(applicationItems.applicationId, corps.applicationId),
          corps.characterIds?.length
            ? inArray(applicationItems.characterId, corps.characterIds)
            : undefined,
        ),
      )
      .orderBy(applicationItems.createdAt, applicationItems.characterId);
    const ids = [...new Set(items.map((i) => i.characterId))].sort(compareCodeUnits);
    const lignes = ids.length
      ? await tx
          .select()
          .from(characters)
          .where(and(inArray(characters.id, ids), isNull(characters.deletedAt)))
          .orderBy(characters.id)
          .for('update')
      : [];
    const parId = new Map(lignes.map((l) => [l.id, l] as const));
    const userId = corps.userId ?? entete.userId ?? null;

    const rendus = etatsRendus(items, parId, corps);
    const annulation: Annulation = { c, tx, corps, entete, userId, parId, rendus };
    const sortie: ItemAnnule[] = [];
    for (const i of items) sortie.push(await annulerItem(annulation, i));
    return { applicationId: corps.applicationId, items: sortie };
  });
}

// ─── Routes ────────────────────────────────────────────────────────────────────

export function registerModificationRoutes(
  app: ServiceApp,
  deps: Deps,
  guard: {
    preValidation: (req: FastifyRequest) => Promise<void>;
    config: FastifyContextConfig;
  },
) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const contexte = (req: FastifyRequest): EventContext => ({
    correlationId: req.ctx.correlationId,
    traceparent: (req.headers.traceparent as string | undefined) ?? null,
  });

  r.post(
    '/internal/modifications/apply',
    {
      ...guard,
      bodyLimit: 4 * 1024 * 1024,
      schema: { hide: true, body: CorpsAppliquer, response: { 200: ReponseAppliquer } },
    },
    async (req, reply) => {
      const c = await preparerContexte(
        deps,
        contexte(req),
        req.body.applications.flatMap((a) =>
          a.items.map((i) => ({
            characterId: i.characterId,
            userId: a.userId ?? null,
            campaignId: a.campaignId,
          })),
        ),
      );
      try {
        return await appliquerTout(c, req.body);
      } catch (e) {
        if (e instanceof Refus) return repondreRefus(req, reply, e);
        throw e;
      }
    },
  );

  r.post(
    '/internal/modifications/revert',
    {
      ...guard,
      schema: { hide: true, body: CorpsAnnuler, response: { 200: ReponseAnnuler } },
    },
    async (req, reply) => {
      const lireEntete = async () =>
        (
          await deps.db
            .select()
            .from(applications)
            .where(eq(applications.applicationId, req.body.applicationId))
        )[0];
      let entete = await lireEntete();
      if (!entete && req.body.cancelIfMissing) {
        // Pierre tombale ; un décompte concurrent qui vient d'écrire son en-tête l'emporte
        const posee = await deps.db
          .insert(applications)
          .values({
            applicationId: req.body.applicationId,
            kind: 'tick',
            userId: req.body.userId ?? null,
            response: { items: [], cancelled: true },
          })
          .onConflictDoNothing()
          .returning({ id: applications.applicationId });
        if (posee.length) return { applicationId: req.body.applicationId, items: [] };
        entete = await lireEntete();
      }
      if (!entete)
        throw new HttpError(
          404,
          'Ressource introuvable',
          'application_not_found',
          `Application inconnue : ${req.body.applicationId}`,
        );
      const items = await deps.db
        .select({ characterId: applicationItems.characterId })
        .from(applicationItems)
        .where(eq(applicationItems.applicationId, entete.applicationId));
      const userId = req.body.userId ?? entete.userId ?? null;
      const c = await preparerContexte(
        deps,
        contexte(req),
        items.map((i) => ({ characterId: i.characterId, userId, campaignId: entete.campaignId })),
      );
      try {
        return await annulerApplication(c, req.body, entete);
      } catch (e) {
        if (e instanceof Refus) return repondreRefus(req, reply, e);
        throw e;
      }
    },
  );
}
