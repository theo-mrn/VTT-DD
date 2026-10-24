/**
 * Module « media » : médiathèque de la campagne (docs/mediatheque.md), bâtie sur l'inventaire du
 * stockage (`campaign_storage_files`) : dossiers sur trois niveaux, rangement, visibilité.
 *
 *   GET    /v1/campaigns/:id/media?folder=&kind=          contenu d'un dossier (ses droits)
 *   POST   /v1/campaigns/:id/media/folders                créer un dossier
 *   PATCH  /v1/campaigns/:id/media/folders/:folderId      renommer, déplacer ; visibilité : MJ
 *   DELETE /v1/campaigns/:id/media/folders/:folderId      supprimer (contenu remonté d'un niveau)
 *   PATCH  /v1/campaigns/:id/media/files?key=             ranger un fichier ; visibilité : MJ
 *
 * Le MJ voit et range tout. Un joueur voit ce qui est visible des joueurs (un dossier visible
 * rend visible son contenu, sous-dossiers compris), ce qu'il a envoyé et les dossiers qu'il a
 * créés ; il ne range que les siens. Chaque écriture publie `media.changed` (sans contenu :
 * chacun relit sa vue).
 */
import {
  CreateMediaFolder,
  LibraryKind,
  MEDIA_MAX_DEPTH,
  UpdateMediaFile,
  UpdateMediaFolder,
  uuidv7,
  type MediaFile,
  type MediaFolder,
  type MediaListing,
} from '@vtt/contracts';
import { HttpError, withoutTrailingSlashes } from '@vtt/platform';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '../../db/client.js';
import type { EventContext, Tx } from '../../db/outbox.js';
import {
  campaignHandoutPlacements,
  campaignHandouts,
  campaignMediaFolders,
  campaignStorageFiles,
} from '../../db/schema.js';
import type { Module } from '../../deps.js';
import {
  mapEvent,
  notFound,
  requestContext,
  requireGm,
  versionConflict,
  viewerOf,
  type Viewer,
} from '../maps/common.js';
import { PENDING_TTL_MS } from '../storage/ledger.js';
import { CampaignId, Uuid } from '../schemas.js';

type FolderRow = typeof campaignMediaFolders.$inferSelect;
type FileRow = typeof campaignStorageFiles.$inferSelect;

const refus = (detail: string) => new HttpError(422, 'Refusé', 'media_refused', detail);
const interdit = () =>
  new HttpError(403, 'Interdit', 'forbidden', 'Seul son auteur ou le MJ range cet élément');

/** Dossiers de la campagne, avec leur visibilité réelle (un parent visible rend visible). */
export async function foldersOf(db: Db | Tx, campaignId: string) {
  const rows = await db
    .select()
    .from(campaignMediaFolders)
    .where(eq(campaignMediaFolders.campaignId, campaignId));
  const byId = new Map(rows.map((f) => [f.id, f]));
  const visible = (f: FolderRow): boolean => {
    for (let x: FolderRow | undefined = f, n = 0; x && n <= MEDIA_MAX_DEPTH; n++) {
      if (x.visibleToPlayers) return true;
      x = x.parentId ? byId.get(x.parentId) : undefined;
    }
    return false;
  };
  const depth = (f: FolderRow) => {
    let n = 1;
    for (let x = f; x.parentId && byId.has(x.parentId); x = byId.get(x.parentId)!) n++;
    return n;
  };
  return { rows, byId, visible, depth };
}

export type Folders = Awaited<ReturnType<typeof foldersOf>>;

export const voitDossier = (v: Viewer, fs: Folders, f: FolderRow) =>
  v.isGm || f.ownerId === v.userId || fs.visible(f);

const voitFichier = (v: Viewer, fs: Folders, f: FileRow) => {
  if (v.isGm || f.uploadedBy === v.userId || f.visibleToPlayers) return true;
  const dossier = f.folderId ? fs.byId.get(f.folderId) : undefined;
  return !!dossier && fs.visible(dossier);
};

/** Un dossier où ce membre peut ranger : le sien, ou n'importe lequel pour le MJ ; null : racine. */
/**
 * Le dossier où ce membre voit un élément rangé dans `id` : lui-même s'il le voit, sinon le
 * premier dossier visible au-dessus ; null : la racine. Un joueur ne reçoit ainsi jamais le
 * nom d'un dossier caché.
 */
export function dossierVu(v: Viewer, fs: Folders, id: string | null): string | null {
  for (let x = id ? fs.byId.get(id) : undefined, n = 0; x && n <= MEDIA_MAX_DEPTH; n++) {
    if (voitDossier(v, fs, x)) return x.id;
    x = x.parentId ? fs.byId.get(x.parentId) : undefined;
  }
  return null;
}

export function dossierRangeable(v: Viewer, fs: Folders, id: string | null) {
  if (id === null) return null;
  const f = fs.byId.get(id);
  if (!f) throw notFound('Dossier');
  if (!v.isGm && f.ownerId !== v.userId) throw interdit();
  return f;
}

