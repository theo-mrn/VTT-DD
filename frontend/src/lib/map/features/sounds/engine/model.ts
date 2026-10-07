/**
 * Zones sonores côté front (contrat `MapMusicZone`, docs/carte.md § 10, Zones sonores) : types,
 * valeurs par défaut, brouillon d'une zone posée et type du glisser-déposer d'un son.
 *
 * Rayon en **pixels du monde** dans la donnée (comme l'ancienne carte) ; l'interface l'affiche
 * en unités (÷ `pixelsPerUnit`).
 */
import { translate } from '@/i18n/runtime';
import type { MapMusicZone } from '@vtt/contracts';
import type { Point } from '@/lib/map/engine/geometry';
import { tempId } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';

export type SoundZoneData = MapMusicZone & MapDto;

/** Clé de la couche dans le magasin (`MAP_LAYERS['music-zones'].key`). */
export const SOUND_ZONES = 'musicZones';
export const SOUND_ZONE_KIND = 'sound-zone';
export const SOUNDS_TOOL_ID = 'sounds';
export const TOKEN_KIND = 'token';

/** Glisser-déposer d'un son de la bibliothèque sur la carte : `SoundDragData` en JSON. */
export const SOUND_DRAG_TYPE = 'application/x-vtt-sound';
export interface SoundDragData {
  assetId: string;
  name: string;
}

export interface SoundDefaults {
  /** Rayon en unités (cases). */
  radius: number;
  volume: number;
  assetId: string | null;
  name: string;
}

export const DEFAULT_SOUND: SoundDefaults = {
  radius: 6,
  volume: 0.5,
  assetId: null,
  name: '',
};

/** Rayon permis, en unités : le curseur s'arrête à `slider`, la saisie directe va jusqu'à `max`. */
export const RADIUS_RANGE = { min: 0.5, max: 60, slider: 20, step: 0.5 };

const round = (v: number) => Math.round(v * 100) / 100;

export function soundZoneDraft(
  mapId: string,
  pos: Point,
  o: { radiusPx: number; volume: number; assetId: string | null; name: string },
): SoundZoneData {
  return {
    id: tempId(),
    mapId,
    version: 0,
    updatedAt: '',
    name: o.name.trim().slice(0, 200) || translate('map.sounds.zone'),
    pos: { x: round(pos.x), y: round(pos.y) },
    radius: round(o.radiusPx),
    url: null,
    assetId: o.assetId,
    volume: o.volume,
    color: null,
    active: true,
  };
}

/** Un son de la bibliothèque peut-il être glissé sur la carte (pas YouTube, pas refusé) ? */
export const canDragSound = (a: { source: string; status: string; deleted?: boolean }) =>
  a.source !== 'youtube' && a.status !== 'rejected' && !a.deleted;

/** Début du glisser d'un son de la bibliothèque vers la carte. */
export function startSoundDrag(
  e: { dataTransfer: DataTransfer | null },
  a: { id: string; name: string },
) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(SOUND_DRAG_TYPE, JSON.stringify({ assetId: a.id, name: a.name }));
  e.dataTransfer.setData('text/plain', a.name);
  e.dataTransfer.effectAllowed = 'copy';
}

/** Données d'un glisser venu de la bibliothèque, ou null si ce n'en est pas un. */
export function readSoundDrag(raw: string): SoundDragData | null {
  try {
    const v = JSON.parse(raw) as Partial<SoundDragData>;
    return typeof v.assetId === 'string' && v.assetId
      ? { assetId: v.assetId, name: typeof v.name === 'string' ? v.name : '' }
      : null;
  } catch {
    return null;
  }
}

/** Fichier audio d'un dépôt (le premier), d'après son type ou son extension. */
export function audioFileOf(files: ArrayLike<File> | null | undefined): File | null {
  for (const f of Array.from(files ?? []))
    if (
      f.type.startsWith('audio/') ||
      /\.(mp3|m4a|mp4|aac|ogg|oga|opus|webm|wav|flac)$/i.test(f.name)
    )
      return f;
  return null;
}
