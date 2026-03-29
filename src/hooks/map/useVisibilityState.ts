"use client"

import { useState, useRef, useMemo, useCallback } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { useFogManager } from '@/app/[roomid]/map/shadows';
import type { Point, Character, LightSource } from '@/app/[roomid]/map/types';
import type { Obstacle, EdgeMeta } from '@/lib/visibility';
import type { UndoableAction } from '@/contexts/UndoRedoContext';

// ---- Types ----

export interface UseVisibilityStateProps {
  roomId: string;
  isMJ: boolean;
  selectedCityId: string | null;
  bgImageObject: HTMLImageElement | HTMLVideoElement | CanvasImageSource | null;
  getMediaDimensions: (media: HTMLImageElement | HTMLVideoElement | CanvasImageSource) => { width: number; height: number };
  playerViewMode: boolean;
  persoId: string | null;
  viewAsPersoId: string | null;
  charactersRef: Character[];
  lights: LightSource[];
  recordAction: (action: Omit<UndoableAction, 'timestamp'>) => void;
  // Callbacks for cross-deselection
  setSelectedCharacterIndex: (idx: number | null) => void;
  setSelectedObjectIndices: (indices: number[]) => void;
  setSelectedNoteIndex: (idx: number | null) => void;
  setSelectedDrawingIndex: (idx: number | null) => void;
  setDrawMode: (mode: boolean) => void;
}

// ---- Hook ----

