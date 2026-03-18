import { type Point, type Character, type MusicZone, type Scene, type DrawingTool, type LayerType } from '../types';
import { getMediaDimensions } from '../utils/coordinates';
import { renderCurrentPath } from '../drawings';
import { renderFogLayer, calculateDistance, isCellInFog } from '../shadows';
import {
  drawShadows,
  drawObstacles,
  isPointInPolygon,
  type ShadowResult,
  type PolygonViewerInfo,
  type Obstacle,
  type EdgeMeta,
} from '@/lib/visibility';
import { calculateSplitPoints } from '@/lib/obstacle-utils';
import { CONDITIONS } from '@/components/(combat)/MJcombat';

/**
 * State needed by drawForegroundLayers, previously captured via closure in page.tsx.
 */
export interface ForegroundRenderState {
  // Camera/View
  zoom: number;
  offset: Point;

  // User Context
  isMJ: boolean;
  playerViewMode: boolean;
  persoId: string | null;
  viewAsPersoId: string | null;
  activePlayerId: string | null;
  allyViewId: string | null;
  selectedCityId: string | null;

  // Entity Data
  characters: Character[];
  obstacles: Obstacle[];
  effectiveMusicZones: MusicZone[];
  currentPath: Point[];

  // UI State - Drawing
  currentTool: DrawingTool;
  drawingColor: string;
  drawingSize: number;

  // UI State - Fog & Visibility
  fogMode: boolean;
  showFogGrid: boolean;
  visibilityMode: boolean;
  currentVisibilityTool: string;
  fullMapFog: boolean;
  fogGrid: Map<string, boolean>;
  fogCellSize: number;
  selectedFogCells: string[];
  shadowOpacity: number;

  // UI State - Music Zones
  selectedMusicZoneIds: string[];
  selectedCharacterIndex: number | null;
  audioCharacterId: string | null;

  // UI State - Obstacle Drawing
  isDrawingObstacle: boolean;
  currentObstaclePoints: Point[];
  pendingEdges: EdgeMeta[];
  isVisActive: boolean;
  snapPoint: Point | null;
  isDraggingObstaclePoint: boolean;
  dragFeaturePreview: {
    projected: Point;
    obstacle: Obstacle;
    segmentIndex: number;
    featureType: 'door' | 'one-way-wall' | 'window';
  } | null;
  selectedObstacleIds: string[];

  // UI State - Selection
  isSelectingArea: boolean;
  selectionStart: Point | null;
  selectionEnd: Point | null;
  selectedCharacters: number[];

  // UI State - Character Display
  globalTokenScale: number;
  showCharBorders: boolean;
  showAllBadges: boolean;
  visibleBadges: Set<string>;

  // UI State - Shadows
  precalculatedShadows: ShadowResult | null;

  // UI State - Scenes & Spawn
  currentScene: Scene | null;
  spawnPointMode: boolean;
  isDraggingSpawnPoint: boolean;

  // UI State - Measurement Units
  pixelsPerUnit: number;
  unitName: string;

  // Functions
  isLayerVisible: (layerId: LayerType) => boolean;
  isCharacterVisibleToUser: (char: Character) => boolean;
  calculateFogOpacity: (cellX: number, cellY: number) => number;
  getConditionIcon: (condId: string) => HTMLImageElement | null;

  // Refs
  iconHitRegionsRef: { current: Array<{ x: number; y: number; w: number; h: number; label: string }> };
  shadowTempCanvas: { current: HTMLCanvasElement | null };
  shadowExteriorCanvas: { current: HTMLCanvasElement | null };

  // Sub-renderer callback
  drawMeasurements: (ctx: CanvasRenderingContext2D, imgWidth: number, imgHeight: number, scaledWidth: number, scaledHeight: number) => void;
}

/**
 * Renders foreground layers on the map canvas: fog of war, shadows, obstacles,
 * music zones, spawn point, characters (badges, visibility, conditions), and measurements.
 */
