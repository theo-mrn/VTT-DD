/**
 * Module « archive » (docs/export-campagne.md § 5) : la part de character dans l'export et
 * l'import d'une campagne, appelée par le service archive (secret interne).
 *
 *   POST /internal/campaigns/:campaignId/archive/snapshot   instantané (MJ de la campagne en corps)
 *   POST /internal/campaigns/:campaignId/archive            import (une transaction)
 *
 * Le retrait d'un import manqué passe par `campaign.deleted` (consommateur lifecycle).
 */
import {
  ArchiveOptions,
  ArchiveServiceImport,
  ArchiveServiceSnapshot,
  rowIds,
} from '@vtt/contracts';
import { exportArchiveTables, HttpError, importArchiveTables } from '@vtt/platform';
import { eq } from 'drizzle-orm';
import type { FastifyContextConfig, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import { characters, npcTemplateCategories } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { exigerSecretInterne } from '../../interne/secret.js';
import { ARCHIVE_SCHEMA_VERSION, characterArchiveTables } from './tables.js';

const CampaignId = z.uuid().transform((s) => s.toLowerCase());

const context = (req: FastifyRequest) => ({
  correlationId: req.ctx.correlationId,
  traceparent: (req.headers.traceparent as string | undefined) ?? null,
});

export const register: Module = async (app, deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) return;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const internal = {
    preValidation: exigerSecretInterne(secret),
    config: { rateLimit: { max: 600, timeWindow: '1 minute' } } as FastifyContextConfig,
    bodyLimit: 512 * 1024 ** 2,
  };

  r.post(
    '/internal/campaigns/:campaignId/archive/snapshot',
    {
      ...internal,
      schema: {
        hide: true,
        params: z.object({ campaignId: CampaignId }),
        body: z.object({
          options: ArchiveOptions,
          // MJ de la campagne (connus de campaign seulement)
          gmIds: z
            .array(z.uuid().transform((s) => s.toLowerCase()))
            .min(1)
            .max(50),
        }),
        response: { 200: ArchiveServiceSnapshot },
      },
    },
    async (req) => {
      const { campaignId } = req.params;
      const tables = await db.transaction(
        (tx) =>
          exportArchiveTables(tx, characterArchiveTables, {
            campaignId,
            options: req.body.options,
            gmIds: new Set(req.body.gmIds),
          }),
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
      return { schemaVersion: ARCHIVE_SCHEMA_VERSION, tables, files: [] };
    },
  );

  r.post(
    '/internal/campaigns/:campaignId/archive',
    {
      ...internal,
      schema: {
        hide: true,
        params: z.object({ campaignId: CampaignId }),
        body: ArchiveServiceImport,
        response: { 201: z.object({ written: z.record(z.string(), z.number().int()) }) },
      },
    },
    async (req, reply) => {
      const { campaignId } = req.params;
      const { ownerId, options, tables, foreignIds } = req.body;
      const known = new Set([...rowIds(Object.values(tables)), ...foreignIds, campaignId]);
      const written = await db.transaction(async (tx) => {
        const [already] = await tx
          .select({ id: characters.id })
          .from(characters)
          .where(eq(characters.campaignId, campaignId))
          .limit(1);
        const [category] = await tx
          .select({ id: npcTemplateCategories.id })
          .from(npcTemplateCategories)
          .where(eq(npcTemplateCategories.campaignId, campaignId))
          .limit(1);
        if (already || category)
          throw HttpError.conflict('Campagne déjà importée', 'archive_conflict');
        const result = await importArchiveTables(tx, characterArchiveTables, tables, {
          campaignId,
          ownerId,
          options,
          known,
        });
        await appendEvent(tx, context(req), {
          type: 'character.archive_imported',
          actor: { userId: ownerId, role: 'gm', characterId: null },
          aggregate: { type: 'campaign', id: campaignId },
          payload: { tables: result },
          visibility: 'gm_only',
          roomId: campaignId,
        });
        return result;
      });
      reply.code(201);
      return { written };
    },
  );
};
