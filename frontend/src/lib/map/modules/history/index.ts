/**
 * Module « historique » (docs/carte.md § 7) : Annuler et Refaire dans la barre. ⌘Z, ⌘⇧Z et ⌘Y
 * restent des gestes communs du contrôleur : ils marchent même sans ce module.
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import type { MapViewer } from '../../engine/entities/entity-kind';
import type { MapEngine, MapModule } from '../../engine/map-engine';
import { MOD } from '../../engine/toolbar';

const canEdit = (viewer: MapViewer) => viewer.role !== 'spectator';

/** Historique observé par le seul bouton : la barre ne se redessine pas à chaque geste. */
function useHistory(engine: MapEngine) {
  const { commands } = engine;
  return useSyncExternalStore(commands.subscribe, commands.getSnapshot, commands.getSnapshot);
}

export const historyModule: MapModule = {
  id: 'history',
  register: (engine) => [
    engine.registerAction({
      id: 'history.undo',
      label: 'Annuler',
      icon: Undo2,
      hint: `${MOD}Z`,
      available: canEdit,
      run: (e) => void e.commands.undo(),
      useStatus: (e) => {
        const h = useHistory(e);
        return {
          enabled: h.canUndo,
          label: h.undoLabel ? `Annuler « ${h.undoLabel} »` : undefined,
        };
      },
      toolbar: { group: 'history', order: 10 },
    }),
    engine.registerAction({
      id: 'history.redo',
      label: 'Refaire',
      icon: Redo2,
      hint: `${MOD}⇧Z`,
      available: canEdit,
      run: (e) => void e.commands.redo(),
      useStatus: (e) => {
        const h = useHistory(e);
        return {
          enabled: h.canRedo,
          label: h.redoLabel ? `Refaire « ${h.redoLabel} »` : undefined,
        };
      },
      toolbar: { group: 'history', order: 20 },
    }),
  ],
};
