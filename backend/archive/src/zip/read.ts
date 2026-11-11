/**
 * Lecture d'une archive `.yner` depuis le stockage, par plages (docs/export-campagne.md § 8) :
 * seul le répertoire du zip, le manifeste et les tables sont lus en entier ; les fichiers le
 * sont en flux, au moment de leur copie. Toute entrée inattendue rend l'archive invalide.
 */
import { createHash } from 'node:crypto';
import { PassThrough, Transform, type Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import {
  ARCHIVE_ERRORS,
  ARCHIVE_LIMITS,
  ARCHIVE_MANIFEST_PATH,
  ArchiveManifest,
  ArchiveRows,
  archiveFilePath,
  archiveTablePath,
  parseArchivePath,
  type ArchiveFile,
  type ArchiveService,
} from '@vtt/contracts';
import yauzl from 'yauzl';
import type { ArchiveStore } from '../storage/store.js';

export class ArchiveError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const invalid = (message: string) => new ArchiveError(ARCHIVE_ERRORS.invalid, message);

/** Taille du manifeste, décompressé. */
const MANIFEST_BYTES = 32 * 1024 ** 2;

class StoreReader extends yauzl.RandomAccessReader {
  constructor(
    private readonly store: ArchiveStore,
    private readonly key: string,
  ) {
    super();
  }

  override _readStreamForRange(start: number, end: number): Readable {
    const out = new PassThrough();
    this.store.readRange(this.key, start, end).then(
      (s) => s.on('error', (e) => out.destroy(e)).pipe(out),
      (e: unknown) => out.destroy(e as Error),
    );
    return out;
  }
}

export interface OpenArchive {
  manifest: ArchiveManifest;
  /** Lignes d'une table ; [] si elle n'est pas dans l'archive. */
  rows(service: ArchiveService, table: string): Promise<ArchiveRows>;
  /** Contenu d'un fichier, taille et empreinte vérifiées à la fin du flux. */
  file(f: ArchiveFile): Promise<Readable>;
  close(): void;
}

export async function openArchive(store: ArchiveStore, key: string): Promise<OpenArchive> {
  const head = await store.head(key);
  if (!head) throw invalid('Archive absente');
  if (head.size > ARCHIVE_LIMITS.bytes)
    throw new ArchiveError(ARCHIVE_ERRORS.tooLarge, 'Archive trop volumineuse');

  let zip: yauzl.ZipFile;
  try {
    zip = await yauzl.fromRandomAccessReaderPromise(new StoreReader(store, key), head.size, {
      lazyEntries: true,
      validateEntrySizes: true,
      strictFileNames: true,
      autoClose: false,
    });
  } catch (e) {
    throw invalid(`Zip illisible : ${(e as Error).message}`);
  }

  const entries = new Map<string, yauzl.Entry>();
  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      if (entries.size > ARCHIVE_LIMITS.files + 1000) return reject(invalid('Trop d’entrées'));
      if (entry.isEncrypted()) return reject(invalid('Entrée chiffrée'));
      if (!parseArchivePath(entry.fileName))
        return reject(invalid(`Entrée inattendue : ${entry.fileName.slice(0, 100)}`));
      if (entries.has(entry.fileName)) return reject(invalid('Entrée en double'));
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.on('end', () => resolve());
    zip.on('error', (e: Error) => reject(invalid(e.message)));
    zip.readEntry();
  });

  async function text(path: string, max: number): Promise<string | null> {
    const entry = entries.get(path);
    if (!entry) return null;
    if (entry.uncompressedSize > max) throw invalid(`${path} trop volumineux`);
    const stream = await zip.openReadStreamPromise(entry);
    return (await buffer(stream)).toString('utf8');
  }

  const raw = await text(ARCHIVE_MANIFEST_PATH, MANIFEST_BYTES);
  if (raw === null) throw invalid('Manifeste absent');
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw invalid('Manifeste illisible');
  }
  if ((json as { format?: unknown })?.format !== 1)
    throw new ArchiveError(ARCHIVE_ERRORS.unsupportedVersion, 'Version d’archive inconnue');
  const parsed = ArchiveManifest.safeParse(json);
  if (!parsed.success) throw invalid(`Manifeste invalide : ${parsed.error.issues[0]?.message}`);
  const manifest = parsed.data;
  if (manifest.files.reduce((n, f) => n + f.size, 0) > ARCHIVE_LIMITS.bytes)
    throw new ArchiveError(ARCHIVE_ERRORS.tooLarge, 'Fichiers trop volumineux');
  for (const f of manifest.files) {
    const entry = entries.get(archiveFilePath(f.index));
    if (!entry || entry.uncompressedSize !== f.size)
      throw invalid(`Fichier ${f.index} absent ou de taille différente`);
  }

  return {
    manifest,
    async rows(service, table) {
      const declared = manifest.services[service]?.tables[table];
      const t = await text(archiveTablePath(service, table), ARCHIVE_LIMITS.tableBytes);
      if (t === null) {
        if (declared) throw invalid(`Table ${service}.${table} absente`);
        return [];
      }
      let rows: unknown;
      try {
        rows = JSON.parse(t);
      } catch {
        throw invalid(`Table ${service}.${table} illisible`);
      }
      const ok = ArchiveRows.safeParse(rows);
      if (!ok.success || ok.data.length !== declared)
        throw invalid(`Table ${service}.${table} invalide`);
      return ok.data;
    },
    async file(f) {
      const entry = entries.get(archiveFilePath(f.index))!;
      const source = await zip.openReadStreamPromise(entry);
      const hash = createHash('sha256');
      const check = new Transform({
        transform(chunk: Buffer, _enc, next) {
          hash.update(chunk);
          next(null, chunk);
        },
        flush(next) {
          next(hash.digest('hex') === f.sha256 ? null : invalid(`Empreinte du fichier ${f.index}`));
        },
      });
      source.on('error', (e) => check.destroy(e));
      return source.pipe(check);
    },
    close: () => zip.close(),
  };
}
