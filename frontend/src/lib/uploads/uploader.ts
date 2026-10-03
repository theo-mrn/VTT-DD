/**
 * Envoi de fichiers (docs/uploads.md) : Uppy envoie chaque fichier directement au stockage (R2
 * en prod), avec la progression, les reprises et l'annulation ; nos services ne font que signer
 * (`POST …/uploads`, même forme partout). Le type et la taille du fichier sont signés : le
 * stockage refuse tout autre fichier.
 *
 * Uppy (plugin S3) ne donne à la signature que la clé qu'il a choisie : on lui fait prendre
 * l'identifiant du fichier, on retrouve ainsi le fichier, et notre route rend la vraie clé.
 *
 * Uppy n'est chargé qu'au premier envoi (import dynamique) : ce module est importé par la
 * session, donc par toutes les pages, et doit rester léger.
 */
import {
  checkUpload,
  type FileImport,
  type FileUploadTicket,
  type UploadUsageId,
} from '@vtt/contracts';
import { api } from '../api';

/** À qui appartient le fichier (le service qui le signe). */
export type UploadTarget =
  { kind: 'user' } | { kind: 'campaign'; id: string } | { kind: 'character'; id: string };

export function uploadRoute(t: UploadTarget): string {
  switch (t.kind) {
    case 'user':
      return '/v1/users/me/uploads';
    case 'campaign':
      return `/v1/campaigns/${encodeURIComponent(t.id)}/uploads`;
    case 'character':
      return `/v1/characters/${encodeURIComponent(t.id)}/uploads`;
  }
}

/** Billet d'envoi d'un fichier. */
export function requestTicket(
  target: UploadTarget,
  usage: UploadUsageId,
  file: { type: string; size: number; name?: string },
): Promise<FileUploadTicket> {
  return api<FileUploadTicket>(uploadRoute(target), {
    method: 'POST',
    body: JSON.stringify({
      usage,
      contentType: file.type,
      size: file.size,
      ...(file.name ? { name: file.name.slice(0, 255) } : {}),
    }),
  });
}

/**
 * Import d'une image d'un autre site que le navigateur ne peut pas lire (CORS) : le service la
 * télécharge et la range sur notre stockage (`POST …/uploads/import`). Rend sa copie.
 */
export function importFile(
  target: UploadTarget,
  usage: UploadUsageId,
  url: string,
): Promise<FileImport> {
  return api<FileImport>(`${uploadRoute(target)}/import`, {
    method: 'POST',
    body: JSON.stringify({ usage, url }),
  });
}

export interface UploadProgress {
  /** 0 à 1. */
  progress: number;
  bytesUploaded: number;
  bytesTotal: number;
}

/**
 * Envoie un fichier et rend son adresse publique. `onProgress` suit l'envoi ; `signal` l'annule.
 * Refus local (format, taille) : erreur avec le message de l'usage, avant tout appel réseau.
 */
export async function uploadFile(
  target: UploadTarget,
  usage: UploadUsageId,
  file: File,
  o: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const refus = checkUpload({ usage, contentType: file.type, size: file.size });
  if (refus) throw new Error(refus.message);

  const [{ default: Uppy }, { default: AwsS3 }] = await Promise.all([
    import('@uppy/core'),
    import('@uppy/aws-s3'),
  ]);
  if (o.signal?.aborted) throw new DOMException('Envoi annulé', 'AbortError');

  const tickets = new Map<string, FileUploadTicket>();
  const uppy = new Uppy({ autoProceed: false, allowMultipleUploadBatches: false });
  uppy.use(AwsS3, {
    shouldUseMultipart: false,
    // La clé provisoire est l'identifiant du fichier : on le retrouve à la signature
    generateObjectKey: (f) => f.id,
    signRequest: async (req) => {
      const f = uppy.getFile(req.key);
      if (!f || req.method !== 'PUT') throw new Error('Envoi inattendu');
      const ticket = await requestTicket(target, usage, {
        type: f.type ?? file.type,
        size: f.size ?? file.size,
        name: f.name,
      });
      tickets.set(f.id, ticket);
      return { url: ticket.url, key: ticket.key, headers: ticket.headers };
    },
  });

  const id = uppy.addFile({ name: file.name, type: file.type, data: file, source: 'local' });
  uppy.on('upload-progress', (_f, p) => {
    const total = p.bytesTotal ?? file.size;
    o.onProgress?.({
      progress: total ? p.bytesUploaded / total : 0,
      bytesUploaded: p.bytesUploaded,
      bytesTotal: total,
    });
  });
  const abort = () => uppy.cancelAll();
  o.signal?.addEventListener('abort', abort, { once: true });
  try {
    const result = await uppy.upload();
    if (o.signal?.aborted) throw new DOMException('Envoi annulé', 'AbortError');
    const failed = result?.failed?.[0];
    if (failed) {
      const e: unknown = failed.error;
      if (e instanceof Error) throw e;
      throw new Error(typeof e === 'string' && e ? e : 'Envoi impossible');
    }
    const ticket = tickets.get(id);
    if (!ticket) throw new Error('Envoi impossible');
    o.onProgress?.({ progress: 1, bytesUploaded: file.size, bytesTotal: file.size });
    return ticket.publicUrl;
  } finally {
    o.signal?.removeEventListener('abort', abort);
    uppy.destroy();
  }
}
