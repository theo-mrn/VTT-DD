"use client"

import { useCallback } from 'react';
import { doc, collection, updateDoc, addDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import { getCellKey, isCellInFog } from '@/app/[roomid]/map/shadows';
import { isPointOnDrawing, getResizeHandles } from '@/app/[roomid]/map/drawings';
import type {
  Point,
  Character,
  LightSource,
  MapText,
  SavedDrawing,
  DrawingTool,
  MusicZone,
  Scene,
  Portal,
  LayerType,
} from '@/app/[roomid]/map/types';
import type { Obstacle, EdgeMeta } from '@/lib/visibility';
import type { SharedMeasurement, MeasurementShape } from '@/app/[roomid]/map/measurements';
import type { DetectedElement } from '@/components/(map)/ElementSelectionMenu';

// ---- Helper (copied from page.tsx bottom) ----

function pDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  var A = x - x1;
  var B = y - y1;
  var C = x2 - x1;
  var D = y2 - y1;

  var dot = A * C + B * D;
  var len_sq = C * C + D * D;
  var param = -1;
  if (len_sq != 0)
    param = dot / len_sq;

  var xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  }
  else if (param > 1) {
    xx = x2;
    yy = y2;
  }
  else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  var dx = x - xx;
  var dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---- Types ----

export interface UseCanvasMouseDownParams {
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
  persoId: string | null;
  userId: string | null;
  selectedCityId: string | null;

  // Player view
  playerViewMode: boolean;
  viewAsPersoId: string | null;

  // Data arrays
  characters: Character[];
  notes: MapText[];
  drawings: SavedDrawing[];
  obstacles: Obstacle[];
  musicZones: MusicZone[];
  measurements: SharedMeasurement[];
  lights: LightSource[];

  // Fog state
  fogGrid: Map<string, boolean>;
  fogCellSize: number;
  fullMapFog: boolean;
  fogMode: boolean;

  // Visibility state
  visibilityMode: boolean;
  isVisActive: boolean;
  currentVisibilityTool: string;
  isDrawingObstacle: boolean;
  currentObstaclePoints: Point[];
  snapPoint: Point | null;
  pendingEdges: EdgeMeta[];
  selectedObstacleIds: string[];

  // Mode state
  isLightPlacementMode: boolean;
  portalMode: boolean;
  portalPlacementMode: 'scene-change' | 'same-map' | null;
  firstPortalPoint: Point | null;
  firstPortalId: string | null;
  spawnPointMode: boolean;
  currentScene: Scene | null;
  isMusicMode: boolean;
  selectedMusicZoneIds: string[];
  measureMode: boolean;
  measureStart: Point | null;
  measureEnd: Point | null;
  measurementShape: MeasurementShape;
  currentMeasurementId: string | null;
  coneWidth: number | undefined;
  coneAngle: number;
  coneShape: 'flat' | 'rounded';
  selectedSkin: string;
  isPermanent: boolean;
  unitName: string;
  panMode: boolean;
  drawMode: boolean;
  currentTool: DrawingTool;
  drawingSize: number;
  multiSelectMode: boolean;
  showAllBadges: boolean;

  // Active element detection
  activeElementType: 'light' | 'portal' | 'musicZone' | 'character' | 'object' | null;
  activeElementId: string | null;

  // Selection state
  selectedCharacterIndex: number | null;
  selectedCharacters: number[];
  selectedNoteIndex: number | null;
  selectedDrawingIndex: number | null;
  selectedObjectIndices: number[];
  selectedFogCells: string[];

  // Refs
  mouseClickStartRef: React.MutableRefObject<{ x: number; y: number } | null>;
  dragStartPosRef: React.MutableRefObject<{ x: number; y: number } | null>;

  // Setters - mouse/drag
  setMouseButton: (v: number | null) => void;
  setIsDragging: (v: boolean) => void;
  setDragStart: (v: { x: number; y: number }) => void;

  // Setters - light placement
  setIsLightPlacementMode: (v: boolean) => void;

  // Setters - portal
  setNewPortalPos: (v: Point | null) => void;
  setEditingPortal: (v: Portal | null) => void;
  setShowPortalConfig: (v: boolean) => void;
  setFirstPortalPoint: (v: Point | null) => void;
  setFirstPortalId: (v: string | null) => void;

  // Setters - spawn point
  setSpawnPointMode: (v: boolean) => void;
  setCurrentScene: (v: Scene | null) => void;

  // Setters - music
  setNewMusicZonePos: (v: Point | null) => void;
  setShowMusicDialog: (v: boolean) => void;
  setIsDraggingMusicZone: (v: boolean) => void;
  setDraggedMusicZoneId: (v: string | null) => void;
  setDraggedMusicZonesOriginalPositions: (v: { id: string; x: number; y: number }[]) => void;
  setIsResizingMusicZone: (v: boolean) => void;
  setResizingMusicZoneId: (v: string | null) => void;
  setSelectedMusicZoneIds: React.Dispatch<React.SetStateAction<string[]>>;

  // Setters - fog
  setIsFogDragging: (v: boolean) => void;
  setLastFogCell: (v: string | null) => void;
  setIsFogAddMode: (v: boolean) => void;
  setSelectedFogCells: React.Dispatch<React.SetStateAction<string[]>>;

  // Setters - measurement
  setMeasureStart: (v: Point | null) => void;
  setMeasureEnd: (v: Point | null) => void;
  setIsMeasurementPanelOpen: (v: boolean) => void;
  setCurrentMeasurementId: (v: string | null) => void;
  setContextMenuMeasurementId: (v: string | null) => void;
  setContextMenuMeasurementOpen: (v: boolean) => void;

  // Setters - visibility / obstacles
  setSelectedObstacleIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsDrawingObstacle: (v: boolean) => void;
  setCurrentObstaclePoints: React.Dispatch<React.SetStateAction<Point[]>>;
  setPendingEdges: React.Dispatch<React.SetStateAction<EdgeMeta[]>>;
  setIsDraggingObstaclePoint: (v: boolean) => void;
  setDraggedPointIndex: (v: number | null) => void;
  setDraggedObstacleOriginalPoints: (v: Point[]) => void;
  setConnectedPoints: (v: { obstacleId: string; pointIndex: number }[]) => void;
  setDragStartPos: (v: Point) => void;
  setIsDraggingObstacle: (v: boolean) => void;
  setDraggedObstacleId: (v: string | null) => void;
  setDraggedObstaclesOriginalPoints: (v: { id: string; points: Point[] }[]) => void;

  // Setters - character
  setSelectedCharacterIndex: (v: number | null) => void;
  setSelectedCharacters: React.Dispatch<React.SetStateAction<number[]>>;
  setIsDraggingCharacter: (v: boolean) => void;
  setDraggedCharacterIndex: (v: number | null) => void;
  setDraggedCharactersOriginalPositions: (v: { index: number; x: number; y: number }[]) => void;
  setVisibleBadges: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Setters - note
  setSelectedNoteIndex: (v: number | null) => void;
  setIsDraggingNote: (v: boolean) => void;
  setDraggedNoteIndex: (v: number | null) => void;
  setDraggedNoteOriginalPos: (v: { x: number; y: number }) => void;

  // Setters - drawing
  setSelectedDrawingIndex: (v: number | null) => void;
  setIsDraggingDrawing: (v: boolean) => void;
  setDraggedDrawingOriginalPoints: (v: Point[]) => void;
  setIsResizingDrawing: (v: boolean) => void;
  setDraggedHandleIndex: (v: number | null) => void;

  // Setters - general drawing
  setIsDrawing: (v: boolean) => void;
  setCurrentPath: (v: Point[]) => void;
  setDrawings: React.Dispatch<React.SetStateAction<SavedDrawing[]>>;

