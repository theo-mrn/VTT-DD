/**
 * Module « archive » (docs/export-campagne.md § 5) : la part de campaign dans l'export et
 * l'import d'une campagne, appelée par le service archive (secret interne, jamais relayé par
 * la gateway). archive vérifie les droits de l'utilisateur avant d'appeler.
 *
 *   GET    /internal/campaigns/:campaignId/archive?keepProgress=   instantané des tables, MJ
 *   POST   /internal/campaigns/:campaignId/archive                  import (une transaction)
 *   DELETE /internal/campaigns/:campaignId/archive?userId=          retrait d'un import manqué
 */
import {
  ArchiveOptions,
  ArchiveServiceImport,
  ArchiveServiceSnapshot,
  fileOwner,
  rowIds,
} from '@vtt/contracts';
import { exportArchiveTables, HttpError, importArchiveTables } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { campaignMembers, campaigns } from '../../db/schema.js';
import type { Module } from '../../deps.js';
import { requireInternalSecret } from '../../internal/secret.js';
import { publicBase } from '../../storage/images.js';
import { newCampaignCode } from '../campaigns/code.js';
import { campaignEvent, campaignNotFound, lockCampaign } from '../campaigns/repository.js';
import { contentFields, searchTextOf } from '../notes/common.js';
import type { SanitizeOptions } from '../notes/html.js';
import { CampaignId, eventContext, UserId } from '../schemas.js';
import { ARCHIVE_SCHEMA_VERSION, campaignArchiveTables } from './tables.js';

type Searchable = Parameters<typeof searchTextOf>[0];

