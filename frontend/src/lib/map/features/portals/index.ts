/**
 * Module « portails » (docs/carte.md § 10, Portails) : téléportation sur la carte et changement
 * de scène, aller-retour relié, outil X, emprunt par les joueurs (proposition ou automatique) et
 * par le MJ (un token, la sélection, tout le groupe). La logique est dans `engine/register.ts` (testée
 * sans React) ; ici on y ajoute l'interface.
 */
import { PortalDestinationPanel } from './ui/destination-panel';
import { PortalToolIcon } from './ui/portal-glyph';
import { PortalInspector } from './ui/portal-inspector';
import { PortalOptions } from './ui/portal-options';
import { PortalsHost } from './ui/portals-host';
import { openScene } from '@/components/map/use-table-map';
import type { MapModule } from '@/lib/map/engine/map-engine';
import { registerPortals } from './engine/register';

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