export function drawForegroundLayers(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  containerWidth: number,
  containerHeight: number,
  state: ForegroundRenderState
): void {
  const {
    zoom,
    offset,
    isMJ,
    playerViewMode,
    persoId,
    viewAsPersoId,
    activePlayerId,
    allyViewId,
    selectedCityId,
    characters,
    obstacles,
    effectiveMusicZones,
    currentPath,
    currentTool,
    drawingColor,
    drawingSize,
    fogMode,
    showFogGrid,
    visibilityMode,
    currentVisibilityTool,
    fullMapFog,
    fogGrid,
    fogCellSize,
    selectedFogCells,
    shadowOpacity,
    selectedMusicZoneIds,
    selectedCharacterIndex,
    audioCharacterId,
    isDrawingObstacle,
    currentObstaclePoints,
    pendingEdges,
    isVisActive,
    snapPoint,
    isDraggingObstaclePoint,
    dragFeaturePreview,
    selectedObstacleIds,
    isSelectingArea,
    selectionStart,
    selectionEnd,
    selectedCharacters,
    globalTokenScale,
    showCharBorders,
    showAllBadges,
    visibleBadges,
    precalculatedShadows,
    currentScene,
    spawnPointMode,
    isDraggingSpawnPoint,
    pixelsPerUnit,
    unitName,
    isLayerVisible,
    isCharacterVisibleToUser,
    calculateFogOpacity,
    getConditionIcon,
    iconHitRegionsRef,
    shadowTempCanvas,
    shadowExteriorCanvas,
    drawMeasurements,
  } = state;

  const canvas = ctx.canvas;
  iconHitRegionsRef.current = [];
  const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
  const scaledWidth = imgWidth * scale * zoom;
  const scaledHeight = imgHeight * scale * zoom;

  const transformPoint = (p: Point): Point => ({
    x: (p.x / imgWidth) * scaledWidth - offset.x,
    y: (p.y / imgHeight) * scaledHeight - offset.y,
  });

  //  Optionnel : Dessiner les cercles de visibilite des joueurs et allies (pour debug)
  // En mode Vue Joueur, le MJ ne voit pas les cercles de debug
  if (isMJ && !playerViewMode && showFogGrid) {
    characters.forEach(character => {
      if ((character.type === 'joueurs' || character.visibility === 'ally') && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
        const playerScreenX = (character.x / imgWidth) * scaledWidth - offset.x;
        const playerScreenY = (character.y / imgHeight) * scaledHeight - offset.y;
        const radiusScreen = ((character.visibilityRadius ?? 100) / imgWidth) * scaledWidth;

        // Couleur differente pour les allies (vert) vs joueurs (jaune)
        ctx.strokeStyle = character.visibility === 'ally' ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 255, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(playerScreenX, playerScreenY, radiusScreen, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
  }

  // Draw current path if in drawing mode
  // Draw current path if in drawing mode
  if (currentPath.length > 0) {
    renderCurrentPath(
      ctx,
      currentPath,
      currentTool,
      drawingColor,
      drawingSize,
      zoom,
      transformPoint
    );
  }

  // RENDER DYNAMIC LIGHTING FOG OF WAR (with ray-casting)
  // On dessine le brouillard apres le fond et les dessins, mais avant les personnages

  // Determiner si on utilise la vision dynamique ou le brouillard classique
  const effectiveIsMJ = isMJ && !playerViewMode;

  // SHADOW CASTING pour les obstacles (fonctionne EN PLUS du brouillard)
  const hasObstacles = obstacles.length > 0;

  // D'abord dessiner le brouillard classique (si actif)
  if (isLayerVisible('fog')) {
    renderFogLayer(
      ctx,
      offset,
      scaledWidth,
      scaledHeight,
      imgWidth,
      imgHeight,
      canvas.width,
      canvas.height,
      fogCellSize,
      scale,
      zoom,
      fogMode,
      showFogGrid,
      visibilityMode,
      currentVisibilityTool,
      fullMapFog,
      fogGrid,
      calculateFogOpacity,
      selectedFogCells
    );
  }


  if (hasObstacles && !effectiveIsMJ && isLayerVisible('obstacles')) {
    // Trouver le personnage du joueur
    let viewerPosition: Point | null = null;

    // [NEW] Use simulated view ID if active (MJ viewing player OR player viewing ally)
    const effectivePersoId = (playerViewMode && viewAsPersoId)
      ? viewAsPersoId
      : (!isMJ && allyViewId)
        ? allyViewId
        : persoId;

    for (const character of characters) {
      if (character.id === effectivePersoId &&
        character.x !== undefined && character.y !== undefined) {
        viewerPosition = { x: character.x, y: character.y };
        break;
      }
    }

    if (viewerPosition) {
      const mapBounds = { width: imgWidth, height: imgHeight };

      // Dessiner les ombres avec l'opacite ajustable par le MJ
      drawShadows(
        ctx,
        viewerPosition,
        obstacles,
        mapBounds,
        shadowOpacity, // Opacite ajustable (10%, 50%, 100%, etc.)
        transformPoint,
        {
          precalculated: precalculatedShadows ?? undefined,
          tempCanvas: shadowTempCanvas.current ?? undefined,
          exteriorCanvas: shadowExteriorCanvas.current ?? undefined
        }
      );
    }
  }


  // DRAW MUSIC ZONES (Visible if music layer is ON OR if the specific zone belongs to the selected character)
  if (isMJ && !viewAsPersoId) {
    effectiveMusicZones.forEach(zone => {
      // Skip drawing the saved zone for this character if we are currently configuring it (avoid double draw)
      if (audioCharacterId && zone.id === `char-${audioCharacterId}`) return;

      const isMusicLayerOn = isLayerVisible('music');
      const isCharSelected = selectedCharacterIndex !== null && zone.id === `char-${characters[selectedCharacterIndex]?.id}`;

      // Only draw if layer is on OR this specific character is selected
      if (!isMusicLayerOn && !isCharSelected) return;

      const center = transformPoint({ x: zone.x, y: zone.y });
      const isSelected = selectedMusicZoneIds.includes(zone.id) || isCharSelected;
      // VISUALISATION RAYON (Gradient) (Toujours visible en mode musique, plus fort si selectionne)
      let screenRadius = (zone.radius || 0) * scale * zoom;

      // Safety Check: Ensure everything is finite before drawing
      if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(screenRadius) || screenRadius <= 0) {
        return;
      }

      const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, screenRadius);
      if (isSelected) {
        gradient.addColorStop(0, 'rgba(217, 70, 239, 0.4)'); // Centre fort
        gradient.addColorStop(0.5, 'rgba(217, 70, 239, 0.1)');
        gradient.addColorStop(1, 'rgba(217, 70, 239, 0)'); // Bord transparent
      } else {
        gradient.addColorStop(0, 'rgba(217, 70, 239, 0.15)'); // Centre faible
        gradient.addColorStop(0.5, 'rgba(217, 70, 239, 0.05)');
        gradient.addColorStop(1, 'rgba(217, 70, 239, 0)');
      }

      ctx.beginPath();
      ctx.arc(center.x, center.y, screenRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      // Bordure du rayon (Plus visible si selectionne)
      ctx.beginPath();
      ctx.arc(center.x, center.y, screenRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? 'rgba(217, 70, 239, 0.8)' : 'rgba(217, 70, 239, 0.3)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      //  RESIZE HANDLE (If Selected)
      if (isSelected) {
        const handleX = center.x + screenRadius;
        const handleY = center.y;
        const handleRadius = 6 * zoom; // Scales with interface zoom? Or keep constant size? Usually UI handles constant or slight scale.
        // Using zoom makes it easy to grab when zoomed in.

        ctx.beginPath();
        ctx.arc(handleX, handleY, handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(217, 70, 239, 1)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Music Note Icon - Fixed size like character tokens
      const baseSize = isSelected ? 20 : 16; // Fixed pixel size
      const noteSize = baseSize;
      const padding = 4;

      // Skip Icon and Text for Character Audio Zones (as requested)
      if (!zone.id.startsWith('char-')) {
        // Draw background circle for icon
        ctx.beginPath();
        ctx.arc(center.x, center.y, noteSize / 2 + padding, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? 'rgba(217, 70, 239, 1)' : 'rgba(217, 70, 239, 0.7)'; // Slightly more opaque
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Simple music note drawing or text
        ctx.fillStyle = '#fff';
        ctx.font = `${noteSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u266B', center.x, center.y + 1);

        // Draw label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = isSelected ? `bold ${12 * zoom}px sans-serif` : `${10 * zoom}px sans-serif`; // Scale font too!
        ctx.textAlign = 'center';

        // Background for label
        const textWidth = ctx.measureText(zone.name || '').width;
        const labelPadding = 4 * zoom;
        const labelHeight = (isSelected ? 16 : 14) * zoom;
        const labelY = center.y + (noteSize / 2) + padding + (4 * zoom);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.beginPath();
        ctx.roundRect(
          center.x - textWidth / 2 - labelPadding,
          labelY,
          textWidth + (labelPadding * 2),
          labelHeight,
          4 * zoom
        );
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'top';
        ctx.fillText(zone.name || '', center.x, labelY + (2 * zoom));
      }
    });
  }

  //  DRAW SPAWN POINT (Only visible to MJ)
  if (isMJ && currentScene && currentScene.spawnX !== undefined && currentScene.spawnY !== undefined) {
    const spawnPos = transformPoint({ x: currentScene.spawnX, y: currentScene.spawnY });
    const markerSize = 24 * zoom; // Fixed base size scaled by zoom

    // Draw marker icon (MapPin style)
    // Background circle
    ctx.beginPath();
    ctx.arc(spawnPos.x, spawnPos.y, markerSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = isDraggingSpawnPoint ? 'rgba(192, 160, 128, 0.9)' : 'rgba(192, 160, 128, 0.7)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pin icon (simplified)
    ctx.fillStyle = '#fff';
    ctx.font = `${markerSize * 0.7}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\uD83D\uDCCD', spawnPos.x, spawnPos.y);

    // Label
    if (!isDraggingSpawnPoint) {
      const labelText = 'Spawn';
      ctx.font = `bold ${11 * zoom}px sans-serif`;
      const textWidth = ctx.measureText(labelText).width;
      const labelPadding = 4 * zoom;
      const labelHeight = 16 * zoom;
      const labelY = spawnPos.y + markerSize / 2 + 6 * zoom;

      // Label background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.roundRect(
        spawnPos.x - textWidth / 2 - labelPadding,
        labelY,
        textWidth + (labelPadding * 2),
        labelHeight,
        4 * zoom
      );
      ctx.fill();

      // Label text
      ctx.fillStyle = '#c0a080';
      ctx.textBaseline = 'top';
      ctx.fillText(labelText, spawnPos.x, labelY + (2 * zoom));
    }

    // Pulsing ring effect when in spawn point mode
    if (spawnPointMode) {
      const time = Date.now() / 1000;
      const pulseRadius = markerSize / 2 + (Math.sin(time * 3) * 5 + 10) * zoom;
      ctx.beginPath();
      ctx.arc(spawnPos.x, spawnPos.y, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(192, 160, 128, ${0.3 + Math.sin(time * 3) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // DESSINER LES OBSTACLES (visible seulement pour le MJ en mode edition)
  if (isLayerVisible('obstacles') && (isVisActive || (effectiveIsMJ && obstacles.length > 0))) {
    // 1. Base Layer (Thick Black)
    drawObstacles(ctx, obstacles, transformPoint, {
      strokeColor: '#000000',
      fillColor: isVisActive ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)',
      strokeWidth: 10,
      showHandles: false,
      selectedIds: selectedObstacleIds,
    });

    // 2. Detail Layer (Inner Grey Line) - Makes it look like a constructed wall
    drawObstacles(ctx, obstacles, transformPoint, {
      strokeColor: '#555555',
      fillColor: 'transparent',
      strokeWidth: 4,
      showHandles: isVisActive || selectedObstacleIds.length > 0,
      selectedIds: selectedObstacleIds,
    });

    // Dessiner l'obstacle en cours de creation (outil unifie)
    if (isDrawingObstacle && currentObstaclePoints.length > 0) {
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);

      // Couleur par type d'arete
      const getEdgeColor = (edge?: EdgeMeta) => {
        if (!edge) return '#FFD700'; // default gold
        if (edge.type === 'one-way-wall') return 'rgba(255, 165, 0, 0.9)'; // orange
        if (edge.type === 'door') return 'rgba(0, 200, 0, 0.9)'; // vert
        return 'rgba(255, 100, 100, 0.9)'; // rouge pour mur
      };

      // Dessiner chaque arete avec sa couleur
      if (currentObstaclePoints.length >= 2) {
        for (let i = 0; i < currentObstaclePoints.length - 1; i++) {
          const p1 = transformPoint(currentObstaclePoints[i]);
          const p2 = transformPoint(currentObstaclePoints[i + 1]);
          ctx.beginPath();
          ctx.strokeStyle = getEdgeColor(pendingEdges[i]);
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }

        // Ligne de fermeture vers le premier point (semi-transparent) si >= 3 points
        if (currentObstaclePoints.length >= 3) {
          const lastPoint = transformPoint(currentObstaclePoints[currentObstaclePoints.length - 1]);
          const firstPoint = transformPoint(currentObstaclePoints[0]);
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
          ctx.moveTo(lastPoint.x, lastPoint.y);
          ctx.lineTo(firstPoint.x, firstPoint.y);
          ctx.stroke();
        }
      }

      // Indicateur de fermeture (cercle vert quand on est proche du premier point)
      if (currentObstaclePoints.length >= 3 && snapPoint) {
        const firstP = currentObstaclePoints[0];
        const dist = Math.sqrt(
          Math.pow(snapPoint.x - firstP.x, 2) + Math.pow(snapPoint.y - firstP.y, 2)
        );
        if (dist < 1) {
          const fp = transformPoint(firstP);
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.strokeStyle = '#00FF00';
          ctx.lineWidth = 3;
          ctx.arc(fp.x, fp.y, 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.fill();
        }
      }

      // Indicateur de fermeture implicite via mur partage existant
      if (currentObstaclePoints.length >= 2 && snapPoint) {
        const startPt = currentObstaclePoints[0];
        const endPt = snapPoint;
        const d = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        const hasSharedWall = obstacles.some(obs => {
          if (obs.points.length < 2) return false;
          if (obs.type !== 'wall' && obs.type !== 'door' && obs.type !== 'one-way-wall' && obs.type !== 'window') return false;
          const p1 = obs.points[0];
          const p2 = obs.points[obs.points.length - 1];
          return (d(p1, endPt) < 5 && d(p2, startPt) < 5) ||
            (d(p2, endPt) < 5 && d(p1, startPt) < 5);
        });
        if (hasSharedWall) {
          // Cercle vert sur le snap point pour indiquer la fermeture
          const sp = transformPoint(endPt);
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.strokeStyle = '#00FF00';
          ctx.lineWidth = 3;
          ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
          ctx.fill();
          // Ligne de fermeture en vert semi-transparent vers le start
          const fp = transformPoint(startPt);
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.moveTo(sp.x, sp.y);
          ctx.lineTo(fp.x, fp.y);
          ctx.stroke();
        }
      }

      ctx.setLineDash([]);

      // Dessiner les points (vertices)
      for (let i = 0; i < currentObstaclePoints.length; i++) {
        const point = currentObstaclePoints[i];
        const p = transformPoint(point);
        ctx.beginPath();
        ctx.fillStyle = i === 0 ? '#00FF00' : '#FFD700';
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Dessiner le point d'accroche (snap point) si detecte
    if (isVisActive && snapPoint && (currentVisibilityTool === 'chain' || (currentVisibilityTool === 'edit' && isDraggingObstaclePoint))) {
      const sp = transformPoint(snapPoint);
      ctx.beginPath();
      ctx.strokeStyle = '#00BFFF';
      ctx.lineWidth = 3;
      ctx.arc(sp.x, sp.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 191, 255, 0.4)';
      ctx.fill();

      // Cercle interne
      ctx.beginPath();
      ctx.fillStyle = '#00BFFF';
      ctx.arc(sp.x, sp.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Apercu drag & drop de porte/mur a sens unique sur un mur
    if (dragFeaturePreview) {
      const preview = dragFeaturePreview;
      const { obstacle: previewObs, segmentIndex: previewSegIdx, projected: previewProj } = preview;

      // Get the segment endpoints
      const segP1 = previewObs.points[0];
      const segP2 = previewObs.points[1];

      // Highlight the target segment
      const tp1 = transformPoint(segP1);
      const tp2 = transformPoint(segP2);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 100, 0.6)';
      ctx.lineWidth = 12;
      ctx.setLineDash([]);
      ctx.moveTo(tp1.x, tp1.y);
      ctx.lineTo(tp2.x, tp2.y);
      ctx.stroke();

      // Draw the split preview (C1-C2 zone)
      const { c1, c2 } = calculateSplitPoints(segP1, segP2, previewProj);
      const tc1 = transformPoint(c1);
      const tc2 = transformPoint(c2);
      ctx.beginPath();
      ctx.strokeStyle = preview.featureType === 'door' ? '#00FF88' : preview.featureType === 'window' ? '#66B4FF' : '#FF8800';
      ctx.lineWidth = 8;
      ctx.moveTo(tc1.x, tc1.y);
      ctx.lineTo(tc2.x, tc2.y);
      ctx.stroke();

      // Projected point indicator
      const pp = transformPoint(previewProj);
      ctx.beginPath();
      ctx.fillStyle = preview.featureType === 'door' ? '#00FF88' : preview.featureType === 'window' ? '#66B4FF' : '#FF8800';
      ctx.arc(pp.x, pp.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // DESSINER LES PORTES POUR TOUS (joueurs inclus)
  // Visibles si pas dans le brouillard et si ligne de vue directe non bloquee par un mur
  if (!effectiveIsMJ && obstacles.length > 0 && isLayerVisible('obstacles')) {
    const effectivePersoIdDoor = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
    const viewerForDoors = characters.find(c => c.id === effectivePersoIdDoor && c.x !== undefined && c.y !== undefined);

    // Raycasting : un mur opaque bloque-t-il la vue directe vers la porte ?
    const isDoorVisibleFromViewer = (door: Obstacle, vx: number, vy: number): boolean => {
      const mx = (door.points[0].x + door.points[1].x) / 2;
      const my = (door.points[0].y + door.points[1].y) / 2;
      for (const obs of obstacles) {
        if (obs.id === door.id) continue;
        if (obs.type === 'door' && obs.isOpen) continue;
        if (obs.type === 'window') continue;
        if (obs.type !== 'wall' && obs.type !== 'door' && obs.type !== 'one-way-wall') continue;
        if (obs.points.length < 2) continue;
        const cx = obs.points[0].x, cy = obs.points[0].y;
        const dx = obs.points[1].x, dy = obs.points[1].y;
        const denom = (mx - vx) * (dy - cy) - (my - vy) * (dx - cx);
        if (Math.abs(denom) < 1e-10) continue;
        const t = ((cx - vx) * (dy - cy) - (cy - vy) * (dx - cx)) / denom;
        const u = ((cx - vx) * (my - vy) - (cy - vy) * (mx - vx)) / denom;
        if (t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99) return false;
      }
      return true;
    };

    const doors = obstacles.filter(o => o.type === 'door');
    for (const door of doors) {
      if (door.points.length < 2) continue;

      const doorMid = {
        x: (door.points[0].x + door.points[1].x) / 2,
        y: (door.points[0].y + door.points[1].y) / 2,
      };

      // Verifier le brouillard
      if (fullMapFog || isCellInFog(doorMid.x, doorMid.y, fogGrid, fogCellSize)) continue;

      // Verifier la ligne de vue directe (raycasting simple)
      if (viewerForDoors && !isDoorVisibleFromViewer(door, viewerForDoors.x, viewerForDoors.y)) continue;
      const p1 = transformPoint(door.points[0]);
      const p2 = transformPoint(door.points[1]);

      // Trait epais pour la porte
      ctx.save();
      ctx.lineCap = 'round';

      // Couleur selon l'etat
      if (door.isOpen) {
        ctx.strokeStyle = 'rgba(0, 220, 0, 0.9)';
      } else if (door.isLocked) {
        ctx.strokeStyle = 'rgba(200, 160, 50, 0.9)';
      } else {
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
      }

      // Trait principal
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Bordure pour contraste
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 10;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // Icone au milieu
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const iconSize = 14;

      // Cercle de fond
      ctx.beginPath();
      if (door.isOpen) {
        ctx.fillStyle = 'rgba(0, 180, 0, 0.95)';
      } else if (door.isLocked) {
        ctx.fillStyle = 'rgba(180, 140, 40, 0.95)';
      } else {
        ctx.fillStyle = 'rgba(200, 40, 40, 0.95)';
      }
      ctx.arc(midX, midY, iconSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Symbole
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = '#fff';
      ctx.lineWidth = 2;
      if (door.isOpen) {
        // Arc pour porte ouverte
        ctx.beginPath();
        ctx.arc(midX, midY, iconSize * 0.5, -Math.PI / 4, Math.PI / 4);
        ctx.stroke();
      } else if (door.isLocked) {
        // Cadenas
        const lockW = iconSize * 0.6;
        const lockH = iconSize * 0.5;
        ctx.fillRect(midX - lockW / 2, midY - lockH / 2 + 1, lockW, lockH);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(midX, midY - lockH / 2 + 1, lockW * 0.35, Math.PI, 0);
        ctx.stroke();
      } else {
        // Ligne pour porte fermee (non verrouillee)
        ctx.beginPath();
        ctx.moveTo(midX, midY - iconSize * 0.5);
        ctx.lineTo(midX, midY + iconSize * 0.5);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  //  CALCUL DES OMBRES POUR MASQUER LES PNJs ET OBJETS (Cote Client seulement)
  // Si un PNJ ou objet est dans l'ombre du joueur (ou allie), il ne doit pas etre affiche
  let activeShadowsForFiltering: Point[][] | null = null;
  let polygonsContainingViewerForFiltering: PolygonViewerInfo[] = [];

  if (!effectiveIsMJ && obstacles.length > 0 && isLayerVisible('obstacles') && precalculatedShadows) {
    // OPTIMIZATION: Use precalculated shadows from useMemo!
    activeShadowsForFiltering = precalculatedShadows.shadows;
    polygonsContainingViewerForFiltering = precalculatedShadows.polygonsContainingViewer;
  }


  //  Dessiner la zone de selection en cours
  if (isSelectingArea && selectionStart && selectionEnd) {
    const startX = (selectionStart.x / imgWidth) * scaledWidth - offset.x;
    const startY = (selectionStart.y / imgHeight) * scaledHeight - offset.y;
    const endX = (selectionEnd.x / imgWidth) * scaledWidth - offset.x;
    const endY = (selectionEnd.y / imgHeight) * scaledHeight - offset.y;

    // Calculer les dimensions du rectangle
    const rectX = Math.min(startX, endX);
    const rectY = Math.min(startY, endY);
    const rectWidth = Math.abs(endX - startX);
    const rectHeight = Math.abs(endY - startY);

    // Fond semi-transparent d'abord
    ctx.fillStyle = 'rgba(0, 150, 255, 0.15)';
    ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

    // Bordure en pointilles plus visible
    ctx.strokeStyle = '#0096FF';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

    // Bordure solide interieure pour plus de contraste
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(rectX + 1, rectY + 1, rectWidth - 2, rectHeight - 2);

    // Afficher les dimensions de la zone (meme pour les selections fines car le texte est a l'exterieur)
    if (rectWidth > 5 || rectHeight > 5) {
      // Calculate dimensions in map units
      const mapRectWidth = Math.abs(selectionEnd.x - selectionStart.x);
      const mapRectHeight = Math.abs(selectionEnd.y - selectionStart.y);

      let widthText = `${Math.round(rectWidth)}`;
      let heightText = `${Math.round(rectHeight)}`;

      // Use units if available
      if (pixelsPerUnit > 0) {
        const wUnits = mapRectWidth / pixelsPerUnit;
        const hUnits = mapRectHeight / pixelsPerUnit;
        const unit = unitName || 'u';
        widthText = `${wUnits.toFixed(1)} ${unit}`;
        heightText = `${hUnits.toFixed(1)} ${unit}`;
      }

      const text = `${widthText} \u00D7 ${heightText}`;
      ctx.font = `12px Arial`;
      const metrics = ctx.measureText(text);

      // Position text above the rect, or below if too close to top
      const padding = 5;
      const textHeight = 20;
      let textX = rectX;
      let textY = rectY - textHeight - padding;

      // If too close to top edge, put it below
      if (textY < padding) {
        textY = rectY + rectHeight + padding;
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(textX, textY, metrics.width + 10, textHeight);
      ctx.fillStyle = 'white';
      // ctx.font is already set
      ctx.fillText(text, textX + 5, textY + 14);
    }
  }


  if (isLayerVisible('characters')) {
    characters.forEach((char, index) => {
      const x = (char.x / imgWidth) * scaledWidth - offset.x;
      const y = (char.y / imgHeight) * scaledHeight - offset.y;

      let isVisible = true;

      //  Verifier si le personnage est masque par une ombre (uniquement pour les joueurs)
      if ((activeShadowsForFiltering || polygonsContainingViewerForFiltering.length > 0) &&
        char.type !== 'joueurs' && char.visibility !== 'ally') {
        const charPos = { x: char.x, y: char.y };

        // Check shadow polygons (from walls and polygon interiors when outside)
        if (activeShadowsForFiltering) {
          for (const shadow of activeShadowsForFiltering) {
            if (isPointInPolygon(charPos, shadow)) {
              isVisible = false;
              break;
            }
          }
        }

        // Check if viewer is inside a polygon but character is outside (hide exterior)
        if (isVisible && polygonsContainingViewerForFiltering.length > 0) {
          for (const polyInfo of polygonsContainingViewerForFiltering) {
            if (!isPointInPolygon(charPos, polyInfo.points)) {
              // Le personnage est dehors, mais verifier s'il est visible via une arete transparente
              if (polyInfo.transparentEdgeIndices.length > 0) {
                let visibleThroughEdge = false;
                for (const edgeIdx of polyInfo.transparentEdgeIndices) {
                  const nextIdx = (edgeIdx + 1) % polyInfo.points.length;
                  const ep1 = polyInfo.points[edgeIdx];
                  const ep2 = polyInfo.points[nextIdx];
                  // Verifier si le personnage est dans le cone de vision
                  const viewerPos = precalculatedShadows ? { x: characters.find(c => c.type === 'joueurs')?.x || 0, y: characters.find(c => c.type === 'joueurs')?.y || 0 } : { x: 0, y: 0 };
                  const extDist = Math.max(imgWidth, imgHeight) * 2;
                  const d1 = { x: ep1.x - viewerPos.x, y: ep1.y - viewerPos.y };
                  const d2 = { x: ep2.x - viewerPos.x, y: ep2.y - viewerPos.y };
                  const l1 = Math.sqrt(d1.x * d1.x + d1.y * d1.y);
                  const l2 = Math.sqrt(d2.x * d2.x + d2.y * d2.y);
                  if (l1 > 0.001 && l2 > 0.001) {
                    const ext1 = { x: ep1.x + (d1.x / l1) * extDist, y: ep1.y + (d1.y / l1) * extDist };
                    const ext2 = { x: ep2.x + (d2.x / l2) * extDist, y: ep2.y + (d2.y / l2) * extDist };
                    if (isPointInPolygon(charPos, [ep1, ext1, ext2, ep2])) {
                      visibleThroughEdge = true;
                      break;
                    }
                  }
                }
                if (!visibleThroughEdge) {
                  isVisible = false;
                  break;
                }
              } else {
                isVisible = false;
                break;
              }
            }
          }
        }

        if (!isVisible) return; // Ne pas dessiner si dans l'ombre
      }

      //  Determiner la visibilite effective du personnage
      let effectiveVisibility = char.visibility;

      // Utiliser la fonction centralisee qui gere les lumieres, le brouillard, etc.
      if (!isCharacterVisibleToUser(char)) {
        effectiveVisibility = 'hidden';
      }

      // Les allies sont toujours visibles (meme dans le brouillard complet)
      if (char.visibility === 'ally') {
        isVisible = true;
      }
      // Les personnages caches (ou caches par le brouillard) ne sont visibles que pour le MJ (en mode normal) ou s'ils sont dans le rayon de vision d'un joueur ou allie
      else if (effectiveVisibility === 'hidden') {
        // [NEW] Use simulated view ID if active
        const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;

        // In player view simulation mode, GM should NOT see all hidden characters
        // They should only see those within the simulated character's visibility radius
        const isInPlayerViewMode = playerViewMode && viewAsPersoId;

        if (isInPlayerViewMode) {
          // GM simulating player view - use visibility radius check only
          const viewer = characters.find(c => c.id === effectivePersoId);
          if (viewer) {
            // Use screen coordinates for distance calculation (like line 1276)
            const viewerScreenX = (viewer.x / imgWidth) * scaledWidth - offset.x;
            const viewerScreenY = (viewer.y / imgHeight) * scaledHeight - offset.y;
            const dist = calculateDistance(x, y, viewerScreenX, viewerScreenY);
            const radiusScreen = ((viewer.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
            isVisible = dist <= radiusScreen;
          } else {
            isVisible = false;
          }
        } else {
          // Normal mode - MJ sees all, players check visibility radius
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
        //  Couleur speciale pour les personnages dans la zone de selection
        let borderColor;
        let lineWidth = 3;

        if (selectedCharacters.includes(index)) {
          // Personnage selectionne
          borderColor = 'rgba(0, 255, 0, 1)';  // Vert vif
          lineWidth = 4;
        } else if (isSelectingArea && selectionStart && selectionEnd) {
          // Verifier si le personnage est dans la zone de selection en cours
          const minX = Math.min(selectionStart.x, selectionEnd.x);
          const maxX = Math.max(selectionStart.x, selectionEnd.x);
          const minY = Math.min(selectionStart.y, selectionEnd.y);
          const maxY = Math.max(selectionStart.y, selectionEnd.y);

          if (char.x >= minX && char.x <= maxX && char.y >= minY && char.y <= maxY) {
            borderColor = 'rgba(0, 150, 255, 1)'; // Bleu pour previsualisation
            lineWidth = 4;
          } else {
            // Couleur normale selon le type
            if (isMJ) {
              // MJ : voit le personnage actif en rouge vif
              borderColor = char.id === activePlayerId
                ? 'rgba(255, 0, 0, 1)'             // Rouge vif pour le personnage actif (dont c'est le tour)
                : char.visibility === 'ally'
                  ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les allies
                  : char.type === 'joueurs'
                    ? 'rgba(0, 0, 255, 0.8)'           // Bleu pour les personnages joueurs
                    : 'rgba(255, 165, 0, 0.8)';        // Orange pour les PNJ
            } else {
              // Joueur : voit SEULEMENT son personnage en rouge
              borderColor = char.id === persoId
                ? 'rgba(255, 0, 0, 1)'             // Rouge vif pour SON personnage
                : char.visibility === 'ally'
                  ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les allies
                  : char.type === 'joueurs'
                    ? 'rgba(0, 0, 255, 0.8)'           // Bleu pour les autres personnages joueurs
                    : 'rgba(255, 165, 0, 0.8)';        // Orange pour les PNJ
            }
          }
        } else {
          // Couleur normale selon le type
          if (isMJ) {
            // MJ : voit le personnage actif en rouge vif
            borderColor = char.id === activePlayerId
              ? 'rgba(255, 0, 0, 1)'             // Rouge vif pour le personnage actif (dont c'est le tour)
              : char.visibility === 'ally'
                ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les allies
                : char.type === 'joueurs'
                  ? 'rgba(0, 0, 255, 0.8)'           // Bleu pour les personnages joueurs
                  : 'rgba(255, 165, 0, 0.8)';        // Orange pour les PNJ
          } else {
            // Joueur : voit SEULEMENT son personnage en rouge
            borderColor = char.id === persoId
              ? 'rgba(255, 0, 0, 1)'             // Rouge vif pour SON personnage
              : char.visibility === 'ally'
                ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les allies
                : char.type === 'joueurs'
                  ? 'rgba(0, 0, 255, 0.8)'           // Bleu pour les autres personnages joueurs
                  : 'rgba(255, 165, 0, 0.8)';        // Orange pour les PNJ
          }
        }

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = lineWidth;

        //  Taille differente pour les personnages joueurs (avec imageURLFinal)
        //  Taille differente pour les personnages joueurs (avec imageURLFinal)
        const isPlayerCharacter = char.type === 'joueurs';
        const charScale = char.scale || 1;
        const finalScale = charScale * globalTokenScale;

        const baseRadius = isPlayerCharacter ? 30 : 20;
        const baseBorderRadius = isPlayerCharacter ? 32 : 22;

        // const iconRadius = baseRadius * finalScale * zoom; // Not used locally?
        const borderRadius = baseBorderRadius * finalScale * zoom;

        // Border circle is now drawn on characterBordersCanvasRef (separate layer BEFORE character images)
        // This allows the circle to appear UNDERNEATH the character image

        // Note: Character image is now rendered as a DOM element (see characters-layer in JSX)
        // This allows animated GIFs to work properly
        // The canvas still renders other UI elements




        // Configuration
        const uiScale = Math.max(0.6, Math.min(1.5, zoom));
        const isSelected = index === selectedCharacterIndex;
        const canSeeHP = (isMJ && !playerViewMode) || char.id === persoId; // Visible MJ or Owner

        // Only render labels if showCharBorders is true
        //  DRAW NAME/HP BAR ONLY IF BADGE IS VISIBLE (global toggle OR individual selection)
        if (showAllBadges || visibleBadges.has(char.id)) {
          // --- DIMENSIONS & POSITIONS ---
          // On place la pilule en HAUT du cercle ("en dessus")
          // Centre de la pilule = x, y - borderRadius (moins une petite marge)
          const pillCenterX = x;
          const pillCenterY = y + borderRadius + (12 * uiScale); // En dessous du cercle (pillHeight/2 approx)

          const fontSize = 10 * uiScale;
          const iconSize = 10 * uiScale;
          const paddingX = 8 * uiScale;
          const paddingY = 4 * uiScale;
          const gap = 8 * uiScale; // Espace entre PV et Nom
          const condGap = 4 * uiScale; // Espace entre Nom et Conditions

          // Pre-calcul des tailles de texte
          ctx.font = `600 ${fontSize}px "Geist Mono", system-ui, sans-serif`;

          // Partie PV
          let pvText = "";
          let pvWidth = 0;
          if (canSeeHP && char.PV !== undefined) {
            const current = char.PV || 0;
            pvText = `${current}`;
            pvWidth = ctx.measureText(pvText).width + 4; // Text + Gap (no icon)
          }

          // Partie Nom
          const nameText = char.name;
          ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
          const nameWidth = ctx.measureText(nameText).width;

          // Partie Conditions
          let condWidth = 0;
          const activeConditions = char.conditions || [];
          if (activeConditions.length > 0) {
            // width = (num * actualImgSize) + ((num-1) * spacing) + margin-left
            // Actual Img Size used in draw is iconSize + (4 * uiScale)
            const actualImgSize = iconSize + (4 * uiScale);
            condWidth = (activeConditions.length * actualImgSize) + ((activeConditions.length - 1) * 2 * uiScale) + condGap;
          }

          // Largeur totale
          const separatorWidth = canSeeHP ? (1 * uiScale) + (gap * 2) : 0;
          const totalContentWidth = (canSeeHP ? pvWidth : 0) + separatorWidth + nameWidth + condWidth;
          const pillWidth = totalContentWidth + (paddingX * 2);
          const pillHeight = fontSize + (paddingY * 2) + 2;

          // --- DESSIN DU FOND (PILL) ---
          const pillX = pillCenterX - (pillWidth / 2);
          const pillY = pillCenterY - (pillHeight / 2);

          // Ombre portee
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 3;

          // Fond (Gris fonce/Noir style "Interface")
          ctx.fillStyle = 'rgba(20, 22, 26, 0.95)';
          ctx.beginPath();
          ctx.roundRect(pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
          ctx.fill();

          // Reset shadow
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;

          // Bordure subtile
          ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // --- DESSIN DU CONTENU ---
          let currentCursorX = pillX + paddingX;
          const textY = pillY + (pillHeight / 2); // Center vertical

          // 1. PV SECTION (Si visible)
          if (canSeeHP) {
            const current = char.PV || 0;
            const max = char.PV_Max || char.PV || 100;
            const healthPct = Math.max(0, Math.min(100, (current / max) * 100));

            let healthColor = '#ffffff';
            if (healthPct < 25) healthColor = '#ef4444';
            else if (healthPct < 50) healthColor = '#fbbf24';
            else healthColor = '#4ade80';

            ctx.fillStyle = healthColor;
            ctx.font = `700 ${fontSize}px "Geist Mono", monospace`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(pvText, currentCursorX, textY + 1);

            currentCursorX += pvWidth;

            // Separateur
            const sepX = currentCursorX + gap;
            ctx.beginPath();
            ctx.moveTo(sepX, pillY + 4);
            ctx.lineTo(sepX, pillY + pillHeight - 4);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();

            currentCursorX += separatorWidth;
          }

          // 2. NOM SECTION
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(nameText, currentCursorX, textY + 0.5);

          currentCursorX += nameWidth;

          // 3. CONDITIONS SECTION
          if (activeConditions.length > 0) {
            currentCursorX += condGap;

            activeConditions.forEach((condId: string) => {
              const iconImg = getConditionIcon(condId);

              if (iconImg) {
                // Draw pre-rendered SVG Icon
                const imgSize = iconSize + (4 * uiScale);
                const imgY = textY - (imgSize / 2);

                ctx.drawImage(iconImg, currentCursorX, imgY, imgSize, imgSize);

                // Add Hit Region (World Coordinates)
                // We try to resolve a label: Predefined or Custom
                const predefined = CONDITIONS.find(c => c.id === condId);
                const label = predefined ? predefined.label : condId;

                iconHitRegionsRef.current.push({
                  x: currentCursorX,
                  y: imgY,
                  w: imgSize,
                  h: imgSize,
                  label: label
                });

                currentCursorX += imgSize + (2 * uiScale);
              } else {
                // Loading placeholder
                ctx.beginPath();
                ctx.arc(currentCursorX + (iconSize / 2), textY, 2 * uiScale, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fill();
                currentCursorX += iconSize + (2 * uiScale);
              }
            });
          }
        }
      }

      // Draw hidden status badge if character is hidden (soit par defaut, soit par le brouillard) - uniquement en mode MJ normal, pas en vue joueur
      if ((effectiveVisibility === 'hidden' || effectiveVisibility === 'custom') && effectiveIsMJ && char.type != "joueurs") {
        const hiddenBadgeOffsetMultiplier = 16;
        const badgeX = x + hiddenBadgeOffsetMultiplier * zoom;
        const badgeY = y - hiddenBadgeOffsetMultiplier * zoom;
        const badgeRadius = 7 * zoom;

        // Shadow for depth
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4 * zoom;
        ctx.shadowOffsetX = 1.5 * zoom;
        ctx.shadowOffsetY = 1.5 * zoom;

        // Outer ring with gradient
        const outerGradient = ctx.createRadialGradient(badgeX, badgeY, 0, badgeX, badgeY, badgeRadius);
        const isPlayerChar = char.id === persoId;
        const isCustom = effectiveVisibility === 'custom';
        if (isCustom) {
          outerGradient.addColorStop(0, 'rgba(90, 80, 234, 1)');
          outerGradient.addColorStop(1, 'rgba(136, 68, 255, 1)');
        } else {
          outerGradient.addColorStop(0, 'rgba(255, 200, 80, 1)');
          outerGradient.addColorStop(1, 'rgba(255, 140, 0, 1)');
        }

        ctx.fillStyle = outerGradient;
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Reset shadow for inner elements
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Inner circle (dark background for icon)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius * 0.75, 0, 2 * Math.PI);
        ctx.fill();

        // Draw invisible icon from SVG
        const invisibleImg = getConditionIcon('invisible');
        if (invisibleImg) {
          const iconSize = badgeRadius * 1.3;
          const iconX = badgeX - (iconSize / 2);
          const iconY = badgeY - (iconSize / 2);
          ctx.drawImage(invisibleImg, iconX, iconY, iconSize, iconSize);
        }
      }

      // Draw visibility radius outline for selected characters (no more filled semi-transparent disk)
      if (char.type === 'joueurs' && index === selectedCharacterIndex) {
        ctx.strokeStyle = 'rgba(0, 0, 255, 0.9)'; // Bright blue outline
        ctx.lineWidth = 2 * zoom;
        ctx.beginPath();
        const radiusScreen = ((char.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
        ctx.arc(x, y, radiusScreen, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw visibility radius outline for allies when selected (MJ only)
      if (char.visibility === 'ally' && index === selectedCharacterIndex && isMJ) {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)'; // Bright green outline
        ctx.lineWidth = 2 * zoom;
        ctx.beginPath();
        const radiusScreenAlly = ((char.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
        ctx.arc(x, y, radiusScreenAlly, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });
  }




  // Draw measurements manually here (at end of foreground layers)
  drawMeasurements(ctx, imgWidth, imgHeight, scaledWidth, scaledHeight);
}
