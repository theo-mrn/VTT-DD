/**
 * Module « caméra » (docs/carte.md § 4) : « Recadrer la vue » (la carte entière à l'écran), et
 * zoomer ou dézoomer d'un cran au centre de la vue (+ et −).
 */
import { translate } from '@/i18n/runtime';
import { Focus, ZoomIn, ZoomOut } from 'lucide-react';
import type { MapEngine, MapFeature } from '@/lib/map/engine/map-engine';

/** Un cran de zoom au clavier (comme un cran de molette). */
export const ZOOM_STEP = 1.25;

/** Zoom au centre de la vue. */
export function zoomCenter(engine: MapEngine, factor: number) {
  const { width, height } = engine.camera.viewport;
  engine.camera.zoomAt({ x: width / 2, y: height / 2 }, factor);
  engine.cameraSettled();
}

export const cameraFeature: MapFeature = {
  id: 'camera',
  register: (engine) => [
    engine.registerAction({
      id: 'camera.fit',
      label: translate('map.actions.cameraFit'),
      icon: Focus,
      run: (e) => e.fitView(),
      toolbar: { group: 'assist', order: 30 },
    }),
    engine.registerAction({
      id: 'camera.zoom-in',
      label: translate('map.actions.cameraZoomIn'),
      icon: ZoomIn,
      shortcut: { code: 'Char:+', label: '+' },
      run: (e) => zoomCenter(e, ZOOM_STEP),
    }),
    engine.registerAction({
      id: 'camera.zoom-out',
      label: translate('map.actions.cameraZoomOut'),
      icon: ZoomOut,
      shortcut: { code: 'Char:-', label: '−' },
      run: (e) => zoomCenter(e, 1 / ZOOM_STEP),
    }),
  ],
};
