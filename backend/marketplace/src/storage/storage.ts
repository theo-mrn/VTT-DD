/**
 * Fichiers des packs sur R2 (docs/marketplace.md § 3.2) :
 *
 *   marketplace/<fiche>/<uuidv7>.<ext>              couverture et galerie (envoi du navigateur)
 *   marketplace/<fiche>/assets/<uuidv7>.<ext>       fichiers copiés depuis campaigns/, characters/
 *   marketplace/<fiche>/versions/<version>.json     contenu d'une version (servi par l'API seule)
 *
 * Les copies se font de bucket à bucket (CopyObject) : le fichier ne transite pas par le service.
 */
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  createObjectStore,
  removePrefix,
  s3Client,
  withoutTrailingSlashes,
  type StorageSettings,
} from '@vtt/platform';

export interface ObjectHead {
  size: number;
  contentType: string | null;
}

export interface PackStorage {
  /** Adresse publique des fichiers, sans barre finale. */
  readonly publicBase: string;
  head(key: string): Promise<ObjectHead | null>;
  copy(sourceKey: string, targetKey: string, contentType: string): Promise<void>;
  putJson(key: string, body: Buffer): Promise<void>;
  getText(key: string): Promise<string>;
  /** Supprime tout un dossier ; rend le nombre de fichiers supprimés. */
  removePrefix(prefix: string): Promise<number>;
}

export const listingFolder = (listingId: string) => `marketplace/${listingId}/`;
export const assetKey = (listingId: string, name: string) =>
  `${listingFolder(listingId)}assets/${name}`;
export const contentKey = (listingId: string, versionId: string) =>
  `${listingFolder(listingId)}versions/${versionId}.json`;

const isMissing = (e: unknown) => {
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404
  );
};

/** Stockage S3 (R2), ou undefined s'il n'est pas configuré (envoi de contenu indisponible). */
export function createS3PackStorage(settings: StorageSettings): PackStorage | undefined {
  const s3 = s3Client(settings);
  const store = createObjectStore(settings);
  if (!s3 || !store || !settings.R2_PUBLIC_URL) return undefined;
  const { client, bucket } = s3;
  return {
    publicBase: withoutTrailingSlashes(settings.R2_PUBLIC_URL),
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: r.ContentLength ?? 0, contentType: r.ContentType ?? null };
      } catch (e) {
        if (isMissing(e)) return null;
        throw e;
      }
    },
    async copy(sourceKey, targetKey, contentType) {
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: targetKey,
          CopySource: `${bucket}/${encodeURIComponent(sourceKey).replace(/%2F/g, '/')}`,
          ContentType: contentType,
          MetadataDirective: 'REPLACE',
          // Fichier immuable : le CDN peut le garder longtemps
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },
    async putJson(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json',
          ContentLength: body.length,
          CacheControl: 'private, no-store',
        }),
      );
    },
    async getText(key) {
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!r.Body) throw new Error(`objet vide : ${key}`);
      return r.Body.transformToString('utf-8');
    },
    removePrefix: (prefix) => removePrefix(store, prefix),
  };
}
