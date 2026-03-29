import { type Point, type MapText, type SavedDrawing, type Portal, type LayerType } from '../types';
import { getMediaDimensions } from '../utils/coordinates';
import { renderDrawings } from '../drawings';

/**
 * State needed by drawBackgroundLayers, previously captured via closure in page.tsx.
 */
export interface BackgroundRenderState {
  zoom: number;
  offset: Point;
  showGrid: boolean;
  notes: MapText[];
  selectedNoteIndex: number | null;
  drawings: SavedDrawing[];
  selectedDrawingIndex: number | null;
  portals: Portal[];
  isMJ: boolean;
  selectedCityId: string | null;
  firstPortalPoint: Point | null;
  portalPlacementMode: string | null;
  isLayerVisible: (layerId: LayerType) => boolean;
  fontFamilyMap: Record<string, string>;
}

/**
 * Renders background layers on the map canvas: background image, grid, notes,
 * drawings, portal zones, and portal placement indicator.
 */
export function drawBackgroundLayers(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  containerWidth: number,
  containerHeight: number,
  state: BackgroundRenderState
): void {
  const {
    zoom,
    offset,
    showGrid,
    notes,
    selectedNoteIndex,
    drawings,
    selectedDrawingIndex,
    portals,
    isMJ,
    selectedCityId,
    firstPortalPoint,
    portalPlacementMode,
    isLayerVisible,
    fontFamilyMap,
  } = state;

  const canvas = ctx.canvas;
  const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);

  // Nettoyer le canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
  const scaledWidth = imgWidth * scale * zoom;
  const scaledHeight = imgHeight * scale * zoom;

  // Fonction de transformation des coordonnées map -> screen
  const transformPoint = (p: Point): Point => ({
    x: (p.x / imgWidth) * scaledWidth - offset.x,
    y: (p.y / imgHeight) * scaledHeight - offset.y,
  });

  // Draw background image
  if (isLayerVisible('background') && (image instanceof HTMLImageElement || image instanceof HTMLVideoElement || image instanceof HTMLCanvasElement)) {
    ctx.drawImage(image, -offset.x, -offset.y, scaledWidth, scaledHeight);
  }

  // Draw grid if enabled
  if (showGrid && isLayerVisible('grid')) {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    const gridSize = 50 * zoom;
    for (let x = -offset.x % gridSize; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = -offset.y % gridSize; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  // Draw each note
  if (isLayerVisible('notes')) {
    notes.forEach((note, index) => {
      const x = (note.x / imgWidth) * scaledWidth - offset.x;
      const y = (note.y / imgHeight) * scaledHeight - offset.y;
      ctx.fillStyle = note.color || 'yellow';

      // Utiliser la taille de police de la note ou une taille par défaut
      const fontSize = (note.fontSize || 16) * zoom;

      // Résoudre la police : CSS Var -> Nom réel -> Fallback
      const fontVar = note.fontFamily || 'var(--font-body)';
      const fontFamily = fontFamilyMap[fontVar] || 'Arial';

      ctx.font = `${fontSize}px ${fontFamily}`;

      // Gérer les sauts de ligne (\n ou <br>)
      const textLines = (note.text ?? '').replace(/<br\s*\/?>/gi, '\n').split('\n');
      const lineHeight = fontSize * 1.2; // Espacement entre les lignes

      // Afficher chaque ligne séparément
      textLines.forEach((line, lineIndex) => {
        const lineY = y + (lineIndex * lineHeight);
        ctx.fillText(line, x, lineY);
      });

      if (index === selectedNoteIndex) {
        ctx.strokeStyle = '#4285F4';
        ctx.lineWidth = 2;

        // Calculer les dimensions du rectangle de sélection en tenant compte de toutes les lignes
        let maxWidth = 0;
        textLines.forEach(line => {
          const metrics = ctx.measureText(line);
          if (metrics.width > maxWidth) maxWidth = metrics.width;
        });

        const padding = 4;
        const totalHeight = (textLines.length * lineHeight);
        ctx.strokeRect(x - padding, y - fontSize, maxWidth + (padding * 2), totalHeight + padding);
      }
    });
  }

  // Draw each saved drawing path
  if (isLayerVisible('drawings') && drawings && Array.isArray(drawings)) {
    renderDrawings(
      ctx,
      drawings,
      transformPoint,
      selectedDrawingIndex,
      imgWidth,
      imgHeight,
      zoom,
      offset,
      scaledWidth,
      scaledHeight
    );
  }

  // DRAW PORTAL ZONES (Visible to all - shows activation area)
  const effectivePortals = portals.filter(p => !p.cityId || p.cityId === selectedCityId);
  effectivePortals.forEach(portal => {
    // Show to MJ always, or show to players if visible flag is true
    if (!isMJ && !portal.visible) return;

    const center = transformPoint({ x: portal.x, y: portal.y });
    const screenRadius = (portal.radius || 50) * scale * zoom;

    // Safety check
    if (!isFinite(center.x) || !isFinite(center.y) || !isFinite(screenRadius)) return;

    const portalColor = portal.color || '#3b82f6';
    ctx.save();

    // Outer glow
    const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, screenRadius);
    gradient.addColorStop(0, `${portalColor}40`);
    gradient.addColorStop(0.7, `${portalColor}20`);
    gradient.addColorStop(1, `${portalColor}00`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center.x, center.y, screenRadius, 0, Math.PI * 2);
    ctx.fill();

    // Border (dashed for portals)
    ctx.strokeStyle = isMJ ? portalColor : `${portalColor}80`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, screenRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  });

  // DRAW FIRST PORTAL POINT INDICATOR (when placing same-map portal)
  if (firstPortalPoint && portalPlacementMode === 'same-map' && isMJ) {
    const center = transformPoint({ x: firstPortalPoint.x, y: firstPortalPoint.y });
    const radius = 30 * zoom;

    ctx.save();
    // Pulsing blue circle for entrance
    ctx.strokeStyle = '#3b82f6';
    ctx.fillStyle = '#3b82f680';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner marker
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.font = `${12 * zoom}px Arial`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Entrée', center.x, center.y + radius + 15);
    ctx.restore();
  }
}
