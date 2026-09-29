/**
 * Module « scène » du moteur (docs/carte.md § 10, Fond et scènes) : le point d'apparition.
 *
 * - Outil `spawn` (MJ, hors de la barre, lancé depuis le panneau Scènes) : un clic pose le
 *   point d'apparition de la carte (commande annulable, `PATCH /maps/:mapId`) ; Échap annule.
 * - Repère du point d'apparition dans le plan `gm`, pour le MJ seulement.
 */
import { MapPin } from 'lucide-react';
import type { Graphics } from 'pixi.js';
import { isGm } from '../../engine/entities/entity-kind';
import type { Point } from '../../engine/geometry';
import type { MapEngine, MapModule } from '../../engine/map-engine';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import { SELECT_TOOL_ID } from '../../engine/tools/tool-manager';

export const SPAWN_TOOL_ID = 'spawn';

/** Pose le point d'apparition (commande annulable). */
export function setSpawn(engine: MapEngine, p: Point | null) {
  return engine.updateScene('Point d’apparition', {
    spawn: p ? { x: Math.round(p.x), y: Math.round(p.y) } : null,
  });
}

/** Outil en un clic : `placing` jusqu'au clic, puis retour à la sélection. */
export class SpawnTool implements Tool {
  readonly id = SPAWN_TOOL_ID;
  state: 'idle' | 'placing' = 'idle';

  cursor() {
    return 'crosshair';
  }

  activate() {
    this.state = 'placing';
  }

  deactivate() {
    this.state = 'idle';
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0 || this.state !== 'placing') return false;
    void setSpawn(engine, e.world);
    engine.tools.activate(SELECT_TOOL_ID);
    return true;
  }
}

export const sceneModule: MapModule = {
  id: 'scene',
  register(engine) {
    const unregisterTool = engine.registerTool({
      id: SPAWN_TOOL_ID,
      label: 'Point d’apparition',
      icon: MapPin,
      hidden: true,
      available: isGm,
      create: () => new SpawnTool(),
    });

    // Repère du point d'apparition (MJ)
    const unmount = engine.whenMounted(() => {
      const pixi = engine.pixi;
      const plane = engine.plane('gm');
      const theme = engine.theme;
      if (!pixi || !plane || !theme || !isGm(engine.viewer)) return;
      const marker: Graphics = new pixi.Graphics({ label: 'spawn' });
      plane.addChild(marker);
      let drawnFor: unknown = undefined;
      let drawnZoom = 0;
      const draw = () => {
        const spawn = engine.store.getState().scene?.spawn as Point | null | undefined;
        const zoom = engine.camera.zoom;
        if (spawn === drawnFor && zoom === drawnZoom) return;
        drawnFor = spawn;
        drawnZoom = zoom;
        marker.clear();
        if (!spawn) return;
        const s = 1 / zoom;
        marker
          .circle(spawn.x, spawn.y, 14 * s)
          .fill({ color: theme.background, alpha: 0.45 })
          .circle(spawn.x, spawn.y, 10 * s)
          .stroke({ width: 2.5 * s, color: theme.primary, alpha: 0.95 })
          .circle(spawn.x, spawn.y, 3 * s)
          .fill({ color: theme.primary });
        engine.invalidate();
      };
      draw();
      const unsubscribe = engine.store.subscribe((s, prev) => {
        if (s.scene !== prev.scene) draw();
      });
      const unCamera = engine.camera.onChange(draw);
      return () => {
        unsubscribe();
        unCamera();
        marker.removeFromParent();
        marker.destroy();
      };
    });

    return () => {
      unmount();
      unregisterTool();
    };
  },
};
