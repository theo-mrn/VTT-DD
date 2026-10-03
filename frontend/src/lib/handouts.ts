'use client';

/**
 * Projection et documents (docs/projection.md) : bibliothèque du MJ, partages, documents reçus
 * et projection en cours. Les événements `handout.*` relisent les listes ; un partage projeté
 * s'affiche tout de suite, sans attendre la relecture.
 */
import type { DocumentsResponse, Handout, HandoutMode, SharedDocument } from '@vtt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from './api';
import { useCampaignEvents } from './realtime';

const base = (campaignId: string) => `/v1/campaigns/${encodeURIComponent(campaignId)}`;
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export const handoutKeys = {
  library: (campaignId: string) => ['handouts', campaignId, 'library'] as const,
  documents: (campaignId: string) => ['handouts', campaignId, 'documents'] as const,
};

export const handoutsApi = {
  library: async (campaignId: string) =>
    (await api<{ items: Handout[] }>(`${base(campaignId)}/handouts`)).items,
  create: (campaignId: string, body: { name: string; url: string }) =>
    api<Handout>(`${base(campaignId)}/handouts`, json('POST', body)),
  rename: (campaignId: string, id: string, name: string) =>
    api<Handout>(`${base(campaignId)}/handouts/${id}`, json('PATCH', { name })),
  remove: (campaignId: string, id: string) =>
    api<void>(`${base(campaignId)}/handouts/${id}`, json('DELETE')),
  share: (
    campaignId: string,
    id: string,
    body: { mode: HandoutMode; recipients: string[] | null },
  ) => api<{ id: string }>(`${base(campaignId)}/handouts/${id}/share`, json('POST', body)),
  stop: (campaignId: string, shareId: string) =>
    api<void>(`${base(campaignId)}/handout-shares/${shareId}/stop`, json('POST')),
};

/** Documents reçus, projection en cours, et l'écart à l'horloge du serveur (vidéos). */
export interface Documents extends DocumentsResponse {
  /** Heure du serveur − heure locale, en ms (estimée à mi-chemin de la requête). */
  offsetMs: number;
}

async function readDocuments(campaignId: string): Promise<Documents> {
  const sent = Date.now();
  const r = await api<DocumentsResponse>(`${base(campaignId)}/documents`);
  const received = Date.now();
  return { ...r, offsetMs: Date.parse(r.serverTime) - (sent + received) / 2 };
}

/** Relit les listes à chaque événement `handout.*` ; un partage projeté s'affiche aussitôt. */
function useHandoutEvents(campaignId: string) {
  const client = useQueryClient();
  useCampaignEvents(campaignId, ['handout.*'], (e) => {
    if (e.event.type === 'handout.shared' && !e.redacted) {
      const doc = e.event.payload as unknown as SharedDocument;
      client.setQueryData<Documents>(handoutKeys.documents(campaignId), (d) =>
        d
          ? {
              ...d,
              items: [doc, ...d.items.filter((x) => x.id !== doc.id)],
              projection: doc.mode === 'show' ? doc : d.projection,
            }
          : d,
      );
    }
    if (e.event.type === 'handout.stopped' && !e.redacted) {
      const id = (e.event.payload as { id?: string }).id;
      client.setQueryData<Documents>(handoutKeys.documents(campaignId), (d) =>
        d && d.projection?.id === id ? { ...d, projection: null } : d,
      );
    }
    void client.invalidateQueries({ queryKey: ['handouts', campaignId] });
  });
}

export function useDocuments(campaignId: string) {
  useHandoutEvents(campaignId);
  return useQuery({
    queryKey: handoutKeys.documents(campaignId),
    queryFn: () => readDocuments(campaignId),
    staleTime: 30_000,
  });
}

export function useHandoutLibrary(campaignId: string, enabled: boolean) {
  const client = useQueryClient();
  const q = useQuery({
    queryKey: handoutKeys.library(campaignId),
    queryFn: () => handoutsApi.library(campaignId),
    enabled,
    staleTime: 30_000,
  });
  const refresh = useCallback(
    () => client.invalidateQueries({ queryKey: ['handouts', campaignId] }),
    [client, campaignId],
  );
  return { items: q.data ?? [], loading: q.isPending && enabled, refresh };
}

export const isVideo = (contentType: string) => contentType.startsWith('video/');
