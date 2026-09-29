'use client';

/**
 * Données du panneau Scènes (MJ) : scènes, dossiers, réglages de carte, et leurs écritures.
 * Chaque écriture relit ce qu'elle touche ; une erreur s'affiche en toast (`messageErreur`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateMapGroup,
  CreateMapScene,
  TravelToMap,
  UpdateMapGroup,
  UpdateMapScene,
  UpdateMapSettings,
} from '@vtt/contracts';
import { toast } from 'sonner';
import { messageErreur } from '@/lib/api';
import { mapKeys, mapsApi } from '@/lib/map/api';

export function useScenesData(campaignId: string) {
  const maps = useQuery({
    queryKey: mapKeys.list(campaignId),
    queryFn: () => mapsApi.list(campaignId),
  });
  const groups = useQuery({
    queryKey: mapKeys.groups(campaignId),
    queryFn: () => mapsApi.groups(campaignId),
  });
  const settings = useQuery({
    queryKey: mapKeys.settings(campaignId),
    queryFn: () => mapsApi.settings(campaignId),
  });
  return { maps, groups, settings };
}

/** Écritures du panneau Scènes ; chacune relit la carte de la campagne à la fin. */
export function useScenesActions(campaignId: string) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: mapKeys.scope(campaignId) });
  const fail = (err: unknown) => toast.error(messageErreur(err));
  const options = { onSettled: done, onError: fail };

  const createScene = useMutation({
    mutationFn: (body: CreateMapScene) => mapsApi.create(campaignId, body),
    ...options,
  });
  const updateScene = useMutation({
    mutationFn: (v: { mapId: string; patch: UpdateMapScene }) =>
      mapsApi.update(campaignId, v.mapId, v.patch),
    ...options,
  });
  const removeScene = useMutation({
    mutationFn: (mapId: string) => mapsApi.remove(campaignId, mapId),
    ...options,
  });
  const travel = useMutation({
    mutationFn: (v: { mapId: string; body: TravelToMap }) =>
      mapsApi.travel(campaignId, v.mapId, v.body),
    ...options,
  });
  const updateSettings = useMutation({
    mutationFn: (patch: UpdateMapSettings) => mapsApi.updateSettings(campaignId, patch),
    ...options,
  });
  const createGroup = useMutation({
    mutationFn: (body: CreateMapGroup) => mapsApi.createGroup(campaignId, body),
    ...options,
  });
  const updateGroup = useMutation({
    mutationFn: (v: { groupId: string; patch: UpdateMapGroup }) =>
      mapsApi.updateGroup(campaignId, v.groupId, v.patch),
    ...options,
  });
  const removeGroup = useMutation({
    mutationFn: (groupId: string) => mapsApi.removeGroup(campaignId, groupId),
    ...options,
  });
  const upload = useMutation({
    mutationFn: (file: File) => mapsApi.upload(campaignId, file),
    onError: fail,
  });

  return {
    createScene,
    updateScene,
    removeScene,
    travel,
    updateSettings,
    createGroup,
    updateGroup,
    removeGroup,
    upload,
  };
}

export type ScenesActions = ReturnType<typeof useScenesActions>;

/** Formats de fond acceptés (docs/carte.md § 10). */
export const BACKGROUND_ACCEPT =
  'image/png,image/jpeg,image/webp,image/avif,image/gif,video/webm,video/mp4';

export const isVideoBackground = (url: string | null | undefined) =>
  !!url && /\.(webm|mp4|m4v|mov)(\?|#|$)/i.test(url);
