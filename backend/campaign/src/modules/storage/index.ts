/**
 * Module « storage » (docs/stockage.md) :
 *
 *   GET    /v1/campaigns/:id/storage?refresh=1        MJ : jauge, répartition, fichiers
 *   DELETE /v1/campaigns/:id/storage/files?key=       MJ : supprime un fichier inutilisé
 *   POST   /internal/storage/reserve                  character, audio : place d'un envoi
 *
 * L'écran refait l'inventaire s'il date de plus de 10 minutes (ou sur demande) ; un service
 * injoignable n'empêche pas de répondre avec le dernier inventaire.
 */
import { CampaignStorage, ReserveStorage } from '@vtt/contracts';
import { HttpError, withoutTrailingSlashes } from '@vtt/platform';
import type { FastifyContextConfig } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Deps, Module } from '../../deps.js';
import { requireInternalSecret } from '../../internal/secret.js';
import { gmAccess } from '../campaigns/repository.js';
import { CampaignId, currentUser } from '../schemas.js';
import {
  campaignOfCharacter,
  deleteStorageFile,
  inventoriedAt,
  inventoryCampaign,
  INVENTORY_STALE_MS,
  reserveStorage,
  storageSummary,
} from './ledger.js';

const Params = z.object({ id: CampaignId });

const unavailable = () =>
  new HttpError(503, 'Service indisponible', 'storage_unavailable', 'Stockage non configuré');

/** Réserve la place d'un envoi de cette campagne (route `POST …/uploads`, réservation interne). */
export const reserveFor =
  (deps: Deps, campaignId: string) =>
  (f: { key: string; size: number; usage: string; contentType: string | null }) =>
    reserveStorage(
      deps.db,
      { campaignId, ...f },
      deps.config.CAMPAIGN_STORAGE_QUOTA_BYTES,
      deps.now(),
    );

const inventoryDeps = (deps: Deps) => {
  if (!deps.store) throw unavailable();
  return { db: deps.db, store: deps.store, places: deps.places, now: deps.now };
};

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db, config } = deps;
  const publicBase = withoutTrailingSlashes(config.S3_PUBLIC_URL ?? '');

  r.get(
    '/v1/campaigns/:id/storage',
    {
      preValidation: (req, reply) => app.authenticate(req, reply),
      schema: {
        params: Params,
        querystring: z.object({ refresh: z.enum(['0', '1']).optional() }),
        response: { 200: CampaignStorage },
      },
    },
    async (req) => {
      const id = req.params.id;
      await gmAccess(db, id, currentUser(req));
      const at = await inventoriedAt(db, id);
      const stale = !at || deps.now().getTime() - at.getTime() > INVENTORY_STALE_MS;
      if (deps.store && (stale || req.query.refresh === '1'))
        try {
          await inventoryCampaign(inventoryDeps(deps), id);
        } catch (err) {
          req.log.warn({ err, campaignId: id }, 'inventaire du stockage impossible');
        }
      return storageSummary(db, id, {
        quota: config.CAMPAIGN_STORAGE_QUOTA_BYTES,
        publicBase,
        now: deps.now(),
      });
    },
  );

  r.delete(
    '/v1/campaigns/:id/storage/files',
    {
      preValidation: (req, reply) => app.authenticate(req, reply),
      schema: { params: Params, querystring: z.object({ key: z.string().min(1).max(512) }) },
    },
    async (req, reply) => {
      const id = req.params.id;
      await gmAccess(db, id, currentUser(req));
      await deleteStorageFile(inventoryDeps(deps), id, req.query.key);
      req.log.info({ campaignId: id, key: req.query.key }, 'fichier supprimé du stockage');
      reply.code(204);
    },
  );

  const secret = config.INTERNAL_API_SECRET;
  if (!secret) return;
  r.post(
    '/internal/storage/reserve',
    {
      preValidation: requireInternalSecret(secret),
      config: { rateLimit: { max: 6000, timeWindow: '1 minute' } } as FastifyContextConfig,
      schema: { hide: true, body: ReserveStorage },
    },
    async (req, reply) => {
      const { campaignId, characterId, ...file } = req.body;
      const id = campaignId ?? (characterId ? await campaignOfCharacter(db, characterId) : null);
      // Personnage hors campagne : rien à compter
      if (id) await reserveFor(deps, id)(file);
      reply.code(204);
    },
  );
};
