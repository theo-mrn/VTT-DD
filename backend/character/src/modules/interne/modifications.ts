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
import { AttackModificationInput, changesPayload, deepEqual, type Change } from '@vtt/contracts';
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
  const uniquesIds = [...new Set(ids)].sort();
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

interface Contexte {
  deps: Deps;
  ctx: EventContext;
  /** Règles optionnelles de la campagne de chaque personnage. */
  options: Map<string, ReglagesOptions>;
  /** Joueur qui incarne chaque personnage dans la campagne (événements en direct). */
  joueurs: Map<string, string | null>;
}

async function preparerContexte(
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

const appelant = (
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
      // En-têtes d'abord : une reprise concurrente attend la fin de cette transaction
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
      const aTraiter = nouvelles.filter((a) => inserees.has(a.applicationId));
      if (!aTraiter.length) return;

      const touches = aTraiter.flatMap((a) => a.items.map((i) => i.characterId));
      const verrouillees = await verrouillerTous(tx, touches);
      const systeme = (id: string, l: Ligne) => systemeDe(catalogue, l, c.options.get(id));

      // 1. Calcul de tous les nouveaux états, sans rien écrire : toutes les erreurs d'un coup
      const simulees = new Map(verrouillees);
      const plans: Plan[] = [];
      const erreurs: { characterId: string; message: string }[] = [];
      for (const a of aTraiter) {
        const parPerso = new Map<string, CorpsAppliquer['applications'][number]['items']>();
        for (const i of a.items)
          parPerso.set(i.characterId, [...(parPerso.get(i.characterId) ?? []), i]);
        for (const [id, items] of parPerso) {
          const ligne = simulees.get(id)!;
          const s = systeme(id, ligne);
          const d = modificationsDecidees(
            s,
            ligne.type,
            items.flatMap((i) => i.modifications),
            items.flatMap((i) => i.tables ?? []),
          );
          if (d.erreurs.length) {
            for (const message of d.erreurs) erreurs.push({ characterId: id, message });
            continue;
          }
          let etat: EtatEntite;
          try {
            const fiche = verifierEtat(s, ligne.etat).fiche;
            etat = appliquerModifications(fiche, d.modifications as Modification[]);
            const attributs = d.modifications.flatMap((m) => ('attribut' in m ? [m.attribut] : []));
            etat = borner(s, etat, new Set(attributs));
            etat = verifierEtat(s, etat).etat;
          } catch (e) {
            erreurs.push({ characterId: id, message: (e as Error).message });
            continue;
          }
          plans.push({ applicationId: a.applicationId, characterId: id, etat });
          simulees.set(id, { ...ligne, etat });
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

      // 2. Écriture, dans l'ordre : chaque fiche part de l'état écrit juste avant
      const courantes = new Map(verrouillees);
      const reponses = new Map<string, ItemApplique[]>();
      for (const p of plans) {
        const a = aTraiter.find((x) => x.applicationId === p.applicationId)!;
        const ligne = courantes.get(p.characterId)!;
        const s = systeme(p.characterId, ligne);
        const change = !deepEqual(etatNormalise(ligne.etat), etatNormalise(p.etat));
        const suivante = change
          ? await enregistrer(
              tx,
              c.ctx,
              catalogue,
              appelant(c, p.characterId, a.userId ?? null, a.campaignId),
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
        reponses.set(p.applicationId, [...(reponses.get(p.applicationId) ?? []), item]);
      }
      for (const a of aTraiter)
        await tx
          .update(applications)
          .set({ response: { items: reponses.get(a.applicationId) ?? [] } })
          .where(eq(applications.applicationId, a.applicationId));
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

async function annulerApplication(
  c: Contexte,
  corps: z.output<typeof CorpsAnnuler>,
  entete: typeof applications.$inferSelect,
): Promise<z.infer<typeof ReponseAnnuler>> {
  const { db, catalogue } = c.deps;
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
    const ids = [...new Set(items.map((i) => i.characterId))].sort();
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

    // Conflits d'abord : rien n'est écrit si une fiche a changé depuis (sauf `force`)
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

    const sortie: ItemAnnule[] = [];
    for (const i of items) {
      const ligne = parId.get(i.characterId);
      if (!ligne) {
        sortie.push({ characterId: i.characterId, status: 'missing', version: null, changes: [] });
        continue;
      }
      const s = systemeDe(catalogue, ligne, c.options.get(i.characterId));
      if (i.revertedAt) {
        sortie.push({
          characterId: i.characterId,
          status: 'already_reverted',
          version: ligne.version,
          changes: [],
          defeated: horsCombat(s, ligne.etat),
        });
        continue;
      }
      const etat = rendus.get(i.characterId)!;
      const change =
        !deltaVide(i.delta as DeltaEtat) && !deepEqual(etatNormalise(ligne.etat), etat);
      const suivante = change
        ? await enregistrer(
            tx,
            c.ctx,
            catalogue,
            appelant(c, i.characterId, userId, entete.campaignId),
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
      sortie.push({
        characterId: i.characterId,
        status: 'reverted',
        version: suivante.version,
        ...(change ? diff(ligne, suivante) : { changes: [] }),
        defeated: horsCombat(s, suivante.etat),
      });
    }
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
      const [entete] = await deps.db
        .select()
        .from(applications)
        .where(eq(applications.applicationId, req.body.applicationId));
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

// ─── Décompte des durées (tickId) ──────────────────────────────────────────────

/** Réponse d'un décompte, gardée pour une reprise du même `tickId`. */
export interface DecompteEnregistre {
  modifie: boolean;
  retirees: string[];
  version: number;
}

/**
 * Décompte idempotent : dans la transaction du décompte, après le verrou de la fiche. Renvoie
 * le décompte déjà fait pour ce `tickId` et ce personnage, s'il y en a un.
 */
export async function decompteDejaFait(
  tx: Tx,
  tickId: string,
  characterId: string,
): Promise<DecompteEnregistre | null> {
  const [entete] = await tx
    .select({ kind: applications.kind })
    .from(applications)
    .where(eq(applications.applicationId, tickId));
  if (entete && entete.kind !== 'tick')
    throw HttpError.conflict(`${tickId} désigne une application, pas un décompte`, 'tick_conflict');
  const [item] = await tx
    .select({ result: applicationItems.result })
    .from(applicationItems)
    .where(
      and(
        eq(applicationItems.applicationId, tickId),
        eq(applicationItems.characterId, characterId),
      ),
    );
  return item ? (item.result as DecompteEnregistre) : null;
}

/** Garde le décompte (delta pour l'annulation, réponse pour une reprise). */
export async function enregistrerDecompte(
  tx: Tx,
  o: {
    tickId: string;
    characterId: string;
    campaignId: string | null;
    userId: string | null;
    avant: EtatEntite;
    apres: EtatEntite;
    resultat: DecompteEnregistre;
  },
) {
  await tx
    .insert(applications)
    .values({ applicationId: o.tickId, kind: 'tick', campaignId: o.campaignId, userId: o.userId })
    .onConflictDoNothing();
  await tx.insert(applicationItems).values({
    applicationId: o.tickId,
    characterId: o.characterId,
    delta: deltaEtat(etatNormalise(o.avant) as EtatEntite, etatNormalise(o.apres) as EtatEntite),
    result: o.resultat,
  });
}
