/**
 * Pause de table : le MJ fige la partie d'un clic (pause café, digression), un voile « Pause »
 * couvre l'écran de chacun ; reclic pour reprendre. Rien n'est enregistré.
 */
import { createGmSharedState } from '../shared/gm-state';

export interface TablePause {
  since: number;
}

export const tablePause = createGmSharedState<TablePause>('table.pause', {
  decode: (raw) => (raw && typeof raw === 'object' ? { since: Date.now() } : null),
});

export const togglePause = () =>
  tablePause.set(tablePause.store.getState().value ? null : { since: Date.now() });
