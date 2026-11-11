/**
 * Écriture d'une archive `.yner` en flux vers le stockage (docs/export-campagne.md § 4) : tables
 * (JSON compressé), fichiers (rangés tels quels, empreinte calculée au passage), manifeste en
 * dernier. Rien n'est gardé en mémoire au-delà d'une table et d'une partie d'envoi.
 */
import { createHash } from 'node:crypto';
import { PassThrough, Transform, type Readable } from 'node:stream';
import {
  ARCHIVE_CONTENT_TYPE,
  ARCHIVE_MANIFEST_PATH,
  ArchiveManifest,
  archiveFilePath,
  archiveTablePath,
  type ArchiveFile,
  type ArchiveRows,
  type ArchiveService,
  type ArchiveServiceManifest,
} from '@vtt/contracts';
import yazl from 'yazl';
import type { ArchiveStore } from '../storage/store.js';

export interface ArchiveTableInput {
  service: ArchiveService;
  table: string;
  rows: ArchiveRows;
}

export interface ArchiveFileInput {
  key: string;
  size: number;
  contentType: string;
  open: () => Promise<Readable>;
}

export interface ArchiveInput {
  /** Manifeste sans ses fichiers ni ses services (calculés ici). */
  head: Omit<ArchiveManifest, 'files' | 'services'>;
  schemaVersions: Partial<Record<ArchiveService, string>>;
  tables: ArchiveTableInput[];
  files: ArchiveFileInput[];
}

/** Écrit l'archive sous `key` ; rend son manifeste et sa taille. */
export async function writeArchive(
  store: ArchiveStore,
  key: string,
  input: ArchiveInput,
  onProgress: (done: number) => void = () => {},
): Promise<{ manifest: ArchiveManifest; size: number }> {
  const zip = new yazl.ZipFile();
  let size = 0;
  const counted = new PassThrough();
  counted.on('data', (chunk: Buffer) => (size += chunk.length));
  (zip.outputStream as Readable).pipe(counted);
  const upload = store.write(key, counted, ARCHIVE_CONTENT_TYPE);
  // Une erreur d'envoi arrête l'écriture (sinon yazl attendrait un lecteur)
  const failed = upload.then(
    () => new Promise<never>(() => {}),
    (e: unknown) => Promise.reject(e),
  );

  const services: Partial<Record<ArchiveService, ArchiveServiceManifest>> = {};
  for (const t of input.tables) {
    const s = (services[t.service] ??= {
      schemaVersion: input.schemaVersions[t.service] ?? '0',
      tables: {},
    });
    s.tables[t.table] = t.rows.length;
    zip.addBuffer(Buffer.from(JSON.stringify(t.rows)), archiveTablePath(t.service, t.table), {
      compress: true,
    });
  }

  const total = input.files.reduce((n, f) => n + f.size, 0) || 1;
  let done = 0;
  const files: ArchiveFile[] = [];
  const hashed = input.files.map(
    (f, index) =>
      new Promise<void>((resolve, reject) => {
        zip.addReadStreamLazy(archiveFilePath(index), { compress: false, size: f.size }, (cb) => {
          f.open().then(
            (source) => {
              const hash = createHash('sha256');
              const tap = new Transform({
                transform(chunk: Buffer, _enc, next) {
                  hash.update(chunk);
                  done += chunk.length;
                  onProgress(done / total);
                  next(null, chunk);
                },
                flush(next) {
                  files.push({
                    index,
                    key: f.key,
                    sha256: hash.digest('hex'),
                    size: f.size,
                    contentType: f.contentType,
                  });
                  resolve();
                  next();
                },
              });
              source.on('error', (e) => {
                tap.destroy(e);
                reject(e);
              });
              cb(null, source.pipe(tap));
            },
            (e: unknown) => {
              reject(e);
              cb(e, new PassThrough());
            },
          );
        });
      }),
  );

  await Promise.race([Promise.all(hashed), failed]);
  const manifest = ArchiveManifest.parse({
    ...input.head,
    services,
    files: files.sort((a, b) => a.index - b.index),
  });
  zip.addBuffer(Buffer.from(JSON.stringify(manifest)), ARCHIVE_MANIFEST_PATH, { compress: true });
  zip.end();
  await upload;
  return { manifest, size };
}
