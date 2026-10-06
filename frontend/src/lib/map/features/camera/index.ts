/** Module « caméra » (docs/carte.md § 4) : « Recadrer la vue », la carte entière à l'écran. */
import { Focus } from 'lucide-react';
import type { MapModule } from '@/lib/map/engine/map-engine';

export const cameraModule: MapModule = {
  id: 'camera',
  register: (engine) => [
    engine.registerAction({
      id: 'camera.fit',
      label: 'Recadrer la vue',
      icon: Focus,
      run: (e) => e.fitView(),
      toolbar: { group: 'assist', order: 30 },
    }),
  ],
};
