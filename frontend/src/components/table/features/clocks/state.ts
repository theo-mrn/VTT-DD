/**
 * Horloges de progression (à la Blades in the Dark) : un cercle découpé en segments que le MJ
 * remplit à mesure qu'une menace ou un projet avance (« La garde arrive » 3/6). Visibles des
 * joueurs ou secrètes ; gardées par le service campaign (état de la table).
 */
import { createTableSlice } from '../shared/table-state';

export interface Clock {
  id: string;
  name: string;
  segments: number;
  filled: number;
  visible: boolean;
}

export const SEGMENTS = [4, 6, 8, 12] as const;
const MAX_CLOCKS = 20;

export function normalizeClocks(raw: unknown): Clock[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c) => {
      const segments =
        typeof c.segments === 'number' ? Math.max(2, Math.min(12, Math.round(c.segments))) : 6;
      const filled = typeof c.filled === 'number' ? Math.round(c.filled) : 0;
      return {
        id: typeof c.id === 'string' ? c.id : crypto.randomUUID(),
        name: typeof c.name === 'string' ? c.name.slice(0, 60) : '',
        segments,
        filled: Math.max(0, Math.min(segments, filled)),
        visible: c.visible !== false,
      };
    })
    .slice(0, MAX_CLOCKS);
}

/** Tranche de l'état de table (serveur) ; les joueurs ne reçoivent pas les horloges secrètes. */
export const clocks = createTableSlice<Clock[]>(
  (s) => s.clocks,
  (list) => ({ clocks: list ?? [] }),
);

const list = () => clocks.store.getState().value ?? [];

export const clockActions = {
  add(name: string, segments: number) {
    clocks.set(
      [...list(), { id: crypto.randomUUID(), name, segments, filled: 0, visible: true }].slice(
        0,
        MAX_CLOCKS,
      ),
    );
  },
  update(id: string, change: Partial<Omit<Clock, 'id'>>) {
    clocks.set(
      list().map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...change };
        return { ...next, filled: Math.max(0, Math.min(next.segments, next.filled)) };
      }),
    );
  },
  remove(id: string) {
    clocks.set(list().filter((c) => c.id !== id));
  },
};
