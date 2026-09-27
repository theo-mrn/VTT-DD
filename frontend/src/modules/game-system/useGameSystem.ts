'use client';

/**
 * Système de règles d'une campagne, sous la forme de l'ancienne app
 * (`GameSystemDefinition`), pour les composants repris de la carte.
 *
 * L'ancienne app lisait `Salle/{roomId}.gameSystemId` puis le système dans
 * Firestore. Le nouveau front décrit les systèmes autrement (`@vtt/rules`,
 * lib/systems.ts) et les stats d'un personnage vivent dans le service
 * character : la carte ne les affiche pas encore. Ce hook rend donc un système
 * sans stats ni entités de groupe (menus de la carte sans panneau de stats).
 */
import type { GameSystemDefinition, MapConfig, StatDefinition } from './types';

export interface UseGameSystemResult {
  gameSystem: GameSystemDefinition;
  tableCustomStats: StatDefinition[];
  isLoading: boolean;
  contentPath: string;
  updateMaps: (next: MapConfig[]) => Promise<void>;
}

const EMPTY_SYSTEM: GameSystemDefinition = {
  systemId: '',
  stats: [],
  groupEntityStats: [],
  skills: [],
};

const RESULT: UseGameSystemResult = {
  gameSystem: EMPTY_SYSTEM,
  tableCustomStats: [],
  isLoading: false,
  contentPath: '',
  updateMaps: async () => {},
};

export function useGameSystem(_roomId: string | null): UseGameSystemResult {
  return RESULT;
}
