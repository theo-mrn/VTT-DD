"use client"

import { useCallback } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import { calculateDistance } from '@/app/[roomid]/map/shadows';
import { SelectionCandidates } from '@/components/(map)/SelectionMenu';
import type {
  Point,
  Character,
  MapText,
  SavedDrawing,
  MapObject,
  MusicZone,
  LightSource,
  Portal,
  DrawingTool,
} from '@/app/[roomid]/map/types';
import type { Obstacle } from '@/lib/visibility';

// ---- Types ----

export interface UseCanvasMouseUpParams {
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
  selectedCityId: string | null;

  // Mouse state
  mouseButton: number | null;
  setMouseButton: (v: number | null) => void;
  mouseClickStartRef: React.RefObject<{ x: number; y: number } | null>;

  // Pan / drag state
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  dragStart: { x: number; y: number };
  setDragStart: (v: { x: number; y: number }) => void;
  panMode: boolean;

  // Calibration / Measurement
  isCalibrating: boolean;
  measureMode: boolean;
  measureStart: Point | null;
  measureEnd: Point | null;
  currentMeasurementId: string | null;
  setCalibrationDialogOpen: (v: boolean) => void;
  setContextMenuMeasurementId: (v: string | null) => void;
  setContextMenuMeasurementOpen: (v: boolean) => void;
  setCurrentMeasurementId: (v: string | null) => void;
  setMeasureStart: (v: Point | null) => void;
  setMeasureEnd: (v: Point | null) => void;

  // Edge drag state
  isDraggingEdge: boolean;
  draggedEdgeObstacleId: string | null;
  setIsDraggingEdge: (v: boolean) => void;
  setDraggedEdgeIndex: (v: number | null) => void;
  setDraggedEdgeObstacleId: (v: string | null) => void;
  setDraggedEdgeOriginalPoints: (v: Point[]) => void;

  // Object resize state
  isResizingObject: boolean;
  resizeStartData: {
    index: number;
    initialWidth: number;
    initialHeight: number;
    initialMouseDist: number;
    centerX: number;
    centerY: number;
  } | null;
  setIsResizingObject: (v: boolean) => void;
  setResizeStartData: (v: null) => void;

  // Obstacle point drag state
  isDraggingObstaclePoint: boolean;
  selectedObstacleIds: string[];
  connectedPoints: { obstacleId: string; pointIndex: number }[];
  setIsDraggingObstaclePoint: (v: boolean) => void;
  setDraggedPointIndex: (v: number | null) => void;
  setDraggedObstacleOriginalPoints: (v: Point[]) => void;
  setConnectedPoints: (v: { obstacleId: string; pointIndex: number }[]) => void;
  setDragStartPos: (v: Point | null) => void;

  // Music zone drag state
  isDraggingMusicZone: boolean;
  draggedMusicZoneId: string | null;
  draggedMusicZonesOriginalPositions: { id: string; x: number; y: number }[];
  setIsDraggingMusicZone: (v: boolean) => void;
  setDraggedMusicZoneId: (v: string | null) => void;
  setDraggedMusicZonesOriginalPositions: (v: { id: string; x: number; y: number }[]) => void;
  setContextMenuMusicZoneId: (v: string | null) => void;
  setContextMenuMusicZoneOpen: (v: boolean) => void;

  // Light drag state
  isDraggingLight: boolean;
  draggedLightId: string | null;
  draggedLightOriginalPos: { x: number; y: number };
  setIsDraggingLight: (v: boolean) => void;
  setDraggedLightId: (v: string | null) => void;

  // Portal drag state
  isDraggingPortal: boolean;
  draggedPortalId: string | null;
  draggedPortalOriginalPos: { x: number; y: number };
  setIsDraggingPortal: (v: boolean) => void;
  setDraggedPortalId: (v: string | null) => void;
  setDraggedPortalOriginalPos: (v: { x: number; y: number }) => void;

  // Music zone resize state
  isResizingMusicZone: boolean;
  resizingMusicZoneId: string | null;
  setIsResizingMusicZone: (v: boolean) => void;
  setResizingMusicZoneId: (v: string | null) => void;

  // Drawing resize state
  isResizingDrawing: boolean;
  selectedDrawingIndex: number | null;
  setIsResizingDrawing: (v: boolean) => void;
  setDraggedHandleIndex: (v: number | null) => void;

  // Drawing drag state
  isDraggingDrawing: boolean;
  draggedDrawingOriginalPoints: Point[];
  setIsDraggingDrawing: (v: boolean) => void;

  // Obstacle drag state
  isDraggingObstacle: boolean;
  draggedObstaclesOriginalPoints: { id: string; points: Point[] }[];
  setIsDraggingObstacle: (v: boolean) => void;
  setDraggedObstacleId: (v: string | null) => void;
  setDraggedObstaclesOriginalPoints: (v: { id: string; points: Point[] }[]) => void;
  dragStartPosRef: React.MutableRefObject<Point | null>;
  draggedObstacleOriginalPointsRef: React.MutableRefObject<Point[]>;

  // Fog drag state
  isFogDragging: boolean;
  setIsFogDragging: (v: boolean) => void;
  setIsFogAddMode: (v: boolean) => void;
  setLastFogCell: (v: string | null) => void;
  fogMode: boolean;
  isVisActive: boolean;
  currentVisibilityTool: string;

  // Note drag state
  isDraggingNote: boolean;
  draggedNoteIndex: number | null;
  draggedNoteOriginalPos: { x: number; y: number };
  setIsDraggingNote: (v: boolean) => void;
  setDraggedNoteIndex: (v: number | null) => void;
  setDraggedNoteOriginalPos: (v: { x: number; y: number }) => void;

