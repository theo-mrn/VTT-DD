/**
 * Module « groupe » (docs/carte.md § 10, Barre du groupe) : la barre du groupe, posée dans le
 * HUD gauche de la table (portail), avec la sortie vers le salon.
 */
import { PartyBarHost } from '@/components/map/party/party-bar';
import type { MapModule } from '../../engine/map-engine';

export const partyModule: MapModule = {
  id: 'party',
  register: (engine) => [
    engine.registerOverlay({ id: 'party.bar', slot: 'none', component: PartyBarHost }),
  ],
};
