/**
 * Inventaire du stockage d'une campagne (docs/stockage.md) : réservation d'un envoi sous quota,
 * inventaire de R2, résumé pour l'écran du MJ, suppression d'un fichier inutilisé.
 */
import {
  formatBytes,
  STORAGE_CATEGORIES,
  STORAGE_ERRORS,
  type CampaignStorage,
  type StorageCategory,
  type StorageFile,
} from '@vtt/contracts';
import {
  HttpError,
  isUploadKey,
  type ObjectStore,
  type PlacesChecker,
  type StoredObject,
} from '@vtt/platform';
import { and, eq, gt, inArray, lt, notInArray, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import {
  campaignCharacters,
  campaignStorageFiles,
  campaignStorageInventories,
  mapTokens,
} from '../../db/schema.js';
import { categoryOf, placeLabels } from './places.js';

/** Une réservation jamais vue sur le stockage est oubliée au bout d'une heure. */
export const PENDING_TTL_MS = 3_600_000;
/** Un fichier plus jeune n'est pas supprimable (envoi en cours, adresse pas encore enregistrée). */
export const DELETE_MIN_AGE_MS = 3_600_000;
/** L'écran refait l'inventaire au-delà de ce délai. */
export const INVENTORY_STALE_MS = 10 * 60_000;

const lock = (tx: Tx, campaignId: string) =>
  tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`storage:${campaignId}`}))`);

/** Fichiers qui comptent : vus sur le stockage, ou réservés depuis moins d'une heure. */
const counted = (now: Date) =>
  or(
    eq(campaignStorageFiles.state, 'stored'),
    gt(campaignStorageFiles.createdAt, new Date(now.getTime() - PENDING_TTL_MS)),
  );

export async function usedBytes(db: Db | Tx, campaignId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${campaignStorageFiles.size}), 0)` })
    .from(campaignStorageFiles)
    .where(and(eq(campaignStorageFiles.campaignId, campaignId), counted(now)));
  return Number(row?.total ?? 0);
}

export const quotaExceeded = (used: number, quota: number) =>
  new HttpError(
    422,
    'Espace de la campagne plein',
    STORAGE_ERRORS.quotaExceeded,
    `Espace de la campagne plein : ${formatBytes(used)} utilisés sur ${formatBytes(quota)}.`,
  );

/** Réserve la place d'un envoi ; 422 `storage_quota_exceeded` s'il n'y en a plus. */
export async function reserveStorage(
  db: Db,
  r: { campaignId: string; key: string; size: number; usage: string; contentType: string | null },
  quota: number,
  now: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lock(tx, r.campaignId);
    const used = await usedBytes(tx, r.campaignId, now);
    if (used + r.size > quota) throw quotaExceeded(used, quota);
    await tx
      .insert(campaignStorageFiles)
      .values({
        key: r.key,
        campaignId: r.campaignId,
        size: r.size,
        contentType: r.contentType,
        usage: r.usage,
        state: 'pending',
        createdAt: now,
      })
      .onConflictDoNothing();
  });
}

/** Campagne d'un personnage : engagé, ou posé sur une de ses cartes (PNJ) ; null : aucune. */
export async function campaignOfCharacter(db: Db, characterId: string): Promise<string | null> {
  const [engaged] = await db
    .select({ id: campaignCharacters.campaignId })
    .from(campaignCharacters)
    .where(eq(campaignCharacters.characterId, characterId))
    .limit(1);
  if (engaged) return engaged.id;
  const [token] = await db
    .select({ id: mapTokens.campaignId })
    .from(mapTokens)
    .where(eq(mapTokens.characterId, characterId))
    .limit(1);
  return token?.id ?? null;
}

/** Personnages dont les fichiers comptent pour la campagne : engagés et posés sur ses cartes. */
async function charactersOf(db: Db, campaignId: string): Promise<string[]> {
  const engaged = await db
    .select({ id: campaignCharacters.characterId })
    .from(campaignCharacters)
    .where(eq(campaignCharacters.campaignId, campaignId));
  const placed = await db
    .selectDistinct({ id: mapTokens.characterId })
    .from(mapTokens)
    .where(eq(mapTokens.campaignId, campaignId));
  return [...new Set([...engaged, ...placed].map((r) => r.id))];
}

const TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  webm: 'video/webm',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

/** Type d'un fichier d'après son extension ; un son en attente d'analyse n'en a pas. */
export function typeOfKey(key: string): string | null {
  const ext = /\.([a-z0-9]+)$/i.exec(key)?.[1]?.toLowerCase();
  if (ext && TYPES[ext]) return TYPES[ext]!;
  return key.startsWith('audio/') ? 'audio/*' : null;
}

export interface InventoryDeps {
  db: Db;
  store: ObjectStore;
  /** Tables qui citent chaque clé, tous services (celui-ci compris). */
  places: PlacesChecker;
  now: () => Date;
}

/**
 * Inventaire d'une campagne : liste ses dossiers sur le stockage, met à jour les fichiers vus
 * (taille, où ils servent), oublie ceux qui n'y sont plus et les réservations expirées.
 */
