/**
 * Module « archive » (docs/export-campagne.md § 5) : la part d'audio dans l'export et l'import
 * d'une campagne, appelée par le service archive (secret interne).
 *
 *   POST /internal/campaigns/:campaignId/archive/snapshot   instantané ; fichiers des sons
 *   POST /internal/campaigns/:campaignId/archive            import (une transaction)
 *
 * Les fichiers des sons sont copiés par archive avant l'import, sous leurs nouvelles clés. Le
 * retrait d'un import manqué passe par `campaign.deleted` (consommateur des campagnes).
 */
import {
  ArchiveOptions,
  ArchiveServiceImport,
  ArchiveServiceSnapshot,
  fileOwner,
  rowIds,
} from '@vtt/contracts';
import {
  exportArchiveTables,
  HttpError,
  importArchiveTables,
  requireInternalSecret,
  type ArchiveTable,
} from '@vtt/platform';
import { eq } from 'drizzle-orm';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appendEvent } from '../../db/outbox.js';
import { assets, playlists } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { eventContext, Uuid } from '../common.js';
import { ARCHIVE_SCHEMA_VERSION, audioArchiveTables } from './tables.js';

const Params = z.object({ campaignId: Uuid('Identifiant de campagne invalide') });

/**
 * Son importé : ses clés de fichiers doivent être dans le dossier de la nouvelle campagne,
 * sinon il est écarté (et ce qui le cite avec lui).
 */
function ownKeysOnly(campaignId: string): ArchiveTable['importRow'] {
  const own = (key: unknown) => {
    if (key === null || key === undefined) return true;
    if (typeof key !== 'string') return false;
    const owner = fileOwner(key);
    return owner?.folder === 'audio/assets' && owner.ownerId === campaignId;
  };
  return (row) => (own(row.originalKey) && own(row.playbackKey) ? row : null);
}

export const register: Module = async (app, deps: Deps) => {
  const secret = deps.config.INTERNAL_API_SECRET;
  if (!secret) return;
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const internal = {
    preValidation: requireInternalSecret(secret),
    config: { rateLimit: { max: 600, timeWindow: '1 minute' } } as FastifyContextConfig,
    bodyLimit: 128 * 1024 ** 2,
  };

  r.post(
    '/internal/campaigns/:campaignId/archive/snapshot',
    {
      ...internal,
      schema: {
        hide: true,
        params: Params,
        body: z.object({
          options: ArchiveOptions,
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
          exportArchiveTables(tx, audioArchiveTables, {
            campaignId,
            options: req.body.options,
            gmIds: new Set(req.body.gmIds),
          }),
        { isolationLevel: 'repeatable read', accessMode: 'read only' },
      );
      const files = (tables.assets ?? []).flatMap((a) =>
        [a.originalKey, a.playbackKey].filter((k): k is string => typeof k === 'string'),
      );
      return { schemaVersion: ARCHIVE_SCHEMA_VERSION, tables, files: [...new Set(files)] };
    },
  );

  r.post(
    '/internal/campaigns/:campaignId/archive',
    {
      ...internal,
      schema: {
        hide: true,
        params: Params,
        body: ArchiveServiceImport,
        response: { 201: z.object({ written: z.record(z.string(), z.number().int()) }) },
      },
    },
    async (req, reply) => {
      const { campaignId } = req.params;
      const { ownerId, options, tables, foreignIds } = req.body;
      const known = new Set([...rowIds(Object.values(tables)), ...foreignIds, campaignId]);
      const specs = audioArchiveTables.map((s) =>
        s.table === assets ? { ...s, importRow: ownKeysOnly(campaignId) } : s,
      );
      const written = await db.transaction(async (tx) => {
        const [asset] = await tx
          .select({ id: assets.id })
          .from(assets)
          .where(eq(assets.campaignId, campaignId))
          .limit(1);
        const [playlist] = await tx
          .select({ id: playlists.id })
          .from(playlists)
          .where(eq(playlists.campaignId, campaignId))
          .limit(1);
        if (asset || playlist)
          throw HttpError.conflict('Campagne déjà importée', 'archive_conflict');
        const result = await importArchiveTables(tx, specs, tables, {
          campaignId,
          ownerId,
          options,
          known,
        });
        await appendEvent(tx, eventContext(req), {
          type: 'audio.archive_imported',
          actor: { userId: ownerId, role: 'gm', characterId: null },
          aggregate: { type: 'campaign', id: campaignId },
          payload: { tables: result },
          visibility: 'gm_only',
          campaignId,
        });
        return result;
      });
      reply.code(201);
      return { written };
    },
  );
};
