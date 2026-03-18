"use client"

import { useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isPointOnDrawing } from '@/app/[roomid]/map/drawings';
import { isMovementBlocked } from '@/lib/obstacle-utils';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import type { Point, Character, MapObject, MapText, SavedDrawing, MusicZone, LightSource, Portal, DrawingTool } from '@/app/[roomid]/map/types';
import type { Obstacle } from '@/lib/visibility';

// ---- Types ----

export interface UseCanvasMouseMoveParams {
  // Canvas refs
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Background
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;

  // View state
  zoom: number;
  offset: { x: number; y: number };

  // Identity
  roomId: string;
  isMJ: boolean;

  // Condition hover refs & state
  iconHitRegionsRef: React.RefObject<{ x: number; y: number; w: number; h: number; label: string }[]>;
  hoveredConditionRef: React.MutableRefObject<{ x: number; y: number; text: string } | null>;
  setHoveredCondition: (v: { x: number; y: number; text: string } | null) => void;

  // Object resizing
  isResizingObject: boolean;
  resizeStartData: {
    index: number;
    initialWidth: number;
    initialHeight: number;
    initialMouseDist: number;
    centerX: number;
    centerY: number;
  } | null;

  // Fog
  isFogDragging: boolean;
  isFogAddMode: boolean;
  fogMode: boolean;
  isVisActive: boolean;
  currentVisibilityTool: string;
  addFogCellIfNew: (x: number, y: number, addMode: boolean) => void;

  // Obstacle data
  obstacles: Obstacle[];

  // Snap point
  setSnapPoint: (v: Point | null) => void;

  // Obstacle point drag
  isDraggingObstaclePoint: boolean;
  connectedPoints: { obstacleId: string; pointIndex: number }[];
  dragStartPosRef: React.MutableRefObject<Point | null>;

  // Edge drag
  isDraggingEdge: boolean;
  draggedEdgeIndex: number | null;
  draggedEdgeObstacleId: string | null;
  draggedEdgeOriginalPoints: Point[];

  // Obstacle drag (multi)
  isDraggingObstacle: boolean;
  dragStartPos: Point | null;
  draggedObstaclesOriginalPoints: { id: string; points: Point[] }[];

  // Obstacle drag (single legacy)
  draggedObstacleId: string | null;
  draggedObstacleOriginalPoints: Point[];

  // Measure
  measureMode: boolean;
  measureStart: Point | null;
  measurementShape: string;
  coneMode: string;
  coneLength: number | undefined;
  globalTokenScale: number;
  pixelsPerUnit: number;
  currentMeasurementId: string | null;

  // Music zone drag
  isDraggingMusicZone: boolean;
  draggedMusicZoneId: string | null;
  draggedMusicZonesOriginalPositions: { id: string; x: number; y: number }[];

  // Music zone resize
  isResizingMusicZone: boolean;
  resizingMusicZoneId: string | null;

  // Pan / general drag
  isDragging: boolean;
  mouseButton: number | null;
  panMode: boolean;
  dragStart: { x: number; y: number };

  // Drawing resize
  isResizingDrawing: boolean;
  selectedDrawingIndex: number | null;
  draggedHandleIndex: number | null;

  // Drawing drag
  isDraggingDrawing: boolean;
  draggedDrawingOriginalPoints: Point[];

  // Note drag
  isDraggingNote: boolean;
  draggedNoteIndex: number | null;

  // Object drag (multi)
  isDraggingObject: boolean;
  draggedObjectIndex: number | null;
  draggedObjectsOriginalPositions: { index: number; x: number; y: number }[];

  // Light drag
  isDraggingLight: boolean;
  draggedLightId: string | null;

  // Portal drag
  isDraggingPortal: boolean;
  draggedPortalId: string | null;

  // Character drag (multi)
  isDraggingCharacter: boolean;
  draggedCharacterIndex: number | null;
  draggedCharactersOriginalPositions: { index: number; x: number; y: number }[];

