/**
 * Branchement du module zones sonores sur le moteur, sans React : sorte `sound-zone`, outil F,
 * inspecteur. L'interface est ajoutée par `index.ts` ; l'écoute, par `MapSounds`.
 */
import { translate } from '@/i18n/runtime';
import { Music } from 'lucide-react';
import type { ComponentType } from 'react';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { InspectorSectionProps, MapEngine } from '@/lib/map/engine/map-engine';
import { echoPersistence } from '@/lib/map/features/obstacles/engine/commands';
import { soundZoneKind, SoundZoneView, type SoundContext } from './kind';
import { SOUND_ZONE_KIND, SOUND_ZONES, SOUNDS_TOOL_ID } from './model';
import { SoundTool } from './tool';

export interface SoundUi {
  options?: ComponentType<{ engine: MapEngine }>;
  inspector?: ComponentType<InspectorSectionProps>;
}

const contexts = new WeakMap<MapEngine, SoundContext>();

/** Contexte du module pour ce moteur (interface, dépôt d'un son sur la carte). */
export const soundContextOf = (engine: MapEngine) => contexts.get(engine) ?? null;

export function registerSounds(engine: MapEngine, ui: SoundUi = {}): () => void {
  const ctx: SoundContext = {
    engine,
    persistence: engine.backend?.collection(SOUND_ZONES) ?? echoPersistence(),
  };
  contexts.set(engine, ctx);
  const view = new SoundZoneView(engine);
  const unregister = [
    engine.registerKind(soundZoneKind(ctx, view)),
    engine.registerTool({
      id: SOUNDS_TOOL_ID,
      label: translate('map.sounds.zones'),
      icon: Music,
      shortcut: { code: 'KeyF', label: 'F' },
      order: 73,
      available: isGm,
      create: () => new SoundTool(ctx, view),
      options: ui.options,
    }),
  ];
  if (ui.inspector)
    unregister.push(
      engine.registerInspectorSection({
        id: 'sound-zone',
        title: translate('map.sounds.zone'),
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.every((e) => e.kind.id === SOUND_ZONE_KIND),
        component: ui.inspector,
      }),
    );
  return () => {
    for (const u of unregister.toReversed()) u();
    view.dispose();
    contexts.delete(engine);
  };
}
