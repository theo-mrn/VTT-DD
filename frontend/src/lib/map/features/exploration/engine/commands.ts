/**
 * Gestes du MJ sur la mémoire de l'exploration, en commandes annulables (docs/carte.md § 7) :
 * révéler, oublier, réinitialiser. Optimistes (le masque change tout de suite), puis la réponse
 * du serveur remplace le masque.
 *
 * Annulation exacte : la fenêtre d'une commande ne garde que les cases que le geste change
 * vraiment (`effectiveWindow`) ; l'annuler fait l'opération inverse sur ces seules cases, sans
 * toucher à ce que le groupe a exploré entre-temps ailleurs.
 */
import {
  effectiveWindow,
  encodeWindow,
  ExplorationMask,
  fullWindow,
  type CellWindow,
} from '@vtt/vision';
import { translate } from '@/i18n/runtime';
import type { Command } from '@/lib/map/store/commands';
import type { ExplorationApi } from './api';
import type { ExplorationModel } from './model';

export type EditOp = 'reveal' | 'forget';

const inverseOf = (op: EditOp): EditOp => (op === 'reveal' ? 'forget' : 'reveal');

/** Révéler ou oublier ces cases (déjà réduites à celles que le geste change). */
export function editCommand(
  model: ExplorationModel,
  api: ExplorationApi,
  op: EditOp,
  win: CellWindow,
  grid: { cols: number; rows: number },
): Command {
  return {
    label: translate(`map.exploration.commands.${op}`),
    targets: () => [],
    apply: () => void model.editLocal(op, win),
    revert: () => void model.editLocal(inverseOf(op), win),
    send: async () => {
      const result = await api.edit({
        op,
        cols: grid.cols,
        rows: grid.rows,
        window: encodeWindow(win),
      });
      // Null : exploration coupée entre-temps (le mode de la scène suit par `map.updated`)
      if (result) model.load(result);
    },
    inverse: () => editCommand(model, api, inverseOf(op), win, grid),
  };
}

/**
 * Commande d'un geste du MJ sur une fenêtre de cases (forme dessinée) : null si elle ne change
 * rien (tout est déjà révélé, ou rien à oublier).
 */
export function shapeCommand(
  model: ExplorationModel,
  api: ExplorationApi,
  op: EditOp,
  win: CellWindow,
): Command | null {
  const mask = model.serverMask();
  if (!mask) return null;
  const effective = effectiveWindow(mask, win, op);
  return effective ? editCommand(model, api, op, effective, mask) : null;
}

/**
 * Réinitialiser : tout à zéro ; l'annuler révèle de nouveau l'ancien masque (refusé par le
 * serveur si la grille a changé entre-temps : 409, toast).
 */
export function resetCommand(model: ExplorationModel, api: ExplorationApi): Command | null {
  const before = model.serverMask();
  if (!before) return null;
  const empty = ExplorationMask.empty(before);
  return {
    label: translate('map.exploration.commands.reset'),
    targets: () => [],
    apply: () => model.replaceLocal(empty),
    revert: () => model.replaceLocal(before),
    send: async () => {
      const result = await api.edit({ op: 'reset' });
      if (result) model.load(result);
    },
    inverse: () => editCommand(model, api, 'reveal', fullWindow(before), before),
  };
}
