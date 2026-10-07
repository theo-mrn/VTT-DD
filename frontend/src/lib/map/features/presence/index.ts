/** Module « présence » (docs/carte.md § 8) : « Montrer mon curseur » aux autres. */
import { translate } from '@/i18n/runtime';
import { MousePointerClick } from 'lucide-react';
import { useStore } from 'zustand';
import type { MapFeature } from '@/lib/map/engine/map-engine';

export const presenceFeature: MapFeature = {
  id: 'presence',
  register: (engine) => [
    engine.registerAction({
      id: 'presence.cursor',
      label: translate('map.actions.presenceCursor'),
      icon: MousePointerClick,
      available: (viewer) => viewer.role !== 'spectator',
      run: (e) => e.setShareCursor(!e.ui.getState().shareCursor),
      useStatus: (e) => {
        const on = useStore(e.ui, (s) => s.shareCursor);
        return { active: on, label: on ? translate('map.presence.hide') : undefined };
      },
      toolbar: { group: 'assist', order: 20 },
    }),
  ],
};
