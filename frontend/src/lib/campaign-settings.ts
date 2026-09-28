/**
 * Réglages de table d'une campagne : service campaign (`/v1/campaigns/:id/settings`,
 * contrat dans docs/api-campaign.md). Lus par tous les membres, modifiés par le MJ
 * avec la version lue (409 `version_conflict` si un autre MJ a enregistré entre-temps).
 *
 * Aujourd'hui : les attributs retirés du lanceur de dés (`dice.hiddenAttributes`) et les
 * règles optionnelles du système allumées ou éteintes (`rules.options`, seulement les écarts
 * au défaut du système). Le temps réel (`campaign.settings_updated`) invalide la requête
 * (lib/realtime-sync.ts) : les fiches de la campagne se recalculent.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { avecOptions } from '@vtt/rules';
import { useMemo } from 'react';
import { api } from './api';
import { clesCampagnes } from './campagnes';
import { useSysteme } from './systemes';

export interface CampaignSettings {
  /** 0 tant que le MJ n'a rien réglé. */
  version: number;
  dice: {
    /** Attributs jetables retirés du lanceur de dés pour toute la table. */
    hiddenAttributes: string[];
  };
  rules: {
    /** Règles optionnelles réglées par le MJ : écarts au défaut du système seulement. */
    options: Record<string, boolean>;
  };
  updatedAt: string | null;
}

export interface CampaignSettingsChange {
  version: number;
  dice?: { hiddenAttributes?: string[] };
  /** Options envoyées réglées, les autres gardent leur valeur. */
  rules?: { options?: Record<string, boolean> };
}

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  version: 0,
  dice: { hiddenAttributes: [] },
  rules: { options: {} },
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

/**
 * Règles optionnelles réglées dans une campagne : `{}` hors campagne, ou si les réglages
 * sont illisibles (défauts du système) ; `undefined` pendant leur lecture.
 */
export function useCampaignRuleOptions(
  campaignId: string | null | undefined,
): Record<string, boolean> | undefined {
  const settings = useCampaignSettings(campaignId);
  if (!campaignId || settings.isError) return AUCUNE_OPTION;
  return settings.data ? (settings.data.rules?.options ?? AUCUNE_OPTION) : undefined;
}

const AUCUNE_OPTION: Record<string, boolean> = Object.freeze({}) as Record<string, boolean>;

/**
 * Système d'une campagne tel qu'elle le joue : ses règles, réglées avec les options de la
 * campagne (`avecOptions`), et sa présentation. Tout calcul qui en part (fiche, achats,
 * création) respecte ces options, comme le service character. `data` reste absent tant
 * que le système ou les réglages se lisent (pas de fiche calculée avec de mauvaises options).
 */
export function useCampaignSystem(
  systemId: string | null | undefined,
  campaignId: string | null | undefined,
) {
  const systeme = useSysteme(systemId);
  const options = useCampaignRuleOptions(campaignId);
  const data = useMemo(
    () =>
      systeme.data && options
        ? { ...systeme.data, systeme: avecOptions(systeme.data.systeme, options) }
        : undefined,
    [systeme.data, options],
  );
  return {
    data,
    isPending: systeme.isPending || (Boolean(systemId) && !options),
    isError: systeme.isError,
    error: systeme.error,
  };
}
