/**
 * Contenu d'une version (docs/marketplace.md § 3.1 et 3.2) : validation du `PackContent`,
 * copie des fichiers cités dans le dossier de la fiche (R2 → R2), réécriture des adresses,
 * puis dépôt du document JSON.
 *
 * Sources admises : nos envois sous `campaigns/` et `characters/` (images et vidéos), les copies
 * déjà faites pour cette fiche, et les chemins du front (`/…`). Toute autre adresse est refusée,
 * liste à l'appui : le composeur propose de retirer ces images.
 */
import { createHash } from 'node:crypto';
import {
  mapPackUrls,
  PACK_LIMITS,
  PackContent,
  packCounts,
  packUrls,
  UPLOAD_EXTENSIONS,
  UPLOAD_MAP_IMAGE_TYPES,
  UPLOAD_VIDEO_TYPES,
  uuidv7,
  type PackCounts,
  type UploadContentType,
} from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { listingAssets } from '../db/schema.js';
import { assetKey, contentKey, listingFolder, type PackStorage } from '../storage/storage.js';

const MB = 1024 * 1024;
const IMAGE_MAX = 10 * MB;
const VIDEO_MAX = 100 * MB;
/** Copies menées en parallèle. */
const CONCURRENCY = 6;

const SOURCE_KEY =
  /^(campaigns|characters)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9_-]{1,100}\.(png|jpe?g|webp|gif|avif|webm|mp4)$/;

/** Adresses refusées : 422 asset_not_allowed avec la liste (`urls`). */
export class AssetsRejected extends Error {
  constructor(
    readonly code: 'asset_not_allowed' | 'asset_missing' | 'asset_too_large',
    readonly urls: string[],
  ) {
    super(code);
  }
}

/** Contenu invalide : 422 invalid_pack avec les erreurs de schéma. */
export class InvalidPack extends Error {
  constructor(readonly errors: { path: string; message: string }[]) {
    super('invalid_pack');
  }
}

export interface StoredContent {
  content: PackContent;
  counts: PackCounts;
  key: string;
  sha256: string;
  bytes: number;
}

type Classified =
  | { kind: 'keep' }
  | { kind: 'owned'; key: string }
  | { kind: 'copy'; sourceKey: string }
  | { kind: 'refused' };

/** Où vit une adresse, pour cette fiche. */
export function classifyUrl(url: string, publicBase: string, listingId: string): Classified {
  if (/^\/[^/]/.test(url)) return { kind: 'keep' };
  if (!url.startsWith(`${publicBase}/`)) return { kind: 'refused' };
  const key = url.slice(publicBase.length + 1);
  if (key.includes('?') || key.includes('#') || key.includes('..')) return { kind: 'refused' };
  if (key.startsWith(`${listingFolder(listingId)}assets/`)) return { kind: 'owned', key };
  if (SOURCE_KEY.test(key)) return { kind: 'copy', sourceKey: key };
  return { kind: 'refused' };
}

const ALLOWED_TYPES = new Set<string>([...UPLOAD_MAP_IMAGE_TYPES, ...UPLOAD_VIDEO_TYPES]);

async function inBatches<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += CONCURRENCY)
    await Promise.all(items.slice(i, i + CONCURRENCY).map(run));
}

/**
 * Valide le contenu reçu, copie ses fichiers et le dépose ; rend ce qu'il faut enregistrer sur la
 * version. Rejouable : une source déjà copiée pour la fiche n'est pas recopiée.
 */
