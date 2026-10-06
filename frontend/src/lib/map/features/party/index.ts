/**
 * Module « groupe » (docs/carte.md § 10, Barre du groupe) : la barre du groupe, posée dans le
 * HUD gauche de la table (portail), avec la sortie vers le salon.
 */
import { PartyBarHost } from './ui/party-bar';
import type { MapFeature } from '@/lib/map/engine/map-engine';

export const partyFeature: MapFeature = {
  id: 'party',
  register: (engine) => [
    engine.registerOverlay({ id: 'party.bar', slot: 'none', component: PartyBarHost }),
  ],
};
