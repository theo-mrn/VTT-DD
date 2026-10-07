/**
 * Zones de brouillard côté front (contrat `MapFogZone`) : types, brouillons, persistance.
 *
 * Une zone `fog` ajoute du brouillard, une zone `clear` en retire ; elles s'appliquent par
 * `order` croissant en partant de `maps.fogFull`. `order` et `createdBy` sont attribués par le
 * serveur : un brouillon porte des valeurs provisoires (en haut de la pile).
 */
import { translate } from '@/i18n/runtime';
import type { MapFogMode, MapFogZone } from '@vtt/contracts';
import type { Point } from '@/lib/map/engine/geometry';
import { tempId, type Persistence } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';

export type FogZoneData = MapFogZone & MapDto;
export type FogMode = MapFogMode;

export const FOG_ZONES = 'fogZones';
export const FOG_ZONE_KIND = 'fog-zone';
export const FOG_TOOL_ID = 'fog';

export const invertMode = (m: FogMode): FogMode => (m === 'fog' ? 'clear' : 'fog');

/** Action d'un mode (`map.fog.modes.<mode>`). */
export const fogModeLabel = (m: FogMode) => translate(`map.fog.modes.${m}`);

export type FogGeometry =
  | { shape: 'circle'; center: Point; radius: number }
  | { shape: 'rect' | 'polygon'; points: Point[] };

/** Ordre du prochain brouillon : au-dessus des zones connues. */
export function nextOrder(zones: Iterable<FogZoneData>): number {
  let max = 0;
  for (const z of zones) max = Math.max(max, z.order);
  return max + 1;
}

export function fogDraft(
  mapId: string,
  createdBy: string,
  order: number,
  mode: FogMode,
  g: FogGeometry,
): FogZoneData {
  const base = { id: tempId(), mapId, version: 0, updatedAt: '', mode, order, createdBy };
  return g.shape === 'circle'
    ? { ...base, shape: 'circle', points: [], center: g.center, radius: g.radius }
    : { ...base, shape: g.shape, points: g.points, center: null, radius: null };
}

/**
 * Champs d'une création selon la forme (le contrat est une union stricte : un cercle n'a pas de
 * `points`, un rectangle pas de `center`) ; `pick` retire les `undefined`.
 */
export function creationFields(d: MapDto): MapDto {
  return d.shape === 'circle'
    ? { ...d, points: undefined }
    : { ...d, center: undefined, radius: undefined };
}

/** Persistance des zones : la création n'envoie que les champs de sa forme. */
export function fogPersistence(base: Persistence<MapDto>): Persistence<MapDto> {
  const batch = base.batch;
  return {
    create: base.create ? (drafts) => base.create!(drafts.map(creationFields)) : undefined,
    update: (updates) => base.update(updates),
    remove: base.remove ? (items) => base.remove!(items) : undefined,
    batch: batch ? (w) => batch({ ...w, create: w.create.map(creationFields) }) : undefined,
  };
}