  // Setters - object
  setSelectedObjectIndices: (v: number[]) => void;

  // Setters - fog selection
  setSelectedFogIndex: (v: number | null) => void;

  // Setters - context menu
  setContextMenuOpen: (v: boolean) => void;
  setContextMenuCharacterId: (v: string | null) => void;

  // Setters - selection area
  setSelectionStart: (v: Point | null) => void;
  setIsSelectingArea: (v: boolean) => void;

  // Setters - element detection
  setDetectedElements: (v: DetectedElement[]) => void;
  setSelectionMenuPosition: (v: { x: number; y: number }) => void;
  setShowElementSelectionMenu: (v: boolean) => void;

  // Callbacks
  addFogCellIfNew: (x: number, y: number, addMode: boolean) => Promise<void>;
  saveObstacle: (
    type: 'wall' | 'polygon' | 'one-way-wall' | 'door' | 'window',
    points: Point[],
    additionalProps?: {
      direction?: 'north' | 'south' | 'east' | 'west';
      isOpen?: boolean;
      edges?: EdgeMeta[];
    }
  ) => Promise<void>;
  deleteFromRtdbWithHistory: (
    collectionName: string,
    docId: string,
    description?: string
  ) => Promise<void>;
  isCharacterVisibleToUser: (char: Character) => boolean;
  isLayerVisible: (layerId: LayerType) => boolean;
  detectElementsAtPosition: (clickX: number, clickY: number) => DetectedElement[];
  clearFocus: () => void;
}

export interface UseCanvasMouseDownReturn {
  handleCanvasMouseDown: (e: React.MouseEvent<Element>) => Promise<void>;
  handleCanvasDoubleClick: (e: React.MouseEvent<Element>) => void;
}

// ---- Hook ----

