/**
 * Routes des portails hors de la persistance commune (docs/api-map.md, Portails) : emprunter un
 * portail, poser ou retirer le retour d'un portail sur une autre scène, relire les portails de
 * la carte (après un lien, qui change les deux portails).
 */
import type { CreateMapPortal, MapPortal, MapPortalUseResult, UseMapPortal } from '@vtt/contracts';
import { api } from '@/lib/api';

export interface PortalApi {
  /** `POST …/portals/:id/use` : le serveur fait passer ces personnages (ou le groupe). */
  use(portalId: string, body: UseMapPortal): Promise<MapPortalUseResult>;
  /** Portail posé sur une autre scène (retour d'un aller-retour). */
  createOn(mapId: string, body: CreateMapPortal): Promise<MapPortal>;
  removeOn(mapId: string, portalId: string): Promise<void>;
  /** Portails de la carte ouverte, relus. */
  list(): Promise<MapPortal[]>;
}

export function createPortalApi(campaignId: string, mapId: string): PortalApi {
  const maps = `/v1/campaigns/${encodeURIComponent(campaignId)}/maps`;
  const portals = (id: string) => `${maps}/${encodeURIComponent(id)}/portals`;
  const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
  return {
    use: (portalId, body) =>
      api<MapPortalUseResult>(`${portals(mapId)}/${encodeURIComponent(portalId)}/use`, post(body)),
    createOn: (target, body) => api<MapPortal>(portals(target), post(body)),
    removeOn: (target, portalId) =>
      api<void>(`${portals(target)}/${encodeURIComponent(portalId)}`, { method: 'DELETE' }),
    list: async () => (await api<{ items: MapPortal[] }>(portals(mapId))).items,
  };
}
