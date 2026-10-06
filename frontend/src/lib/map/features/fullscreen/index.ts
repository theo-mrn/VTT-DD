/** Fonction « plein écran » : bouton de la barre, enfoncé tant que la table est en plein écran. */
import { Maximize, Minimize } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { MapFeature } from '@/lib/map/engine/map-engine';
import {
  fullscreenSupported,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from './engine/fullscreen';

export const fullscreenFeature: MapFeature = {
  id: 'fullscreen',
  register: (engine) => [
    engine.registerAction({
      id: 'fullscreen.toggle',
      label: 'Plein écran',
      icon: Maximize,
      available: () => fullscreenSupported(),
      run: () => toggleFullscreen(),
      useStatus: () => {
        const on = useSyncExternalStore(onFullscreenChange, isFullscreen, () => false);
        return on ? { active: true, label: 'Quitter le plein écran', icon: Minimize } : {};
      },
      toolbar: { group: 'assist', order: 40 },
    }),
  ],
};
