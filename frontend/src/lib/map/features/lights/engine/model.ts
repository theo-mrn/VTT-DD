/**
 * Lumières côté front (contrat `MapLight`) : types, valeurs par défaut, palette (donnée), et la
 * position courante d'une lumière, partagée avec le module vision.
 *
 * Rayon en **unités** (cases) dans la donnée ; × `pixelsPerUnit` pour les pixels du monde.
 * Une lumière attachée à un token (`attachedTokenId`, torche) est là où est le token, y compris
 * pendant un glisser (aperçu local ou direct d'un autre) : sa `pos` n'est alors qu'un repli.
 */
import type { MapLight } from '@vtt/contracts';
import type { Point } from '@/lib/map/engine/geometry';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { tempId } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';

export type LightData = MapLight & MapDto;

export const LIGHTS = 'lights';
export const LIGHT_KIND = 'light';
export const LIGHTS_TOOL_ID = 'lights';
/** Sorte des tokens (module tokens) auxquels une lumière s'attache. */
export const TOKEN_KIND = 'token';

/** Palette proposée (donnée : elle part au serveur). */
export const LIGHT_COLORS: readonly { value: string; label: string }[] = [
  { value: '#ffb35c', label: 'Torche' },
  { value: '#ffd9a0', label: 'Bougie' },
  { value: '#fff4e0', label: 'Jour' },
  { value: '#8fb8ff', label: 'Lune' },
  { value: '#7cf0c8', label: 'Magie' },
  { value: '#ff6b5c', label: 'Braise' },
  { value: '#c69bff', label: 'Arcane' },
];

export interface LightDefaults {
  radius: number;
  color: string;
  intensity: number;
  falloff: number;
}

export const DEFAULT_LIGHT: LightDefaults = {
  radius: 6,
  color: LIGHT_COLORS[0]!.value,
  intensity: 0.8,
  falloff: 0.5,
};

/** Rayon permis, en unités : le curseur s'arrête à `slider`, la saisie directe va jusqu'à `max`. */
export const RADIUS_RANGE = { min: 0.5, max: 60, slider: 20, step: 0.5 };

export function lightDraft(
  mapId: string,
  pos: Point,
  d: LightDefaults,
  name = 'Lumière',
): LightData {
  return {
    id: tempId(),
    mapId,
    version: 0,
    updatedAt: '',
    name,
    pos: { x: pos.x, y: pos.y },
    radius: d.radius,
    visible: true,
    color: d.color,
    intensity: d.intensity,
    falloff: d.falloff,
    attachedTokenId: null,
  };
}

/**
 * Position courante d'une lumière : celle de son token s'il est attaché et connu (géométrie
 * affichée : aperçu d'un glisser et direct compris), sinon la sienne. Le module vision s'en sert
 * pour éclairer au bon endroit pendant un glisser, sans dupliquer cette règle.
 */
export function lightPosition(
  engine: MapEngine,
  light: Pick<MapLight, 'pos' | 'attachedTokenId'>,
): Point {
  if (light.attachedTokenId) {
    const token = engine.entity(light.attachedTokenId);
    if (token) return { x: token.current.x, y: token.current.y };
  }
  return light.pos;
}

/** Rayon d'une lumière en pixels du monde. */
export function lightRadiusPx(engine: MapEngine, light: Pick<MapLight, 'radius'>): number {
  return light.radius * engine.kindContext().pixelsPerUnit;
}

/** Nom d'un token pour les menus (nom de sa sorte, sinon « Token »). */
export function tokenName(engine: MapEngine, tokenId: string): string {
  const t = engine.entity(tokenId);
  if (!t) return 'Token absent';
  return t.kind.name?.(t.data, engine.kindContext()) ?? 'Token';
}