  // Object drag state
  isDraggingObject: boolean;
  draggedObjectIndex: number | null;
  draggedObjectsOriginalPositions: { index: number; x: number; y: number }[];
  setIsDraggingObject: (v: boolean) => void;
  setDraggedObjectIndex: (v: number | null) => void;
  setDraggedObjectsOriginalPositions: (v: { index: number; x: number; y: number }[]) => void;

  // Character drag state
  isDraggingCharacter: boolean;
  draggedCharacterIndex: number | null;
  draggedCharactersOriginalPositions: { index: number; x: number; y: number }[];
  setIsDraggingCharacter: (v: boolean) => void;
  setDraggedCharacterIndex: (v: number | null) => void;
  setDraggedCharactersOriginalPositions: (v: { index: number; x: number; y: number }[]) => void;

  // Area selection state
  isSelectingArea: boolean;
  selectionStart: Point | null;
  selectionEnd: Point | null;
  setIsSelectingArea: (v: boolean) => void;
  setSelectionStart: (v: Point | null) => void;
  setSelectionEnd: (v: Point | null) => void;
  isBackgroundEditMode: boolean;

  // Selection state setters
  setSelectedCharacters: (v: number[]) => void;
  setSelectedObjectIndices: (v: number[]) => void;
  setSelectedNoteIndex: (v: number | null) => void;
  setSelectedDrawingIndex: (v: number | null) => void;
  setSelectedObstacleIds: (v: string[]) => void;
  setSelectedMusicZoneIds: (v: string[]) => void;
  setSelectedLightIds: (v: string[]) => void;
  setSelectedPortalIds: (v: string[]) => void;
  setSelectedFogCells: (v: string[]) => void;

  // Selection menu state
  setSelectionCandidates: (v: SelectionCandidates | null) => void;
  setMenuPosition: (v: { x: number; y: number }) => void;
  setShowSelectionMenu: (v: boolean) => void;

  // Fog grid state
  fogGrid: Map<string, boolean>;
  fullMapFog: boolean;
  fogCellSize: number;

  // Drawing state
  isDrawing: boolean;
  setIsDrawing: (v: boolean) => void;
  drawMode: boolean;
  currentPath: Point[];
  setCurrentPath: (v: Point[]) => void;
  drawingColor: string;
  drawingSize: number;
  currentTool: DrawingTool;

  // Data arrays
  obstacles: Obstacle[];
  characters: Character[];
  objects: MapObject[];
  notes: MapText[];
  drawings: SavedDrawing[];
  musicZones: MusicZone[];
  lights: LightSource[];
  portals: Portal[];

  // Data setters (for revert on error)
  setObstacles: React.Dispatch<React.SetStateAction<Obstacle[]>>;
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  setObjects: React.Dispatch<React.SetStateAction<MapObject[]>>;
  setNotes: React.Dispatch<React.SetStateAction<MapText[]>>;
  setDrawings: React.Dispatch<React.SetStateAction<SavedDrawing[]>>;
  setLights: React.Dispatch<React.SetStateAction<LightSource[]>>;

  // Firebase / history callbacks
  updateObstacle: (obstacleId: string, points: Point[]) => Promise<void>;
  updateMusicZonePosition: (zoneId: string, x: number, y: number) => void;
  updateWithHistory: (
    collectionName: string,
    documentId: string,
    data: Record<string, any>,
    description: string,
    knownPreviousData?: Record<string, any>
  ) => Promise<void>;
  updateRtdbWithHistory: (
    collectionName: string,
    docId: string,
    data: Record<string, any>,
    description: string
  ) => Promise<void>;
  addToRtdbWithHistory: (
    collectionName: string,
    data: Record<string, any>,
    description: string
  ) => Promise<string>;
  updatePositionWithHistory: (
    characterId: string,
    position: { x: number; y: number },
    description: string
  ) => Promise<void>;
  setCityPositionWithHistory: (
    characterId: string,
    cityId: string,
    position: { x: number; y: number },
    description: string
  ) => Promise<void>;
  flushFogUpdates: () => Promise<void>;

  // Selection reset
  resetActiveElementSelection: () => void;
}

export interface UseCanvasMouseUpReturn {
  handleCanvasMouseUp: (e?: React.MouseEvent | React.TouchEvent | MouseEvent | any) => Promise<void>;
}

// ---- Hook ----

