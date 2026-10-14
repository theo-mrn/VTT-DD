'use client';

/** Règles du moteur des automatismes et leur journal (service campaign, MJ seulement). */
import type {
  AutomationRule,
  AutomationRun,
  CreateAutomationRule,
  UpdateAutomationRule,
} from '@vtt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { translate } from '@/i18n/runtime';
import { api, messageErreur } from '@/lib/api';
import { useCampaignEvents } from '@/lib/realtime';

const base = (campaignId: string, rest = '') =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}${rest}`;

export const rulesApi = {
  list: async (campaignId: string) =>
    (await api<{ items: AutomationRule[] }>(base(campaignId, '/automation-rules'))).items,
  runs: async (campaignId: string) =>
    (await api<{ items: AutomationRun[] }>(base(campaignId, '/automation-runs'))).items,
  create: (campaignId: string, body: CreateAutomationRule) =>
    api<AutomationRule>(base(campaignId, '/automation-rules'), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  update: (campaignId: string, id: string, body: UpdateAutomationRule) =>
    api<AutomationRule>(base(campaignId, `/automation-rules/${encodeURIComponent(id)}`), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  remove: (campaignId: string, id: string) =>
    api<void>(base(campaignId, `/automation-rules/${encodeURIComponent(id)}`), {
      method: 'DELETE',
    }),
  run: (campaignId: string, id: string) =>
    api<void>(base(campaignId, `/automation-rules/${encodeURIComponent(id)}/run`), {
      method: 'POST',
    }),
};

const keys = {
  rules: (campaignId: string) => ['campaign', campaignId, 'automation-rules'] as const,
  runs: (campaignId: string) => ['campaign', campaignId, 'automation-runs'] as const,
};

/** Règles et journal, tenus à jour (une règle écrite ailleurs, une exécution du serveur). */
export function useRules(campaignId: string) {
  const qc = useQueryClient();
  useCampaignEvents(
    campaignId,
    ['automation_rule.*', 'automation.*', 'table_state.gm_updated'],
    () => {
      void qc.invalidateQueries({ queryKey: keys.rules(campaignId) });
      void qc.invalidateQueries({ queryKey: keys.runs(campaignId) });
    },
  );
  const rules = useQuery({
    queryKey: keys.rules(campaignId),
    queryFn: () => rulesApi.list(campaignId),
  });
  const runs = useQuery({
    queryKey: keys.runs(campaignId),
    queryFn: () => rulesApi.runs(campaignId),
  });
  return { rules, runs };
}

function onError(cle: 'saveFailed' | 'deleteFailed' | 'runFailed') {
  return (e: unknown) =>
    toast.error(translate(`table.automations.${cle}`), { description: messageErreur(e) });
}

export function useRuleMutations(campaignId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.rules(campaignId) });
    void qc.invalidateQueries({ queryKey: keys.runs(campaignId) });
  };
  return {
    save: useMutation({
      mutationFn: ({ id, body }: { id: string | null; body: CreateAutomationRule }) =>
        id ? rulesApi.update(campaignId, id, body) : rulesApi.create(campaignId, body),
      onSuccess: refresh,
      onError: onError('saveFailed'),
    }),
    toggle: useMutation({
      mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
        rulesApi.update(campaignId, id, { enabled }),
      onSuccess: refresh,
      onError: onError('saveFailed'),
    }),
    remove: useMutation({
      mutationFn: (id: string) => rulesApi.remove(campaignId, id),
      onSuccess: refresh,
      onError: onError('deleteFailed'),
    }),
    run: useMutation({
      mutationFn: (id: string) => rulesApi.run(campaignId, id),
      onSuccess: refresh,
      onError: onError('runFailed'),
    }),
  };
}
