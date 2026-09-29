/**
 * Module « portails » (docs/carte.md § 10, Portails) : téléportation sur la carte et changement
 * de scène, aller-retour relié, outil X, emprunt par les joueurs (proposition ou automatique) et
 * par le MJ (un token, la sélection, tout le groupe). La logique est dans `register.ts` (testée
 * sans React) ; ici on y ajoute l'interface.
 */
import { PortalDestinationPanel } from '@/components/map/portals/destination-panel';
import { PortalToolIcon } from '@/components/map/portals/portal-glyph';
import { PortalInspector } from '@/components/map/portals/portal-inspector';
import { PortalOptions } from '@/components/map/portals/portal-options';
import { PortalsHost } from '@/components/map/portals/portals-host';
import { openScene } from '@/components/map/use-table-map';
import type { MapModule } from '../../engine/map-engine';
import { registerPortals } from './register';

export const portalsModule: MapModule = {
  id: 'portals',
  register: (engine) =>
    registerPortals(engine, {
      icon: PortalToolIcon,
      options: PortalOptions,
      inspector: PortalInspector,
      destination: PortalDestinationPanel,
      host: PortalsHost,
      openScene,
    }),
};
