/**
 * Pause de table : le MJ fige la partie d'un clic (pause café, digression), un voile « Pause »
 * couvre l'écran de chacun ; reclic pour reprendre. Gardée par le service campaign.
 */
import { createTableSlice } from '../shared/table-state';

export interface TablePause {
  paused: true;
}

export const tablePause = createTableSlice<TablePause>(
  (s) => (s.paused ? { paused: true } : null),
  (v) => ({ paused: v !== null }),
);

export const togglePause = () =>
  tablePause.set(tablePause.store.getState().value ? null : { paused: true });
