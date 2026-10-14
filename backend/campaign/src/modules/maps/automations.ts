/**
 * Automatismes de la table (docs/automatismes.md), MJ seulement :
 *   GET|POST /v1/campaigns/:id/automations, PATCH|DELETE …/:automationId
 *
 * Un automatisme est un réglage complet (son, météo, écran, temps du monde) avec ses
 * déclencheurs et les scènes où il est proposé ; le client du MJ l'applique. Chaque écriture
 * publie `automation.*` (MJ seulement), pour les autres onglets et MJ de la campagne.
 */
import { CreateAutomation, UpdateAutomation, uuidv7, type Automation } from '@vtt/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { automations } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { CampaignId, Uuid } from '../schemas.js';
import {
  mapEvent,
  notFound,
  requestContext,
  requireGm,
  versionConflict,
  viewerOf,
} from './common.js';

type Row = typeof automations.$inferSelect;

export const automationApi = (a: Row): Automation => ({
  id: a.id,
  name: a.name,
  params: a.params,
  triggers: a.triggers,
  sceneIds: a.sceneIds,
  sortOrder: a.sortOrder,
  version: a.version,
  updatedAt: a.updatedAt.toISOString(),
});

const Params = z.object({ id: CampaignId });
const ItemParams = z.object({
  id: CampaignId,
  automationId: Uuid('Identifiant d’automatisme invalide'),
});

export const registerAutomations: Module = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = { preValidation: app.authenticate };

  r.get('/v1/campaigns/:id/automations', { ...auth, schema: { params: Params } }, async (req) => {
    const { userId } = requestContext(req);
    const v = await viewerOf(db, req.params.id, userId);
    requireGm(v);
    const rows = await db
      .select()
      .from(automations)
      .where(eq(automations.campaignId, v.access.campaign.id))
      .orderBy(asc(automations.sortOrder), asc(automations.createdAt), asc(automations.id));
    return { items: rows.map(automationApi) };
  });

  r.post(
    '/v1/campaigns/:id/automations',
    { ...auth, schema: { params: Params, body: CreateAutomation } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const row = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const [a] = await tx
          .insert(automations)
          .values({ id: uuidv7(), campaignId: v.access.campaign.id, ...req.body })
          .returning();
        await mapEvent(tx, ctx, v, {
          type: 'automation.created',
          aggregate: { type: 'automation', id: a!.id },
          payload: automationApi(a!),
          visibility: 'gm_only',
        });
        return a!;
      });
      reply.code(201);
      return automationApi(row);
    },
  );

  r.patch(
    '/v1/campaigns/:id/automations/:automationId',
    { ...auth, schema: { params: ItemParams, body: UpdateAutomation } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const { version, ...changes } = req.body;
        const where = and(
          eq(automations.id, req.params.automationId),
          eq(automations.campaignId, v.access.campaign.id),
        );
        const [before] = await tx.select().from(automations).where(where).for('update');
        if (!before) throw notFound('Automatisme');
        if (version !== undefined && version !== before.version) throw versionConflict();
        const [a] = await tx
          .update(automations)
          .set({ ...changes, version: sql`${automations.version} + 1`, updatedAt: sql`now()` })
          .where(where)
          .returning();
        await mapEvent(tx, ctx, v, {
          type: 'automation.updated',
          aggregate: { type: 'automation', id: a!.id },
          payload: automationApi(a!),
          visibility: 'gm_only',
        });
        return automationApi(a!);
      });
    },
  );

  r.delete(
    '/v1/campaigns/:id/automations/:automationId',
    { ...auth, schema: { params: ItemParams } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const [a] = await tx
          .delete(automations)
          .where(
            and(
              eq(automations.id, req.params.automationId),
              eq(automations.campaignId, v.access.campaign.id),
            ),
          )
          .returning({ id: automations.id });
        if (!a) throw notFound('Automatisme');
        await mapEvent(tx, ctx, v, {
          type: 'automation.deleted',
          aggregate: { type: 'automation', id: a.id },
          payload: { id: a.id },
          visibility: 'gm_only',
        });
      });
      reply.code(204);
    },
  );
};
