/**
 * Pure utility functions to determine whether characters and objects
 * are visible to the current user.
 *
 * Extracted from page.tsx to keep the main component smaller and
 * to make these checks independently testable.
 */

import type { Character, LightSource, MapObject } from '../types';
import { type Obstacle, isPointInShadows } from '@/lib/visibility';
import { calculateDistance, isCellInFog } from '../shadows';
import { getMediaDimensions } from './coordinates';

// ─── Shared context that both functions may need ────────────────────────────

export interface VisibilityContext {
  /** Is the current user the GM? */
  isMJ: boolean;
  /** Is the GM currently viewing as a player? */
  playerViewMode: boolean;
  /** The character id of the current player (or null for GM without a character). */
  persoId: string | null;
  /** When in playerViewMode, the character id the GM is impersonating. */
  viewAsPersoId: string | null;
}

// ─── Extra context needed only for character visibility ─────────────────────

export interface CharacterVisibilityContext extends VisibilityContext {
  /** All obstacles on the current map. */
  obstacles: Obstacle[];
  /** The loaded background image/video (null if not loaded yet). */
  bgImage: HTMLImageElement | HTMLVideoElement | null;
  /** All characters currently on the map. */
  characters: Character[];
  /** All light sources on the map. */
  lights: LightSource[];
  /** Pixels-per-unit scaling factor (for converting light radius in meters to pixels). */
  pixelsPerUnit: number;
  /** Whether the entire map is covered in fog. */
  fullMapFog: boolean;
  /** Cell-based fog grid (cell key -> fogged). */
  fogGrid: Map<string, boolean>;
  /** Size of each fog cell in pixels. */
  fogCellSize: number;
  /** Current zoom level. */
  zoom: number;
  /** Current pan offset. */
  offset: { x: number; y: number };
  /**
   * Container dimensions (clientWidth / clientHeight).
   * Pass null when no container is mounted yet.
   */
  containerSize: { width: number; height: number } | null;
  /**
   * Canvas bounding-client rect (only the width/height matter).
   * Pass null when no canvas is mounted yet.
   */
  canvasRect: { width: number; height: number } | null;
}

// ─── isCharacterVisibleToUser ───────────────────────────────────────────────

/**
 * Determine whether a character should be visible to the current user.
 *
 * The logic accounts for:
 * - MJ always sees everything (unless in player-view mode)
 * - Invisible characters are hidden from everyone except the MJ
 * - Players and allies are always visible
 * - Custom visibility lists
 * - Shadow / obstacle occlusion
 * - Light sources illuminating a character
 * - Fog of war
 * - Vision radius of the player's own character and allied characters
 */
export function isCharacterVisibleToUser(
  char: Character,
  ctx: CharacterVisibilityContext,
): boolean {
  const {
    isMJ,
    playerViewMode,
    persoId,
    viewAsPersoId,
    obstacles,
    bgImage,
    characters,
    lights,
    pixelsPerUnit,
    fullMapFog,
    fogGrid,
    fogCellSize,
    zoom,
    offset,
    containerSize,
    canvasRect,
  } = ctx;

  // The GM in normal mode always sees everything.
  const effectiveIsMJ = isMJ && !playerViewMode;
  if (effectiveIsMJ) return true;

  // INVISIBLE: visible ONLY to the GM (not in player-view mode).
  // This check must come before anything else to guarantee total invisibility.
  if ((char.visibility as string) === 'invisible') {
    return false; // effectiveIsMJ is already false here
  }

  // Players and allies are always visible.
  if (char.type === 'joueurs' || char.visibility === 'ally') {
    return true;
  }

  // Custom mode: check if the current player is in the allowed list.
  if ((char.visibility as string) === 'custom') {
    const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
    if (!effectivePersoId) return false;
    return char.visibleToPlayerIds?.includes(effectivePersoId) ?? false;
  }

  // Shadow / obstacle occlusion check.
  if (obstacles.length > 0 && bgImage) {
    const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
    const viewer = characters.find(c => c.id === effectivePersoId);

    if (viewer && viewer.x !== undefined && viewer.y !== undefined) {
      const charPos = { x: char.x, y: char.y };
      const viewerPos = { x: viewer.x, y: viewer.y };
      const { width: bgW, height: bgH } = getMediaDimensions(bgImage);
      const mapBounds = { width: bgW, height: bgH };

      if (isPointInShadows(charPos, viewerPos, obstacles, mapBounds)) {
        return false; // Character is hidden behind an obstacle
      }
    }
  }

  // Light source check: if lit, visible even in fog.
  const isLit = lights.some((light) => {
    if (!light.visible) return false;
    if (light.x === undefined || light.y === undefined || !light.radius) return false;

    const distToLight = calculateDistance(char.x, char.y, light.x, light.y);
    const lightRadiusPixels = light.radius * pixelsPerUnit;
    return distToLight <= lightRadiusPixels;
  });

  if (isLit) {
    return true;
  }

  // Fog of war check.
  const isInFog = fullMapFog || isCellInFog(char.x, char.y, fogGrid, fogCellSize);

  // NPCs in fog become effectively hidden.
  let effectiveVisibility = char.visibility;
  if (isInFog) {
    effectiveVisibility = 'hidden';
  }

  // Hidden characters (or hidden by fog) are only visible within a
  // player's / ally's vision radius.
  if (effectiveVisibility === 'hidden') {
    if (!containerSize || !canvasRect || !bgImage) return false;

    const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImage);
    const scale = Math.min(containerSize.width / imgWidth, containerSize.height / imgHeight);
    const scaledWidth = imgWidth * scale * zoom;
    const scaledHeight = imgHeight * scale * zoom;

    const charScreenX = (char.x / imgWidth) * scaledWidth - offset.x;
    const charScreenY = (char.y / imgHeight) * scaledHeight - offset.y;

    // Check if within vision radius of the player's own character or an ally.
    return characters.some((player) => {
      const playerScreenX = (player.x / imgWidth) * scaledWidth - offset.x;
      const playerScreenY = (player.y / imgHeight) * scaledHeight - offset.y;
      return (
        (player.id === persoId || player.visibility === 'ally') &&
        calculateDistance(charScreenX, charScreenY, playerScreenX, playerScreenY) <=
          ((player.visibilityRadius ?? 100) / imgWidth) * scaledWidth
      );
    });
  }

  // Default: visible.
  return true;
}

// ─── isObjectVisibleToUser ──────────────────────────────────────────────────

/**
 * Determine whether a map object should be visible to the current user.
 *
 * The logic accounts for:
 * - MJ always sees everything (unless in player-view mode)
 * - Objects without explicit visibility are visible by default
 * - Hidden objects are invisible to non-MJ users
 * - Custom visibility lists
 */
export function isObjectVisibleToUser(
  obj: MapObject,
  ctx: VisibilityContext,
): boolean {
  const { isMJ, playerViewMode, persoId, viewAsPersoId } = ctx;

  // The GM in normal mode always sees everything.
  const effectiveIsMJ = isMJ && !playerViewMode;
  if (effectiveIsMJ) return true;

  // No visibility set or explicitly visible -> visible (backward compat).
  if (!obj.visibility || obj.visibility === 'visible') {
    return true;
  }

  // Hidden objects.
  if (obj.visibility === 'hidden') {
    return false;
  }

  // Custom mode: check if the current player is in the allowed list.
  if ((obj.visibility as string) === 'custom') {
    const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
    if (!effectivePersoId) return false;
    return obj.visibleToPlayerIds?.includes(effectivePersoId) ?? false;
  }

  // Default: visible.
  return true;
}
