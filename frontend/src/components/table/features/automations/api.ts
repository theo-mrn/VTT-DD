'use client';

/**
 * Automatismes de la campagne (service campaign, MJ seulement) : lecture, écritures, et suivi
 * en direct (`automation.*`) pour les autres onglets ou MJ de la campagne.
 */
import type { Automation, CreateAutomation, UpdateAutomation } from '@vtt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { translate } from '@/i18n/runtime';
import { api, messageErreur } from '@/lib/api';
import { useCampaignEvents } from '@/lib/realtime';

const base = (campaignId: string, rest = '') =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}/automations${rest}`;

export const automationsApi = {
  list: async (campaignId: string) => (await api<{ items: Automation[] }>(base(campaignId))).items,
  create: (campaignId: string, body: CreateAutomation) =>
    api<Automation>(base(campaignId), { method: 'POST', body: JSON.stringify(body) }),
  update: (campaignId: string, id: string, body: UpdateAutomation) =>
    api<Automation>(base(campaignId, `/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (campaignId: string, id: string) =>
    api<void>(base(campaignId, `/${encodeURIComponent(id)}`), { method: 'DELETE' }),
};

export const automationKeys = {
  list: (campaignId: string) => ['campaign', campaignId, 'automations'] as const,
};

export function useAutomations(campaignId: string, enabled = true) {
  const qc = useQueryClient();
  useCampaignEvents(
    campaignId,
    ['automation.*'],
    () => void qc.invalidateQueries({ queryKey: automationKeys.list(campaignId) }),
    { enabled },
  );
  return useQuery({
    queryKey: automationKeys.list(campaignId),
    queryFn: () => automationsApi.list(campaignId),
    enabled,
  });
}

export function useSaveAutomation(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: CreateAutomation }) =>
      id ? automationsApi.update(campaignId, id, body) : automationsApi.create(campaignId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: automationKeys.list(campaignId) }),
    onError: (e) =>
      toast.error(translate('table.automations.saveFailed'), { description: messageErreur(e) }),
  });
}

export function useRemoveAutomation(campaignId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => automationsApi.remove(campaignId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: automationKeys.list(campaignId) }),
    onError: (e) =>
      toast.error(translate('table.automations.deleteFailed'), { description: messageErreur(e) }),
  });
}
