"use client"



import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion'
import YouTube from 'react-youtube';
import poisonIcon from './icons/poison.svg';
import stunIcon from './icons/stun.svg';
import blindIcon from './icons/blind.svg';
import invisibleIcon from './icons/invisible.svg';
import { useParams } from 'next/navigation'
import { useGame } from '@/contexts/GameContext'
import { Button } from "@/components/ui/button"
import { X, Plus, Minus, Edit, Pencil, Eraser, CircleUserRound, Baseline, User, Grid, Cloud, CloudOff, ImagePlus, Trash2, Eye, EyeOff, ScanEye, Move, Hand, Square, Circle as CircleIcon, Slash, Ruler, Map as MapPin, Heart, Shield, Zap, Dices, Sparkles, BookOpen, Flashlight, Info, Image as ImageIcon, Layers, Package, Skull, Ghost, Anchor, Flame, Snowflake, Loader2, Check, Music, Volume2, VolumeX, ArrowRight, DoorOpen, Pen, ArrowDownUp, Hexagon, MousePointer } from 'lucide-react'
import { toast } from 'sonner';
import { auth, db, realtimeDb, dbRef, onValue, onAuthStateChanged } from '@/lib/firebase'
import { doc, collection, updateDoc, addDoc, deleteDoc, setDoc, getDocs, query, where } from 'firebase/firestore'
import Combat from '@/components/(combat)/combat2';
import { CONDITIONS } from '@/components/(combat)/MJcombat';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Component as RadialMenu } from '@/components/ui/radial-menu';
import CitiesManager from '@/components/(worldmap)/CitiesManager';
import InteractionLayer from '@/components/(interactions)/InteractionLayer';
import { VendorInteraction, GameInteraction, LootInteraction, Interaction, MapObject } from '@/app/[roomid]/map/types';
import { useVisibilityState } from '@/hooks/map/useVisibilityState';
import { getDominantColor, getContrastColor } from '@/utils/imageUtils';
import { type EntityToDelete } from '@/components/(map)/DeleteConfirmationModal';
import ElementSelectionMenu, { type DetectedElement } from '@/components/(map)/ElementSelectionMenu';
import { doc as firestoreDoc } from 'firebase/firestore'
import InfoComponent, { type InfoSection } from "@/components/(infos)/info";
import { type NPC } from '@/components/(personnages)/personnages';
import { type Obstacle, type Point as VisibilityPoint, type EdgeMeta, type PolygonViewerInfo, drawShadows, drawObstacles, calculateShadowPolygons, isPointInPolygon, getPolygonsContainingViewer, isPointInShadows, type ShadowResult } from '@/lib/visibility';
import { findNearestWallSegment, calculateSplitPoints, determineOneWayDirection, DEFAULT_FEATURE_WIDTH, findAdjacentWalls, getMergedWallPoints, findAllConnectedWalls, findClosedLoops, isMovementBlocked } from '@/lib/obstacle-utils';
import { LayerControl } from '@/components/(map)/LayerControl';
import { useSettings } from '@/contexts/SettingsContext';
import { SelectionMenu, type SelectionCandidates, type SelectionType } from '@/components/(map)/SelectionMenu';
import { type ViewMode, type Point, type Character, type LightSource, type MapText, type SavedDrawing, type NewCharacter, type Note, type ObjectTemplate, type Layer, type LayerType, type MusicZone, type Scene, type DrawingTool, type Portal } from './types';
import { useAudioZones } from '@/hooks/map/useAudioZones';
import { getResizeHandles, isPointOnDrawing, renderDrawings, renderCurrentPath } from './drawings';
import { calculateDistance, getCellKey, isCellInFog, renderFogLayer } from './shadows';
import MapToolbar, { TOOLS } from '@/components/(map)/MapToolbar';
import { useMapControl } from '@/contexts/MapControlContext';
import { pasteCharacter } from '@/utils/pasteCharacter';
import { pasteObject } from '@/utils/pasteObject';
import { CursorManager } from '@/components/(map)/CursorManager';
import { useAudioMixer } from '@/components/(audio)/AudioMixerPanel';
import { type MeasurementShape, renderLineMeasurement, renderConeMeasurement, renderCircleMeasurement, renderCubeMeasurement, renderStartPoint, isPointInMeasurement, type SharedMeasurement } from './measurements';
import { useSkinVideo } from '@/hooks/map/useSkinVideo';
import { useMeasurementSkins } from '@/hooks/map/useMeasurementSkins';
import { ToolbarSkinSelector } from '@/components/(map)/MapToolbar';
import { useShortcuts, SHORTCUT_ACTIONS } from '@/contexts/ShortcutsContext';
import { useUndoRedo } from '@/contexts/UndoRedoContext';
import { useFirestoreWithHistory } from '@/hooks/map/useFirestoreWithHistory';
import { useCharacterPositions } from '@/hooks/map/useCharacterPositions';
import type { PositionsMap } from '@/hooks/map/useCharacterPositions';
import { useRtdbCollections } from '@/hooks/map/useRtdbCollections';
import { useMapData } from '@/hooks/map/useMapData';
import { getMediaDimensions } from './utils/coordinates';
import { drawBackgroundLayers } from './renderers/background-renderer';
import { drawCharacterBorders } from './renderers/character-borders-renderer';
import { drawMeasurements } from './renderers/measurement-renderer';
import { drawForegroundLayers } from './renderers/foreground-renderer';
import { isCharacterVisibleToUser as checkCharacterVisibility, isObjectVisibleToUser as checkObjectVisibility, type CharacterVisibilityContext, type VisibilityContext } from './utils/visibility-checks';
import { useBackgroundLoader } from '@/hooks/map/useBackgroundLoader';
import { useKeyboardShortcuts } from '@/hooks/map/useKeyboardShortcuts';
import { useMusicZoneActions } from '@/hooks/map/useMusicZoneActions';
import { useElementDetection } from '@/hooks/map/useElementDetection';
import { useObstacleActions } from '@/hooks/map/useObstacleActions';
import { useDeleteActions } from '@/hooks/map/useDeleteActions';
import { useDragAndDrop, type DragFeaturePreview } from '@/hooks/map/useDragAndDrop';
import { useToolbarActions } from '@/hooks/map/useToolbarActions';
import MapContextMenus from '@/components/(map)/MapContextMenus';
import MapContextMenuContent from '@/components/(overlays)/MapContextMenuContent';
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import MapDialogs from '@/components/(map)/MapDialogs';
import { useCanvasMouseDown } from '@/hooks/map/useCanvasMouseDown';
import { useCanvasMouseMove } from '@/hooks/map/useCanvasMouseMove';
import { useCanvasMouseUp } from '@/hooks/map/useCanvasMouseUp';
import StaticToken from '@/components/(map)/StaticToken';
import LightsLayer from '@/components/(map)/layers/LightsLayer';
import ObjectsLayer from '@/components/(map)/layers/ObjectsLayer';
import PortalsLayer from '@/components/(map)/layers/PortalsLayer';
import CharactersLayer from '@/components/(map)/layers/CharactersLayer';

const CONDITION_ICONS: Record<string, any> = {
  poisoned: { src: poisonIcon },
  stunned: { src: stunIcon },
  blinded: { src: blindIcon },
};

// Hook to pre-render icons to images
const useStatusEffectIcons = () => {
  const [iconCache, setIconCache] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const loadIcon = (key: string, src: any) => {
      const img = new Image();
      img.src = src.src || src;
      img.onload = () => {
        setIconCache(prev => ({ ...prev, [key]: img }));
      };
    };

    Object.entries(CONDITION_ICONS).forEach(([key, config]) => {
      loadIcon(key, config.src);
    });
    loadIcon('invisible', invisibleIcon);
  }, []);

  const getIcon = (conditionId: string): HTMLImageElement | null => {
    if (CONDITION_ICONS[conditionId]) {
      return iconCache[conditionId] || null;
    }
    return iconCache['invisible'] || null;
  };

  return getIcon;
};





