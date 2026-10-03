/**
 * Module « assets » : bibliothèque de sons d'une campagne (§ 3.4, 4.1).
 *
 *   GET    /v1/audio/campaigns/:id/assets?kind=&q=&cursor=   MJ ; joueur : kind=sfx
 *   GET    /v1/audio/campaigns/:id/assets/resolve?ids=       membres
 *   POST   /v1/audio/campaigns/:id/assets/uploads            MJ : URL PUT signée, rien en base
 *   POST   /v1/audio/campaigns/:id/assets                    MJ : envoi reçu, catalogue, YouTube
 *   PATCH  /v1/audio/campaigns/:id/assets/:assetId           MJ
 *   DELETE /v1/audio/campaigns/:id/assets/:assetId           MJ : suppression logique
 */
import {
  Asset,
  AssetKind,
  AssetSection,
  type Actor,
  changesPayload,
  CreateAsset,
  importedAssetId,
  parseYoutubeId,
  PlaybackAsset,
  UploadRequest,
  UploadTicket,
  uuidv7,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, asc, eq, gt, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CampaignRole } from '../../clients/campaign.js';
import { appendEvent, type EventContext, type Tx } from '../../db/outbox.js';
import { assets, channels, jobs, type AssetRow } from '../../db/schema.js';
import type { Deps, Module } from '../../deps.js';
import { sniffAudio, UPLOAD_TYPES } from '../../storage/sniff.js';
import { incomingKey } from '../../storage/s3.js';
import { createUploadToken, verifyUploadToken } from '../../storage/upload-token.js';
import { loadAssets, lockChannel, saveTransition, toMachine } from '../channels/repository.js';
import { removeFromQueue } from '../channels/machine.js';
import {
  actorOf,
  CampaignParams,
  currentUser,
  eventContext,
  memberRole,
  requireGm,
  sendProblem,
  Uuid,
} from '../common.js';
import { removeAssetFromPlaylists } from '../playlists/repository.js';
import { toAsset, toPlaybackAsset, trackedFields } from './view.js';

/** Durée de validité d'une URL d'envoi, en secondes. */
export const UPLOAD_EXPIRY = 300;
const PAGE = 200;

const AssetParams = CampaignParams.extend({ assetId: Uuid('Identifiant de son invalide') });

/** Taille maximale d'un envoi selon la sorte : musique et ambiance longues, effets courts. */
export const maxBytes = (deps: Pick<Deps, 'config'>, kind: AssetKind) =>
  kind === 'sfx' ? deps.config.AUDIO_MAX_BYTES_SFX : deps.config.AUDIO_MAX_BYTES_LONG;

function assetEvent(
  tx: Tx,
  ctx: EventContext,
  type: 'audio.asset_created' | 'audio.asset_updated' | 'audio.asset_deleted',
  campaignId: string,
  assetId: string,
  actor: Actor,
  payload: Record<string, unknown>,
) {
  return appendEvent(tx, ctx, {
    type,
    actor,
    aggregate: { type: 'audio_asset', id: assetId },
    payload,
    // Les titres peuvent divulguer l'intrigue : bibliothèque réservée au MJ
    visibility: 'gm_only',
    campaignId,
  });
}

/** Espace d'un son neuf : celui de son type (musique, ambiance) ; un effet va sur la table d'effets. */
const sectionsOf = (kind: AssetKind): AssetSection[] =>
  kind === 'music' || kind === 'ambience' ? [kind] : [];

