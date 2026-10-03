import { dndClassicModule } from '@/modules/builtin/dnd-classic';
import type { GameSystemDefinition, StatDefinition } from '@/modules/game-system/types';

const DEFAULT_GAME_SYSTEM_ID = 'dnd-classic';

// Registre isomorphe minimal des systèmes de jeu builtin (pas le moduleRegistry client complet,
// qui embarque des composants React) — utilisable côté Firebase Admin (bot Discord) sans risque
// d'importer accidentellement du code React dans le bundle serveur.
const BUILTIN_GAME_SYSTEMS: Record<string, GameSystemDefinition> = {
  [dndClassicModule.gameSystem.systemId]: dndClassicModule.gameSystem,
};

/**
 * Résout un GameSystemDefinition à partir d'un gameSystemId (fallback dnd-classic si inconnu/absent).
 * `override` : définition chargée séparément par l'appelant depuis Salle/{roomId}/gameSystemOverrides/{id}
 * (un système custom créé par le MJ, JSON pur, jamais un module en mémoire) — utilisée si aucun module
 * builtin/externe enregistré ne correspond à cet id.
 */
export function resolveGameSystemById(gameSystemId: string | null | undefined, override?: GameSystemDefinition | null): GameSystemDefinition {
  if (!gameSystemId) return BUILTIN_GAME_SYSTEMS[DEFAULT_GAME_SYSTEM_ID];
  return BUILTIN_GAME_SYSTEMS[gameSystemId] ?? override ?? BUILTIN_GAME_SYSTEMS[DEFAULT_GAME_SYSTEM_ID];
}

export interface RoomGameSystemDoc {
  gameSystemId?: string;
  customStats?: StatDefinition[];
}

/** Extrait { gameSystem, tableCustomStats } à partir des données brutes d'un doc Salle/{roomId}. */
export function resolveRoomGameSystem(
  roomData: RoomGameSystemDoc | undefined,
  override?: GameSystemDefinition | null,
): {
  gameSystem: GameSystemDefinition;
  tableCustomStats: StatDefinition[];
} {
  return {
    gameSystem: resolveGameSystemById(roomData?.gameSystemId, override),
    tableCustomStats: roomData?.customStats ?? [],
  };
}
