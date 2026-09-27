/**
 * Module « templates » : bibliothèque du MJ d'une campagne, reprise de
 * l'ancienne app (npc_templates, object_templates ; contrat :
 * docs/api-templates.md). Réservé au MJ de la campagne, décidé par campaign
 * (`deps.droits.role`) : un non-membre reçoit 404, un joueur 403.
 *
 *   /v1/campaigns/:campaignId/npc-template-categories[/:categoryId]
 *   /v1/campaigns/:campaignId/npc-templates[/:templateId]
 *   /v1/campaigns/:campaignId/object-templates[/:templateId]
 *
 * GET liste, POST crée, PATCH modifie (avec `version`), DELETE supprime.
 */
import { HttpError } from '@vtt/platform';
import type { FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Module } from '../../deps.js';
import {
  categoryApi,
  createCategory,
  createNpcTemplate,
  createObjectTemplate,
  deleteCategory,
  deleteNpcTemplate,
  deleteObjectTemplate,
  listCategories,
  listNpcTemplates,
  listObjectTemplates,
  npcTemplateApi,
  objectTemplateApi,
  templateState,
  updateCategory,
  updateNpcTemplate,
  updateObjectTemplate,
  type Author,
} from './repository.js';
import {
  CampaignId,
  CategoryId,
  CategoryResponse,
  CreateCategory,
  CreateNpcTemplate,
  CreateObjectTemplate,
  NpcTemplateResponse,
  ObjectTemplateResponse,
  TemplateId,
  UpdateCategory,
  UpdateNpcTemplate,
  UpdateObjectTemplate,
} from './schemas.js';

const context = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, catalogue } = deps;
  const auth = { preValidation: app.authenticate };

  /** Vérifie que l'appelant est MJ de la campagne. */
  const gm = async (req: FastifyRequest, campaignId: string): Promise<Author> => {
    const userId = req.user!.userId.toLowerCase();
    const role = await deps.droits.role(campaignId, userId);
    if (!role) throw HttpError.notFound('Campagne introuvable');
    if (role !== 'gm') throw HttpError.forbidden('Réservé au MJ de la campagne');
    return { campaignId, userId };
  };

  const inCampaign = z.object({ campaignId: CampaignId });

  // ─── Catégories de PNJ ─────────────────────────────────────────────────────

  const categories = '/v1/campaigns/:campaignId/npc-template-categories';
  const category = z.object({ campaignId: CampaignId, categoryId: CategoryId });

  r.get(
    categories,
    { ...auth, schema: { params: inCampaign, response: { 200: z.array(CategoryResponse) } } },
    async (req) => {
      const a = await gm(req, req.params.campaignId);
      return (await listCategories(db, a.campaignId)).map(categoryApi);
    },
  );

  r.post(
    categories,
    {
      ...auth,
      schema: { params: inCampaign, body: CreateCategory, response: { 201: CategoryResponse } },
    },
    async (req, reply) => {
      const a = await gm(req, req.params.campaignId);
      const row = await createCategory(db, context(req), a, req.body);
      reply.code(201);
      return categoryApi(row);
    },
  );

  r.patch(
    `${categories}/:categoryId`,
    {
      ...auth,
      schema: { params: category, body: UpdateCategory, response: { 200: CategoryResponse } },
    },
    async (req) => {
      const a = await gm(req, req.params.campaignId);
      const { version, ...patch } = req.body;
      return categoryApi(
        await updateCategory(db, context(req), a, req.params.categoryId, version, patch),
      );
    },
  );

  r.delete(
    `${categories}/:categoryId`,
    { ...auth, schema: { params: category } },
    async (req, reply) => {
      const a = await gm(req, req.params.campaignId);
      await deleteCategory(db, context(req), a, req.params.categoryId);
      reply.code(204);
    },
  );

  // ─── Modèles de PNJ ────────────────────────────────────────────────────────

  const npc = '/v1/campaigns/:campaignId/npc-templates';
  const oneNpc = z.object({ campaignId: CampaignId, templateId: TemplateId });

  r.get(
    npc,
    { ...auth, schema: { params: inCampaign, response: { 200: z.array(NpcTemplateResponse) } } },
    async (req) => {
      const a = await gm(req, req.params.campaignId);
      return (await listNpcTemplates(db, a.campaignId)).map((t) => npcTemplateApi(catalogue, t));
    },
  );

  r.post(
    npc,
    {
      ...auth,
      schema: {
        params: inCampaign,
        body: CreateNpcTemplate,
        response: { 201: NpcTemplateResponse },
      },
    },
    async (req, reply) => {
      const a = await gm(req, req.params.campaignId);
      const { etat, systemeId, type, ...data } = req.body;
      const row = await createNpcTemplate(db, context(req), a, {
        ...data,
        etat: templateState(catalogue, {
          etat,
          ...(systemeId ? { systemeId } : {}),
          ...(type ? { type } : {}),
        }),
      });
      reply.code(201);
      return npcTemplateApi(catalogue, row);
    },
  );

  r.patch(
    `${npc}/:templateId`,
    {
      ...auth,
      schema: { params: oneNpc, body: UpdateNpcTemplate, response: { 200: NpcTemplateResponse } },
    },
    async (req) => {
      const a = await gm(req, req.params.campaignId);
      const { version, etat, ...patch } = req.body;
      const row = await updateNpcTemplate(
        db,
        context(req),
        a,
        req.params.templateId,
        version,
        patch,
        etat === undefined ? undefined : (t) => templateState(catalogue, { etat }, t.systemId),
      );
      return npcTemplateApi(catalogue, row);
    },
  );

  r.delete(`${npc}/:templateId`, { ...auth, schema: { params: oneNpc } }, async (req, reply) => {
    const a = await gm(req, req.params.campaignId);
    await deleteNpcTemplate(db, context(req), a, req.params.templateId);
    reply.code(204);
  });

  // ─── Modèles d'objets ──────────────────────────────────────────────────────

  const objects = '/v1/campaigns/:campaignId/object-templates';
  const oneObject = z.object({ campaignId: CampaignId, templateId: TemplateId });

  r.get(
    objects,
    {
      ...auth,
      schema: { params: inCampaign, response: { 200: z.array(ObjectTemplateResponse) } },
    },
    async (req) => {
      const a = await gm(req, req.params.campaignId);
      return (await listObjectTemplates(db, a.campaignId)).map(objectTemplateApi);
    },
  );

  r.post(
    objects,
    {
      ...auth,
      schema: {
        params: inCampaign,
        body: CreateObjectTemplate,
        response: { 201: ObjectTemplateResponse },
      },
    },
    async (req, reply) => {
      const a = await gm(req, req.params.campaignId);
      const row = await createObjectTemplate(db, context(req), a, req.body);
      reply.code(201);
      return objectTemplateApi(row);
    },
  );

  r.patch(
    `${objects}/:templateId`,
    {
      ...auth,
      schema: {
        params: oneObject,
        body: UpdateObjectTemplate,
        response: { 200: ObjectTemplateResponse },
      },
    },
    async (req) => {
      const a = await gm(req, req.params.campaignId);
      const { version, ...patch } = req.body;
      return objectTemplateApi(
        await updateObjectTemplate(db, context(req), a, req.params.templateId, version, patch),
      );
    },
  );

  r.delete(
    `${objects}/:templateId`,
    { ...auth, schema: { params: oneObject } },
    async (req, reply) => {
      const a = await gm(req, req.params.campaignId);
      await deleteObjectTemplate(db, context(req), a, req.params.templateId);
      reply.code(204);
    },
  );
};