export default function Component() {
  const params = useParams();
  const roomId = params.roomid as string;
  const { isMJ, persoId, viewAsPersoId, setViewAsPersoId } = useGame();
  const { focusTarget, selectedCityId, setSelectedCityId, clearFocus } = useMapControl();
  const { volumes: audioVolumes } = useAudioMixer();
  const [combatOpen, setCombatOpen] = useState(false);
  const [attackerId, setAttackerId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetIds, setTargetIds] = useState<string[]>([]); // 🆕 Multiple targets for AoE
  const {
    showGrid, setShowGrid,
    showCharBorders, setShowCharBorders,
    globalTokenScale, setGlobalTokenScale,
    showMyCursor, setShowMyCursor,
    showOtherCursors, setShowOtherCursors,
    cursorColor, setCursorColor,
    cursorTextColor, setCursorTextColor,
    showBackgroundSelector, setShowBackgroundSelector,
    performanceMode, setPerformanceMode
  } = useSettings(); // 🌍 Global Settings

  // 🐛 DEBUG: Log cursor colors
  useEffect(() => {
  }, [cursorColor, cursorTextColor]);

  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null)
  const { bgImageObject, setBgImageObject, isBackgroundLoading, loadingProgress } = useBackgroundLoader({ backgroundImage, performanceMode });
  const [selectedSkin, setSelectedSkin] = useState<string>('Fireballs/explosion1.webm');
  const [isPermanent, setIsPermanent] = useState(false); // 🆕 Permanent measurement toggle
  const [activeInteraction, setActiveInteraction] = useState<{ interaction: VendorInteraction | GameInteraction | LootInteraction, host: Character | MapObject } | null>(null);
  const [interactionConfigTarget, setInteractionConfigTarget] = useState<Character | null>(null);
  const fireballVideo = useSkinVideo(selectedSkin); // For LOCAL active measurement


  // 📋 COPY/PASTE STATE
  const [copiedCharacterTemplate, setCopiedCharacterTemplate] = useState<Character | null>(null);
  const [copiedObjectTemplate, setCopiedObjectTemplate] = useState<MapObject | null>(null);

  const { isShortcutPressed } = useShortcuts();
  const { undo, redo, canUndo, canRedo, recordAction } = useUndoRedo();
  const { addWithHistory, deleteWithHistory, updateWithHistory, setWithHistory, updatePositionWithHistory, setCityPositionWithHistory, addToRtdbWithHistory, updateRtdbWithHistory, deleteFromRtdbWithHistory } = useFirestoreWithHistory(roomId);









  // const [showGrid, setShowGrid] = useState(false)
  // const [showCharBorders, setShowCharBorders] = useState(true) // Show character borders & labels
  const [zoom, setZoom] = useState(1.4)
  // const [globalTokenScale, setGlobalTokenScale] = useState(1);
  const [showGlobalSettingsDialog, setShowGlobalSettingsDialog] = useState(false);
  // const [showMyCursor, setShowMyCursor] = useState(true);
  // const [showOtherCursors, setShowOtherCursors] = useState(true);
  // const [cursorColor, setCursorColor] = useState<string>('#000000'); // 🆕 Cursor Color State
  // const [cursorTextColor, setCursorTextColor] = useState<string>('#ffffff'); // 🆕 Cursor Text Color State

  const [isBackgroundEditMode, setIsBackgroundEditMode] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [characters, setCharacters] = useState<Character[]>([]);
  const [lights, setLights] = useState<LightSource[]>([]);
  const [objects, setObjects] = useState<MapObject[]>([]);
  const [notes, setNotes] = useState<MapText[]>([]);

  const [activeInfoSection, setActiveInfoSection] = useState<InfoSection>(null); // 🆕 State for Info Sections
  const [showCharacterSheet, setShowCharacterSheet] = useState(false);
  const [selectedCharacterForSheet, setSelectedCharacterForSheet] = useState<string | null>(null);
  const [newCharacter, setNewCharacter] = useState<NewCharacter>({
    name: '',
    image: null,
    niveau: 1,
    visibility: 'hidden',
    PV: 50,
    Defense: 0,
    Contact: 0,
    Distance: 0,
    Magie: 0,
    INIT: 0,
    nombre: 1,
    FOR: 0,
    DEX: 0,
    CON: 0,
    SAG: 0,
    INT: 0,
    CHA: 0,
  });

  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  //  NOUVEAUX ÉTATS pour le drag & drop des personnages
  const [isDraggingCharacter, setIsDraggingCharacter] = useState(false)
  const [draggedCharacterIndex, setDraggedCharacterIndex] = useState<number | null>(null)

  const [draggedCharactersOriginalPositions, setDraggedCharactersOriginalPositions] = useState<{ index: number, x: number, y: number }[]>([])

  //  LIGHT SOURCE DRAG & DROP
  const [isDraggingLight, setIsDraggingLight] = useState(false);
  const [draggedLightId, setDraggedLightId] = useState<string | null>(null);
  const [draggedLightOriginalPos, setDraggedLightOriginalPos] = useState({ x: 0, y: 0 });

  //  NOUVEAUX ÉTATS pour le drag & drop des objets
  const [isObjectDrawerOpen, setIsObjectDrawerOpen] = useState(false);
  const [isSoundDrawerOpen, setIsSoundDrawerOpen] = useState(false)
  const [isAudioMixerOpen, setIsAudioMixerOpen] = useState(false)

  // Audio mixer volumes

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [measurementScale, setMeasurementScale] = useState<number>(50); // px per unit
  const [allyViewId, setAllyViewId] = useState<string | null>(null); // 🆕 Vue POV d'un allié pour les joueurs
  const [isDraggingObject, setIsDraggingObject] = useState(false)
  const [draggedObjectIndex, setDraggedObjectIndex] = useState<number | null>(null) // Used for main reference
  const [draggedObjectOriginalPos, setDraggedObjectOriginalPos] = useState({ x: 0, y: 0 })
  const [draggedObjectsOriginalPositions, setDraggedObjectsOriginalPositions] = useState<{ index: number, x: number, y: number }[]>([]); // For multi-drag


  const [snapPoint, setSnapPoint] = useState<Point | null>(null);
  const [draggedObjectTemplate, setDraggedObjectTemplate] = useState<any>(null)
  const [draggedSoundTemplate, setDraggedSoundTemplate] = useState<any>(null)

  //  NOUVEAUX ÉTATS pour le drag & drop des notes
  const [isDraggingNote, setIsDraggingNote] = useState(false)
  const [draggedNoteIndex, setDraggedNoteIndex] = useState<number | null>(null)
  const [draggedNoteOriginalPos, setDraggedNoteOriginalPos] = useState({ x: 0, y: 0 })

  //  Focus on Character Logic
  const lastFocusTimestampRef = useRef<number>(0);

  useEffect(() => {
    // Only center if it's a NEW request (timestamp changed)
    // This prevents the camera from following the character when dragging/moving (User Requirement)
    if (focusTarget.characterId && focusTarget.timestamp > lastFocusTimestampRef.current && bgImageObject && containerRef.current) {
      const char = characters.find(c => c.id === focusTarget.characterId);
      if (char) {
        const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImageObject);
        const { clientWidth: containerWidth, clientHeight: containerHeight } = containerRef.current;

        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
        const scaledWidth = imgWidth * scale * zoom;
        const scaledHeight = imgHeight * scale * zoom;

        // Calculate offset to center the character
        // Formula: stored_pos * scale_factor - offset = screen_center
        // Therefore: offset = stored_pos * scale_factor - screen_center

        // Character position in "screen pixels" (relative to the scaled image)
        const charScreenX = (char.x / imgWidth) * scaledWidth;
        const charScreenY = (char.y / imgHeight) * scaledHeight;

        // Center of the viewport
        const centerX = containerWidth / 2;
        const centerY = containerHeight / 2;

        const newOffsetX = charScreenX - centerX;
        const newOffsetY = charScreenY - centerY;

        setOffset({ x: newOffsetX, y: newOffsetY });

        // Mark this focus request as handled
        lastFocusTimestampRef.current = focusTarget.timestamp;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget, bgImageObject, zoom]);



  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number | null>(null);
  const [selectedObjectIndices, setSelectedObjectIndices] = useState<number[]>([]);
  const [visibleBadges, setVisibleBadges] = useState<Set<string>>(new Set());
  const [showAllBadges, setShowAllBadges] = useState(false);

  // Ref to track mouse down position for click vs drag distinction
  const mouseClickStartRef = React.useRef<{ x: number, y: number } | null>(null);

  const [contextMenuMusicZoneId, setContextMenuMusicZoneId] = useState<string | null>(null);
  const [contextMenuMusicZoneOpen, setContextMenuMusicZoneOpen] = useState(false);

  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);
  const getConditionIcon = useStatusEffectIcons(); // Hook d'icônes

  // Tooltip State
  const hoveredConditionRef = useRef<{ x: number, y: number, text: string } | null>(null); // Ref for performance
  const [hoveredCondition, setHoveredCondition] = useState<{ x: number, y: number, text: string } | null>(null);
  const iconHitRegionsRef = useRef<{ x: number, y: number, w: number, h: number, label: string }[]>([]);

  //  Object Resizing State
  const [isResizingObject, setIsResizingObject] = useState(false);
  const [resizeStartData, setResizeStartData] = useState<{
    index: number;
    initialWidth: number;
    initialHeight: number;
    initialMouseDist: number; // Distance from center to mouse at start
    centerX: number;
    centerY: number;
  } | null>(null);
  // États pour la Drag & Drop
  const [draggedCharacter, setDraggedCharacter] = useState<Character | null>(null);
  const [editingNote, setEditingNote] = useState<MapText | null>(null);

  //  Context Menu State
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuCharacterId, setContextMenuCharacterId] = useState<string | null>(null);
  const [contextMenuObjectOpen, setContextMenuObjectOpen] = useState(false);
  const [contextMenuObjectId, setContextMenuObjectId] = useState<string | null>(null);

  const [contextMenuMeasurementOpen, setContextMenuMeasurementOpen] = useState(false);
  const [contextMenuMeasurementId, setContextMenuMeasurementId] = useState<string | null>(null);

  const [isRadialMenuOpen, setIsRadialMenuOpen] = useState(false);
  const [isRadialMenuCentered, setIsRadialMenuCentered] = useState(false);

  //  Drawing Selection State
  const [selectedDrawingIndex, setSelectedDrawingIndex] = useState<number | null>(null);
  const [isDraggingDrawing, setIsDraggingDrawing] = useState(false);
  const [draggedDrawingOriginalPoints, setDraggedDrawingOriginalPoints] = useState<Point[]>([]);
  //  Drawing Resize State
  const [draggedHandleIndex, setDraggedHandleIndex] = useState<number | null>(null); // 0, 1, 2, 3...
  const [isResizingDrawing, setIsResizingDrawing] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)

  //  NPC Template Drag & Drop States
  const [isNPCDrawerOpen, setIsNPCDrawerOpen] = useState(false)
  const [draggedTemplate, setDraggedTemplate] = useState<NPC | null>(null)
  const [dropPosition, setDropPosition] = useState<{ x: number; y: number } | null>(null)
  const [isUnifiedSearchOpen, setIsUnifiedSearchOpen] = useState(false)

  const [contextMenuLightOpen, setContextMenuLightOpen] = useState(false);
  const [contextMenuLightId, setContextMenuLightId] = useState<string | null>(null);

  const [showPlaceModal, setShowPlaceModal] = useState(false)
  const [showPlaceObjectModal, setShowPlaceObjectModal] = useState(false)
  const [draggedObjectTemplateForPlace, setDraggedObjectTemplateForPlace] = useState<ObjectTemplate | null>(null)
  const [dropObjectPosition, setDropObjectPosition] = useState<{ x: number, y: number } | null>(null)
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false)
  const [showNoBackgroundModal, setShowNoBackgroundModal] = useState(false)

  //  CENTRALIZED DELETION MODAL STATE
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [entityToDelete, setEntityToDelete] = useState<EntityToDelete | null>(null);


  //  MULTI-SELECTION STATE
  const [selectionCandidates, setSelectionCandidates] = useState<SelectionCandidates | null>(null);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });

  //  BULK CHARACTER CONTEXT MENU STATE
  const [bulkContextMenuOpen, setBulkContextMenuOpen] = useState(false);



  const [isDrawing, setIsDrawing] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [drawings, setDrawings] = useState<SavedDrawing[]>([]);

  //  Drawing Tools State
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingSize, setDrawingSize] = useState(5);

  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Anonyme');
  const [loading, setLoading] = useState(true)
  const [fontFamilyMap, setFontFamilyMap] = useState<Record<string, string>>({})

  useEffect(() => {
    // Résoudre les variables CSS pour le Canvas
    if (typeof window !== 'undefined') {
      const style = getComputedStyle(document.documentElement);
      const getValue = (n: string) => style.getPropertyValue(n).replace(/"/g, '').trim();

      setFontFamilyMap({
        'var(--font-body)': getValue('--font-body'),
        'var(--font-title)': getValue('--font-title'),
        'var(--font-hand)': getValue('--font-hand'),
        'var(--font-medieval)': getValue('--font-medieval'),
        'var(--font-modern)': getValue('--font-modern'),
      });
    }
  }, []);

  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const characterBordersCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null);
  const [isSelectingArea, setIsSelectingArea] = useState(false);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [mouseButton, setMouseButton] = useState<number | null>(null); // Pour tracker quel bouton de souris est pressé
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref pour l'input de changement de fond
  const [panMode, setPanMode] = useState(false); // Mode déplacement de carte

  const [playerViewMode, setPlayerViewMode] = useState(false); // Mode "Vue Joueur" pour le MJ
  const [allyViewMode, setAllyViewMode] = useState(false); // Mode "Vue Allié" pour les joueurs

  //  MEASUREMENT & CALIBRATION STATE
  const [measureMode, setMeasureMode] = useState(false);
  const [isMeasurementPanelOpen, setIsMeasurementPanelOpen] = useState(false);
  const [measurementShape, setMeasurementShape] = useState<MeasurementShape>('line');
  const [isCalibrating, setIsCalibrating] = useState(false); // Sub-mode of measureMode
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [measureEnd, setMeasureEnd] = useState<Point | null>(null);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(50); // Default: 50 pixels = 1 unit
  const [unitName, setUnitName] = useState('m'); // Default unit
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false);
  const [tempCalibrationDistance, setTempCalibrationDistance] = useState('');
  const [coneConfigDialogOpen, setConeConfigDialogOpen] = useState(false); // Legacy, kept to avoid errors if used elsewhere but unused
  const [coneWidth, setConeWidth] = useState<number | undefined>(undefined); // Legacy

  // New Cone & Grid Settings
  const [coneAngle, setConeAngle] = useState(53.13);
  const [coneShape, setConeShape] = useState<'flat' | 'rounded'>('rounded');
  const [coneMode, setConeMode] = useState<'angle' | 'dimensions'>('angle'); // New
  const [coneLength, setConeLength] = useState<number | undefined>(undefined); // New
  const [lockWidthHeight, setLockWidthHeight] = useState(false);
  const [measurements, setMeasurements] = useState<SharedMeasurement[]>([]);
  const measurementSkins = useMeasurementSkins(measurements); // For SHARED measurements
  const [currentMeasurementId, setCurrentMeasurementId] = useState<string | null>(null);

  // Sync changes to active measurement
  useEffect(() => {
    if (currentMeasurementId && roomId && measurementShape === 'cone') {
      const docRef = doc(db, 'cartes', roomId, 'measurements', currentMeasurementId);
      updateDoc(docRef, {
        coneAngle,
        coneShape,
        coneMode,
        fixedLength: coneLength || null,
        coneWidth: coneWidth || null // Allow null to clear override
      }).catch(console.error);
    }
  }, [coneAngle, coneShape, currentMeasurementId, roomId, measurementShape]);

  // Open panel when mode activates
  useEffect(() => {
    if (measureMode) setIsMeasurementPanelOpen(true);
  }, [measureMode]);

  // Reset skin when shape changes to prevent cone skins on circles and vice-versa
  useEffect(() => {
    setSelectedSkin(''); // Reset to no animation
  }, [measurementShape]);


  //  PORTAL SYSTEM STATE
  const [portals, setPortals] = useState<Portal[]>([]);
  const [portalMode, setPortalMode] = useState(false);
  const [portalPlacementMode, setPortalPlacementMode] = useState<'scene-change' | 'same-map' | null>(null);
  const [firstPortalPoint, setFirstPortalPoint] = useState<Point | null>(null);
  const [firstPortalId, setFirstPortalId] = useState<string | null>(null); // Track first portal ID
  const [showPortalConfig, setShowPortalConfig] = useState(false);
  const [newPortalPos, setNewPortalPos] = useState<Point | null>(null);
  const [editingPortal, setEditingPortal] = useState<Portal | null>(null);
  const [activePortalForPlayer, setActivePortalForPlayer] = useState<Portal | null>(null);
  const [isDraggingPortal, setIsDraggingPortal] = useState(false);
  const [draggedPortalId, setDraggedPortalId] = useState<string | null>(null);
  const [draggedPortalOriginalPos, setDraggedPortalOriginalPos] = useState<{ x: number, y: number }>({ x: 0, y: 0 }); // For same-map twin portal update
  const [contextMenuPortalOpen, setContextMenuPortalOpen] = useState(false);
  const [contextMenuPortalId, setContextMenuPortalId] = useState<string | null>(null);

  //  SPAWN POINT SYSTEM STATE
  const [spawnPointMode, setSpawnPointMode] = useState(false);  // Mode to set spawn point
  const [isDraggingSpawnPoint, setIsDraggingSpawnPoint] = useState(false);  // Dragging spawn marker
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);  // Current scene data for spawn points

  // Map Context Menu State — tracks last right-click position for module item context
  const mapContextMenuPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // 📡 Listeners currentScene et portals → centralisés dans useMapData

  //  CHECK FOR PORTAL COLLISIONS (Player characters only)
  useEffect(() => {
    if (!persoId || !portals.length || !characters.length) {
      setActivePortalForPlayer(null);
      return;
    }

    // Find the player's character
    const playerChar = characters.find(c => c.id === persoId);
    if (!playerChar) {
      setActivePortalForPlayer(null);
      return;
    }

    // Filter portals for current scene
    const scenePortals = portals.filter(p => !p.cityId || p.cityId === selectedCityId);

    // Check if player is in any portal
    for (const portal of scenePortals) {
      const distance = Math.sqrt(
        Math.pow(playerChar.x - portal.x, 2) + Math.pow(playerChar.y - portal.y, 2)
      );

      if (distance <= portal.radius) {
        setActivePortalForPlayer(portal);
        return;
      }
    }

    setActivePortalForPlayer(null);
  }, [persoId, portals, characters, selectedCityId]);



  // 🆕 AUTO-DELETE TEMPORARY MEASUREMENTS
  useEffect(() => {
    // Check every 1s
    const interval = setInterval(() => {
      const now = Date.now();
      measurements.forEach(m => {
        // If not permanent and expired (> 6s)
        if (m.permanent === false && (now - m.timestamp > 6000)) {
          // Verify ownership (only the creator cleans it up to avoid conflicts)
          // Or simpler: anyone can clean up local state, but for Firebase:
          const isOwner = m.ownerId === (userId || 'unknown');
          if (isOwner || isMJ) {
            const docRef = doc(db, 'cartes', roomId, 'measurements', m.id);
            deleteDoc(docRef).catch(console.error);
          }
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [measurements, roomId, userId, isMJ]);

  // 🆕 VIEW MODE & CITY NAVIGATION STATE

  const [viewMode, setViewMode] = useState<ViewMode>('world'); // 'world' = world map, 'city' = city map

  const [globalCityId, setGlobalCityId] = useState<string | null>(null); // Global party location
  const [cities, setCities] = useState<Scene[]>([]); // Villes disponibles

  // 🆕 RANDOM STAT GENERATOR STATE
  const [difficulty, setDifficulty] = useState(3); // 1-5

  const generateRandomStats = () => {
    const level = newCharacter.niveau;
    const diffMultiplier = difficulty; // 1 to 5

    // Helper for random variation
    const vary = (base: number, variation: number) => {
      return Math.max(0, base + Math.floor(Math.random() * (variation * 2 + 1)) - variation);
    };

    setNewCharacter((prev: NewCharacter) => ({
      ...prev,
      PV: vary((level * 5) + (diffMultiplier * 10), 5), // Example: Lvl 1, Diff 3 => 5 + 30 = 35 +/- 5
      PV_Max: vary((level * 5) + (diffMultiplier * 10), 5),
      Defense: vary(10 + Math.floor(level / 2) + diffMultiplier, 2),
      Contact: vary(Math.floor(level / 2) + diffMultiplier * 2, 2),
      Distance: vary(Math.floor(level / 2) + diffMultiplier * 2, 2),
      Magie: vary(Math.floor(level / 2) + diffMultiplier * 2, 2),
      INIT: vary(10 + diffMultiplier, 5),
      FOR: vary(10 + (diffMultiplier * 2), 2),
      DEX: vary(10 + (diffMultiplier * 2), 2),
      CON: vary(10 + (diffMultiplier * 2), 2),
      SAG: vary(10 + (diffMultiplier * 2), 2),
      INT: vary(10 + (diffMultiplier * 2), 2),
      CHA: vary(10 + (diffMultiplier * 2), 2),
    }));
  };

  //  LAYERS STATE
  const [showLayerControl, setShowLayerControl] = useState(false);
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'background', label: 'Fond', isVisible: true, order: 0 },
    { id: 'notes', label: 'Notes', isVisible: true, order: 2 },
    { id: 'drawings', label: 'Dessins', isVisible: true, order: 3 },
    { id: 'objects', label: 'Objets', isVisible: true, order: 4 },
    { id: 'characters', label: 'Personnages', isVisible: true, order: 5 },
    { id: 'fog', label: 'Brouillard', isVisible: true, order: 6 },
    { id: 'obstacles', label: 'Obstacle', isVisible: true, order: 7 },
    { id: 'music', label: 'Musique (Zones)', isVisible: true, order: 8 },
  ]);

  // 🎵 MUSIC ZONES STATE
  const [musicZones, setMusicZones] = useState<MusicZone[]>([]);
  const [isMusicMode, setIsMusicMode] = useState(false);
  const [isMusicZoneDrawerOpen, setIsMusicZoneDrawerOpen] = useState(false);
  const [selectedMusicZoneIds, setSelectedMusicZoneIds] = useState<string[]>([]); // MULTI-SELECTION
  const [showMusicDialog, setShowMusicDialog] = useState(false);
  const [showEditMusicDialog, setShowEditMusicDialog] = useState(false);
  const [editingMusicZoneId, setEditingMusicZoneId] = useState<string | null>(null);
  const [newMusicZonePos, setNewMusicZonePos] = useState<Point | null>(null);
  const [tempZoneData, setTempZoneData] = useState({ name: '', url: '', radius: 200, volume: 0.5 });
  const [isDraggingMusicZone, setIsDraggingMusicZone] = useState(false);
  const [draggedMusicZoneId, setDraggedMusicZoneId] = useState<string | null>(null); // Keep for main drag reference
  const [draggedMusicZonesOriginalPositions, setDraggedMusicZonesOriginalPositions] = useState<{ id: string, x: number, y: number }[]>([]); // MULTI-DRAG

  // 🎵 MUSIC ZONE RESIZING
  const [isResizingMusicZone, setIsResizingMusicZone] = useState(false);
  const [resizingMusicZoneId, setResizingMusicZoneId] = useState<string | null>(null);

  // 💡 LIGHTS AND PORTALS MULTI-SELECTION
  const [selectedLightIds, setSelectedLightIds] = useState<string[]>([]);
  const [selectedPortalIds, setSelectedPortalIds] = useState<string[]>([]);

  // 🎯 OVERLAPPING ELEMENTS SELECTION MENU
  const [detectedElements, setDetectedElements] = useState<DetectedElement[]>([]);
  const [showElementSelectionMenu, setShowElementSelectionMenu] = useState(false);
  const [selectionMenuPosition, setSelectionMenuPosition] = useState({ x: 0, y: 0 });
  const [activeElementType, setActiveElementType] = useState<'light' | 'portal' | 'musicZone' | 'character' | 'object' | null>(null);
  const [activeElementId, setActiveElementId] = useState<string | null>(null);


  // ⚡ PERFORMANCE: Refs for frequently changing render states
  // These refs prevent the main render useEffect from re-executing on every state change
  const charactersRenderRef = useRef<Character[]>([]);
  const objectsRenderRef = useRef<MapObject[]>([]);
  const notesRenderRef = useRef<MapText[]>([]);
  const drawingsRenderRef = useRef<SavedDrawing[]>([]);
  const currentPathRenderRef = useRef<Point[]>([]);
  const fogGridRenderRef = useRef<Map<string, boolean>>(new Map());
  const obstaclesRenderRef = useRef<Obstacle[]>([]);
  const musicZonesRenderRef = useRef<MusicZone[]>([]);
  const portalsRenderRef = useRef<Portal[]>([]);
  const measurementsRenderRef = useRef<SharedMeasurement[]>([]);
  const layersRenderRef = useRef<Layer[]>([]);
  const selectedCharacterIndexRef = useRef<number | null>(null);
  const selectedObjectIndicesRef = useRef<number[]>([]);
  const selectedNoteIndexRef = useRef<number | null>(null);
  const selectedMusicZoneIdsRef = useRef<string[]>([]);
  const zoomRenderRef = useRef<number>(1.4);
  const offsetRenderRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const globalTokenScaleRef = useRef<number>(1);
  const showGridRef = useRef<boolean>(false);
  const showFogGridRef = useRef<boolean>(false);
  const fullMapFogRef = useRef<boolean>(false);
  const performanceModeRef = useRef<'high' | 'eco' | 'static'>('high');
  const playerViewModeRef = useRef<boolean>(false);
  const isMJRef = useRef<boolean>(false);
  const persoIdRef = useRef<string | null>(null);
  const viewAsPersoIdRef = useRef<string | null>(null);
  const activePlayerIdRef = useRef<string | null>(null);
  const showCharBordersRef = useRef<boolean>(true);



  // 🔊 AUDIO MANAGER - Moved after isLayerVisible declaration

  // 🔊 AUDIO MANAGER - Moved after isLayerVisible declaration
  const audioManager = useAudioMixer(); // Assuming this hook exists or similar logic

  // 🔦 VISIBILITY STATE (hook)
  const visibilityState = useVisibilityState({
    roomId,
    isMJ,
    selectedCityId,
    bgImageObject,
    getMediaDimensions,
    playerViewMode,
    persoId,
    viewAsPersoId,
    charactersRef: charactersRenderRef.current,
    lights,
    recordAction,
    setSelectedCharacterIndex,
    setSelectedObjectIndices,
    setSelectedNoteIndex,
    setSelectedDrawingIndex,
    setDrawMode,
  });

  // Destructure for canvas/mouse handlers
  const {
    visibilityRadius, fogMode, setFogMode, fogGrid, setFogGrid,
    showFogGrid, setShowFogGrid, isFogDragging, setIsFogDragging,
    lastFogCell, setLastFogCell,
    isFogAddMode, setIsFogAddMode,
    fullMapFog, setFullMapFog,
    selectedFogIndex, setSelectedFogIndex,
    selectedFogCells, setSelectedFogCells,
    fogCellSize,
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
    draggedObstacleOriginalPointsRef, dragStartPosRef,
    currentObstacleType, setCurrentObstacleType,
    isOneWayReversed, setIsOneWayReversed,
    pendingEdges, setPendingEdges,
    selectedEdgeIndex, setSelectedEdgeIndex,
    isDraggingEdge, setIsDraggingEdge,
    draggedEdgeIndex, setDraggedEdgeIndex,
    draggedEdgeObstacleId, setDraggedEdgeObstacleId,
    draggedEdgeOriginalPoints, setDraggedEdgeOriginalPoints,
    shadowTempCanvas, shadowExteriorCanvas,
    isLightPlacementMode, setIsLightPlacementMode,
    calculateFogOpacity, saveFogGrid, saveFullMapFog,
    toggleFogCell, addFogCellIfNew, flushFogUpdates,
    toggleVisibilityMode, saveFogGridWithHistory,
    handleFullMapFogChange, toggleFogMode, clearFog,
    updateShadowOpacity, buildEdgeMeta,
  } = visibilityState;

  // State for drag & drop preview of doors/one-way walls on walls
  const [dragFeaturePreview, setDragFeaturePreview] = useState<DragFeaturePreview>(null);
  // Active si le drawer standalone est ouvert OU si le drawer embedded a activé ses outils
  const isVisActive = visibilityMode || (typeof window !== 'undefined' && (window as any).__visibilityToolsActive === true);

  const [audioCharacterId, setAudioCharacterId] = useState<string | null>(null);
  const {
    handleConfigureCharacterAudio, saveMusicZone, openEditDialog,
    saveEditedMusicZone, deleteMusicZone, updateMusicZonePosition,
  } = useMusicZoneActions({
    roomId, selectedCityId, musicZones, characters,
    audioCharacterId, newMusicZonePos, tempZoneData, editingMusicZoneId,
    setShowMusicDialog, setShowEditMusicDialog, setAudioCharacterId,
    setNewMusicZonePos, setTempZoneData, setEditingMusicZoneId, setSelectedMusicZoneIds,
    updateWithHistory,
  });

  // Element detection — delegates to extracted hook
  const {
    detectElementsAtPosition, handleElementSelection, resetActiveElementSelection,
  } = useElementDetection({
    isMJ, persoId, selectedCityId, zoom,
    lights, portals, musicZones, characters, objects,
    bgImageObject, containerRef,
    setDetectedElements, setShowElementSelectionMenu,
    setActiveElementType, setActiveElementId,
    setContextMenuOpen, setContextMenuCharacterId,
    setContextMenuLightId, setContextMenuPortalId,
    setSelectedCharacterIndex, setSelectedObjectIndices, setSelectedMusicZoneIds,
  });

  //  BULK CHARACTER OPERATIONS
  const handleBulkVisibilityChange = async (visibility: 'visible' | 'hidden' | 'ally' | 'custom' | 'invisible') => {
    if (!roomId || selectedCharacters.length === 0) return;

    // Update visibility for all selected characters
    const updatePromises = selectedCharacters.map(index => {
      const char = characters[index];
      if (!char) return Promise.resolve();

      const charRef = doc(db, 'cartes', roomId, 'characters', char.id);

      // If switching to custom mode, initialize visibleToPlayerIds if not defined
      if (visibility === 'custom') {
        const currentPlayerIds = char.visibleToPlayerIds || [];
        return updateDoc(charRef, {
          visibility: visibility,
          visibleToPlayerIds: currentPlayerIds
        });
      } else {
        return updateDoc(charRef, { visibility: visibility });
      }
    });

    await Promise.all(updatePromises);
    console.log(`[BULK] Updated visibility to "${visibility}" for ${selectedCharacters.length} characters`);
  };

  const handleBulkDelete = () => {
    if (selectedCharacters.length === 0) return;

    // Use the existing delete modal system
    const charsToDelete = selectedCharacters
      .map(index => characters[index])
      .filter(c => c && c.type !== 'joueurs'); // Don't delete player characters

    if (charsToDelete.length === 0) return;

    setEntityToDelete({
      type: 'character',
      ids: charsToDelete.map(c => c.id),
      count: charsToDelete.length
    });
    setDeleteModalOpen(true);
  };

  const handleBulkConditionToggle = async (conditionId: string) => {
    if (!roomId || selectedCharacters.length === 0) return;

    // Toggle condition for all selected characters
    const updatePromises = selectedCharacters.map(index => {
      const char = characters[index];
      if (!char) return Promise.resolve();

      const currentConditions = char.conditions || [];
      let newConditions: string[];

      if (currentConditions.includes(conditionId)) {
        // Remove the condition
        newConditions = currentConditions.filter(c => c !== conditionId);
      } else {
        // Add the condition
        newConditions = [...currentConditions, conditionId];
      }

      const charRef = doc(db, 'cartes', roomId, 'characters', char.id);
      return updateDoc(charRef, { conditions: newConditions });
    });

    await Promise.all(updatePromises);
    console.log(`[BULK] Toggled condition "${conditionId}" for ${selectedCharacters.length} characters`);
  };



  // 📡 Listener layers → centralisé dans useMapData


  const toggleLayer = async (layerId: LayerType) => {
    // Optimistic update (optional, but good for UI responsiveness)
    const newLayers = layers.map(layer =>
      layer.id === layerId ? { ...layer, isVisible: !layer.isVisible } : layer
    );
    // setLayers(newLayers); // Let the snapshot listener handle the update to avoid out-of-sync issues

    // Update in Firebase
    if (roomId) {
      const getLayerDocId = () => selectedCityId ? `layers_${selectedCityId}` : 'layers';
      const layersRef = doc(db, 'cartes', roomId, 'settings', getLayerDocId());
      await setDoc(layersRef, { layers: newLayers }, { merge: true });
    }
  };

  // 📡 Listener settings/general → centralisé dans useMapData

  const updateGlobalTokenScale = async (newScale: number) => {
    if (!roomId || !isMJ) return;
    // Optimistic
    setGlobalTokenScale(newScale);
    const settingsRef = doc(db, 'cartes', roomId, 'settings', 'general');
    await setDoc(settingsRef, { globalTokenScale: newScale }, { merge: true });
  };

  const isLayerVisible = (layerId: LayerType) => {
    return layers.find(l => l.id === layerId)?.isVisible ?? true;
  };

  // 🔊 AUDIO MANAGER - Call useAudioZones after isLayerVisible is defined
  const listenerCharacter = characters.find(c => c.id === (viewAsPersoId || persoId));
  const listenerPos = listenerCharacter ? { x: listenerCharacter.x, y: listenerCharacter.y } : null;

  const effectiveMusicZones = useMemo(() => {
    const charZones = characters
      .filter(c => c.audio && c.audio.url)
      .map(c => ({
        id: `char-${c.id}`,
        x: c.x,
        y: c.y,
        radius: c.audio!.radius,
        url: c.audio!.url,
        volume: c.audio!.volume,
        name: c.audio!.name || c.name,
        // Inherit city check implicitly by character presence
      } as MusicZone));
    return [...musicZones, ...charZones];
  }, [musicZones, characters]);

  const ytPlayersRef = useRef<Map<string, any>>(new Map());
  const { youtubeZones } = useAudioZones(effectiveMusicZones, listenerPos, true, audioVolumes.musicZones, ytPlayersRef);








  // 🎵 Global audio reference for quick sounds
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);

  // 🎵 Track if this is the first snapshot (to ignore initial state on page load)
  const isFirstSnapshotRef = useRef(true);

  // 🎵 Update global audio volume when mixer changes
  useEffect(() => {
    if (globalAudioRef.current) {
      globalAudioRef.current.volume = audioVolumes.quickSounds;
    }
  }, [audioVolumes.quickSounds]);

  // 📡 Listener global sound → centralisé dans useMapData

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cleanup) cleanup(); // Clean up previous listeners

      if (user) {
        setUserId(user.uid);
        setUserName(user.displayName || 'Joueur');
        cleanup = INITializeFirebaseListeners(roomId);
      } else {
        setUserId(null);
        setUserName('Anonyme');

        if (roomId) {
          // If logged out but in a room, maybe still listen to characters?
          // Original code tried to do this.
          const charsRef = dbRef(realtimeDb, `rooms/${roomId}/characters`);
          const unsubChars = onValue(charsRef, (snapshot: any) => {
            const data = snapshot.val();
            if (data) {
              setCharacters(Object.values(data) as Character[]);
            } else {
              setCharacters([]);
            }
          });
          cleanup = () => unsubChars();
        }
      }
    });

    return () => {
      unsubscribe();
      if (cleanup) cleanup();
    };
  }, [roomId]);

  // 📡 Listener combat/state → centralisé dans useMapData (doublon supprimé)



  // 📡 Listener fond/backgroundImage → centralisé dans useMapData

  // 🆕 AFFICHER LE MODAL SI PAS DE FOND (MJ seulement)
  useEffect(() => {
    if (!isMJ || loading) return;

    // Si on est dans une ville, vérifier si cette ville a un fond
    if (selectedCityId) {
      const selectedCity = cities.find(c => c.id === selectedCityId);
      // Si la ville existe et n'a pas de backgroundUrl, afficher le modal
      if (selectedCity && !selectedCity.backgroundUrl) {
        setShowNoBackgroundModal(true);
      }
    } else {
      // En mode world map, vérifier si le fond est un placeholder
      const isPlaceholder = !backgroundImage || backgroundImage.includes('placeholder.svg');
      if (isPlaceholder) {
        setShowNoBackgroundModal(true);
      }
    }
  }, [backgroundImage, isMJ, loading, selectedCityId, cities]);

  const loadedPlayersRef = useRef<any[]>([]); // Storing RAW docs to re-parse with new cityId
  const loadedNPCsRef = useRef<Character[]>([]);
  const [playersVersion, setPlayersVersion] = useState(0); // 🆕 Trigger for sync effect when players change

  // ─── RTDB : positions temps réel ─────────────────────────────────────────────
  const rtdbPositionsRef = useRef<PositionsMap>({});
  const mergeAndSetCharactersRtdbRef = useRef<() => void>(() => { });
  const { positionsRef: _rtdbPosRef, updateCharacterPosition, updateCityPosition } = useCharacterPositions(
    roomId,
    () => { mergeAndSetCharactersRtdbRef.current(); }
  );
  // Sync le ref local avec celui du hook
  useEffect(() => { rtdbPositionsRef.current = _rtdbPosRef.current; });

  // Helper functions need to be stable or defined outside if they don't depend on scope (they depend on selectedCityId)
  // Since selectedCityId changes, the parsing logic changes (positions). 
  // So `parseCharacterDoc` MUST be inside the effect OR depend on cityId.
  // BUT! Global players shouldn't re-parse just because cityId changed? 
  // YES they should! Because their position might be defined for that city.
  // So actually Global Effect needs `selectedCityId`? 
  // IF we depend on `selectedCityId`, we re-subscribe.
  // SOLUTION: separating the listener from the parser?
  // Complex. For now, let's keep it simple:
  // If we want to avoid re-subscribing players, we must store the RAW DOCS and re-parse them when city changes.
  // That's too complex for this refactor.
  // Alternative: We accept that Players re-subscribe? NO, that's what we want to avoid.
  // 
  // FIX: The Global Effect subscribes to `playersQuery`. Inside the callback, it parses using `selectedCityId`.
  // Wait, the callback captures the closure. If `selectedCityId` changes, the old callback still has old ID?
  // Yes. So we need `selectedCityId` in dependency array.
  // 
  // TRICK: Use a ref for `selectedCityId`.
  const selectedCityIdRef = useRef(selectedCityId);
  // 1. DEFINE FUNCTIONS FIRST
  const parseCharacterDoc = useCallback((doc: any, cityId: string | null): Character => {
    const data = doc.data();
    const img = new Image();
    let imageUrl = '';
    if (data.type === 'joueurs') {
      imageUrl = data.imageURLFinal || data.imageURL2 || data.imageURL;
    } else {
      imageUrl = data.imageURL2 || data.imageURL;
    }
    if (imageUrl) img.src = imageUrl;

    let charX = data.x || 0;
    let charY = data.y || 0;
    // Logic for position overrides
    if (cityId && data.positions && data.positions[cityId]) {
      charX = data.positions[cityId].x;
      charY = data.positions[cityId].y;
    }

    // Cast as any to avoid TS error if Character interface is missing currentSceneId
    const charObj: any = {
      id: doc.id,
      currentSceneId: data.currentSceneId, // 🆕 Suivi de la scène actuelle du personnage
      niveau: data.niveau || 1,
      name: data.Nomperso || '',
      x: charX,
      y: charY,
      image: img,
      imageUrl: imageUrl,
      visibility: data.visibility || 'hidden',
      visibilityRadius: (() => {
        const val = parseFloat(data.visibilityRadius);
        if (val > 2000) return 2000; // Safety cap
        return isNaN(val) ? 100 : val;
      })(),
      visibleToPlayerIds: data.visibleToPlayerIds || undefined, // 🆕 Charger la liste des joueurs autorisés
      type: data.type || 'pnj',
      PV: data.PV || 0,
      PV_Max: data.PV_Max || data.PV || 10,
      Defense: data.Defense || 5,
      Contact: data.Contact || 5,
      Distance: data.Distance || 5,
      Magie: data.Magie || 5,
      INIT: data.INIT || 5,
      FOR: data.FOR || 0,
      DEX: data.DEX || 0,
      CON: data.CON || 0,
      SAG: data.SAG || 0,
      INT: data.INT || 0,
      CHA: data.CHA || 0,
      conditions: data.conditions || [],
      scale: data.scale || 1,
      Actions: data.Actions || [],
      audio: data.audio || undefined, // 🆕 Audio data assignment
      interactions: data.interactions || undefined, // 🆕 Interactions for Vendor/NPC system
      shape: data.shape || 'circle', // 🆕 Shape property
      notes: data.notes || undefined // 🆕 Notes du personnage
    };
    return charObj;
  }, []);

  const mergeAndSetCharacters = useCallback(() => {
    // Deduplicate by ID
    const visibleIds = new Set<string>();
    const combined: Character[] = [];

    const currentCityId = selectedCityIdRef.current; // Always use FRESH cityId
    const rtdbPositions = _rtdbPosRef.current; // Positions temps réel depuis RTDB

    // Parse Global Players dynamically
    const parsedPlayers = loadedPlayersRef.current.map(doc => parseCharacterDoc(doc, currentCityId));

    // Filter Players: Check if they should be visible in this scene
    const visiblePlayers = parsedPlayers.filter(player => {
      // 1. Explicitly assigned to this scene
      if (player.currentSceneId === currentCityId) return true;

      // 2. Implicitly following the group (no assignment) AND this is the group scene
      if (!player.currentSceneId && globalCityId === currentCityId) return true;

      // 3. Otherwise, hidden from this view
      return false;
    });

    // ✅ RTDB overlay : appliquer les positions temps réel par-dessus les données Firestore
    const applyRtdbPositions = (chars: Character[]): Character[] => {
      return chars.map(char => {
        const rtdbPos = rtdbPositions[char.id];
        if (!rtdbPos) return char; // pas encore de données RTDB, garder les positions Firestore

        let x = rtdbPos.x ?? char.x;
        let y = rtdbPos.y ?? char.y;

        // Position spécifique à la ville (prioritaire)
        if (currentCityId && rtdbPos.positions?.[currentCityId]) {
          x = rtdbPos.positions[currentCityId].x;
          y = rtdbPos.positions[currentCityId].y;
        }

        return { ...char, x, y };
      });
    };

    const positionedPlayers = applyRtdbPositions(visiblePlayers);
    const positionedNPCs = applyRtdbPositions(loadedNPCsRef.current);

    [...positionedPlayers, ...positionedNPCs].forEach(char => {
      if (!visibleIds.has(char.id)) {
        visibleIds.add(char.id);
        combined.push(char);
      }
    });

    setCharacters(combined);
    setLoading(false);
  }, [globalCityId]); // ✅ Removed parseCharacterDoc - it never changes (empty deps)

  const parseCharacterDocRef = useRef(parseCharacterDoc);
  const mergeAndSetCharactersRef = useRef(mergeAndSetCharacters);

  useEffect(() => {
    parseCharacterDocRef.current = parseCharacterDoc;
  }, [parseCharacterDoc]);

  useEffect(() => {
    mergeAndSetCharactersRef.current = mergeAndSetCharacters;
    mergeAndSetCharactersRtdbRef.current = mergeAndSetCharacters;
  }, [mergeAndSetCharacters]);

  useMapData(roomId, selectedCityId, {
    setCharacters,
    setLoading,
    setLights,
    setObjects,
    setNotes,
    setDrawings,
    setFogGrid,
    setFullMapFog,
    setObstacles,
    setMusicZones,
    setMeasurements,
    setLayers,
    setPortals,
    setCurrentScene,
    setBackgroundImage,
    setBgImageObject,
    setActivePlayerId,
    setGlobalTokenScale,
    setShadowOpacity,
    setPixelsPerUnit,
    setUnitName,
    setGlobalCityId,
    setCities,
    setPlayersVersion,
    selectedCityIdRef,
    loadedPlayersRef,
    loadedNPCsRef,
    mergeAndSetCharactersRef,
    parseCharacterDocRef,
    audioVolumes,
    globalAudioRef,
    isFirstSnapshotRef,
    isMJ,
    enableHistoryTracking: isMJ,
  });

  // ─── 📡 RTDB LISTENERS pour drawings, obstacles, notes ────────────────────
  useRtdbCollections(roomId, selectedCityId, { setDrawings, setNotes, setObstacles });

  // ⚡ PERFORMANCE: Sync render states to refs
  // This prevents the main render useEffect from re-executing on every state change
  useEffect(() => { charactersRenderRef.current = characters; }, [characters]);
  useEffect(() => { objectsRenderRef.current = objects; }, [objects]);
  useEffect(() => { notesRenderRef.current = notes; }, [notes]);
  useEffect(() => { drawingsRenderRef.current = drawings; }, [drawings]);
  useEffect(() => { currentPathRenderRef.current = currentPath; }, [currentPath]);
  useEffect(() => { fogGridRenderRef.current = fogGrid; }, [fogGrid]);
  useEffect(() => { obstaclesRenderRef.current = obstacles; }, [obstacles]);
  useEffect(() => { musicZonesRenderRef.current = musicZones; }, [musicZones]);
  useEffect(() => { measurementsRenderRef.current = measurements; }, [measurements]);
  useEffect(() => { layersRenderRef.current = layers; }, [layers]);
  useEffect(() => { selectedCharacterIndexRef.current = selectedCharacterIndex; }, [selectedCharacterIndex]);
  useEffect(() => { selectedObjectIndicesRef.current = selectedObjectIndices; }, [selectedObjectIndices]);
  useEffect(() => { selectedNoteIndexRef.current = selectedNoteIndex; }, [selectedNoteIndex]);
  useEffect(() => { selectedMusicZoneIdsRef.current = selectedMusicZoneIds; }, [selectedMusicZoneIds]);
  useEffect(() => { zoomRenderRef.current = zoom; }, [zoom]);
  useEffect(() => { offsetRenderRef.current = offset; }, [offset]);
  useEffect(() => { globalTokenScaleRef.current = globalTokenScale; }, [globalTokenScale]);
  useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  useEffect(() => { showFogGridRef.current = showFogGrid; }, [showFogGrid]);
  useEffect(() => { fullMapFogRef.current = fullMapFog; }, [fullMapFog]);
  useEffect(() => { performanceModeRef.current = performanceMode; }, [performanceMode]);
  useEffect(() => { playerViewModeRef.current = playerViewMode; }, [playerViewMode]);
  useEffect(() => { isMJRef.current = isMJ; }, [isMJ]);
  useEffect(() => { persoIdRef.current = persoId; }, [persoId]);
  useEffect(() => { viewAsPersoIdRef.current = viewAsPersoId; }, [viewAsPersoId]);
  useEffect(() => { activePlayerIdRef.current = activePlayerId; }, [activePlayerId]);
  useEffect(() => { showCharBordersRef.current = showCharBorders; }, [showCharBorders]);

  // 🆕 EFFET DE SYNCHRONISATION DE SCÈNE (PRIORITÉ AU PERSONNAGE)
  useEffect(() => {
    // Si MJ, on autorise la navigation automatique si aucune ville n'est déjà sélectionnée
    ;    // On force aussi le mode 'world' (drawer) si aucune ville n'est définie
    if (isMJ) {
      if (!selectedCityId) {
        if (globalCityId) {
          setSelectedCityId(globalCityId);
          setViewMode('city');
        } else if (viewMode === 'city') {
          setViewMode('world');
        }
      }
      return;
    }

    // 🔍 Find my character in the RAW loaded players
    const myPlayerDoc = loadedPlayersRef.current.find(doc => doc.id === persoId);
    if (!myPlayerDoc) return;

    const mySceneId = myPlayerDoc.data().currentSceneId || null;

    // 1. Si mon personnage a une scène assignée, j'y vais
    if (mySceneId) {
      if (selectedCityId !== mySceneId) {
        console.log('🔀 [Sync] Moving to character scene:', mySceneId);
        setSelectedCityId(mySceneId);
        setViewMode('city');
      }
    }
    // 2. Sinon, je suis le groupe (globalCityId)
    else if (globalCityId) {
      // Seulement si je ne suis pas déjà dessus
      if (selectedCityId !== globalCityId) {
        console.log('🔀 [Sync] Moving to global group scene:', globalCityId);
        setSelectedCityId(globalCityId);
        setViewMode('city');
      }
    }
  }, [globalCityId, persoId, isMJ, selectedCityId, viewMode, playersVersion]); // ✅ playersVersion triggers when player data changes

  // 2. NOW USE THEM IN EFFECT
  useEffect(() => {
    selectedCityIdRef.current = selectedCityId;
    // Force update characters when city changes (to update player positions)
    mergeAndSetCharactersRef.current();
  }, [selectedCityId]); // ✅ Removed mergeAndSetCharacters - use ref instead

  // 📡 Listeners Firestore (per-city + global) → centralisés dans useMapData




  // 🔄 Update Container Size on Resize
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // 🔦 OPTIMIZATION: Memoize active viewer to avoid re-finding it constantly
  const activeViewer = React.useMemo(() => {
    // MJ viewing as player
    if (playerViewMode && viewAsPersoId) return characters.find(c => c.id === viewAsPersoId);
    // Player viewing as ally
    if (!isMJ && allyViewId) return characters.find(c => c.id === allyViewId);
    // Default: own character
    return characters.find(c => c.id === persoId);
  }, [characters, playerViewMode, viewAsPersoId, persoId, isMJ, allyViewId]);

  // 🆕 Liste des alliés pour les joueurs (pour le bouton vue POV)
  const playerAllies = React.useMemo(() => {
    if (isMJ) return []; // MJ n'a pas besoin de la liste d'alliés
    return characters
      .filter(char => char.visibility === 'ally')
      .map(ally => ({
        id: ally.id,
        name: ally.name,
        image: ally.image
      }));
  }, [characters, isMJ]);

  // 🆕 Centrer la caméra sur l'allié quand on change de vue (une seule fois au switch)
  const prevAllyViewIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (prevAllyViewIdRef.current === allyViewId) return;
    prevAllyViewIdRef.current = allyViewId;

    if (!bgImageObject || !containerRef.current) return;

    const centerOnCharacter = (char: Character) => {
      const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImageObject);
      const { clientWidth: containerWidth, clientHeight: containerHeight } = containerRef.current!;

      const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
      const scaledWidth = imgWidth * scale * zoom;
      const scaledHeight = imgHeight * scale * zoom;

      const charScreenX = (char.x / imgWidth) * scaledWidth;
      const charScreenY = (char.y / imgHeight) * scaledHeight;

      setOffset({ x: charScreenX - containerWidth / 2, y: charScreenY - containerHeight / 2 });
    };

    if (!isMJ && allyViewId) {
      const ally = characters.find(c => c.id === allyViewId);
      if (ally) centerOnCharacter(ally);
    } else if (!isMJ && !allyViewId) {
      const player = characters.find(c => c.id === persoId);
      if (player) centerOnCharacter(player);
    }
  }, [allyViewId, characters, isMJ, persoId, bgImageObject, zoom]);

  // 🔦 OPTIMIZATION: Memoize shadow calculations
  const lastShadowUpdateRef = React.useRef<number>(0);
  const lastShadowResultRef = React.useRef<ShadowResult | null>(null);
  const lastMapDrawTimeRef = React.useRef<number>(0); // ⚡ Ref for throttling render

  const precalculatedShadows = React.useMemo<ShadowResult | null>(() => {
    // If we are dragging a character OR obstacle, throttle updates to 50ms (20fps)
    // This prevents the expensive shadow calculation from blocking the UI thread
    if (isDraggingCharacter || isDraggingObstacle) {
      const now = Date.now();
      if (now - lastShadowUpdateRef.current < 50 && lastShadowResultRef.current) {
        return lastShadowResultRef.current;
      }
      lastShadowUpdateRef.current = now;
    }

    // ⚡ PERFORMANCE THROTTLE FOR SHADOWS
    // In Eco mode, we also throttle shadow calculations to 30fps
    const SHADOW_THROTTLE = performanceMode === 'eco' ? 33 : 0;
    if (performanceMode === 'eco' && Date.now() - lastShadowUpdateRef.current < SHADOW_THROTTLE && lastShadowResultRef.current) {
      return lastShadowResultRef.current;
    }
    lastShadowUpdateRef.current = Date.now();

    if (!bgImageObject || !activeViewer || !obstacles.length) return null;

    // Check if layer is visible (re-implement check since function dependency is tricky)
    const obstLayer = layers.find(l => l.id === 'obstacles');
    if (obstLayer && !obstLayer.isVisible) return null;

    const effectiveIsMJ = isMJ && !playerViewMode;
    if (effectiveIsMJ) return null;

    const { width, height } = getMediaDimensions(bgImageObject);
    const mapBounds = { width, height };
    const viewerPos = { x: activeViewer.x, y: activeViewer.y };

    const result = {
      shadows: calculateShadowPolygons(viewerPos, obstacles, mapBounds),
      polygonsContainingViewer: getPolygonsContainingViewer(viewerPos, obstacles)
    };

    lastShadowResultRef.current = result;
    return result;
  }, [activeViewer?.x, activeViewer?.y, obstacles, bgImageObject, isMJ, playerViewMode, layers, activeViewer, isDraggingCharacter, isDraggingObstacle]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const characterBordersCanvas = characterBordersCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !characterBordersCanvas || !fgCanvas) return;

    const sizeMultiplier = 1.5;
    const containerWidth = containerSize.width || containerRef.current?.clientWidth || bgCanvas.width;
    const containerHeight = containerSize.height || containerRef.current?.clientHeight || bgCanvas.height;

    // ONLY configure canvas dimensions and scaling
    // Do NOT render here - rendering is handled by the second useEffect
    bgCanvas.width = containerWidth * sizeMultiplier;
    bgCanvas.height = containerHeight * sizeMultiplier;
    characterBordersCanvas.width = containerWidth * sizeMultiplier;
    characterBordersCanvas.height = containerHeight * sizeMultiplier;
    fgCanvas.width = containerWidth * sizeMultiplier;
    fgCanvas.height = containerHeight * sizeMultiplier;

    const bgCtx = bgCanvas.getContext('2d')!;
    const borderCtx = characterBordersCanvas.getContext('2d')!;
    const fgCtx = fgCanvas.getContext('2d')!;

    bgCtx.scale(sizeMultiplier, sizeMultiplier);
    borderCtx.scale(sizeMultiplier, sizeMultiplier);
    fgCtx.scale(sizeMultiplier, sizeMultiplier);

    // Canvas is now configured - rendering will be handled by the second useEffect
  }, [
    // Only dependencies that affect canvas configuration
    containerSize,
    bgImageObject // Changing image may require reconfiguration
  ]);

  // ⚡ UNIFIED RENDERING EFFECT - Handles ALL canvas rendering
  // This effect triggers on data changes and manages both one-time draws and animation loops
  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const characterBordersCanvas = characterBordersCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;

    if (!bgCanvas || !characterBordersCanvas || !fgCanvas) return;

    const bgCtx = bgCanvas.getContext('2d');
    const borderCtx = characterBordersCanvas.getContext('2d');
    const fgCtx = fgCanvas.getContext('2d');

    if (!bgCtx || !borderCtx || !fgCtx) return;

    const image = bgImageObject || { width: 1920, height: 1080 } as HTMLImageElement;
    const containerWidth = containerSize.width || containerRef.current?.clientWidth || bgCanvas.width;
    const containerHeight = containerSize.height || containerRef.current?.clientHeight || bgCanvas.height;

    // Construct state objects for extracted renderers
    const bgRenderState = {
      zoom, offset, showGrid, notes, selectedNoteIndex,
      drawings, selectedDrawingIndex, portals, isMJ, selectedCityId,
      firstPortalPoint, portalPlacementMode, isLayerVisible, fontFamilyMap,
    };

    const borderRenderState = {
      zoom, offset, showCharBorders, characters, isMJ, playerViewMode,
      persoId, viewAsPersoId, activePlayerId, selectedCharacters,
      isSelectingArea, selectionStart, selectionEnd, globalTokenScale,
      showAllBadges, visibleBadges, isLayerVisible, isCharacterVisibleToUser,
    };

    const measureRenderState = {
      offset, zoom, measurements, measureMode, measureStart, measureEnd,
      measurementShape, pixelsPerUnit, unitName, isCalibrating,
      coneAngle, coneShape, coneMode, coneLength, coneWidth,
      fireballVideo, measurementSkins,
    };

    const fgRenderState = {
      zoom, offset, isMJ, playerViewMode, persoId, viewAsPersoId,
      activePlayerId, allyViewId, selectedCityId,
      characters, obstacles, effectiveMusicZones, currentPath,
      currentTool, drawingColor, drawingSize,
      fogMode, showFogGrid, visibilityMode, currentVisibilityTool,
      fullMapFog, fogGrid, fogCellSize, selectedFogCells, shadowOpacity,
      selectedMusicZoneIds, selectedCharacterIndex, audioCharacterId,
      isDrawingObstacle, currentObstaclePoints, pendingEdges,
      isVisActive, snapPoint, isDraggingObstaclePoint,
      dragFeaturePreview, selectedObstacleIds,
      isSelectingArea, selectionStart, selectionEnd, selectedCharacters,
      globalTokenScale, showCharBorders, showAllBadges, visibleBadges,
      precalculatedShadows, currentScene, spawnPointMode, isDraggingSpawnPoint,
      pixelsPerUnit, unitName,
      isLayerVisible, isCharacterVisibleToUser, calculateFogOpacity,
      getConditionIcon, iconHitRegionsRef, shadowTempCanvas, shadowExteriorCanvas,
      drawMeasurements: (ctx: CanvasRenderingContext2D, iW: number, iH: number, sW: number, sH: number) =>
        drawMeasurements(ctx, iW, iH, sW, sH, measureRenderState),
    };

    // Determine if we need continuous animation
    const hasAnimatedMeasurement =
      (selectedSkin && measureMode && (measurementShape === 'circle' || measurementShape === 'cone')) ||
      measurements.some(m => (m.type === 'circle' || m.type === 'cone') && m.skin);

    const shouldAnimate = performanceMode !== 'static' && (image instanceof HTMLVideoElement || hasAnimatedMeasurement);

    let animationFrameId: number | undefined;

    if (shouldAnimate) {
      // ANIMATION LOOP MODE - for videos and animated measurements
      // OPTIMIZATION: Only redraw what changes each frame

      // Draw static layers ONCE
      drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight, bgRenderState);
      drawCharacterBorders(borderCtx, image, containerWidth, containerHeight, borderRenderState);

      let lastFrameTime = 0;
      const fpsInterval = 1000 / 30; // 30fps for smooth animations with good performance

      const renderLoop = (timestamp: number) => {
        const elapsed = timestamp - lastFrameTime;
        if (elapsed > fpsInterval) {
          lastFrameTime = timestamp - (elapsed % fpsInterval);

          // Only redraw background if it's a video (changes each frame)
          if (image instanceof HTMLVideoElement) {
            drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight, bgRenderState);
          }

          // OPTIMIZATION: Only redraw foreground (where measurements are)
          // Background and borders are static, no need to redraw every frame
          drawForegroundLayers(fgCtx, image, containerWidth, containerHeight, fgRenderState);
        }

        animationFrameId = requestAnimationFrame(renderLoop);
      };

      animationFrameId = requestAnimationFrame(renderLoop);
    } else {
      // ONE-TIME DRAW MODE - for static content
      // Use requestAnimationFrame to ensure smooth rendering in sync with browser
      animationFrameId = requestAnimationFrame(() => {
        drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight, bgRenderState);
        drawCharacterBorders(borderCtx, image, containerWidth, containerHeight, borderRenderState);
        drawForegroundLayers(fgCtx, image, containerWidth, containerHeight, fgRenderState);
      });
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [
    // Only the data that affects what's drawn, not canvas configuration
    characters, objects, notes, drawings, currentPath, fogGrid, obstacles,
    musicZones, portals, measurements, layers, zoom, offset, showGrid, showFogGrid,
    fullMapFog, selectedCharacterIndex, selectedObjectIndices, selectedNoteIndex,
    selectedMusicZoneIds, globalTokenScale, performanceMode, playerViewMode,
    isMJ, viewAsPersoId, activePlayerId, showCharBorders, showAllBadges, visibleBadges,
    // Interactive state
    isSelectingArea, selectionStart, selectionEnd, selectedCharacters,
    isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions,
    isDraggingNote, draggedNoteIndex, isDraggingObject, draggedObjectIndex,
    draggedObjectsOriginalPositions, isFogDragging, measureMode, measureStart,
    measureEnd, pixelsPerUnit, unitName, isCalibrating, visibilityMode,
    selectedObstacleIds, currentObstaclePoints, snapPoint, currentVisibilityTool,
    isDraggingObstaclePoint, isDraggingObstacle, isMusicMode, isDraggingMusicZone,
    currentMeasurementId, bgImageObject, containerSize,
    // Animation-related dependencies
    selectedSkin, measurementShape, fireballVideo,
    // 🆕 Spawn point dependencies
    currentScene, spawnPointMode, isDraggingSpawnPoint,
    // Drag & drop preview
    dragFeaturePreview
  ]);

  // 🎥 TOKEN VIDEO PAUSE LOGIC (Separate Effect)
  useEffect(() => {
    if (performanceMode === 'static') {
      const videos = containerRef.current?.querySelectorAll('video');
      videos?.forEach(v => v.pause());
    } else {
      const videos = containerRef.current?.querySelectorAll('video');
      videos?.forEach(v => v.play().catch(() => { }));
    }
  }, [performanceMode, characters]);





  //  NPC Template Drag & Drop Handlers
  const handleTemplateDragStart = (template: NPC) => {
    setDraggedTemplate(template)
  }

  const handleObjectDragStart = (template: ObjectTemplate) => {
  }

  const handleSoundDragStart = (sound: any) => {
    setDraggedSoundTemplate(sound)
  }

  // Obstacle actions — delegates to extracted hook (must be before useDragAndDrop which uses saveObstacle)
  const {
    saveObstacle, deleteObstacle, updateObstacle,
    toggleDoorState, toggleLockDoor,
    handleObstacleDelete, handleObstacleDeleteConnected,
    handleObstacleInvertDirection, handleObstacleConvertTo,
    handleToggleRoomMode, clearAllObstacles,
  } = useObstacleActions({
    roomId, isMJ, selectedCityId,
    obstacles, setObstacles, setSelectedObstacleIds,
    addToRtdbWithHistory, updateRtdbWithHistory, deleteFromRtdbWithHistory,
  });

  // Drag & drop — delegates to extracted hook
  const {
    handleCanvasDrop, handleCanvasDragOver,
    handlePlaceConfirm, handlePlaceObjectConfirm,
  } = useDragAndDrop({
    bgCanvasRef, containerRef, bgImageObject,
    zoom, offset, roomId, selectedCityId,
    obstacles, visibilityMode,
    showPlaceModal, setShowPlaceModal,
    showPlaceObjectModal, setShowPlaceObjectModal,
    draggedTemplate, setDraggedTemplate,
    dropPosition, setDropPosition,
    draggedObjectTemplateForPlace, setDraggedObjectTemplateForPlace,
    dropObjectPosition, setDropObjectPosition,
    dragFeaturePreview, setDragFeaturePreview,
    addWithHistory, deleteFromRtdbWithHistory, saveObstacle,
  });

  // Firebase Functions

  //  Configuration du menu radial
  const radialMenuItems = isMJ ? [
    { id: 1, label: 'Ajouter Personnage', icon: CircleUserRound },
    { id: 2, label: 'Objets', icon: Package },
    { id: 11, label: 'Ajouter Texte', icon: Baseline },
    { id: 3, label: 'Dessiner', icon: Pencil },
    { id: 4, label: 'Visibilité', icon: Eye }, // 🔦 Mode unifié brouillard + obstacles
    { id: 5, label: showGrid ? 'Masquer grille' : 'Afficher grille', icon: Grid },
    { id: 6, label: 'Effacer dessins', icon: Trash2 },
    { id: 7, label: 'Changer fond', icon: ImagePlus },
    { id: 9, label: playerViewMode ? 'Vue MJ' : 'Vue Joueur', icon: playerViewMode ? ScanEye : User },
    { id: 10, label: 'Mesurer', icon: Ruler },
    { id: 12, label: 'Calques', icon: Layers },
    { id: 13, label: 'Musique', icon: Music },
    { id: 14, label: 'Options', icon: BookOpen },
  ] : [
    { id: 1, label: 'Ajouter Texte', icon: Baseline },
    { id: 2, label: 'Dessiner', icon: Pencil },
    { id: 3, label: showGrid ? 'Masquer grille' : 'Afficher grille', icon: Grid },
    { id: 5, label: 'Effacer dessins', icon: Trash2 },
    { id: 6, label: 'Mesurer', icon: Ruler },
  ];

  //  Calculer les IDs des outils actuellement actifs (peut être plusieurs)
  const getActiveToolIds = (): number[] => {
    const activeIds: number[] = [];

    if (isMJ) {
      // Menu MJ
      if (drawMode) activeIds.push(3); // Dessiner
      if (visibilityMode) activeIds.push(4); // Mode Visibilité (brouillard + obstacles)
      if (showGrid) activeIds.push(5); // Afficher grille
      if (panMode) activeIds.push(8); // Déplacer carte
      if (playerViewMode) activeIds.push(9); // Vue Joueur
      if (measureMode) activeIds.push(10); // Mesurer
      if (isMusicMode) activeIds.push(13); // Musique
    } else {
      // Menu Joueur
      if (drawMode) activeIds.push(2); // Dessiner
      if (showGrid) activeIds.push(3); // Afficher grille
      if (panMode) activeIds.push(4); // Déplacer carte
      if (measureMode) activeIds.push(6); // Mesurer
    }

    return activeIds;
  };

  const togglePanMode = () => {
    setPanMode(!panMode);
    // Désélectionner les éléments sélectionnés lors de l'activation
    if (!panMode) {
      setSelectedCharacterIndex(null);
      setSelectedNoteIndex(null);
    }
  };

  // toggleVisibilityMode and buildEdgeMeta are now in useVisibilityState hook

  const handleRadialMenuSelect = (item: { id: number; label: string; icon: any }) => {
    //  Désactiver les outils incompatibles avant d'activer le nouveau
    const desactiverOutilsIncompatibles = (toolId: number) => {
      if (isMJ) {
        // Pour le MJ : ID 3 (Dessin), ID 4 (Visibilité), ID 8 (Déplacement), ID 10 (Mesure), ID 13 (Musique) sont incompatibles
        if ([3, 4, 8, 10, 13].includes(toolId)) {
          if (toolId !== 3 && drawMode) setDrawMode(false);
          if (toolId !== 4 && visibilityMode) {
            setVisibilityMode(false);
            setIsDrawingObstacle(false);
            setCurrentObstaclePoints([]);
            setFogMode(false);
          }
          if (toolId !== 2 && isObjectDrawerOpen) setIsObjectDrawerOpen(false); // Close Object Drawer if other tool
          if (toolId !== 8 && panMode) setPanMode(false);
          if (toolId !== 10 && measureMode) setMeasureMode(false);
          if (toolId !== 13 && isMusicMode) setIsMusicMode(false);
        }
      } else {
        // Pour le joueur : ID 2 (Dessin), ID 4 (Déplacement), ID 6 (Mesure) sont incompatibles
        if ([2, 4, 6].includes(toolId)) {
          if (toolId !== 2 && drawMode) setDrawMode(false);
          if (toolId !== 4 && panMode) setPanMode(false);
          if (toolId !== 6 && measureMode) setMeasureMode(false);
        }
      }
    };

    if (isMJ) {
      // Menu MJ
      switch (item.id) {
        case 1:
          // Ajouter Personnage - Ouvrir le drawer de templates
          setIsNPCDrawerOpen(true);
          break;
        case 2:
          // Objets
          setIsObjectDrawerOpen(!isObjectDrawerOpen);
          setIsNPCDrawerOpen(false);
          break;
        case 11:
          // Ajouter Texte
          handleAddNote();
          break;
        case 3:
          // Dessiner
          desactiverOutilsIncompatibles(3);
          toggleDrawMode();
          break;
        case 4:
          // Mode Visibilité (brouillard + obstacles unifiés)
          desactiverOutilsIncompatibles(4);
          toggleVisibilityMode();
          break;
        case 5:
          // Toggle grille
          setShowGrid(!showGrid);
          break;
        case 6:
          // Effacer dessins
          clearDrawings();
          break;
        case 7:
          // Changer fond
          fileInputRef.current?.click();
          break;
        case 8:
          // Déplacer carte
          desactiverOutilsIncompatibles(8);
          togglePanMode();
          break;
        case 9:
          // Toggle Vue Joueur
          setPlayerViewMode(!playerViewMode);
          break;
        case 10:
          // Mesurer
          desactiverOutilsIncompatibles(10);
          setMeasureMode(!measureMode);
          setMeasureStart(null);
          setMeasureEnd(null);
          break;
        case 12:
          setShowLayerControl(!showLayerControl);
          break;
        case 13:
          // Musique
          desactiverOutilsIncompatibles(13);
          setIsMusicMode(!isMusicMode);
          break;
        case 12:
          // Toggle Layer Control for MJ
          setShowLayerControl(!showLayerControl);
          break;
        case 14:
          setShowGlobalSettingsDialog(true);
          break;
      }
    } else {
      // Menu Joueur
      switch (item.id) {
        case 1:
          // Ajouter Texte
          handleAddNote();
          break;
        case 2:
          // Dessiner
          desactiverOutilsIncompatibles(2);
          toggleDrawMode();
          break;
        case 3:
          // Toggle grille
          setShowGrid(!showGrid);
          break;
        case 4:
          // Déplacer carte
          desactiverOutilsIncompatibles(4);
          togglePanMode();
          break;
        case 5:
          // Effacer dessins
          clearDrawings();
          break;
        case 6:
          // Mesurer
          desactiverOutilsIncompatibles(6);
          setMeasureMode(!measureMode);
          setMeasureStart(null);
          setMeasureEnd(null);
          setIsCalibrating(false);
          break;
        case 7:
          // Toggle Layer Control for Player
          setShowLayerControl(!showLayerControl);
          break;
      }
    }
  };

  // handleToolbarAction, getActiveToolbarTools, getToolOptionsContent
  // are now in useToolbarActions hook (called after toggleDrawMode/clearDrawings below)

  const handleAttack = () => {


    if (selectedCharacterIndex !== null) {
      const targetCharacter = characters[selectedCharacterIndex];


      if (targetCharacter && targetCharacter.id) {


        if (isMJ) {
          // Pour le MJ : l'attaquant est le personnage actif (en rouge)
          if (activePlayerId) {
            setAttackerId(activePlayerId);
            setTargetId(targetCharacter.id);
            setCombatOpen(true);

          } else {

          }
        } else {
          // Pour les joueurs : l'attaquant est leur personnage
          if (persoId) {
            setAttackerId(persoId);
            setTargetId(targetCharacter.id);
            setCombatOpen(true);

          } else {

          }
        }
      } else {

      }
    } else {

    }

  };


  //  NAVIGATION FUNCTIONS
  const navigateToCity = async (cityId: string) => {
    setSelectedCityId(cityId);
    setViewMode('city');
    // Reset tool modes when entering city
    setDrawMode(false);
    setFogMode(false);
    setPanMode(false);
    setMeasureMode(false);

    // 🆕 Synchroniser la ville actuelle dans Firebase pour MJcombat et autres composants
    if (roomId) {
      await setDoc(doc(db, 'cartes', roomId, 'settings', 'general'), {
        currentCityId: cityId,
      }, { merge: true });
    }
  };

  const navigateToWorldMap = async () => {
    // Limiter la navigation à la world map au MJ uniquement
    if (!isMJ) {

      return;
    }

    // Close other drawers
    setIsAudioMixerOpen(false);
    setIsNPCDrawerOpen(false);
    setIsObjectDrawerOpen(false);
    setIsSoundDrawerOpen(false);

    // setSelectedCityId(null); // Keep the current city selected so we can "cancel" back to it
    setViewMode('world');
    // Reset selections when going back to world
    setSelectedCharacterIndex(null);
    setSelectedNoteIndex(null);
    setSelectedDrawingIndex(null);

    // 🆕 Effacer la ville actuelle dans Firebase (pour indiquer qu'on est sur la world map)
    if (roomId) {

      await setDoc(doc(db, 'cartes', roomId, 'settings', 'general'), {
        currentCityId: null,
      }, { merge: true });
    }
  };


  const INITializeFirebaseListeners = (_room: string) => {
    // 📡 Les listeners Firestore (settings/general, cities, etc.) sont maintenant
    // centralisés dans useMapData et ne dépendent plus de l'état d'authentification.
    // Cette fonction ne fait plus rien de spécial — elle existe pour compatibilité
    // avec le onAuthStateChanged ci-dessus.
    return () => { };
  };



  // Visibility checks — delegates to extracted pure functions
  const isCharacterVisibleToUser = (char: Character): boolean => {
    const ctx: CharacterVisibilityContext = {
      isMJ, playerViewMode, persoId, viewAsPersoId,
      obstacles, bgImage: bgImageObject, characters, lights, pixelsPerUnit,
      fullMapFog, fogGrid, fogCellSize, zoom, offset,
      containerSize: containerRef.current
        ? { width: containerRef.current.clientWidth, height: containerRef.current.clientHeight }
        : null,
      canvasRect: bgCanvasRef.current
        ? (() => { const r = bgCanvasRef.current!.getBoundingClientRect(); return { width: r.width, height: r.height }; })()
        : null,
    };
    return checkCharacterVisibility(char, ctx);
  };

  const isObjectVisibleToUser = (obj: MapObject): boolean => {
    const ctx: VisibilityContext = { isMJ, playerViewMode, persoId, viewAsPersoId };
    return checkObjectVisibility(obj, ctx);
  };


  const handleBackgroundChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && roomId) {
      try {
        const storage = getStorage();
        // Create a reference to where the image will be stored in Firebase Storage
        const storageRef = ref(storage, `backgrounds/${roomId}/${file.name}-${Date.now()}`);

        // Upload the image file
        await uploadBytes(storageRef, file);

        // Get the download URL for the uploaded file
        const downloadURL = await getDownloadURL(storageRef);

        // 🆕 Sauvegarder selon le mode (ville ou global)
        if (selectedCityId) {
          // Mode ville : sauvegarder dans la ville spécifique

          await updateDoc(doc(db, 'cartes', roomId, 'cities', selectedCityId), {
            backgroundUrl: downloadURL,
          });
        } else {
          // Mode global : sauvegarder dans fond1 (pour compatibilité)

          await setDoc(doc(db, 'cartes', roomId, 'fond', 'fond1'), {
            url: downloadURL,
          }, { merge: true });
        }

        // Set the background image locally (optional, if needed for immediate display)
        setBackgroundImage(downloadURL);
      } catch (error) {
        console.error("Error uploading background image:", error);
      }
    }
  };

  const handleBackgroundSelectLocal = async (path: string) => {
    if (!roomId) return;

    try {
      // Sauvegarder selon le mode (ville ou global)
      if (selectedCityId) {
        // Mode ville : sauvegarder dans la ville spécifique
        await updateDoc(doc(db, 'cartes', roomId, 'cities', selectedCityId), {
          backgroundUrl: path,
        });
      } else {
        // Mode global : sauvegarder dans fond1 (pour compatibilité)
        await setDoc(doc(db, 'cartes', roomId, 'fond', 'fond1'), {
          url: path,
        }, { merge: true });
      }

      // Set the background image locally for immediate display
      setBackgroundImage(path);
    } catch (error) {
      console.error("Error setting background from local file:", error);
    }
  };


  const handleCharacterSubmit = async () => {
    // Legacy function - kept just in case but shouldn't be used with NPCManager
  };





  //  CALIBRATION SUBMIT
  const handleCalibrationSubmit = async () => {
    const distanceVal = parseFloat(tempCalibrationDistance);
    console.log(' Calibration submit:', { distanceVal, measureStart, measureEnd, roomId });
    if (!isNaN(distanceVal) && distanceVal > 0 && measureStart && measureEnd && roomId) {
      // Calculate pixel distance in WORLD space (image coordinates)
      // measureStart and measureEnd are already in world/image pixel coordinates
      const worldPixelDist = calculateDistance(measureStart.x, measureStart.y, measureEnd.x, measureEnd.y);
      const newPixelsPerUnit = worldPixelDist / distanceVal;

      // Save to Firebase
      try {
        const settingsRef = doc(db, 'cartes', String(roomId), 'settings', 'general');
        await setDoc(settingsRef, {
          pixelsPerUnit: newPixelsPerUnit
        }, { merge: true });

        // Update local state immediately
        setPixelsPerUnit(newPixelsPerUnit);

        // Reset calibration state
        setIsCalibrating(false);
        setMeasureStart(null);
        setMeasureEnd(null);
        setCalibrationDialogOpen(false);
        setTempCalibrationDistance('');
      } catch (e) {
        console.error("Error saving calibration:", e);
      }
    }
  };

  const handleClearMeasurements = () => {
    // Delete ALL measurements (requested by user)
    measurements.forEach(m => {
      deleteDoc(doc(db, 'cartes', roomId, 'measurements', m.id)).catch(console.error);
    });
    // Also clear active
    setMeasureStart(null);
    setMeasureEnd(null);
    setCurrentMeasurementId(null);
  };

  const handleMeasurementAction = (action: string, measurementId: string) => {
    if (action === 'delete') {
      deleteDoc(doc(db, 'cartes', roomId, 'measurements', measurementId)).catch(console.error);
      if (currentMeasurementId === measurementId) {
        setCurrentMeasurementId(null);
        setMeasureStart(null);
        setMeasureEnd(null);
      }
      setContextMenuMeasurementOpen(false);
    } else if (action === 'attack') {
      // Disable measure mode to prevent accidental new measurements
      setMeasureMode(false);

      const measurement = measurements.find(m => m.id === measurementId);
      console.log("DEBUG: handleMeasurementAction", { measurementId, found: !!measurement });
      if (!measurement || !bgImageObject) {
        console.warn("DEBUG: Missing measurement or bgImageObject", { measurement, bgImageObject: !!bgImageObject });
        return;
      }

      // Calculate inputs for isPointInMeasurement
      const image = bgImageObject;
      const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
      const containerWidth = containerSize.width || containerRef.current?.clientWidth || 0;
      const containerHeight = containerSize.height || containerRef.current?.clientHeight || 0;
      const zoomScale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);

      // Find characters inside
      const targetsInZone = characters.filter(char => {
        // Ensure char has valid coordinates
        if (typeof char.x !== 'number' || typeof char.y !== 'number') return false;

        // Exclude self (attacker) if needed, but for now include all
        // Maybe exclude dead ones?

        const isInside = isPointInMeasurement(
          { x: char.x, y: char.y },
          measurement,
          pixelsPerUnit,
          zoomScale, // Pass the base scale used for rendering
          zoom // Pass user zoom, though isPointInMeasurement math for circle/cone/cube might not strictly need it if world coords are used correctly, but passing for compatibility
        );
        // console.log(`DEBUG: Checking char ${char.name} (${char.id})`, isInside);
        return isInside;
      });


      if (targetsInZone.length > 0) {
        setTargetIds(targetsInZone.map(c => c.id));
        setTargetId(null); // Clear single target

        // Define attacker (current user's character or MJ selected)
        const myCharId = viewAsPersoId || persoId;

        if (myCharId) {
          setAttackerId(myCharId);
        } else if (isMJ) {
          // Priority 1: Selected Token
          if (selectedCharacterIndex !== null && characters[selectedCharacterIndex]) {
            setAttackerId(characters[selectedCharacterIndex].id);
          }
          // Priority 2: Active Player in Combat (Red Token)
          else if (activePlayerId) {
            setAttackerId(activePlayerId);
          }
          // Priority 3: First character in list (Fallback)
          else if (characters.length > 0) {
            setAttackerId(characters[0].id);
          }
        }

        setCombatOpen(true);
      } else {
        // notification? "Aucune cible dans la zone"
        console.log("No targets in measurement zone");
      }
      setContextMenuMeasurementOpen(false);
    }
  };

  const handleCharacterImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // Obtenez une référence vers Firebase Storage
        const storage = getStorage();
        const imageRef = ref(storage, `characters/${file.name}-${Date.now()}`);
        // Téléchargez l'image dans Firebase Storage
        await uploadBytes(imageRef, file);
        // Obtenez l'URL de téléchargement de l'image
        const downloadURL = await getDownloadURL(imageRef);
        // Mettez à jour l'état avec l'URL de téléchargement au lieu du Data URL
        setNewCharacter((prevCharacter: NewCharacter) => ({
          ...prevCharacter,
          image: { src: downloadURL } // Stockez uniquement l'URL ici
        }));
      } catch (error) {
        console.error("Erreur lors du chargement de l'image dans Firebase Storage :", error);
      }
    }
  };

  const handleAddNote = async () => {
    setEditingNote(null);
    setShowCreateNoteModal(true);
  };

  const handleCreateNoteConfirm = async (note: { text: string, color: string, fontSize: number, fontFamily: string }) => {
    const roomIdStr = String(roomId);

    if (note.text.trim() && typeof roomIdStr === 'string') {
      try {
        if (editingNote && editingNote.id) {
          await updateRtdbWithHistory(
            'notes',
            editingNote.id,
            {
              content: note.text,
              color: note.color,
              fontSize: note.fontSize,
              fontFamily: note.fontFamily
            },
            `Modification du texte`
          );
        } else if (containerRef.current) {
          const container = containerRef.current;
          let centerX = (container.clientWidth / 2 - offset.x) / zoom;
          let centerY = (container.clientHeight / 2 - offset.y) / zoom;

          // 🆕 Center on background media if available
          if (bgImageObject) {
            const { width, height } = getMediaDimensions(bgImageObject);
            centerX = width / 2;
            centerY = height / 2;
          }

          const noteData = {
            content: note.text,
            color: note.color,
            fontSize: note.fontSize,
            fontFamily: note.fontFamily,
            x: centerX,
            y: centerY,
            cityId: selectedCityId
          };

          await addToRtdbWithHistory(
            'notes',
            noteData,
            `Ajout de la note "${note.text.substring(0, 30)}${note.text.length > 30 ? '...' : ''}"`
          );
          toast.success("Note créée")
        }
        setShowCreateNoteModal(false);
        setEditingNote(null);
      } catch (error) {
        console.error("Erreur lors de l'ajout/modification de la note :", error);
      }
    }
  };


  //  Handle Object Resize Start
  const handleResizeStart = (e: React.MouseEvent, index: number) => {
    e.stopPropagation(); // Prevent drag start
    e.preventDefault();

    if (!bgImageObject || !bgCanvasRef.current) return;

    // Calculate center and initial distance
    const obj = objects[index];
    const image = bgImageObject;
    const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
    const rect = bgCanvasRef.current.getBoundingClientRect();

    // Screen coordinates of mouse
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Better: retrieve exact render parameters. Since we are in the component, we can recalculate or use refs if we stored them.
    // Let's recalculate quickly as in useEffect
    const containerWidth = containerSize.width || containerRef.current?.clientWidth || 0;
    const containerHeight = containerSize.height || containerRef.current?.clientHeight || 0;
    const zoomScale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
    const scaledWidth = imgWidth * zoomScale * zoom;
    const scaledHeight = imgHeight * zoomScale * zoom;

    const objScreenX = (obj.x / imgWidth) * scaledWidth - offset.x + rect.left;
    const objScreenY = (obj.y / imgHeight) * scaledHeight - offset.y + rect.top;
    const objScreenW = (obj.width / imgWidth) * scaledWidth;
    const objScreenH = (obj.height / imgHeight) * scaledHeight;

    const centerX = objScreenX + objScreenW / 2;
    const centerY = objScreenY + objScreenH / 2;

    const dist = Math.sqrt(Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2));

    setIsResizingObject(true);
    setResizeStartData({
      index,
      initialWidth: obj.width,
      initialHeight: obj.height,
      initialMouseDist: dist,
      centerX,
      centerY
    });
  };

  // handleCanvasMouseDown, handleCanvasDoubleClick
  // extracted to useCanvasMouseDown hook
  const { handleCanvasMouseDown, handleCanvasDoubleClick } = useCanvasMouseDown({
    bgCanvasRef, containerRef, bgImageObject,
    zoom, offset,
    roomId, isMJ, persoId, userId, selectedCityId,
    playerViewMode, viewAsPersoId,
    characters, notes, drawings, obstacles, musicZones, measurements, lights,
    fogGrid, fogCellSize, fullMapFog, fogMode,
    visibilityMode, isVisActive, currentVisibilityTool,
    isDrawingObstacle, currentObstaclePoints, snapPoint, pendingEdges, selectedObstacleIds,
    isLightPlacementMode, portalMode, portalPlacementMode,
    firstPortalPoint, firstPortalId,
    spawnPointMode, currentScene,
    isMusicMode, selectedMusicZoneIds,
    measureMode, measureStart, measureEnd, measurementShape, currentMeasurementId,
    coneWidth, coneAngle, coneShape,
    selectedSkin, isPermanent, unitName,
    panMode, drawMode, currentTool, drawingSize,
    multiSelectMode, showAllBadges,
    activeElementType, activeElementId,
    selectedCharacterIndex, selectedCharacters,
    selectedNoteIndex, selectedDrawingIndex, selectedObjectIndices, selectedFogCells,
    mouseClickStartRef, dragStartPosRef,
    setMouseButton, setIsDragging, setDragStart,
    setIsLightPlacementMode,
    setNewPortalPos, setEditingPortal, setShowPortalConfig,
    setFirstPortalPoint, setFirstPortalId,
    setSpawnPointMode, setCurrentScene,
    setNewMusicZonePos, setShowMusicDialog,
    setIsDraggingMusicZone, setDraggedMusicZoneId, setDraggedMusicZonesOriginalPositions,
    setIsResizingMusicZone, setResizingMusicZoneId, setSelectedMusicZoneIds,
    setIsFogDragging, setLastFogCell, setIsFogAddMode, setSelectedFogCells,
    setMeasureStart, setMeasureEnd, setIsMeasurementPanelOpen,
    setCurrentMeasurementId, setContextMenuMeasurementId, setContextMenuMeasurementOpen,
    setSelectedObstacleIds, setIsDrawingObstacle, setCurrentObstaclePoints, setPendingEdges,
    setIsDraggingObstaclePoint, setDraggedPointIndex, setDraggedObstacleOriginalPoints,
    setConnectedPoints, setDragStartPos,
    setIsDraggingObstacle, setDraggedObstacleId, setDraggedObstaclesOriginalPoints,
    setSelectedCharacterIndex, setSelectedCharacters,
    setIsDraggingCharacter, setDraggedCharacterIndex, setDraggedCharactersOriginalPositions,
    setVisibleBadges,
    setSelectedNoteIndex, setIsDraggingNote, setDraggedNoteIndex, setDraggedNoteOriginalPos,
    setSelectedDrawingIndex, setIsDraggingDrawing, setDraggedDrawingOriginalPoints,
    setIsResizingDrawing, setDraggedHandleIndex,
    setIsDrawing, setCurrentPath, setDrawings,
    setSelectedObjectIndices,
    setSelectedFogIndex,
    setContextMenuOpen, setContextMenuCharacterId,
    setSelectionStart, setIsSelectingArea,
    setDetectedElements, setSelectionMenuPosition, setShowElementSelectionMenu,
    addFogCellIfNew, saveObstacle, deleteFromRtdbWithHistory,
    isCharacterVisibleToUser, isLayerVisible, detectElementsAtPosition, clearFocus,
  });

  // handleCanvasMouseMove
  // extracted to useCanvasMouseMove hook
  const { handleCanvasMouseMove } = useCanvasMouseMove({
    bgCanvasRef, containerRef, bgImageObject,
    zoom, offset,
    roomId, isMJ,
    iconHitRegionsRef, hoveredConditionRef, setHoveredCondition,
    isResizingObject, resizeStartData,
    isFogDragging, isFogAddMode, fogMode, isVisActive, currentVisibilityTool,
    addFogCellIfNew,
    obstacles, setSnapPoint,
    isDraggingObstaclePoint, connectedPoints, dragStartPosRef,
    isDraggingEdge, draggedEdgeIndex, draggedEdgeObstacleId, draggedEdgeOriginalPoints,
    isDraggingObstacle, dragStartPos, draggedObstaclesOriginalPoints,
    draggedObstacleId, draggedObstacleOriginalPoints,
    measureMode, measureStart, measurementShape,
    coneMode, coneLength, globalTokenScale, pixelsPerUnit,
    currentMeasurementId,
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
    setObjects, setObstacles, setMeasureEnd, setMusicZones,
    setCharacters, setOffset, setDragStart, setDrawings, setNotes,
    setDropPosition, setLights, setPortals,
    setSelectedCharacters, setSelectionEnd, setCurrentPath, setSelectedDrawingIndex,
    deleteFromRtdbWithHistory,
  });

  // handleCanvasMouseUp
  // extracted to useCanvasMouseUp hook
  const { handleCanvasMouseUp } = useCanvasMouseUp({
    bgCanvasRef, containerRef, bgImageObject,
    zoom, offset,
    roomId, isMJ, selectedCityId,
    mouseButton, setMouseButton, mouseClickStartRef,
    isDragging, setIsDragging, dragStart, setDragStart, panMode,
    isCalibrating, measureMode, measureStart, measureEnd, currentMeasurementId,
    setCalibrationDialogOpen,
    setContextMenuMeasurementId, setContextMenuMeasurementOpen,
    setCurrentMeasurementId, setMeasureStart, setMeasureEnd,
    isDraggingEdge, draggedEdgeObstacleId,
    setIsDraggingEdge, setDraggedEdgeIndex, setDraggedEdgeObstacleId, setDraggedEdgeOriginalPoints,
    isResizingObject, resizeStartData,
    setIsResizingObject, setResizeStartData,
    isDraggingObstaclePoint, selectedObstacleIds, connectedPoints,
    setIsDraggingObstaclePoint, setDraggedPointIndex,
    setConnectedPoints, setDragStartPos,
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
    setDraggedObstacleOriginalPoints, setDraggedObstaclesOriginalPoints,
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
  });





  // 📡 Listener combat/state → centralisé dans useMapData (doublon supprimé ici)

  // toggleFogMode and handleFullMapFogChange are now in useVisibilityState hook





  const handleDeleteSelectedCharacters = async () => {
    if (selectedCharacters.length > 0 && roomId && isMJ) {
      // Collect valid characters to delete (objects, not just indices)
      const charsToDelete = selectedCharacters
        .map(index => characters[index])
        .filter(c => c && c.type !== 'joueurs');

      if (charsToDelete.length > 0) {
        setSelectedCharacters([]);

        const deletePromises = charsToDelete.map(async (char) => {
          if (char?.id) {
            await deleteDoc(doc(db, 'cartes', String(roomId), 'characters', char.id));
            toast.success(`Personnages "${char.name}" supprimé`);
          }
        });

        await Promise.all(deletePromises);

        const deletedIds = charsToDelete.map((c: Character) => c.id);
        setCharacters(prev => prev.filter(c => !deletedIds.includes(c.id)));
      } else {
        setSelectedCharacters([]);
      }
    }
  };




  const handleDeleteNote = async () => {
    const roomIdStr = String(roomId);
    if (selectedNoteIndex !== null && typeof roomIdStr === 'string') {
      const noteToDelete = notes[selectedNoteIndex];
      if (noteToDelete && typeof noteToDelete.id === 'string') {
        try {
          setSelectedNoteIndex(null);
          await deleteFromRtdbWithHistory(
            'notes',
            noteToDelete.id,
            `Suppression de la note "${noteToDelete.text}"`
          );
          setNotes((prevNotes) => prevNotes.filter((n) => n.id !== noteToDelete.id));
          toast.success(`Note "${noteToDelete.text}" supprimée`);
        } catch (error) {
          console.error("Erreur lors de la suppression de la note :", error);
          toast.error(`Erreur lors de la suppression de la note "${noteToDelete.text}"`);
        }
      }
    }
  };

  const handleEditNote = () => {
    if (selectedNoteIndex !== null) {
      setEditingNote(notes[selectedNoteIndex]);
      setShowCreateNoteModal(true);
      toast.success(`Note "${notes[selectedNoteIndex].text}" modifiée`);
    }
  };

  const toggleDrawMode = () => {
    setDrawMode(!drawMode)
    setSelectedCharacterIndex(null)
    setSelectedNoteIndex(null)
  }

  const clearDrawings = async () => {
    if (!roomId) return;
    try {
      const currentDrawings = drawings;
      if (currentDrawings.length === 0) return;
      const deletePromises = currentDrawings.map(d => deleteFromRtdbWithHistory('drawings', d.id, 'Suppression groupée'));
      await Promise.all(deletePromises);
      toast.success("les dessin ont bien été éffacés")
    } catch (error) {
      console.error('Error clearing drawings:', error);
    }
  };

  // Toolbar actions — delegates to extracted hook
  const { handleToolbarAction, getActiveToolbarTools, getToolOptionsContent } = useToolbarActions({
    roomId, isMJ,
    drawMode, setDrawMode,
    panMode, setPanMode,
    measureMode, setMeasureMode,
    visibilityMode, setVisibilityMode,
    isMusicMode, setIsMusicMode,
    multiSelectMode, setMultiSelectMode,
    portalMode, setPortalMode,
    spawnPointMode, setSpawnPointMode,
    isLightPlacementMode, setIsLightPlacementMode,
    isBackgroundEditMode, setIsBackgroundEditMode,
    isObjectDrawerOpen, setIsObjectDrawerOpen,
    isNPCDrawerOpen, setIsNPCDrawerOpen,
    isSoundDrawerOpen, setIsSoundDrawerOpen,
    isAudioMixerOpen, setIsAudioMixerOpen,
    isUnifiedSearchOpen, setIsUnifiedSearchOpen,
    setIsDrawingObstacle, setCurrentObstaclePoints, setFogMode,
    viewMode, setViewMode,
    showGrid, setShowGrid,
    showCharBorders, setShowCharBorders,
    showLayerControl, setShowLayerControl,
    showAllBadges, setShowAllBadges,
    setShowBackgroundSelector,
    playerViewMode, setPlayerViewMode,
    viewAsPersoId, setViewAsPersoId,
    allyViewMode, setAllyViewMode,
    allyViewId, setAllyViewId,
    setZoom,
    setMeasureStart, setMeasureEnd,
    isCalibrating, setIsCalibrating,
    currentTool, setCurrentTool,
    drawingColor, setDrawingColor,
    drawingSize, setDrawingSize,
    selectedDrawingIndex, setSelectedDrawingIndex,
    selectedNoteIndex, setSelectedNoteIndex,
    selectedFogCells, setSelectedFogCells,
    selectedFogIndex,
    selectedCharacters, setSelectedCharacters,
    characters, drawings, notes,
    fogGrid, setFogGrid,
    fullMapFog, setFullMapFog,
    portalPlacementMode, setPortalPlacementMode,
    firstPortalPoint, setFirstPortalPoint,
    togglePanMode, toggleDrawMode, toggleVisibilityMode,
    clearDrawings, handleAddNote, handleEditNote, handleDeleteNote,
    handleDeleteSelectedCharacters, navigateToWorldMap,
    deleteFromRtdbWithHistory, saveFogGridWithHistory, saveFullMapFog,
    setDrawings,
  });

  // Delete actions — delegates to extracted hook
  const { handleDeleteKeyPress, handleConfirmDelete } = useDeleteActions({
    roomId, isMJ,
    selectedCharacters, selectedCharacterIndex, selectedObjectIndices,
    selectedNoteIndex, selectedMusicZoneIds, selectedObstacleIds,
    selectedDrawingIndex, selectedFogCells, isVisActive,
    contextMenuLightOpen, contextMenuLightId,
    entityToDelete, setEntityToDelete, setDeleteModalOpen,
    characters, objects, notes, musicZones, obstacles, drawings, lights, fogGrid, measurements,
    setCharacters, setObjects, setNotes, setMusicZones, setLights, setDrawings,
    setFogGrid, setMeasurements,
    setSelectedCharacters, setSelectedCharacterIndex, setSelectedObjectIndices,
    setSelectedNoteIndex, setSelectedMusicZoneIds, setSelectedObstacleIds,
    setSelectedDrawingIndex, setSelectedFogCells,
    setContextMenuLightOpen, setContextMenuLightId,
    deleteWithHistory, deleteFromRtdbWithHistory, saveFogGridWithHistory,
    handleObstacleDelete, resetActiveElementSelection,
  });

  // Keyboard shortcuts — delegates to extracted hook
  useKeyboardShortcuts({
    roomId, isMJ, selectedCityId,
    selectedCharacters, selectedCharacterIndex, selectedObjectIndices,
    selectedNoteIndex, selectedMusicZoneIds, selectedObstacleIds,
    selectedDrawingIndex, selectedFogCells, isVisActive,
    isDrawingObstacle, currentObstaclePoints, pendingEdges, visibilityMode,
    copiedCharacterTemplate, copiedObjectTemplate,
    characters, objects,
    setIsDrawingObstacle, setCurrentObstaclePoints, setPendingEdges,
    setSelectedFogCells, setVisibilityMode,
    setCopiedCharacterTemplate, setCopiedObjectTemplate,
    setIsUnifiedSearchOpen, setShowGlobalSettingsDialog,
    setMeasureMode, setDrawMode, setPanMode,
    handleDeleteKeyPress, saveObstacle, handleToolbarAction,
  });


  const handleNoteSubmit = async () => {
    if (editingNote && roomId && selectedNoteIndex !== null) {
      const noteToUpdate = notes[selectedNoteIndex];
      if (typeof roomId === 'string' && typeof noteToUpdate?.id === 'string') {
        try {
          await updateRtdbWithHistory('notes', noteToUpdate.id, {
            content: editingNote.text,
            color: editingNote.color
          }, 'Modification de la note');
          setEditingNote(null);
          setNoteDialogOpen(false);
          setSelectedNoteIndex(null);
        } catch (error) {
          console.error("Erreur lors de la mise à jour de la note :", error);
        }
      }
    }
  };

  // clearFog is now in useVisibilityState hook

  if (loading) {
    return <div>Chargement...</div>
  }

  if (!userId) {
    return <div>Veuillez vous connecter pour accéder à la carte</div>
  }



  const handleObjectAction = async (action: string, objectId: string, value?: any) => {
    if (!roomId) return;
    const objIndex = objects.findIndex(o => o.id === objectId);
    if (objIndex === -1) return;
    const obj = objects[objIndex];

    try {
      if (action === 'openLoot') {
        const lootInteraction: LootInteraction = {
          id: obj.id,
          type: 'loot' as const,
          name: obj.name,
          items: obj.items || [],
          linkedId: obj.linkedId
        };
        setActiveInteraction({ interaction: lootInteraction, host: obj });
        setContextMenuObjectOpen(false);
        return;
      }

      if (action === 'delete') {
        await deleteDoc(doc(db, 'cartes', String(roomId), 'objects', objectId));
        setContextMenuObjectOpen(false);
        setContextMenuObjectId(null);
        setSelectedObjectIndices(prev => prev.filter(idx => idx !== objIndex));
        resetActiveElementSelection(); // Note: Index might shift if real-time, but for now ok
      } else if (action === 'toggleBackground') {
        // Toggle background status
        await updateDoc(doc(db, 'cartes', String(roomId), 'objects', objectId), {
          isBackground: !obj.isBackground
        });
        setContextMenuObjectOpen(false);
        // Deselect if we are embedding it (locking it)
        if (!obj.isBackground) {
          setSelectedObjectIndices(prev => prev.filter(idx => idx !== objIndex));
        }
      } else if (action === 'rotate') {
        // Realtime update might be too much, but for context menu slider it's ok
        await updateDoc(doc(db, 'cartes', String(roomId), 'objects', objectId), {
          rotation: value
        });
      } else if (action === 'setObjectVisibility') {
        // 🆕 Nouvelle action pour définir la visibilité d'un objet
        await updateDoc(doc(db, 'cartes', String(roomId), 'objects', objectId), {
          visibility: value
        });
      } else if (action === 'updateObjectVisiblePlayers') {
        // 🆕 Nouvelle action pour mettre à jour la liste des joueurs autorisés pour un objet
        await updateDoc(doc(db, 'cartes', String(roomId), 'objects', objectId), {
          visibleToPlayerIds: value
        });
      } else if (action === 'toggleLock') {
        // 🆕 Verrouiller/Déverrouiller l'objet pour les joueurs
        await updateDoc(doc(db, 'cartes', String(roomId), 'objects', objectId), {
          isLocked: !obj.isLocked
        });
      } else if (action === 'rename') {
        // 🆕 Renommer l'objet
        await updateDoc(doc(db, 'cartes', String(roomId), 'objects', objectId), {
          name: value
        });
      } else if (action === 'updateNotes') {
        // 🆕 Mettre à jour les notes
        await updateDoc(doc(db, 'cartes', String(roomId), 'objects', objectId), {
          notes: value
        });
      }
    } catch (error) {
      console.error("Error handling object action:", error);
    }
  };

  const handlePortalAction = async (action: string, portalId: string) => {
    try {
      if (action === 'delete') {
        if (!roomId) return;
        const portal = portals.find(p => p.id === portalId);

        // 🔄 For same-map portals: also delete the twin portal
        if (portal && portal.portalType === 'same-map' && portal.targetX !== undefined && portal.targetY !== undefined) {
          // Store in local constants for TypeScript
          const portalX = portal.x;
          const portalY = portal.y;
          const portalTargetX = portal.targetX;
          const portalTargetY = portal.targetY;

          // Find the twin portal
          const twinPortal = portals.find(p =>
            p.id !== portal.id &&
            p.portalType === 'same-map' &&
            p.targetX !== undefined &&
            p.targetY !== undefined &&
            Math.abs(p.x - portalTargetX) < 0.1 &&
            Math.abs(p.y - portalTargetY) < 0.1 &&
            Math.abs(p.targetX - portalX) < 0.1 &&
            Math.abs(p.targetY - portalY) < 0.1 &&
            (!p.cityId || p.cityId === selectedCityId)
          );

          // Delete both portals
          await deleteWithHistory(
            'portals',
            portalId,
            `Suppression du portail same-map${portal?.name ? ` "${portal.name}"` : ''}`
          );

          if (twinPortal) {
            await deleteWithHistory(
              'portals',
              twinPortal.id,
              `Suppression du portail jumeau${twinPortal?.name ? ` "${twinPortal.name}"` : ''}`
            );
          }

          toast.success(twinPortal ? "Portails jumeaux supprimés" : "Portail supprimé");
        } else {
          // Regular portal (scene-change)
          await deleteWithHistory(
            'portals',
            portalId,
            `Suppression du portail${portal?.name ? ` "${portal.name}"` : ''}`
          );
          toast.success("Portail supprimé");
        }

        setContextMenuPortalOpen(false);
        setContextMenuPortalId(null);
        resetActiveElementSelection();
      } else if (action === 'edit') {
        const portal = portals.find(p => p.id === portalId);
        if (portal) {
          setEditingPortal(portal);
          setShowPortalConfig(true);
          setContextMenuPortalOpen(false);
          setContextMenuPortalId(null);
        }
      }
    } catch (error) {
      console.error("❌ Error in handlePortalAction:", error);
    }
  };

  const handleLightAction = async (action: string, lightId: string, value?: any) => {
    if (!roomId) return;
    const lightDoc = doc(db, 'cartes', roomId, 'lights', lightId);

    if (action === 'delete') {
      if (confirm('Supprimer cette lumière ?')) {
        await deleteDoc(lightDoc);
        setContextMenuLightOpen(false);
        resetActiveElementSelection();
        toast.success("Lumiere supprimé")
      }
    } else if (action === 'updateRadius') {
      await updateDoc(lightDoc, { radius: value });
      toast.success("Rayon de la lumière mis à jour")
    }
  };

  const handleMusicZoneAction = async (action: string, zoneId: string, value?: any) => {
    if (!roomId) return;

    // Optimistic / Direct update for simpler actions if needed, or just standard Firebase update
    try {
      if (action === 'delete') {
        await deleteDoc(doc(db, 'cartes', String(roomId), 'musicZones', zoneId));
        setContextMenuMusicZoneOpen(false);
        setContextMenuMusicZoneId(null);
        setSelectedMusicZoneIds(prev => prev.filter(id => id !== zoneId));
        resetActiveElementSelection();
        toast.success("Zone sonore supprimée")
      } else if (action === 'rename') {
        await updateDoc(doc(db, 'cartes', String(roomId), 'musicZones', zoneId), { name: value });
        toast.success("Nom de la zone sonore mis à jour")
      } else if (action === 'updateVolume') {
        await updateDoc(doc(db, 'cartes', String(roomId), 'musicZones', zoneId), { volume: value });
        toast.success("Volume de la zone sonore mis à jour")
      } else if (action === 'updateRadius') {
        await updateDoc(doc(db, 'cartes', String(roomId), 'musicZones', zoneId), { radius: value });
      } else if (action === 'togglePlay') {
        // 🆕 QUICK PLAY LOGIC
        console.log("Handling togglePlay action for zoneId:", zoneId);
        const zone = musicZones.find(z => z.id === zoneId);
        console.log("Found zone:", zone);

        if (zone && zone.url) {
          console.log("Updating currentMusic with url:", zone.url);
          try {
            await updateDoc(doc(db, 'cartes', String(roomId)), {
              currentMusic: {
                url: zone.url,
                title: zone.name || "Zone Ambience",
                volume: zone.volume,
                loop: true,
                isPlaying: true,
                startTime: Date.now()
              }
            });
            console.log("Successfully updated currentMusic");
          } catch (err) {
            console.error("Error updating currentMusic:", err);
          }
        } else {
          console.warn("Zone not found or has no URL");
        }
      }
    } catch (e) {
      console.error("Error updating music zone:", e);
    }
  };

  const handleSelection = (type: SelectionType) => {
    if (!selectionCandidates) return;

    // Clear all first
    setSelectedCharacters([]);
    setSelectedCharacters([]);
    setSelectedObjectIndices([]);
    setSelectedNoteIndex(null);
    setSelectedDrawingIndex(null);
    setSelectedObstacleIds([]);
    setSelectedMusicZoneIds([]);
    setSelectedLightIds([]);
    setSelectedPortalIds([]);
    setSelectedFogCells([]);

    switch (type) {
      case 'characters':
        setSelectedCharacters(selectionCandidates.characters);
        break;
      case 'objects':
        setSelectedObjectIndices(selectionCandidates.objects);
        break;
      case 'notes':
        if (selectionCandidates.notes.length > 0) {
          setSelectedNoteIndex(selectionCandidates.notes[0]);
        }
        break;
      case 'drawings':
        if (selectionCandidates.drawings.length > 0) {
          setSelectedDrawingIndex(selectionCandidates.drawings[0]);
        }
        break;
      case 'obstacles':
        setSelectedObstacleIds(selectionCandidates.obstacles);
        break;
      case 'musicZones':
        setSelectedMusicZoneIds(selectionCandidates.musicZones);
        break;
      case 'lights':
        setSelectedLightIds(selectionCandidates.lights);
        break;
      case 'portals':
        setSelectedPortalIds(selectionCandidates.portals);
        break;
      case 'fogCells':
        setSelectedFogCells(selectionCandidates.fogCells);
        break;
    }

    setShowSelectionMenu(false);
    setSelectionCandidates(null);
  };

  //  RENDER CITY MAP (existing functionality)
  return (
    <div className="flex flex-col relative" ref={containerRef}>
      {/*  SELECTION MENU */}
      {showSelectionMenu && selectionCandidates && (
        <SelectionMenu
          position={menuPosition}
          candidates={selectionCandidates}
          onSelect={handleSelection}
          onCancel={() => {
            setShowSelectionMenu(false);
            setSelectionCandidates(null);
          }}
        />
      )}

      {/*  PLAYER PORTAL ENTER BUTTON */}
      {!isMJ && activePortalForPlayer && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]">
          <div className="bg-black/90 backdrop-blur-xl border-2 border-[#c0a080] rounded-2xl p-6 shadow-2xl shadow-[#c0a080]/20 animate-in fade-in zoom-in duration-300">
            <div className="text-center space-y-4">
              <div className="text-[#c0a080] text-lg font-bold">
                {activePortalForPlayer.name || 'Portail'}
              </div>
              <Button
                onClick={async () => {
                  if (!roomId || !persoId) return;

                  console.log('🔵 Portal activation:', activePortalForPlayer);

                  let targetX = activePortalForPlayer.targetX;
                  let targetY = activePortalForPlayer.targetY;

                  // Handle portal type: same-map or scene-change
                  if (activePortalForPlayer.portalType === 'same-map') {
                    // Same-map teleportation: validate coordinates
                    if (targetX === undefined || targetY === undefined) {
                      toast.error("Coordonnées de destination manquantes");
                      console.error('❌ Missing targetX or targetY for same-map portal:', activePortalForPlayer);
                      return;
                    }

                    console.log(`🎯 Teleporting to (${targetX}, ${targetY}) on scene ${selectedCityId}`);

                    // Position → RTDB, scène → Firestore
                    await updateCityPosition(persoId, selectedCityId!, targetX!, targetY!);
                    await updateDoc(doc(db, 'cartes', roomId, 'characters', persoId), {
                      currentSceneId: selectedCityId
                    });

                    console.log('✅ Teleportation complete');
                    toast.success(`Téléporté vers ${activePortalForPlayer.name}`);
                  } else {
                    // Scene-change portal: teleport to different scene
                    if (!activePortalForPlayer.targetSceneId) {
                      toast.error("Ce portail n'a pas de scène de destination");
                      return;
                    }

                    // If target is 0,0 (default), check if the target scene has a defined spawn point
                    if (targetX === 0 && targetY === 0) {
                      const targetCity = cities.find(c => c.id === activePortalForPlayer.targetSceneId);
                      if (targetCity && targetCity.spawnX !== undefined && targetCity.spawnY !== undefined) {
                        targetX = targetCity.spawnX;
                        targetY = targetCity.spawnY;
                        console.log(`📍 Using default spawn point for scene ${targetCity.name}: (${targetX}, ${targetY})`);
                      }
                    }

                    // Position → RTDB, scène → Firestore
                    await updateCharacterPosition(persoId, { x: targetX!, y: targetY! });
                    await updateDoc(doc(db, 'cartes', roomId, 'characters', persoId), {
                      currentSceneId: activePortalForPlayer.targetSceneId
                    });

                    // Change to the new scene (this will trigger CitiesManager logic)
                    setSelectedCityId(activePortalForPlayer.targetSceneId!);
                    toast.success(`Téléporté vers ${activePortalForPlayer.name}`);
                  }
                }}
                className="bg-[#c0a080] text-black hover:bg-[#d4b594] font-bold px-8 py-3 text-lg"
              >
                Entrer →
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* 🆕 InfoComponent Integré */}
      {activeInfoSection && (
        <div className="fixed inset-0 z-[60]">
          <InfoComponent
            activeSection={activeInfoSection}
            setActiveSection={setActiveInfoSection}
            renderButtons={false}
          />
        </div>
      )}

      {/* Context Menus (extracted component) */}
      <MapContextMenus
        roomId={roomId}
        isMJ={isMJ}
        persoId={persoId}
        activePlayerId={activePlayerId}
        characters={characters}
        setCharacters={setCharacters}
        selectedCharacters={selectedCharacters}
        bulkContextMenuOpen={bulkContextMenuOpen}
        setBulkContextMenuOpen={setBulkContextMenuOpen}
        handleBulkVisibilityChange={handleBulkVisibilityChange}
        handleBulkConditionToggle={handleBulkConditionToggle}
        handleBulkDelete={handleBulkDelete}
        obstacles={obstacles}
        selectedObstacleIds={selectedObstacleIds}
        setSelectedObstacleIds={setSelectedObstacleIds}
        handleObstacleDelete={handleObstacleDelete}
        handleObstacleDeleteConnected={handleObstacleDeleteConnected}
        toggleDoorState={toggleDoorState}
        toggleLockDoor={toggleLockDoor}
        handleObstacleInvertDirection={handleObstacleInvertDirection}
        handleObstacleConvertTo={handleObstacleConvertTo}
        handleToggleRoomMode={handleToggleRoomMode}
        findClosedLoops={findClosedLoops}
        objects={objects}
        contextMenuObjectOpen={contextMenuObjectOpen}
        setContextMenuObjectOpen={setContextMenuObjectOpen}
        contextMenuObjectId={contextMenuObjectId}
        handleObjectAction={handleObjectAction}
        isBackgroundEditMode={isBackgroundEditMode}
        musicZones={musicZones}
        contextMenuMusicZoneOpen={contextMenuMusicZoneOpen}
        setContextMenuMusicZoneOpen={setContextMenuMusicZoneOpen}
        contextMenuMusicZoneId={contextMenuMusicZoneId}
        handleMusicZoneAction={handleMusicZoneAction}
        measurements={measurements}
        contextMenuMeasurementOpen={contextMenuMeasurementOpen}
        setContextMenuMeasurementOpen={setContextMenuMeasurementOpen}
        contextMenuMeasurementId={contextMenuMeasurementId}
        handleMeasurementAction={handleMeasurementAction}
        measureMode={measureMode}
        setMeasureMode={setMeasureMode}
        isMeasurementPanelOpen={isMeasurementPanelOpen}
        measurementShape={measurementShape}
        setMeasurementShape={setMeasurementShape}
        isCalibrating={isCalibrating}
        setIsCalibrating={setIsCalibrating}
        setMeasureStart={setMeasureStart}
        setMeasureEnd={setMeasureEnd}
        handleClearMeasurements={handleClearMeasurements}
        isPermanent={isPermanent}
        setIsPermanent={setIsPermanent}
        coneAngle={coneAngle}
        setConeAngle={setConeAngle}
        coneShape={coneShape}
        setConeShape={setConeShape}
        coneMode={coneMode}
        setConeMode={setConeMode}
        coneWidth={coneWidth}
        setConeWidth={setConeWidth}
        coneLength={coneLength}
        setConeLength={setConeLength}
        lockWidthHeight={lockWidthHeight}
        setLockWidthHeight={setLockWidthHeight}
        selectedSkin={selectedSkin}
        setSelectedSkin={setSelectedSkin}
        lights={lights}
        contextMenuLightOpen={contextMenuLightOpen}
        setContextMenuLightOpen={setContextMenuLightOpen}
        contextMenuLightId={contextMenuLightId}
        handleLightAction={handleLightAction}
        portals={portals}
        contextMenuPortalOpen={contextMenuPortalOpen}
        setContextMenuPortalOpen={setContextMenuPortalOpen}
        contextMenuPortalId={contextMenuPortalId}
        handlePortalAction={handlePortalAction}
        showAllBadges={showAllBadges}
        setShowAllBadges={setShowAllBadges}
        contextMenuOpen={contextMenuOpen}
        setContextMenuOpen={setContextMenuOpen}
        contextMenuCharacterId={contextMenuCharacterId}
        setContextMenuCharacterId={setContextMenuCharacterId}
        setSelectedCharacterIndex={setSelectedCharacterIndex}
        pixelsPerUnit={pixelsPerUnit}
        unitName={unitName}
        setSelectedCharacterForSheet={setSelectedCharacterForSheet}
        setShowCharacterSheet={setShowCharacterSheet}
        setAttackerId={setAttackerId}
        setTargetId={setTargetId}
        setTargetIds={setTargetIds}
        setCombatOpen={setCombatOpen}
        setInteractionConfigTarget={setInteractionConfigTarget}
        setActiveInteraction={setActiveInteraction}
        deleteWithHistory={deleteWithHistory}
        resetActiveElementSelection={resetActiveElementSelection}
      />


      {/* Dialogs (extracted component) */}
      <MapDialogs
        roomId={roomId}
        isMJ={isMJ}
        selectedCityId={selectedCityId}
        showPortalConfig={showPortalConfig}
        setShowPortalConfig={setShowPortalConfig}
        editingPortal={editingPortal}
        setEditingPortal={setEditingPortal}
        newPortalPos={newPortalPos}
        setNewPortalPos={setNewPortalPos}
        firstPortalPoint={firstPortalPoint}
        setFirstPortalPoint={setFirstPortalPoint}
        firstPortalId={firstPortalId}
        setFirstPortalId={setFirstPortalId}
        portalPlacementMode={portalPlacementMode}
        showCreateNoteModal={showCreateNoteModal}
        setShowCreateNoteModal={setShowCreateNoteModal}
        editingNote={editingNote}
        setEditingNote={setEditingNote}
        handleCreateNoteConfirm={handleCreateNoteConfirm}
        showCharacterSheet={showCharacterSheet}
        setShowCharacterSheet={setShowCharacterSheet}
        selectedCharacterForSheet={selectedCharacterForSheet}
        setSelectedCharacterForSheet={setSelectedCharacterForSheet}
        calibrationDialogOpen={calibrationDialogOpen}
        setCalibrationDialogOpen={setCalibrationDialogOpen}
        tempCalibrationDistance={tempCalibrationDistance}
        setTempCalibrationDistance={setTempCalibrationDistance}
        unitName={unitName}
        setUnitName={setUnitName}
        handleCalibrationSubmit={handleCalibrationSubmit}
        performanceMode={performanceMode}
        showGlobalSettingsDialog={showGlobalSettingsDialog}
        setShowGlobalSettingsDialog={setShowGlobalSettingsDialog}
        showMusicDialog={showMusicDialog}
        setShowMusicDialog={setShowMusicDialog}
        audioCharacterId={audioCharacterId}
        setAudioCharacterId={setAudioCharacterId}
        tempZoneData={tempZoneData}
        setTempZoneData={setTempZoneData}
        saveMusicZone={saveMusicZone}
        isNPCDrawerOpen={isNPCDrawerOpen}
        setIsNPCDrawerOpen={setIsNPCDrawerOpen}
        handleTemplateDragStart={handleTemplateDragStart}
        isObjectDrawerOpen={isObjectDrawerOpen}
        setIsObjectDrawerOpen={setIsObjectDrawerOpen}
        handleObjectDragStart={handleObjectDragStart}
        isSoundDrawerOpen={isSoundDrawerOpen}
        setIsSoundDrawerOpen={setIsSoundDrawerOpen}
        handleSoundDragStart={handleSoundDragStart}
        isUnifiedSearchOpen={isUnifiedSearchOpen}
        setIsUnifiedSearchOpen={setIsUnifiedSearchOpen}
        obstacles={obstacles}
        setObstacles={setObstacles}
        deleteFromRtdbWithHistory={deleteFromRtdbWithHistory}
        visibilityMode={visibilityMode}
        toggleVisibilityMode={toggleVisibilityMode}
        visibilityState={visibilityState}
        isAudioMixerOpen={isAudioMixerOpen}
        setIsAudioMixerOpen={setIsAudioMixerOpen}
        showPlaceModal={showPlaceModal}
        setShowPlaceModal={setShowPlaceModal}
        draggedTemplate={draggedTemplate}
        setDraggedTemplate={setDraggedTemplate}
        setDropPosition={setDropPosition}
        handlePlaceConfirm={handlePlaceConfirm}
        showPlaceObjectModal={showPlaceObjectModal}
        setShowPlaceObjectModal={setShowPlaceObjectModal}
        draggedObjectTemplateForPlace={draggedObjectTemplateForPlace}
        setDraggedObjectTemplateForPlace={setDraggedObjectTemplateForPlace}
        setDropObjectPosition={setDropObjectPosition}
        handlePlaceObjectConfirm={handlePlaceObjectConfirm}
        characters={characters}
        deleteModalOpen={deleteModalOpen}
        setDeleteModalOpen={setDeleteModalOpen}
        entityToDelete={entityToDelete}
        handleConfirmDelete={handleConfirmDelete}
        showBackgroundSelector={showBackgroundSelector}
        setShowBackgroundSelector={setShowBackgroundSelector}
        handleBackgroundSelectLocal={handleBackgroundSelectLocal}
      />
      <MapToolbar
        isMJ={isMJ}
        activeTools={getActiveToolbarTools()}
        onAction={handleToolbarAction}
        currentViewMode={playerViewMode ? 'player' : 'mj'}
        showGrid={showGrid}
        activeToolContent={getToolOptionsContent()}
        allies={playerAllies}
      />

      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        ref={containerRef}
        className={`w-full h-full flex-1 overflow-hidden border border-gray-300 ${isDraggingCharacter || isDraggingNote || isDraggingObstacle ? 'cursor-grabbing' :
          isDragging || isDraggingObject ? 'cursor-move' :
            panMode ? 'cursor-grab' :
              multiSelectMode ? 'cursor-crosshair' :
                drawMode || spawnPointMode ? 'cursor-crosshair' :
                  fogMode ? 'cursor-cell' : 'cursor-default'
          } relative`}
        style={{
          height: '100vh',
          userSelect: isDraggingCharacter || isDraggingNote || isDraggingObject || isDraggingObstacle ? 'none' : 'auto'
        }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onContextMenu={(e) => {
          if (isVisActive && currentVisibilityTool === 'fog') {
            e.preventDefault();
            return;
          }

          //  CONFLICT RESOLUTION: Character Context Menu vs Tool interactions

          // If we are hovering over a character, we want the CHARACTER context menu to open (handled elsewhere or natively if implemented),
          // and we want to PREVENT the Radial Menu from opening.

          // Check if cursor is over a character
          const rect = bgCanvasRef.current?.getBoundingClientRect();
          if (rect && bgImageObject) {
            const containerWidth = containerRef.current?.clientWidth || rect.width;
            const containerHeight = containerRef.current?.clientHeight || rect.height;
            const image = bgImageObject;
            const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
            const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
            const scaledWidth = imgWidth * scale * zoom;
            const scaledHeight = imgHeight * scale * zoom;
            const mouseX = e.clientX;
            const mouseY = e.clientY;

            // 🆕 MANUAL MEASUREMENT DELETION (Right Click)
            // Check in reverse order (top to bottom)
            const worldMouseX = (mouseX - rect.left + offset.x) / scaledWidth * imgWidth;
            const worldMouseY = (mouseY - rect.top + offset.y) / scaledHeight * imgHeight;
            const worldPoint = { x: worldMouseX, y: worldMouseY };

            // Find measurement to delete
            const clickedMeasurement = measurements.find(m =>
              isPointInMeasurement(worldPoint, m, pixelsPerUnit, scale, zoom)
            );

            if (clickedMeasurement) {
              // Only allow deleting own measurements (unless MJ?)
              // For now, allow deleting own.
              if (clickedMeasurement.ownerId === (userId || 'unknown')) {
                e.preventDefault();
                e.stopPropagation();

                // Open Context Menu instead of immediate delete
                setContextMenuMeasurementId(clickedMeasurement.id);
                setContextMenuMeasurementOpen(true);
                return;
              }
            }

            const hoveredCharIndex = characters.findIndex(char => {
              const charX = (char.x / imgWidth) * scaledWidth - offset.x + rect.left;
              const charY = (char.y / imgHeight) * scaledHeight - offset.y + rect.top;
              const clickRadius = char.type === 'joueurs' ? 30 * zoom : 20 * zoom;
              return Math.abs(charX - mouseX) < clickRadius && Math.abs(charY - mouseY) < clickRadius;
            });


            if (hoveredCharIndex !== -1) {
              //  Check if the hovered character is part of a multi-selection
              if (selectedCharacters.length > 1 && selectedCharacters.includes(hoveredCharIndex)) {
                // Show bulk context menu for multi-selection
                e.preventDefault();
                e.stopPropagation();
                setBulkContextMenuOpen(true);
                return;
              }

              // Cursor is over a character.
              // Prevent the Radial Menu (parent) from seeing this event.
              e.stopPropagation();

              const char = characters[hoveredCharIndex];
              if (char && char.id) {
                e.preventDefault(); // Stop native browser menu
                setContextMenuCharacterId(char.id);
                setContextMenuOpen(true);
              }
              return;
            }

            // If no specific element is hovered, let Radix ContextMenu handle it
            mapContextMenuPosRef.current = { x: e.clientX, y: e.clientY };
          }
        }
        }
      >

        <CursorManager
          roomId={roomId}
          userId={userId || ''}
          userName={isMJ ? 'MJ' : (characters.find(c => c.id === persoId)?.name || userName)}
          cityId={selectedCityId}
          containerRef={containerRef}
          offset={offset}
          zoom={zoom}
          bgImageObject={bgImageObject}
          showCursor={showMyCursor}
          showOtherCursors={showOtherCursors}
          userColor={cursorColor} // 🆕
          userTextColor={cursorTextColor} // 🆕
        />
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>


          <canvas
            ref={bgCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            onDrop={handleCanvasDrop}
            onDragOver={handleCanvasDragOver}
            onDragLeave={() => { setDragFeaturePreview(null); }}
            onDoubleClick={handleCanvasDoubleClick}
          />
          <ObjectsLayer
            objects={objects}
            isLayerVisible={isLayerVisible}
            isObjectVisibleToUser={isObjectVisibleToUser}
            bgImageObject={bgImageObject}
            containerSize={containerSize}
            containerRef={containerRef}
            zoom={zoom}
            offset={offset}
            selectedObjectIndices={selectedObjectIndices}
            precalculatedShadows={precalculatedShadows}
            isMJ={isMJ}
            playerViewMode={playerViewMode}
            fogMode={fogMode}
            fullMapFog={fullMapFog}
            fogGrid={fogGrid}
            fogCellSize={fogCellSize}
            calculateFogOpacity={calculateFogOpacity}
            obstacles={obstacles}
            isBackgroundEditMode={isBackgroundEditMode}
            activeElementType={activeElementType}
            activeElementId={activeElementId}
            isResizingObject={isResizingObject}
            panMode={panMode}
            performanceMode={performanceMode}
            mouseClickStartRef={mouseClickStartRef}
            bgCanvasRef={bgCanvasRef}
            setSelectedObjectIndices={setSelectedObjectIndices}
            setDragStart={setDragStart}
            setIsDraggingObject={setIsDraggingObject}
            setDraggedObjectIndex={setDraggedObjectIndex}
            setDraggedObjectOriginalPos={setDraggedObjectOriginalPos}
            setDraggedObjectsOriginalPositions={setDraggedObjectsOriginalPositions}
            setContextMenuObjectId={setContextMenuObjectId}
            setContextMenuObjectOpen={setContextMenuObjectOpen}
            handleResizeStart={handleResizeStart}
            detectElementsAtPosition={detectElementsAtPosition}
            setDetectedElements={setDetectedElements}
            setSelectionMenuPosition={setSelectionMenuPosition}
            setShowElementSelectionMenu={setShowElementSelectionMenu}
          />

          {/* 💡 LAYER LUMIÈRES (LIGHTS) */}
          <LightsLayer
            lights={lights}
            isMJ={isMJ}
            bgImageObject={bgImageObject}
            containerSize={containerSize}
            containerRef={containerRef}
            zoom={zoom}
            offset={offset}
            panMode={panMode}
            activeElementType={activeElementType}
            activeElementId={activeElementId}
            bgCanvasRef={bgCanvasRef}
            setIsDraggingLight={setIsDraggingLight}
            setDraggedLightId={setDraggedLightId}
            setDraggedLightOriginalPos={setDraggedLightOriginalPos}
            setDragStart={setDragStart}
            setContextMenuLightId={setContextMenuLightId}
            setContextMenuLightOpen={setContextMenuLightOpen}
            detectElementsAtPosition={detectElementsAtPosition}
            setDetectedElements={setDetectedElements}
            setSelectionMenuPosition={setSelectionMenuPosition}
            setShowElementSelectionMenu={setShowElementSelectionMenu}
          />

          {/*  PORTALS LAYER - Icons for MJ */}
          <PortalsLayer
            portals={portals}
            selectedCityId={selectedCityId}
            isMJ={isMJ}
            bgImageObject={bgImageObject}
            containerSize={containerSize}
            containerRef={containerRef}
            zoom={zoom}
            offset={offset}
            panMode={panMode}
            contextMenuPortalId={contextMenuPortalId}
            activeElementType={activeElementType}
            activeElementId={activeElementId}
            bgCanvasRef={bgCanvasRef}
            setIsDraggingPortal={setIsDraggingPortal}
            setDraggedPortalId={setDraggedPortalId}
            setDraggedPortalOriginalPos={setDraggedPortalOriginalPos}
            setDragStart={setDragStart}
            setEditingPortal={setEditingPortal}
            setShowPortalConfig={setShowPortalConfig}
            setContextMenuPortalId={setContextMenuPortalId}
            setContextMenuPortalOpen={setContextMenuPortalOpen}
            detectElementsAtPosition={detectElementsAtPosition}
            setDetectedElements={setDetectedElements}
            setSelectionMenuPosition={setSelectionMenuPosition}
            setShowElementSelectionMenu={setShowElementSelectionMenu}
          />

          <canvas
            ref={characterBordersCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}
          />
          <CharactersLayer
            characters={characters}
            bgImageObject={bgImageObject}
            containerSize={containerSize}
            containerRef={containerRef}
            zoom={zoom}
            offset={offset}
            isMJ={isMJ}
            persoId={persoId}
            viewAsPersoId={viewAsPersoId}
            playerViewMode={playerViewMode}
            globalTokenScale={globalTokenScale}
            performanceMode={performanceMode}
            activeElementType={activeElementType}
            activeElementId={activeElementId}
            isLayerVisible={isLayerVisible}
            isCharacterVisibleToUser={isCharacterVisibleToUser}
          />
          <canvas
            ref={fgCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}
          />
        </div>
        {combatOpen && (
          <Combat
            attackerId={attackerId || ''}
            targetId={targetId || ''}
            targetIds={targetIds} /* 🆕 Pass multiple targets */
            onClose={() => setCombatOpen(false)}
          />
        )}
      </div>
      </ContextMenuTrigger>
      <MapContextMenuContent
        isMJ={isMJ}
        position={mapContextMenuPosRef.current}
        showAllBadges={showAllBadges}
        onToggleBadges={() => setShowAllBadges(!showAllBadges)}
      />
      </ContextMenu>






      {/*  PAN MODE OVERLAY */}
      {
        panMode && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/90 text-neutral-200 px-4 py-2 rounded-full border border-neutral-700 shadow-xl flex items-center gap-4 z-40 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Move className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-sm">Mode Déplacement</span>
            </div>
          </div>
        )
      }

      {/*  FOG MODE OVERLAY */}
      {
        fogMode && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/90 text-neutral-200 px-4 py-2 rounded-full border border-neutral-700 shadow-xl flex items-center gap-4 z-40 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-sm">Mode Brouillard</span>
            </div>
            <div className="h-4 w-px bg-neutral-700 mx-1"></div>
            <div className="text-xs text-neutral-400">
              Clic pour modifier
            </div>
            {isMJ && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFogGrid(!showFogGrid)}
                className={`h - 7 px - 2 text - xs ml - 2 ${showFogGrid ? 'text-yellow-400 bg-yellow-400/10' : 'text-neutral-400 hover:text-white'} `}
              >
                <Grid className="w-3 h-3 mr-1" />
                Grille
              </Button>
            )}
          </div>
        )
      }










      {/* Background Loader Overlay */}
      {
        isBackgroundLoading && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="flex flex-col items-center gap-4 max-w-sm w-full px-6">
              <Loader2 className="w-12 h-12 text-[#c0a080] animate-spin" />

              <div className="text-center space-y-2">
                <h3 className="text-xl font-bold text-[#c0a080] tracking-wider uppercase">
                  {selectedCityId ? cities.find(c => c.id === selectedCityId)?.name || 'Ville Inconnue' : 'Carte du Monde'}
                </h3>
                <p className="text-neutral-400 text-sm">Chargement du fond de carte...</p>
              </div>

              {/* Barre de progression */}
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden border border-neutral-700">
                <div
                  className="h-full bg-[#c0a080] transition-all duration-300 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <span className="text-[#c0a080] font-mono text-sm">{loadingProgress}%</span>
            </div>
          </div>
        )
      }

      {/* Layer Control Panel */}
      {
        showLayerControl && (
          <div className="absolute top-24 left-24 z-40">
            <LayerControl layers={layers} onToggle={toggleLayer} />
          </div>
        )
      }

      {/* Custom Tooltip for Conditions */}
      {
        hoveredCondition && (
          <div
            style={{
              position: 'fixed',
              left: hoveredCondition.x + 10,
              top: hoveredCondition.y + 10,
              zIndex: 100, // Tooltips at the very top
              pointerEvents: 'none'
            }}
            className="bg-black/90 text-white text-xs px-2 py-1 rounded shadow-xl border border-white/20"
          >
            {hoveredCondition.text}
          </div>
        )
      }

      {/* Interaction Components Layer */}
      <InteractionLayer
        roomId={roomId}
        isMJ={isMJ}
        characters={characters}
        activeInteraction={activeInteraction}
        setActiveInteraction={setActiveInteraction}
        interactionConfigTarget={interactionConfigTarget}
        setInteractionConfigTarget={setInteractionConfigTarget}
        persoId={persoId}
        viewAsPersoId={viewAsPersoId}
      />

      {/* SCENE INVENTORY DRAWER */}
      <AnimatePresence>
        {viewMode === 'world' && isMJ && (
          <CitiesManager
            onCitySelect={navigateToCity}
            roomId={roomId}
            onClose={() => {
              console.log('🚪 [CitiesManager] onClose called, selectedCityId:', selectedCityId, 'viewMode:', viewMode);
              // ⚠️ IMPORTANT: delay setViewMode to let CitiesManager's exit animations complete.
              // Without this delay, React immediately unmounts CitiesManager → its internal
              // motion.div backdrops never reach exit opacity:0 → backdrop stays and blocks page.
              if (selectedCityId) {
                console.log('✅ [CitiesManager] Returning to city mode (delayed to allow exit animation)');
                setTimeout(() => {
                  navigateToCity(selectedCityId);
                  setViewMode('city');
                }, 400); // matches CitiesManager's spring exit duration (~350ms)
              } else {
                console.log('⚠️ [CitiesManager] No selectedCityId, staying in world mode');
              }
            }}
            globalCityId={globalCityId}
          />
        )}
      </AnimatePresence>


      {/* 🎯 OVERLAPPING ELEMENTS SELECTION MENU */}
      {showElementSelectionMenu && (
        <ElementSelectionMenu
          elements={detectedElements}
          position={selectionMenuPosition}
          onSelect={(element) => handleElementSelection(element, selectionMenuPosition.x, selectionMenuPosition.y)}
          onClose={() => {
            setShowElementSelectionMenu(false);
            setDetectedElements([]);
          }}
        />
      )}

      {/* 🎵 INVISIBLE YOUTUBE AUDIO PLAYERS FOR MUSIC ZONES */}
      <div className="hidden">
        {youtubeZones.map(zone => (
          <YouTube
            key={`yt-zone-${zone.id}`}
            videoId={zone.trackId}
            opts={{
              height: '0',
              width: '0',
              playerVars: {
                autoplay: 1,      // Let the useAudioZones hook manage volume initially
                controls: 0,
                disablekb: 1,
                fs: 0,
                loop: 1,
                playlist: zone.trackId,
              },
            }}
            onReady={(e) => {
              if (ytPlayersRef.current) {
                // Initialize at 0, hook will apply correct distance volume immediately
                e.target.setVolume(0);
                ytPlayersRef.current.set(zone.id, e.target);
              }
            }}
            onEnd={(e) => {
              // Loop the track
              e.target.playVideo();
            }}
            onError={(e) => {
              console.warn(`YouTube player error for zone ${zone.name}`, e);
            }}
          />
        ))}
      </div>

    </div >

  )
}


