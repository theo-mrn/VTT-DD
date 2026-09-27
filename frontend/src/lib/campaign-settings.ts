/**
 * Réglages de table d'une campagne : service campaign (`/v1/campaigns/:id/settings`,
 * contrat dans docs/api-campaign.md). Lus par tous les membres, modifiés par le MJ
 * avec la version lue (409 `version_conflict` si un autre MJ a enregistré entre-temps).
 *
 * Aujourd'hui : les attributs retirés du lanceur de dés (`dice.hiddenAttributes`).
 * Le temps réel (`campaign.settings_updated`) invalide la requête (lib/realtime-sync.ts).
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { clesCampagnes } from './campagnes';

export interface CampaignSettings {
  /** 0 tant que le MJ n'a rien réglé. */
  version: number;
  dice: {
    /** Attributs jetables retirés du lanceur de dés pour toute la table. */
    hiddenAttributes: string[];
  };
  updatedAt: string | null;
}

export interface CampaignSettingsChange {
  version: number;
  dice?: { hiddenAttributes?: string[] };
}

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  version: 0,
  dice: { hiddenAttributes: [] },
  updatedAt: null,
};

export const campaignSettingsKey = (campaignId: string) =>
  [...clesCampagnes.une(campaignId), 'settings'] as const;

const settingsUrl = (campaignId: string) =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}/settings`;

export const campaignSettingsApi = {
  read: (campaignId: string) => api<CampaignSettings>(settingsUrl(campaignId)),
  update: (campaignId: string, change: CampaignSettingsChange) =>
    api<CampaignSettings>(settingsUrl(campaignId), {
      method: 'PATCH',
      body: JSON.stringify(change),
    }),
};

/** Réglages de table d'une campagne (aucune requête sans campagne). */
export function useCampaignSettings(campaignId: string | null | undefined) {
  return useQuery({
    queryKey: campaignSettingsKey(campaignId ?? ''),
    queryFn: () => campaignSettingsApi.read(campaignId!),
    enabled: Boolean(campaignId),
    staleTime: 60_000,
  });
}

/** Le MJ enregistre des réglages ; la réponse remplace le cache. */
export function useUpdateCampaignSettings(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: CampaignSettingsChange) => campaignSettingsApi.update(campaignId, change),
    onSuccess: (settings) => client.setQueryData(campaignSettingsKey(campaignId), settings),
  });
}
