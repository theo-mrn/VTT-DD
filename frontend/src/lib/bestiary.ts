/**
 * Bestiaire des ressources (docs/ressources.md) : le bestiaire de référence d'un système
 * (document statique copié par scripts/systemes.mjs) et les modèles de PNJ d'une campagne
 * (service character, réservés au MJ, docs/api-templates.md), tenus à jour par les
 * événements `npc_template.*`.
 */
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bestiary, EtatEntite } from '@vtt/rules';
import { api } from './api';
import { useCampaignEvents } from './realtime';

/** Bestiaire de référence d'un système ; null s'il n'en a pas. */
async function readSystemBestiary(systemId: string): Promise<Bestiary | null> {
  const res = await fetch(`/systemes/bestiaires/${encodeURIComponent(systemId)}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Bestiaire indisponible (${res.status})`);
  const r = Bestiary.safeParse(await res.json());
  if (!r.success) throw new Error('Bestiaire illisible');
  return r.data;
}

export function useSystemBestiary(systemId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ['systemes', systemId, 'bestiaire'],
    queryFn: () => readSystemBestiary(systemId!),
    enabled: Boolean(systemId) && enabled,
    staleTime: Infinity,
  });
}

// ─── Modèles de PNJ de la campagne ───────────────────────────────────────────

export interface NpcTemplateAction {
  name: string;
  description: string;
  toHit: number;
}

export interface NpcTemplate {
  id: string;
  categoryId: string | null;
  name: string;
  imageUrl: string | null;
  tokenUrl: string | null;
  actions: NpcTemplateAction[];
  /** Statistiques dans le système de la campagne ; null si l'état reçu est illisible. */
  etat: EtatEntite | null;
  updatedAt: string;
}

export interface NpcTemplateCategory {
  id: string;
  name: string;
  color: string | null;
}

interface NpcTemplateApi extends Omit<NpcTemplate, 'etat'> {
  etat: unknown;
}

export const npcTemplateKeys = {
  all: (campaignId: string) => ['npc-templates', campaignId] as const,
};

async function readNpcTemplates(
  campaignId: string,
): Promise<{ templates: NpcTemplate[]; categories: NpcTemplateCategory[] }> {
  const base = `/v1/campaigns/${encodeURIComponent(campaignId)}`;
  const [templates, categories] = await Promise.all([
    api<NpcTemplateApi[]>(`${base}/npc-templates`),
    api<NpcTemplateCategory[]>(`${base}/npc-template-categories`),
  ]);
  return {
    templates: templates.map((t) => {
      const etat = EtatEntite.safeParse(t.etat);
      return {
        id: t.id,
        categoryId: t.categoryId,
        name: t.name,
        imageUrl: t.imageUrl,
        tokenUrl: t.tokenUrl,
        actions: t.actions ?? [],
        etat: etat.success ? etat.data : null,
        updatedAt: t.updatedAt,
      };
    }),
    categories: categories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
  };
}

/**
 * Modèles de PNJ et leurs catégories (MJ de la campagne seulement : le service refuse les
 * autres). Relus quand un modèle ou une catégorie change ailleurs.
 */
export function useNpcTemplates(campaignId: string | null | undefined, enabled = true) {
  const client = useQueryClient();
  const actif = Boolean(campaignId) && enabled;
  useCampaignEvents(
    campaignId ?? null,
    ['npc_template.*'],
    () => void client.invalidateQueries({ queryKey: npcTemplateKeys.all(campaignId!) }),
    { enabled: actif },
  );
  return useQuery({
    queryKey: npcTemplateKeys.all(campaignId ?? ''),
    queryFn: () => readNpcTemplates(campaignId!),
    enabled: actif,
  });
}