/** Crée ou ranime (supprimé puis rajouté) un asset à id déterministe (catalogue, YouTube). */
async function upsertDeterministic(
  tx: Tx,
  values: typeof assets.$inferInsert,
): Promise<{ row: AssetRow; created: boolean }> {
  const [inserted] = await tx
    .insert(assets)
    .values({ sections: sectionsOf(values.kind), ...values })
    .onConflictDoNothing()
    .returning();
  if (inserted) return { row: inserted, created: true };
  const [existing] = await tx.select().from(assets).where(eq(assets.id, values.id)).for('update');
  if (!existing) throw new Error('asset introuvable après conflit');
  if (existing.campaignId !== values.campaignId) throw HttpError.conflict('Identifiant déjà pris');
  if (!existing.deletedAt) return { row: existing, created: false };
  const [revived] = await tx
    .update(assets)
    .set({
      deletedAt: null,
      name: values.name,
      kind: values.kind,
      sections: sectionsOf(values.kind),
      durationMs: values.durationMs ?? existing.durationMs,
      createdBy: values.createdBy ?? null,
      version: sql`${assets.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(assets.id, existing.id))
    .returning();
  // Purge planifiée par la suppression : annulée
  await tx
    .update(jobs)
    .set({ status: 'done', lastError: 'annulée : son ranimé', updatedAt: sql`now()` })
    .where(and(eq(jobs.assetId, existing.id), eq(jobs.kind, 'purge'), eq(jobs.status, 'pending')));
  return { row: revived!, created: true };
}

export async function enqueueJob(
  tx: Pick<Tx, 'insert'>,
  assetId: string,
  kind: 'analyze' | 'purge',
  runAfter = new Date(),
) {
  await tx.insert(jobs).values({ id: uuidv7(), assetId, kind, runAfter });
}

/**
 * Suppression logique d'un asset : il sort des playlists et des canaux dans la
 * même transaction ; ses fichiers sont purgés PURGE_AFTER_DAYS plus tard.
 */
export async function deleteAsset(
  tx: Tx,
  deps: Pick<Deps, 'config' | 'storage' | 'now'>,
  ctx: EventContext,
  row: AssetRow,
  actor: Actor,
): Promise<void> {
  const now = deps.now();
  await tx
    .update(assets)
    .set({ deletedAt: new Date(now), version: sql`${assets.version} + 1`, updatedAt: sql`now()` })
    .where(eq(assets.id, row.id));
  await removeAssetFromPlaylists(tx, ctx, row.campaignId, row.id, actor);
  // Canaux qui l'ont en file : la piste suivante prend sa place (ou arrêt)
  const holders = await tx
    .select({ channel: channels.channel })
    .from(channels)
    .where(and(eq(channels.campaignId, row.campaignId), sql`${row.id} = ANY(${channels.queue})`));
  for (const h of holders) {
    const ch = await lockChannel(tx, row.campaignId, h.channel, now);
    const { rows, infos } = await loadAssets(tx, ch.queue.concat(ch.assetId ?? []));
    const next = removeFromQueue(toMachine(ch), row.id, now, { assets: infos });
    await saveTransition(tx, {
      row: ch,
      next,
      rows,
      infos,
      storage: deps.storage,
      cause: 'asset_deleted',
      actor,
      ctx,
      nowMs: now,
    });
  }
  if (row.source === 'upload')
    await enqueueJob(
      tx,
      row.id,
      'purge',
      new Date(now + deps.config.PURGE_AFTER_DAYS * 86_400_000),
    );
  await assetEvent(tx, ctx, 'audio.asset_deleted', row.campaignId, row.id, actor, {
    assetId: row.id,
  });
}

type CreateBody = z.output<typeof CreateAsset>;

/** Ce que partagent les créations d'un son. */
interface CreateContext {
  deps: Deps;
  campaignId: string;
  userId: string;
  actor: Actor;
  ctx: EventContext;
}

/**
 * Son envoyé : jeton d'envoi vérifié, fichier reçu en entier et reconnu comme un son.
 * Déjà créé (requête rejouée) : le même.
 */
async function createUploaded(
  c: CreateContext,
  body: Extract<CreateBody, { source: 'upload' }>,
): Promise<AssetRow> {
  const { deps, campaignId, userId, actor, ctx } = c;
  const { db } = deps;
  const secret = deps.config.AUDIO_UPLOAD_SECRET;
  if (!deps.storage || !secret)
    throw new HttpError(
      503,
      'Service indisponible',
      'storage_unavailable',
      'Envoi de fichiers indisponible',
    );
  const claims = verifyUploadToken(secret, body.uploadToken, deps.now());
  if (claims?.campaignId !== campaignId || claims.kind !== body.kind)
    throw new HttpError(
      422,
      'Envoi invalide',
      'invalid_upload',
      'Jeton d’envoi invalide ou expiré',
    );
  // Déjà créé (requête rejouée) : même réponse
  const [known] = await db.select().from(assets).where(eq(assets.id, claims.assetId));
  if (known) return known;
  const head = await deps.storage.head(claims.key);
  if (!head || head.size !== claims.size)
    throw new HttpError(
      422,
      'Envoi invalide',
      'invalid_upload',
      'Le fichier n’a pas été reçu en entier',
    );
  const format = sniffAudio(await deps.storage.readStart(claims.key, 4096));
  if (!format || !UPLOAD_TYPES[claims.contentType]?.includes(format))
    throw new HttpError(
      415,
      'Type non pris en charge',
      'unsupported_media_type',
      'Le contenu du fichier n’est pas un son accepté',
    );
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(assets)
      .values({
        id: claims.assetId,
        campaignId,
        kind: body.kind,
        sections: sectionsOf(body.kind),
        name: body.name,
        source: 'upload',
        status: 'processing',
        originalKey: claims.key,
        mimeType: claims.contentType,
        sizeBytes: claims.size,
        createdBy: userId,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) return (await tx.select().from(assets).where(eq(assets.id, claims.assetId)))[0]!;
    await enqueueJob(tx, created.id, 'analyze');
    await assetEvent(tx, ctx, 'audio.asset_created', campaignId, created.id, actor, {
      asset: toAsset(created, deps.storage),
    });
    return created;
  });
}

/** Son du catalogue, à id déterministe (ranimé s'il avait été supprimé). */
async function createFromCatalog(
  c: CreateContext,
  body: Extract<CreateBody, { source: 'catalog' }>,
): Promise<AssetRow> {
  const { deps, campaignId, userId, actor, ctx } = c;
  const entry = deps.catalog.get(body.catalogId);
  if (!entry)
    throw new HttpError(
      404,
      'Ressource introuvable',
      'catalog_entry_not_found',
      'Entrée du catalogue introuvable',
    );
  return deps.db.transaction(async (tx) => {
    const { row, created } = await upsertDeterministic(tx, {
      id: importedAssetId(campaignId, entry.url),
      campaignId,
      kind: body.kind ?? entry.kind,
      name: body.name ?? entry.name,
      source: 'catalog',
      // Durée et loudness relevées par le worker
      status: 'processing',
      catalogId: entry.id,
      playbackUrl: entry.url,
      createdBy: userId,
    });
    if (created) {
      if (row.status !== 'ready') await enqueueJob(tx, row.id, 'analyze');
      await assetEvent(tx, ctx, 'audio.asset_created', campaignId, row.id, actor, {
        asset: toAsset(row, deps.storage),
      });
    }
    return row;
  });
}

/** Vidéo YouTube, à id déterministe (ranimée si elle avait été supprimée). */
async function createFromYoutube(
  c: CreateContext,
  body: Extract<CreateBody, { source: 'youtube' }>,
): Promise<AssetRow> {
  const { deps, campaignId, userId, actor, ctx } = c;
  const youtubeId = parseYoutubeId(body.url);
  if (!youtubeId)
    throw new HttpError(
      422,
      'Lien YouTube invalide',
      'invalid_youtube_id',
      'Collez un lien YouTube ou un identifiant de vidéo',
    );
  return deps.db.transaction(async (tx) => {
    const { row, created } = await upsertDeterministic(tx, {
      id: importedAssetId(campaignId, `youtube:${youtubeId}`),
      campaignId,
      kind: body.kind ?? 'music',
      name: body.name,
      source: 'youtube',
      status: 'ready',
      youtubeId,
      durationMs: body.durationMs ?? null,
      createdBy: userId,
    });
    if (created)
      await assetEvent(tx, ctx, 'audio.asset_created', campaignId, row.id, actor, {
        asset: toAsset(row, deps.storage),
      });
    return row;
  });
}

export const register: Module = async (app, deps) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { db } = deps;
  const auth = { preValidation: app.authenticate };

  r.get(
    '/v1/audio/campaigns/:id/assets',
    {
      ...auth,
      schema: {
        params: CampaignParams,
        querystring: z.object({
          kind: AssetKind.optional(),
          q: z.string().trim().max(100).optional(),
          cursor: z.string().max(400).optional(),
        }),
        response: { 200: z.object({ items: z.array(Asset), nextCursor: z.string().nullable() }) },
      },
    },
    async (req) => {
      const role = await memberRole(deps, req.params.id, currentUser(req));
      const { kind, q, cursor } = req.query;
      // Joueur : seulement les effets (choix d'un son d'arme) ; spectateur : rien
      if (role !== 'gm' && (role === 'spectator' || kind !== 'sfx'))
        throw HttpError.forbidden('Bibliothèque réservée au MJ');
      let after: { name: string; id: string } | null = null;
      if (cursor) {
        try {
          after = z
            .object({ name: z.string(), id: z.uuid() })
            .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
        } catch {
          throw HttpError.badRequest('Curseur invalide', 'invalid_cursor');
        }
      }
      const rows = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.campaignId, req.params.id),
            isNull(assets.deletedAt),
            kind ? eq(assets.kind, kind) : undefined,
            role !== 'gm' ? eq(assets.status, 'ready') : undefined,
            q ? ilike(assets.name, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined,
            after
              ? or(
                  gt(assets.name, after.name),
                  and(eq(assets.name, after.name), gt(assets.id, after.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(assets.name), asc(assets.id))
        .limit(PAGE + 1);
      const page = rows.slice(0, PAGE);
      const last = page[page.length - 1];
      return {
        items: page.map((a) => toAsset(a, deps.storage)),
        nextCursor:
          rows.length > PAGE && last
            ? Buffer.from(JSON.stringify({ name: last.name, id: last.id })).toString('base64url')
            : null,
      };
    },
  );

  r.get(
    '/v1/audio/campaigns/:id/assets/resolve',
    {
      ...auth,
      schema: {
        params: CampaignParams,
        querystring: z.object({
          ids: z
            .string()
            .transform((s) => [
              ...new Set(
                s
                  .split(',')
                  .map((x) => x.trim().toLowerCase())
                  .filter(Boolean),
              ),
            ])
            .pipe(z.array(z.uuid()).max(100, '100 identifiants au plus')),
        }),
        response: { 200: z.object({ items: z.array(PlaybackAsset) }) },
      },
    },
    async (req) => {
      await memberRole(deps, req.params.id, currentUser(req));
      if (!req.query.ids.length) return { items: [] };
      const rows = await db
        .select()
        .from(assets)
        .where(and(eq(assets.campaignId, req.params.id), inArray(assets.id, req.query.ids)));
      return { items: rows.map((a) => toPlaybackAsset(a, deps.storage)) };
    },
  );

  r.post(
    '/v1/audio/campaigns/:id/assets/uploads',
    {
      // Fonction fléchée : passer app.authenticate tel quel fige le type de `config` sans rateLimit
      preValidation: (req, reply) => app.authenticate(req, reply),
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: CampaignParams, body: UploadRequest, response: { 201: UploadTicket } },
    },
    async (req, reply) => {
      const campaignId = req.params.id;
      await requireGm(deps, campaignId, currentUser(req));
      const secret = deps.config.AUDIO_UPLOAD_SECRET;
      if (!deps.storage || !secret)
        throw new HttpError(
          503,
          'Service indisponible',
          'storage_unavailable',
          'Envoi de fichiers indisponible',
        );
      const { contentType, size, kind } = req.body;
      const type = contentType.toLowerCase().split(';')[0]!.trim();
      if (!UPLOAD_TYPES[type])
        throw new HttpError(
          415,
          'Type non pris en charge',
          'unsupported_media_type',
          'Formats acceptés : mp3, m4a/aac, ogg, opus/webm, wav, flac',
        );
      if (size > maxBytes(deps, kind))
        throw new HttpError(
          413,
          'Fichier trop volumineux',
          'file_too_large',
          `${Math.round(maxBytes(deps, kind) / 1024 / 1024)} Mo au plus`,
        );
      const assetId = uuidv7();
      const key = incomingKey(campaignId, assetId);
      // Place réservée sur le quota de la campagne, sons et images ensemble (docs/stockage.md)
      await deps.campaigns.reserve?.({
        campaignId,
        key,
        size,
        usage: 'sound',
        contentType: type,
      });
      const uploadUrl = await deps.storage.signUpload({
        key,
        contentType: type,
        size,
        expiresIn: UPLOAD_EXPIRY,
      });
      const exp = Math.floor(deps.now() / 1000) + UPLOAD_EXPIRY;
      reply.code(201);
      return {
        uploadUrl,
        headers: { 'content-type': type },
        expiresAt: new Date(exp * 1000).toISOString(),
        uploadToken: createUploadToken(secret, {
          assetId,
          campaignId,
          key,
          size,
          contentType: type,
          kind,
          exp,
        }),
      };
    },
  );

  r.post(
    '/v1/audio/campaigns/:id/assets',
    {
      ...auth,
      schema: { params: CampaignParams, body: CreateAsset, response: { 201: Asset } },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const campaignId = req.params.id;
      const role: CampaignRole = await requireGm(deps, campaignId, userId);
      const c: CreateContext = {
        deps,
        campaignId,
        userId,
        actor: actorOf(userId, role),
        ctx: eventContext(req),
      };
      const body = req.body;
      let row: AssetRow;
      if (body.source === 'upload') row = await createUploaded(c, body);
      else if (body.source === 'catalog') row = await createFromCatalog(c, body);
      else row = await createFromYoutube(c, body);
      reply.code(201);
      return toAsset(row, deps.storage);
    },
  );

  r.patch(
    '/v1/audio/campaigns/:id/assets/:assetId',
    {
      ...auth,
      schema: {
        params: AssetParams,
        body: z
          .object({
            name: z.string().trim().min(1).max(200).optional(),
            kind: AssetKind.optional(),
            sections: z
              .array(AssetSection)
              .max(2)
              .refine((a) => new Set(a).size === a.length, 'Un espace en double')
              .optional(),
            volume: z.number().min(0).max(1).optional(),
            durationMs: z.number().int().positive().optional(),
            version: z.number().int().positive().optional(),
          })
          .refine((b) => Object.keys(b).some((k) => k !== 'version'), 'Rien à modifier'),
        response: { 200: Asset },
      },
    },
    async (req, reply) => {
      const userId = currentUser(req);
      const { id: campaignId, assetId } = req.params;
      const role = await requireGm(deps, campaignId, userId);
      const result = await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, assetId),
              eq(assets.campaignId, campaignId),
              isNull(assets.deletedAt),
            ),
          )
          .for('update');
        if (!row) throw HttpError.notFound('Son introuvable');
        if (req.body.version !== undefined && req.body.version !== row.version)
          return { conflict: toAsset(row, deps.storage) } as const;
        const { name, kind, sections, volume, durationMs } = req.body;
        if (durationMs !== undefined && row.source !== 'youtube')
          throw new HttpError(
            422,
            'Modification impossible',
            'invalid_field',
            'La durée d’un fichier est mesurée par le serveur',
          );
        const before = toAsset(row, deps.storage);
        const patch = {
          ...(name !== undefined ? { name } : {}),
          ...(kind !== undefined ? { kind } : {}),
          ...(sections !== undefined ? { sections } : {}),
          ...(volume !== undefined ? { volume } : {}),
          ...(durationMs !== undefined ? { durationMs } : {}),
        };
        const same = Object.entries(patch).every(([k, v]) => {
          const cur = (row as Record<string, unknown>)[k];
          return Array.isArray(v) && Array.isArray(cur)
            ? v.length === cur.length && v.every((x) => cur.includes(x))
            : cur === v;
        });
        if (same) return { asset: before } as const;
        const [updated] = await tx
          .update(assets)
          .set({ ...patch, version: sql`${assets.version} + 1`, updatedAt: sql`now()` })
          .where(eq(assets.id, row.id))
          .returning();
        const after = toAsset(updated!, deps.storage);
        await assetEvent(
          tx,
          eventContext(req),
          'audio.asset_updated',
          campaignId,
          row.id,
          actorOf(userId, role),
          {
            asset: after,
            ...changesPayload(trackedFields(before), trackedFields(after)),
          },
        );
        return { asset: after } as const;
      });
      if ('conflict' in result)
        return sendProblem(reply, 409, 'Conflit', 'version_conflict', {
          detail: 'Le son a été modifié entre-temps',
          current: result.conflict,
        });
      return result.asset;
    },
  );

  r.delete(
    '/v1/audio/campaigns/:id/assets/:assetId',
    { ...auth, schema: { params: AssetParams } },
    async (req, reply) => {
      const userId = currentUser(req);
      const { id: campaignId, assetId } = req.params;
      const role = await requireGm(deps, campaignId, userId);
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(assets)
          .where(
            and(
              eq(assets.id, assetId),
              eq(assets.campaignId, campaignId),
              isNull(assets.deletedAt),
            ),
          )
          .for('update');
        if (!row) throw HttpError.notFound('Son introuvable');
        await deleteAsset(tx, deps, eventContext(req), row, actorOf(userId, role));
      });
      reply.code(204);
    },
  );
};
