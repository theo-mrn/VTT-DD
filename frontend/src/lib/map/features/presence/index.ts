/** Module « présence » (docs/carte.md § 8) : « Montrer mon curseur » aux autres. */
import { MousePointerClick } from 'lucide-react';
import { useStore } from 'zustand';
import type { MapModule } from '@/lib/map/engine/map-engine';

export const presenceModule: MapModule = {
  id: 'presence',
  register: (engine) => [
    engine.registerAction({
      id: 'presence.cursor',
      label: 'Montrer mon curseur',
      icon: MousePointerClick,
      available: (viewer) => viewer.role !== 'spectator',
      run: (e) => e.setShareCursor(!e.ui.getState().shareCursor),
      useStatus: (e) => {
        const on = useStore(e.ui, (s) => s.shareCursor);
        return { active: on, label: on ? 'Cacher mon curseur' : undefined };
      },
      toolbar: { group: 'assist', order: 20 },
    }),
  ],
};
