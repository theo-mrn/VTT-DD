/**
 * Branchement du module lumières sur le moteur, sans React : sorte `light`, outil L, suivi des
 * tokens (torches). L'interface est ajoutée par `index.ts`.
 */
import { Lightbulb } from 'lucide-react';
import type { ComponentType } from 'react';
import { isGm } from '../../engine/entities/entity-kind';
import type { InspectorSectionProps, MapEngine } from '../../engine/map-engine';
import { echoPersistence } from '../obstacles/commands';
import { followTokens, lightKind, LightView, type LightContext } from './kind';
import { LIGHT_KIND, LIGHTS, LIGHTS_TOOL_ID } from './model';
import { LightTool } from './tool';

export interface LightUi {
  options?: ComponentType<{ engine: MapEngine }>;
  inspector?: ComponentType<InspectorSectionProps>;
}

const contexts = new WeakMap<MapEngine, LightContext>();

/** Contexte du module pour ce moteur (interface). */
export const lightContextOf = (engine: MapEngine) => contexts.get(engine) ?? null;

export function registerLights(engine: MapEngine, ui: LightUi = {}): () => void {
  const ctx: LightContext = {
    engine,
    persistence: engine.backend?.collection(LIGHTS) ?? echoPersistence(),
  };
  contexts.set(engine, ctx);
  const view = new LightView(engine);
  const unregister = [
    engine.registerKind(lightKind(ctx, view)),
    engine.registerTool({
      id: LIGHTS_TOOL_ID,
      label: 'Lumières',
      icon: Lightbulb,
      shortcut: { code: 'KeyL', label: 'L' },
      order: 60,
      available: isGm,
      create: () => new LightTool(ctx, view),
      options: ui.options,
    }),
    followTokens(engine),
  ];
  if (ui.inspector)
    unregister.push(
      engine.registerInspectorSection({
        id: 'light',
        title: 'Lumière',
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.every((e) => e.kind.id === LIGHT_KIND),
        component: ui.inspector,
      }),
    );
  return () => {
    for (const u of unregister.reverse()) u();
    view.dispose();
    contexts.delete(engine);
  };
}
