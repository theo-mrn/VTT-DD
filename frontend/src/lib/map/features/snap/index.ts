/** Module « aimantation » (docs/carte.md § 6) : le menu du pas d'aimantation des gestes. */
import { Magnet } from 'lucide-react';
import { useStore } from 'zustand';
import { SNAP_LABELS, SnapMenu } from './ui/snap-menu';
import type { MapFeature } from '@/lib/map/engine/map-engine';

export const snapFeature: MapFeature = {
  id: 'snap',
  register: (engine) => [
    engine.registerToolbarEntry({
      kind: 'menu',
      id: 'snap',
      group: 'assist',
      order: 10,
      label: 'Aimantation',
      icon: Magnet,
      available: (viewer) => viewer.role !== 'spectator',
      content: SnapMenu,
      useStatus: (e) => {
        const snap = useStore(e.ui, (s) => s.snap);
        return { active: snap !== 'off', label: `Aimantation : ${SNAP_LABELS[`${snap}`].label}` };
      },
    }),
  ],
};
