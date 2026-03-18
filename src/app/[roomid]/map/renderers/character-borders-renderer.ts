import { Point, Character, type LayerType } from '../types';
import { calculateDistance } from '../shadows';
import { getMediaDimensions } from '../utils/coordinates';

export interface CharacterBorderRenderState {
  zoom: number;
  offset: Point;
  showCharBorders: boolean;
  characters: Character[];
  isMJ: boolean;
  playerViewMode: boolean;
  persoId: string | null;
  viewAsPersoId: string | null;
  activePlayerId: string | null;
  selectedCharacters: number[];
  isSelectingArea: boolean;
  selectionStart: Point | null;
  selectionEnd: Point | null;
  globalTokenScale: number;
  showAllBadges: boolean;
  visibleBadges: Set<string>;
  isLayerVisible: (layerId: LayerType) => boolean;
  isCharacterVisibleToUser: (char: Character) => boolean;
}

export const drawCharacterBorders = (
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  containerWidth: number,
  containerHeight: number,
  state: CharacterBorderRenderState
) => {
  const {
    zoom,
    offset,
    showCharBorders,
    characters,
    isMJ,
    playerViewMode,
    persoId,
    viewAsPersoId,
    activePlayerId,
    selectedCharacters,
    isSelectingArea,
    selectionStart,
    selectionEnd,
    globalTokenScale,
    showAllBadges,
    visibleBadges,
    isLayerVisible,
    isCharacterVisibleToUser,
  } = state;

  const canvas = ctx.canvas;
  const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Don't draw borders if disabled
  if (!showCharBorders) return;

  const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
  const scaledWidth = imgWidth * scale * zoom;
  const scaledHeight = imgHeight * scale * zoom;

  const effectiveIsMJ = isMJ && !playerViewMode;

  if (isLayerVisible('characters')) {
    characters.forEach((char, index) => {
      const x = (char.x / imgWidth) * scaledWidth - offset.x;
      const y = (char.y / imgHeight) * scaledHeight - offset.y;

      let isVisible = true;

      // Copy visibility logic from drawForegroundLayers
      let effectiveVisibility = char.visibility;

      if (!isCharacterVisibleToUser(char)) {
        effectiveVisibility = 'hidden';
      }

      if (char.visibility === 'ally') {
        isVisible = true;
      } else if (effectiveVisibility === 'hidden') {
        const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
        const isInPlayerViewMode = playerViewMode && viewAsPersoId;

        if (isInPlayerViewMode) {
          const viewer = characters.find(c => c.id === effectivePersoId);
          if (viewer) {
            const viewerScreenX = (viewer.x / imgWidth) * scaledWidth - offset.x;
            const viewerScreenY = (viewer.y / imgHeight) * scaledHeight - offset.y;
            const dist = calculateDistance(x, y, viewerScreenX, viewerScreenY);
            const radiusScreen = ((viewer.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
            isVisible = dist <= radiusScreen;
          } else {
            isVisible = false;
          }
        } else {
          isVisible = effectiveIsMJ || (() => {
            const viewer = characters.find(c => c.id === effectivePersoId);
            if (!viewer) return false;
            const viewerScreenX = (viewer.x / imgWidth) * scaledWidth - offset.x;
            const viewerScreenY = (viewer.y / imgHeight) * scaledHeight - offset.y;
            const dist = calculateDistance(x, y, viewerScreenX, viewerScreenY);
            const radiusScreen = ((viewer.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
            return dist <= radiusScreen;
          })();
        }
      }

      if (isVisible) {
        // Determine border color and width
        let borderColor;
        let lineWidth = 3;

        if (selectedCharacters.includes(index)) {
          borderColor = 'rgba(0, 255, 0, 1)';
          lineWidth = 4;
        } else if (isSelectingArea && selectionStart && selectionEnd) {
          const minX = Math.min(selectionStart.x, selectionEnd.x);
          const maxX = Math.max(selectionStart.x, selectionEnd.x);
          const minY = Math.min(selectionStart.y, selectionEnd.y);
          const maxY = Math.max(selectionStart.y, selectionEnd.y);

          if (char.x >= minX && char.x <= maxX && char.y >= minY && char.y <= maxY) {
            borderColor = 'rgba(0, 150, 255, 1)';
            lineWidth = 4;
          } else {
            if (isMJ) {
              borderColor = char.id === activePlayerId
                ? 'rgba(255, 0, 0, 1)'
                : char.visibility === 'ally'
                  ? 'rgba(0, 255, 0, 0.8)'
                  : char.type === 'joueurs'
                    ? 'rgba(0, 0, 255, 0.8)'
                    : 'rgba(255, 165, 0, 0.8)';
            } else {
              borderColor = char.id === persoId
                ? 'rgba(255, 0, 0, 1)'
                : char.visibility === 'ally'
                  ? 'rgba(0, 255, 0, 0.8)'
                  : char.type === 'joueurs'
                    ? 'rgba(0, 0, 255, 0.8)'
                    : 'rgba(255, 165, 0, 0.8)';
            }
          }
        } else {
          if (isMJ) {
            borderColor = char.id === activePlayerId
              ? 'rgba(255, 0, 0, 1)'
              : char.visibility === 'ally'
                ? 'rgba(0, 255, 0, 0.8)'
                : char.type === 'joueurs'
                  ? 'rgba(0, 0, 255, 0.8)'
                  : 'rgba(255, 165, 0, 0.8)';
          } else {
            borderColor = char.id === persoId
              ? 'rgba(255, 0, 0, 1)'
              : char.visibility === 'ally'
                ? 'rgba(0, 255, 0, 0.8)'
                : char.type === 'joueurs'
                  ? 'rgba(0, 0, 255, 0.8)'
                  : 'rgba(255, 165, 0, 0.8)';
          }
        }

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = lineWidth;

        const isPlayerCharacter = char.type === 'joueurs';
        const charScale = char.scale || 1;
        const finalScale = charScale * globalTokenScale;

        const baseBorderRadius = isPlayerCharacter ? 32 : 22;
        const borderRadius = baseBorderRadius * finalScale * zoom;

        //  FILTER VISIBILITY OF BORDER CIRCLES
        const isSelected = selectedCharacters.includes(index);
        const isAreaMatch = isSelectingArea && selectionStart && selectionEnd &&
          char.x >= Math.min(selectionStart.x, selectionEnd.x) &&
          char.x <= Math.max(selectionStart.x, selectionEnd.x) &&
          char.y >= Math.min(selectionStart.y, selectionEnd.y) &&
          char.y <= Math.max(selectionStart.y, selectionEnd.y);

        const isBadgeVisible = showAllBadges || visibleBadges.has(char.id);
        const isGMAndActivePlayer = isMJ && char.id === activePlayerId;

        // Only draw if selected, badge visible, or important GM info (active player)
        if (isSelected || isAreaMatch || isBadgeVisible || isGMAndActivePlayer) {
          // Draw character border circle or square
          ctx.beginPath();
          if (char.shape === 'square') {
            // Draw rounded square (matching rounded-lg ~ 0.5rem = 8px usually, but scaling with zoom)
            // rounded-lg is fixed in CSS, but for canvas we might want it proportional or fixed?
            // The CSS uses 'rounded-lg' which is 0.5rem (8px).
            // Let's use a small proportional radius for the square corners to look nice.
            const cornerRadius = borderRadius * 0.25; // Experimental value
            const size = borderRadius * 2;

            // Draw rounded rect
            ctx.roundRect(x - borderRadius, y - borderRadius, size, size, cornerRadius);
          } else {
            // Default Circle
            ctx.arc(x, y, borderRadius, 0, 2 * Math.PI);
          }
          ctx.stroke();
        }
      }
    });
  }
};
