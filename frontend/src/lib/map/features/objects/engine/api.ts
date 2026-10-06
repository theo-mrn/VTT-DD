/**
 * Client REST du module « objets » :
 * - modèles d'objets de la campagne (service character, MJ seul, docs/api-templates.md) ;
 * - fouille et prise d'un contenu (service campaign, docs/api-map.md, « Fouille des objets »).
 * Les types de la fouille viennent de `@vtt/contracts`.
 */
import type { MapObjectSearchResult, MapObjectTakeResult, TakeMapObjectItem } from '@vtt/contracts';
import { api } from '@/lib/api';

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const campaignUrl = (campaignId: string, path: string) =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}${path}`;

/** Modèle d'objet (décor à poser, sans règles de jeu). */
export interface ObjectTemplate {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  category: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const objectTemplatesApi = {
  list: (campaignId: string) => api<ObjectTemplate[]>(campaignUrl(campaignId, '/object-templates')),

  /** Nom de 100 caractères au plus, image http(s), catégorie de 50 caractères au plus. */
  create: (
    campaignId: string,
    body: { name: string; imageUrl?: string | null; category?: string | null },
  ) =>
    api<ObjectTemplate>(campaignUrl(campaignId, '/object-templates'), {
      method: 'POST',
      ...json(body),
    }),

  remove: (campaignId: string, templateId: string) =>
    api<void>(campaignUrl(campaignId, `/object-templates/${encodeURIComponent(templateId)}`), {
      method: 'DELETE',
    }),
};

/** Clés TanStack Query (sous la campagne, frontend-architecture § 4.1). */
export const objectTemplateKeys = {
  list: (campaignId: string) => ['campaign', campaignId, 'object-templates'] as const,
};

/** Fouille d'un objet de la carte ouverte. */
export interface SearchApi {
  search(objectId: string, characterId: string): Promise<MapObjectSearchResult>;
  take(objectId: string, body: TakeMapObjectItem): Promise<MapObjectTakeResult>;
}

export function createSearchApi(campaignId: string, mapId: string): SearchApi {
  const base = campaignUrl(campaignId, `/maps/${encodeURIComponent(mapId)}/objects`);
  return {
    search: (objectId, characterId) =>
      api<MapObjectSearchResult>(`${base}/${encodeURIComponent(objectId)}/search`, {
        method: 'POST',
        ...json({ characterId }),
      }),
    take: (objectId, body) =>
      api<MapObjectTakeResult>(`${base}/${encodeURIComponent(objectId)}/take`, {
        method: 'POST',
        ...json(body),
      }),
  };
}
