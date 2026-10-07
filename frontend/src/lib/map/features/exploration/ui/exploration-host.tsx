'use client';

/**
 * Présence de la mémoire de l'exploration à la table (surcouche sans rendu) : les événements
 * `map.exploration_updated` vont à la mémoire du moteur, qui les applique dans l'ordre des
 * versions (ou relit le masque). Le chargement de la carte, lui, passe par le magasin.
 */
import type { MapExplorationUpdatedPayload } from '@vtt/contracts';
import { useCampaignEvents } from '@/lib/realtime';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { explorationOf } from '../engine/model';

const EVENTS = ['map.exploration_updated'];

export function ExplorationHost({ engine }: Readonly<{ engine: MapEngine }>) {
  const campaignId = engine.store.getState().campaignId;
  useCampaignEvents(campaignId, EVENTS, (e) => {
    if (e.redacted) return;
    explorationOf(engine)?.applyUpdate(e.event.payload as unknown as MapExplorationUpdatedPayload);
  });
  return null;
}
