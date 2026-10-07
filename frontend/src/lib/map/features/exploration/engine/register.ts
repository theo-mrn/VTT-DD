/**
 * Branchement de la mémoire de l'exploration sur le moteur, sans React (docs/exploration.md
 * § 5) : la mémoire (`explorationOf`), les traînées des glisser, l'outil Exploration (MJ) et ses
 * actions. L'interface (barre de l'outil, écoute des événements) est ajoutée par `index.ts`.
 */
import { translate } from '@/i18n/runtime';
import { Footprints, RotateCcw, ToggleRight } from 'lucide-react';
import type { ComponentType } from 'react';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { createExplorationApi, type ExplorationApi } from './api';
import { resetCommand } from './commands';
import { attachExploration, type ExplorationModel } from './model';
import { ExplorationTool, EXPLORATION_TOOL_ID } from './tool';
import { TrailRecorder } from './trail';

export interface ExplorationUi {
  options?: ComponentType<{ engine: MapEngine }>;
  /** Client REST (défaut : celui de la carte ; tests : un faux). */
  api?: ExplorationApi | null;
}

export interface ExplorationModule {
  engine: MapEngine;
  model: ExplorationModel;
  api: ExplorationApi | null;
}

const modules = new WeakMap<MapEngine, ExplorationModule>();

/** Module de l'exploration de ce moteur (interface). */
export const explorationModuleOf = (engine: MapEngine) => modules.get(engine) ?? null;

/** Active ou coupe l'exploration de la scène : une commande annulable (`PATCH /maps/:mapId`). */
export function toggleExploration(engine: MapEngine, on?: boolean): Promise<boolean> | null {
  const scene = engine.store.getState().scene;
  if (!scene) return null;
  const next = on ?? scene.exploration !== 'party';
  if ((scene.exploration === 'party') === next) return null;
  const label = next
    ? translate('map.exploration.commands.enable')
    : translate('map.exploration.commands.disable');
  return engine.updateScene(label, { exploration: next ? 'party' : 'off' });
}

/** Réinitialise la mémoire du groupe, après confirmation ; une commande annulable. */
export async function resetExploration(engine: MapEngine): Promise<boolean> {
  const m = modules.get(engine);
  if (!m?.api || !m.model.active) return false;
  const ok = await engine.confirm({
    title: translate('map.exploration.resetConfirm.title'),
    message: translate('map.exploration.resetConfirm.message'),
    confirmLabel: translate('map.exploration.reset'),
    danger: true,
  });
  if (!ok) return false;
  const cmd = resetCommand(m.model, m.api);
  return cmd ? engine.execute(cmd) : false;
}

export function registerExploration(engine: MapEngine, ui: ExplorationUi = {}): () => void {
  const { campaignId, mapId } = engine.store.getState();
  // Sans serveur (carte en lecture seule, tests) : la mémoire se montre, rien ne s'écrit
  const api =
    ui.api !== undefined ? ui.api : engine.backend ? createExplorationApi(campaignId, mapId) : null;
  const attached = attachExploration(engine, api);
  const model = attached.model;
  modules.set(engine, { engine, model, api });
  const trails = new TrailRecorder(engine, model, api);
  let tool: ExplorationTool | null = null;
  const unregister = [
    engine.onFrame((now) => void trails.frame(now)),
    engine.onEntitiesMoved((moves, done) => trails.moved(moves, done, performance.now())),
    engine.registerTool({
      id: EXPLORATION_TOOL_ID,
      label: translate('map.tools.exploration'),
      icon: Footprints,
      order: 74,
      available: isGm,
      create: () => (tool = new ExplorationTool(model, api)),
      options: ui.options,
    }),
    // Sans bouton ni touche par défaut : à choisir dans l'éditeur des raccourcis
    engine.registerAction({
      id: 'exploration.toggle',
      label: translate('map.actions.explorationToggle'),
      icon: ToggleRight,
      available: isGm,
      run: (e) => void toggleExploration(e),
    }),
    engine.registerAction({
      id: 'exploration.reset',
      label: translate('map.actions.explorationReset'),
      icon: RotateCcw,
      available: isGm,
      run: (e) => void resetExploration(e),
    }),
  ];
  return () => {
    for (const u of unregister.toReversed()) u();
    tool?.destroy();
    attached.dispose();
    modules.delete(engine);
  };
}
