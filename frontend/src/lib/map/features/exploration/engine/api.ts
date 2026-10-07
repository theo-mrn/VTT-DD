/**
 * Client REST de la mémoire de l'exploration (service campaign, docs/api-map.md, Exploration).
 * Les types viennent de `@vtt/contracts`.
 */
import type {
  EditMapExploration,
  MapExploration,
  MapExplorationEditResult,
  MapExplorationResponse,
  MapExplorationTrail,
  MapExplorationTrailResult,
} from '@vtt/contracts';
import { api } from '@/lib/api';

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export interface ExplorationApi {
  /** Masque de la scène (null : exploration coupée, ou rien encore). */
  get(): Promise<MapExploration | null>;
  /** Révéler, oublier, réinitialiser (MJ) : le masque à jour. */
  edit(body: EditMapExploration): Promise<MapExploration | null>;
  /** Traînées d'un glisser : la version du masque après elles. */
  trail(body: MapExplorationTrail): Promise<number | null>;
}

export function createExplorationApi(campaignId: string, mapId: string): ExplorationApi {
  const base = `/v1/campaigns/${encodeURIComponent(campaignId)}/maps/${encodeURIComponent(mapId)}/exploration`;
  return {
    get: async () => (await api<MapExplorationResponse>(base)).exploration,
    edit: async (body) =>
      (await api<MapExplorationEditResult>(base, { method: 'POST', ...json(body) })).exploration,
    trail: async (body) =>
      (await api<MapExplorationTrailResult>(`${base}/trail`, { method: 'POST', ...json(body) }))
        .version,
  };
}