export function useCanvasMouseDown(params: UseCanvasMouseDownParams): UseCanvasMouseDownReturn {
  const {
    bgCanvasRef,
    containerRef,
    bgImageObject,
    zoom,
    offset,
    roomId,
    isMJ,
    persoId,
    userId,
    selectedCityId,
    playerViewMode,
    viewAsPersoId,
    characters,
    notes,
    drawings,
    obstacles,
    musicZones,
    measurements,
    lights,
    fogGrid,
    fogCellSize,
    fullMapFog,
    fogMode,
    visibilityMode,
    isVisActive,
    currentVisibilityTool,
    isDrawingObstacle,
    currentObstaclePoints,
    snapPoint,
    pendingEdges,
    selectedObstacleIds,
    isLightPlacementMode,
    portalMode,
    portalPlacementMode,
    firstPortalPoint,
    firstPortalId,
    spawnPointMode,
    currentScene,
    isMusicMode,
    selectedMusicZoneIds,
    measureMode,
    measureStart,
    measureEnd,
    measurementShape,
    currentMeasurementId,
    coneWidth,
    coneAngle,
    coneShape,
    selectedSkin,
    isPermanent,
    unitName,
    panMode,
    drawMode,
    currentTool,
    drawingSize,
    multiSelectMode,
    showAllBadges,
    activeElementType,
    activeElementId,
    selectedCharacterIndex,
    selectedCharacters,
    selectedNoteIndex,
    selectedDrawingIndex,
    selectedObjectIndices,
    selectedFogCells,
    mouseClickStartRef,
    dragStartPosRef,
    setMouseButton,
    setIsDragging,
    setDragStart,
    setIsLightPlacementMode,
    setNewPortalPos,
    setEditingPortal,
    setShowPortalConfig,
    setFirstPortalPoint,
    setFirstPortalId,
    setSpawnPointMode,
    setCurrentScene,
    setNewMusicZonePos,
    setShowMusicDialog,
    setIsDraggingMusicZone,
    setDraggedMusicZoneId,
    setDraggedMusicZonesOriginalPositions,
    setIsResizingMusicZone,
    setResizingMusicZoneId,
    setSelectedMusicZoneIds,
    setIsFogDragging,
    setLastFogCell,
    setIsFogAddMode,
    setSelectedFogCells,
    setMeasureStart,
    setMeasureEnd,
    setIsMeasurementPanelOpen,
    setCurrentMeasurementId,
    setContextMenuMeasurementId,
    setContextMenuMeasurementOpen,
    setSelectedObstacleIds,
    setIsDrawingObstacle,
    setCurrentObstaclePoints,
    setPendingEdges,
    setIsDraggingObstaclePoint,
    setDraggedPointIndex,
    setDraggedObstacleOriginalPoints,
    setConnectedPoints,
    setDragStartPos,
    setIsDraggingObstacle,
    setDraggedObstacleId,
    setDraggedObstaclesOriginalPoints,
    setSelectedCharacterIndex,
    setSelectedCharacters,
    setIsDraggingCharacter,
    setDraggedCharacterIndex,
    setDraggedCharactersOriginalPositions,
    setVisibleBadges,
    setSelectedNoteIndex,
    setIsDraggingNote,
    setDraggedNoteIndex,
    setDraggedNoteOriginalPos,
    setSelectedDrawingIndex,
    setIsDraggingDrawing,
    setDraggedDrawingOriginalPoints,
    setIsResizingDrawing,
    setDraggedHandleIndex,
    setIsDrawing,
    setCurrentPath,
    setDrawings,
    setSelectedObjectIndices,
    setSelectedFogIndex,
    setContextMenuOpen,
    setContextMenuCharacterId,
    setSelectionStart,
    setIsSelectingArea,
    setDetectedElements,
    setSelectionMenuPosition,
    setShowElementSelectionMenu,
    addFogCellIfNew,
    saveObstacle,
    deleteFromRtdbWithHistory,
    isCharacterVisibleToUser,
    isLayerVisible,
    detectElementsAtPosition,
    clearFocus,
  } = params;

  // ---------------------------------------------------------
  // handleCanvasMouseDown
  // ---------------------------------------------------------
  const handleCanvasMouseDown = useCallback(async (e: React.MouseEvent<Element>) => {
    const rect = bgCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Stocker quel bouton de souris est pressé (0 = gauche, 1 = milieu, 2 = droit)
    setMouseButton(e.button);

    const containerWidth = containerRef.current?.getBoundingClientRect().width || rect.width;
    const containerHeight = containerRef.current?.getBoundingClientRect().height || rect.height;
    if (!bgImageObject) return;
    const image = bgImageObject;
    if (image) {
      const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
      const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
      const scaledWidth = imgWidth * scale * zoom;
      const scaledHeight = imgHeight * scale * zoom;
      const clickX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
      const clickY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;

      // 💡 LIGHT SOURCE PLACEMENT
      if (isLightPlacementMode && isMJ && e.button === 0) {
        e.preventDefault();
        console.log("💡 Attempting to place light source at", clickX, clickY);
        try {
          const newLight: LightSource = {
            id: "light_" + Date.now(),
            x: clickX,
            y: clickY,
            name: 'Source de Lumière',
            radius: 10,
            visible: true,
            cityId: selectedCityId
          };
          // Save to 'lights' collection, NOT 'characters'
          await setDoc(doc(db, 'cartes', roomId, 'lights', newLight.id), newLight);
          toast.success("zone de lumiere créée");

          console.log("💡 Light source created in 'lights' collection:", newLight.id);
          setIsLightPlacementMode(false);
        } catch (error) {
          console.error("❌ Error placing light source:", error);
        }
        return;
      }


      //  PORTAL MODE - CREATE PORTAL
      if (portalMode && isMJ && e.button === 0) {
        e.preventDefault();

        // Check if a portal type has been selected
        if (!portalPlacementMode) {
          toast.error("Choisissez d'abord le type de portail");
          return;
        }

        if (portalPlacementMode === 'scene-change') {
          // Scene-change portal: traditional one-click workflow
          setNewPortalPos({ x: clickX, y: clickY });
          setEditingPortal(null);
          setShowPortalConfig(true);
        } else if (portalPlacementMode === 'same-map') {
          // Same-map portal: two-step workflow
          if (!firstPortalPoint || !firstPortalId) {
            // First click: Create first portal immediately in Firebase
            const portalData = {
              x: clickX,
              y: clickY,
              radius: 50,
              targetX: clickX, // Temporary - will update on second click
              targetY: clickY,
              portalType: 'same-map' as const,
              name: 'Portail (en cours...)',
              iconType: 'portal' as const,
              visible: true,
              color: '#3b82f6',
              cityId: selectedCityId
            };

            const docRef = await addDoc(collection(db, 'cartes', roomId, 'portals'), portalData);
            setFirstPortalPoint({ x: clickX, y: clickY });
            setFirstPortalId(docRef.id);
            toast.success("Premier portail placé. Cliquez pour placer le deuxième.");
          } else {
            // Second click: Open config with both points
            setNewPortalPos(firstPortalPoint);
            setEditingPortal({
              ...({} as Portal),
              id: firstPortalId, // Include the ID so we know to update it
              x: firstPortalPoint.x,
              y: firstPortalPoint.y,
              targetX: clickX,
              targetY: clickY,
              portalType: 'same-map'
            });
            setShowPortalConfig(true);
          }
        }
        return;
      }

      //  SPAWN POINT MODE - SET SPAWN POINT
      if (spawnPointMode && isMJ && e.button === 0 && selectedCityId) {
        e.preventDefault();

        // 🚀 Optimistic update: Update local state immediately so the marker appears instantly
        if (currentScene) {
          setCurrentScene({ ...currentScene, spawnX: clickX, spawnY: clickY });
        } else {
          // If currentScene is null (rare but possible during load), we can't easily construct a full scene object without more data,
          // but usually it's loaded if we are clicking. If not, the snapshot will handle it shortly.
        }

        // Update the current scene's spawn point
        await updateDoc(doc(db, 'cartes', roomId, 'cities', selectedCityId), {
          spawnX: clickX,
          spawnY: clickY
        });
        console.log(`✅ [SpawnPoint] Set spawn point for scene ${selectedCityId} at (${clickX}, ${clickY})`);
        toast.success("Point d'apparition mis à jour")
        // Deactivate spawn point mode after placement
        setSpawnPointMode(false);
        return;
      }

      // 🎵 MUSIC MODE - CREATE ZONE
      if (isMusicMode && isMJ && e.button === 0) {
        e.preventDefault();
        setNewMusicZonePos({ x: clickX, y: clickY });
        setShowMusicDialog(true);
        return;
      }

      // 🎵 SELECT MUSIC ZONE (when not in creation mode)
      if (!isMusicMode && isMJ && e.button === 0) {

        // 1. First Check for RESIZE HANDLE on selected zones
        if (selectedMusicZoneIds.length > 0) {
          const resizingZoneId = selectedMusicZoneIds.find(id => {
            const zone = musicZones.find(z => z.id === id);
            if (!zone) return false;

            // Calculate Handle Position (Screen Coords)
            // Center:
            const zoneScreenX = ((zone.x / imgWidth) * scaledWidth) - offset.x + rect.left;
            const zoneScreenY = ((zone.y / imgHeight) * scaledHeight) - offset.y + rect.top;

            const screenRadius = zone.radius * scale * zoom;
            const handleX = zoneScreenX + screenRadius;
            const handleY = zoneScreenY; // 3 o'clock

            const outputDist = Math.sqrt(Math.pow(e.clientX - handleX, 2) + Math.pow(e.clientY - handleY, 2));
            return outputDist < (10 * zoom); // Hit radius
          });

          if (resizingZoneId) {
            e.preventDefault();
            setIsResizingMusicZone(true);
            setResizingMusicZoneId(resizingZoneId);
            return;
          }
        }

        // 1b. Check for CHARACTER AUDIO RESIZE HANDLE (if a character is selected)
        if (selectedCharacterIndex !== null) {
          const char = characters[selectedCharacterIndex];
          if (char && char.audio && char.id) {
            // Calculate Handle Position
            const charScreenX = ((char.x / imgWidth) * scaledWidth) - offset.x + rect.left;
            const charScreenY = ((char.y / imgHeight) * scaledHeight) - offset.y + rect.top;
            const screenRadius = char.audio.radius * scale * zoom;

            const handleX = charScreenX + screenRadius;
            const handleY = charScreenY;

            const outputDist = Math.sqrt(Math.pow(e.clientX - handleX, 2) + Math.pow(e.clientY - handleY, 2));

            if (outputDist < (10 * zoom)) {
              e.preventDefault();
              setIsResizingMusicZone(true);
              setResizingMusicZoneId(`char-${char.id}`);
              return;
            }
          }
        }

        // 2. Check if clicked on a zone icon
        const clickedZone = musicZones.find(z => {
          const dx = z.x - clickX;
          const dy = z.y - clickY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < (20 / zoom);
        });

        if (clickedZone) {
          e.preventDefault();

          // 🎯 Vérifier si un autre élément est actuellement actif
          if (activeElementType !== null && (activeElementType !== 'musicZone' || activeElementId !== clickedZone.id)) {
            // Un autre élément est actif, ne rien faire
            return;
          }

          // 🎯 Si cet élément est déjà actif, bypasser la détection et continuer
          if (activeElementType === 'musicZone' && activeElementId === clickedZone.id) {
            // Élément déjà actif → continuer sans refaire la détection
            mouseClickStartRef.current = { x: e.clientX, y: e.clientY };

            if (!selectedMusicZoneIds.includes(clickedZone.id)) {
              setSelectedMusicZoneIds([clickedZone.id]);
            }
            setIsDraggingMusicZone(true);
            setDraggedMusicZoneId(clickedZone.id);
            setDragStart({ x: e.clientX, y: e.clientY });
            const originalPositions = (selectedMusicZoneIds.includes(clickedZone.id) ? selectedMusicZoneIds : [clickedZone.id])
              .map(id => {
                const zone = musicZones.find(z => z.id === id);
                return zone ? { id: zone.id, x: zone.x, y: zone.y } : null;
              })
              .filter(pos => pos !== null) as { id: string, x: number, y: number }[];
            setDraggedMusicZonesOriginalPositions(originalPositions);
            return;
          }

          // 🎯 Détection d'éléments superposés (seulement si pas encore actif)
          const elementsAtPosition = detectElementsAtPosition(clickX, clickY);

          if (elementsAtPosition.length > 1) {
            // Plusieurs éléments détectés → afficher le menu
            setDetectedElements(elementsAtPosition);
            setSelectionMenuPosition({ x: e.clientX, y: e.clientY });
            setShowElementSelectionMenu(true);
            return;
          }

          // Un seul élément ou élément déjà actif → continuer avec la sélection
          // Tracking for click vs drag
          mouseClickStartRef.current = { x: e.clientX, y: e.clientY };

          // MULTI-SELECTION: Shift/Ctrl + Click
          if (e.shiftKey || e.ctrlKey) {
            setSelectedMusicZoneIds(prev => {
              if (prev.includes(clickedZone.id)) {
                // Deselect if already selected
                return prev.filter(id => id !== clickedZone.id);
              } else {
                // Add to selection
                return [...prev, clickedZone.id];
              }
            });
            return;
          }

          if (!selectedMusicZoneIds.includes(clickedZone.id)) {
            setSelectedMusicZoneIds([clickedZone.id]);
          }

          setIsDraggingMusicZone(true);
          setDraggedMusicZoneId(clickedZone.id); // Reference zone
          setDragStart({ x: e.clientX, y: e.clientY });

          // Store original positions for all currently selected zones
          const originalPositions = (selectedMusicZoneIds.includes(clickedZone.id) ? selectedMusicZoneIds : [clickedZone.id])
            .map(id => {
              const zone = musicZones.find(z => z.id === id);
              return zone ? { id: zone.id, x: zone.x, y: zone.y } : null;
            })
            .filter(pos => pos !== null) as { id: string, x: number, y: number }[];

          setDraggedMusicZonesOriginalPositions(originalPositions);
          return;
        }
      }


      // CLIC MILIEU (button = 1) : DÉPLACEMENT DE LA CARTE
      if (e.button === 1) {
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
      }

      // 🔦 MODE VISIBILITÉ + OUTIL BROUILLARD - Accepte clic gauche ET droit
      // Placé AVANT le check sur e.button === 0 pour capturer les clics droits aussi
      if (isVisActive && currentVisibilityTool === 'fog' && (e.button === 0 || e.button === 2)) {
        e.preventDefault(); // Empêcher le menu contextuel sur clic droit
        setIsFogDragging(true);

        // Détection intelligente : si la cellule a du brouillard, on retire, sinon on ajoute
        const firstCellKey = getCellKey(clickX, clickY, fogCellSize);
        const isCurrentlyFogged = fogGrid.has(firstCellKey);
        const addMode = !isCurrentlyFogged; // Toggle automatique

        setLastFogCell(null);
        await addFogCellIfNew(clickX, clickY, addMode);
        setIsFogAddMode(addMode);
        return;
      }

      // CLIC GAUCHE (button = 0) : SÉLECTION ET INTERACTIONS
      if (e.button === 0) {
        //  MODE MESURE
        if (measureMode) {


          // If no start point OR both points already set, start new measurement
          if (!measureStart || (measureStart && measureEnd &&
            Math.abs(measureStart.x - measureEnd.x) > 1 &&
            Math.abs(measureStart.y - measureEnd.y) > 1)) {
            // Start new measurement

            setMeasureStart({ x: clickX, y: clickY });
            setMeasureEnd(null);
            setIsMeasurementPanelOpen(false); // 🆕 Auto-close panel on interaction

            // 🆕 CREATE SHARED MEASUREMENT
            if (roomId) {
              const measurementsRef = collection(db, 'cartes', roomId, 'measurements');

              // 🆕 CLEANUP OLD MEASUREMENTS (Single Active Measurement per User)
              measurements.forEach(m => {
                if (m.ownerId === (userId || 'unknown')) {
                  deleteDoc(doc(db, 'cartes', roomId, 'measurements', m.id)).catch(console.error);
                }
              });

              const newDocRef = doc(measurementsRef); // Generate ID
              setCurrentMeasurementId(newDocRef.id);

              const newMeasurement: SharedMeasurement = {
                id: newDocRef.id,
                type: measurementShape,
                start: { x: clickX, y: clickY },
                end: { x: clickX, y: clickY },
                ownerId: userId || 'unknown',
                cityId: selectedCityId,
                color: '#FFD700',
                unitName: unitName,

                coneWidth: coneWidth ?? null,
                ...(measurementShape === 'cone' ? { coneAngle, coneShape } : {}),
                skin: (measurementShape === 'circle' || measurementShape === 'cone') ? selectedSkin : null,
                timestamp: Date.now(),
                permanent: isPermanent
              };

              // Fire and forget (optimistic)
              setDoc(newDocRef, newMeasurement).catch(console.error);
            }
          } else {
            setMeasureEnd({ x: clickX, y: clickY });

            // 🆕 FINISH SHARED MEASUREMENT
            if (currentMeasurementId && roomId) {
              const docRef = doc(db, 'cartes', roomId, 'measurements', currentMeasurementId);
              updateDoc(docRef, {
                end: { x: clickX, y: clickY }
              }).catch(console.error);

              // 🆕 AUTO-DETECT & OPEN MENU
              // Always open menu to allow Attack or Delete
              setContextMenuMeasurementId(currentMeasurementId);
              setContextMenuMeasurementOpen(true);

              setCurrentMeasurementId(null);
            } else {
              // This else block was for a debug log, removing it as per instruction.
            }
          }
          return;
        }

        //  MODE DÉPLACEMENT DE CARTE - Seulement si le mode est explicitement activé (MJ uniquement)
        // Pour les joueurs, le pan est géré dans la section "clic sur zone vide" plus bas
        if (panMode && isMJ) {
          setIsDragging(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          return;
        }


        // 🔦 MODE VISIBILITÉ + OUTIL BROUILLARD - Accepte clic gauche ET droit
        // Placé AVANT le check sur e.button === 0 pour capturer les clics droits aussi
        if (isVisActive && currentVisibilityTool === 'fog' && (e.button === 0 || e.button === 2)) {
          e.preventDefault(); // Empêcher le menu contextuel sur clic droit
          setIsFogDragging(true);

          // Détection intelligente : si la cellule a du brouillard, on retire, sinon on ajoute
          const firstCellKey = getCellKey(clickX, clickY, fogCellSize);
          const isCurrentlyFogged = fogGrid.has(firstCellKey);
          const addMode = !isCurrentlyFogged; // Toggle automatique

          setLastFogCell(null);
          await addFogCellIfNew(clickX, clickY, addMode);
          setIsFogAddMode(addMode);
          return;
        }

        // 🔦 MODE VISIBILITÉ - MODE EDIT (sélection et manipulation d'obstacles)
        if (isVisActive && currentVisibilityTool === 'edit' && isLayerVisible('obstacles')) {
          const handleRadius = 12 / zoom; // Rayon de détection des poignées

          // 1. Si un obstacle est sélectionné, vérifier si on clique sur une poignée
          if (selectedObstacleIds.length > 0) {
            // 🔧 FIX: Find WHICH selected obstacle was actually clicked, not just the first one
            let clickedSelectedObs: Obstacle | null = null;

            // Check each selected obstacle to see if the click is on it
            for (const obsId of selectedObstacleIds) {
              const obs = obstacles.find(o => o.id === obsId);
              if (!obs) continue;

              // Check if click is on this obstacle's body
              let clickedOnThis = false;
              if (obs.points.length >= 2) {
                const p1 = obs.points[0];
                const p2 = obs.points[1];
                const A = clickX - p1.x;
                const B = clickY - p1.y;
                const C = p2.x - p1.x;
                const D = p2.y - p1.y;
                const dot = A * C + B * D;
                const len_sq = C * C + D * D;
                let param = -1;
                if (len_sq !== 0) param = dot / len_sq;
                let xx, yy;
                if (param < 0) { xx = p1.x; yy = p1.y; }
                else if (param > 1) { xx = p2.x; yy = p2.y; }
                else { xx = p1.x + param * C; yy = p1.y + param * D; }
                const dist = Math.sqrt(Math.pow(clickX - xx, 2) + Math.pow(clickY - yy, 2));
                clickedOnThis = dist < 15 / zoom;
              }

              if (clickedOnThis) {
                clickedSelectedObs = obs;
                break; // Found the clicked obstacle
              }
            }

            // If we clicked on one of the selected obstacles, check for handle clicks first
            if (clickedSelectedObs) {
              // Check if clicking on a handle (vertex point)
              for (let i = 0; i < clickedSelectedObs.points.length; i++) {
                const point = clickedSelectedObs.points[i];
                const dist = Math.sqrt(Math.pow(clickX - point.x, 2) + Math.pow(clickY - point.y, 2));
                if (dist < handleRadius) {
                  // Clic sur une poignée → commencer le drag du point
                  // Identifier TOUS les points connectés (même position) pour les déplacer ensemble
                  const connected: { obstacleId: string, pointIndex: number }[] = [];
                  const clickedPoint = clickedSelectedObs.points[i];
                  const epsilon = 2 / zoom; // Tolérance pour considérer les points comme identiques

                  obstacles.forEach(obs => {
                    obs.points.forEach((p: Point, idx: number) => {
                      if (Math.abs(p.x - clickedPoint.x) < epsilon && Math.abs(p.y - clickedPoint.y) < epsilon) {
                        connected.push({ obstacleId: obs.id, pointIndex: idx });
                      }
                    });
                  });

                  setIsDraggingObstaclePoint(true);
                  setDraggedPointIndex(i);
                  setDraggedObstacleOriginalPoints([...clickedSelectedObs.points]);
                  setConnectedPoints(connected);
                  setDragStartPos({ x: clickX, y: clickY });
                  dragStartPosRef.current = { x: clickX, y: clickY };
                  return;
                }
              }

              // Not clicking on a handle, so start dragging the whole obstacle(s)
              setIsDraggingObstacle(true);
              setDraggedObstacleId(clickedSelectedObs.id);
              setDragStartPos({ x: clickX, y: clickY }); // Save click position for delta calc

              // ✅ Store original points for ALL selected obstacles (multi-drag - PNJ pattern)
              const originalPoints = selectedObstacleIds.map(obsId => {
                const obs = obstacles.find(o => o.id === obsId);
                return obs ? { id: obsId, points: [...obs.points] } : null;
              }).filter((item): item is { id: string, points: Point[] } => item !== null);

              setDraggedObstaclesOriginalPoints(originalPoints);
              return;
            }
          }

          // 3. Vérifier si on clique sur un autre obstacle pour le sélectionner
          const clickedObstacle = obstacles.find(obstacle => {
            if (obstacle.points.length < 2) return false;
            const p1 = obstacle.points[0];
            const p2 = obstacle.points[1];
            const A = clickX - p1.x;
            const B = clickY - p1.y;
            const C = p2.x - p1.x;
            const D = p2.y - p1.y;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;
            let xx, yy;
            if (param < 0) { xx = p1.x; yy = p1.y; }
            else if (param > 1) { xx = p2.x; yy = p2.y; }
            else { xx = p1.x + param * C; yy = p1.y + param * D; }
            const dist = Math.sqrt(Math.pow(clickX - xx, 2) + Math.pow(clickY - yy, 2));
            return dist < 15 / zoom;
          });

          if (clickedObstacle) {

            // ✅ MULTI-SÉLECTION avec Shift (comme pour les objets)
            if (e.shiftKey) {
              if (selectedObstacleIds.includes(clickedObstacle.id)) {
                setSelectedObstacleIds(prev => prev.filter(id => id !== clickedObstacle.id));
              } else {
                setSelectedObstacleIds(prev => [...prev, clickedObstacle.id]);
              }
            } else {
              setSelectedObstacleIds([clickedObstacle.id]);
            }

          } else {
            // Clic dans le vide : désélectionner tout
            setSelectedObstacleIds([]);
          }
          return;
        }

        // 🔦 MODE VISIBILITÉ - OUTIL DESSIN UNIFIÉ (chain = murs + fermeture polygon)
        if (isVisActive && currentVisibilityTool === 'chain') {
          // Désélectionner tout obstacle si on dessine
          setSelectedObstacleIds([]);

          if (isDrawingObstacle) {
            // CONTINUER le dessin en cours
            const clickPoint = snapPoint || { x: clickX, y: clickY };

            if (currentObstaclePoints.length >= 1) {
              // Vérifier si on ferme la forme (clic proche du 1er point, >= 3 points)
              if (currentObstaclePoints.length >= 3) {
                const startPoint = currentObstaclePoints[0];
                const distToStart = Math.sqrt(
                  Math.pow(clickX - startPoint.x, 2) + Math.pow(clickY - startPoint.y, 2)
                );

                if (distToStart < 20 / zoom) {
                  // FERMER LA FORME -> sauvegarder comme murs individuels (y compris l'arête de fermeture)
                  const pointsToSave = [...currentObstaclePoints];
                  for (let i = 0; i < pointsToSave.length; i++) {
                    const next = (i + 1) % pointsToSave.length;
                    await saveObstacle('wall', [pointsToSave[i], pointsToSave[next]]);
                  }
                  setIsDrawingObstacle(false);
                  setCurrentObstaclePoints([]);
                  setPendingEdges([]);
                  return;
                }
              }

              // Vérifier fermeture implicite via mur partagé existant
              // (le dernier point snappe sur un endpoint connecté au 1er point par un mur existant)
              if (snapPoint && currentObstaclePoints.length >= 2) {
                const startPoint = currentObstaclePoints[0];
                const endPoint = snapPoint;
                const closingWall = obstacles.find(obs => {
                  if (obs.points.length < 2) return false;
                  if (obs.type !== 'wall' && obs.type !== 'door' && obs.type !== 'one-way-wall' && obs.type !== 'window') return false;
                  const p1 = obs.points[0];
                  const p2 = obs.points[obs.points.length - 1];
                  const d = (a: Point, b: Point) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
                  const snapDist = 5;
                  return (d(p1, endPoint) < snapDist && d(p2, startPoint) < snapDist) ||
                    (d(p2, endPoint) < snapDist && d(p1, startPoint) < snapDist);
                });

                if (closingWall) {
                  // Fermeture implicite : sauvegarder les murs du chain (sans dupliquer le mur partagé)
                  const allPoints = [...currentObstaclePoints, endPoint];
                  for (let i = 0; i < allPoints.length - 1; i++) {
                    await saveObstacle('wall', [allPoints[i], allPoints[i + 1]]);
                  }
                  setIsDrawingObstacle(false);
                  setCurrentObstaclePoints([]);
                  setPendingEdges([]);
                  return;
                }
              }

              // Pas de fermeture : enregistrer l'arête (toujours mur) et ajouter le point
              const edgeMeta: EdgeMeta = { type: 'wall' };
              setPendingEdges(prev => [...prev, edgeMeta]);
              setCurrentObstaclePoints(prev => [...prev, clickPoint]);
            }
          } else {
            // COMMENCER un nouveau dessin
            const startPoint = snapPoint || { x: clickX, y: clickY };
            setIsDrawingObstacle(true);
            setCurrentObstaclePoints([startPoint]);
            setPendingEdges([]);
          }
          return;
        }

        //  NOUVEAU Mode brouillard - priorité élevée (placement continu)
        if (fogMode && isLayerVisible('fog')) {
          setIsFogDragging(true);
          const firstCellKey = getCellKey(clickX, clickY, fogCellSize);
          const isCurrentlyFogged = fogGrid.has(firstCellKey);

          // Décider si on ajoute ou supprime selon l'état actuel de la première cellule
          // Si la cellule est dans le brouillard, on supprime (addMode = false)
          // Si la cellule n'est pas dans le brouillard, on ajoute (addMode = true)
          const addMode = !isCurrentlyFogged;

          setLastFogCell(null); // Réinitialiser pour permettre la première modification
          await addFogCellIfNew(clickX, clickY, addMode);

          // Stocker le mode pour le drag (utiliser une variable spécifique)
          setIsFogAddMode(addMode);
          return;
        }

        // Mode dessin - priorité élevée
        if (drawMode && isLayerVisible('drawings')) {
          setIsDrawing(true);

          if (currentTool === 'eraser') {
            // Eraser Logic (Vector Eraser - Delete whole stroke)
            const eraserRadius = (drawingSize * zoom) / 2 + 5; // A bit of tolerance

            // Check collision with any drawing
            const drawingIndexToDelete = drawings.findIndex(drawing => isPointOnDrawing(clickX, clickY, drawing, zoom));

            if (drawingIndexToDelete !== -1 && roomId) {
              const drawingToDelete = drawings[drawingIndexToDelete];
              // Delete from Firebase
              deleteFromRtdbWithHistory('drawings', drawingToDelete.id, 'Suppression du tracé');
              // Optimistic UI update
              const newDrawings = [...drawings];
              newDrawings.splice(drawingIndexToDelete, 1);
              setDrawings(newDrawings);
            }
          } else {
            // Pen Mode
            setCurrentPath([{ x: clickX, y: clickY }]);
          }
          return;
        }

        //  MODE SÉLECTION PAR DÉFAUT - Nouveau comportement principal
        // Vérifier si on clique sur un élément existant ET s'il est visible
        let clickedCharIndex = isLayerVisible('characters') ? characters.findIndex(char => {
          // 🔒 Vérifier d'abord si le personnage est visible pour le joueur
          // (pas dans l'ombre ou le brouillard)
          if (!isMJ && !isCharacterVisibleToUser(char)) {
            return false; // Ignorer les personnages cachés pour les joueurs
          }

          const charX = (char.x / imgWidth) * scaledWidth - offset.x;
          const charY = (char.y / imgHeight) * scaledHeight - offset.y;
          const clickRadius = char.type === 'joueurs' ? 30 * zoom : 20 * zoom;
          return Math.abs(charX - e.clientX + rect.left) < clickRadius && Math.abs(charY - e.clientY + rect.top) < clickRadius;
        }) : -1;

        // 🎯 PRIORITÉ AU PERSONNAGE ACTIF
        // Si un personnage est déjà sélectionné (actif), on vérifie si le clic est sur lui.
        // Si oui, on force la sélection sur lui, même si un autre perso est "au-dessus" (visuellement ou dans l'array).
        if (activeElementType === 'character' && activeElementId && isLayerVisible('characters')) {
          const activeIndex = characters.findIndex(c => c.id === activeElementId);
          if (activeIndex !== -1) {
            const char = characters[activeIndex];
            // Vérifier si le clic est sur ce personnage (copie logique ci-dessus)
            const charX = (char.x / imgWidth) * scaledWidth - offset.x;
            const charY = (char.y / imgHeight) * scaledHeight - offset.y;
            const clickRadius = char.type === 'joueurs' ? 30 * zoom : 20 * zoom;

            const isClickOnActive = Math.abs(charX - e.clientX + rect.left) < clickRadius && Math.abs(charY - e.clientY + rect.top) < clickRadius;

            // Si on clique sur le perso actif, on ignore tout autre perso qui serait "au dessus"
            if (isClickOnActive) {
              clickedCharIndex = activeIndex;
            }
          }
        }

        const clickedNoteIndex = isLayerVisible('notes') ? notes.findIndex(note => {
          const noteX = (note.x / imgWidth) * scaledWidth - offset.x;
          const noteY = (note.y / imgHeight) * scaledHeight - offset.y;

          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          const fontSize = (note.fontSize || 16) * zoom;
          // Estimation de la largeur : 0.6 * fontSize par caractère (moyenne large)
          const estimatedWidth = (note.text.length * fontSize * 0.7);
          const estimatedHeight = fontSize;

          // Padding confortable pour faciliter le clic
          const padding = 15 * zoom;

          // Hitbox alignée avec le rendu du texte (Baseline left)
          // X: de [x - padding] à [x + width + padding]
          // Y: de [y - height - padding] à [y + descenders + padding]
          const isInX = mouseX >= (noteX - padding) && mouseX <= (noteX + estimatedWidth + padding);
          const isInY = mouseY >= (noteY - estimatedHeight - padding) && mouseY <= (noteY + (estimatedHeight * 0.5) + padding);

          return isInX && isInY;
        }) : -1;

        //  NOUVEAU : Vérifier si on clique sur un objet
        // This logic is now handled by the DOM element's onMouseDown, as pointerEvents: 'auto' will prevent this from firing.
        // So, this block will effectively be skipped for objects.
        const clickedObjectIndex = -1; // No longer detected here

        //  NOUVEAU : Vérifier si on clique sur une cellule de brouillard
        const clickedFogIndex = isCellInFog(clickX, clickY, fogGrid, fogCellSize) ? 0 : -1;

        // 🆕 Détecter si on clique sur une case de brouillard (pour sélection multiple)
        const clickedFogCellKey = (() => {
          if (!isLayerVisible('fog')) return null;
          const cellKey = getCellKey(clickX, clickY, fogCellSize);

          // Vérifier si cette cellule contient du brouillard
          // En mode normal: les cellules dans fogGrid ont du brouillard
          // En mode fullMapFog: toutes les cellules SAUF celles dans fogGrid ont du brouillard
          const hasFog = fullMapFog ? !fogGrid.has(cellKey) : fogGrid.has(cellKey);

          return hasFog ? cellKey : null;
        })();

        //  NOUVEAU : Vérifier si on clique sur un dessin (pour sélection)
        const clickedDrawingIndex = drawings.findIndex(drawing => isPointOnDrawing(clickX, clickY, drawing, zoom));

        //  NOUVEAU : Vérifier si on clique sur une poignée de redimensionnement
        let clickedHandleIndex = -1;
        if (selectedDrawingIndex !== null) {
          const drawing = drawings[selectedDrawingIndex];
          const handles = getResizeHandles(drawing);

          clickedHandleIndex = handles.findIndex(handle => {
            const handleX = (handle.x / imgWidth) * scaledWidth - offset.x;
            const handleY = (handle.y / imgHeight) * scaledHeight - offset.y;
            // Mouse check logic (screen coords vs handles)
            const dist = Math.sqrt(Math.pow(e.clientX - rect.left - handleX, 2) + Math.pow(e.clientY - rect.top - handleY, 2));
            return dist < 10;
          });

          if (clickedHandleIndex !== -1) {
            setIsResizingDrawing(true);
            setDraggedHandleIndex(clickedHandleIndex);
            return; // Stop event here, we are resizing
          }
        }

        // 🚪 INTERACTION PORTES (joueurs et MJ hors mode visibilité)
        // Clic sur une porte → sélectionner pour ouvrir le context menu
        if (!visibilityMode && e.button === 0) {
          const clickedDoor = obstacles.find(obstacle => {
            if (obstacle.type !== 'door') return false;
            if (obstacle.points.length < 2) return false;

            // Joueurs : vérifier que la porte est visible (pas dans brouillard, ligne de vue directe)
            if (!isMJ) {
              const doorMidPt = {
                x: (obstacle.points[0].x + obstacle.points[1].x) / 2,
                y: (obstacle.points[0].y + obstacle.points[1].y) / 2,
              };
              if (fullMapFog || isCellInFog(doorMidPt.x, doorMidPt.y, fogGrid, fogCellSize)) return false;
              const effPersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
              const viewer = characters.find(c => c.id === effPersoId && c.x !== undefined && c.y !== undefined);
              if (viewer) {
                // Raycasting : un mur opaque bloque-t-il la vue ?
                const vx = viewer.x, vy = viewer.y;
                const mx = doorMidPt.x, my = doorMidPt.y;
                for (const obs of obstacles) {
                  if (obs.id === obstacle.id) continue;
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
              }
            }

            const p1 = obstacle.points[0];
            const p2 = obstacle.points[1];
            const A = clickX - p1.x;
            const B = clickY - p1.y;
            const C = p2.x - p1.x;
            const D = p2.y - p1.y;
            const dot = A * C + B * D;
            const len_sq = C * C + D * D;
            let param = -1;
            if (len_sq !== 0) param = dot / len_sq;
            let xx, yy;
            if (param < 0) { xx = p1.x; yy = p1.y; }
            else if (param > 1) { xx = p2.x; yy = p2.y; }
            else { xx = p1.x + param * C; yy = p1.y + param * D; }
            const dist = Math.sqrt(Math.pow(clickX - xx, 2) + Math.pow(clickY - yy, 2));
            return dist < 20 / zoom;
          });

          if (clickedDoor) {
            setSelectedObstacleIds([clickedDoor.id]);
            return;
          }
        }

        // 🎯 DÉTECTION D'ÉLÉMENTS SUPERPOSÉS - Vérifier AVANT de sélectionner un personnage
        if (clickedCharIndex !== -1) {
          // Vérifier si un autre élément est déjà actif et si ce n'est pas ce personnage
          const clickedChar = characters[clickedCharIndex];
          if (activeElementType !== null && (activeElementType !== 'character' || activeElementId !== clickedChar.id)) {
            // Un autre élément est actif, ne rien faire
            return;
          }

          // Si ce personnage n'est PAS déjà actif, vérifier s'il y a des éléments superposés
          if (activeElementType !== 'character' || activeElementId !== clickedChar.id) {
            const elementsAtPosition = detectElementsAtPosition(clickX, clickY);

            if (elementsAtPosition.length > 1) {
              // Plusieurs éléments détectés → afficher le menu
              setDetectedElements(elementsAtPosition);
              setSelectionMenuPosition({ x: e.clientX, y: e.clientY });
              setShowElementSelectionMenu(true);
              return;
            }
          }

          // 👇 Logique de sélection (FUSIONNÉE ici au lieu d'être dans un bloc séparé)
          // Si Ctrl/Cmd est pressé, ajouter à la sélection multiple
          if (e.ctrlKey || e.metaKey) {
            if (selectedCharacters.includes(clickedCharIndex)) {
              setSelectedCharacters(prev => prev.filter(index => index !== clickedCharIndex));
            } else {
              setSelectedCharacters(prev => [...prev, clickedCharIndex]);
            }
          } else {
            //  NOUVEAU : Commencer le drag & drop du personnage ou groupe
            const isAlreadySelected = selectedCharacters.includes(clickedCharIndex);
            const charactersToMove = isAlreadySelected && selectedCharacters.length > 1
              ? selectedCharacters
              : [clickedCharIndex];

            // Vérifier les permissions de déplacement pour tous les personnages à déplacer
            const canMoveAllCharacters = charactersToMove.every(index => {
              const character = characters[index];
              // MJ peut déplacer tous les personnages
              if (isMJ) return true;
              // Joueur peut déplacer son propre personnage (type joueurs) ou les alliés
              return (character.type === 'joueurs' && character.id === persoId) || character.visibility === 'ally';
            });

            if (!canMoveAllCharacters) {
              // Si l'utilisateur n'a pas le droit de déplacer au moins un des personnages,
              // on ne fait que sélectionner sans initier le drag
              if (!isAlreadySelected) {
                setSelectedCharacterIndex(clickedCharIndex);
                setSelectedCharacters([clickedCharIndex]);
              }

              // For players (non-MJ), open context menu on single click for non-controllable characters
              if (!isMJ) {
                const char = characters[clickedCharIndex];
                if (char && char.id) {
                  setContextMenuCharacterId(char.id);
                  setContextMenuOpen(true);
                }
              }

              return;
            }

            if (!isAlreadySelected) {
              setSelectedCharacterIndex(clickedCharIndex);
              setSelectedCharacters([clickedCharIndex]);

              //  Show badge visibility (no toggle, only add)
              const char = characters[clickedCharIndex];
              if (char && char.id) {
                setVisibleBadges(prev => {
                  const newSet = new Set(prev);
                  newSet.add(char.id); // Always add, never remove on click
                  return newSet;
                });
              }
            }



            // Préparer le drag des personnages (seulement si autorisé)
            setIsDraggingCharacter(true);
            setDraggedCharacterIndex(clickedCharIndex);

            // Sauvegarder les positions originales de tous les personnages à déplacer
            const originalPositions = charactersToMove.map(index => ({
              index,
              x: characters[index].x,
              y: characters[index].y
            }));
            setDraggedCharactersOriginalPositions(originalPositions);
          }
          setSelectedNoteIndex(null);
          setSelectedFogIndex(null);
          setSelectedObjectIndices([]);
        } else if (clickedNoteIndex !== -1) {
          setSelectedNoteIndex(clickedNoteIndex);
          setSelectedCharacterIndex(null);
          setSelectedFogIndex(null);
          setSelectedCharacters([]);

          //  NOUVEAU : Commencer le drag & drop de la note
          const note = notes[clickedNoteIndex];
          setIsDraggingNote(true);
          setDraggedNoteIndex(clickedNoteIndex);
          setDraggedNoteOriginalPos({ x: note.x, y: note.y });
          setSelectedDrawingIndex(null); // Clear drawing selection
          setSelectedObjectIndices([]);
        } else if (clickedObjectIndex !== -1) {
          // This block is now effectively dead code for objects as they are DOM elements.
          // Object selection and drag start will be handled by the object's onMouseDown.
          // Keeping it here for now, but it won't be reached.
        } else if (clickedDrawingIndex !== -1) {
          //  SELECTION DESSIN
          setSelectedDrawingIndex(clickedDrawingIndex);
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedFogIndex(null);
          setSelectedCharacters([]);
          setSelectedObjectIndices([]);

          setIsDraggingDrawing(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          // Clone points to avoid reference issues
          const pointsCopy = drawings[clickedDrawingIndex].points.map((p: Point) => ({ ...p }));
          setDraggedDrawingOriginalPoints(pointsCopy);

        } else if (clickedFogCellKey) {
          // 🆕 SÉLECTION DE CASE DE BROUILLARD
          // Toggle selection for this fog cell
          if (selectedFogCells.includes(clickedFogCellKey)) {
            // Déjà sélectionnée : désélectionner
            setSelectedFogCells(prev => prev.filter(k => k !== clickedFogCellKey));
          } else {
            // Pas sélectionnée : ajouter à la sélection
            setSelectedFogCells(prev => [...prev, clickedFogCellKey]);
          }

          // Clear other selections
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedFogIndex(null);
          setSelectedCharacters([]);
          setSelectedDrawingIndex(null);
          setSelectedObjectIndices([]);

        } else if (clickedFogIndex !== -1) {
          setSelectedFogIndex(clickedFogIndex);
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedCharacters([]);
          setSelectedDrawingIndex(null);
          setSelectedObjectIndices([]);
        } else {
          //  DETECTION D'OBSTACLE (Polygones / Murs)
          // On ne peut sélectionner un obstacle que si on est en mode visibilité ou MJ
          let clickedObstacleId: string | null = null;

          if (isMJ || visibilityMode) {
            const mouseMapX = (clickX / containerWidth) * image.width; // Approx, clickX/Y are passed from caller but might need adjustment
            // Actually, clickX and clickY are already in map space (relative to image)
            // handleCanvasMouseDown receives clickX, clickY which are computed as:
            // const clickX = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width

            // Simple version: iterate obstacles (all are walls with 2 points)
            for (const obs of obstacles) {
              if (obs.points.length < 2) continue;
              const p1 = obs.points[0];
              const p2 = obs.points[1];
              const d = pDistance(clickX, clickY, p1.x, p1.y, p2.x, p2.y);
              if (d < 15) {
                clickedObstacleId = obs.id;
                break;
              }
            }
          }

          if (clickedObstacleId) {
            // Check if clicking on already selected obstacle
            const isAlreadySelected = selectedObstacleIds.includes(clickedObstacleId);
            const obstaclesToMove = isAlreadySelected && selectedObstacleIds.length > 1
              ? selectedObstacleIds
              : [clickedObstacleId];

            // Update selection if not already selected
            if (!isAlreadySelected) {
              setSelectedObstacleIds([clickedObstacleId]);
            }

            // Clear others
            setSelectedCharacterIndex(null);
            setSelectedNoteIndex(null);
            setSelectedFogIndex(null);
            setSelectedCharacters([]);
            setSelectedDrawingIndex(null);
            setSelectedObjectIndices([]);
            setContextMenuOpen(false);

            // Start Drag - USING MAP COORDINATES (clickX, clickY)
            setIsDraggingObstacle(true);
            setDraggedObstacleId(clickedObstacleId);
            setDragStartPos({ x: clickX, y: clickY }); // MAP coordinates!

            // Store original points for ALL selected obstacles (multi-drag)
            const originalPoints = obstaclesToMove.map(obsId => {
              const obs = obstacles.find(o => o.id === obsId);
              return obs ? { id: obsId, points: [...obs.points] } : null;
            }).filter((item): item is { id: string, points: Point[] } => item !== null);

            setDraggedObstaclesOriginalPoints(originalPoints);
          } else {
            // Clic sur zone vide
            setSelectedCharacterIndex(null);
            setSelectedNoteIndex(null);
            setSelectedFogIndex(null);
            setSelectedCharacters([]);
            setSelectedDrawingIndex(null);
            setSelectedObjectIndices([]); // Désélectionner l'objet
            setSelectedObstacleIds([]);
            //  Clear individual visible badges when clicking on empty area (but keep global toggle)
            if (!showAllBadges) {
              setVisibleBadges(new Set());
            }
            setContextMenuOpen(false);

            if (isMJ && multiSelectMode) {
              // MJ : Commencer une sélection par zone UNIQUEMENT si le mode est actif
              setSelectionStart({ x: clickX, y: clickY });
              setIsSelectingArea(true);
            } else {
              // Sinon : Déplacer la carte (comme le mode pan, comportement par défaut amélioré)
              clearFocus(); // 🆕 Stop auto-focus when panning manually
              setIsDragging(true);
              setDragStart({ x: e.clientX, y: e.clientY });
            }
          }
        }
      } // Fin du clic gauche
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bgCanvasRef, containerRef, bgImageObject, zoom, offset,
    roomId, isMJ, persoId, userId, selectedCityId,
    playerViewMode, viewAsPersoId,
    characters, notes, drawings, obstacles, musicZones, measurements, lights,
    fogGrid, fogCellSize, fullMapFog, fogMode,
    visibilityMode, isVisActive, currentVisibilityTool,
    isDrawingObstacle, currentObstaclePoints, snapPoint, pendingEdges, selectedObstacleIds,
    isLightPlacementMode, portalMode, portalPlacementMode, firstPortalPoint, firstPortalId,
    spawnPointMode, currentScene, isMusicMode, selectedMusicZoneIds,
    measureMode, measureStart, measureEnd, measurementShape, currentMeasurementId,
    coneWidth, coneAngle, coneShape, selectedSkin, isPermanent, unitName,
    panMode, drawMode, currentTool, drawingSize, multiSelectMode, showAllBadges,
    activeElementType, activeElementId,
    selectedCharacterIndex, selectedCharacters, selectedNoteIndex, selectedDrawingIndex,
    selectedObjectIndices, selectedFogCells,
    setMouseButton, setIsDragging, setDragStart,
    setIsLightPlacementMode,
    setNewPortalPos, setEditingPortal, setShowPortalConfig, setFirstPortalPoint, setFirstPortalId,
    setSpawnPointMode, setCurrentScene,
    setNewMusicZonePos, setShowMusicDialog,
    setIsDraggingMusicZone, setDraggedMusicZoneId, setDraggedMusicZonesOriginalPositions,
    setIsResizingMusicZone, setResizingMusicZoneId, setSelectedMusicZoneIds,
    setIsFogDragging, setLastFogCell, setIsFogAddMode, setSelectedFogCells,
    setMeasureStart, setMeasureEnd, setIsMeasurementPanelOpen,
    setCurrentMeasurementId, setContextMenuMeasurementId, setContextMenuMeasurementOpen,
    setSelectedObstacleIds, setIsDrawingObstacle, setCurrentObstaclePoints, setPendingEdges,
    setIsDraggingObstaclePoint, setDraggedPointIndex, setDraggedObstacleOriginalPoints,
    setConnectedPoints, setDragStartPos, setIsDraggingObstacle, setDraggedObstacleId,
    setDraggedObstaclesOriginalPoints,
    setSelectedCharacterIndex, setSelectedCharacters,
    setIsDraggingCharacter, setDraggedCharacterIndex, setDraggedCharactersOriginalPositions,
    setVisibleBadges,
    setSelectedNoteIndex, setIsDraggingNote, setDraggedNoteIndex, setDraggedNoteOriginalPos,
    setSelectedDrawingIndex, setIsDraggingDrawing, setDraggedDrawingOriginalPoints,
    setIsResizingDrawing, setDraggedHandleIndex,
    setIsDrawing, setCurrentPath, setDrawings,
    setSelectedObjectIndices, setSelectedFogIndex,
    setContextMenuOpen, setContextMenuCharacterId,
    setSelectionStart, setIsSelectingArea,
    setDetectedElements, setSelectionMenuPosition, setShowElementSelectionMenu,
    addFogCellIfNew, saveObstacle, deleteFromRtdbWithHistory,
    isCharacterVisibleToUser, isLayerVisible, detectElementsAtPosition, clearFocus,
  ]);

  // ---------------------------------------------------------
  // handleCanvasDoubleClick
  // ---------------------------------------------------------
  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<Element>) => {
    if (!bgImageObject) return

    const rect = bgCanvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const containerWidth = containerRef.current?.clientWidth || rect.width
    const containerHeight = containerRef.current?.clientHeight || rect.height

    const image = bgImageObject
    const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
    const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
    const scaledWidth = imgWidth * scale * zoom
    const scaledHeight = imgHeight * scale * zoom
    const clickX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
    const clickY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight

    // Check if double-clicked on a character
    const clickedCharIndex = characters.findIndex((char) => {
      // 🔒 Vérifier d'abord si le personnage est visible pour le joueur
      if (!isMJ && !isCharacterVisibleToUser(char)) {
        return false; // Ignorer les personnages cachés pour les joueurs
      }

      const tokenSize = 50
      const dx = clickX - char.x
      const dy = clickY - char.y
      return Math.sqrt(dx * dx + dy * dy) < tokenSize / 2
    })

    if (clickedCharIndex !== -1) {
      const char = characters[clickedCharIndex]
      if (char && char.id) {
        setContextMenuCharacterId(char.id)
        setContextMenuOpen(true)
      }
    }
  }, [
    bgCanvasRef, containerRef, bgImageObject, zoom, offset,
    characters, isMJ, isCharacterVisibleToUser,
    setContextMenuCharacterId, setContextMenuOpen,
  ]);

  return {
    handleCanvasMouseDown,
    handleCanvasDoubleClick,
  };
}