export async function storeContent(
  deps: { db: Db; storage: PackStorage },
  listingId: string,
  versionId: string,
  raw: unknown,
): Promise<StoredContent> {
  const parsed = PackContent.safeParse(raw);
  if (!parsed.success)
    throw new InvalidPack(
      parsed.error.issues.slice(0, 20).map((i) => ({
        path: `/${i.path.join('/')}`,
        message: i.message,
      })),
    );
  const pack = parsed.data;
  const { storage, db } = deps;

  const urls = packUrls(pack);
  const classified = new Map(urls.map((u) => [u, classifyUrl(u, storage.publicBase, listingId)]));
  const refused = urls.filter((u) => classified.get(u)!.kind === 'refused');
  if (refused.length) throw new AssetsRejected('asset_not_allowed', refused);
  const files = urls.filter((u) => classified.get(u)!.kind !== 'keep');
  if (files.length > PACK_LIMITS.assets)
    throw new HttpError(
      422,
      'Pack trop lourd',
      'too_many_assets',
      `${PACK_LIMITS.assets} fichiers au plus par version`,
    );

  // Copies déjà faites pour cette fiche (versions précédentes, nouvel envoi)
  const known = await db.select().from(listingAssets).where(eq(listingAssets.listingId, listingId));
  const bySource = new Map(known.map((a) => [a.sourceKey, a]));
  const byKey = new Map(known.map((a) => [a.key, a]));

  const sources = files.flatMap((u) => {
    const c = classified.get(u)!;
    return c.kind === 'copy' ? [c.sourceKey] : [];
  });
  const toCopy = [...new Set(sources)].filter((s) => !bySource.has(s));

  // En-têtes des nouvelles sources : existence, type et taille
  const heads = new Map<string, { size: number; contentType: string }>();
  const missing: string[] = [];
  const tooLarge: string[] = [];
  await inBatches(toCopy, async (sourceKey) => {
    const head = await storage.head(sourceKey);
    const url = `${storage.publicBase}/${sourceKey}`;
    if (!head || !head.contentType || !ALLOWED_TYPES.has(head.contentType)) {
      missing.push(url);
      return;
    }
    const max = head.contentType.startsWith('video/') ? VIDEO_MAX : IMAGE_MAX;
    if (head.size > max) tooLarge.push(url);
    heads.set(sourceKey, { size: head.size, contentType: head.contentType });
  });
  if (missing.length) throw new AssetsRejected('asset_missing', missing);
  if (tooLarge.length) throw new AssetsRejected('asset_too_large', tooLarge);

  // Poids total des fichiers de la version
  let total = 0;
  for (const u of files) {
    const c = classified.get(u)!;
    if (c.kind === 'owned') total += byKey.get(c.key)?.bytes ?? 0;
    if (c.kind === 'copy')
      total += bySource.get(c.sourceKey)?.bytes ?? heads.get(c.sourceKey)!.size;
  }
  if (total > PACK_LIMITS.assetBytes)
    throw new HttpError(422, 'Pack trop lourd', 'pack_too_large', '500 Mo de fichiers au plus');

  // Une adresse « déjà copiée » doit désigner une copie connue de cette fiche
  const unknownOwned = files.filter((u) => {
    const c = classified.get(u)!;
    return c.kind === 'owned' && !byKey.has(c.key);
  });
  if (unknownOwned.length) throw new AssetsRejected('asset_missing', unknownOwned);

  await inBatches(toCopy, async (sourceKey) => {
    const { size, contentType } = heads.get(sourceKey)!;
    const ext = UPLOAD_EXTENSIONS[contentType as UploadContentType];
    const key = assetKey(listingId, `${uuidv7()}.${ext}`);
    await storage.copy(sourceKey, key, contentType);
    const [row] = await db
      .insert(listingAssets)
      .values({ listingId, sourceKey, key, bytes: size, contentType })
      .onConflictDoNothing()
      .returning();
    // Copie concurrente gagnante : on garde la sienne (la nôtre reste orpheline, inoffensive)
    bySource.set(sourceKey, row ?? (await sourceRow(db, listingId, sourceKey)));
  });

  const content = mapPackUrls(pack, (url) => {
    const c = classified.get(url);
    if (c?.kind !== 'copy') return url;
    return `${storage.publicBase}/${bySource.get(c.sourceKey)!.key}`;
  });

  const body = Buffer.from(JSON.stringify(content), 'utf8');
  if (body.length > PACK_LIMITS.contentBytes)
    throw new HttpError(422, 'Pack trop lourd', 'pack_too_large', 'Contenu de 8 Mo au plus');
  const key = contentKey(listingId, versionId);
  await storage.putJson(key, body);
  return {
    content,
    counts: packCounts(content),
    key,
    sha256: createHash('sha256').update(body).digest('hex'),
    bytes: body.length,
  };
}

async function sourceRow(db: Db, listingId: string, sourceKey: string) {
  const rows = await db.select().from(listingAssets).where(eq(listingAssets.listingId, listingId));
  const row = rows.find((r) => r.sourceKey === sourceKey);
  if (!row) throw new Error(`copie introuvable : ${sourceKey}`);
  return row;
}

/** Relit le contenu d'une version et vérifie son empreinte. */
export async function readContent(
  storage: PackStorage,
  key: string,
  sha256: string,
): Promise<PackContent> {
  const text = await storage.getText(key);
  const actual = createHash('sha256').update(text, 'utf8').digest('hex');
  if (actual !== sha256) throw new Error(`contenu altéré : ${key}`);
  return PackContent.parse(JSON.parse(text));
}
