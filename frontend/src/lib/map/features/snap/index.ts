/** Module « aimantation » (docs/carte.md § 6) : le menu du pas d'aimantation des gestes. */
import { translate } from '@/i18n/runtime';
import { Magnet } from 'lucide-react';
import { useStore } from 'zustand';
import { snapLabel, SnapMenu } from './ui/snap-menu';
import type { MapFeature } from '@/lib/map/engine/map-engine';

export const snapFeature: MapFeature = {
  id: 'snap',
  register: (engine) => [
    engine.registerToolbarEntry({
      kind: 'menu',
      id: 'snap',
      group: 'assist',
      order: 10,
      label: translate('map.snap.title'),
      icon: Magnet,
      available: (viewer) => viewer.role !== 'spectator',
      content: SnapMenu,
      useStatus: (e) => {
        const snap = useStore(e.ui, (s) => s.snap);
        return {
          active: snap !== 'off',
          label: translate('map.snap.current', { label: snapLabel(snap).label }),
        };
      },
    }),
  ],
};
