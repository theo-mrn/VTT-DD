/**
 * Données des obstacles et des pièces côté front : types du magasin (contrat `MapObstacle`,
 * `MapRoom`), libellés, valeurs par défaut et brouillons à créer. Aucune couleur d'interface
 * ici : la palette des murs est une donnée (le MJ la choisit, elle part au serveur).
 */
import type { MapBlocksFrom, MapObstacle, MapObstacleKind, MapRoom } from '@vtt/contracts';
import type { Point } from '@/lib/map/engine/geometry';
import { tempId } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';

export type ObstacleData = MapObstacle & MapDto;
export type RoomData = MapRoom & MapDto;
export type ObstacleKindId = MapObstacleKind;

/** Couches du magasin. */
export const OBSTACLES = 'obstacles';
export const ROOMS = 'rooms';

/** Sortes d'entités et outil. */
export const OBSTACLE_KIND = 'obstacle';
export const ROOM_KIND = 'room';
export const OBSTACLES_TOOL_ID = 'obstacles';

export const OBSTACLE_LABELS: Record<ObstacleKindId, string> = {
  wall: 'Mur',
  door: 'Porte',
  window: 'Fenêtre',
  one_way_wall: 'Mur à sens unique',
};

/** Palette proposée pour les murs (donnée : `null` = couleur par défaut du thème). */
export const WALL_COLORS: readonly { value: string; label: string }[] = [
  { value: '#e8e2d6', label: 'Ivoire' },
  { value: '#f2b84b', label: 'Ambre' },
  { value: '#e5484d', label: 'Rouge' },
  { value: '#46a758', label: 'Vert' },
  { value: '#3e8ed0', label: 'Bleu' },
  { value: '#8e4ec6', label: 'Violet' },
];

/** Propriétés d'un obstacle, hors géométrie. */
export interface ObstacleProps {
  kind: ObstacleKindId;
  blocksFrom: MapBlocksFrom | null;
  isOpen: boolean;
  isLocked: boolean;
  color: string | null;
  opacity: number;
  roomMode: MapObstacle['roomMode'];
}

export function defaultProps(kind: ObstacleKindId): ObstacleProps {
  return {
    kind,
    blocksFrom: kind === 'one_way_wall' ? 'left' : null,
    isOpen: false,
    isLocked: false,
    color: null,
    opacity: 1,
    roomMode: null,
  };
}

/** Propriétés d'un obstacle existant (pour en créer un morceau). */
export function propsOf(o: ObstacleData): ObstacleProps {
  return {
    kind: o.kind,
    blocksFrom: o.blocksFrom,
    isOpen: o.isOpen,
    isLocked: o.isLocked,
    color: o.color,
    opacity: o.opacity,
    roomMode: o.roomMode,
  };
}

/** Brouillon d'obstacle (identifiant provisoire, remplacé par celui du serveur). */
export function obstacleDraft(mapId: string, props: ObstacleProps, points: Point[]): ObstacleData {
  return {
    id: tempId(),
    mapId,
    version: 0,
    updatedAt: '',
    ...props,
    points,
  };
}

export function roomDraft(mapId: string, name: string, points: Point[]): RoomData {
  return { id: tempId(), mapId, version: 0, updatedAt: '', name, points };
}

export const isDoor = (o: { kind: ObstacleKindId }) => o.kind === 'door';

/** Nom d'une nouvelle pièce : « Pièce 3 ». */
export function nextRoomName(rooms: Iterable<RoomData>): string {
  let max = 0;
  for (const r of rooms) {
    const m = /^Pièce (\d+)$/.exec(r.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Pièce ${max + 1}`;
}
