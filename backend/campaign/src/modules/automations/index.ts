/**
 * Module « automations » : règles du moteur des automatismes (docs/automatismes.md), MJ seulement.
 *
 *   GET|POST /v1/campaigns/:id/automation-rules, PATCH|DELETE …/:ruleId
 *   POST     /v1/campaigns/:id/automation-rules/:ruleId/run   applique ses actions tout de suite
 *   GET      /v1/campaigns/:id/automation-runs                journal des 50 dernières exécutions
 *
 * L'exécution vit dans `executor.ts` (consommateur du bus et ouvrier). Chaque écriture de règle
 * publie `automation_rule.*` (MJ seulement) et replace les échéances de la campagne.
 */
import {
  CreateAutomationRule,
  UpdateAutomationRule,
  uuidv7,
  type AutomationRule,
  type AutomationRun,
} from '@vtt/contracts';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { automationRules, automationRuns } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  mapEvent,
  notFound,
  requestContext,
  requireGm,
  versionConflict,
  viewerOf,
} from '../maps/common.js';
import { CampaignId, Uuid } from '../schemas.js';
import { reschedule, runRule } from './executor.js';

type Row = typeof automationRules.$inferSelect;

export const ruleApi = (r: Row): AutomationRule => ({
  id: r.id,
  name: r.name,
  enabled: r.enabled,
  trigger: r.trigger,
  conditions: r.conditions,
  actions: r.actions,
  cooldownSec: r.cooldownSec,
  once: r.once,
  sortOrder: r.sortOrder,
  lastRunAt: r.lastRunAt?.toISOString() ?? null,
  version: r.version,
  updatedAt: r.updatedAt.toISOString(),
});

const runApi = (r: typeof automationRuns.$inferSelect): AutomationRun => ({
  id: r.id,
  ruleId: r.ruleId,
  ruleName: r.ruleName,
  trigger: r.trigger,
  ok: r.ok,
  error: r.error,
  at: r.at.toISOString(),
});

const Params = z.object({ id: CampaignId });
const RuleParams = z.object({ id: CampaignId, ruleId: Uuid('Identifiant de règle invalide') });

export const register: Module = async (app, { db }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = { preValidation: app.authenticate };
  const where = (campaignId: string, ruleId: string) =>
    and(eq(automationRules.id, ruleId), eq(automationRules.campaignId, campaignId));

  r.get(
    '/v1/campaigns/:id/automation-rules',
    { ...auth, schema: { params: Params } },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      requireGm(v);
      const rows = await db
        .select()
        .from(automationRules)
        .where(eq(automationRules.campaignId, v.access.campaign.id))
        .orderBy(asc(automationRules.sortOrder), asc(automationRules.createdAt));
      return { items: rows.map(ruleApi) };
    },
  );

  r.get(
    '/v1/campaigns/:id/automation-runs',
    { ...auth, schema: { params: Params } },
    async (req) => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      requireGm(v);
      const rows = await db
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.campaignId, v.access.campaign.id))
        .orderBy(desc(automationRuns.at))
        .limit(50);
      return { items: rows.map(runApi) };
    },
  );

  r.post(
    '/v1/campaigns/:id/automation-rules',
    { ...auth, schema: { params: Params, body: CreateAutomationRule } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const row = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const [rule] = await tx
          .insert(automationRules)
          .values({ id: uuidv7(), campaignId: v.access.campaign.id, ...req.body })
          .returning();
        await mapEvent(tx, ctx, v, {
          type: 'automation_rule.created',
          aggregate: { type: 'automation_rule', id: rule!.id },
          payload: ruleApi(rule!),
          visibility: 'gm_only',
        });
        await reschedule(tx, v.access.campaign.id);
        return rule!;
      });
      reply.code(201);
      return ruleApi(row);
    },
  );

  r.patch(
    '/v1/campaigns/:id/automation-rules/:ruleId',
    { ...auth, schema: { params: RuleParams, body: UpdateAutomationRule } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const { version, ...changes } = req.body;
        const w = where(v.access.campaign.id, req.params.ruleId);
        const [before] = await tx.select().from(automationRules).where(w).for('update');
        if (!before) throw notFound('Règle');
        if (version !== undefined && version !== before.version) throw versionConflict();
        const [rule] = await tx
          .update(automationRules)
          .set({ ...changes, version: sql`${automationRules.version} + 1`, updatedAt: sql`now()` })
          .where(w)
          .returning();
        await mapEvent(tx, ctx, v, {
          type: 'automation_rule.updated',
          aggregate: { type: 'automation_rule', id: rule!.id },
          payload: ruleApi(rule!),
          visibility: 'gm_only',
        });
        await reschedule(tx, v.access.campaign.id);
        return ruleApi(rule!);
      });
    },
  );

  r.delete(
    '/v1/campaigns/:id/automation-rules/:ruleId',
    { ...auth, schema: { params: RuleParams } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const [rule] = await tx
          .delete(automationRules)
          .where(where(v.access.campaign.id, req.params.ruleId))
          .returning({ id: automationRules.id });
        if (!rule) throw notFound('Règle');
        await mapEvent(tx, ctx, v, {
          type: 'automation_rule.deleted',
          aggregate: { type: 'automation_rule', id: rule.id },
          payload: { id: rule.id },
          visibility: 'gm_only',
        });
        await reschedule(tx, v.access.campaign.id);
      });
      reply.code(204);
    },
  );

  r.post(
    '/v1/campaigns/:id/automation-rules/:ruleId/run',
    { ...auth, schema: { params: RuleParams } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        requireGm(v);
        const [rule] = await tx
          .select()
          .from(automationRules)
          .where(where(v.access.campaign.id, req.params.ruleId));
        if (!rule) throw notFound('Règle');
        // Essai du MJ : ses actions tout de suite, sans déclencheur ni condition ni limite
        await runRule(tx, { ...rule, once: false }, 'manual', 0);
        await mapEvent(tx, ctx, v, {
          type: 'automation_rule.ran',
          aggregate: { type: 'automation_rule', id: rule.id },
          payload: { id: rule.id },
          visibility: 'gm_only',
        });
      });
      reply.code(204);
    },
  );
};