  // Area selection
  isSelectingArea: boolean;
  selectionStart: Point | null;

  // Drawing mode
  isDrawing: boolean;
  drawMode: boolean;
  currentTool: DrawingTool;
  currentPath: Point[];

  // Data arrays
  characters: Character[];
  drawings: SavedDrawing[];

  // Setters
  setObjects: React.Dispatch<React.SetStateAction<MapObject[]>>;
  setObstacles: React.Dispatch<React.SetStateAction<Obstacle[]>>;
  setMeasureEnd: (v: Point | null) => void;
  setMusicZones: React.Dispatch<React.SetStateAction<MusicZone[]>>;
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  setOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setDragStart: (v: { x: number; y: number }) => void;
  setDrawings: React.Dispatch<React.SetStateAction<SavedDrawing[]>>;
  setNotes: React.Dispatch<React.SetStateAction<MapText[]>>;
  setDropPosition: (v: { x: number; y: number } | null) => void;
  setLights: React.Dispatch<React.SetStateAction<LightSource[]>>;
  setPortals: React.Dispatch<React.SetStateAction<Portal[]>>;
  setSelectedCharacters: (v: number[]) => void;
  setSelectionEnd: (v: Point | null) => void;
  setCurrentPath: React.Dispatch<React.SetStateAction<Point[]>>;
  setSelectedDrawingIndex: (v: number | null) => void;

  // Firebase callbacks
  deleteFromRtdbWithHistory: (collectionName: string, docId: string, description?: string) => Promise<void>;
}

export interface UseCanvasMouseMoveReturn {
  handleCanvasMouseMove: (e: React.MouseEvent<Element>) => void;
}

// ---- Hook ----