export async function inventoryCampaign(deps: InventoryDeps, campaignId: string): Promise<void> {
  const { db, store } = deps;
  const prefixes = [
    `campaigns/${campaignId}/`,
    `audio/incoming/${campaignId}/`,
    `audio/assets/${campaignId}/`,
    ...(await charactersOf(db, campaignId)).map((id) => `characters/${id}/`),
  ];
  const seen = new Map<string, StoredObject>();
  for (const prefix of prefixes) for await (const o of store.list(prefix)) seen.set(o.key, o);

  const uploads = [...seen.keys()].filter(isUploadKey);
  const places: Record<string, string[]> = {};
  for (let i = 0; i < uploads.length; i += 1000)
    Object.assign(places, await deps.places(uploads.slice(i, i + 1000)));

  const now = deps.now();
  await db.transaction(async (tx) => {
    await lock(tx, campaignId);
    const rows = [...seen.values()].map((o) => ({
      key: o.key,
      campaignId,
      size: o.size,
      contentType: typeOfKey(o.key),
      usage: null,
      state: 'stored' as const,
      usedBy: places[o.key.toLowerCase()] ?? [],
      createdAt: o.lastModified,
      seenAt: now,
    }));
    for (let i = 0; i < rows.length; i += 500)
      await tx
        .insert(campaignStorageFiles)
        .values(rows.slice(i, i + 500))
        .onConflictDoUpdate({
          target: campaignStorageFiles.key,
          set: {
            size: sql`excluded.size`,
            state: 'stored',
            usedBy: sql`excluded.used_by`,
            seenAt: sql`excluded.seen_at`,
            contentType: sql`coalesce(${campaignStorageFiles.contentType}, excluded.content_type)`,
          },
        });
    // Plus sur le stockage : oublié ; réservation jamais vue depuis une heure : oubliée
    const gone = and(
      eq(campaignStorageFiles.campaignId, campaignId),
      or(
        eq(campaignStorageFiles.state, 'stored'),
        lt(campaignStorageFiles.createdAt, new Date(now.getTime() - PENDING_TTL_MS)),
      ),
    );
    await tx
      .delete(campaignStorageFiles)
      .where(seen.size ? and(gone, notInArray(campaignStorageFiles.key, [...seen.keys()])) : gone);
    await tx
      .insert(campaignStorageInventories)
      .values({ campaignId, inventoriedAt: now })
      .onConflictDoUpdate({
        target: campaignStorageInventories.campaignId,
        set: { inventoriedAt: now },
      });
  });
}

/** Dernier inventaire d'une campagne ; null : jamais. */
export async function inventoriedAt(db: Db, campaignId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: campaignStorageInventories.inventoriedAt })
    .from(campaignStorageInventories)
    .where(eq(campaignStorageInventories.campaignId, campaignId));
  return row?.at ?? null;
}

const isSound = (key: string) => key.startsWith('audio/');

/** Un fichier se supprime depuis l'écran : envoi d'image ou de vidéo, inutilisé, assez ancien. */
export const deletable = (
  f: { key: string; state: string; usedBy: readonly string[]; createdAt: Date },
  now: Date,
) =>
  f.state === 'stored' &&
  isUploadKey(f.key) &&
  !f.usedBy.length &&
  now.getTime() - f.createdAt.getTime() >= DELETE_MIN_AGE_MS;

/** Ce que montre l'écran « Stockage ». */
export async function storageSummary(
  db: Db,
  campaignId: string,
  o: { quota: number; publicBase: string; now: Date },
): Promise<CampaignStorage> {
  const rows = await db
    .select()
    .from(campaignStorageFiles)
    .where(and(eq(campaignStorageFiles.campaignId, campaignId), counted(o.now)));
  const files: StorageFile[] = rows
    .map((r) => {
      const usedBy = isSound(r.key) ? ['Bibliothèque de sons'] : placeLabels(r.usedBy);
      return {
        key: r.key,
        url: `${o.publicBase}/${r.key}`,
        size: r.size,
        contentType: r.contentType,
        category: categoryOf({ key: r.key, usage: r.usage, usedBy: r.usedBy }),
        usedBy,
        pending: r.state === 'pending',
        deletable: deletable(r, o.now),
        createdAt: r.createdAt.toISOString(),
      };
    })
    .sort((a, b) => b.size - a.size);
  const byCategory = STORAGE_CATEGORIES.map((category: StorageCategory) => {
    const of = files.filter((f) => f.category === category);
    return { category, bytes: of.reduce((t, f) => t + f.size, 0), count: of.length };
  }).filter((c) => c.count > 0);
  const at = await inventoriedAt(db, campaignId);
  return {
    campaignId,
    quotaBytes: o.quota,
    usedBytes: files.reduce((t, f) => t + f.size, 0),
    byCategory,
    files,
    inventoriedAt: at ? at.toISOString() : null,
  };
}

/**
 * Supprime un fichier inutilisé de la campagne : vérifié **au moment de la demande** auprès de
 * tous les services (une référence posée depuis l'inventaire l'emporte : 409).
 */
export async function deleteStorageFile(
  deps: InventoryDeps,
  campaignId: string,
  key: string,
): Promise<void> {
  const [row] = await deps.db
    .select()
    .from(campaignStorageFiles)
    .where(
      and(
        eq(campaignStorageFiles.campaignId, campaignId),
        inArray(campaignStorageFiles.key, [key]),
      ),
    );
  const now = deps.now();
  if (!row) throw HttpError.notFound('Fichier inconnu dans cette campagne');
  if (!deletable({ ...row, usedBy: [] }, now))
    throw new HttpError(
      409,
      'Suppression refusée',
      STORAGE_ERRORS.notDeletable,
      'Seule une image ou une vidéo envoyée depuis plus d’une heure se supprime ici',
    );
  const places = await deps.places([key]);
  if (places[key.toLowerCase()]?.length) {
    await deps.db
      .update(campaignStorageFiles)
      .set({ usedBy: places[key.toLowerCase()]! })
      .where(eq(campaignStorageFiles.key, key));
    throw new HttpError(
      409,
      'Fichier utilisé',
      STORAGE_ERRORS.fileInUse,
      `Ce fichier sert encore : ${placeLabels(places[key.toLowerCase()]!).join(', ')}`,
    );
  }
  await deps.store.remove([key]);
  await deps.db.delete(campaignStorageFiles).where(eq(campaignStorageFiles.key, key));
}