/**
 * Dossier choisi à l'envoi (réservation) : gardé s'il est de la campagne et que l'envoyeur peut y
 * ranger (le sien, ou MJ) ; sinon la racine. Ne fait jamais échouer un envoi.
 */
export async function uploadFolder(
  db: Db | Tx,
  campaignId: string,
  folderId: string | undefined,
  uploadedBy: string | undefined,
): Promise<string | null> {
  if (!folderId || !uploadedBy) return null;
  const [f] = await db
    .select()
    .from(campaignMediaFolders)
    .where(
      and(eq(campaignMediaFolders.id, folderId), eq(campaignMediaFolders.campaignId, campaignId)),
    );
  if (!f) return null;
  if (f.ownerId === uploadedBy) return f.id;
  try {
    const v = await viewerOf(db, campaignId, uploadedBy);
    return v.isGm ? f.id : null;
  } catch {
    return null;
  }
}

const folderApi = (v: Viewer, f: FolderRow, parentId = f.parentId): MediaFolder => ({
  id: f.id,
  parentId,
  name: f.name,
  visibleToPlayers: f.visibleToPlayers,
  mine: f.ownerId === v.userId,
  version: f.version,
});

const changed = (tx: Tx, ctx: EventContext, v: Viewer) =>
  mapEvent(tx, ctx, v, {
    type: 'media.changed',
    aggregate: { type: 'media', id: v.access.campaign.id },
    payload: {},
  });

const Params = z.object({ id: CampaignId });
const FolderParams = z.object({
  id: CampaignId,
  folderId: Uuid('Identifiant de dossier invalide'),
});
const ListQuery = z.object({
  folder: z.uuid().optional(),
  kind: LibraryKind.default('image'),
});