export function useCanvasMouseMove(params: UseCanvasMouseMoveParams): UseCanvasMouseMoveReturn {
  const {
    bgCanvasRef,
    containerRef,
    bgImageObject,
    zoom,
    offset,
    roomId,
    isMJ,
    iconHitRegionsRef,
    hoveredConditionRef,
    setHoveredCondition,
    isResizingObject,
    resizeStartData,
    isFogDragging,
    isFogAddMode,
    fogMode,
    isVisActive,
    currentVisibilityTool,
    addFogCellIfNew,
    obstacles,
    setSnapPoint,
    isDraggingObstaclePoint,
    connectedPoints,
    dragStartPosRef,
    isDraggingEdge,
    draggedEdgeIndex,
    draggedEdgeObstacleId,
    draggedEdgeOriginalPoints,
    isDraggingObstacle,
    dragStartPos,
    draggedObstaclesOriginalPoints,
    draggedObstacleId,
    draggedObstacleOriginalPoints,
    measureMode,
    measureStart,
    measurementShape,
    coneMode,
    coneLength,
    globalTokenScale,
    pixelsPerUnit,
    currentMeasurementId,
    isDraggingMusicZone,
    draggedMusicZoneId,
    draggedMusicZonesOriginalPositions,
    isResizingMusicZone,
    resizingMusicZoneId,
    isDragging,
    mouseButton,
    panMode,
    dragStart,
    isResizingDrawing,
    selectedDrawingIndex,
    draggedHandleIndex,
    isDraggingDrawing,
    draggedDrawingOriginalPoints,
    isDraggingNote,
    draggedNoteIndex,
    isDraggingObject,
    draggedObjectIndex,
    draggedObjectsOriginalPositions,
    isDraggingLight,
    draggedLightId,
    isDraggingPortal,
    draggedPortalId,
    isDraggingCharacter,
    draggedCharacterIndex,
    draggedCharactersOriginalPositions,
    isSelectingArea,
    selectionStart,
    isDrawing,
    drawMode,
    currentTool,
    currentPath,
    characters,
    drawings,
    setObjects,
    setObstacles,
    setMeasureEnd,
    setMusicZones,
    setCharacters,
    setOffset,
    setDragStart,
    setDrawings,
    setNotes,
    setDropPosition,
    setLights,
    setPortals,
    setSelectedCharacters,
    setSelectionEnd,
    setCurrentPath,
    setSelectedDrawingIndex,
    deleteFromRtdbWithHistory,
  } = params;

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<Element>) => {

    if (!bgImageObject) return;

    const rect = bgCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const containerWidth = containerRef.current?.clientWidth || rect.width;
    const containerHeight = containerRef.current?.clientHeight || rect.height;

    const image = bgImageObject;
    const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
    const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
    const scaledWidth = imgWidth * scale * zoom;
    const scaledHeight = imgHeight * scale * zoom;
    const currentX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
    const currentY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;


    // HOVER DETECTION FOR CONDITIONS (Screen Coordinates)
    // The icons are drawn using Screen Coordinates (manually transformed in drawMap), so we must compare against Mouse Screen Coords
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let foundHover = null;
    for (const region of iconHitRegionsRef.current) {
      if (mouseX >= region.x && mouseX <= region.x + region.w &&
        mouseY >= region.y && mouseY <= region.y + region.h) {

        foundHover = {
          x: e.clientX,
          y: e.clientY,
          text: region.label
        };
        break;
      }
    }

    // PERFORMANCE: Only update state if hover changed
    // Check if new hover is different from current ref
    const prevHover = hoveredConditionRef.current;
    const isDifferent = (prevHover === null && foundHover !== null) ||
      (prevHover !== null && foundHover === null) ||
      (prevHover && foundHover && prevHover.text !== foundHover.text);

    if (isDifferent) {
      hoveredConditionRef.current = foundHover;
      setHoveredCondition(foundHover);
    } else if (foundHover) {
      // Update position only, but using Ref to avoid re-renders?
      // Actually, if we want the tooltip to follow the mouse, we NEED re-renders or direct DOM manipulation.
      // For static tooltips that don't follow mouse, strictly check text.
      // If we want it to follow, we must update state.
      // COMPROMISE: Don't update X/Y constanty if text is same. Tooltip stays at first hover point.
    }

    const x = currentX;
    const y = currentY;

    //  RESIZING OBJECT
    if (isResizingObject && resizeStartData && bgImageObject) {
      const mouseXScreen = e.clientX;
      const mouseYScreen = e.clientY;

      const currentDist = Math.sqrt(Math.pow(mouseXScreen - resizeStartData.centerX, 2) + Math.pow(mouseYScreen - resizeStartData.centerY, 2));
      const scaleFactor = currentDist / resizeStartData.initialMouseDist;

      const newWidth = resizeStartData.initialWidth * scaleFactor;
      const newHeight = resizeStartData.initialHeight * scaleFactor;

      // Update local state implicitly by updating objects array
      // Only update the specific object
      setObjects(prev => prev.map((o, i) => {
        if (i === resizeStartData.index) {
          return { ...o, width: newWidth, height: newHeight };
        }
        return o;
      }));
      return;
    }

    //  PRIORITÉ 0: Placement continu de brouillard pendant le drag
    if (isFogDragging && (fogMode || (isVisActive && currentVisibilityTool === 'fog'))) {
      const addMode = isFogAddMode;
      addFogCellIfNew(currentX, currentY, addMode);
      return;
    }

    // DÉTECTION SNAP POINT (commun à Draw et Edit)
    let activeSnapPoint: Point | null = null;
    if (isVisActive && (currentVisibilityTool === 'chain' || (currentVisibilityTool === 'edit' && isDraggingObstaclePoint))) {
      const snapDistance = 25 / zoom;
      let minDist = snapDistance;

      for (const obstacle of obstacles) {
        // Snap sur tous les types d'obstacles qui ont des points
        if (obstacle.points.length >= 2) {
          for (let i = 0; i < obstacle.points.length; i++) {
            const point = obstacle.points[i];
            // Ignorer les points qu'on est en train de déplacer
            if (currentVisibilityTool === 'edit' && isDraggingObstaclePoint) {
              const isBeingDragged = connectedPoints.some(cp => cp.obstacleId === obstacle.id && cp.pointIndex === i);
              if (isBeingDragged) continue;
            }

            const dist = Math.sqrt(Math.pow(currentX - point.x, 2) + Math.pow(currentY - point.y, 2));
            if (dist < minDist) {
              minDist = dist;
              activeSnapPoint = point;
            }
          }
        }
      }
      setSnapPoint(activeSnapPoint);
    } else {
      setSnapPoint(null);
    }

    // MODE EDIT - Drag d'une arête le long du mur parent
    if (isVisActive && currentVisibilityTool === 'edit' && isDraggingEdge && draggedEdgeIndex !== null && draggedEdgeObstacleId) {
      const n = draggedEdgeOriginalPoints.length;
      const edgeP1Idx = draggedEdgeIndex;
      const edgeP2Idx = (draggedEdgeIndex + 1) % n;

      // Trouver la ligne parent : le segment "grand" sur lequel l'arête glisse
      // C'est la ligne entre le coin précédent (non-collinéaire) et le coin suivant (non-collinéaire)
      // En pratique : le prev du P1 de l'arête et le next du P2 de l'arête
      const prevCornerIdx = (edgeP1Idx - 1 + n) % n;
      const nextCornerIdx = (edgeP2Idx + 1) % n;
      const lineStart = draggedEdgeOriginalPoints[prevCornerIdx];
      const lineEnd = draggedEdgeOriginalPoints[nextCornerIdx];

      const origP1 = draggedEdgeOriginalPoints[edgeP1Idx];
      const origP2 = draggedEdgeOriginalPoints[edgeP2Idx];

      // Direction de la ligne parent
      const dx = lineEnd.x - lineStart.x;
      const dy = lineEnd.y - lineStart.y;
      const lineLenSq = dx * dx + dy * dy;
      if (lineLenSq > 0) {
        // Projeter le delta de la souris sur la direction de la ligne
        const mouseDx = currentX - (dragStartPosRef.current?.x ?? currentX);
        const mouseDy = currentY - (dragStartPosRef.current?.y ?? currentY);
        const projectedDelta = (mouseDx * dx + mouseDy * dy) / lineLenSq;

        // Calculer les positions originales en paramètre t sur la ligne
        const t1Orig = ((origP1.x - lineStart.x) * dx + (origP1.y - lineStart.y) * dy) / lineLenSq;
        const t2Orig = ((origP2.x - lineStart.x) * dx + (origP2.y - lineStart.y) * dy) / lineLenSq;

        // Appliquer le delta projeté
        let t1New = t1Orig + projectedDelta;
        let t2New = t2Orig + projectedDelta;

        // Clamper pour rester entre les coins voisins (avec marge minimale de 5px)
        const lineLen = Math.sqrt(lineLenSq);
        const minMargin = 5 / lineLen;
        const edgeLen = t2New - t1New;
        if (t1New < minMargin) { t1New = minMargin; t2New = t1New + edgeLen; }
        if (t2New > 1 - minMargin) { t2New = 1 - minMargin; t1New = t2New - edgeLen; }

        const newP1 = { x: lineStart.x + t1New * dx, y: lineStart.y + t1New * dy };
        const newP2 = { x: lineStart.x + t2New * dx, y: lineStart.y + t2New * dy };

        setObstacles(prev => prev.map(obs => {
          if (obs.id === draggedEdgeObstacleId) {
            const newPoints = [...obs.points];
            newPoints[edgeP1Idx] = newP1;
            newPoints[edgeP2Idx] = newP2;
            return { ...obs, points: newPoints };
          }
          return obs;
        }));
      }
      return;
    }

    // MODE EDIT - Drag d'un point individuel
    if (isVisActive && currentVisibilityTool === 'edit' && isDraggingObstaclePoint && dragStartPosRef.current) {
      // Utiliser le snap point ou la position souris
      let targetX = activeSnapPoint ? activeSnapPoint.x : currentX;
      let targetY = activeSnapPoint ? activeSnapPoint.y : currentY;

      // Mettre à jour TOUS les obstacles connectés
      setObstacles(prev => {
        return prev.map(obs => {
          const connectedPoint = connectedPoints.find(cp => cp.obstacleId === obs.id);
          if (connectedPoint) {
            const newPoints = [...obs.points];
            newPoints[connectedPoint.pointIndex] = { x: targetX, y: targetY };
            return { ...obs, points: newPoints };
          }
          return obs;
        });
      });
      return;
    }

    // DRAG OBSTACLES
    if (isDraggingObstacle && dragStartPos && draggedObstaclesOriginalPoints.length > 0) {
      const deltaX = currentX - dragStartPos.x;
      const deltaY = currentY - dragStartPos.y;

      setObstacles(prev => prev.map(obs => {
        const originalObs = draggedObstaclesOriginalPoints.find(orig => orig.id === obs.id);
        if (originalObs) {
          const newPoints = originalObs.points.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY
          }));
          return { ...obs, points: newPoints };
        }
        return obs;
      }));
      return;
    }


    if (isVisActive && currentVisibilityTool === 'chain') {
      // Pas de mise à jour en temps réel pendant le dessin
      // (les points sont fixés au clic, le preview utilise snapPoint)
      return;
    }

    //  MEASURE DRAG
    //  MEASURE DRAG
    if (measureMode && measureStart && e.buttons === 1) {
      let targetX = currentX;
      let targetY = currentY;

      // Cone Length Constraint
      if (measurementShape === 'cone' && coneMode === 'dimensions' && coneLength && coneLength > 0) {
        // Calculate constrained point
        // Target Distance in Image Pixels = Length * PPU * Scale * Zoom?
        // Wait, render logic uses: unitDist = pixelDist / (PPU * Scale * Zoom).
        // So pixelDist = unitDist * PPU * Scale * Zoom.
        const validScale = (globalTokenScale && globalTokenScale > 0) ? globalTokenScale : 1;
        const requiredPixelDist = coneLength * pixelsPerUnit * validScale * zoom;

        const angle = Math.atan2(currentY - measureStart.y, currentX - measureStart.x);
        targetX = measureStart.x + Math.cos(angle) * requiredPixelDist;
        targetY = measureStart.y + Math.sin(angle) * requiredPixelDist;
      }

      setMeasureEnd({ x: targetX, y: targetY });

      // UPDATE SHARED MEASUREMENT (THROTTLED OPTIONALLY, but for now direct)
      if (currentMeasurementId && roomId) {
        // We use a ref or just update. Firestore writes can be expensive if 60fps.
        // For now, let's try direct update. If laggy, we'll throttle.
        const docRef = doc(db, 'cartes', roomId, 'measurements', currentMeasurementId);
        updateDoc(docRef, {
          end: { x: targetX, y: targetY }
        }).catch(console.error);
      }
      return;
    }

    // HANDLE MUSIC ZONE DRAG (MULTI)
    if (isDraggingMusicZone && draggedMusicZoneId && isMJ && draggedMusicZonesOriginalPositions.length > 0) {
      // Find reference zone original position
      const originalRefZone = draggedMusicZonesOriginalPositions.find(pos => pos.id === draggedMusicZoneId);
      if (originalRefZone) {
        // Calculate delta from START of drag in screen coordinates
        const screenDx = e.clientX - dragStart.x;
        const screenDy = e.clientY - dragStart.y;

        // Convert screen delta to map delta
        const mapDx = screenDx / (scale * zoom);
        const mapDy = screenDy / (scale * zoom);

        // Apply delta to ALL selected zones
        setMusicZones(prev => prev.map(z => {
          const originalPos = draggedMusicZonesOriginalPositions.find(pos => pos.id === z.id);
          if (originalPos) {
            return {
              ...z,
              x: originalPos.x + mapDx,
              y: originalPos.y + mapDy
            };
          }
          return z;
        }));
      }
      return;
    }

    // HANDLE MUSIC ZONE RESIZING (Standard & Character)
    if (isResizingMusicZone && resizingMusicZoneId && isMJ) {

      // A. Character Audio Zone
      if (resizingMusicZoneId.startsWith('char-')) {
        const charId = resizingMusicZoneId.replace('char-', '');
        setCharacters(prev => prev.map(c => {
          if (c.id === charId && c.audio) {
            const dx = currentX - c.x;
            const dy = currentY - c.y;
            const newRadius = Math.sqrt(dx * dx + dy * dy);
            if (newRadius < 10) return c;

            return {
              ...c,
              audio: { ...c.audio, radius: newRadius }
            };
          }
          return c;
        }));
        return;
      }

      // B. Standard Music Zone
      setMusicZones(prev => prev.map(z => {
        if (z.id === resizingMusicZoneId) {
          // Calculate distance from center to current mouse (Map Coords)
          // currentX, currentY are already in Map Coords!
          const dx = currentX - z.x;
          const dy = currentY - z.y;
          const newRadius = Math.sqrt(dx * dx + dy * dy);

          // Minimum radius check
          if (newRadius < 10) return z;

          return { ...z, radius: newRadius };
        }
        return z;
      }));
      return;
    }


    //  DRAG OBSTACLE
    if (isDraggingObstacle && draggedObstacleId) {
      if (draggedObstacleOriginalPoints.length === 0) {
        // Prevent disappearance due to race condition or empty state
        return;
      }
      const startMapX = ((dragStart.x - rect.left + offset.x) / scaledWidth) * imgWidth;
      const startMapY = ((dragStart.y - rect.top + offset.y) / scaledHeight) * imgHeight;

      const deltaX = currentX - startMapX;
      const deltaY = currentY - startMapY;

      // DEBUG NAN
      if (isNaN(deltaX) || isNaN(deltaY)) {
        console.error("NaN detected in obstacle drag:", { startMapX, startMapY, currentX, currentY, dragStart, rect, offset, scaledWidth, imageWidth: imgWidth });
        return;
      }

      setObstacles(prev => prev.map(obs => {
        if (obs.id === draggedObstacleId) {
          // Create new points based on original points + delta
          // We rely on draggedObstacleOriginalPoints having the same length and order
          const newPoints = draggedObstacleOriginalPoints.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY
          }));
          return { ...obs, points: newPoints };
        }
        return obs;
      }));
      return;
    }

    //  DÉPLACEMENT DE CARTE
    // Pour le MJ : clic milieu OU clic gauche en panMode
    // Pour les joueurs : clic milieu OU clic gauche sur zone vide (isDragging sans autre action en cours)
    if (isDragging && (mouseButton === 1 || (mouseButton === 0 && (panMode || !isMJ)))) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setOffset((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    //  RESIZE DESSIN
    if (isResizingDrawing && selectedDrawingIndex !== null && draggedHandleIndex !== null) {
      setDrawings(prev => prev.map((drawing, index) => {
        if (index === selectedDrawingIndex) {
          const newPoints = [...drawing.points];
          const p1 = newPoints[0];
          const p2 = newPoints[1];

          if (drawing.type === 'line') {
            if (draggedHandleIndex === 0) newPoints[0] = { x: currentX, y: currentY };
            if (draggedHandleIndex === 1) newPoints[1] = { x: currentX, y: currentY };
          } else if (drawing.type === 'rectangle') {
            if (draggedHandleIndex === 0) {
              newPoints[0] = { x: currentX, y: currentY };
            } else if (draggedHandleIndex === 1) {
              newPoints[1] = { ...p2, x: currentX };
              newPoints[0] = { ...p1, y: currentY };
            } else if (draggedHandleIndex === 2) {
              newPoints[1] = { x: currentX, y: currentY };
            } else if (draggedHandleIndex === 3) {
              newPoints[0] = { ...p1, x: currentX };
              newPoints[1] = { ...p2, y: currentY };
            }
          } else if (drawing.type === 'circle') {
            if (draggedHandleIndex === 0) {
              newPoints[1] = { x: currentX, y: currentY };
            }
          }
          return { ...drawing, points: newPoints };
        }
        return drawing;
      }));
      return;
    }

    //  DRAG & DROP DESSIN
    if (isDraggingDrawing && selectedDrawingIndex !== null) {
      const startX = (dragStart.x - rect.left + offset.x) / scaledWidth * imgWidth;
      const startY = (dragStart.y - rect.top + offset.y) / scaledHeight * imgHeight;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      setDrawings(prev => prev.map((drawing, index) => {
        if (index === selectedDrawingIndex) {
          const newPoints = draggedDrawingOriginalPoints.map(p => ({
            x: p.x + deltaX,
            y: p.y + deltaY
          }));
          return { ...drawing, points: newPoints };
        }
        return drawing;
      }));
      return;
    }

    //  DRAG & DROP NOTE
    if (isDraggingNote && draggedNoteIndex !== null) {
      setNotes(prev => prev.map((note, index) => {
        if (index === draggedNoteIndex) {
          return { ...note, x: currentX, y: currentY };
        }
        return note;
      }));
      return;
    }

    //  DRAG & DROP OBJET
    //  DRAG & DROP OBJET (MULTI)
    if (isDraggingObject && draggedObjectIndex !== null && draggedObjectsOriginalPositions.length > 0) {
      // dragStart now contains MAP coordinates (fixed), not client coordinates
      // Calculate the movement directly
      const deltaX = currentX - dragStart.x;
      const deltaY = currentY - dragStart.y;

      setObjects(prev => prev.map((obj, index) => {
        const originalPos = draggedObjectsOriginalPositions.find(pos => pos.index === index);
        if (originalPos) {
          return {
            ...obj,
            x: originalPos.x + deltaX,
            y: originalPos.y + deltaY
          };
        }
        return obj;
      }));
      return; // Return here is correct as we handled the event
    }

    setDropPosition({ x: currentX, y: currentY })

    // DRAG LUMIÈRE (LIGHT)
    if (isDraggingLight && draggedLightId) {
      if (!dragStart) return;

      const deltaX = currentX - dragStart.x;
      const deltaY = currentY - dragStart.y;

      // Update local state for smooth drag
      setLights(prev => prev.map(l => {
        if (l.id === draggedLightId) {
          return { ...l, x: l.x + deltaX, y: l.y + deltaY };
        }
        return l;
      }));

      setDragStart({ x: currentX, y: currentY });
      return;
    }

    //  DRAG PORTAL
    if (isDraggingPortal && draggedPortalId) {
      if (!dragStart) return;

      const deltaX = currentX - dragStart.x;
      const deltaY = currentY - dragStart.y;

      setPortals(prev => prev.map(p => {
        if (p.id === draggedPortalId) {
          return { ...p, x: p.x + deltaX, y: p.y + deltaY };
        }
        return p;
      }));

      setDragStart({ x: currentX, y: currentY });
      return;
    }

    //  DRAG & DROP PERSONNAGE
    if (isDraggingCharacter && draggedCharacterIndex !== null && draggedCharactersOriginalPositions.length > 0) {
      const originalRefChar = draggedCharactersOriginalPositions.find(pos => pos.index === draggedCharacterIndex);
      if (originalRefChar) {
        const deltaX = currentX - originalRefChar.x;
        const deltaY = currentY - originalRefChar.y;

        setCharacters(prev => prev.map((char, index) => {
          const originalPos = draggedCharactersOriginalPositions.find(pos => pos.index === index);
          if (originalPos) {
            const newX = Math.max(0, Math.min(imgWidth, originalPos.x + deltaX));
            const newY = Math.max(0, Math.min(imgHeight, originalPos.y + deltaY));
            // Joueurs : bloquer si le déplacement traverse un mur/porte fermée/fenêtre
            if (!isMJ && obstacles.length > 0 && isMovementBlocked({ x: char.x, y: char.y }, { x: newX, y: newY }, obstacles)) {
              return char;
            }
            return { ...char, x: newX, y: newY };
          }
          return char;
        }));
      }
      return;
    }

    //  SÉLECTION PAR ZONE
    if (isSelectingArea && selectionStart) {
      setSelectionEnd({ x: currentX, y: currentY });
      const selectedChars = characters
        .map((char, index) => {
          const minX = Math.min(selectionStart.x, currentX);
          const maxX = Math.max(selectionStart.x, currentX);
          const minY = Math.min(selectionStart.y, currentY);
          const maxY = Math.max(selectionStart.y, currentY);
          return (char.x >= minX && char.x <= maxX && char.y >= minY && char.y <= maxY) ? index : null;
        })
        .filter((index) => index !== null) as number[];
      setSelectedCharacters(selectedChars);
      return;
    }

    //  MODE DESSIN (Drawing Tools)
    if (isDrawing && drawMode && !fogMode) {
      if (currentTool === 'eraser') {
        const drawingIndexToDelete = drawings.findIndex(drawing => isPointOnDrawing(x, y, drawing, zoom));
        if (drawingIndexToDelete !== -1 && roomId) {
          const drawingToDelete = drawings[drawingIndexToDelete];
          deleteFromRtdbWithHistory('drawings', drawingToDelete.id, 'Effacement du tracé');
          const newDrawings = [...drawings];
          newDrawings.splice(drawingIndexToDelete, 1);
          setDrawings(newDrawings);
          if (selectedDrawingIndex === drawingIndexToDelete) {
            setSelectedDrawingIndex(null);
          }
        }
      } else {
        if (currentTool === 'pen') {
          setCurrentPath((prev) => [...prev, { x, y }]);
        } else {
          if (currentPath.length > 0) {
            setCurrentPath([currentPath[0], { x, y }]);
          }
        }
      }
    }
  }, [
    bgImageObject, bgCanvasRef, containerRef, zoom, offset, roomId, isMJ,
    iconHitRegionsRef, hoveredConditionRef, setHoveredCondition,
    isResizingObject, resizeStartData,
    isFogDragging, isFogAddMode, fogMode, isVisActive, currentVisibilityTool, addFogCellIfNew,
    obstacles, setSnapPoint, isDraggingObstaclePoint, connectedPoints, dragStartPosRef,
    isDraggingEdge, draggedEdgeIndex, draggedEdgeObstacleId, draggedEdgeOriginalPoints,
    isDraggingObstacle, dragStartPos, draggedObstaclesOriginalPoints,
    draggedObstacleId, draggedObstacleOriginalPoints,
    measureMode, measureStart, measurementShape, coneMode, coneLength,
    globalTokenScale, pixelsPerUnit, currentMeasurementId,
    isDraggingMusicZone, draggedMusicZoneId, draggedMusicZonesOriginalPositions,
    isResizingMusicZone, resizingMusicZoneId,
    isDragging, mouseButton, panMode, dragStart,
    isResizingDrawing, selectedDrawingIndex, draggedHandleIndex,
    isDraggingDrawing, draggedDrawingOriginalPoints,
    isDraggingNote, draggedNoteIndex,
    isDraggingObject, draggedObjectIndex, draggedObjectsOriginalPositions,
    isDraggingLight, draggedLightId,
    isDraggingPortal, draggedPortalId,
    isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions,
    isSelectingArea, selectionStart,
    isDrawing, drawMode, currentTool, currentPath,
    characters, drawings,
    setObjects, setObstacles, setMeasureEnd, setMusicZones, setCharacters,
    setOffset, setDragStart, setDrawings, setNotes, setDropPosition,
    setLights, setPortals, setSelectedCharacters, setSelectionEnd, setCurrentPath,
    setSelectedDrawingIndex, deleteFromRtdbWithHistory,
  ]);

  return {
    handleCanvasMouseMove,
  };
}
