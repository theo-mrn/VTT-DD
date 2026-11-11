/**
 * Export, import et duplication des campagnes (service archive, docs/export-campagne.md § 6) :
 * lancer une tâche, suivre le centre « Mes exports », télécharger, effacer.
 */
import {
  ARCHIVE_CONTENT_TYPE,
  type ArchiveDownloadTicket,
  type ArchiveImportUploadTicket,
  type ArchiveJob,
  type ArchiveJobList,
} from '@vtt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export const archiveKeys = { jobs: ['archives', 'jobs'] as const };

/** Une tâche qui avance encore (le centre se rafraîchit tant qu'il y en a une). */
export const isActive = (j: ArchiveJob) =>
  j.status === 'pending' || j.status === 'running' || j.status === 'uploading';

export function useArchiveJobs() {
  return useQuery({
    queryKey: archiveKeys.jobs,
    queryFn: async () => (await api<ArchiveJobList>('/v1/archives/jobs')).jobs,
    refetchInterval: (q) => ((q.state.data ?? []).some(isActive) ? 3_000 : false),
  });
}

export function useStartArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (o: { kind: 'export' | 'duplicate'; campaignId: string; keepProgress: boolean }) =>
      api<ArchiveJob>(o.kind === 'export' ? '/v1/archives/exports' : '/v1/archives/duplicates', {
        method: 'POST',
        body: JSON.stringify({ campaignId: o.campaignId, keepProgress: o.keepProgress }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: archiveKeys.jobs }),
  });
}

/** PUT direct vers R2, avec sa progression. */
function putFile(url: string, file: File, onProgress: (p: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', ARCHIVE_CONTENT_TYPE);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`R2 ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Envoi interrompu')); // i18n-ignore : remplacé à l'écran
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new DOMException('Envoi annulé', 'AbortError')); // i18n-ignore
    xhr.send(file);
  });
}

export function useImportArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: {
      file: File;
      onProgress: (p: number) => void;
      signal?: AbortSignal;
    }) => {
      const ticket = await api<ArchiveImportUploadTicket>('/v1/archives/imports', {
        method: 'POST',
        body: JSON.stringify({ size: o.file.size }),
      });
      await qc.invalidateQueries({ queryKey: archiveKeys.jobs });
      await putFile(ticket.uploadUrl, o.file, o.onProgress, o.signal);
      return api<ArchiveJob>(`/v1/archives/jobs/${encodeURIComponent(ticket.job.id)}/start`, {
        method: 'POST',
      });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: archiveKeys.jobs }),
  });
}

export async function downloadArchive(jobId: string) {
  const { url } = await api<ArchiveDownloadTicket>(
    `/v1/archives/jobs/${encodeURIComponent(jobId)}/download`,
  );
  window.location.assign(url);
}

export function useDeleteArchiveJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      api<void>(`/v1/archives/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }),
    onSuccess: (_r, jobId) =>
      qc.setQueryData<ArchiveJob[]>(archiveKeys.jobs, (jobs) =>
        jobs?.filter((j) => j.id !== jobId),
      ),
  });
}
