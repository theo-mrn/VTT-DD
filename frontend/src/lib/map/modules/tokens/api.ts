/**
 * Routes des PNJ de la carte (docs/api-map.md, PNJ) : poser N instances en un appel, dupliquer
 * un PNJ posé, le supprimer avec son personnage. Les tokens eux-mêmes (déplacer, modifier,
 * retirer de la carte) passent par la persistance commune (`api.ts`, `tokenPersistence`).
 */
import type { CreateMapNpcs, DuplicateMapToken, MapNpcsCreated } from '@vtt/contracts';
import { api } from '@/lib/api';

export interface NpcApi {
  /** `POST …/npcs` : `count` vrais personnages, engagés et posés en une fois. */
  place(body: CreateMapNpcs): Promise<MapNpcsCreated>;
  /** `POST …/tokens/:tokenId/duplicate` : clone l'état actuel du PNJ. */
  duplicate(tokenId: string, body: DuplicateMapToken): Promise<MapNpcsCreated>;
  /** `DELETE …/tokens/:tokenId?character=delete` : le token et le personnage (PNJ seulement). */
  removeWithCharacter(tokenId: string): Promise<void>;
}

export function createNpcApi(campaignId: string, mapId: string): NpcApi {
  const base = `/v1/campaigns/${encodeURIComponent(campaignId)}/maps/${encodeURIComponent(mapId)}`;
  const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
  return {
    place: (body) => api<MapNpcsCreated>(`${base}/npcs`, json(body)),
    duplicate: (tokenId, body) =>
      api<MapNpcsCreated>(`${base}/tokens/${encodeURIComponent(tokenId)}/duplicate`, json(body)),
    removeWithCharacter: (tokenId) =>
      api<void>(`${base}/tokens/${encodeURIComponent(tokenId)}?character=delete`, {
        method: 'DELETE',
      }),
  };
}
