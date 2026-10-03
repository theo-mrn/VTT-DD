/**
 * Routes internes des instances de PNJ et du butin de la carte (docs/carte.md § 12),
 * appelées par campaign avec le secret partagé ; campaign a déjà vérifié les droits
 * (MJ pour les PNJ, joueur à portée pour le butin).
 *
 *   POST /internal/npcs                                 créer N personnages PNJ du MJ
 *   POST /internal/npcs/delete                          supprimer des instances (compensation,
 *                                                       « supprimer aussi le personnage »)
 *   POST /internal/characters/:id/possessions/receive   ajouter un objet pris sur la carte
 *
 * Une instance est un vrai personnage (`kind` npc), possédé par le MJ, à l'état complet
 * (création terminée), avec son origine (`template_id`, `campaign_id`). Ses événements
 * sont publiés dans la campagne, pour les MJ seulement.
 */
import { NPC_UNDO_HOURS, uuidv7 } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import type { EtatEntite } from '@vtt/rules';
import { and, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import { characters, npcTemplates, type CharacterDetails } from '../../db/schema.js';
import type { Deps, ServiceApp } from '../../deps.js';
import { Valeurs, verifierEtat } from '../../regles/operations.js';
import { baseName, bestiaryState, npcNames, quickState, receiveLoot } from '../../regles/npc.js';
import { enregistrer, systemeDe, verrouiller } from '../personnages/depot.js';
import type { SheetLayout } from '../personnages/layout.js';

const Uuid = z.uuid().transform((s) => s.toLowerCase());
const SystemId = z.string().min(1).max(200);
const HttpUrl = z.url({ protocol: /^https?$/ }).max(2048);

const Source = z.union([
  z.object({ templateId: Uuid }),
  z.object({ bestiary: z.object({ systemeId: SystemId, key: z.string().min(1).max(200) }) }),
  z.object({
    quick: z.object({
      name: z.string().trim().min(1).max(100),
      imageUrl: z.string().max(2048).nullable().optional(),
      type: SystemId,
      valeurs: Valeurs.optional(),
    }),
  }),
  /** Copie de l'état actuel d'une instance (dupliquer un PNJ posé). */
  z.object({ characterId: Uuid }),
]);

const Created = z.object({
  id: z.string(),
  nom: z.string(),
  avatarUrl: z.string().nullable(),
  /** Image du token (modèle) ; null : l'avatar. */
  tokenUrl: z.string().nullable(),
  templateId: z.string().nullable(),
});

const notFound = (what: string) => HttpError.notFound(`${what} introuvable`);
const mismatch = (a: string, b: string) =>
  new HttpError(
    422,
    'Refusé',
    'system_mismatch',
    `Système ${a}, la campagne joue ${b} : impossible de l’y poser`,
  );

/** Image acceptée comme avatar d'un personnage (URL http(s), comme PATCH /v1/characters). */
const avatarOf = (url: string | null | undefined) =>
  url && HttpUrl.safeParse(url).success ? url : null;

const context = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

interface Base {
  nom: string;
  avatarUrl: string | null;
  tokenUrl: string | null;
  templateId: string | null;
  etat: EtatEntite;
  details?: CharacterDetails;
  sheetLayout?: SheetLayout | null;
}

export function registerNpcRoutes(
  app: ServiceApp,
  deps: Deps,
  guard: {
    preValidation: (req: FastifyRequest) => Promise<void>;
    config: FastifyContextConfig;
  },
) {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalogue } = deps;

  /** Modèle, créature, création rapide ou instance à copier → état de départ des instances. */
  async function resolve(
    source: z.output<typeof Source>,
    o: { ownerId: string; campaignId: string; systemId: string },
  ): Promise<Base> {
    const systeme = catalogue.charge(o.systemId);
    if (!systeme) throw HttpError.badRequest(`Système inconnu : ${o.systemId}`, 'systeme_inconnu');
    if ('templateId' in source) {
      const [t] = await db
        .select()
        .from(npcTemplates)
        .where(
          and(eq(npcTemplates.id, source.templateId), eq(npcTemplates.campaignId, o.campaignId)),
        );
      if (!t) throw notFound('Modèle de PNJ');
      if (t.systemId !== o.systemId) throw mismatch(t.systemId, o.systemId);
      return {
        nom: t.name,
        avatarUrl: avatarOf(t.imageUrl),
        tokenUrl: t.tokenUrl,
        templateId: t.id,
        etat: verifierEtat(systeme, { ...t.etat, creation: false }).etat,
      };
    }
    if ('bestiary' in source) {
      const { systemeId, key } = source.bestiary;
      if (systemeId !== o.systemId) throw mismatch(systemeId, o.systemId);
      const creature = catalogue.bestiaire?.(systemeId)?.creatures.find((c) => c.id === key);
      if (!creature) throw notFound('Créature du bestiaire');
      const image = avatarOf(creature.image);
      return {
        nom: creature.nom,
        avatarUrl: image,
        tokenUrl: null,
        templateId: null,
        etat: bestiaryState(systeme, creature),
        // Précision imprimée (« Bête (grande) ») et texte du livre dans la présentation libre
        details: {
          concept: (creature.type ?? '').slice(0, 160),
          backstory: (creature.description ?? '').slice(0, 8000),
        },
      };
    }
    if ('quick' in source) {
      const q = source.quick;
      return {
        nom: q.name,
        avatarUrl: avatarOf(q.imageUrl),
        tokenUrl: q.imageUrl ?? null,
        templateId: null,
        etat: quickState(systeme, q.type, q.valeurs ?? {}),
      };
    }
    const [c] = await db
      .select()
      .from(characters)
      .where(
        and(
          eq(characters.id, source.characterId),
          eq(characters.ownerId, o.ownerId),
          eq(characters.kind, 'npc'),
          isNull(characters.deletedAt),
        ),
      );
    if (!c) throw notFound('PNJ');
    if (c.systemId !== o.systemId) throw mismatch(c.systemId, o.systemId);
    return {
      nom: baseName(c.nom),
      avatarUrl: c.avatarUrl,
      tokenUrl: null,
      templateId: c.templateId,
      etat: c.etat,
      details: c.details,
      sheetLayout: c.sheetLayout ?? null,
    };
  }

  r.post(
    '/internal/npcs',
    {
      ...guard,
      schema: {
        hide: true,
        body: z.object({
          ownerId: Uuid,
          campaignId: Uuid,
          systemId: SystemId,
          count: z.number().int().min(1).max(20),
          source: Source,
        }),
        response: { 201: z.object({ items: z.array(Created) }) },
      },
    },
    async (req, reply) => {
      const { ownerId, campaignId, systemId, count, source } = req.body;
      const base = await resolve(source, { ownerId, campaignId, systemId });
      const ctx = context(req);
      const rows = await db.transaction(async (tx) => {
        // Numérotation propre à la campagne, sans course entre deux poses simultanées
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`npc-names:${campaignId}`}))`);
        const escaped = base.nom.replace(/[\\%_]/g, (ch) => `\\${ch}`);
        const existing = await tx
          .select({ nom: characters.nom })
          .from(characters)
          .where(
            and(
              eq(characters.campaignId, campaignId),
              eq(characters.kind, 'npc'),
              isNull(characters.deletedAt),
              like(characters.nom, `${escaped}%`),
            ),
          );
        const names = npcNames(
          base.nom,
          existing.map((e) => e.nom),
          count,
        );
        const inserted = await tx
          .insert(characters)
          .values(
            names.map((nom) => ({
              id: uuidv7(),
              ownerId,
              nom,
              avatarUrl: base.avatarUrl,
              systemId: base.etat.systeme.id,
              systemVersion: base.etat.systeme.version,
              type: base.etat.type,
              etat: base.etat,
              kind: 'npc' as const,
              templateId: base.templateId,
              campaignId,
              ...(base.details ? { details: base.details } : {}),
              ...(base.sheetLayout ? { sheetLayout: base.sheetLayout } : {}),
            })),
          )
          .returning();
        for (const c of inserted)
          await appendEvent(tx, ctx, {
            type: 'character.created',
            roomId: campaignId,
            visibility: 'gm_only',
            actor: { userId: ownerId, role: 'gm', characterId: c.id },
            aggregate: { type: 'character', id: c.id },
            payload: {
              version: 1,
              nom: c.nom,
              systeme: c.etat.systeme,
              type: c.type,
              kind: 'npc',
              templateId: c.templateId,
            },
          });
        return inserted;
      });
      reply.code(201);
      return {
        items: rows.map((c) => ({
          id: c.id,
          nom: c.nom,
          avatarUrl: c.avatarUrl,
          tokenUrl: base.tokenUrl,
          templateId: c.templateId,
        })),
      };
    },
  );

  r.post(
    '/internal/npcs/delete',
    {
      ...guard,
      schema: {
        hide: true,
        body: z.object({ ids: z.array(Uuid).min(1).max(200), userId: Uuid, roomId: Uuid }),
        response: { 200: z.object({ deleted: z.array(z.string()) }) },
      },
    },
    async (req) => {
      const { ids, userId, roomId } = req.body;
      const ctx = context(req);
      const deleted = await db.transaction(async (tx) => {
        // Seulement des PNJ de cette campagne, ou du MJ qui le demande
        const rows = await tx
          .update(characters)
          .set({
            deletedAt: sql`now()`,
            version: sql`${characters.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              inArray(characters.id, ids),
              eq(characters.kind, 'npc'),
              isNull(characters.deletedAt),
              or(eq(characters.campaignId, roomId), eq(characters.ownerId, userId)),
            ),
          )
          .returning({ id: characters.id, version: characters.version });
        for (const c of rows)
          await appendEvent(tx, ctx, {
            type: 'character.deleted',
            roomId,
            visibility: 'gm_only',
            actor: { userId, role: 'gm', characterId: c.id },
            aggregate: { type: 'character', id: c.id },
            payload: { version: c.version },
          });
        return rows.map((c) => c.id);
      });
      return { deleted };
    },
  );

  // Annuler une suppression (Ctrl+Z du MJ) : la fiche revient telle quelle, tant que la purge
  // ne l'a pas effacée (NPC_UNDO_HOURS)
  r.post(
    '/internal/npcs/restore',
    {
      ...guard,
      schema: {
        hide: true,
        body: z.object({ ids: z.array(Uuid).min(1).max(200), userId: Uuid, roomId: Uuid }),
        response: { 200: z.object({ restored: z.array(z.string()) }) },
      },
    },
    async (req) => {
      const { ids, userId, roomId } = req.body;
      const ctx = context(req);
      const restored = await db.transaction(async (tx) => {
        const rows = await tx
          .update(characters)
          .set({
            deletedAt: null,
            version: sql`${characters.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              inArray(characters.id, ids),
              eq(characters.kind, 'npc'),
              isNotNull(characters.deletedAt),
              sql`${characters.deletedAt} > now() - make_interval(hours => ${NPC_UNDO_HOURS})`,
              or(eq(characters.campaignId, roomId), eq(characters.ownerId, userId)),
            ),
          )
          .returning({ id: characters.id, version: characters.version });
        for (const c of rows)
          await appendEvent(tx, ctx, {
            type: 'character.restored',
            roomId,
            visibility: 'gm_only',
            actor: { userId, role: 'gm', characterId: c.id },
            aggregate: { type: 'character', id: c.id },
            payload: { version: c.version },
          });
        return rows.map((c) => c.id);
      });
      return { restored };
    },
  );

  r.post(
    '/internal/characters/:id/possessions/receive',
    {
      ...guard,
      schema: {
        hide: true,
        params: z.object({ id: Uuid }),
        body: z.object({
          item: z.object({
            ref: z.string().min(1).max(200).optional(),
            name: z.string().trim().min(1).max(200),
            description: z.string().max(10_000).optional(),
            quantity: z.number().int().min(1).max(1_000_000),
          }),
          /** Qui prend (joueur qui incarne le personnage, ou MJ). */
          userId: Uuid,
          roomId: Uuid,
          /** Membre qui incarne le personnage dans la campagne : il voit sa fiche changer. */
          playerId: Uuid.nullable().optional(),
        }),
        response: {
          200: z.object({
            version: z.number().int(),
            entree: z.string(),
            exemplaire: z.string().optional(),
          }),
        },
      },
    },
    async (req) => {
      const { item, userId, roomId, playerId } = req.body;
      const options = await deps.droits.options(req.params.id);
      return db.transaction(async (tx) => {
        const [ligne] = await verrouiller(tx, [req.params.id]);
        const loot = receiveLoot(systemeDe(catalogue, ligne!, options), ligne!.etat, item);
        const suivante = await enregistrer(
          tx,
          context(req),
          catalogue,
          { userId, role: userId === playerId ? 'user' : 'gm', roomId, joueur: playerId ?? null },
          ligne!,
          { etat: loot.etat },
          {
            operation: 'possession.butin',
            details: {
              butin: {
                entree: loot.entree,
                ...(loot.exemplaire !== undefined ? { exemplaire: loot.exemplaire } : {}),
                quantity: item.quantity,
                name: item.name,
              },
            },
          },
          options,
        );
        return {
          version: suivante.version,
          entree: loot.entree,
          ...(loot.exemplaire !== undefined ? { exemplaire: loot.exemplaire } : {}),
        };
      });
    },
  );
}
