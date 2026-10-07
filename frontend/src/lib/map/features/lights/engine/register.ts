/**
 * Branchement du module lumières sur le moteur, sans React : sorte `light`, outil L, suivi des
 * tokens (torches). L'interface est ajoutée par `index.ts`.
 */
import { translate } from '@/i18n/runtime';
import { Lightbulb } from 'lucide-react';
import type { ComponentType } from 'react';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { InspectorSectionProps, MapEngine } from '@/lib/map/engine/map-engine';
import { echoPersistence } from '@/lib/map/features/obstacles/engine/commands';
import { carriedLightItems, followTokens, lightKind, LightView, type LightContext } from './kind';
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
      label: translate('map.lights.lights'),
      icon: Lightbulb,
      shortcut: { code: 'KeyL', label: 'L' },
      order: 72,
      available: isGm,
      create: () => new LightTool(ctx, view),
      options: ui.options,
    }),
    followTokens(engine),
    // Token qui porte une lumière : l'éteindre, la régler, la détacher ou la retirer
    engine.registerMenuProvider(({ entities, viewer }) => carriedLightItems(ctx, entities, viewer)),
  ];
  if (ui.inspector)
    unregister.push(
      engine.registerInspectorSection({
        id: 'light',
        title: translate('map.lights.light'),
        order: 10,
        appliesTo: (es, viewer) => isGm(viewer) && es.every((e) => e.kind.id === LIGHT_KIND),
        component: ui.inspector,
      }),
    );
  return () => {
    for (const u of unregister.toReversed()) u();
    view.dispose();
    contexts.delete(engine);
  };
}
