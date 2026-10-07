/**
 * Branchement du module brouillard sur le moteur, sans React : sorte `fog-zone`, outil G,
 * « Tout couvrir » et « Tout découvrir ». L'interface est ajoutée par `index.ts`.
 */
import { translate } from '@/i18n/runtime';
import { CloudFog, Sun } from 'lucide-react';
import type { ComponentType } from 'react';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { InspectorSectionProps, MapEngine } from '@/lib/map/engine/map-engine';
import { deleteCommand, groupCommands, type Command } from '@/lib/map/store/commands';
import { echoPersistence } from '@/lib/map/features/obstacles/engine/commands';
import { fogZoneKind, FogView, type FogContext } from './kind';
import { FOG_TOOL_ID, FOG_ZONE_KIND, FOG_ZONES, fogPersistence, type FogZoneData } from './model';
import { FogTool } from './tool';

export interface FogUi {
  options?: ComponentType<{ engine: MapEngine }>;
  inspector?: ComponentType<InspectorSectionProps>;
}

const contexts = new WeakMap<MapEngine, FogContext>();

/** Contexte du module pour ce moteur (interface). */
export const fogContextOf = (engine: MapEngine) => contexts.get(engine) ?? null;

/**
 * « Tout couvrir » (`fogFull` vrai) ou « Tout découvrir » (faux) : la carte entière passe sous le
 * brouillard ou en sort, et les zones posées disparaissent. Une commande annulable (les zones
 * reviennent dans leur ordre).
 */
export function setFogFull(engine: MapEngine, full: boolean): Promise<boolean> | null {
  const ctx = contexts.get(engine);
  const scene = engine.store.getState().scene;
  if (!ctx || !scene) return null;
  const label = full ? translate('map.fog.coverAll') : translate('map.fog.clearAll');
  const zones = [
    ...(engine.store.getState().collections[FOG_ZONES]?.values() ?? []),
  ] as FogZoneData[];
  zones.sort((a, b) => a.order - b.order);
  const cmds: Command[] = [];
  if (scene.fogFull !== full) {
    const cmd = engine.sceneCommand(label, { fogFull: full });
    if (cmd) cmds.push(cmd);
  }
  if (zones.length)
    cmds.push(
      deleteCommand({ label, collection: FOG_ZONES, persistence: ctx.persistence, items: zones }),
    );
  if (!cmds.length) return null;
  return engine.execute(groupCommands(label, cmds));
}

export function registerFog(engine: MapEngine, ui: FogUi = {}): () => void {
  const ctx: FogContext = {
    engine,
    persistence: fogPersistence(engine.backend?.collection(FOG_ZONES) ?? echoPersistence()),
  };
  contexts.set(engine, ctx);
  const view = new FogView(engine);
  const unregister = [
    engine.registerKind(fogZoneKind(ctx, view)),
    engine.registerTool({
      id: FOG_TOOL_ID,
      label: translate('map.fog.fog'),
      icon: CloudFog,
      shortcut: { code: 'KeyG', label: 'G' },
      order: 71,
      available: isGm,
      create: () => new FogTool(ctx),
      options: ui.options,
    }),
    // Sans bouton : touches à choisir (docs/raccourcis.md § 6)
    engine.registerAction({
      id: 'fog.cover',
      label: translate('map.fog.coverAllWithFog'),
      icon: CloudFog,
      available: isGm,
      run: (e) => void setFogFull(e, true),
    }),
    engine.registerAction({
      id: 'fog.reveal',
      label: translate('map.fog.clearAll'),
      icon: Sun,
      available: isGm,
      run: (e) => void setFogFull(e, false),
    }),
  ];
  if (ui.inspector)
    unregister.push(
      engine.registerInspectorSection({
        id: 'fog-zone',
        title: translate('map.fog.fog'),
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.every((e) => e.kind.id === FOG_ZONE_KIND),
        component: ui.inspector,
      }),
    );
  return () => {
    for (const u of unregister.toReversed()) u();
    view.dispose();
    contexts.delete(engine);
  };
}
