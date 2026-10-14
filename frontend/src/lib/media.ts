'use client';

/**
 * Médiathèque de la campagne (docs/mediatheque.md) : images déjà envoyées, rangées en dossiers.
 * Lecture d'un dossier, écritures (dossiers, rangement, visibilité), tenue à jour par
 * `media.changed`. Le dernier dossier ouvert est celui où partent les envois suivants.
 */
import type {
  CreateMediaFolder,
  LibraryKind,
  MediaFolder,
  MediaListing,
  UpdateMediaFile,
  UpdateMediaFolder,
} from '@vtt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createStore } from 'zustand/vanilla';
import { translate } from '@/i18n/runtime';
import { api, messageErreur } from './api';
import { useCampaignEvents } from './realtime';

const base = (campaignId: string, rest = '') =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}/media${rest}`;

export const mediaApi = {
  list: (campaignId: string, folder: string | null, kind: LibraryKind) =>
    api<MediaListing>(
      base(campaignId, `?kind=${kind}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`),
    ),
  createFolder: (campaignId: string, body: CreateMediaFolder) =>
    api<MediaFolder>(base(campaignId, '/folders'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateFolder: (campaignId: string, id: string, body: UpdateMediaFolder) =>
    api<MediaFolder>(base(campaignId, `/folders/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  removeFolder: (campaignId: string, id: string) =>
    api<void>(base(campaignId, `/folders/${encodeURIComponent(id)}`), { method: 'DELETE' }),
  updateFile: (campaignId: string, key: string, body: UpdateMediaFile) =>
    api<void>(base(campaignId, `/files?key=${encodeURIComponent(key)}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};

export const mediaKeys = {
  all: (campaignId: string) => ['campaign', campaignId, 'media'] as const,
  list: (campaignId: string, folder: string | null, kind: LibraryKind) =>
    ['campaign', campaignId, 'media', folder ?? 'root', kind] as const,
};

/** Dernier dossier ouvert par campagne : les envois suivants y partent. */
export const lastMediaFolder = createStore<Record<string, string | null>>(() => ({}));

export function useMediaListing(
  campaignId: string,
  folder: string | null,
  kind: LibraryKind,
  enabled = true,
) {
  const qc = useQueryClient();
  useCampaignEvents(
    campaignId,
    ['media.changed'],
    () => void qc.invalidateQueries({ queryKey: mediaKeys.all(campaignId) }),
    { enabled },
  );
  return useQuery({
    queryKey: mediaKeys.list(campaignId, folder, kind),
    queryFn: () => mediaApi.list(campaignId, folder, kind),
    enabled,
  });
}

/** Écritures de la médiathèque : chacune relit les vues, et signale un échec. */
export function useMediaMutations(campaignId: string) {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: mediaKeys.all(campaignId) });
  const onError = (e: unknown) =>
    toast.error(translate('uploads.library.failed'), { description: messageErreur(e) });
  return {
    createFolder: useMutation({
      mutationFn: (body: CreateMediaFolder) => mediaApi.createFolder(campaignId, body),
      onSuccess: refresh,
      onError,
    }),
    updateFolder: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateMediaFolder }) =>
        mediaApi.updateFolder(campaignId, id, body),
      onSuccess: refresh,
      onError,
    }),
    removeFolder: useMutation({
      mutationFn: (id: string) => mediaApi.removeFolder(campaignId, id),
      onSuccess: refresh,
      onError,
    }),
    updateFile: useMutation({
      mutationFn: ({ key, body }: { key: string; body: UpdateMediaFile }) =>
        mediaApi.updateFile(campaignId, key, body),
      onSuccess: refresh,
      onError,
    }),
  };
}