export function useCanvasMouseUp(params: UseCanvasMouseUpParams): UseCanvasMouseUpReturn {
  const {
    bgCanvasRef, containerRef,
    bgImageObject,
    zoom, offset,
    roomId, isMJ, selectedCityId,
    mouseButton, setMouseButton,
    mouseClickStartRef,
    isDragging, setIsDragging,
    dragStart, setDragStart,
    panMode,
    isCalibrating, measureMode, measureStart, measureEnd,
    currentMeasurementId,
    setCalibrationDialogOpen,
    setContextMenuMeasurementId, setContextMenuMeasurementOpen,
    setCurrentMeasurementId, setMeasureStart, setMeasureEnd,
    isDraggingEdge, draggedEdgeObstacleId,
    setIsDraggingEdge, setDraggedEdgeIndex, setDraggedEdgeObstacleId, setDraggedEdgeOriginalPoints,
    isResizingObject, resizeStartData,
    setIsResizingObject, setResizeStartData,
    isDraggingObstaclePoint, selectedObstacleIds,
    connectedPoints,
    setIsDraggingObstaclePoint, setDraggedPointIndex,
    setConnectedPoints, setDragStartPos,
    isDraggingMusicZone, draggedMusicZoneId,
    draggedMusicZonesOriginalPositions,
    setIsDraggingMusicZone, setDraggedMusicZoneId, setDraggedMusicZonesOriginalPositions,
    setContextMenuMusicZoneId, setContextMenuMusicZoneOpen,
    isDraggingLight, draggedLightId, draggedLightOriginalPos,
    setIsDraggingLight, setDraggedLightId,
    isDraggingPortal, draggedPortalId, draggedPortalOriginalPos,
    setIsDraggingPortal, setDraggedPortalId, setDraggedPortalOriginalPos,
    isResizingMusicZone, resizingMusicZoneId,
    setIsResizingMusicZone, setResizingMusicZoneId,
    isResizingDrawing, selectedDrawingIndex,
    setIsResizingDrawing, setDraggedHandleIndex,
    isDraggingDrawing, draggedDrawingOriginalPoints,
    setIsDraggingDrawing,
    isDraggingObstacle, draggedObstaclesOriginalPoints,
    setIsDraggingObstacle, setDraggedObstacleId,
    setDraggedObstacleOriginalPoints: setDraggedObstacleOriginalPointsState,
    setDraggedObstaclesOriginalPoints,
    dragStartPosRef, draggedObstacleOriginalPointsRef,
    isFogDragging, setIsFogDragging, setIsFogAddMode, setLastFogCell,
    fogMode, isVisActive, currentVisibilityTool,
    isDraggingNote, draggedNoteIndex, draggedNoteOriginalPos,
    setIsDraggingNote, setDraggedNoteIndex, setDraggedNoteOriginalPos,
    isDraggingObject, draggedObjectIndex, draggedObjectsOriginalPositions,
    setIsDraggingObject, setDraggedObjectIndex, setDraggedObjectsOriginalPositions,
    isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions,
    setIsDraggingCharacter, setDraggedCharacterIndex, setDraggedCharactersOriginalPositions,
    isSelectingArea, selectionStart, selectionEnd,
    setIsSelectingArea, setSelectionStart, setSelectionEnd,
    isBackgroundEditMode,
    setSelectedCharacters, setSelectedObjectIndices, setSelectedNoteIndex,
    setSelectedDrawingIndex, setSelectedObstacleIds, setSelectedMusicZoneIds,
    setSelectedLightIds, setSelectedPortalIds, setSelectedFogCells,
    setSelectionCandidates, setMenuPosition, setShowSelectionMenu,
    fogGrid, fullMapFog, fogCellSize,
    isDrawing, setIsDrawing, drawMode,
    currentPath, setCurrentPath,
    drawingColor, drawingSize, currentTool,
    obstacles, characters, objects, notes, drawings, musicZones, lights, portals,
    setObstacles, setCharacters, setObjects, setNotes, setDrawings, setLights,
    updateObstacle, updateMusicZonePosition,
    updateWithHistory, updateRtdbWithHistory, addToRtdbWithHistory,
    updatePositionWithHistory, setCityPositionWithHistory,
    flushFogUpdates,
    resetActiveElementSelection,
  } = params;

  const handleCanvasMouseUp = useCallback(async (e?: React.MouseEvent | React.TouchEvent | MouseEvent | any) => {
    const rect = bgCanvasRef.current?.getBoundingClientRect();
    //  CALIBRATION END (OPEN DIALOG)
    if (isCalibrating && measureMode && measureStart && measureEnd) {
      // If dragged distance is significant, open dialog
      const dist = calculateDistance(measureStart.x, measureStart.y, measureEnd.x, measureEnd.y);
      if (dist > 10) {
        setCalibrationDialogOpen(true);
      }
    }

    // FINISH MEASUREMENT (skip if calibrating to preserve start/end for dialog)
    if (measureMode && currentMeasurementId && !isCalibrating) {
      // Always open menu to allow Attack or Delete
      setContextMenuMeasurementId(currentMeasurementId);
      setContextMenuMeasurementOpen(true);

      // Just stop tracking it as "current", it remains in Firestore
      setCurrentMeasurementId(null);
      setMeasureStart(null);
      setMeasureEnd(null);
    }

    setIsDragging(false);
    setDragStart({ x: 0, y: 0 });
    // Réinitialiser le bouton de souris
    const currentMouseButton = mouseButton;
    setMouseButton(null);

    // FIN DU DRAG D'ARÊTE
    if (isDraggingEdge && draggedEdgeObstacleId) {
      const obstacle = obstacles.find(o => o.id === draggedEdgeObstacleId);
      if (obstacle) {
        await updateObstacle(draggedEdgeObstacleId, obstacle.points);
      }
      setIsDraggingEdge(false);
      setDraggedEdgeIndex(null);
      setDraggedEdgeObstacleId(null);
      setDraggedEdgeOriginalPoints([]);
      setDragStartPos(null);
      dragStartPosRef.current = null;
      return;
    }

    //  FIN RESIZE OBJET
    if (isResizingObject && resizeStartData && roomId) {
      const resizedObject = objects[resizeStartData.index];
      if (resizedObject && resizedObject.id) {
        try {
          await updateDoc(doc(db, 'cartes', String(roomId), 'objects', resizedObject.id), {
            width: resizedObject.width,
            height: resizedObject.height,
          });
        } catch (error) {
          console.error("Error saving object resize:", error);
          // Revert to original size on error
          setObjects(prev => prev.map((o, i) => {
            if (i === resizeStartData.index) {
              return { ...o, width: resizeStartData.initialWidth, height: resizeStartData.initialHeight };
            }
            return o;
          }));
        }
      }
      setIsResizingObject(false);
      setResizeStartData(null);
      return;
    }

    // FIN DU DRAG POINT D'OBSTACLE
    if (isDraggingObstaclePoint) {
      // Sauvegarder TOUS les obstacles modifiés
      const obstacleIdsToUpdate = new Set<string>();
      if (selectedObstacleIds.length > 0) selectedObstacleIds.forEach(id => obstacleIdsToUpdate.add(id));
      connectedPoints.forEach(cp => obstacleIdsToUpdate.add(cp.obstacleId));

      for (const obsId of obstacleIdsToUpdate) {
        const obstacle = obstacles.find(o => o.id === obsId);
        if (obstacle) {
          await updateObstacle(obsId, obstacle.points);
        }
      }

      setIsDraggingObstaclePoint(false);
      setDraggedPointIndex(null);
      setDraggedObstacleOriginalPointsState([]);
      setConnectedPoints([]);
      setDragStartPos(null);
      return;
    }

    // END DRAG MUSIC ZONE (MULTI)
    if (isDraggingMusicZone && draggedMusicZoneId) {
      setIsDraggingMusicZone(false);

      // Check if it was a click (distance < 5px)
      const start = mouseClickStartRef.current;
      if (isMJ && start) {
        // rect is top-left of canvas
        // current mouse clientX/Y
        // Wait, handleCanvasMouseUp doesn't get "e" passed in usually?
        // Ah, it relies on window mouse up listeners or current state?
        // Actually in this file handleCanvasMouseUp is detached from event object in some versions?
        // Let's check signature. It is `const handleCanvasMouseUp = async () => {`
        // So we don't have `e.clientX`.
        // We need to store `dragStart` which is clientX/Y.
      }

      // Better approach: Calculate distance moved from dragStart
      if (dragStart.x !== 0 && dragStart.y !== 0) {
        // We have mouse tracker?
        // Actually we rely on `draggedMusicZonesOriginalPositions`.
        // If no movement happened, we can detect it by comparing current pos with original pos.
        // But that's hard if we don't have current mouse pos here.

        // Let's use a flag isDragging that is set to true only after moving > threshold in MouseMove?
        // Or check if positions changed.

        const zone = musicZones.find(z => z.id === draggedMusicZoneId);
        const originalPos = draggedMusicZonesOriginalPositions.find(p => p.id === draggedMusicZoneId);

        if (zone && originalPos) {
          const dx = zone.x - originalPos.x;
          const dy = zone.y - originalPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 1 && isMJ) {
            // Considered a CLICK
            setContextMenuMusicZoneId(zone.id);
            setContextMenuMusicZoneOpen(true);
          } else {
            // Real drag, save positions
            draggedMusicZonesOriginalPositions.forEach(originalPos => {
              const z = musicZones.find(zz => zz.id === originalPos.id);
              if (z) {
                updateMusicZonePosition(z.id, z.x, z.y);
              }
            });
          }
        }
      } else {
        // If dragStart was 0? Should not happen if isDraggingMusicZone is true.
      }

      setDraggedMusicZoneId(null);
      setDraggedMusicZonesOriginalPositions([]);
      setDragStart({ x: 0, y: 0 }); // Clean up

      // Réinitialiser la sélection active après le drag
      resetActiveElementSelection();
      return;
    }

    // END RESIZE MUSIC ZONE


    // FIN DRAG LUMIÈRE
    if (isDraggingLight && draggedLightId) {
      if (roomId) {
        const light = lights.find(l => l.id === draggedLightId);
        if (light) {
          // Check if changed
          const hasChanged = light.x !== draggedLightOriginalPos.x || light.y !== draggedLightOriginalPos.y;
          if (hasChanged) {
            updateWithHistory(
              'lights',
              light.id,
              {
                x: light.x,
                y: light.y
              },
              `Déplacement de la source de lumière`
            ).catch(err => {
              console.error("Error saving light pos:", err);
              // Revert
              setLights(prev => prev.map(l => l.id === draggedLightId ? { ...l, x: draggedLightOriginalPos.x, y: draggedLightOriginalPos.y } : l));
            });
          }
        }
      }
      setIsDraggingLight(false);
      setDraggedLightId(null);

      // Réinitialiser la sélection active après le drag
      resetActiveElementSelection();
      return;
    }

    //  FIN DRAG PORTAL
    if (isDraggingPortal && draggedPortalId) {
      if (roomId) {
        const portal = portals.find(p => p.id === draggedPortalId);
        if (portal) {
          // Update the dragged portal's position
          updateDoc(doc(db, 'cartes', roomId, 'portals', portal.id), {
            x: portal.x,
            y: portal.y
          }).catch(err => {
            console.error("Error saving portal pos:", err);
          });

          // For same-map portals: update the twin portal's targetX/targetY
          if (portal.portalType === 'same-map' && portal.targetX !== undefined && portal.targetY !== undefined) {
            // Store in local constants for TypeScript
            const portalTargetX = portal.targetX;
            const portalTargetY = portal.targetY;

            // The twin portal is located at (portal.targetX, portal.targetY)
            // and its targetX/targetY should point to the original position (draggedPortalOriginalPos)
            const twinPortal = portals.find(p =>
              p.id !== portal.id &&
              p.portalType === 'same-map' &&
              p.targetX !== undefined &&
              p.targetY !== undefined &&
              Math.abs(p.x - portalTargetX) < 0.1 &&
              Math.abs(p.y - portalTargetY) < 0.1 &&
              Math.abs(p.targetX - draggedPortalOriginalPos.x) < 0.1 &&
              Math.abs(p.targetY - draggedPortalOriginalPos.y) < 0.1 &&
              (!p.cityId || p.cityId === selectedCityId)
            );

            if (twinPortal) {
              // Update the twin's target to point to the new position of the dragged portal
              updateDoc(doc(db, 'cartes', roomId, 'portals', twinPortal.id), {
                targetX: portal.x,
                targetY: portal.y
              }).catch(err => {
                console.error("Error updating twin portal target:", err);
              });
            }
          }
        }
      }
      setIsDraggingPortal(false);
      setDraggedPortalId(null);
      setDraggedPortalOriginalPos({ x: 0, y: 0 }); // Reset

      // Réinitialiser la sélection active après le drag
      resetActiveElementSelection();
      return;
    }

    if (isResizingMusicZone && resizingMusicZoneId && roomId) {
      setIsResizingMusicZone(false);

      // A. Character Audio Zone
      if (resizingMusicZoneId.startsWith('char-')) {
        const charId = resizingMusicZoneId.replace('char-', '');
        const char = characters.find(c => c.id === charId);
        if (char && char.audio) {
          updateDoc(doc(db, 'cartes', roomId, 'characters', charId), {
            'audio.radius': char.audio.radius
          }).catch(err => console.error("Error saving character audio radius:", err));
        }
      }
      // B. Standard Music Zone
      else {
        const zone = musicZones.find(z => z.id === resizingMusicZoneId);
        if (zone) {
          updateDoc(doc(db, 'cartes', roomId, 'musicZones', resizingMusicZoneId), {
            radius: zone.radius
          }).catch(err => console.error("Error saving music zone radius:", err));
        }
      }

      setResizingMusicZoneId(null);
      return;
    }
    // FIN DU DRAG OBSTACLE ENTIER


    //  FIN RESIZE DESSIN
    if (isResizingDrawing && selectedDrawingIndex !== null) {
      const drawing = drawings[selectedDrawingIndex];
      if (roomId) {
        try {
          await updateRtdbWithHistory('drawings', drawing.id, { points: drawing.points }, 'Redimensionnement du tracé');
        } catch (error) {
          console.error("Error saving resize:", error);
        }
      }
      setIsResizingDrawing(false);
      setDraggedHandleIndex(null);
      return;
    }

    //  FIN DU DRAG & DROP DESSIN
    if (isDraggingDrawing && selectedDrawingIndex !== null) {
      const drawing = drawings[selectedDrawingIndex];
      // Check if actually moved
      const originalPoints = draggedDrawingOriginalPoints;
      // Simple check on first point (assuming rigid body)
      if (drawing.points && originalPoints && drawing.points.length > 0 && originalPoints.length > 0 &&
        (drawing.points[0].x !== originalPoints[0].x || drawing.points[0].y !== originalPoints[0].y)) {

        if (roomId) {
          try {
            await updateRtdbWithHistory('drawings', drawing.id, { points: drawing.points }, 'Déplacement du tracé');
          } catch (error) {
            console.error("Error updating drawing position:", error);
            // Revert ?
          }
        }
      }
      setIsDraggingDrawing(false);
      return;
    }

    //  FIN DU DRAG & DROP OBSTACLE (MULTI)
    if (isDraggingObstacle && draggedObstaclesOriginalPoints.length > 0 && roomId) {
      try {
        // Update ALL selected obstacles in Firebase
        const updatePromises = draggedObstaclesOriginalPoints.map(async (originalObs) => {
          const currentObs = obstacles.find(o => o.id === originalObs.id);
          if (!currentObs) return;

          // Check if points actually changed
          const hasChanged = JSON.stringify(currentObs.points) !== JSON.stringify(originalObs.points);

          if (hasChanged) {
            await updateRtdbWithHistory(
              'obstacles',
              currentObs.id,
              { points: currentObs.points },
              `Déplacement de l'obstacle${selectedObstacleIds.length > 1 ? ` (${selectedObstacleIds.length} obstacles)` : ''}`
            );
          }
        });

        await Promise.all(updatePromises);
      } catch (e) {
        console.error("Error saving obstacles:", e);
        // Revert to original positions on error
        setObstacles(prev => prev.map(o => {
          const originalObs = draggedObstaclesOriginalPoints.find(orig => orig.id === o.id);
          return originalObs ? { ...o, points: originalObs.points } : o;
        }));
      }

      setIsDraggingObstacle(false);
      setDraggedObstacleId(null);
      setDraggedObstacleOriginalPointsState([]);
      setDraggedObstaclesOriginalPoints([]);
      // Clear Refs
      dragStartPosRef.current = null;
      draggedObstacleOriginalPointsRef.current = [];
      return;
    }


    //  FIN DU DRAG BROUILLARD
    if (isFogDragging) {
      setIsFogDragging(false);
      // FLUSH UPDATES TO FIREBASE
      await flushFogUpdates();
      return;
    }

    //  FIN DU DRAG & DROP NOTE - Priorité élevée
    if (isDraggingNote && draggedNoteIndex !== null) {
      const draggedNote = notes[draggedNoteIndex];

      // Vérifier si la position a vraiment changé
      const hasChanged = draggedNote.x !== draggedNoteOriginalPos.x ||
        draggedNote.y !== draggedNoteOriginalPos.y;

      if (hasChanged && roomId && draggedNote?.id) {
        try {
          // Sauvegarder la nouvelle position en Firebase
          await updateRtdbWithHistory(
            'notes',
            draggedNote.id,
            {
              x: draggedNote.x,
              y: draggedNote.y
            },
            `Déplacement de la note "${draggedNote.text?.substring(0, 30) || 'Sans titre'}${draggedNote.text && draggedNote.text.length > 30 ? '...' : ''}"`
          );
        } catch (error) {
          console.error("Erreur lors de la sauvegarde du déplacement de la note:", error);
          // Remettre à la position originale en cas d'erreur
          setNotes(prev => prev.map((note, index) => {
            if (index === draggedNoteIndex) {
              return { ...note, x: draggedNoteOriginalPos.x, y: draggedNoteOriginalPos.y };
            }
            return note;
          }));
        }
      }

      // Nettoyer les états de drag
      setIsDraggingNote(false);
      setDraggedNoteIndex(null);
      setDraggedNoteOriginalPos({ x: 0, y: 0 });
      return;
    }

    if (isDraggingObject && draggedObjectIndex !== null && draggedObjectsOriginalPositions.length > 0) {
      // Sauvegarder les données nécessaires AVANT de nettoyer l'état du drag
      const savedOriginalPositions = [...draggedObjectsOriginalPositions];
      const savedDragStart = { ...dragStart };

      // Nettoyer l'état du drag IMMÉDIATEMENT (avant les opérations async)
      // Empêche le mousemove de continuer à déplacer l'objet pendant le save Firebase
      setIsDraggingObject(false);
      setDraggedObjectIndex(null);
      setDraggedObjectsOriginalPositions([]);
      resetActiveElementSelection();

      if (roomId) {
        try {
          const updatePromises = savedOriginalPositions.map(async (originalPos) => {
            const currentObj = objects[originalPos.index];

            let finalX = currentObj.x;
            let finalY = currentObj.y;

            // Calculate final coordinates accurately using the mouse event to bypass stale React state
            if (e && bgCanvasRef.current && bgImageObject) {
              const rect = bgCanvasRef.current.getBoundingClientRect();
              const containerWidth = containerRef.current?.clientWidth || rect.width;
              const containerHeight = containerRef.current?.clientHeight || rect.height;
              const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImageObject);
              const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
              const scaledWidth = imgWidth * scale * zoom;
              const scaledHeight = imgHeight * scale * zoom;

              const clientX = e.clientX ?? (e.changedTouches ? e.changedTouches[0].clientX : 0);
              const clientY = e.clientY ?? (e.changedTouches ? e.changedTouches[0].clientY : 0);

              if (clientX && clientY) {
                const currentX = ((clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                const currentY = ((clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                const deltaX = currentX - savedDragStart.x;
                const deltaY = currentY - savedDragStart.y;
                finalX = originalPos.x + deltaX;
                finalY = originalPos.y + deltaY;
              }
            }

            const hasChanged = finalX !== originalPos.x || finalY !== originalPos.y;

            if (hasChanged && currentObj?.id) {
              // Passer knownPreviousData pour éviter le getDoc serveur
              // qui peut déclencher onSnapshot avec les anciennes positions
              await updateWithHistory(
                'objects',
                currentObj.id,
                {
                  x: finalX,
                  y: finalY
                },
                `Déplacement de l'objet${currentObj.name ? ` "${currentObj.name}"` : ''}`,
                { x: originalPos.x, y: originalPos.y }
              );
            }
          });

          await Promise.all(updatePromises);
        } catch (e) {
          console.error("Error saving object pos:", e);
          // Revert on error
          setObjects(prev => prev.map((obj, index) => {
            const originalPos = savedOriginalPositions.find(pos => pos.index === index);
            if (originalPos) {
              return { ...obj, x: originalPos.x, y: originalPos.y };
            }
            return obj;
          }));
        }
      }
      return;
    }

    //  FIN DU DRAG & DROP PERSONNAGE(S) - Priorité élevée -> RTDB
    if (isDraggingCharacter && draggedCharacterIndex !== null && draggedCharactersOriginalPositions.length > 0) {
      try {
        // Sauvegarder toutes les nouvelles positions en RTDB (au lieu de Firestore)
        const updatePromises = draggedCharactersOriginalPositions.map(async (originalPos) => {
          const currentChar = characters[originalPos.index];
          const hasChanged = currentChar.x !== originalPos.x || currentChar.y !== originalPos.y;

          if (hasChanged && roomId && currentChar?.id) {
            if (selectedCityId) {
              // Mode Ville : Sauvegarder dans RTDB positions/{charId}/positions/{cityId}
              await setCityPositionWithHistory(
                currentChar.id,
                selectedCityId,
                { x: currentChar.x, y: currentChar.y },
                `Déplacement de "${currentChar.name}"`
              );
            } else {
              // Mode World Map : Sauvegarder dans RTDB positions/{charId}
              await updatePositionWithHistory(
                currentChar.id,
                { x: currentChar.x, y: currentChar.y },
                `Déplacement de "${currentChar.name}"`
              );
            }
            return `${currentChar.name}: (${Math.round(currentChar.x)}, ${Math.round(currentChar.y)})`;
          }
          return null;
        });

        await Promise.all(updatePromises);
      } catch (error) {
        console.error("Erreur lors de la sauvegarde du déplacement:", error);
        // Remettre aux positions originales en cas d'erreur
        setCharacters(prev => prev.map((char, index) => {
          const originalPos = draggedCharactersOriginalPositions.find(pos => pos.index === index);
          if (originalPos) {
            return { ...char, x: originalPos.x, y: originalPos.y };
          }
          return char;
        }));
      }

      // Nettoyer les états de drag
      setIsDraggingCharacter(false);
      setDraggedCharacterIndex(null);

      setDraggedCharactersOriginalPositions([]);

      // Réinitialiser la sélection active après le drag
      resetActiveElementSelection();
      return;
    }

    //  FIN DE SÉLECTION PAR ZONE
    if (isSelectingArea && selectionStart && selectionEnd) {
      const minX = Math.min(selectionStart.x, selectionEnd.x);
      const maxX = Math.max(selectionStart.x, selectionEnd.x);
      const minY = Math.min(selectionStart.y, selectionEnd.y);
      const maxY = Math.max(selectionStart.y, selectionEnd.y);

      // Helper for AABB collision
      const isInRect = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;

      // 1. Find Characters
      const selectedChars = characters
        .map((char, index) => isInRect(char.x, char.y) ? index : null)
        .filter((i): i is number => i !== null);

      // 2. Find Objects (Center point)
      const selectedObjs = objects
        .map((obj, index) => {
          if (obj.isBackground && !isBackgroundEditMode) return null;
          return isInRect(obj.x + obj.width / 2, obj.y + obj.height / 2) ? index : null;
        })
        .filter((i): i is number => i !== null);

      // 3. Find Notes
      const selectedNotes = notes
        .map((note, index) => isInRect(note.x, note.y) ? index : null)
        .filter((i): i is number => i !== null);

      // 4. Find Drawings (First point approximation for now)
      const selectedDrawings = drawings
        .map((drawing, index) => (drawing.points && drawing.points.length > 0 && isInRect(drawing.points[0].x, drawing.points[0].y)) ? index : null)
        .filter((i): i is number => i !== null);

      // 5. Find Obstacles (Any point inside)
      const selectedObstacles = obstacles
        .map((obs) => {
          const hasPointInRect = obs.points.some(p => isInRect(p.x, p.y));
          return hasPointInRect ? obs.id : null;
        })
        .filter((id): id is string => id !== null);

      // 6. Find Music Zones (center point)
      const selectedMusicZonesIds = musicZones
        .map((zone) => isInRect(zone.x, zone.y) ? zone.id : null)
        .filter((id): id is string => id !== null);

      // 7. Find Light Sources (center point, current city only)
      const selectedLightsIds = lights
        .map((light) => {
          // Filter by current city/scene
          if (light.cityId && light.cityId !== selectedCityId) return null;
          return isInRect(light.x, light.y) ? light.id : null;
        })
        .filter((id): id is string => id !== null);

      // 8. Find Portals (center point, current city only)
      const selectedPortalsIds = portals
        .map((portal) => {
          // Filter by current city/scene
          if (portal.cityId && portal.cityId !== selectedCityId) return null;
          return isInRect(portal.x, portal.y) ? portal.id : null;
        })
        .filter((id): id is string => id !== null);

      // 9. Find Fog Cells in selection area (MJ only)
      const selectedFogCellKeys: string[] = [];
      if (isMJ && (fogGrid.size > 0 || fullMapFog)) {
        // Calculate which fog cells are in the selection rectangle
        const minCellX = Math.floor(minX / fogCellSize);
        const maxCellX = Math.ceil(maxX / fogCellSize);
        const minCellY = Math.floor(minY / fogCellSize);
        const maxCellY = Math.ceil(maxY / fogCellSize);

        for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
          for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
            const cellKey = `${cellX},${cellY}`;
            // Check if this cell has fog
            const hasFog = fullMapFog ? !fogGrid.has(cellKey) : fogGrid.has(cellKey);

            if (hasFog) {
              // Check if cell's center is in the selection rectangle
              const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
              const cellCenterY = cellY * fogCellSize + fogCellSize / 2;

              if (isInRect(cellCenterX, cellCenterY)) {
                selectedFogCellKeys.push(cellKey);
              }
            }
          }
        }
      }

      const totalFound =
        selectedChars.length +
        selectedObjs.length +
        selectedNotes.length +
        selectedDrawings.length +
        selectedObstacles.length +
        selectedMusicZonesIds.length +
        selectedLightsIds.length +
        selectedPortalsIds.length +
        selectedFogCellKeys.length;

      if (totalFound === 0) {
        // Clear all selections
        setSelectedCharacters([]);
        setSelectedObjectIndices([]);
        setSelectedNoteIndex(null);
        setSelectedDrawingIndex(null);
        setSelectedObstacleIds([]);
        setSelectedMusicZoneIds([]);
        setSelectedLightIds([]);
        setSelectedPortalIds([]);
        setSelectedFogCells([]);
      } else {
        const candidates: SelectionCandidates = {
          characters: selectedChars,
          objects: selectedObjs,
          notes: selectedNotes,
          drawings: selectedDrawings,
          obstacles: selectedObstacles,
          musicZones: selectedMusicZonesIds,
          fogCells: selectedFogCellKeys,
          lights: selectedLightsIds,
          portals: selectedPortalsIds
        };

        // Determine if we need to show the menu
        const typesFound = [
          selectedChars.length > 0,
          selectedObjs.length > 0,
          selectedNotes.length > 0,
          selectedDrawings.length > 0,
          selectedObstacles.length > 0,
          selectedMusicZonesIds.length > 0,
          selectedFogCellKeys.length > 0,
          selectedLightsIds.length > 0,
          selectedPortalsIds.length > 0
        ].filter(Boolean).length;

        if (typesFound > 1) {
          // Mixed selection -> Show Menu
          setSelectionCandidates(candidates);
          // Calculate screen position for menu
          if (rect && containerRef.current) {
            setMenuPosition({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 });
            setShowSelectionMenu(true);
          }
        } else {
          // Single type found -> Select immediately
          if (selectedChars.length > 0) setSelectedCharacters(selectedChars);
          else setSelectedCharacters([]); // Clear others

          setSelectedObjectIndices(selectedObjs);

          if (selectedNotes.length > 0) setSelectedNoteIndex(selectedNotes[0]);
          else setSelectedNoteIndex(null);

          if (selectedDrawings.length > 0) setSelectedDrawingIndex(selectedDrawings[0]);
          else setSelectedDrawingIndex(null);

          if (selectedObstacles.length > 0) setSelectedObstacleIds(selectedObstacles);
          else setSelectedObstacleIds([]);

          if (selectedMusicZonesIds.length > 0) setSelectedMusicZoneIds(selectedMusicZonesIds);
          else setSelectedMusicZoneIds([]);

          if (selectedLightsIds.length > 0) setSelectedLightIds(selectedLightsIds);
          else setSelectedLightIds([]);

          if (selectedPortalsIds.length > 0) setSelectedPortalIds(selectedPortalsIds);
          else setSelectedPortalIds([]);

          // Set selected fog cells
          if (selectedFogCellKeys.length > 0) setSelectedFogCells(selectedFogCellKeys);
          else setSelectedFogCells([]);
        }
      }

      setIsSelectingArea(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    // Fin du déplacement de carte (clic milieu OU mode pan avec clic gauche OU joueur sur zone vide)
    if (currentMouseButton === 1 || (currentMouseButton === 0 && (panMode || !isMJ))) {
      setIsDragging(false);
    }

    //  Fin du placement continu de brouillard (dans fogMode classique ou visibilityMode avec outil fog)
    if (isFogDragging && (fogMode || (isVisActive && currentVisibilityTool === 'fog'))) {
      setIsFogDragging(false);
      setIsFogAddMode(true);
      setLastFogCell(null);
      return;
    }

    //  Fin du mode dessin normal - Sauvegarder le tracé
    if (isDrawing && !fogMode && drawMode) {
      setIsDrawing(false);

      if ((typeof roomId === 'string' || typeof roomId === 'number') && String(roomId).trim() && currentPath.length > 0) {
        try {
          const newDrawingData = {
            points: currentPath,
            color: drawingColor,
            width: drawingSize,
            type: currentTool === 'eraser' ? 'pen' : currentTool,
            // AJOUT DU CITY ID
            cityId: selectedCityId
          };
          const newId = await addToRtdbWithHistory('drawings', newDrawingData, 'Ajout d\'un tracé');
          setDrawings(prev => [...prev, { ...newDrawingData, id: newId }]);
          setCurrentPath([]);
        } catch (error) {
          console.error("Erreur lors de la sauvegarde du tracé:", error);
          setCurrentPath([]);
        }
      } else {
        console.error("Erreur: roomId n'est pas une chaîne valide ou currentPath est vide.");
        setCurrentPath([]);
      }
      return;
    }
  }, [
    bgCanvasRef, containerRef, bgImageObject, zoom, offset,
    roomId, isMJ, selectedCityId,
    mouseButton, setMouseButton, mouseClickStartRef,
    isDragging, setIsDragging, dragStart, setDragStart, panMode,
    isCalibrating, measureMode, measureStart, measureEnd, currentMeasurementId,
    setCalibrationDialogOpen, setContextMenuMeasurementId, setContextMenuMeasurementOpen,
    setCurrentMeasurementId, setMeasureStart, setMeasureEnd,
    isDraggingEdge, draggedEdgeObstacleId,
    setIsDraggingEdge, setDraggedEdgeIndex, setDraggedEdgeObstacleId, setDraggedEdgeOriginalPoints,
    isResizingObject, resizeStartData,
    setIsResizingObject, setResizeStartData,
    isDraggingObstaclePoint, selectedObstacleIds, connectedPoints,
    setIsDraggingObstaclePoint, setDraggedPointIndex,
    setDraggedObstacleOriginalPointsState, setConnectedPoints, setDragStartPos,
    isDraggingMusicZone, draggedMusicZoneId, draggedMusicZonesOriginalPositions,
    setIsDraggingMusicZone, setDraggedMusicZoneId, setDraggedMusicZonesOriginalPositions,
    setContextMenuMusicZoneId, setContextMenuMusicZoneOpen,
    isDraggingLight, draggedLightId, draggedLightOriginalPos,
    setIsDraggingLight, setDraggedLightId,
    isDraggingPortal, draggedPortalId, draggedPortalOriginalPos,
    setIsDraggingPortal, setDraggedPortalId, setDraggedPortalOriginalPos,
    isResizingMusicZone, resizingMusicZoneId,
    setIsResizingMusicZone, setResizingMusicZoneId,
    isResizingDrawing, selectedDrawingIndex,
    setIsResizingDrawing, setDraggedHandleIndex,
    isDraggingDrawing, draggedDrawingOriginalPoints,
    setIsDraggingDrawing,
    isDraggingObstacle, draggedObstaclesOriginalPoints,
    setIsDraggingObstacle, setDraggedObstacleId,
    setDraggedObstaclesOriginalPoints,
    dragStartPosRef, draggedObstacleOriginalPointsRef,
    isFogDragging, setIsFogDragging, setIsFogAddMode, setLastFogCell,
    fogMode, isVisActive, currentVisibilityTool,
    isDraggingNote, draggedNoteIndex, draggedNoteOriginalPos,
    setIsDraggingNote, setDraggedNoteIndex, setDraggedNoteOriginalPos,
    isDraggingObject, draggedObjectIndex, draggedObjectsOriginalPositions,
    setIsDraggingObject, setDraggedObjectIndex, setDraggedObjectsOriginalPositions,
    isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions,
    setIsDraggingCharacter, setDraggedCharacterIndex, setDraggedCharactersOriginalPositions,
    isSelectingArea, selectionStart, selectionEnd,
    setIsSelectingArea, setSelectionStart, setSelectionEnd,
    isBackgroundEditMode,
    setSelectedCharacters, setSelectedObjectIndices, setSelectedNoteIndex,
    setSelectedDrawingIndex, setSelectedObstacleIds, setSelectedMusicZoneIds,
    setSelectedLightIds, setSelectedPortalIds, setSelectedFogCells,
    setSelectionCandidates, setMenuPosition, setShowSelectionMenu,
    fogGrid, fullMapFog, fogCellSize,
    isDrawing, setIsDrawing, drawMode,
    currentPath, setCurrentPath, drawingColor, drawingSize, currentTool,
    obstacles, characters, objects, notes, drawings, musicZones, lights, portals,
    setObstacles, setCharacters, setObjects, setNotes, setDrawings, setLights,
    updateObstacle, updateMusicZonePosition,
    updateWithHistory, updateRtdbWithHistory, addToRtdbWithHistory,
    updatePositionWithHistory, setCityPositionWithHistory,
    flushFogUpdates, resetActiveElementSelection,
  ]);

  return {
    handleCanvasMouseUp,
  };
}
