/**
 * Bestiaire des ressources (docs/ressources.md) : le bestiaire de référence d'un système
 * (document statique copié par scripts/systemes.mjs) et les modèles de PNJ d'une campagne
 * (service character, réservés au MJ, docs/api-templates.md), tenus à jour par les
 * événements `npc_template.*`.
 */
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bestiary, EtatEntite, type Valeur } from '@vtt/rules';
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
    // Document de référence validé (~370 Ko) : gardé toute la session, jamais revalidé au remontage
    gcTime: Infinity,
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
  version: number;
  updatedAt: string;
}

export interface NpcTemplateCategory {
  id: string;
  name: string;
  color: string | null;
  version: number;
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
        version: t.version,
        updatedAt: t.updatedAt,
      };
    }),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      version: c.version,
    })),
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

// ─── Écritures (MJ) ──────────────────────────────────────────────────────────

/** Ce qu'on écrit d'un modèle de PNJ (docs/api-templates.md). */
export interface NpcTemplateWrite {
  name?: string;
  categoryId?: string | null;
  imageUrl?: string | null;
  tokenUrl?: string | null;
  /** Valeurs saisissables (création : sur l'état vide du type ; modification : sur l'état actuel). */
  valeurs?: Record<string, Valeur>;
  /** Création : système et type d'entité ; ou un état complet (copie d'un modèle). */
  systemeId?: string;
  type?: string;
  etat?: EtatEntite;
  /** Création depuis une créature du bestiaire du système (`systemeId`) : état, image, actions. */
  bestiary?: { key: string };
}

const templatesBase = (campaignId: string) => `/v1/campaigns/${encodeURIComponent(campaignId)}`;
const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const npcTemplatesApi = {
  create: (campaignId: string, body: NpcTemplateWrite & { name: string }) =>
    api<NpcTemplateApi>(`${templatesBase(campaignId)}/npc-templates`, send('POST', body)),
  update: (campaignId: string, id: string, version: number, body: NpcTemplateWrite) =>
    api<NpcTemplateApi>(
      `${templatesBase(campaignId)}/npc-templates/${encodeURIComponent(id)}`,
      send('PATCH', { version, ...body }),
    ),
  remove: (campaignId: string, id: string) =>
    api<void>(
      `${templatesBase(campaignId)}/npc-templates/${encodeURIComponent(id)}`,
      send('DELETE'),
    ),
  createCategory: (campaignId: string, name: string) =>
    api<NpcTemplateCategory>(
      `${templatesBase(campaignId)}/npc-template-categories`,
      send('POST', { name }),
    ),
  renameCategory: (campaignId: string, id: string, version: number, name: string) =>
    api<NpcTemplateCategory>(
      `${templatesBase(campaignId)}/npc-template-categories/${encodeURIComponent(id)}`,
      send('PATCH', { version, name }),
    ),
  removeCategory: (campaignId: string, id: string) =>
    api<void>(
      `${templatesBase(campaignId)}/npc-template-categories/${encodeURIComponent(id)}`,
      send('DELETE'),
    ),
};

/** Relit les modèles et catégories tout de suite (sans attendre l'événement). */
export function useRefreshNpcTemplates(campaignId: string) {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: npcTemplateKeys.all(campaignId) });
}
