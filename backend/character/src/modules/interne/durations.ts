/**
 * Décompte des durées d'un passage de tour (docs/combat.md § 18.4) : route interne appelée par
 * campaign, une fois par passage.
 *
 *   POST /internal/durations/tick   événements du passage (début et fin de tour d'un
 *        personnage, fin de round, fin du combat) appliqués aux durées des participants, dans
 *        une seule transaction ; idempotent par `tickId` (une reprise, ou une requête concurrente,
 *        rend la réponse d'origine) ; annulable par /internal/modifications/revert
 *        (`applicationId = tickId`)
 *
 * Seules les fiches dont une durée change sont réécrites (`character.updated`, opération
 * `durees.decompte`, aux MJ de la campagne et au joueur qui incarne le personnage).
 */
import { DurationEvent, ExpiredDuration, compareCodeUnits } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { decompterDurees, type EtatEntite, type EvenementDuree } from '@vtt/rules';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { EventContext, Tx } from '../../db/outbox.js';
import { applicationItems, applications, characters } from '../../db/schema.js';
import type { Deps, ServiceApp } from '../../deps.js';
import { deltaEtat } from '../../regles/combat.js';
import { enregistrer, etatNormalise, systemeDe, type Ligne } from '../personnages/depot.js';
import { appelantDe, preparerContexte, type Contexte } from './modifications.js';

const Id = z.uuid('Identifiant invalide').transform((s) => s.toLowerCase());

const Corps = z.object({
  /** `tick:<combatId>:<round>:<passage>`, `tick:<combatId>:end`… : un décompte par passage. */
  tickId: z.string().trim().min(1).max(200),
  campaignId: Id,
  /** Qui a fait passer le tour (événements) ; absent : le système. */
  userId: Id.nullable().optional(),
  /** Participants du combat : les fiches décomptées, et les seules ancres valables. */
  characterIds: z
    .array(Id)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Participant en double'),
  events: z.array(DurationEvent).max(50),
});
type Corps = z.output<typeof Corps>;

const Item = z.object({
  characterId: z.string(),
  version: z.number().int(),
  expired: z.array(ExpiredDuration),
});
type Item = z.infer<typeof Item>;

const Reponse = z.object({ tickId: z.string(), replayed: z.boolean(), items: z.array(Item) });
type Reponse = z.infer<typeof Reponse>;

/** Événement du contrat → moteur de règles. */
export function versEvenement(e: DurationEvent): EvenementDuree {
  switch (e.kind) {
    case 'turn_start':
      return { type: 'debut-tour', personnage: e.characterId.toLowerCase() };
    case 'turn_end':
      return { type: 'fin-tour', personnage: e.characterId.toLowerCase() };
    case 'round_end':
      return { type: 'fin-round' };
    default:
      return { type: 'fin-combat' };
  }
}

/** Réponse d'un décompte déjà enregistré (reprise, ou pierre tombale d'un « Précédent »). */
async function dejaFait(tx: Tx, tickId: string): Promise<Reponse> {
  const [entete] = await tx
    .select()
    .from(applications)
    .where(eq(applications.applicationId, tickId));
  if (!entete || entete.kind !== 'tick')
    throw HttpError.conflict(`${tickId} désigne une application, pas un décompte`, 'tick_conflict');
  const items = (entete.response as { items?: Item[] } | null)?.items ?? [];
  return { tickId, replayed: true, items };
}

/** Décompte d'une fiche : réécrite seulement si une durée change ; renvoie son item. */
async function decompterFiche(
  c: Contexte,
  tx: Tx,
  corps: Corps,
  ligne: Ligne,
  evenements: EvenementDuree[],
): Promise<Item | null> {
  const { catalogue } = c.deps;
  const options = c.options.get(ligne.id);
  const systeme = systemeDe(catalogue, ligne, options);
  const { etat, expirees } = decompterDurees(ligne.etat, evenements, {
    porteur: ligne.id,
    participants: corps.characterIds,
    systeme,
  });
  if (!etat) return null;
  const suivante = await enregistrer(
    tx,
    c.ctx,
    catalogue,
    appelantDe(c, ligne.id, corps.userId ?? null, corps.campaignId),
    ligne,
    { etat },
    {
      operation: 'durees.decompte',
      details: { retirees: expirees.map((x) => x.cle), tickId: corps.tickId },
    },
    options,
  );
  const item: Item = {
    characterId: ligne.id,
    version: suivante.version,
    expired: expirees.map((x) => ({ key: x.cle, name: x.nom })),
  };
  await tx.insert(applicationItems).values({
    applicationId: corps.tickId,
    characterId: ligne.id,
    delta: deltaEtat(
      etatNormalise(ligne.etat) as EtatEntite,
      etatNormalise(suivante.etat) as EtatEntite,
    ),
    result: item,
  });
  return item;
}

async function decompter(c: Contexte, corps: Corps): Promise<Reponse> {
  const evenements = corps.events.map(versEvenement);
  return c.deps.db.transaction(async (tx) => {
    // En-tête d'abord : une reprise concurrente attend la fin de cette transaction
    const inseree = await tx
      .insert(applications)
      .values({
        applicationId: corps.tickId,
        kind: 'tick',
        campaignId: corps.campaignId,
        userId: corps.userId ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: applications.applicationId });
    if (!inseree.length) return dejaFait(tx, corps.tickId);

    // Fiches verrouillées dans l'ordre des identifiants ; un personnage supprimé est ignoré
    const ids = [...corps.characterIds].sort(compareCodeUnits);
    const lignes = evenements.length
      ? await tx
          .select()
          .from(characters)
          .where(and(inArray(characters.id, ids), isNull(characters.deletedAt)))
          .orderBy(characters.id)
          .for('update')
      : [];
    const items: Item[] = [];
    for (const ligne of lignes) {
      const item = await decompterFiche(c, tx, corps, ligne, evenements);
      if (item) items.push(item);
    }
    await tx
      .update(applications)
      .set({ response: { items } })
      .where(eq(applications.applicationId, corps.tickId));
    return { tickId: corps.tickId, replayed: false, items };
  });
}

export function registerDurationRoutes(
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
    '/internal/durations/tick',
    { ...guard, schema: { hide: true, body: Corps, response: { 200: Reponse } } },
    async (req) => {
      const c = await preparerContexte(
        deps,
        contexte(req),
        req.body.characterIds.map((characterId) => ({
          characterId,
          userId: req.body.userId ?? null,
          campaignId: req.body.campaignId,
        })),
      );
      return decompter(c, req.body);
    },
  );
}
