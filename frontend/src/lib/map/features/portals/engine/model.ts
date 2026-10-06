/**
 * Portails côté front (contrat `MapPortal`, docs/carte.md § 10, Portails) : types, réglages par
 * défaut, palette (donnée), et les calculs purs partagés par la sorte, l'outil, l'emprunt et
 * les tests.
 *
 * - `pos` : centre ; `radius` : zone en pixels du monde (montrée en cases) ; un token est dans
 *   la zone si son centre est à `radius` au plus du centre (même règle que le serveur).
 * - Destination : `same_map` (arrivée `target` sur la carte) ou `scene_change` (`targetMapId`,
 *   arrivée `target` sur cette scène, nulle : son point d'arrivée des joueurs).
 * - Un joueur reçoit `target`, `targetMapId` et `linkedPortalId` nuls : il ne sait où mène un
 *   portail qu'en l'empruntant.
 */
import type { MapPortal, MapPortalIcon } from '@vtt/contracts';
import type { Point } from '@/lib/map/engine/geometry';
import { tempId } from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';

export type PortalData = MapPortal & MapDto;

export const PORTALS = 'portals';
export const PORTAL_KIND = 'portal';
export const PORTALS_TOOL_ID = 'portals';
/** Sorte des tokens (module tokens) qui empruntent les portails. */
export const TOKEN_KIND = 'token';

/** Icônes (glyphes : `glyphs.ts`), dans l'ordre du choix. */
export const PORTAL_ICONS: readonly { value: MapPortalIcon; label: string }[] = [
  { value: 'portal', label: 'Portail' },
  { value: 'stairs', label: 'Escalier' },
  { value: 'door', label: 'Porte' },
  { value: 'ladder', label: 'Échelle' },
];

/** Palette proposée (donnée : elle part au serveur), celle de l'ancienne app et quelques autres. */
export const PORTAL_COLORS: readonly { value: string; label: string }[] = [
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#10b981', label: 'Vert' },
  { value: '#f59e0b', label: 'Ambre' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#ec4899', label: 'Rose' },
  { value: '#e7e5e4', label: 'Pierre' },
];

/** Réglages des portails posés (barre de l'outil). Rayon en cases. */
export interface PortalDefaults {
  icon: MapPortalIcon;
  color: string;
  radius: number;
  /** Poser aussi le retour, relié (aller-retour). */
  twoWay: boolean;
  auto: boolean;
  visible: boolean;
}

export const DEFAULT_PORTAL: PortalDefaults = {
  icon: 'portal',
  color: PORTAL_COLORS[0]!.value,
  radius: 1,
  twoWay: true,
  auto: false,
  visible: true,
};

/** Rayon de la zone permis, en cases. */
export const RADIUS_RANGE = { min: 0.5, max: 10, step: 0.5 };

/** Tolérance de la zone, en pixels du monde (arrondis des positions), comme le serveur. */
const RANGE_EPSILON = 1e-6;

export const iconLabel = (icon: MapPortalIcon | null | undefined) =>
  PORTAL_ICONS.find((i) => i.value === icon)?.label ?? 'Portail';

/** Nom affiché : le sien, sinon celui de son icône (jamais celui de la scène visée). */
export const portalLabel = (p: Pick<MapPortal, 'name' | 'icon'>) =>
  p.name?.trim() || iconLabel(p.icon);

export const roundPoint = (p: Point): Point => ({
  x: Math.round(p.x * 100) / 100,
  y: Math.round(p.y * 100) / 100,
});

/** Destination d'un portail posé. */
export type PortalDestination =
  | { kind: 'same_map'; target: Point }
  | { kind: 'scene_change'; targetMapId: string; target: Point | null };

/** Brouillon d'un portail (identifiant provisoire), rayon en cases converti en pixels. */
export function portalDraft(
  mapId: string,
  pos: Point,
  d: PortalDefaults,
  pixelsPerUnit: number,
  destination: PortalDestination | null,
): PortalData {
  return {
    id: tempId(),
    mapId,
    version: 0,
    updatedAt: '',
    name: iconLabel(d.icon),
    pos: roundPoint(pos),
    radius: Math.round(d.radius * (pixelsPerUnit || 50) * 100) / 100,
    kind: destination?.kind ?? 'same_map',
    targetMapId: destination?.kind === 'scene_change' ? destination.targetMapId : null,
    target: destination?.target ? roundPoint(destination.target) : null,
    icon: d.icon,
    color: d.color,
    visible: d.visible,
    auto: d.auto,
    linkedPortalId: null,
  };
}

/** Le point (centre d'un token) est dans la zone du portail. */
export const insidePortal = (p: Pick<MapPortal, 'pos' | 'radius'>, point: Point) =>
  Math.hypot(point.x - p.pos.x, point.y - p.pos.y) <= p.radius + RANGE_EPSILON;

/**
 * Portail où l'on vient d'entrer : il contient l'arrivée et pas le départ ; le plus proche s'il
 * y en a plusieurs. Arriver dans un portail ne le déclenche pas (pas d'aller-retour sans fin) :
 * seul un lâcher qui y entre compte.
 */
export function enteredPortal<P extends Pick<MapPortal, 'pos' | 'radius'>>(
  portals: Iterable<P>,
  from: Point,
  to: Point,
): P | null {
  let best: P | null = null;
  let bestDistance = Infinity;
  for (const p of portals) {
    if (!insidePortal(p, to) || insidePortal(p, from)) continue;
    const d = Math.hypot(to.x - p.pos.x, to.y - p.pos.y);
    if (d < bestDistance) {
      best = p;
      bestDistance = d;
    }
  }
  return best;
}

/** Le portail mène quelque part (téléportation avec arrivée, ou scène visée). */
export const hasDestination = (p: Pick<MapPortal, 'kind' | 'target' | 'targetMapId'>) =>
  p.kind === 'same_map' ? !!p.target : !!p.targetMapId;

/** Rayon en cases (pas d'une demi-case, sauf `free`) depuis une distance en pixels du monde. */
export function radiusFromDistance(px: number, ppu: number, free: boolean): number {
  const raw = px / (ppu || 50);
  const v = free
    ? Math.round(raw * 100) / 100
    : Math.round(raw / RADIUS_RANGE.step) * RADIUS_RANGE.step;
  return Math.min(RADIUS_RANGE.max, Math.max(free ? 0.1 : RADIUS_RANGE.min, v));
}

/** Scène connue du module (liste de la campagne, donnée par React). */
export interface SceneRef {
  id: string;
  name: string;
  visibleToPlayers: boolean;
  groupId: string | null;
  spawn: Point | null;
  width: number | null;
  height: number | null;
  backgroundUrl: string | null;
}

/** Point d'arrivée d'une scène sans point choisi : son point d'arrivée, sinon son centre. */
export const sceneArrival = (s: Pick<SceneRef, 'spawn' | 'width' | 'height'>): Point =>
  s.spawn ?? { x: (s.width ?? 2048) / 2, y: (s.height ?? 2048) / 2 };