export function useVisibilityState(props: UseVisibilityStateProps) {
  const {
    roomId,
    isMJ,
    selectedCityId,
    bgImageObject,
    getMediaDimensions,
    playerViewMode,
    persoId,
    viewAsPersoId,
    charactersRef,
    lights,
    recordAction,
    setSelectedCharacterIndex,
    setSelectedObjectIndices,
    setSelectedNoteIndex,
    setSelectedDrawingIndex,
    setDrawMode,
  } = props;

  // ===================== FOG STATE =====================
  const [visibilityRadius, setVisibilityRadius] = useState(100);
  const [fogMode, setFogMode] = useState(false);
  const [fogGrid, setFogGrid] = useState<Map<string, boolean>>(new Map());
  const [showFogGrid, setShowFogGrid] = useState(false);
  const [isFogDragging, setIsFogDragging] = useState(false);
  const [lastFogCell, setLastFogCell] = useState<string | null>(null);
  const [isFogAddMode, setIsFogAddMode] = useState(true);
  const [fullMapFog, setFullMapFog] = useState(false);
  const [selectedFogIndex, setSelectedFogIndex] = useState<number | null>(null);
  const [selectedFogCells, setSelectedFogCells] = useState<string[]>([]);

  const fogCellSize = useMemo(() => {
    if (!bgImageObject) return 100;
    const { width, height } = getMediaDimensions(bgImageObject);
    const minDimension = Math.min(width, height);
    return Math.round(minDimension / 20);
  }, [bgImageObject]);

  // ===================== OBSTACLE STATE =====================
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [visibilityMode, setVisibilityMode] = useState(false);
  const [currentVisibilityTool, setCurrentVisibilityTool] = useState<'fog' | 'chain' | 'edit' | 'none'>('none');
  const [isDrawingObstacle, setIsDrawingObstacle] = useState(false);
  const [currentObstaclePoints, setCurrentObstaclePoints] = useState<Point[]>([]);
  const [selectedObstacleIds, setSelectedObstacleIds] = useState<string[]>([]);
  const [shadowOpacity, setShadowOpacity] = useState<number>(1.0);
  const [isDraggingObstacle, setIsDraggingObstacle] = useState(false);
  const [draggedObstacleId, setDraggedObstacleId] = useState<string | null>(null);
  const [draggedObstacleOriginalPoints, setDraggedObstacleOriginalPoints] = useState<Point[]>([]);
  const [draggedObstaclesOriginalPoints, setDraggedObstaclesOriginalPoints] = useState<{ id: string; points: Point[] }[]>([]);
  const [isDraggingObstaclePoint, setIsDraggingObstaclePoint] = useState(false);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null);
  const [connectedPoints, setConnectedPoints] = useState<{ obstacleId: string; pointIndex: number }[]>([]);

  // Refs for high-frequency drag
  const draggedObstacleOriginalPointsRef = useRef<Point[]>([]);
  const dragStartPosRef = useRef<Point | null>(null);

  // Advanced obstacle types
  const [currentObstacleType, setCurrentObstacleType] = useState<'wall' | 'one-way-wall' | 'door'>('wall');
  const [isOneWayReversed, setIsOneWayReversed] = useState<boolean>(false);
  const [pendingEdges, setPendingEdges] = useState<EdgeMeta[]>([]);
  const [selectedEdgeIndex, setSelectedEdgeIndex] = useState<number | null>(null);
  const [isDraggingEdge, setIsDraggingEdge] = useState(false);
  const [draggedEdgeIndex, setDraggedEdgeIndex] = useState<number | null>(null);
  const [draggedEdgeObstacleId, setDraggedEdgeObstacleId] = useState<string | null>(null);
  const [draggedEdgeOriginalPoints, setDraggedEdgeOriginalPoints] = useState<Point[]>([]);

  // ===================== SHADOW REFS =====================
  const shadowTempCanvas = useRef<HTMLCanvasElement | null>(null);
  const shadowExteriorCanvas = useRef<HTMLCanvasElement | null>(null);

  // ===================== LIGHT =====================
  const [isLightPlacementMode, setIsLightPlacementMode] = useState(false);

  // ===================== FOG MANAGER =====================
  const {
    calculateFogOpacity,
    saveFogGrid,
    saveFullMapFog,
    toggleFogCell,
    addFogCellIfNew,
    flushFogUpdates,
  } = useFogManager({
    roomId,
    selectedCityId,
    fogGrid,
    setFogGrid,
    lastFogCell,
    setLastFogCell,
    fullMapFog,
    isMJ,
    playerViewMode,
    persoId,
    viewAsPersoId,
    characters: charactersRef,
    lights,
    fogCellSize,
  });

  // ===================== BUSINESS LOGIC =====================

  const toggleVisibilityMode = useCallback(() => {
    const newMode = !visibilityMode;
    setVisibilityMode(newMode);
    if (!newMode) {
      setIsDrawingObstacle(false);
      setCurrentObstaclePoints([]);
      setSelectedObstacleIds([]);
      setFogMode(false);
    } else {
      setSelectedCharacterIndex(null);
      setSelectedObjectIndices([]);
      setSelectedNoteIndex(null);
      setSelectedDrawingIndex(null);
    }
  }, [visibilityMode, setSelectedCharacterIndex, setSelectedObjectIndices, setSelectedNoteIndex, setSelectedDrawingIndex]);

  const saveFogGridWithHistory = useCallback(async (newGrid: Map<string, boolean>, description: string = 'Modification du brouillard') => {
    if (!roomId) return;
    const previousGrid = new Map(fogGrid);
    const fogDocId = selectedCityId ? `fog_${selectedCityId}` : 'fogData';
    await saveFogGrid(newGrid);
    recordAction({
      type: 'SET',
      collection: 'fog',
      documentId: fogDocId,
      roomId,
      previousData: { grid: Object.fromEntries(previousGrid) },
      newData: { grid: Object.fromEntries(newGrid) },
      description,
    });
  }, [roomId, fogGrid, selectedCityId, saveFogGrid, recordAction]);

  const handleFullMapFogChange = useCallback(async (newValue: boolean) => {
    setFullMapFog(newValue);
    if (roomId) {
      try {
        await saveFullMapFog(newValue);
        toast.success(newValue ? 'Brouillard complet activé' : 'Brouillard complet désactivé', {
          description: newValue ? 'Toute la carte est maintenant dans le brouillard.' : 'Le brouillard complet a été retiré.',
          duration: 2000,
        });
      } catch (error) {
        console.error('Erreur lors de la sauvegarde du mode brouillard complet:', error);
        toast.error('Erreur', {
          description: "Impossible de modifier le mode brouillard.",
          duration: 3000,
        });
      }
    }
  }, [roomId, saveFullMapFog]);

  const toggleFogMode = useCallback(() => {
    setFogMode(!fogMode);
    setSelectedCharacterIndex(null);
    setSelectedNoteIndex(null);
  }, [fogMode, setSelectedCharacterIndex, setSelectedNoteIndex]);

  const clearFog = useCallback(async () => {
    const emptyGrid = new Map<string, boolean>();
    setFogGrid(emptyGrid);
    if (roomId) {
      await saveFogGridWithHistory(emptyGrid, 'Suppression de la carte');
    }
  }, [roomId, saveFogGridWithHistory]);

  const updateShadowOpacity = useCallback(async (newOpacity: number) => {
    if (!roomId || !isMJ) return;
    setShadowOpacity(newOpacity);
    const settingsRef = doc(db, 'cartes', roomId, 'settings', 'general');
    await setDoc(settingsRef, { shadowOpacity: newOpacity }, { merge: true });
  }, [roomId, isMJ]);

  const buildEdgeMeta = useCallback((
    obstacleType: 'wall' | 'one-way-wall' | 'door',
    reversed: boolean,
    p1: Point,
    p2: Point
  ): EdgeMeta => {
    const meta: EdgeMeta = { type: obstacleType };
    if (obstacleType === 'one-way-wall') {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      let nx = dy;
      let ny = -dx;
      if (reversed) { nx = -nx; ny = -ny; }
      if (Math.abs(nx) > Math.abs(ny)) {
        meta.direction = nx > 0 ? 'east' : 'west';
      } else {
        meta.direction = ny > 0 ? 'south' : 'north';
      }
    }
    if (obstacleType === 'door') {
      meta.isOpen = false;
    }
    return meta;
  }, []);

  // ===================== RETURN =====================

  return {
    // Fog state
    visibilityRadius, setVisibilityRadius,
    fogMode, setFogMode,
    fogGrid, setFogGrid,
    showFogGrid, setShowFogGrid,
    isFogDragging, setIsFogDragging,
    lastFogCell, setLastFogCell,
    isFogAddMode, setIsFogAddMode,
    fullMapFog, setFullMapFog,
    selectedFogIndex, setSelectedFogIndex,
    selectedFogCells, setSelectedFogCells,
    fogCellSize,

    // Obstacle state
    obstacles, setObstacles,
    visibilityMode, setVisibilityMode,
    currentVisibilityTool, setCurrentVisibilityTool,
    isDrawingObstacle, setIsDrawingObstacle,
    currentObstaclePoints, setCurrentObstaclePoints,
    selectedObstacleIds, setSelectedObstacleIds,
    shadowOpacity, setShadowOpacity,
    isDraggingObstacle, setIsDraggingObstacle,
    draggedObstacleId, setDraggedObstacleId,
    draggedObstacleOriginalPoints, setDraggedObstacleOriginalPoints,
    draggedObstaclesOriginalPoints, setDraggedObstaclesOriginalPoints,
    isDraggingObstaclePoint, setIsDraggingObstaclePoint,
    draggedPointIndex, setDraggedPointIndex,
    dragStartPos, setDragStartPos,
    connectedPoints, setConnectedPoints,

    // Refs
    draggedObstacleOriginalPointsRef,
    dragStartPosRef,

    // Advanced obstacle types
    currentObstacleType, setCurrentObstacleType,
    isOneWayReversed, setIsOneWayReversed,
    pendingEdges, setPendingEdges,
    selectedEdgeIndex, setSelectedEdgeIndex,
    isDraggingEdge, setIsDraggingEdge,
    draggedEdgeIndex, setDraggedEdgeIndex,
    draggedEdgeObstacleId, setDraggedEdgeObstacleId,
    draggedEdgeOriginalPoints, setDraggedEdgeOriginalPoints,

    // Shadow refs
    shadowTempCanvas,
    shadowExteriorCanvas,

    // Light
    isLightPlacementMode, setIsLightPlacementMode,

    // Fog manager functions
    calculateFogOpacity,
    saveFogGrid,
    saveFullMapFog,
    toggleFogCell,
    addFogCellIfNew,
    flushFogUpdates,

    // Business logic
    toggleVisibilityMode,
    saveFogGridWithHistory,
    handleFullMapFogChange,
    toggleFogMode,
    clearFog,
    updateShadowOpacity,
    buildEdgeMeta,

    // Forwarded from parent
    setDrawMode,
  };
}

export type VisibilityState = ReturnType<typeof useVisibilityState>;