export const register: Module = async (app, deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) return;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const internal = {
    preValidation: requireInternalSecret(secret),
    config: { rateLimit: { max: 600, timeWindow: '1 minute' } } as FastifyContextConfig,
    // Une archive peut peser plusieurs dizaines de Mo de lignes
    bodyLimit: 512 * 1024 ** 2,
  };
  const noteOptions: SanitizeOptions = { imageBase: publicBase(deps.config.R2_PUBLIC_URL) };

  const tables = campaignArchiveTables({
    campaignRow: (row) => ({ ...row, code: newCampaignCode(), isPublic: false }),
    noteRow: (row) => {
      const fields = contentFields(String(row.content ?? ''), noteOptions, true);
      const searchable = {
        title: String(row.title ?? ''),
        tags: Array.isArray(row.tags) ? (row.tags as Searchable['tags']) : [],
        race: (row.race as string | null) ?? null,
        class: (row.class as string | null) ?? null,
        region: (row.region as string | null) ?? null,
        itemType: (row.itemType as string | null) ?? null,
        subQuests: Array.isArray(row.subQuests) ? (row.subQuests as Searchable['subQuests']) : [],
      };
      return { ...row, ...fields, searchText: searchTextOf(searchable, fields.plainText) };
    },
    ownsKey: (key, known) => {
      const owner = fileOwner(key);
      return !!owner && known.has(owner.ownerId.toLowerCase());
    },
  });

  r.get(
    '/internal/campaigns/:campaignId/archive',
    {
      ...internal,
      schema: {
        hide: true,
        params: z.object({ campaignId: CampaignId }),
        querystring: z.object({ keepProgress: z.stringbool() }),
        response: {
          200: ArchiveServiceSnapshot.extend({
            // MJ de la campagne : character et audio en ont besoin pour leur instantané
            gmIds: z.array(z.uuid()),
          }),
        },
      },
    },
    async (req) => {
      const { campaignId } = req.params;
      const options: ArchiveOptions = { keepProgress: req.query.keepProgress };
      return db.transaction(
        async (tx) => {
          const [campaign] = await tx
            .select({ ownerId: campaigns.ownerId })
            .from(campaigns)
            .where(eq(campaigns.id, campaignId));
          if (!campaign) throw campaignNotFound();
          const gms = await tx
            .select({ userId: campaignMembers.userId })
            .from(campaignMembers)
            .where(and(eq(campaignMembers.campaignId, campaignId), eq(campaignMembers.role, 'gm')));
          const gmIds = new Set([campaign.ownerId, ...gms.map((g) => g.userId)]);
          const snapshot = await exportArchiveTables(tx, tables, { campaignId, options, gmIds });
          const files = (snapshot.campaign_storage_files ?? []).map((f) => String(f.key));
          return {
            schemaVersion: ARCHIVE_SCHEMA_VERSION,
            tables: snapshot,
            files,
            gmIds: [...gmIds],
          };
        },
        // Instantané cohérent de toutes les tables
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
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
      const { ownerId, options, tables: rows, foreignIds } = req.body;
      if ((rows.campaigns ?? []).length !== 1)
        throw HttpError.badRequest('L’archive doit contenir une campagne', 'archive_invalid');
      const systemId = String(rows.campaigns![0]!.systemId ?? '');
      if (!deps.catalog.system(systemId))
        throw new HttpError(
          422,
          'Refusé',
          'archive_unknown_system',
          `Système inconnu : ${systemId}`,
        );
      const known = new Set([...rowIds(Object.values(rows)), ...foreignIds, campaignId]);
      if (!known.has(campaignId)) throw HttpError.badRequest('Campagne absente', 'archive_invalid');

      const written = await db.transaction(async (tx) => {
        const [exists] = await tx
          .select({ id: campaigns.id })
          .from(campaigns)
          .where(eq(campaigns.id, campaignId));
        if (exists) throw HttpError.conflict('Campagne déjà importée', 'archive_conflict');
        const result = await importArchiveTables(tx, tables, rows, {
          campaignId,
          ownerId,
          options,
          known,
        });
        const [created] = await tx.select().from(campaigns).where(eq(campaigns.id, campaignId));
        if (!created) throw HttpError.badRequest('Campagne illisible', 'archive_invalid');
        await tx.insert(campaignMembers).values({ campaignId, userId: ownerId, role: 'gm' });
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.created',
          campaignId,
          userId: ownerId,
          role: 'gm',
          payload: {
            name: created.name,
            code: created.code,
            isPublic: created.isPublic,
            system: { id: created.systemId, version: created.systemVersion },
            pitch: created.pitch,
            accent: created.accent,
            tags: created.tags,
            imageUrl: created.imageUrl,
            source: 'archive',
          },
        });
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.archive_imported',
          campaignId,
          userId: ownerId,
          role: 'gm',
          payload: { tables: result, keepProgress: options.keepProgress },
          visibility: 'gm_only',
        });
        return result;
      });
      reply.code(201);
      return { written };
    },
  );

  r.delete(
    '/internal/campaigns/:campaignId/archive',
    {
      ...internal,
      schema: {
        hide: true,
        params: z.object({ campaignId: CampaignId }),
        querystring: z.object({ userId: UserId }),
      },
    },
    async (req, reply) => {
      const { campaignId } = req.params;
      const { userId } = req.query;
      await db.transaction(async (tx) => {
        await lockCampaign(tx, campaignId);
        const [campaign] = await tx
          .select({ name: campaigns.name, ownerId: campaigns.ownerId })
          .from(campaigns)
          .where(eq(campaigns.id, campaignId));
        if (!campaign) return;
        if (campaign.ownerId !== userId)
          throw HttpError.forbidden('Seul qui a importé la campagne peut la retirer');
        // Comme DELETE /v1/campaigns/:id : la cascade emporte le contenu, l'événement
        // prévient character et audio, et les fichiers partent avec la passe des orphelins
        await tx.delete(campaigns).where(eq(campaigns.id, campaignId));
        await campaignEvent(tx, eventContext(req), {
          type: 'campaign.deleted',
          campaignId,
          userId,
          role: 'gm',
          payload: { name: campaign.name, reason: 'archive_import_failed' },
        });
      });
      reply.code(204);
    },
  );
};
