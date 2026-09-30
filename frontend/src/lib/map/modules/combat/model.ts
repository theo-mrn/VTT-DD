/**
 * Combat sur la carte (docs/combat.md § 12.5), calculs purs partagés par le menu, l'outil de
 * visée, les anneaux et les tests : de quels personnages parlent les tokens, quelles cibles
 * montrer, quel est l'état des surcouches.
 *
 * Aucune fuite : un token masqué pour moi (vision, affichage) ne compte jamais, ni pour les
 * anneaux ni pour une zone ; ce que je vois de la carte est ce que le serveur m'a donné.
 */
import type { MapEntity } from '../../engine/entities/entity';
import type { MapEngine } from '../../engine/map-engine';
import { TOKEN_KIND_ID } from '../tokens/edit';
import type { TokenData } from '../tokens/model';

/** État des surcouches du combat pour ce moteur (alimenté par React, lu par le rendu). */
export interface CombatMapState {
  /** Participant dont c'est le tour (vu de moi), ou null. */
  turnCharacterId: string | null;
  /** Cibles des attaques ouvertes que je vois (MJ : toutes ; joueur : les siennes). */
  openTargetIds: readonly string[];
  /** Visées en direct des autres (MJ) : attaquant → cibles. */
  aims: readonly { attackerId: string; targetIds: readonly string[] }[];
}

export const EMPTY_COMBAT_MAP: CombatMapState = {
  turnCharacterId: null,
  openTargetIds: [],
  aims: [],
};

export const isToken = (e: MapEntity) => e.kind.id === TOKEN_KIND_ID;

/** Personnage d'un token (null : brouillon d'une pose, ou autre sorte). */
export function characterOf(e: MapEntity): string | null {
  if (!isToken(e)) return null;
  const d = e.data as TokenData;
  return d.draft || typeof d.characterId !== 'string' ? null : d.characterId;
}

/** Personnages de ces entités, sans doublon, dans l'ordre. */
export function charactersOf(entities: readonly MapEntity[]): string[] {
  return [...new Set(entities.map(characterOf).filter((id): id is string => !!id))];
}

/** Tokens de ces personnages que je vois (aucun masque : vision, affichage). */
export function visibleTokensOf(engine: MapEngine, characterIds: Iterable<string>): MapEntity[] {
  const wanted = new Set(characterIds);
  if (!wanted.size) return [];
  return engine.entitiesOfKind(TOKEN_KIND_ID).filter((e) => {
    const c = characterOf(e);
    return c !== null && wanted.has(c) && e.masks.size === 0;
  });
}

/** Cibles à entourer : celles des attaques ouvertes et celles que je vise en ce moment. */
export function ringTargets(
  state: CombatMapState,
  draftTargets: readonly string[],
): ReadonlySet<string> {
  return new Set([...state.openTargetIds, ...draftTargets]);
}

/** Traits de visée : ceux des autres (MJ), puis le mien pendant la composition. */
export function aimLines(
  state: CombatMapState,
  mine: { attackerId: string; targetIds: readonly string[] } | null,
): { attackerId: string; targetIds: readonly string[] }[] {
  const lines = state.aims.filter((a) => a.targetIds.length);
  return mine && mine.targetIds.length ? [...lines, mine] : lines;
}