export const register: Module = async (app, { db, config }) => {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const auth = { preValidation: app.authenticate };
  const publicBase = withoutTrailingSlashes(config.R2_PUBLIC_URL ?? '');

  r.get(
    '/v1/campaigns/:id/media',
    { ...auth, schema: { params: Params, querystring: ListQuery } },
    async (req): Promise<MediaListing> => {
      const { userId } = requestContext(req);
      const v = await viewerOf(db, req.params.id, userId);
      const campaignId = v.access.campaign.id;
      const fs = await foldersOf(db, campaignId);
      const ouvert = req.query.folder ? fs.byId.get(req.query.folder) : undefined;
      if (req.query.folder && (!ouvert || !voitDossier(v, fs, ouvert))) throw notFound('Dossier');

      // Un joueur ne reçoit jamais le nom d'un dossier qu'il ne voit pas : ni dans le fil
      // d'Ariane, ni comme parent ; un dossier visible sous un dossier caché remonte sous le
      // premier dossier visible au-dessus de lui (ou à la racine)
      const parentVu = (f: FolderRow) => dossierVu(v, fs, f.parentId);
      const path: MediaListing['path'] = [];
      for (let x = ouvert; x;) {
        path.unshift({ id: x.id, name: x.name });
        const p = parentVu(x);
        x = p ? fs.byId.get(p) : undefined;
      }

      const folders = fs.rows
        .filter((f) => voitDossier(v, fs, f) && parentVu(f) === (ouvert?.id ?? null))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
        .map((f) => folderApi(v, f, parentVu(f)));

      const types =
        req.query.kind === 'visual'
          ? sql`(${campaignStorageFiles.contentType} LIKE 'image/%' OR ${campaignStorageFiles.contentType} LIKE 'video/%')`
          : sql`${campaignStorageFiles.contentType} LIKE 'image/%'`;
      const rows = await db
        .select()
        .from(campaignStorageFiles)
        .where(
          and(
            eq(campaignStorageFiles.campaignId, campaignId),
            ouvert
              ? eq(campaignStorageFiles.folderId, ouvert.id)
              : isNull(campaignStorageFiles.folderId),
            types,
            // Vu sur le stockage, ou envoyé il y a moins d'une heure (inventaire pas encore passé)
            or(
              eq(campaignStorageFiles.state, 'stored'),
              gt(campaignStorageFiles.createdAt, new Date(Date.now() - PENDING_TTL_MS)),
            ),
          ),
        )
        .orderBy(desc(campaignStorageFiles.createdAt))
        .limit(500);
      const files: MediaFile[] = rows
        .filter((f) => voitFichier(v, fs, f))
        .map((f) => ({
          key: f.key,
          url: `${publicBase}/${f.key}`,
          contentType: f.contentType,
          size: f.size,
          createdAt: f.createdAt.toISOString(),
          folderId: f.folderId,
          visibleToPlayers: f.visibleToPlayers,
          mine: f.uploadedBy === v.userId,
        }));
      return { gm: v.isGm, path, folders, files };
    },
  );

  r.post(
    '/v1/campaigns/:id/media/folders',
    { ...auth, schema: { params: Params, body: CreateMediaFolder } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      const folder = await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        if (v.access.role === 'spectator') throw interdit();
        const fs = await foldersOf(tx, v.access.campaign.id);
        const parent = dossierRangeable(v, fs, req.body.parentId);
        if (parent && fs.depth(parent) >= MEDIA_MAX_DEPTH)
          throw refus(`Trois niveaux de dossiers au plus`);
        const [row] = await tx
          .insert(campaignMediaFolders)
          .values({
            id: uuidv7(),
            campaignId: v.access.campaign.id,
            parentId: parent?.id ?? null,
            name: req.body.name,
            ownerId: userId,
          })
          .returning();
        await changed(tx, ctx, v);
        return folderApi(v, row!);
      });
      reply.code(201);
      return folder;
    },
  );

  r.patch(
    '/v1/campaigns/:id/media/folders/:folderId',
    { ...auth, schema: { params: FolderParams, body: UpdateMediaFolder } },
    async (req) => {
      const { userId, ctx } = requestContext(req);
      return db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const fs = await foldersOf(tx, v.access.campaign.id);
        const f = dossierRangeable(v, fs, req.params.folderId)!;
        const { version, visibleToPlayers, parentId, name } = req.body;
        if (version !== undefined && version !== f.version) throw versionConflict();
        if (visibleToPlayers !== undefined) requireGm(v);
        if (parentId !== undefined) {
          const parent = dossierRangeable(v, fs, parentId);
          // Ni dans lui-même ni dans un de ses descendants ; trois niveaux au plus, sous-arbre compris
          for (
            let x: FolderRow | undefined = parent ?? undefined;
            x;
            x = x.parentId ? fs.byId.get(x.parentId) : undefined
          )
            if (x.id === f.id) throw refus('Un dossier ne va pas dans lui-même');
          const hauteur = (id: string): number =>
            1 + Math.max(0, ...fs.rows.filter((c) => c.parentId === id).map((c) => hauteur(c.id)));
          if ((parent ? fs.depth(parent) : 0) + hauteur(f.id) > MEDIA_MAX_DEPTH)
            throw refus('Trois niveaux de dossiers au plus');
        }
        const [row] = await tx
          .update(campaignMediaFolders)
          .set({
            ...(name !== undefined ? { name } : {}),
            ...(parentId !== undefined ? { parentId } : {}),
            ...(visibleToPlayers !== undefined ? { visibleToPlayers } : {}),
            version: sql`${campaignMediaFolders.version} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(campaignMediaFolders.id, f.id))
          .returning();
        await changed(tx, ctx, v);
        return folderApi(v, row!);
      });
    },
  );

  r.delete(
    '/v1/campaigns/:id/media/folders/:folderId',
    { ...auth, schema: { params: FolderParams } },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const fs = await foldersOf(tx, v.access.campaign.id);
        const f = dossierRangeable(v, fs, req.params.folderId)!;
        // Son contenu remonte d'un niveau : jamais un fichier supprimé
        await tx
          .update(campaignMediaFolders)
          .set({ parentId: f.parentId, updatedAt: sql`now()` })
          .where(eq(campaignMediaFolders.parentId, f.id));
        await tx
          .update(campaignStorageFiles)
          .set({ folderId: f.parentId })
          .where(eq(campaignStorageFiles.folderId, f.id));
        await tx
          .update(campaignHandouts)
          .set({ folderId: f.parentId })
          .where(eq(campaignHandouts.folderId, f.id));
        await tx
          .update(campaignHandoutPlacements)
          .set({ folderId: f.parentId })
          .where(eq(campaignHandoutPlacements.folderId, f.id));
        await tx.delete(campaignMediaFolders).where(eq(campaignMediaFolders.id, f.id));
        await changed(tx, ctx, v);
      });
      reply.code(204);
    },
  );

  r.patch(
    '/v1/campaigns/:id/media/files',
    {
      ...auth,
      schema: {
        params: Params,
        querystring: z.object({ key: z.string().min(1).max(512) }),
        body: UpdateMediaFile,
      },
    },
    async (req, reply) => {
      const { userId, ctx } = requestContext(req);
      await db.transaction(async (tx) => {
        const v = await viewerOf(tx, req.params.id, userId);
        const campaignId = v.access.campaign.id;
        const [f] = await tx
          .select()
          .from(campaignStorageFiles)
          .where(
            and(
              eq(campaignStorageFiles.key, req.query.key),
              eq(campaignStorageFiles.campaignId, campaignId),
            ),
          );
        if (!f) throw notFound('Fichier');
        if (!v.isGm && f.uploadedBy !== userId) throw interdit();
        if (req.body.visibleToPlayers !== undefined) requireGm(v);
        const fs = await foldersOf(tx, campaignId);
        if (req.body.folderId !== undefined) dossierRangeable(v, fs, req.body.folderId);
        await tx
          .update(campaignStorageFiles)
          .set({
            ...(req.body.folderId !== undefined ? { folderId: req.body.folderId } : {}),
            ...(req.body.visibleToPlayers !== undefined
              ? { visibleToPlayers: req.body.visibleToPlayers }
              : {}),
          })
          .where(eq(campaignStorageFiles.key, f.key));
        await changed(tx, ctx, v);
      });
      reply.code(204);
    },
  );
};
