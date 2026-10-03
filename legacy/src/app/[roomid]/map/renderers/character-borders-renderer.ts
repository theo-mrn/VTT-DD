import { Point, Character, type LayerType } from '../types';
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
  /** IDs des personnages ciblés par l'attaque en cours du personnage actif (MJ only). */
  attackedTargetIds?: Set<string>;
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
    attackedTargetIds,
  } = state;

  const canvas = ctx.canvas;
  const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
  const scaledWidth = imgWidth * scale * zoom;
  const scaledHeight = imgHeight * scale * zoom;

  // Surlignage MJ des cibles attaquées : reste TOUJOURS visible pour le MJ, comme le
  // rayon de visibilité, indépendamment du toggle "Bordures" (raccourci J / showCharBorders).
  if (isMJ && attackedTargetIds && attackedTargetIds.size > 0 && isLayerVisible('characters')) {
    characters.forEach((char) => {
      if (!attackedTargetIds.has(char.id)) return;

      const x = (char.x / imgWidth) * scaledWidth - offset.x;
      const y = (char.y / imgHeight) * scaledHeight - offset.y;

      const isPlayerCharacter = char.type === 'joueurs';
      const charScale = char.scale || 1;
      const finalScale = charScale * globalTokenScale;
      const baseBorderRadius = (isPlayerCharacter ? 0.029 : 0.02) * imgWidth;
      const borderRadius = baseBorderRadius * finalScale * zoom * scale;
      const targetRadius = borderRadius * 1.06;

      ctx.save();
      ctx.strokeStyle = 'rgba(255, 140, 0, 0.95)';
      ctx.lineWidth = Math.max(2.5, borderRadius * 0.06);
      ctx.shadowColor = 'rgba(255, 140, 0, 0.9)';
      ctx.shadowBlur = borderRadius * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, targetRadius, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
    });
  }

  // Don't draw the rest (selection/badge/active-player borders) if disabled
  if (!showCharBorders) return;

  if (isLayerVisible('characters')) {
    characters.forEach((char, index) => {
      const x = (char.x / imgWidth) * scaledWidth - offset.x;
      const y = (char.y / imgHeight) * scaledHeight - offset.y;

      let isVisible = true;

      // isCharacterVisibleToUser calcule déjà tout : joueurs toujours visibles, alliés,
      // obstacles, lumières, brouillard, rayon de détection des cachés et simulation vue
      // joueur. On fait confiance à son verdict, sans re-check local par distance — l'ancien
      // re-calcul utilisait un rayon strict divergent du rayon de détection central
      // (cf visibility-checks.ts), donc un pion affiché pouvait perdre sa bordure/son badge.
      if (!isCharacterVisibleToUser(char)) {
        isVisible = false;
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

        // Base radius is a fraction of the image width (calibrated on a 3148px-wide reference image)
        // so border size stays visually consistent regardless of the source image resolution.
        const baseBorderRadius = (isPlayerCharacter ? 0.029 : 0.02) * imgWidth;
        const borderRadius = baseBorderRadius * finalScale * zoom * scale;

        //  FILTER VISIBILITY OF BORDER CIRCLES
        const isSelected = selectedCharacters.includes(index);
        const isAreaMatch = isSelectingArea && selectionStart && selectionEnd &&
          char.x >= Math.min(selectionStart.x, selectionEnd.x) &&
          char.x <= Math.max(selectionStart.x, selectionEnd.x) &&
          char.y >= Math.min(selectionStart.y, selectionEnd.y) &&
          char.y <= Math.max(selectionStart.y, selectionEnd.y);

        const isBadgeVisible = showAllBadges || visibleBadges.has(char.id);
        const isGMAndActivePlayer = isMJ && char.id === activePlayerId;

        const traceShape = () => {
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
        };

        // Only draw if selected, badge visible, or important GM info (active player)
        if (isSelected || isAreaMatch || isBadgeVisible || isGMAndActivePlayer) {
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = lineWidth;
          traceShape();
          ctx.stroke();
        }
      }
    });
  }
};
