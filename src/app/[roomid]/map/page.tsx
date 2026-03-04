"use client"



import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion'
import poisonIcon from './icons/poison.svg';
import stunIcon from './icons/stun.svg';
import blindIcon from './icons/blind.svg';
import invisibleIcon from './icons/invisible.svg';


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
import { useParams } from 'next/navigation'
import { useGame } from '@/contexts/GameContext'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

import { X, Plus, Minus, Edit, Pencil, Eraser, CircleUserRound, Baseline, User, Grid, Cloud, CloudOff, ImagePlus, Trash2, Eye, EyeOff, ScanEye, Move, Hand, Square, Circle as CircleIcon, Slash, Ruler, Map as MapPin, Heart, Shield, Zap, Dices, Sparkles, BookOpen, Flashlight, Info, Image as ImageIcon, Layers, Package, Skull, Ghost, Anchor, Flame, Snowflake, Loader2, Check, Music, Volume2, VolumeX, Lightbulb, ArrowRight, DoorOpen, Pen, ArrowDownUp, Hexagon } from 'lucide-react'
import { toast } from 'sonner';
import { auth, db, realtimeDb, dbRef, onValue, onAuthStateChanged } from '@/lib/firebase'
import { doc, collection, updateDoc, addDoc, deleteDoc, setDoc, getDocs, query, where } from 'firebase/firestore'
import Combat from '@/components/(combat)/combat2';
import { CONDITIONS } from '@/components/(combat)/MJcombat';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import CharacterSheet from '@/components/(fiches)/CharacterSheet';
import { Component as RadialMenu } from '@/components/ui/radial-menu';
import CitiesManager from '@/components/(worldmap)/CitiesManager';
import ContextMenuPanel from '@/components/(overlays)/ContextMenuPanel';
import InteractionLayer from '@/components/(interactions)/InteractionLayer';
import { VendorInteraction, GameInteraction, LootInteraction, Interaction, MapObject } from '@/app/[roomid]/map/types';
import ObjectContextMenu from '@/components/(overlays)/ObjectContextMenu';
import LightContextMenu from '@/components/(overlays)/LightContextMenu';
import MusicZoneContextMenu from '@/components/(overlays)/MusicZoneContextMenu';
import PortalContextMenu from '@/components/(overlays)/PortalContextMenu';
import { BulkCharacterContextMenu } from '@/components/(overlays)/BulkCharacterContextMenu';
import { NPCTemplateDrawer } from '@/components/(personnages)/NPCTemplateDrawer';
import { ObjectDrawer } from '@/components/(personnages)/ObjectDrawer';
import { SoundDrawer } from '@/components/(personnages)/SoundDrawer';
import { UnifiedSearchDrawer } from '@/components/(personnages)/UnifiedSearchDrawer';
import { GMTemplatesProvider } from '@/contexts/GMTemplatesContext';
import { PlaceNPCModal } from '@/components/(personnages)/PlaceNPCModal';
import { PlaceObjectModal } from '@/components/(personnages)/PlaceObjectModal';
import { CreateNoteModal } from '@/components/(map)/CreateNoteModal';
import { NoBackgroundModal } from '@/components/(map)/NoBackgroundModal';
import { getDominantColor, getContrastColor } from '@/utils/imageUtils';
import { DeleteConfirmationModal, type EntityToDelete } from '@/components/(map)/DeleteConfirmationModal';
import ElementSelectionMenu, { type DetectedElement } from '@/components/(map)/ElementSelectionMenu';


import { doc as firestoreDoc } from 'firebase/firestore'
import InfoComponent, { type InfoSection } from "@/components/(infos)/info";
import { type NPC } from '@/components/(personnages)/personnages';
import {
  type Obstacle,
  type Point as VisibilityPoint,
  drawShadows,
  drawObstacles,
  calculateShadowPolygons,
  isPointInPolygon,
  getPolygonsContainingViewer,
  isPointInShadows,
  type ShadowResult
} from '@/lib/visibility';
import { LayerControl } from '@/components/(map)/LayerControl';
import { useSettings } from '@/contexts/SettingsContext';
import { SelectionMenu, type SelectionCandidates, type SelectionType } from '@/components/(map)/SelectionMenu';
import { type ViewMode, type Point, type Character, type LightSource, type MapText, type SavedDrawing, type NewCharacter, type Note, type ObjectTemplate, type Layer, type LayerType, type MusicZone, type Scene, type DrawingTool, type Portal } from './types';
import { useAudioZones } from '@/hooks/map/useAudioZones';
import { getResizeHandles, isPointOnDrawing, renderDrawings, renderCurrentPath } from './drawings';
import { useFogManager, calculateDistance, getCellKey, isCellInFog, renderFogLayer } from './shadows';
import MapToolbar, { TOOLS } from '@/components/(map)/MapToolbar';
import BackgroundSelector from '@/components/(map)/BackgroundSelector';
import GlobalSettingsDialog from '@/components/(map)/GlobalSettingsDialog';
import { useMapControl } from '@/contexts/MapControlContext';
import { pasteCharacter } from '@/utils/pasteCharacter';
import { pasteObject } from '@/utils/pasteObject';
import { CursorManager } from '@/components/(map)/CursorManager';
import MapContextMenu from '@/components/(overlays)/MapContextMenu';

// ⚡ Static Token Component for Performance Mode (Moved Outside Component to avoid Remounting/Flickering)
const StaticToken = React.memo(({ src, alt, style, className, performanceMode }: { src: string, alt: string, style?: React.CSSProperties, className?: string, performanceMode: string }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = src?.toLowerCase().endsWith('.webm') || src?.toLowerCase().endsWith('.mp4');

  if (performanceMode === 'static') {
    if (isVideo) {
      // 🎥 Static Video (Paused)
      return (
        <video
          ref={videoRef}
          src={src}
          style={{ ...style, objectFit: 'cover' }}
          className={className}
          muted
          playsInline
          onLoadedData={(e) => {
            e.currentTarget.currentTime = 0; // First frame
            e.currentTarget.pause(); // Ensure paused
          }}
        />
      );
    } else {
      // 🖼️ Static Image (Frozen GIF) - Use img instead of canvas for proper objectFit support
      return (
        <img
          src={src}
          alt={alt}
          style={style}
          className={className}
          draggable={false}
        />
      );
    }
  }

  // 🚀 Animated Default
  if (isVideo) {
    return <img src={src} alt={alt} style={style} className={className} draggable={false} />;
  }
  return <img src={src} alt={alt} style={style} className={className} draggable={false} />;
});
import { AudioMixerPanel, useAudioMixer } from '@/components/(audio)/AudioMixerPanel';
import MeasurementPanel from '@/components/(map)/MeasurementPanel';
import PortalConfigDialog from '@/components/(map)/PortalConfigDialog';
import MeasurementContextMenu from '@/components/(overlays)/MeasurementContextMenu';
import {
  type MeasurementShape,
  renderLineMeasurement,
  renderConeMeasurement,
  renderCircleMeasurement,
  renderCubeMeasurement,
  renderStartPoint,
  isPointInMeasurement,
  type SharedMeasurement
} from './measurements';
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

const getMediaDimensions = (media: HTMLImageElement | HTMLVideoElement | CanvasImageSource) => {
  if (media instanceof HTMLVideoElement) {
    return { width: media.videoWidth, height: media.videoHeight };
  }
  if (media instanceof HTMLImageElement) {
    return { width: media.width, height: media.height };
  }
  return { width: (media as any).width || 0, height: (media as any).height || 0 };
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
  const [bgImageObject, setBgImageObject] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); // 🆕 Progress state
  const videoRef = useRef<HTMLVideoElement | null>(null); // Ref to keep track of video element for cleanup
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




  // 🔄 UNDO/REDO KEYBOARD SHORTCUTS
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.UNDO)) {
        e.preventDefault();
        undo();
      } else if (isShortcutPressed(e, SHORTCUT_ACTIONS.REDO)) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortcutPressed, undo, redo]);

  useEffect(() => {
    if (backgroundImage) {
      loadBackground(backgroundImage);
    } else {
      setIsBackgroundLoading(false);
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current = null;
      }
    };
  }, [backgroundImage]);

  const loadBackground = async (url: string) => {
    setIsBackgroundLoading(true);
    setLoadingProgress(0);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current = null;
    }

    // 💡 Add cache busting to force fresh CORS headers check
    const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

    try {
      // 1. Fetch with progress
      // We use cache: 'reload' to force network request and avoid browser cache
      const response = await fetch(cacheBustedUrl, { cache: 'reload', mode: 'cors' });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength || '0', 10);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Impossible de lire le flux");

      const chunks = [];
      let receivedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        receivedLength += value.length;

        if (total > 0) {
          setLoadingProgress(Math.round((receivedLength / total) * 100));
        }
      }

      const blob = new Blob(chunks);
      const objectUrl = URL.createObjectURL(blob);

      // 2. Setup Media
      const isVideo = url.toLowerCase().includes('.webm') || url.toLowerCase().includes('.mp4');

      if (isVideo) {
        const video = document.createElement('video');
        video.src = objectUrl;
        video.autoplay = true;
        video.loop = true;
        video.muted = audioVolumes.backgroundAudio === 0;
        video.volume = audioVolumes.backgroundAudio;
        video.playsInline = true;
        // Blob URLs don't need crossOrigin as they are local

        video.onloadedmetadata = () => {
          setBgImageObject(video);
          setIsBackgroundLoading(false);
          video.play().catch(e => console.error("Video play error:", e));
        };
        video.onerror = () => {
          setIsBackgroundLoading(false);
          loadBackgroundFallback(url); // Retry with fallback if blob fails
        };
        videoRef.current = video;
      } else {
        const img = new Image();
        img.src = objectUrl;
        img.onload = () => {
          setBgImageObject(img);
          setIsBackgroundLoading(false);
        }
        img.onerror = () => {
          setIsBackgroundLoading(false);
          loadBackgroundFallback(url); // Retry with fallback if blob fails
        }
      }

    } catch (error) {
      console.warn("Chargement avec progression échoué (CORS probable), passage en chargement standard...", error);
      // Fallback: Default standard load
      loadBackgroundFallback(url);
    }
  };

  const loadBackgroundFallback = (url: string) => {
    // 💡 Add cache busting to force fresh CORS headers check
    const cacheBustedUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

    const isVideo = url.toLowerCase().includes('.webm') || url.toLowerCase().includes('.mp4');
    if (isVideo) {
      const video = document.createElement('video');
      video.crossOrigin = "anonymous";
      video.src = cacheBustedUrl;
      video.autoplay = true;
      video.loop = true;
      video.muted = audioVolumes.backgroundAudio === 0;
      video.volume = audioVolumes.backgroundAudio;
      video.playsInline = true;

      video.onloadedmetadata = () => {
        setBgImageObject(video);
        setIsBackgroundLoading(false);
        video.play().catch(e => console.error("Video play error:", e));
      };
      videoRef.current = video;
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = cacheBustedUrl;
      img.onload = () => {
        setBgImageObject(img);
        setIsBackgroundLoading(false);
      }
      img.onerror = () => {
        // Attempt recovery without CORS (will taint canvas but show image)
        console.warn("CORS load failed. Trying without CORS.");
        const imgNoCors = new Image();
        imgNoCors.removeAttribute('crossOrigin');
        imgNoCors.src = url; // Use original URL for non-CORS fallback
        imgNoCors.onload = () => {
          setBgImageObject(imgNoCors);
          setIsBackgroundLoading(false);
          // toast.warning("Image chargée sans CORS. Certaines fonctionnalités (Brouillard) peuvent être limitées.");
        }
        imgNoCors.onerror = (e) => {
          console.error("Non-CORS Load Failed:", e, url);
          setIsBackgroundLoading(false);
          // toast.error("Échec du chargement de l'image de fond.");
        }
      }
    }
  }

  // 🎵 Update background video audio settings when they change
  // 🎵 Update background video audio settings when they change
  useEffect(() => {
    // Background Video Logic
    if (bgImageObject instanceof HTMLVideoElement) {
      // Sync Volume
      bgImageObject.volume = audioVolumes.backgroundAudio;
      bgImageObject.muted = audioVolumes.backgroundAudio === 0;

      if (performanceMode === 'static') {
        bgImageObject.pause();
      } else {
        bgImageObject.play().catch(() => { });
      }
    }
  }, [bgImageObject, performanceMode, audioVolumes.backgroundAudio]);




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


  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMapContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

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
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
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
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false)

  //  NPC Template Drag & Drop States
  const [isNPCDrawerOpen, setIsNPCDrawerOpen] = useState(false)
  const [draggedTemplate, setDraggedTemplate] = useState<NPC | null>(null)
  const [dropPosition, setDropPosition] = useState<{ x: number; y: number } | null>(null)
  const [isUnifiedSearchOpen, setIsUnifiedSearchOpen] = useState(false)

  //  LIGHT SOURCE PLACEMENT STATE
  const [isLightPlacementMode, setIsLightPlacementMode] = useState(false);
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
  const shadowTempCanvas = useRef<HTMLCanvasElement | null>(null);
  const shadowExteriorCanvas = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [visibilityRadius, setVisibilityRadius] = useState(100);
  //  NOUVEAU SYSTÈME DE BROUILLARD PAR QUADRILLAGE
  const [fogMode, setFogMode] = useState(false);
  const [fogGrid, setFogGrid] = useState<Map<string, boolean>>(new Map()); // clé: "x,y", valeur: true = brouillard

  // 🔧 Calcul dynamique de la taille de cellule de brouillard basé sur la taille de la carte
  // Divise la plus petite dimension par un nombre fixe pour avoir toujours ~20 cellules
  // Cela garantit que les cellules sont vraiment proportionnelles à la carte
  const fogCellSize = useMemo(() => {
    if (!bgImageObject) return 100; // Valeur par défaut si pas d'image
    const { width, height } = getMediaDimensions(bgImageObject);
    const minDimension = Math.min(width, height);
    // Toujours avoir environ 20 cellules dans la plus petite dimension
    return Math.round(minDimension / 20);
  }, [bgImageObject]);

  const [showFogGrid, setShowFogGrid] = useState(false); // Pour afficher/masquer la grille
  const [isFogDragging, setIsFogDragging] = useState(false); // Pour le placement continu de brouillard
  const [lastFogCell, setLastFogCell] = useState<string | null>(null); // Dernière cellule touchée pour éviter les doublons


  const [isFogAddMode, setIsFogAddMode] = useState(true); // Pour savoir si on ajoute (true) ou supprime (false) du brouillard
  const [fullMapFog, setFullMapFog] = useState(false); // Pour couvrir toute la carte de brouillard
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null);
  const [isSelectingArea, setIsSelectingArea] = useState(false);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [selectedFogIndex, setSelectedFogIndex] = useState<number | null>(null);
  const [selectedFogCells, setSelectedFogCells] = useState<string[]>([]); // 🆕 Array of cell keys "x,y" for multi-selection
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [mouseButton, setMouseButton] = useState<number | null>(null); // Pour tracker quel bouton de souris est pressé
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref pour l'input de changement de fond
  const [panMode, setPanMode] = useState(false); // Mode déplacement de carte

  const [playerViewMode, setPlayerViewMode] = useState(false); // Mode "Vue Joueur" pour le MJ

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

  // Map Context Menu State
  const [mapContextMenu, setMapContextMenu] = useState<{ x: number, y: number } | null>(null);
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

  // 🔦 DYNAMIC LIGHTING / OBSTACLES STATE
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [visibilityMode, setVisibilityMode] = useState(false);
  const [currentVisibilityTool, setCurrentVisibilityTool] = useState<'fog' | 'chain' | 'polygon' | 'edit' | 'none'>('chain');
  const [isDrawingObstacle, setIsDrawingObstacle] = useState(false);
  const [currentObstaclePoints, setCurrentObstaclePoints] = useState<Point[]>([]);
  const [selectedObstacleIds, setSelectedObstacleIds] = useState<string[]>([]); // MULTI-SELECTION
  const [shadowOpacity, setShadowOpacity] = useState<number>(1.0); // 0.0 to 1.0 (0% to 100%)
  const [isDraggingObstacle, setIsDraggingObstacle] = useState(false);
  const [draggedObstacleId, setDraggedObstacleId] = useState<string | null>(null);
  const [draggedObstacleOriginalPoints, setDraggedObstacleOriginalPoints] = useState<Point[]>([]);
  const [draggedObstaclesOriginalPoints, setDraggedObstaclesOriginalPoints] = useState<{ id: string, points: Point[] }[]>([]); // For multi-drag
  const [isDraggingObstaclePoint, setIsDraggingObstaclePoint] = useState(false);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null);
  const [connectedPoints, setConnectedPoints] = useState<{ obstacleId: string, pointIndex: number }[]>([]);

  // Refs pour le drag haute fréquence (évite les problèmes de rafraîchissement d'état)
  const draggedObstacleOriginalPointsRef = useRef<Point[]>([]);
  const dragStartPosRef = useRef<Point | null>(null);

  // 🆕 Nouveaux états pour les types d'obstacles avancés
  const [currentObstacleType, setCurrentObstacleType] = useState<'wall' | 'one-way-wall' | 'door'>('wall');
  const [isOneWayReversed, setIsOneWayReversed] = useState<boolean>(false); // Sens par défaut ou inversé

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

  const { calculateFogOpacity, saveFogGrid, saveFullMapFog, toggleFogCell, addFogCellIfNew, flushFogUpdates } = useFogManager({
    roomId,
    selectedCityId, // 🆕 Passed prop
    fogGrid, // 🆕 Passed prop
    setFogGrid, // 🆕 Passed prop
    lastFogCell, // 🆕 Passed prop
    setLastFogCell, // 🆕 Passed prop
    fullMapFog, // 🆕 Passed prop
    isMJ,
    playerViewMode, // 🆕 Passed prop
    persoId,
    viewAsPersoId,
    characters: charactersRenderRef.current,
    lights: lights,
    fogCellSize
  });

  // 🌫️ Wrapper for saveFogGrid with undo/redo support
  const saveFogGridWithHistory = async (newGrid: Map<string, boolean>, description: string = 'Modification du brouillard') => {
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
      description
    });
  };

  const [audioCharacterId, setAudioCharacterId] = useState<string | null>(null);
  const handleConfigureCharacterAudio = (characterId: string) => {
    const char = characters.find(c => c.id === characterId);
    if (!char) return;
    setAudioCharacterId(characterId);
    setTempZoneData({
      name: char.audio?.name || char.name,
      url: char.audio?.url || '',
      radius: char.audio?.radius || 200,
      volume: char.audio?.volume ?? 0.5
    });
    setShowMusicDialog(true);
  };

  const saveMusicZone = async () => {
    if (!roomId) return;

    // Character Audio Mode
    if (audioCharacterId) {
      if (!tempZoneData.url) return; // Name optional?

      const updates = {
        audio: {
          name: tempZoneData.name,
          url: tempZoneData.url,
          radius: Number(tempZoneData.radius),
          volume: Number(tempZoneData.volume),
          loop: true
        }
      };
      await updateDoc(doc(db, 'cartes', roomId, 'characters', audioCharacterId), updates);
      setShowMusicDialog(false);
      setAudioCharacterId(null);
      setTempZoneData({ name: '', url: '', radius: 200, volume: 0.5 });
      return;
    }

    // Standard Music Zone Mode
    if (!newMusicZonePos || !tempZoneData.name || !tempZoneData.url) return;

    const newZone: Omit<MusicZone, 'id'> = {
      x: newMusicZonePos.x,
      y: newMusicZonePos.y,
      radius: parseFloat(tempZoneData.radius.toString()),
      url: tempZoneData.url,
      name: tempZoneData.name,
      volume: parseFloat(tempZoneData.volume.toString()),
      cityId: selectedCityId
    };

    await addDoc(collection(db, 'cartes', roomId, 'musicZones'), newZone);
    setShowMusicDialog(false);
    setNewMusicZonePos(null);
    // Reset temp data
    setTempZoneData({ name: '', url: '', radius: 200, volume: 0.5 });
  };

  const openEditDialog = (zoneId: string) => {
    const zone = musicZones.find(z => z.id === zoneId);
    if (zone) {
      setEditingMusicZoneId(zoneId);
      setTempZoneData({
        name: zone.name || '',
        url: zone.url || '',
        radius: zone.radius,
        volume: zone.volume
      });
      setShowEditMusicDialog(true);
    }
  };

  const saveEditedMusicZone = async () => {
    if (!editingMusicZoneId || !tempZoneData.name || !tempZoneData.url || !roomId) return;

    await updateDoc(doc(db, 'cartes', roomId, 'musicZones', editingMusicZoneId), {
      name: tempZoneData.name,
      url: tempZoneData.url,
      radius: parseFloat(tempZoneData.radius.toString()),
      volume: parseFloat(tempZoneData.volume.toString())
    });

    setShowEditMusicDialog(false);
    setEditingMusicZoneId(null);
    setTempZoneData({ name: '', url: '', radius: 200, volume: 0.5 });
  };



  const deleteMusicZone = async (id: string) => {
    if (!roomId) return;
    await deleteDoc(doc(db, 'cartes', roomId, 'musicZones', id));
    setSelectedMusicZoneIds(prev => prev.filter(zid => zid !== id));
  }

  const updateMusicZonePosition = async (id: string, x: number, y: number) => {
    if (!roomId) return;
    const zone = musicZones.find(z => z.id === id);
    await updateWithHistory(
      'musicZones',
      id,
      { x, y },
      `Déplacement de la zone musicale${zone?.name ? ` "${zone.name}"` : ''}`
    );
  };

  // 🎯 OVERLAPPING ELEMENTS DETECTION SYSTEM
  /**
   * Détecte tous les éléments (lumières, portails, zones de musique) à une position donnée
   * @param clickX - Coordonnée X du clic en coordonnées monde/image
   * @param clickY - Coordonnée Y du clic en coordonnées monde/image
   * @returns Liste des éléments détectés
   */
  const detectElementsAtPosition = (clickX: number, clickY: number): DetectedElement[] => {
    const detected: DetectedElement[] = [];

    // Calculer un rayon adapté à la taille de l'image
    // Taille standard d'un token ~40-50px à l'écran
    // Rayon monde = Rayon écran / (scale * zoom)
    // On prend un rayon généreux pour faciliter le clic
    let worldRadius = 50;

    if (bgImageObject && containerRef.current) {
      const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImageObject);
      const cWidth = containerRef.current.clientWidth;
      const cHeight = containerRef.current.clientHeight;
      const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
      // Rayon écran ~30px -> Monde
      if (scale > 0) {
        worldRadius = 30 / scale;
      }
    }

    // Fallback si calcul impossible ou trop petit
    const DETECTION_RADIUS = Math.max(worldRadius, 20 / zoom);

    console.log(`🔍 Détection @ ${Math.round(clickX)},${Math.round(clickY)} - Radius: ${Math.round(DETECTION_RADIUS)}`);

    // Détecter les sources de lumière (MJ only)
    if (isMJ) {
      lights.forEach(light => {
        if (!light.cityId || light.cityId === selectedCityId) {
          const dist = Math.sqrt(Math.pow(light.x - clickX, 2) + Math.pow(light.y - clickY, 2));
          if (dist < DETECTION_RADIUS) {
            detected.push({
              id: light.id,
              type: 'light',
              name: light.name || 'Source de Lumière',
              position: { x: light.x, y: light.y }
            });
          }
        }
      });
    }

    // Détecter les portails (MJ only)
    if (isMJ) {
      portals
        .filter(p => !p.cityId || p.cityId === selectedCityId)
        .forEach(portal => {
          const dist = Math.sqrt(Math.pow(portal.x - clickX, 2) + Math.pow(portal.y - clickY, 2));
          if (dist < DETECTION_RADIUS) {
            detected.push({
              id: portal.id,
              type: 'portal',
              name: portal.name || 'Portail',
              position: { x: portal.x, y: portal.y }
            });
          }
        });
    }

    // Détecter les zones de musique (MJ only)
    if (isMJ) {
      musicZones.forEach(zone => {
        const dist = Math.sqrt(Math.pow(zone.x - clickX, 2) + Math.pow(zone.y - clickY, 2));
        if (dist < DETECTION_RADIUS) {
          detected.push({
            id: zone.id,
            type: 'musicZone',
            name: zone.name || 'Zone de Musique',
            position: { x: zone.x, y: zone.y }
          });
        }
      });
    }

    // 🎯 Détecter les personnages (PNJ et joueurs)
    characters.forEach(char => {
      // Vérifier que le personnage est dans la scène actuelle
      if (typeof char.x === 'number' && typeof char.y === 'number') {
        const dist = Math.sqrt(Math.pow(char.x - clickX, 2) + Math.pow(char.y - clickY, 2));
        if (dist < DETECTION_RADIUS) {
          let imgUrl: string | null = null;
          if (char.image) {
            imgUrl = typeof char.image === 'string' ? char.image : char.image.src;
          } else if (char.imageUrl) {
            imgUrl = typeof char.imageUrl === 'string' ? char.imageUrl : char.imageUrl.src;
          }

          detected.push({
            id: char.id,
            type: 'character',
            name: char.name || 'Personnage',
            position: { x: char.x, y: char.y },
            image: imgUrl
          });
        }
      }
    });

    // 🎯 Détecter les objets (MJ only)
    if (isMJ) {
      objects
        .filter(obj => !obj.cityId || obj.cityId === selectedCityId)
        .forEach(obj => {
          const dist = Math.sqrt(Math.pow(obj.x - clickX, 2) + Math.pow(obj.y - clickY, 2));
          if (dist < DETECTION_RADIUS) {
            detected.push({
              id: obj.id,
              type: 'object',
              name: obj.name || 'Objet',
              position: { x: obj.x, y: obj.y },
              image: obj.imageUrl
            });
          }
        });
    }

    return detected;
  };

  /**
   * Gestionnaire de sélection d'un élément depuis le menu
   * Active l'élément sélectionné et prépare le drag
   */
  const handleElementSelection = (element: DetectedElement, screenX: number, screenY: number) => {
    // 🔒 Vérifier les permissions AVANT d'appliquer la sélection
    if (element.type === 'character') {
      const charIndex = characters.findIndex(c => c.id === element.id);
      if (charIndex !== -1) {
        const char = characters[charIndex];
        const canControl = isMJ || (char.type === 'joueurs' && char.id === persoId) || char.visibility === 'ally';

        if (!canControl) {
          // Au lieu d'afficher une erreur, on ouvre le menu contextuel pour voir les infos/interagir
          setContextMenuCharacterId(char.id);
          setContextMenuOpen(true);
          setShowElementSelectionMenu(false);
          // On ne change PAS l'élément actif (pas de drag ni de transparence)
          return;
        }
      }
    }

    setActiveElementType(element.type);
    setActiveElementId(element.id);
    setShowElementSelectionMenu(false);

    // Stocker les informations pour le contexte approprié
    // Le drag sera effectivement initié au prochain clic sur l'élément actif
    switch (element.type) {
      case 'light':
        setContextMenuLightId(element.id);
        break;
      case 'portal':
        setContextMenuPortalId(element.id);
        break;
      case 'musicZone':
        setSelectedMusicZoneIds([element.id]);
        break;
      case 'character':
        // Trouver l'index du personnage
        const charIndex = characters.findIndex(c => c.id === element.id);
        if (charIndex !== -1) {
          setSelectedCharacterIndex(charIndex);
        }
        break;
      case 'object':
        // Trouver l'index de l'objet
        const objIndex = objects.findIndex(o => o.id === element.id);
        if (objIndex !== -1) {
          setSelectedObjectIndices([objIndex]);
        }
        break;
    }
  };

  /**
   * Réinitialise la sélection active sur clic dans le vide ou changement de mode
   */
  const resetActiveElementSelection = () => {
    setActiveElementType(null);
    setActiveElementId(null);
    setDetectedElements([]);
    setShowElementSelectionMenu(false);
  };

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

  const updateShadowOpacity = async (newOpacity: number) => {
    if (!roomId || !isMJ) return;
    // Optimistic update
    setShadowOpacity(newOpacity);
    const settingsRef = doc(db, 'cartes', roomId, 'settings', 'general');
    await setDoc(settingsRef, { shadowOpacity: newOpacity }, { merge: true });
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

  useAudioZones(effectiveMusicZones, listenerPos, true, audioVolumes.musicZones);

  // 🎵 Update background video audio settings when they change
  useEffect(() => {
    if (videoRef.current) {
      const isLayerVis = isLayerVisible('background_audio');

      // Use ONLY local mixer volume. Ignore old Firebase synced volume.
      const shouldMute = !isLayerVis || audioVolumes.backgroundAudio <= 0.001;

      videoRef.current.muted = shouldMute;

      // Ensure volume is between 0 and 1. Apply mixer volume directly.
      const safeVolume = shouldMute ? 0 : Math.max(0, Math.min(1, audioVolumes.backgroundAudio));
      videoRef.current.volume = safeVolume;
    }
  }, [isLayerVisible, audioVolumes.backgroundAudio]); // Removed old system dependencies






  // 🔦 KEYBOARD EVENT HANDLER pour les obstacles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 🛡️ IGNORE INPUTS (Fix for typing deletion issue)
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable)
      ) {
        return;
      }

      //  CENTRALIZED DELETE - Handle Delete/Backspace for any selected entity
      if ((e.key === 'Delete' || e.key === 'Backspace') && isMJ) {
        // Check if we have any selected entity
        const hasSelection =
          selectedCharacters.length > 0 ||
          selectedCharacterIndex !== null ||
          selectedObjectIndices.length > 0 ||
          selectedNoteIndex !== null ||
          selectedMusicZoneIds.length > 0 ||
          (selectedObstacleIds.length > 0 && visibilityMode) ||
          selectedDrawingIndex !== null ||
          selectedFogCells.length > 0;

        if (hasSelection) {
          e.preventDefault();
          handleDeleteKeyPress();
          return;
        }
      }

      // Annuler le dessin d'obstacle en cours avec Escape
      if (e.key === 'Escape' && isDrawingObstacle) {
        e.preventDefault();
        setIsDrawingObstacle(false);
        setCurrentObstaclePoints([]);
      }

      // 🆕 Désélectionner les cases de brouillard avec Escape
      if (e.key === 'Escape' && selectedFogCells.length > 0) {
        e.preventDefault();
        setSelectedFogCells([]);
      }

      // Quitter le mode obstacle avec Escape si pas de dessin en cours
      if (e.key === 'Escape' && visibilityMode && !isDrawingObstacle) {
        e.preventDefault();
        setVisibilityMode(false);
      }

      // 📋 COPY (Ctrl+C / Cmd+C)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        // Check if a character is selected
        if (selectedCharacterIndex !== null && characters[selectedCharacterIndex]) {
          const charToCopy = characters[selectedCharacterIndex];

          if (charToCopy.type === 'joueurs') {
            toast.error("Impossible de copier un personnage joueur");
            return;
          }

          setCopiedCharacterTemplate(charToCopy);
          setCopiedObjectTemplate(null); // Clear object copy
          console.log("Character copied:", charToCopy.name);
          toast.success(`Personnage copié : ${charToCopy.name}`);
        }
        // Check if an object is selected
        else if (selectedObjectIndices.length > 0) {
          // For now, take the first selected object (single copy support)
          const objIndex = selectedObjectIndices[0];
          const objToCopy = objects[objIndex];
          if (objToCopy) {
            setCopiedObjectTemplate(objToCopy);
            setCopiedCharacterTemplate(null); // Clear char copy
            console.log("Object copied:", objToCopy.name);
            toast.success(`Objet copié : ${objToCopy.name}`);
          }
        }
      }

      // 📋 PASTE (Ctrl+V / Cmd+V)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (isMJ) { // Ensure only MJ can paste for now
          if (copiedCharacterTemplate) {
            pasteCharacter(roomId, copiedCharacterTemplate, selectedCityId)
              .then(() => toast.success(`Personnage collé : ${copiedCharacterTemplate.name}`))
              .catch(err => console.error("Failed to paste character:", err));
          } else if (copiedObjectTemplate) {
            pasteObject(roomId, copiedObjectTemplate, selectedCityId)
              .then(() => toast.success(`Objet collé : ${copiedObjectTemplate.name}`))
              .catch(err => console.error("Failed to paste object:", err));
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedCharacters,
    selectedCharacterIndex,
    selectedObjectIndices,
    selectedNoteIndex,
    selectedMusicZoneIds,
    selectedObstacleIds,
    selectedDrawingIndex,
    selectedFogCells,
    visibilityMode,
    isDrawingObstacle,
    isMJ,
    copiedCharacterTemplate,
    copiedObjectTemplate, // Added dependency
    roomId,
    selectedCityId
  ]);

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

  // Keyboard shortcut: Ctrl+F / Cmd+F to open search drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+F (Windows/Linux) or Cmd+F (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault(); // Prevent browser's default search
        if (isMJ) {
          setIsUnifiedSearchOpen(prev => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMJ]);


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
    const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
    return characters.find(c => c.id === effectivePersoId);
  }, [characters, playerViewMode, viewAsPersoId, persoId]);

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
      drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight);
      drawCharacterBorders(borderCtx, image, containerWidth, containerHeight);

      let lastFrameTime = 0;
      const fpsInterval = 1000 / 30; // 30fps for smooth animations with good performance

      const renderLoop = (timestamp: number) => {
        const elapsed = timestamp - lastFrameTime;
        if (elapsed > fpsInterval) {
          lastFrameTime = timestamp - (elapsed % fpsInterval);

          // Only redraw background if it's a video (changes each frame)
          if (image instanceof HTMLVideoElement) {
            drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight);
          }

          // OPTIMIZATION: Only redraw foreground (where measurements are)
          // Background and borders are static, no need to redraw every frame
          drawForegroundLayers(fgCtx, image, containerWidth, containerHeight);
        }

        animationFrameId = requestAnimationFrame(renderLoop);
      };

      animationFrameId = requestAnimationFrame(renderLoop);
    } else {
      // ONE-TIME DRAW MODE - for static content
      // Use requestAnimationFrame to ensure smooth rendering in sync with browser
      animationFrameId = requestAnimationFrame(() => {
        drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight);
        drawCharacterBorders(borderCtx, image, containerWidth, containerHeight);
        drawForegroundLayers(fgCtx, image, containerWidth, containerHeight);
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
    currentScene, spawnPointMode, isDraggingSpawnPoint
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

  const handleCanvasDrop = async (e: React.DragEvent) => {
    e.preventDefault()

    const canvas = bgCanvasRef.current
    const image = bgImageObject
    if (!canvas || !image) {
      return
    }
    const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);

    // Get template data from dataTransfer
    const templateData = e.dataTransfer.getData('application/json')

    if (!templateData) {
      return
    }

    try {
      if (templateData.includes('"type":"object_template"')) {
        const template = JSON.parse(templateData)

        // Logic similar for Object
        const rect = canvas.getBoundingClientRect()
        const containerWidth = containerRef.current?.clientWidth || rect.width
        const containerHeight = containerRef.current?.clientHeight || rect.height
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
        const scaledWidth = imgWidth * scale * zoom
        const scaledHeight = imgHeight * scale * zoom
        const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
        const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight


        setDraggedObjectTemplateForPlace(template)
        setDropObjectPosition({ x, y })
        setShowPlaceObjectModal(true)
        return
      }

      // Handle sound_template drop
      if (templateData.includes('"type":"sound_template"')) {
        const sound = JSON.parse(templateData)

        const rect = canvas.getBoundingClientRect()
        const containerWidth = containerRef.current?.clientWidth || rect.width
        const containerHeight = containerRef.current?.clientHeight || rect.height
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
        const scaledWidth = imgWidth * scale * zoom
        const scaledHeight = imgHeight * scale * zoom
        const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
        const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight

        // Create a music zone with the sound
        const newZone: Omit<MusicZone, 'id'> = {
          x,
          y,
          radius: 200, // Default radius
          url: sound.soundUrl,
          name: sound.name,
          volume: 0.5, // Default volume
          cityId: selectedCityId
        }

        await addDoc(collection(db, 'cartes', roomId, 'musicZones'), newZone)

        toast.success(`Zone sonore "${sound.name}" ajoutée sur la carte`, { duration: 1000 })
        return
      }

      const template = JSON.parse(templateData) as NPC
      const rect = canvas.getBoundingClientRect()
      const containerWidth = containerRef.current?.clientWidth || rect.width
      const containerHeight = containerRef.current?.clientHeight || rect.height

      // Calcul de l'échelle et des dimensions scalées (même logique que drawMap)
      const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
      const scaledWidth = imgWidth * scale * zoom
      const scaledHeight = imgHeight * scale * zoom

      // IMPORTANT: Utiliser la même formule que handleCanvasMouseMove (lignes 2425-2426)
      // Le canvas utilise ctx.scale(sizeMultiplier) donc pas besoin de diviser par sizeMultiplier
      const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
      const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight


      setDraggedTemplate(template)
      setDropPosition({
        x: Math.max(0, Math.min(imgWidth, x)),
        y: Math.max(0, Math.min(imgHeight, y))
      })
      setShowPlaceModal(true)
    } catch (error) {
      console.error('❌ Error parsing template data:', error)
      toast.error('Erreur lors du placement de l\'élément')
    }
  }

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleObjectDragStart = (template: ObjectTemplate) => {
  }

  const handleSoundDragStart = (sound: any) => {
    setDraggedSoundTemplate(sound)
  }

  const handlePlaceConfirm = async (config: {
    nombre: number; visibility?: 'public' | 'gm_only' | 'ally' | 'hidden' | 'visible' | 'custom' | 'invisible';
  }) => {
    if (!draggedTemplate || !dropPosition) return

    try {
      const charactersRef = collection(db, `cartes/${roomId}/characters`)

      // Create instances based on nombre
      for (let i = 0; i < config.nombre; i++) {
        const offsetX = i * 50 // Offset each instance slightly
        const offsetY = i * 50

        const finalX = dropPosition.x + offsetX
        const finalY = dropPosition.y + offsetY

        const characterData = {
          Nomperso: config.nombre > 1 ? `${draggedTemplate.Nomperso} ${i + 1}` : draggedTemplate.Nomperso,
          type: 'pnj',
          imageURL2: draggedTemplate.imageURL2 || '',
          niveau: draggedTemplate.niveau,
          PV: draggedTemplate.PV,
          PV_Max: draggedTemplate.PV_Max,
          Defense: draggedTemplate.Defense,
          FOR: draggedTemplate.FOR ?? 10,
          DEX: draggedTemplate.DEX ?? 10,
          CON: draggedTemplate.CON ?? 10,
          INT: draggedTemplate.INT ?? 10,
          SAG: draggedTemplate.SAG ?? 10,
          CHA: draggedTemplate.CHA ?? 10,
          Contact: draggedTemplate.Contact ?? 0,
          Distance: draggedTemplate.Distance ?? 0,
          Magie: draggedTemplate.Magie ?? 0,
          INIT: draggedTemplate.INIT ?? 0,
          Actions: draggedTemplate.Actions || [],
          visibility: config.visibility,
          visibilityRadius: 100, // Default visibility radius
          cityId: selectedCityId, // Associate with current city
          x: finalX,
          y: finalY,
          createdAt: new Date()
        };

        await addWithHistory(
          'characters',
          characterData,
          `Ajout de "${characterData.Nomperso}"`
        );
      }

      // Toast de succès
      if (config.nombre > 1) {
        toast.success(`${config.nombre} PNJ "${draggedTemplate.Nomperso}" ajoutés sur la carte`)
      } else {
        toast.success(`PNJ "${draggedTemplate.Nomperso}" ajouté sur la carte`)
      }

    } catch (error) {
      console.error('❌ Error placing NPC:', error)
      toast.error('Erreur lors du placement du PNJ')
    } finally {
      setShowPlaceModal(false)
      setDraggedTemplate(null)
      setDropPosition(null)
    }
  }

  const handlePlaceObjectConfirm = async (config: {
    nombre: number;
    visibility: 'visible' | 'hidden' | 'custom';
    visibleToPlayerIds: string[];
  }) => {
    if (!draggedObjectTemplateForPlace || !dropObjectPosition || !selectedCityId) return

    try {
      for (let i = 0; i < config.nombre; i++) {
        // Add slight offset for multiple objects so they don't stack perfectly
        const offsetX = i * 20
        const offsetY = i * 20

        // Calculate width/height (same logic as before)
        let width = 100;
        let height = 100;

        try {
          // Preload image to get dimensions if possible, or just default
          // In a real scenario we might want to wait, but here we can just fire and forget or await if critical
          // improved: stick to default if image loading fails quickly
        } catch (e) {
          // ignore
        }

        // Note: resizing logic is a bit complex to duplicate perfectly without refactoring drop logic
        // For now, we use default 100x100 or try to get ratio if we can efficiently. 
        // ACTUALLY, let's try to get ratio inside the loop or before.
        // Better: let's use the template's default dimensions if stored, or 100x100.

        // Let's re-implement the ratio logic briefly
        if (draggedObjectTemplateForPlace.imageUrl) {
          try {
            const img = new Image();
            img.src = draggedObjectTemplateForPlace.imageUrl;
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
            });
            if (img.width && img.height) {
              const ratio = img.width / img.height;
              height = width / ratio;
            }
          } catch (e) {
            console.warn("Could not load image for aspect ratio", e);
          }
        }

        const objectData: any = {
          x: dropObjectPosition.x + offsetX,
          y: dropObjectPosition.y + offsetY,
          width,
          height,
          rotation: 0,
          imageUrl: draggedObjectTemplateForPlace.imageUrl,
          name: draggedObjectTemplateForPlace.name,
          cityId: selectedCityId,
          createdAt: new Date(),
          visibility: config.visibility,
          visibleToPlayerIds: config.visibility === 'custom' ? config.visibleToPlayerIds : [],
          type: 'decors',
          visible: config.visibility === 'visible' || (config.visibility === 'custom' && config.visibleToPlayerIds.length > 0), // Basic visibility fallback
          isLocked: false
        };

        await addWithHistory(
          'objects',
          objectData,
          `Ajout de l'objet (${i + 1}/${config.nombre}) "${draggedObjectTemplateForPlace.name}"`
        );
      }

      if (config.nombre > 1) {
        toast.success(`${config.nombre} objets "${draggedObjectTemplateForPlace.name}" ajoutés`)
      } else {
        toast.success(`Objet "${draggedObjectTemplateForPlace.name}" ajouté`)
      }

    } catch (error) {
      console.error('Error placing object:', error);
      toast.error("Erreur lors du placement de l'objet");
    } finally {
      setDraggedObjectTemplateForPlace(null)
      setDropObjectPosition(null)
      setShowPlaceObjectModal(false)
    }
  }

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

  // 🔦 FONCTIONS VISIBILITÉ (brouillard + obstacles)
  const toggleVisibilityMode = () => {
    const newMode = !visibilityMode;
    setVisibilityMode(newMode);
    if (!newMode) {
      // Quitter le mode visibilité : réinitialiser les états
      setIsDrawingObstacle(false);
      setCurrentObstaclePoints([]);
      setSelectedObstacleIds([]);
      setFogMode(false);
    } else {
      // Entrer en mode visibilité : désélectionner les autres éléments
      setSelectedCharacterIndex(null);
      setSelectedObjectIndices([]);
      setSelectedNoteIndex(null);
      setSelectedDrawingIndex(null);
    }
  };

  const saveObstacle = async (
    type: 'wall' | 'polygon' | 'one-way-wall' | 'door',
    points: Point[],
    additionalProps?: {
      direction?: 'north' | 'south' | 'east' | 'west';
      isOpen?: boolean;
    }
  ) => {
    if (!roomId || points.length < 2) return;

    try {
      const obstacleData: any = {
        type,
        points,
        cityId: selectedCityId,
        createdAt: new Date().toISOString(),
      };

      // Ajouter les propriétés spécifiques selon le type
      if (type === 'one-way-wall' && additionalProps?.direction) {
        obstacleData.direction = additionalProps.direction;
      }

      if (type === 'door') {
        obstacleData.isOpen = additionalProps?.isOpen ?? false; // Par défaut fermée
      }

      await addToRtdbWithHistory(
        'obstacles',
        obstacleData,
        `Ajout d'un obstacle${type ? ` (${type})` : ''}`
      );
    } catch (error) {
      console.error('❌ Erreur sauvegarde obstacle:', error);
    }
  };

  const deleteObstacle = async (obstacleId: string) => {
    if (!roomId || !obstacleId) return;

    try {
      await deleteFromRtdbWithHistory(
        'obstacles',
        obstacleId,
        `Suppression d'obstacle`
      );
      setSelectedObstacleIds([]);

    } catch (error) {
      console.error('❌ Erreur suppression obstacle:', error);
    }
  };

  const updateObstacle = async (obstacleId: string, newPoints: Point[]) => {
    if (!roomId || !obstacleId || newPoints.length < 2) return;

    try {
      await updateRtdbWithHistory('obstacles', obstacleId, { points: newPoints }, 'Modification obstacle');

    } catch (error) {
      console.error('❌ Erreur mise à jour obstacle:', error);
    }
  };

  const toggleDoorState = async (obstacleId: string) => {
    if (!roomId || !obstacleId || !isMJ) return; // Seul le MJ peut ouvrir/fermer les portes

    try {
      const obstacle = obstacles.find(o => o.id === obstacleId);
      if (!obstacle || obstacle.type !== 'door') return;

      const newIsOpen = !obstacle.isOpen;

      // Mise à jour optimiste locale
      setObstacles(prev => prev.map(o =>
        o.id === obstacleId ? { ...o, isOpen: newIsOpen } : o
      ));

      // Sauvegarder dans Firebase
      await updateRtdbWithHistory(
        'obstacles',
        obstacleId,
        { isOpen: newIsOpen },
        `Porte ${newIsOpen ? 'ouverte' : 'fermée'}`
      );

      toast.success(newIsOpen ? 'Porte ouverte' : 'Porte fermée', {
        duration: 2000,
      });

    } catch (error) {
      console.error('❌ Erreur toggle porte:', error);
      toast.error('Erreur', {
        description: "Impossible de modifier l'état de la porte.",
        duration: 3000,
      });
    }
  };

  const clearAllObstacles = async () => {
    if (!roomId) return;

    try {
      // Supprimer tous les obstacles de la ville courante depuis RTDB
      const currentObstacles = obstacles; // déjà filtrés par cityId
      if (currentObstacles.length === 0) return;
      const deletePromises = currentObstacles.map(o => deleteFromRtdbWithHistory('obstacles', o.id, 'Suppression groupée'));
      await Promise.all(deletePromises);

    } catch (error) {
      console.error('❌ Erreur suppression obstacles:', error);
    }
  };

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

  const handleToolbarAction = (actionId: string) => {
    const deactivateIncompatible = (currentTool: string) => {
      if (currentTool !== TOOLS.DRAW && drawMode) setDrawMode(false);
      if (currentTool !== TOOLS.PAN && panMode) setPanMode(false);
      if (currentTool !== TOOLS.MEASURE && measureMode) setMeasureMode(false);
      if (isMJ) {
        if (currentTool !== TOOLS.VISIBILITY && visibilityMode) {
          setVisibilityMode(false);
          setIsDrawingObstacle(false);
          setCurrentObstaclePoints([]);
          setFogMode(false);
        }

        //  MUTUAL EXCLUSION: Close other drawers
        if (currentTool !== TOOLS.ADD_OBJ && isObjectDrawerOpen) setIsObjectDrawerOpen(false);
        if (currentTool !== TOOLS.ADD_CHAR && isNPCDrawerOpen) setIsNPCDrawerOpen(false);
        if (currentTool !== TOOLS.MUSIC && isSoundDrawerOpen) setIsSoundDrawerOpen(false);
        if (currentTool !== TOOLS.AUDIO_MIXER && isAudioMixerOpen) setIsAudioMixerOpen(false);

        // If opening a tool that requires the map view, switch back from 'world' mode
        if ((currentTool === TOOLS.ADD_OBJ ||
          currentTool === TOOLS.ADD_CHAR ||
          currentTool === TOOLS.MUSIC ||
          currentTool === TOOLS.AUDIO_MIXER) && viewMode === 'world') {
          setViewMode('city');
        }

        if (currentTool !== TOOLS.MUSIC && isMusicMode) setIsMusicMode(false);
        if (currentTool !== TOOLS.MULTI_SELECT && multiSelectMode) setMultiSelectMode(false);
        if (isLightPlacementMode) setIsLightPlacementMode(false);
        if (currentTool !== TOOLS.PORTAL && portalMode) setPortalMode(false); // 🆕 Fix conflict
        if (currentTool !== TOOLS.SPAWN_POINT && spawnPointMode) setSpawnPointMode(false); // 🆕 Fix conflict
      }
    };
    switch (actionId) {
      case TOOLS.PAN: deactivateIncompatible(TOOLS.PAN); togglePanMode(); break;
      case TOOLS.GRID: setShowGrid(!showGrid); break;
      case TOOLS.TOGGLE_CHAR_BORDERS: setShowCharBorders(!showCharBorders); break;
      case TOOLS.LAYERS: setShowLayerControl(!showLayerControl); break;
      case TOOLS.BACKGROUND: if (isMJ) setShowBackgroundSelector(true); break;
      case TOOLS.VIEW_MODE:
        if (isMJ) {
          if (playerViewMode) {
            // Turning off player view mode - clear the selected player
            setViewAsPersoId(null);
          }
          setPlayerViewMode(!playerViewMode);
        }
        break;
      case TOOLS.AUDIO_MIXER: deactivateIncompatible(TOOLS.AUDIO_MIXER); setIsAudioMixerOpen(!isAudioMixerOpen); break;
      case TOOLS.ADD_CHAR: if (isMJ) { deactivateIncompatible(TOOLS.ADD_CHAR); setIsNPCDrawerOpen(!isNPCDrawerOpen); } break;

      case TOOLS.ADD_OBJ: if (isMJ) { deactivateIncompatible(TOOLS.ADD_OBJ); setIsObjectDrawerOpen(!isObjectDrawerOpen); } break;
      case TOOLS.ADD_NOTE: handleAddNote(); break;
      case TOOLS.MUSIC: if (isMJ) { deactivateIncompatible(TOOLS.MUSIC); setIsSoundDrawerOpen(!isSoundDrawerOpen); } break;
      case TOOLS.UNIFIED_SEARCH: if (isMJ) { deactivateIncompatible(TOOLS.UNIFIED_SEARCH); setIsUnifiedSearchOpen(!isUnifiedSearchOpen); } break;
      case TOOLS.PORTAL: if (isMJ) { deactivateIncompatible(TOOLS.PORTAL); setPortalMode(!portalMode); } break;
      case TOOLS.SPAWN_POINT: if (isMJ) { deactivateIncompatible(TOOLS.SPAWN_POINT); setSpawnPointMode(!spawnPointMode); } break;  // 🆕 Toggle spawn point mode
      case TOOLS.MULTI_SELECT: if (isMJ) { deactivateIncompatible(TOOLS.MULTI_SELECT); setMultiSelectMode(!multiSelectMode); } break;
      case TOOLS.BACKGROUND_EDIT: if (isMJ) setIsBackgroundEditMode(!isBackgroundEditMode); break;
      case TOOLS.DRAW: deactivateIncompatible(TOOLS.DRAW); toggleDrawMode(); break;
      case TOOLS.MEASURE: deactivateIncompatible(TOOLS.MEASURE); setMeasureMode(!measureMode); setMeasureStart(null); setMeasureEnd(null); setIsCalibrating(false); break;
      case TOOLS.VISIBILITY: if (isMJ) { deactivateIncompatible(TOOLS.VISIBILITY); toggleVisibilityMode(); } break;
      case TOOLS.CLEAR_DRAWINGS: clearDrawings(); break;
      case TOOLS.ZOOM_IN: setZoom(prev => Math.min(prev + 0.1, 5)); break;
      case TOOLS.ZOOM_OUT: setZoom(prev => Math.max(prev - 0.1, 0.1)); break;
      case TOOLS.WORLD_MAP: navigateToWorldMap(); break;
      case TOOLS.TOGGLE_ALL_BADGES: setShowAllBadges(!showAllBadges); break;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Map Tools
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_PAN)) { e.preventDefault(); handleToolbarAction(TOOLS.PAN); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MEASURE)) { e.preventDefault(); handleToolbarAction(TOOLS.MEASURE); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_DRAW)) { e.preventDefault(); handleToolbarAction(TOOLS.DRAW); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_GRID)) { e.preventDefault(); handleToolbarAction(TOOLS.GRID); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_FOG)) { e.preventDefault(); handleToolbarAction(TOOLS.VISIBILITY); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SELECT)) { e.preventDefault(); setMeasureMode(false); setDrawMode(false); setPanMode(false); } // Default to "Select" (Pointer)

      // New Tools
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_LAYERS)) { e.preventDefault(); handleToolbarAction(TOOLS.LAYERS); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_BACKGROUND)) { e.preventDefault(); handleToolbarAction(TOOLS.BACKGROUND); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_VIEW_MODE)) { e.preventDefault(); handleToolbarAction(TOOLS.VIEW_MODE); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SETTINGS)) { e.preventDefault(); setShowGlobalSettingsDialog(true); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ZOOM_IN)) { e.preventDefault(); handleToolbarAction(TOOLS.ZOOM_IN); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ZOOM_OUT)) { e.preventDefault(); handleToolbarAction(TOOLS.ZOOM_OUT); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_WORLD_MAP)) { e.preventDefault(); handleToolbarAction(TOOLS.WORLD_MAP); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ADD_CHAR)) { e.preventDefault(); handleToolbarAction(TOOLS.ADD_CHAR); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ADD_OBJ)) { e.preventDefault(); handleToolbarAction(TOOLS.ADD_OBJ); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_ADD_NOTE)) { e.preventDefault(); handleToolbarAction(TOOLS.ADD_NOTE); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MUSIC)) { e.preventDefault(); handleToolbarAction(TOOLS.MUSIC); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SEARCH)) { e.preventDefault(); handleToolbarAction(TOOLS.UNIFIED_SEARCH); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_PORTAL)) { e.preventDefault(); handleToolbarAction(TOOLS.PORTAL); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_SPAWN)) { e.preventDefault(); handleToolbarAction(TOOLS.SPAWN_POINT); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_CLEAR)) { e.preventDefault(); handleToolbarAction(TOOLS.CLEAR_DRAWINGS); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MULTI)) { e.preventDefault(); handleToolbarAction(TOOLS.MULTI_SELECT); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_MIXER)) { e.preventDefault(); handleToolbarAction(TOOLS.AUDIO_MIXER); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_BORDERS)) { e.preventDefault(); handleToolbarAction(TOOLS.TOGGLE_CHAR_BORDERS); }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TOOL_BADGES)) { e.preventDefault(); handleToolbarAction(TOOLS.TOGGLE_ALL_BADGES); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortcutPressed, handleToolbarAction]);

  const getActiveToolbarTools = (): string[] => {
    const active: string[] = [];
    if (drawMode) active.push(TOOLS.DRAW);
    if (visibilityMode) active.push(TOOLS.VISIBILITY);
    if (showGrid) active.push(TOOLS.GRID);
    if (showCharBorders) active.push(TOOLS.TOGGLE_CHAR_BORDERS);
    if (panMode) active.push(TOOLS.PAN);
    if (playerViewMode) active.push(TOOLS.VIEW_MODE);
    if (measureMode) active.push(TOOLS.MEASURE);
    if (isMusicMode) active.push(TOOLS.MUSIC);
    if (showLayerControl) active.push(TOOLS.LAYERS);
    if (isObjectDrawerOpen) active.push(TOOLS.ADD_OBJ);
    if (isNPCDrawerOpen) active.push(TOOLS.ADD_CHAR);
    if (isSoundDrawerOpen) active.push(TOOLS.MUSIC);
    if (isUnifiedSearchOpen) active.push(TOOLS.UNIFIED_SEARCH);
    if (portalMode) active.push(TOOLS.PORTAL);
    if (spawnPointMode) active.push(TOOLS.SPAWN_POINT);  // 🆕 Show spawn point mode as active

    if (multiSelectMode) active.push(TOOLS.MULTI_SELECT);
    if (isBackgroundEditMode) active.push(TOOLS.BACKGROUND_EDIT);
    if (isAudioMixerOpen) active.push(TOOLS.AUDIO_MIXER);
    if (showAllBadges) active.push(TOOLS.TOGGLE_ALL_BADGES);
    return active;
  };

  const getToolOptionsContent = () => {
    //  SELECTION : Dessin
    if (selectedDrawingIndex !== null) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">Dessin sélectionné</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (selectedDrawingIndex !== null && roomId) {
                const drawing = drawings[selectedDrawingIndex];
                deleteFromRtdbWithHistory('drawings', drawing.id, 'Suppression du tracé');
                setDrawings(prev => prev.filter((_, i) => i !== selectedDrawingIndex));
                setSelectedDrawingIndex(null);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedDrawingIndex(null)}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    //  SELECTION : Note
    if (selectedNoteIndex !== null) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <Button variant="ghost" size="sm" onClick={handleEditNote} className="text-[#c0a080] hover:text-[#d4b494] hover:bg-white/10">
            <Edit className="w-4 h-4 mr-2" /> Modifier
          </Button>
          <Separator orientation="vertical" className="h-6 w-[1px] bg-white/10 mx-1" />
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteNote}
          >
            <X className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedNoteIndex(null)}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    //  SELECTION : Obstacle (MJ)
    if (selectedObstacleIds.length > 0 && isMJ) {
      // Multiple obstacles selected - simplified panel
      if (selectedObstacleIds.length > 1) {
        return (
          <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <span className="text-white text-sm font-medium pr-2">
              {selectedObstacleIds.length} Obstacles sélectionnés
            </span>

            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (roomId && isMJ) {
                  const deletePromises = selectedObstacleIds.map(async (obstacleId) => {
                    await deleteWithHistory(
                      'obstacles',
                      obstacleId,
                      `Suppression d'obstacle (bulk)`
                    );
                  });
                  await Promise.all(deletePromises);
                  setObstacles(prev => prev.filter(o => !selectedObstacleIds.includes(o.id)));
                  toast.success(`${selectedObstacleIds.length} obstacles supprimés`);
                  setSelectedObstacleIds([]);
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Supprimer tout
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedObstacleIds([])}
              className="text-gray-400 hover:text-white"
            >
              Fermer
            </Button>
          </div>
        );
      }

      // Single obstacle selected - full panel
      const selectedObstacleId = selectedObstacleIds[0];
      const selectedObs = obstacles.find(o => o.id === selectedObstacleId);

      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">
            {selectedObs?.type === 'door' ? 'Porte' :
              selectedObs?.type === 'one-way-wall' ? 'Mur sens-unique' : 'Obstacle'}
          </span>

          {/* Type Switcher */}
          <div className="flex items-center gap-1 border-l border-r border-white/10 px-2 mx-2">
            <Button variant="ghost" size="icon" className={`h-6 w-6 rounded-full hover:bg-white/20 ${selectedObs?.type === 'wall' ? 'bg-white/20 text-white' : 'text-gray-400'}`} onClick={async () => {
              if (!roomId || !selectedObstacleId) return;
              await updateWithHistory(
                'obstacles',
                selectedObstacleId,
                { type: 'wall' },
                `Conversion en mur`
              );
              setObstacles(prev => prev.map(o => o.id === selectedObstacleId ? { ...o, type: 'wall' } : o));
            }} title="Convertir en Mur">
              <div className="w-3 h-3 bg-current rounded-[1px]" />
            </Button>
            <Button variant="ghost" size="icon" className={`h-6 w-6 rounded-full hover:bg-white/20 ${selectedObs?.type === 'one-way-wall' ? 'bg-orange-500/20 text-orange-400' : 'text-gray-400'}`} onClick={async () => {
              if (!roomId || !selectedObstacleId) return;

              // Calculer direction par défaut
              const p1 = selectedObs?.points[0];
              const p2 = selectedObs?.points[1];
              let defaultDir = 'north';
              if (p1 && p2) {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                // Normale main droite (dy, -dx)
                let nx = dy;
                let ny = -dx;
                if (Math.abs(nx) > Math.abs(ny)) {
                  defaultDir = nx > 0 ? 'east' : 'west';
                } else {
                  defaultDir = ny > 0 ? 'south' : 'north';
                }
              }

              await updateWithHistory(
                'obstacles',
                selectedObstacleId,
                { type: 'one-way-wall', direction: defaultDir },
                `Conversion en mur sens-unique`
              );
              setObstacles(prev => prev.map(o => o.id === selectedObstacleId ? { ...o, type: 'one-way-wall', direction: defaultDir as any } : o));
            }} title="Convertir en Mur sens-unique">
              <ArrowRight className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className={`h-6 w-6 rounded-full hover:bg-white/20 ${selectedObs?.type === 'door' ? 'bg-green-500/20 text-green-400' : 'text-gray-400'}`} onClick={async () => {
              if (!roomId || !selectedObstacleId) return;
              await updateWithHistory(
                'obstacles',
                selectedObstacleId,
                { type: 'door', isOpen: false },
                `Conversion en porte`
              );
              setObstacles(prev => prev.map(o => o.id === selectedObstacleId ? { ...o, type: 'door', isOpen: false } : o));
            }} title="Convertir en Porte">
              <DoorOpen className="w-3 h-3" />
            </Button>
          </div>

          {/* Bouton pour ouvrir/fermer les portes */}
          {selectedObs?.type === 'door' && (
            <Button
              variant={selectedObs.isOpen ? "default" : "secondary"}
              size="sm"
              className={selectedObs.isOpen ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700 text-white"}
              onClick={() => toggleDoorState(selectedObstacleId)}
            >
              {selectedObs.isOpen ? (
                <><DoorOpen className="w-4 h-4 mr-2" /> Ouverte</>
              ) : (
                <><DoorOpen className="w-4 h-4 mr-2" /> Fermée</>
              )}
            </Button>
          )}

          {/* Bouton pour inverser le sens des murs à sens unique */}
          {selectedObs?.type === 'one-way-wall' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                if (!roomId || !selectedObstacleId) return;
                const currentDir = selectedObs.direction || 'north';
                let newDir = 'north';
                if (currentDir === 'north') newDir = 'south';
                else if (currentDir === 'south') newDir = 'north';
                else if (currentDir === 'east') newDir = 'west';
                else if (currentDir === 'west') newDir = 'east';

                // Update local
                setObstacles(prev => prev.map(o => o.id === selectedObstacleId ? { ...o, direction: newDir as any } : o));

                // Update Firebase
                await updateWithHistory(
                  'obstacles',
                  selectedObstacleId,
                  { direction: newDir },
                  `Inversion de direction`
                );
              }}
            >
              Inverser sens ⇄
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (selectedObstacleId && roomId && isMJ) {
                await deleteWithHistory(
                  'obstacles',
                  selectedObstacleId,
                  `Suppression d'obstacle`
                );
                setObstacles(prev => prev.filter(o => o.id !== selectedObstacleId));
                toast.success("Obstacle supprimé")
                setSelectedObstacleIds([]);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedObstacleIds([])}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    // 🆕 SELECTION : Cases de brouillard (MJ seulement)
    if (selectedFogCells.length > 0 && isMJ) { // 🔒 Réservé au MJ
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">{selectedFogCells.length} case{selectedFogCells.length > 1 ? 's' : ''} de brouillard sélectionnée{selectedFogCells.length > 1 ? 's' : ''}</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Supprimer ${selectedFogCells.length} case(s) de brouillard ?`)) {
                const newGrid = new Map(fogGrid);
                selectedFogCells.forEach(cellKey => {
                  if (fullMapFog) {
                    newGrid.set(cellKey, true);
                  } else {
                    newGrid.delete(cellKey);
                  }
                });
                setFogGrid(newGrid);
                saveFogGridWithHistory(newGrid, 'Suppression de cellules de brouillard');
                setSelectedFogCells([]);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedFogCells([])}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    //  SELECTION : Multi-Char (MJ)
    if (selectedCharacters.length > 1 && isMJ) {
      const hasNonPlayerCharacter = selectedCharacters.some(index =>
        characters[index]?.type !== 'joueurs'
      );
      if (hasNonPlayerCharacter) {
        return (
          <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <Button variant="destructive" size="sm" onClick={handleDeleteSelectedCharacters}>
              <X className="w-4 h-4 mr-2" /> Supprimer la sélection ({selectedCharacters.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedCharacters([])}
              className="text-gray-400 hover:text-white"
            >
              Fermer
            </Button>
          </div>
        );
      }
    }

    //  SELECTION : Brouillard (MJ)
    if (isMJ && selectedFogIndex !== null) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">Brouillard global</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setFullMapFog(false);
              saveFullMapFog(false);
              setFogGrid(new Map());
              saveFogGridWithHistory(new Map(), 'Suppression de tout le brouillard');
            }}>
            <X className="w-4 h-4 mr-2" /> Supprimer tout
          </Button>
        </div>
      )
    }

    if (drawMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'pen' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('pen')}
              title="Crayon"
            >
              <Pencil className="w-5 h-5" strokeWidth={currentTool === 'pen' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'line' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('line')}
              title="Ligne"
            >
              <Slash className="w-5 h-5" strokeWidth={currentTool === 'line' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'rectangle' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('rectangle')}
              title="Rectangle"
            >
              <Square className="w-5 h-5" strokeWidth={currentTool === 'rectangle' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'circle' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentTool('circle')}
              title="Cercle"
            >
              <CircleIcon className="w-5 h-5" strokeWidth={currentTool === 'circle' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentTool === 'eraser' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'text-gray-400 hover:text-red-400 hover:bg-red-900/20'}`}
              onClick={() => setCurrentTool('eraser')}
              title="Gomme (supprime le trait entier)"
            >
              <Eraser className="w-5 h-5" />
            </Button>
          </div>

          {/* Separator before "Clear All" logic or just integrate it */}
          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Clear All Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
            onClick={() => clearDrawings()}
            title="Tout effacer"
          >
            <Trash2 className="w-5 h-5" />
          </Button>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Colors */}
          <div className="flex items-center gap-2">
            {['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map((color) => (
              <button
                key={color}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${drawingColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                style={{ backgroundColor: color }}
                onClick={() => {
                  setDrawingColor(color);
                  setCurrentTool('pen');
                }}
              />
            ))}
            <div className="relative w-6 h-6 rounded-full overflow-hidden border-2 border-zinc-600 hover:border-white transition-colors">
              <input
                type="color"
                value={drawingColor}
                onChange={(e) => {
                  setDrawingColor(e.target.value);
                  setCurrentTool('pen');
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150%] h-[150%] p-0 m-0 border-0 cursor-pointer"
              />
            </div>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Size */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Taille</span>
            <input
              type="range"
              min="1"
              max="20"
              value={drawingSize}
              onChange={(e) => setDrawingSize(Number(e.target.value))}
              className="h-1 w-24 bg-gray-700 rounded-full appearance-none cursor-pointer accent-[#c0a080]"
            />
            <span className="text-[#c0a080] text-sm font-bold w-4">{drawingSize}</span>
          </div>
        </div>
      );
    }

    //  MODE : Mesure
    if (measureMode) {
      return (
        <div className="flex flex-col items-center gap-2">
          {/* Panel moved to main render */}
        </div>
      );
    }

    if (visibilityMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Eye className="w-4 h-4 text-[#c0a080]" />
            <span className="text-[#c0a080] font-medium text-xs tracking-wide uppercase">Visibilité</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Section Brouillard */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentVisibilityTool === 'fog' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentVisibilityTool('fog')}
              title="Brouillard (clic gauche = ajouter, clic droit = retirer)"
            >
              <Cloud className="w-5 h-5" strokeWidth={currentVisibilityTool === 'fog' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${fullMapFog ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => handleFullMapFogChange(!fullMapFog)}
              title="Activer/désactiver le brouillard total"
            >
              {fullMapFog ? <EyeOff className="w-5 h-5" strokeWidth={2.5} /> : <Eye className="w-5 h-5" />}
            </Button>

            <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-lg transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
              onClick={() => {
                if (window.confirm("Tout supprimer le brouillard ?")) {
                  if (fullMapFog) {
                    setFullMapFog(false);
                    saveFullMapFog(false);
                  }
                  setFogGrid(new Map());
                  saveFogGridWithHistory(new Map(), 'Suppression de tout le brouillard');
                }
              }}
              title="Supprimer tout le brouillard"
            >
              <Trash2 className="w-5 h-5" />
            </Button>

            {/* 🆕 Bouton pour supprimer les cases de brouillard sélectionnées */}
            {selectedFogCells.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-lg transition-all duration-200 bg-amber-900/30 text-amber-400 hover:text-amber-300 hover:bg-amber-900/40"
                onClick={() => {
                  if (window.confirm(`Supprimer ${selectedFogCells.length} case(s) de brouillard sélectionnée(s) ?`)) {
                    const newGrid = new Map(fogGrid);
                    selectedFogCells.forEach(cellKey => {
                      if (fullMapFog) {
                        // En mode fullMapFog, ajouter à fogGrid = révéler (retirer le brouillard)
                        newGrid.set(cellKey, true);
                      } else {
                        // En mode normal, retirer de fogGrid = enlever le brouillard
                        newGrid.delete(cellKey);
                      }
                    });
                    setFogGrid(newGrid);
                    saveFogGridWithHistory(newGrid, 'Suppression de cellules de brouillard sélectionnées');
                    setSelectedFogCells([]);
                  }
                }}
                title={`Supprimer ${selectedFogCells.length} case(s) sélectionnée(s)`}
              >
                <div className="relative">
                  <Trash2 className="w-5 h-5" />
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-black text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {selectedFogCells.length}
                  </span>
                </div>
              </Button>
            )}
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          {/* Section Obstacles (Murs) */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentVisibilityTool === 'chain' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentVisibilityTool('chain')}
              title="Murs connectés (clic pour chaîner, Escape pour terminer)"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={currentVisibilityTool === 'chain' ? 2.5 : 2}>
                <polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>

            {/* Sélection du type d'obstacle (visible uniquement si outil chain actif) */}
            {currentVisibilityTool === 'chain' && (
              <div className="flex items-center gap-1 ml-1 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                <span className="text-[10px] text-gray-400 mr-1">Type:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 text-xs ${currentObstacleType === 'wall' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                  onClick={() => setCurrentObstacleType('wall')}
                  title="Mur normal"
                >
                  Mur
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 text-xs ${currentObstacleType === 'one-way-wall' ? 'bg-orange-500/30 text-orange-300' : 'text-gray-400 hover:text-orange-300 hover:bg-orange-500/20'}`}
                  onClick={() => setCurrentObstacleType('one-way-wall')}
                  title="Mur à sens unique"
                >
                  <ArrowRight className="w-3 h-3 mr-1" />
                  Sens unique
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 text-xs ${currentObstacleType === 'door' ? 'bg-green-500/30 text-green-300' : 'text-gray-400 hover:text-green-300 hover:bg-green-500/20'}`}
                  onClick={() => setCurrentObstacleType('door')}
                  title="Porte"
                >
                  <DoorOpen className="w-3 h-3 mr-1" />
                  Porte
                </Button>

                {/* Sélecteur de direction pour murs à sens unique (Mode simplifié : Normal / Inversé) */}
                {currentObstacleType === 'one-way-wall' && (
                  <div className="flex items-center gap-1 ml-2 pl-2 border-l border-white/10">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 px-2 text-xs border border-orange-500/30 ${isOneWayReversed ? 'bg-orange-500/40 text-white' : 'text-orange-400 hover:bg-orange-500/10'}`}
                      onClick={() => setIsOneWayReversed(!isOneWayReversed)}
                      title="Inverser le sens bloquant (basculer de quel côté on voit)"
                    >
                      Inverser le sens ⇄
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentVisibilityTool === 'polygon' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentVisibilityTool('polygon')}
              title="Polygone (cliquer sur le 1er point pour fermer)"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={currentVisibilityTool === 'polygon' ? 2.5 : 2}>
                <polygon points="12,2 22,8.5 18,20 6,20 2,8.5" />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${currentVisibilityTool === 'edit' ? 'bg-[#c0a080] text-black hover:bg-[#d4b494]' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => setCurrentVisibilityTool('edit')}
              title="Éditer / Déplacer les murs"
            >
              <Pen className="w-5 h-5" strokeWidth={currentVisibilityTool === 'edit' ? 2.5 : 2} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-10 w-10 rounded-lg transition-all duration-200 ${isLightPlacementMode ? 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
              onClick={() => {
                const newMode = !isLightPlacementMode;
                setIsLightPlacementMode(newMode);
                if (newMode) {
                  setCurrentVisibilityTool('none'); // Ensure we are not drawing fog/polygons
                  setDrawMode(false);
                }
              }}
              title="Ajouter une source de lumière"
            >
              <Lightbulb className="w-5 h-5" strokeWidth={isLightPlacementMode ? 2.5 : 2} />
            </Button>

            <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

            {/* Contrôle d'opacité des ombres */}
            <div className="flex items-center gap-2 px-3">
              <div className="flex items-center gap-2 min-w-[140px]">
                <span className="text-xs text-gray-400 whitespace-nowrap">Opacité</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={shadowOpacity * 100}
                  onChange={(e) => updateShadowOpacity(parseInt(e.target.value) / 100)}
                  className="w-16 h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#c0a080]"
                  title="Opacité des ombres (0% = transparent, 100% = opaque)"
                />
                <span className="text-xs font-mono text-[#c0a080] bg-black/30 px-1.5 py-0.5 rounded min-w-[2.5rem] text-center">
                  {Math.round(shadowOpacity * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div >
      );
    }
    if (playerViewMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Eye className="w-4 h-4 text-red-400" />
            <span className="text-red-400 font-medium text-xs tracking-wide uppercase">VUE JOUEUR</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <div className="flex items-center gap-2">
            {characters
              .filter(c => c.type === 'joueurs' || c.visibility === 'ally')
              .map(char => {
                const isSelected = viewAsPersoId === char.id;
                return (
                  <div
                    key={char.id}
                    onClick={() => setViewAsPersoId(isSelected ? null : char.id)}
                    className={`relative w-8 h-8 rounded-full overflow-hidden border-2 cursor-pointer transition-all duration-200 ${isSelected ? 'border-[#c0a080] scale-110 shadow-[0_0_10px_rgba(192,160,128,0.4)]' : 'border-white/10 hover:border-white/40 hover:scale-105 opacity-70 hover:opacity-100'}`}
                    title={char.name}
                  >
                    {char.image && (typeof char.image === 'object' ? (char.image as any).src : char.image) ? (
                      <img src={typeof char.image === 'object' ? (char.image as any).src : char.image} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-[10px] text-zinc-400 font-bold">
                        {char.name[0]}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-lg transition-all duration-200 text-gray-400 hover:text-red-400 hover:bg-red-900/20"
            onClick={() => {
              setPlayerViewMode(false);
              setViewAsPersoId(null);
            }}
            title="Quitter"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      );
    }
    if (measureMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Ruler className="w-4 h-4 text-[#c0a080]" />
            <span className="text-[#c0a080] font-medium text-xs tracking-wide uppercase">Mode Mesure</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <div className="text-xs text-gray-400">
            {isCalibrating ? "Tracez une ligne d'étalon." : "Tracez pour mesurer."}
          </div>

          {!isCalibrating && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsCalibrating(true);
                setMeasureStart(null);
                setMeasureEnd(null);
              }}
              className="h-8 px-3 ml-2 text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"
            >
              Étalonner
            </Button>
          )}
          {isCalibrating && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCalibrating(false)}
              className="h-8 px-3 ml-2 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg"
            >
              Annuler
            </Button>
          )}
        </div>
      );
    }
    if (isMusicMode) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Music className="w-4 h-4 text-fuchsia-400" />
            <span className="text-fuchsia-400 font-medium text-xs tracking-wide uppercase">Mode Musique</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <span className="text-xs text-gray-400 hidden sm:inline-block">Clic carte pour placer</span>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1 hidden sm:block" />


        </div>
      );
    }

    //  PORTAL MODE
    if (portalMode && isMJ) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
            <Hexagon className="w-4 h-4 text-[#c0a080]" />
            <span className="text-[#c0a080] font-medium text-xs tracking-wide uppercase">Mode Portail</span>
          </div>

          <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

          <span className="text-xs text-gray-400 hidden sm:inline-block">Choisissez le type :</span>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPortalPlacementMode('scene-change')}
              className={`h-8 px-3 text-xs font-medium rounded-lg transition-colors ${portalPlacementMode === 'scene-change'
                ? 'bg-[#c0a080] text-black hover:bg-[#d4b594]'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
            >
              <DoorOpen className="w-3 h-3 mr-1.5" />
              Autre carte
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPortalPlacementMode('same-map');
                setFirstPortalPoint(null); // Reset pour un nouveau portail
              }}
              className={`h-8 px-3 text-xs font-medium rounded-lg transition-colors ${portalPlacementMode === 'same-map'
                ? 'bg-[#c0a080] text-black hover:bg-[#d4b594]'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
            >
              <ArrowDownUp className="w-3 h-3 mr-1.5" />
              Même carte
            </Button>
          </div>

          {portalPlacementMode === 'same-map' && firstPortalPoint && (
            <div className="ml-2 px-2 py-1 bg-blue-500/20 border border-blue-400/30 rounded text-xs text-blue-300">
              Cliquez pour placer la sortie
            </div>
          )}
        </div>
      );
    }

    return null;
  };

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



  //  NOUVELLE FONCTION : Vérifier si un personnage est visible pour l'utilisateur actuel
  const isCharacterVisibleToUser = (char: Character): boolean => {
    // Le MJ en mode normal voit toujours tout
    const effectiveIsMJ = isMJ && !playerViewMode;
    if (effectiveIsMJ) return true;

    // 👻 INVISIBLE : Visible UNIQUEMENT par le MJ (sauf en vue joueur)
    // Cette vérification doit être faite AVANT tout le reste pour garantir l'invisibilité totale
    if ((char.visibility as string) === 'invisible') {
      if (effectiveIsMJ) return true;
      return false;
    }

    // Les joueurs et alliés sont toujours visibles
    if (char.type === 'joueurs' || char.visibility === 'ally') {
      return true;
    }

    // 🆕 Mode Custom : vérifier si le joueur actuel est dans la liste des joueurs autorisés
    if ((char.visibility as string) === 'custom') {
      const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
      if (!effectivePersoId) return false;
      return char.visibleToPlayerIds?.includes(effectivePersoId) ?? false;
    }

    // 🔦 Vérifier si le personnage est dans l'ombre d'un obstacle
    if (obstacles.length > 0 && bgImageObject) {
      // Trouver la position du joueur actuel
      const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
      const viewer = characters.find(c => c.id === effectivePersoId);

      if (viewer && viewer.x !== undefined && viewer.y !== undefined) {
        const charPos = { x: char.x, y: char.y };
        const viewerPos = { x: viewer.x, y: viewer.y };
        const mapBounds = { width: bgImageObject.width, height: bgImageObject.height };

        // Vérifier si le personnage est dans l'ombre
        if (isPointInShadows(charPos, viewerPos, obstacles, mapBounds)) {
          return false; // Le personnage est caché par un obstacle
        }
      }
    }

    // 💡 PRIORITÉ : Vérifier si le personnage est éclairé par une source de lumière
    // Si oui, il est visible même dans le brouillard
    const isLit = lights.some((light) => {
      if (!light.visible) return false;
      if (light.x === undefined || light.y === undefined || !light.radius) return false;

      // Calculer la distance entre le personnage et la source de lumière
      const distToLight = calculateDistance(char.x, char.y, light.x, light.y);

      // Convertir le rayon de la lumière en pixels (light.radius est en mètres)
      const lightRadiusPixels = light.radius * pixelsPerUnit;

      // Le personnage est éclairé si dans le rayon de la lumière
      return distToLight <= lightRadiusPixels;
    });

    // Si le personnage est éclairé par une source de lumière, il est visible
    if (isLit) {
      return true;
    }

    // Vérifier si le personnage est dans le brouillard
    const isInFog = fullMapFog || isCellInFog(char.x, char.y, fogGrid, fogCellSize);

    // Déterminer la visibilité effective (les PNJ dans le brouillard deviennent cachés)
    // Note: Les alliés et joueurs sont déjà traités au-dessus
    let effectiveVisibility = char.visibility;
    if (isInFog) {
      effectiveVisibility = 'hidden';
    }

    // Les personnages cachés (ou cachés par le brouillard) ne sont visibles que s'ils sont dans le rayon de vision d'un joueur/allié
    if (effectiveVisibility === 'hidden') {
      const containerRef_current = containerRef.current;
      const canvasRef_current = bgCanvasRef.current;
      if (!containerRef_current || !canvasRef_current || !bgImageObject) return false;

      const rect = canvasRef_current.getBoundingClientRect();
      const containerWidth = containerRef_current.clientWidth || rect.width;
      const containerHeight = containerRef_current.clientHeight || rect.height;
      const image = bgImageObject;

      const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
      const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
      const scaledWidth = imgWidth * scale * zoom;
      const scaledHeight = imgHeight * scale * zoom;

      const charScreenX = (char.x / imgWidth) * scaledWidth - offset.x;
      const charScreenY = (char.y / imgHeight) * scaledHeight - offset.y;

      // Vérifier si dans le rayon de vision de SON joueur ou d'un allié
      return characters.some((player) => {
        const playerScreenX = (player.x / imgWidth) * scaledWidth - offset.x;
        const playerScreenY = (player.y / imgHeight) * scaledHeight - offset.y;
        return (
          (player.id === persoId || player.visibility === 'ally') &&
          calculateDistance(charScreenX, charScreenY, playerScreenX, playerScreenY) <= ((player.visibilityRadius ?? 100) / imgWidth) * scaledWidth
        );
      });
    }

    // Sinon, visible
    return true;
  };

  //  NOUVELLE FONCTION : Vérifier si un objet est visible pour l'utilisateur actuel
  const isObjectVisibleToUser = (obj: MapObject): boolean => {

    // Le MJ en mode normal voit toujours tout
    const effectiveIsMJ = isMJ && !playerViewMode;
    if (effectiveIsMJ) return true;

    // Si l'objet n'a pas de visibilité définie, il est visible par défaut (rétrocompatibilité)
    if (!obj.visibility || obj.visibility === 'visible') {
      return true;
    }

    // Objets cachés
    if (obj.visibility === 'hidden') {
      return false;
    }

    // 🆕 Mode Custom : vérifier si le joueur actuel est dans la liste des joueurs autorisés
    if ((obj.visibility as string) === 'custom') {
      const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;
      if (!effectivePersoId) return false;
      return obj.visibleToPlayerIds?.includes(effectivePersoId) ?? false;
    }

    // Par défaut, visible
    return true;
  };




  /* Removed duplicates */

  const drawBackgroundLayers = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, containerWidth: number, containerHeight: number) => {
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

        // 🆕 Gérer les sauts de ligne (\n ou <br>)
        const textLines = note.text.replace(/<br\s*\/?>/gi, '\n').split('\n');
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

    //  DRAW PORTAL ZONES (Visible to all - shows activation area)
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

    //  DRAW FIRST PORTAL POINT INDICATOR (when placing same-map portal)
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

  };

  //  DRAW MEASUREMENTS (Shared + Local) - NOW RENDERED LAST (ON TOP)
  const drawMeasurements = (
    ctx: CanvasRenderingContext2D,
    imgWidth: number,
    imgHeight: number,
    scaledWidth: number,
    scaledHeight: number
  ) => {
    // 1. Shared Measurements
    measurements.forEach(m => {
      // REMOVED: Skip logic - let all measurements render
      // The local measurement will draw on top if both exist

      const p1 = m.start;
      const p2 = m.end;
      if (!p1 || !p2) return;

      const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
      const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;
      const x2 = (p2.x / imgWidth) * scaledWidth - offset.x;
      const y2 = (p2.y / imgHeight) * scaledHeight - offset.y;

      const screenStart = { x: x1, y: y1 };
      const screenEnd = { x: x2, y: y2 };
      const currentScale = scaledWidth / (imgWidth * zoom);

      const renderOptions = {
        ctx,
        start: screenStart,
        end: screenEnd,
        zoom,
        scale: currentScale,
        pixelsPerUnit,
        unitName: m.unitName || unitName,
        isCalibrating: false,

        coneAngle: m.coneAngle || 53.13,
        coneShape: m.coneShape || 'rounded',
        coneMode: m.coneMode || 'angle',
        fixedLength: m.fixedLength,
        coneWidth: m.coneWidth,
        skinElement: (m.skin && measurementSkins[m.skin]) ? measurementSkins[m.skin] : null
      };

      switch (m.type) {
        case 'line': renderLineMeasurement(renderOptions); break;
        case 'cone': renderConeMeasurement(renderOptions); break;
        case 'circle': renderCircleMeasurement(renderOptions); break;
        case 'cube': renderCubeMeasurement(renderOptions); break;
      }
    });

    // 2. Active Local Measurement
    if (measureMode && measureStart) {
      const p1 = measureStart;
      const p2 = measureEnd;

      if (p1 && p2) {
        const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
        const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;
        const x2 = (p2.x / imgWidth) * scaledWidth - offset.x;
        const y2 = (p2.y / imgHeight) * scaledHeight - offset.y;

        const screenStart = { x: x1, y: y1 };
        const screenEnd = { x: x2, y: y2 };
        const currentScale = scaledWidth / (imgWidth * zoom);

        const renderOptions = {
          ctx,
          start: screenStart,
          end: screenEnd,
          zoom,
          scale: currentScale,
          pixelsPerUnit,
          unitName,
          isCalibrating,
          coneAngle: coneAngle,
          coneShape: coneShape,
          coneMode: coneMode,
          fixedLength: coneLength,
          coneWidth: coneWidth, // Custom
          skinElement: ((measurementShape === 'circle' || measurementShape === 'cone') && fireballVideo) ? fireballVideo : null
        };

        switch (measurementShape) {
          case 'line': renderLineMeasurement(renderOptions); break;
          case 'cone': renderConeMeasurement(renderOptions); break;
          case 'circle': renderCircleMeasurement(renderOptions); break;
          case 'cube': renderCubeMeasurement(renderOptions); break;
        }
      } else if (p1 && !p2) {
        // Start point only
        const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
        const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;

        const shapeNames = { line: 'line', cone: 'cone', circle: 'circle', cube: 'cube' };
        renderStartPoint(ctx, { x: x1, y: y1 }, zoom, shapeNames[measurementShape]);
      }
    }
  };


  //  Draw character borders only (rendered on separate canvas BEFORE character images)
  const drawCharacterBorders = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, containerWidth: number, containerHeight: number) => {
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

  const drawForegroundLayers = (ctx: CanvasRenderingContext2D, image: CanvasImageSource, containerWidth: number, containerHeight: number) => {
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

    //  Optionnel : Dessiner les cercles de visibilité des joueurs et alliés (pour debug)
    // En mode Vue Joueur, le MJ ne voit pas les cercles de debug
    if (isMJ && !playerViewMode && showFogGrid) {
      characters.forEach(character => {
        if ((character.type === 'joueurs' || character.visibility === 'ally') && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
          const playerScreenX = (character.x / imgWidth) * scaledWidth - offset.x;
          const playerScreenY = (character.y / imgHeight) * scaledHeight - offset.y;
          const radiusScreen = ((character.visibilityRadius ?? 100) / imgWidth) * scaledWidth;

          // Couleur différente pour les alliés (vert) vs joueurs (jaune)
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

    // 🔦 RENDER DYNAMIC LIGHTING FOG OF WAR (with ray-casting)
    // On dessine le brouillard après le fond et les dessins, mais avant les personnages

    // Déterminer si on utilise la vision dynamique ou le brouillard classique
    const effectiveIsMJ = isMJ && !playerViewMode;

    // 🔦 SHADOW CASTING pour les obstacles (fonctionne EN PLUS du brouillard)
    const hasObstacles = obstacles.length > 0;

    // 🌫️ D'abord dessiner le brouillard classique (si actif)
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
        selectedFogCells // 🆕 Pass selected fog cells for visual rendering
      );
    }


    if (hasObstacles && !effectiveIsMJ && isLayerVisible('obstacles')) {
      // Trouver le personnage du joueur
      let viewerPosition: Point | null = null;

      // [NEW] Use simulated view ID if active
      const effectivePersoId = (playerViewMode && viewAsPersoId) ? viewAsPersoId : persoId;

      for (const character of characters) {
        if (character.id === effectivePersoId &&
          character.x !== undefined && character.y !== undefined) {
          viewerPosition = { x: character.x, y: character.y };
          break;
        }
      }

      if (viewerPosition) {
        const mapBounds = { width: imgWidth, height: imgHeight };

        // Dessiner les ombres avec l'opacité ajustable par le MJ
        drawShadows(
          ctx,
          viewerPosition,
          obstacles,
          mapBounds,
          shadowOpacity, // Opacité ajustable (10%, 50%, 100%, etc.)
          transformPoint,
          {
            precalculated: precalculatedShadows ?? undefined,
            tempCanvas: shadowTempCanvas.current ?? undefined,
            exteriorCanvas: shadowExteriorCanvas.current ?? undefined
          }
        );
      }
    }


    // 🎵 DRAW MUSIC ZONES (Visible if music layer is ON OR if the specific zone belongs to the selected character)
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
        // VISUALISATION RAYON (Gradient) (Toujours visible en mode musique, plus fort si sélectionné)
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

        // Bordure du rayon (Plus visible si sélectionné)
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
          ctx.fillText('♫', center.x, center.y + 1);

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
      ctx.fillText('📍', spawnPos.x, spawnPos.y);

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

    // 🔦 DESSINER LES OBSTACLES (visible seulement pour le MJ en mode édition)
    if (isLayerVisible('obstacles') && (visibilityMode || (effectiveIsMJ && obstacles.length > 0))) {
      // 1. Base Layer (Thick Black)
      drawObstacles(ctx, obstacles, transformPoint, {
        strokeColor: '#000000',
        fillColor: visibilityMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)',
        strokeWidth: 10,
        showHandles: false, // Don't draw handles twice
        selectedIds: selectedObstacleIds, // Pass all selected IDs
      });

      // 2. Detail Layer (Inner Grey Line) - Makes it look like a constructed wall
      drawObstacles(ctx, obstacles, transformPoint, {
        strokeColor: '#555555',
        fillColor: 'transparent', // Don't fill twice
        strokeWidth: 4,
        showHandles: visibilityMode || selectedObstacleIds.length > 0,
        selectedIds: selectedObstacleIds, // Pass all selected IDs
      });

      // Dessiner l'obstacle en cours de création
      if (isDrawingObstacle && currentObstaclePoints.length > 0) {
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);

        if (currentVisibilityTool === 'polygon' && currentObstaclePoints.length >= 2) {
          // Polygone : dessiner toutes les lignes + ligne de retour vers le premier point
          ctx.beginPath();
          const firstPoint = transformPoint(currentObstaclePoints[0]);
          ctx.moveTo(firstPoint.x, firstPoint.y);

          for (let i = 1; i < currentObstaclePoints.length; i++) {
            const p = transformPoint(currentObstaclePoints[i]);
            ctx.lineTo(p.x, p.y);
          }

          // Ligne de fermeture vers le premier point (plus transparent)
          if (currentObstaclePoints.length >= 3) {
            const lastPoint = transformPoint(currentObstaclePoints[currentObstaclePoints.length - 1]);
            ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(firstPoint.x, firstPoint.y);
          }
          ctx.stroke();

          // Indicateur de fermeture (cercle vert quand on est proche du premier point)
          if (currentObstaclePoints.length >= 3) {
            const lastP = currentObstaclePoints[currentObstaclePoints.length - 1];
            const firstP = currentObstaclePoints[0];
            const dist = Math.sqrt(Math.pow(lastP.x - firstP.x, 2) + Math.pow(lastP.y - firstP.y, 2));

            if (dist < 20 / zoom) {
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
        } else {
          // Chaîne de murs : ligne simple
          ctx.beginPath();
          const firstPoint = transformPoint(currentObstaclePoints[0]);
          ctx.moveTo(firstPoint.x, firstPoint.y);

          for (let i = 1; i < currentObstaclePoints.length; i++) {
            const p = transformPoint(currentObstaclePoints[i]);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
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

      // 🔗 Dessiner le point d'accroche (snap point) si détecté
      if (visibilityMode && snapPoint && (currentVisibilityTool === 'chain' || currentVisibilityTool === 'polygon' || (currentVisibilityTool === 'edit' && isDraggingObstaclePoint))) {
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
    }

    //  CALCUL DES OMBRES POUR MASQUER LES PNJs ET OBJETS (Côté Client seulement)
    // Si un PNJ ou objet est dans l'ombre du joueur (ou allié), il ne doit pas être affiché
    let activeShadowsForFiltering: Point[][] | null = null;
    let polygonsContainingViewerForFiltering: Obstacle[] = [];

    if (!effectiveIsMJ && obstacles.length > 0 && isLayerVisible('obstacles') && precalculatedShadows) {
      // ⚡ OPTIMIZATION: Use precalculated shadows from useMemo!
      activeShadowsForFiltering = precalculatedShadows.shadows;
      polygonsContainingViewerForFiltering = precalculatedShadows.polygonsContainingViewer;
    }






    //  Dessiner la zone de sélection en cours
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

      // Bordure en pointillés plus visible
      ctx.strokeStyle = '#0096FF';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

      // Bordure solide intérieure pour plus de contraste
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(rectX + 1, rectY + 1, rectWidth - 2, rectHeight - 2);

      // Afficher les dimensions de la zone (même pour les sélections fines car le texte est à l'extérieur)
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

        const text = `${widthText} × ${heightText}`;
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

        //  Vérifier si le personnage est masqué par une ombre (uniquement pour les joueurs)
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
            for (const polygon of polygonsContainingViewerForFiltering) {
              if (!isPointInPolygon(charPos, polygon.points)) {
                isVisible = false;
                break;
              }
            }
          }

          if (!isVisible) return; // Ne pas dessiner si dans l'ombre
        }

        //  Déterminer la visibilité effective du personnage
        let effectiveVisibility = char.visibility;

        // Utiliser la fonction centralisée qui gère les lumières, le brouillard, etc.
        if (!isCharacterVisibleToUser(char)) {
          effectiveVisibility = 'hidden';
        }

        // Les alliés sont toujours visibles (même dans le brouillard complet)
        if (char.visibility === 'ally') {
          isVisible = true;
        }
        // Les personnages cachés (ou cachés par le brouillard) ne sont visibles que pour le MJ (en mode normal) ou s'ils sont dans le rayon de vision d'un joueur ou allié
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
          //  Couleur spéciale pour les personnages dans la zone de sélection
          let borderColor;
          let lineWidth = 3;

          if (selectedCharacters.includes(index)) {
            // Personnage sélectionné
            borderColor = 'rgba(0, 255, 0, 1)';  // Vert vif
            lineWidth = 4;
          } else if (isSelectingArea && selectionStart && selectionEnd) {
            // Vérifier si le personnage est dans la zone de sélection en cours
            const minX = Math.min(selectionStart.x, selectionEnd.x);
            const maxX = Math.max(selectionStart.x, selectionEnd.x);
            const minY = Math.min(selectionStart.y, selectionEnd.y);
            const maxY = Math.max(selectionStart.y, selectionEnd.y);

            if (char.x >= minX && char.x <= maxX && char.y >= minY && char.y <= maxY) {
              borderColor = 'rgba(0, 150, 255, 1)'; // Bleu pour prévisualisation
              lineWidth = 4;
            } else {
              // Couleur normale selon le type
              if (isMJ) {
                // MJ : voit le personnage actif en rouge vif
                borderColor = char.id === activePlayerId
                  ? 'rgba(255, 0, 0, 1)'             // Rouge vif pour le personnage actif (dont c'est le tour)
                  : char.visibility === 'ally'
                    ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les alliés
                    : char.type === 'joueurs'
                      ? 'rgba(0, 0, 255, 0.8)'           // Bleu pour les personnages joueurs
                      : 'rgba(255, 165, 0, 0.8)';        // Orange pour les PNJ
              } else {
                // Joueur : voit SEULEMENT son personnage en rouge
                borderColor = char.id === persoId
                  ? 'rgba(255, 0, 0, 1)'             // Rouge vif pour SON personnage
                  : char.visibility === 'ally'
                    ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les alliés
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
                  ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les alliés
                  : char.type === 'joueurs'
                    ? 'rgba(0, 0, 255, 0.8)'           // Bleu pour les personnages joueurs
                    : 'rgba(255, 165, 0, 0.8)';        // Orange pour les PNJ
            } else {
              // Joueur : voit SEULEMENT son personnage en rouge
              borderColor = char.id === persoId
                ? 'rgba(255, 0, 0, 1)'             // Rouge vif pour SON personnage
                : char.visibility === 'ally'
                  ? 'rgba(0, 255, 0, 0.8)'           // Vert pour les alliés
                  : char.type === 'joueurs'
                    ? 'rgba(0, 0, 255, 0.8)'           // Bleu pour les autres personnages joueurs
                    : 'rgba(255, 165, 0, 0.8)';        // Orange pour les PNJ
            }
          }

          ctx.strokeStyle = borderColor;
          ctx.lineWidth = lineWidth;

          //  Taille différente pour les personnages joueurs (avec imageURLFinal)
          //  Taille différente pour les personnages joueurs (avec imageURLFinal)
          const isPlayerCharacter = char.type === 'joueurs';
          const charScale = char.scale || 1;
          const finalScale = charScale * globalTokenScale;

          const baseRadius = isPlayerCharacter ? 30 : 20;
          const baseBorderRadius = isPlayerCharacter ? 32 : 22;

          // const iconRadius = baseRadius * finalScale * zoom; // Not used locally?
          const borderRadius = baseBorderRadius * finalScale * zoom;

          // ⚠️ Border circle is now drawn on characterBordersCanvasRef (separate layer BEFORE character images)
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

            // Pré-calcul des tailles de texte
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

            // Ombre portée
            ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 3;

            // Fond (Gris foncé/Noir style "Interface")
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

              // Séparateur
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

        // Draw hidden status badge if character is hidden (soit par défaut, soit par le brouillard) - uniquement en mode MJ normal, pas en vue joueur
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

  const handleCanvasMouseDown = async (e: React.MouseEvent<Element>) => {
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
      if (visibilityMode && currentVisibilityTool === 'fog' && (e.button === 0 || e.button === 2)) {
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
        if (visibilityMode && currentVisibilityTool === 'fog' && (e.button === 0 || e.button === 2)) {
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
        if (visibilityMode && currentVisibilityTool === 'edit' && isLayerVisible('obstacles')) {
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
              if ((obs.type === 'wall' || obs.type === 'one-way-wall' || obs.type === 'door') && obs.points.length >= 2) {
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
              } else if (obs.type === 'polygon' && obs.points.length >= 3) {
                let inside = false;
                for (let i = 0, j = obs.points.length - 1; i < obs.points.length; j = i++) {
                  const xi = obs.points[i].x, yi = obs.points[i].y;
                  const xj = obs.points[j].x, yj = obs.points[j].y;
                  if (((yi > clickY) !== (yj > clickY)) && (clickX < (xj - xi) * (clickY - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                  }
                }
                clickedOnThis = inside;
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
            // 🚪 PORTES et MURS À SENS UNIQUE : détection comme les murs normaux
            if ((obstacle.type === 'wall' || obstacle.type === 'one-way-wall' || obstacle.type === 'door') && obstacle.points.length >= 2) {
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
            }
            if (obstacle.type === 'polygon' && obstacle.points.length >= 3) {
              let inside = false;
              for (let i = 0, j = obstacle.points.length - 1; i < obstacle.points.length; j = i++) {
                const xi = obstacle.points[i].x, yi = obstacle.points[i].y;
                const xj = obstacle.points[j].x, yj = obstacle.points[j].y;
                if (((yi > clickY) !== (yj > clickY)) && (clickX < (xj - xi) * (clickY - yi) / (yj - yi) + xi)) {
                  inside = !inside;
                }
              }
              return inside;
            }
            return false;
          });

          if (clickedObstacle) {
            // 🚪 COMPORTEMENT SPÉCIAL POUR LES PORTES : toggle au lieu de sélectionner
            if (clickedObstacle.type === 'door') {
              await toggleDoorState(clickedObstacle.id);
              // Ne pas sélectionner, juste toggler
              return;
            }

            // ✅ MULTI-SÉLECTION avec Shift (comme pour les objets)
            if (e.shiftKey) {
              // Si Shift est pressé, ajouter/retirer de la sélection
              if (selectedObstacleIds.includes(clickedObstacle.id)) {
                // Déjà sélectionné : retirer de la sélection
                setSelectedObstacleIds(prev => prev.filter(id => id !== clickedObstacle.id));
              } else {
                // Pas encore sélectionné : ajouter à la sélection
                setSelectedObstacleIds(prev => [...prev, clickedObstacle.id]);
              }
            } else {
              // Sans Shift : sélection simple (remplacer)
              setSelectedObstacleIds([clickedObstacle.id]);
            }
          } else {
            // Clic dans le vide : désélectionner tout
            setSelectedObstacleIds([]);
          }
          return;
        }

        // 🔦 MODE VISIBILITÉ - OUTILS DESSIN (chain, polygon)
        if (visibilityMode && (currentVisibilityTool === 'chain' || currentVisibilityTool === 'polygon')) {
          // Désélectionner tout obstacle si on dessine
          setSelectedObstacleIds([]);

          if (isDrawingObstacle) {
            // CONTINUER le dessin en cours
            const clickPoint = snapPoint || { x: clickX, y: clickY };

            if (currentVisibilityTool === 'chain' && currentObstaclePoints.length >= 1) {
              // Murs connectés : sauvegarde le segment actuel, puis continue
              const finalPoints = [...currentObstaclePoints, clickPoint];

              // Utiliser le type d'obstacle sélectionné
              const additionalProps: any = {};

              if (currentObstacleType === 'one-way-wall' && finalPoints.length >= 2) {
                // Calculer la direction automatiquement basé sur le segment et le sens (Normal/Inversé)
                const p1 = finalPoints[0];
                const p2 = finalPoints[1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;

                // Normale par défaut (rotation -90° / main gauche) : (-dy, dx)
                // Ou (+90° / main droite) : (dy, -dx)
                // Choisissons Main Droite par défaut (dy, -dx)
                let nx = dy;
                let ny = -dx;

                // Si inversé, on prend l'opposé
                if (isOneWayReversed) {
                  nx = -nx;
                  ny = -ny;
                }

                // Déterminer la cardinalité dominante
                if (Math.abs(nx) > Math.abs(ny)) {
                  // Dominante X -> Est ou Ouest
                  additionalProps.direction = nx > 0 ? 'east' : 'west';
                } else {
                  // Dominante Y -> Nord ou Sud
                  additionalProps.direction = ny > 0 ? 'south' : 'north';
                }

              } else if (currentObstacleType === 'door') {
                additionalProps.isOpen = false; // Nouvelles portes fermées par défaut
              }

              await saveObstacle(currentObstacleType, finalPoints, additionalProps);
              setCurrentObstaclePoints([clickPoint]);

            } else if (currentVisibilityTool === 'polygon') {
              // Polygone : ajouter des points, fermer si on clique près du début
              const startPoint = currentObstaclePoints[0];
              const distToStart = Math.sqrt(
                Math.pow(clickX - startPoint.x, 2) + Math.pow(clickY - startPoint.y, 2)
              );

              if (currentObstaclePoints.length >= 3 && distToStart < 20 / zoom) {
                // Fermer le polygone
                await saveObstacle('polygon', currentObstaclePoints);
                setIsDrawingObstacle(false);
                setCurrentObstaclePoints([]);
              } else {
                setCurrentObstaclePoints([...currentObstaclePoints, clickPoint]);
              }
            }
          } else {
            // COMMENCER un nouveau dessin
            const startPoint = snapPoint || { x: clickX, y: clickY };
            setIsDrawingObstacle(true);
            setCurrentObstaclePoints([startPoint]);
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

            // Simple version: iterate obstacles
            for (const obs of obstacles) {
              // Polygon check
              if (obs.type === 'polygon') {
                if (isPointInPolygon({ x: clickX, y: clickY }, obs.points)) {
                  clickedObstacleId = obs.id;
                  break;
                }
              } else if (obs.type === 'wall' || obs.type === 'one-way-wall' || obs.type === 'door') {
                // Line check (pour murs normaux, murs à sens unique et portes)
                for (let i = 0; i < obs.points.length - 1; i++) {
                  const p1 = obs.points[i];
                  const p2 = obs.points[i + 1];
                  // distance point to segment
                  const d = pDistance(clickX, clickY, p1.x, p1.y, p2.x, p2.y);
                  if (d < 15) { // Tolerance
                    clickedObstacleId = obs.id;
                    break;
                  }
                }
                if (clickedObstacleId) break;
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
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<Element>) => {
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
  }


  const handleCanvasMouseMove = (e: React.MouseEvent<Element>) => {

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


    // 🕵️ HOVER DETECTION FOR CONDITIONS (Screen Coordinates)
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

    // ⚡ PERFORMANCE: Only update state if hover changed
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
    if (isFogDragging && (fogMode || (visibilityMode && currentVisibilityTool === 'fog'))) {
      const addMode = isFogAddMode;
      addFogCellIfNew(currentX, currentY, addMode);
      return;
    }

    // 🔗 DÉTECTION SNAP POINT (commun à Draw et Edit)
    let activeSnapPoint: Point | null = null;
    if (visibilityMode && (currentVisibilityTool === 'chain' || currentVisibilityTool === 'polygon' || (currentVisibilityTool === 'edit' && isDraggingObstaclePoint))) {
      const snapDistance = 25 / zoom;
      let minDist = snapDistance;

      for (const obstacle of obstacles) {
        if (obstacle.type === 'wall' && obstacle.points.length >= 2) {
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
        } else if (obstacle.type === 'polygon' && obstacle.points.length >= 3) {
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

    // ✏️ MODE EDIT - Drag d'un point individuel
    if (visibilityMode && currentVisibilityTool === 'edit' && isDraggingObstaclePoint && dragStartPosRef.current) {
      // Utiliser le snap point ou la position souris
      const targetX = activeSnapPoint ? activeSnapPoint.x : currentX;
      const targetY = activeSnapPoint ? activeSnapPoint.y : currentY;

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

    // ✏️ DRAG OBSTACLES
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


    if (visibilityMode && (currentVisibilityTool === 'chain' || currentVisibilityTool === 'polygon')) {
      if (isDrawingObstacle && currentObstaclePoints.length > 0) {
        // Utiliser le snap point pour la prévisualisation si disponible
        const cursorPoint = activeSnapPoint || { x: currentX, y: currentY };

        if (currentVisibilityTool === 'chain') {
          setCurrentObstaclePoints([currentObstaclePoints[0], cursorPoint]);
        } else if (currentVisibilityTool === 'polygon') {
          const existingPoints = currentObstaclePoints.slice(0, -1);
          if (existingPoints.length === currentObstaclePoints.length - 1) {
            setCurrentObstaclePoints([...existingPoints, cursorPoint]);
          } else {
            setCurrentObstaclePoints([...currentObstaclePoints.slice(0, currentObstaclePoints.length - 1), cursorPoint]);
          }
        }
      }
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

      // 🆕 UPDATE SHARED MEASUREMENT (THROTTLED OPTIONALLY, but for now direct)
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

    // 🎵 HANDLE MUSIC ZONE DRAG (MULTI)
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

    // 🎵 HANDLE MUSIC ZONE RESIZING (Standard & Character)
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

    // 💡 DRAG LUMIÈRE (LIGHT)
    if (isDraggingLight && draggedLightId) {
      if (!dragStart) return;

      const deltaX = currentX - dragStart.x;
      const deltaY = currentY - dragStart.y;

      // Update local state for smooth drag
      setLights(prev => prev.map(l => {
        if (l.id === draggedLightId) {
          // Use original position + delta (stable drag) 
          // OR if we update DragStart on each move:
          // But here we setDragStart in handleMouseMove for continuous updates? 
          // Actually, let's use the delta logic if we kept original pos.
          // But we stored draggedLightOriginalPos on mouseDown.

          // Re-calculate based on ORIGINAL pos to avoid drift? 
          // The current existing logic for objects/chars relies on updating dragStart or just direct delta?
          // Let's look at characters:
          // "const deltaX = currentX - dragStart.x... setCharacters(... x: char.x + deltaX ...)"
          // And then "setDragStart({ x: currentX, y: currentY })" -> Incremental updates.
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
            return {
              ...char,
              // 🔒 Prevent moving outside map boundaries
              x: Math.max(0, Math.min(imgWidth, originalPos.x + deltaX)),
              y: Math.max(0, Math.min(imgHeight, originalPos.y + deltaY))
            };
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
  };


  const handleCanvasMouseUp = async () => {
    const rect = bgCanvasRef.current?.getBoundingClientRect();
    //  CALIBRATION END (OPEN DIALOG)
    if (isCalibrating && measureMode && measureStart && measureEnd) {
      // If dragged distance is significant, open dialog
      const dist = calculateDistance(measureStart.x, measureStart.y, measureEnd.x, measureEnd.y);
      if (dist > 10) {
        setCalibrationDialogOpen(true);
      }
    }

    // 🆕 FINISH MEASUREMENT (skip if calibrating to preserve start/end for dialog)
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

    // ✏️ FIN DU DRAG POINT D'OBSTACLE
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
      setDraggedObstacleOriginalPoints([]);
      setConnectedPoints([]);
      setDragStartPos(null);
      return;
    }

    // 🎵 END DRAG MUSIC ZONE (MULTI)
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

      // 🎯 Réinitialiser la sélection active après le drag
      resetActiveElementSelection();
      return;
    }

    // 🎵 END RESIZE MUSIC ZONE


    // 💡 FIN DRAG LUMIÈRE
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

      // 🎯 Réinitialiser la sélection active après le drag
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

          // 🔄 For same-map portals: update the twin portal's targetX/targetY
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

      // 🎯 Réinitialiser la sélection active après le drag
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
    // ✏️ FIN DU DRAG OBSTACLE ENTIER


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
        // ✅ Update ALL selected obstacles in Firebase
        const updatePromises = draggedObstaclesOriginalPoints.map(async (originalObs) => {
          const currentObs = obstacles.find(o => o.id === originalObs.id);
          if (!currentObs) return;

          // Check if points actually changed
          const hasChanged = JSON.stringify(currentObs.points) !== JSON.stringify(originalObs.points);

          if (hasChanged) {
            await updateWithHistory(
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
      setDraggedObstacleOriginalPoints([]);
      setDraggedObstaclesOriginalPoints([]);
      // Clear Refs
      dragStartPosRef.current = null;
      draggedObstacleOriginalPointsRef.current = [];
      return;
    }


    //  FIN DU DRAG BROUILLARD
    if (isFogDragging) {
      setIsFogDragging(false);
      // 🔥 FLUSH UPDATES TO FIREBASE
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

    //  FIN DU DRAG & DROP OBJET (MULTI)
    if (isDraggingObject && draggedObjectIndex !== null && draggedObjectsOriginalPositions.length > 0) {
      if (roomId) {
        try {
          const updatePromises = draggedObjectsOriginalPositions.map(async (originalPos) => {
            const currentObj = objects[originalPos.index];
            const hasChanged = currentObj.x !== originalPos.x || currentObj.y !== originalPos.y;

            if (hasChanged && currentObj?.id) {
              await updateWithHistory(
                'objects',
                currentObj.id,
                {
                  x: currentObj.x,
                  y: currentObj.y
                },
                `Déplacement de l'objet${currentObj.name ? ` "${currentObj.name}"` : ''}`
              );
            }
          });

          await Promise.all(updatePromises);
        } catch (e) {
          console.error("Error saving object pos:", e);
          // Revert on error
          setObjects(prev => prev.map((obj, index) => {
            const originalPos = draggedObjectsOriginalPositions.find(pos => pos.index === index);
            if (originalPos) {
              return { ...obj, x: originalPos.x, y: originalPos.y };
            }
            return obj;
          }));
        }
      }
      setIsDraggingObject(false);
      setDraggedObjectIndex(null);
      setDraggedObjectsOriginalPositions([]);

      // 🎯 Réinitialiser la sélection active après le drag
      resetActiveElementSelection();
      return;
    }

    //  FIN DU DRAG & DROP PERSONNAGE(S) - Priorité élevée → RTDB
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

      // 🎯 Réinitialiser la sélection active après le drag
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

      // 🆕 9. Find Fog Cells in selection area (MJ only)
      const selectedFogCellKeys: string[] = [];
      if (isMJ && (fogGrid.size > 0 || fullMapFog)) { // 🔒 Réservé au MJ
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
            // Assuming last mouse position (currentX, currentY) isn't available here directly without ref checking,
            // we can use the mouse up event e clientX if available, but here we don't have 'e'.
            // We'll use the bounds of the selection rectangle center.
            // Map coords -> Screen coords:
            // screenX = (mapX / image.width) * scaledWidth + offset.x + rect.left
            // We need image and container ref here.
            // Let's just default to a specific position or try to get context.
            // Actually, we can use the drag end position? selectionEnd is in Map coords.
            // Warning: We need to convert back to screen for the menu (fixed position).
            // Since we lack 'e.clientX' here easily, let's just use a center screen approximation.
            // Better yet, we will just use a fixed state update and let the render handle it if we passed valid screen coords?
            // No, let's try to recalculate screen coords from map coords roughly.

            // Simplification: We will store the mouseUP event in a ref or just pass it to this function?
            // changing signature of handleCanvasMouseUp is risky.
            // Let's just put it in the center of the viewport for now, or use a cached mouse position.
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

          // 🆕 Set selected fog cells
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
    if (isFogDragging && (fogMode || (visibilityMode && currentVisibilityTool === 'fog'))) {
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
            // 🆕 AJOUT DU CITY ID
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
  };





  // 📡 Listener combat/state → centralisé dans useMapData (doublon supprimé ici)

  const toggleFogMode = () => {
    setFogMode(!fogMode);
    setSelectedCharacterIndex(null);
    setSelectedNoteIndex(null);
  };

  //  NOUVELLE FONCTION : Gérer le changement du mode brouillard complet
  const handleFullMapFogChange = async (newValue: boolean) => {
    setFullMapFog(newValue);

    // Sauvegarder dans Firebase pour synchronisation via le hook unifié
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
  };





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




  const handleDeleteCharacter = async () => {
    if (characterToDelete && roomId) {
      if (characterToDelete?.id) {
        try {
          await deleteWithHistory(
            'characters',
            characterToDelete.id,
            `Suppression de "${characterToDelete.name}"`
          );
          setCharacters(characters.filter((char) => char.id !== characterToDelete.id));
          setSelectedCharacterIndex(null);
          toast.success(`Personnage "${characterToDelete.name}" supprimé`);
        } catch (error) {
          console.error("Erreur lors de la suppression du personnage :", error);
          toast.error(`Erreur lors de la suppression du personnage "${characterToDelete.name}"`);
        }
      } else {
        console.error("ID du personnage introuvable pour la suppression.");
        toast.error("ID du personnage introuvable pour la suppression.");
      }
    } else {
      console.error("Aucun personnage sélectionné ou roomId invalide.");
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

  const handleEditCharacter = () => {
    if (selectedCharacterIndex !== null) {
      setEditingCharacter(characters[selectedCharacterIndex]);
      setCharacterDialogOpen(true);
    }
  };

  const handleEditNote = () => {
    if (selectedNoteIndex !== null) {
      setEditingNote(notes[selectedNoteIndex]);
      setShowCreateNoteModal(true);
      toast.success(`Note "${notes[selectedNoteIndex].text}" modifiée`);
    }
  };

  //  CENTRALIZED DELETE HANDLER
  const handleDeleteKeyPress = () => {
    if (!isMJ) return; // Only MJ can delete
    // 1. Check for selected characters (multi-select)
    if (selectedCharacters.length > 0) {
      const charsToDelete = selectedCharacters
        .map(index => characters[index])
        .filter(c => c && c.type !== 'joueurs');
      if (charsToDelete.length > 0) {
        setEntityToDelete({
          type: 'character',
          ids: charsToDelete.map(c => c.id),
          count: charsToDelete.length,
          name: charsToDelete.length === 1 ? charsToDelete[0].name : undefined
        });
        setDeleteModalOpen(true);
        return;
      }
    }

    // 2. Check for single selected character
    if (selectedCharacterIndex !== null) {
      const char = characters[selectedCharacterIndex];
      if (char && char.type !== 'joueurs') {
        setEntityToDelete({
          type: 'character',
          id: char.id,
          name: char.name
        });
        setDeleteModalOpen(true);
        return;
      }
    }

    // 3. Check for selected objects (multi-select)
    if (selectedObjectIndices.length > 0) {
      const objsToDelete = selectedObjectIndices.map(index => objects[index]);
      setEntityToDelete({
        type: 'object',
        ids: objsToDelete.map(o => o.id),
        count: objsToDelete.length,
        name: objsToDelete.length === 1 ? objsToDelete[0].name : undefined
      });
      setDeleteModalOpen(true);
      return;
    }

    // 4. Check for selected note
    if (selectedNoteIndex !== null) {
      const note = notes[selectedNoteIndex];
      setEntityToDelete({
        type: 'note',
        id: note.id,
        name: note.text?.substring(0, 30) + (note.text && note.text.length > 30 ? '...' : '')
      });
      setDeleteModalOpen(true);
      return;
    }

    // 5. Check for selected music zones (multi-select)
    if (selectedMusicZoneIds.length > 0) {
      const zonesToDelete = musicZones.filter(z => selectedMusicZoneIds.includes(z.id));
      setEntityToDelete({
        type: 'musicZone',
        ids: selectedMusicZoneIds,
        count: zonesToDelete.length,
        name: zonesToDelete.length === 1 ? zonesToDelete[0].name : undefined
      });
      setDeleteModalOpen(true);
      return;
    }

    // 6. Check for selected obstacle
    if (selectedObstacleIds.length > 0 && visibilityMode) {
      const obstacleId = selectedObstacleIds[0];
      const obstacle = obstacles.find(o => o.id === obstacleId);
      setEntityToDelete({
        type: 'obstacle',
        id: obstacleId,
        name: `Obstacle`
      });
      setDeleteModalOpen(true);
      return;
    }

    // 7. Check for selected drawing
    if (selectedDrawingIndex !== null) {
      const drawing = drawings[selectedDrawingIndex];
      setEntityToDelete({
        type: 'drawing',
        id: drawing.id,
        name: `Dessin`
      });
      setDeleteModalOpen(true);
      return;
    }

    // 8. Check for selected fog cells
    if (selectedFogCells.length > 0) {
      setEntityToDelete({
        type: 'fogCells',
        ids: selectedFogCells,
        count: selectedFogCells.length
      });
      setDeleteModalOpen(true);
      return;
    }

    // 9. Check for context menu light (if open)
    if (contextMenuLightOpen && contextMenuLightId) {
      const light = lights.find(l => l.id === contextMenuLightId);
      setEntityToDelete({
        type: 'light',
        id: contextMenuLightId,
        name: `Lumière`
      });
      setDeleteModalOpen(true);
      return;
    }
  };

  //  CONFIRM DELETE HANDLER
  const handleConfirmDelete = async () => {
    if (!entityToDelete || !roomId) return;

    try {
      switch (entityToDelete.type) {
        case 'character':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Multiple characters
            const deletePromises = entityToDelete.ids.map(async (id) => {
              const char = characters.find(c => c.id === id);
              await deleteWithHistory(
                'characters',
                id,
                `Suppression de "${char?.name || 'Personnage'}"`
              );
            });
            await Promise.all(deletePromises);
            setCharacters(prev => prev.filter(c => !entityToDelete.ids!.includes(c.id)));
            setSelectedCharacters([]);
            if (entityToDelete.count === 1) {
              toast.success(`Personnage "${entityToDelete.name || 'Inconnu'}" supprimé`);
            } else {
              toast.success(`${entityToDelete.ids?.length || 0} personnages supprimés`);
            }
          } else if (entityToDelete.id) {
            // Single character
            await deleteWithHistory(
              'characters',
              entityToDelete.id,
              `Suppression de "${entityToDelete.name}"`
            );
            setCharacters(prev => prev.filter(c => c.id !== entityToDelete.id));
            setSelectedCharacterIndex(null);
            toast.success(`Personnage "${entityToDelete.name}" supprimé`);
          }
          break;

        case 'object':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Multiple objects
            const deletePromises = entityToDelete.ids.map(async (id) => {
              await deleteDoc(doc(db, 'cartes', String(roomId), 'objects', id));
            });
            await Promise.all(deletePromises);
            setObjects(prev => prev.filter(o => !entityToDelete.ids!.includes(o.id)));
            setSelectedObjectIndices([]);
            if (entityToDelete.count === 1) {
              toast.success(`Objet "${entityToDelete.name || 'Inconnu'}" supprimé`);
            } else {
              toast.success(`${entityToDelete.ids?.length || 0} objets supprimés`);
            }
          }
          break;

        case 'light':
          if (entityToDelete.id) {
            await deleteWithHistory(
              'lights',
              entityToDelete.id,
              `Suppression de la source de lumière`
            );
            setLights(prev => prev.filter(l => l.id !== entityToDelete.id));
            setContextMenuLightOpen(false);
            setContextMenuLightId(null);
            toast.success(`Lumière supprimée`); // Light usually has no name, keep generic or use name if available
          }
          break;

        case 'obstacle':
          if (entityToDelete.id) {
            await deleteWithHistory(
              'obstacles',
              entityToDelete.id,
              `Suppression de l'obstacle`
            );
            setObstacles(prev => prev.filter(o => o.id !== entityToDelete.id));
            setSelectedObstacleIds([]);
            toast.success(`Obstacle supprimé`);
          }
          break;

        case 'musicZone':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Multiple zones
            const deletePromises = entityToDelete.ids.map(async (id) => {
              const zone = musicZones.find(z => z.id === id);
              await deleteWithHistory(
                'musicZones',
                id,
                `Suppression de la zone musicale${zone?.name ? ` "${zone.name}"` : ''}`
              );
            });
            await Promise.all(deletePromises);
            setMusicZones(prev => prev.filter(z => !entityToDelete.ids!.includes(z.id)));
            setSelectedMusicZoneIds([]);
            if (entityToDelete.count === 1) {
              toast.success(`Zone musicale "${entityToDelete.name || 'Inconnue'}" supprimée`);
            } else {
              toast.success(`${entityToDelete.ids?.length || 0} zones musicales supprimées`);
            }
          }
          break;

        case 'note':
          if (entityToDelete.id) {
            await deleteFromRtdbWithHistory(
              'notes',
              entityToDelete.id,
              `Suppression de la note "${entityToDelete.name}"`
            );
            setNotes(prev => prev.filter(n => n.id !== entityToDelete.id));
            setSelectedNoteIndex(null);
            toast.success(`Note "${entityToDelete.name}" supprimée`);
          }
          break;

        case 'measurement':
          if (entityToDelete.id) {
            await deleteWithHistory(
              'measurements',
              entityToDelete.id,
              `Suppression de la mesure`
            );
            setMeasurements(prev => prev.filter(m => m.id !== entityToDelete.id));
          }
          toast.success("Mesure supprimée");
          break;

        case 'drawing':
          if (entityToDelete.id) {
            await deleteFromRtdbWithHistory('drawings', entityToDelete.id, 'Suppression du dessin');
            setDrawings(prev => prev.filter(d => d.id !== entityToDelete.id));
            setSelectedDrawingIndex(null);
            toast.success(`Dessin supprimé`);
          }
          break;

        case 'fogCells':
          if (entityToDelete.ids && entityToDelete.ids.length > 0) {
            // Remove fog cells from grid
            const newFogGrid = new Map(fogGrid);
            entityToDelete.ids.forEach(cellKey => {
              newFogGrid.delete(cellKey);
            });
            setFogGrid(newFogGrid);
            setSelectedFogCells([]);

            // Save to Firebase
            saveFogGridWithHistory(newFogGrid, 'Révélation de toute la carte');
          }
          toast.success("Brouillard supprimé");
          break;
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    } finally {
      setEntityToDelete(null);
      setDeleteModalOpen(false);
    }
  };


  const handleCharacterEditSubmit = async () => {
    if (editingCharacter && selectedCharacterIndex !== null && roomId) {
      const charToUpdate = characters[selectedCharacterIndex];
      if (charToUpdate?.id) {
        try {
          const updatedData: any = {
            Nomperso: editingCharacter.name,
            niveau: editingCharacter.niveau,
            PV: editingCharacter.PV,
            Defense: editingCharacter.Defense,
            Contact: editingCharacter.Contact,
            Distance: editingCharacter.Distance,
            Magie: editingCharacter.Magie,
            INIT: editingCharacter.INIT,
            FOR: editingCharacter.FOR,
            DEX: editingCharacter.DEX,
            CON: editingCharacter.CON,
            SAG: editingCharacter.SAG,
            INT: editingCharacter.INT,
            CHA: editingCharacter.CHA,
            visibility: editingCharacter.visibility,
            visibilityRadius: editingCharacter.visibilityRadius,
          };

          const editingCharImageSrc = editingCharacter?.image ? (typeof editingCharacter.image === 'string' ? editingCharacter.image : editingCharacter.image.src) : null;
          const charToUpdateImageSrc = charToUpdate.image ? (typeof charToUpdate.image === 'string' ? charToUpdate.image : charToUpdate.image.src) : null;

          if (editingCharImageSrc !== charToUpdateImageSrc) {
            const storage = getStorage();
            const imageRef = ref(storage, `characters/${editingCharacter.name}-${Date.now()}`);
            const response = await fetch(editingCharImageSrc as string);
            const blob = await response.blob();
            await uploadBytes(imageRef, blob);
            const imageURL = await getDownloadURL(imageRef);
            updatedData.imageURL2 = imageURL;
          }

          await updateDoc(doc(db, 'cartes', String(roomId), 'characters', charToUpdate.id), updatedData);
          toast.success(`${charToUpdate.name} à été mis à jour`)

          setCharacters((prevCharacters) =>
            prevCharacters.map((character, index) =>
              index === selectedCharacterIndex ? { ...character, ...updatedData } : character
            )
          );

          setEditingCharacter(null);
          setCharacterDialogOpen(false);
          setSelectedCharacterIndex(null);
        } catch (error) {
          console.error("Erreur lors de la mise à jour du personnage :", error);
        }
      }
    }
  };

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

  const toggleDrawMode = () => {
    setDrawMode(!drawMode)
    setSelectedCharacterIndex(null)
    setSelectedNoteIndex(null)
  }

  const clearDrawings = async () => {
    if (!roomId) return;
    try {
      // Supprimer tous les dessins de la ville courante depuis RTDB
      const currentDrawings = drawings; // déjà filtrés par cityId
      if (currentDrawings.length === 0) return;
      const deletePromises = currentDrawings.map(d => deleteFromRtdbWithHistory('drawings', d.id, 'Suppression groupée'));
      await Promise.all(deletePromises);
      toast.success("les dessin ont bien été éffacés")
    } catch (error) {
      console.error('Error clearing drawings:', error);
    }
  };

  const clearFog = async () => {
    const emptyGrid = new Map<string, boolean>();
    setFogGrid(emptyGrid);
    if (roomId) {
      await saveFogGridWithHistory(emptyGrid, 'Suppression de la carte');
    }
  };


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
        setSelectedObjectIndices(prev => prev.filter(idx => idx !== objIndex)); // Note: Index might shift if real-time, but for now ok
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

      {/*  BULK CHARACTER CONTEXT MENU */}
      <BulkCharacterContextMenu
        isOpen={bulkContextMenuOpen}
        selectedCount={selectedCharacters.length}
        onClose={() => {
          setBulkContextMenuOpen(false);
        }}
        onVisibilityChange={async (visibility) => {
          await handleBulkVisibilityChange(visibility);
          setBulkContextMenuOpen(false);
        }}
        onConditionToggle={async (conditionId) => {
          await handleBulkConditionToggle(conditionId);
        }}
        onDelete={() => {
          handleBulkDelete();
          setBulkContextMenuOpen(false);
        }}
      />

      {/*  Object Context Menu */}
      <ObjectContextMenu
        object={contextMenuObjectId ? objects.find(o => o.id === contextMenuObjectId) || null : null}
        isOpen={contextMenuObjectOpen}
        onClose={() => setContextMenuObjectOpen(false)}
        onAction={handleObjectAction}
        isMJ={isMJ}
        isBackgroundEditMode={isBackgroundEditMode}
        players={characters.filter(c => c.type === 'joueurs')} // 🆕 Liste des joueurs pour la sélection custom
      />

      {/* 🎵 Music Zone Context Menu */}
      <MusicZoneContextMenu
        zone={contextMenuMusicZoneId ? musicZones.find(z => z.id === contextMenuMusicZoneId) || null : null}
        isOpen={contextMenuMusicZoneOpen}
        onClose={() => setContextMenuMusicZoneOpen(false)}
        onAction={handleMusicZoneAction}
        isMJ={isMJ}
      />

      <MeasurementContextMenu
        measurement={contextMenuMeasurementId ? measurements.find(m => m.id === contextMenuMeasurementId) || null : null}
        isOpen={contextMenuMeasurementOpen}
        onClose={() => setContextMenuMeasurementOpen(false)}
        onAction={handleMeasurementAction}
      />

      {measureMode && isMeasurementPanelOpen && (
        <MeasurementPanel
          selectedShape={measurementShape}
          onShapeChange={setMeasurementShape}

          isCalibrating={isCalibrating}
          onStartCalibration={() => {
            setIsCalibrating(true);
            setMeasurementShape('line'); // Force line shape for calibration
            setMeasureStart(null);
            setMeasureEnd(null);
          }}
          onCancelCalibration={() => setIsCalibrating(false)}

          onClearMeasurements={handleClearMeasurements}

          isPermanent={isPermanent}
          onPermanentChange={setIsPermanent}

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
          onSkinChange={setSelectedSkin}

          onClose={() => setMeasureMode(false)}
        />
      )}

      {/* 💡 LIGHT SOURCE CONTEXT MENU */}
      <LightContextMenu
        light={contextMenuLightId ? lights.find(l => l.id === contextMenuLightId) || null : null}
        isOpen={contextMenuLightOpen}
        onClose={() => setContextMenuLightOpen(false)}
        onAction={handleLightAction}
        isMJ={isMJ}
      />

      {/*  Portal Context Menu */}
      <PortalContextMenu
        portal={contextMenuPortalId ? portals.find(p => p.id === contextMenuPortalId) || null : null}
        isOpen={contextMenuPortalOpen}
        onClose={() => setContextMenuPortalOpen(false)}
        onAction={handlePortalAction}
        isMJ={isMJ}
      />



      <PortalConfigDialog
        open={showPortalConfig}
        onOpenChange={(open) => {
          setShowPortalConfig(open);
          if (!open) {
            setFirstPortalPoint(null);
            setFirstPortalId(null);
            setNewPortalPos(null);
            setEditingPortal(null);
          }
        }}
        portal={editingPortal || (newPortalPos ? { x: newPortalPos.x, y: newPortalPos.y, radius: 50, portalType: portalPlacementMode || 'scene-change', targetSceneId: '', name: '', iconType: 'portal', visible: true, color: '#3b82f6' } : null)}
        onSave={async (portalData) => {
          if (!roomId) return;

          if (editingPortal && editingPortal.id && editingPortal.portalType === 'same-map') {
            // Same-map portal: Update first portal + create second
            await updateDoc(doc(db, 'cartes', roomId, 'portals', editingPortal.id), {
              ...portalData,
              x: editingPortal.x,
              y: editingPortal.y,
              targetX: portalData.targetX,
              targetY: portalData.targetY,
              cityId: selectedCityId,
              name: portalData.name || 'Portail'
            });

            // Create Portal 2 (reverse direction)
            // IMPORTANT: Don't copy the ID from the first portal
            const { id, ...portalDataWithoutId } = portalData;
            await addDoc(collection(db, 'cartes', roomId, 'portals'), {
              ...portalDataWithoutId,
              x: portalData.targetX,
              y: portalData.targetY,
              targetX: editingPortal.x,
              targetY: editingPortal.y,
              cityId: selectedCityId,
              name: portalData.name || 'Portail'
            });

            toast.success("Portails bidirectionnels créés");
          } else if (editingPortal && editingPortal.id) {
            // Update existing scene-change portal
            await updateDoc(doc(db, 'cartes', roomId, 'portals', editingPortal.id), {
              ...portalData,
              cityId: selectedCityId
            });
            toast.success("Portail modifié");
          } else if (newPortalPos) {
            // Create new portal
            if (portalData.portalType === 'same-map' && portalData.targetX !== undefined && portalData.targetY !== undefined) {
              // Same-map portal: create TWO portals for bidirectional teleportation

              // Portal 1: Entrance -> Exit
              await addDoc(collection(db, 'cartes', roomId, 'portals'), {
                ...portalData,
                x: newPortalPos.x,
                y: newPortalPos.y,
                targetX: portalData.targetX,
                targetY: portalData.targetY,
                cityId: selectedCityId,
                name: portalData.name || 'Portail'
              });

              // Portal 2: Exit -> Entrance (reverse)
              await addDoc(collection(db, 'cartes', roomId, 'portals'), {
                ...portalData,
                x: portalData.targetX,
                y: portalData.targetY,
                targetX: newPortalPos.x,
                targetY: newPortalPos.y,
                cityId: selectedCityId,
                name: portalData.name || 'Portail'
              });

              toast.success("Portails bidirectionnels créés");
            } else {
              // Scene-change portal: single portal
              await addDoc(collection(db, 'cartes', roomId, 'portals'), {
                ...portalData,
                x: newPortalPos.x,
                y: newPortalPos.y,
                cityId: selectedCityId
              });
              toast.success("Portail créé");
            }
          }

          setShowPortalConfig(false);
          setNewPortalPos(null);
          setEditingPortal(null);
          setFirstPortalPoint(null);
          setFirstPortalId(null);
        }}
        roomId={roomId || ''}
        currentCityId={selectedCityId}
      />
      <MapToolbar
        isMJ={isMJ}
        activeTools={getActiveToolbarTools()}
        onAction={handleToolbarAction}
        currentViewMode={playerViewMode ? 'player' : 'mj'}
        showGrid={showGrid}
        activeToolContent={getToolOptionsContent()}
      />

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
          if (visibilityMode && currentVisibilityTool === 'fog') {
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

            // 🆕 If no specific element is hovered, open the General Map Context Menu
            e.preventDefault();
            setMapContextMenu({ x: e.clientX, y: e.clientY });
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
            onDoubleClick={handleCanvasDoubleClick}
          />
          <div className="objects-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
            {isLayerVisible('objects') && objects.map((obj, index) => {
              // 🆕 Vérifier la visibilité de l'objet pour l'utilisateur actuel
              if (!isObjectVisibleToUser(obj)) return null;

              if (!bgImageObject) return null;

              const image = bgImageObject;
              const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
              const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
              const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
              if (cWidth === 0 || cHeight === 0) return null;

              const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
              const scaledWidth = imgWidth * scale * zoom;
              const scaledHeight = imgHeight * scale * zoom;

              const x = (obj.x / imgWidth) * scaledWidth - offset.x;
              const y = (obj.y / imgHeight) * scaledHeight - offset.y;
              const w = (obj.width / imgWidth) * scaledWidth;
              const h = (obj.height / imgHeight) * scaledHeight;

              // Skip if any calculated values are invalid
              if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) {
                return null;
              }

              const isSelected = selectedObjectIndices.includes(index);

              // Visibility Check (Shadows & Fog) logic
              //  CALCUL DES OMBRES POUR MASQUER LES PNJs ET OBJETS (Côté Client seulement)
              let objectIsVisible = true;

              const activeShadows = precalculatedShadows?.shadows;
              const containingPolygons = precalculatedShadows?.polygonsContainingViewer;

              const objCenter = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };

              // 1. Check Fog of War Grid (if active)
              // Only apply if not GM (or simulating player) OR if full map fog is on
              const effectiveIsMJLocal = isMJ && !playerViewMode;

              if (fogMode || fullMapFog || fogGrid.size > 0) {
                const cellX = Math.floor(objCenter.x / fogCellSize);
                const cellY = Math.floor(objCenter.y / fogCellSize);
                const opacity = calculateFogOpacity(cellX, cellY);

                // If fog is opaque (>= 1), hide object completely.
                // This handles both fullMapFog and manual fog cells, plus character vision revealing it.
                if (opacity >= 0.99) {
                  objectIsVisible = false;
                }
              }

              // 2. Check Dynamic Shadows (Walls)
              // Only filter if not GM (or simulating player) and obstacles are active
              if (objectIsVisible && (!effectiveIsMJLocal) && obstacles.length > 0 && isLayerVisible('obstacles') && activeShadows) {
                // Check shadow polygons
                for (const shadow of activeShadows) {
                  if (isPointInPolygon(objCenter, shadow)) {
                    objectIsVisible = false;
                    break;
                  }
                }

                // Check if viewer is inside a polygon but object is outside (hide exterior)
                if (objectIsVisible && containingPolygons && containingPolygons.length > 0) {
                  for (const polygon of containingPolygons) {
                    if (!isPointInPolygon(objCenter, polygon.points)) {
                      objectIsVisible = false;
                      break;
                    }
                  }
                }
              }

              if (!objectIsVisible) return null;


              return (
                <div
                  key={obj.id}
                  style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    transform: `rotate(${obj.rotation}deg)`,
                    pointerEvents: obj.isBackground && !isBackgroundEditMode ? 'none' : (
                      // 🎯 Désactiver les interactions si un autre élément est actif
                      activeElementType !== null && (activeElementType !== 'object' || activeElementId !== obj.id) ? 'none' : 'auto'
                    ),
                    cursor: isResizingObject ? 'nwse-resize' : (obj.isLocked && !isMJ ? 'default' : 'move'),
                    zIndex: obj.isBackground ? 1 : 2,
                    opacity: activeElementType !== null && (activeElementType !== 'object' || activeElementId !== obj.id) ? 0.3 : 1, // Semi-transparent si désactivé
                    transition: 'opacity 0.2s ease',
                  }}
                  onMouseDown={(e) => {
                    // ✋ Si en mode Pan, laisser l'événement remonter au canvas
                    if (panMode) return;

                    // Prevent canvas from picking up this click
                    e.stopPropagation();

                    // 🎯 Vérifier si un autre élément est déjà actif
                    if (activeElementType !== null && (activeElementType !== 'object' || activeElementId !== obj.id)) {
                      return; // Ne devrait pas arriver avec pointerEvents: none, mais sécurité
                    }

                    if (e.button === 0) {
                      // Tracking for click vs drag - ALWAYS set this even if locked
                      mouseClickStartRef.current = { x: e.clientX, y: e.clientY };

                      // 🆕 Empêcher le drag si objet verrouillé et utilisateur non-MJ
                      if (obj.isLocked && !isMJ) {
                        return;
                      }

                      // 🎯 Si cet objet est déjà actif, bypasser la détection
                      const isThisObjectActive = activeElementType === 'object' && activeElementId === obj.id;

                      if (!isThisObjectActive) {
                        // Calculer coordonnées monde pour la détection
                        // On utilise les coords existantes du clic si possible, ou on recalcule
                        const rect = bgCanvasRef.current?.getBoundingClientRect();
                        if (rect) {
                          // approximatif car on n'a pas accès facile à scale ici sans recalculer
                          // Mais on peut utiliser e.clientX directement dans detectElementsAtPosition car il recalcule scale
                          const cWidth = containerRef.current?.clientWidth || 0;
                          const cHeight = containerRef.current?.clientHeight || 0;
                          if (cWidth > 0 && cHeight > 0 && bgImageObject) {
                            const { width: imgW, height: imgH } = getMediaDimensions(bgImageObject);
                            const scale = Math.min(cWidth / imgW, cHeight / imgH);
                            const sWidth = imgW * scale * zoom;
                            const sHeight = imgH * scale * zoom;
                            const clickMapX = ((e.clientX - rect.left + offset.x) / sWidth) * imgW;
                            const clickMapY = ((e.clientY - rect.top + offset.y) / sHeight) * imgH;

                            const elementsAtPosition = detectElementsAtPosition(clickMapX, clickMapY);

                            if (elementsAtPosition.length > 1) {
                              setDetectedElements(elementsAtPosition);
                              setSelectionMenuPosition({ x: e.clientX, y: e.clientY });
                              setShowElementSelectionMenu(true);
                              return;
                            }
                          }
                        }
                      }

                      // Select
                      // Calculate which objects will be dragged BEFORE updating state
                      // This is critical because React state updates are async
                      let objectsToDrag: number[];
                      if (!e.shiftKey) {
                        // Single selection - will drag only this object
                        objectsToDrag = [index];
                        setSelectedObjectIndices([index]);
                      } else {
                        // Multi-select with Shift
                        if (selectedObjectIndices.includes(index)) {
                          // Already selected, drag all selected
                          objectsToDrag = selectedObjectIndices;
                        } else {
                          // Add to selection and drag all
                          objectsToDrag = [...selectedObjectIndices, index];
                          setSelectedObjectIndices(objectsToDrag);
                        }
                      }

                      // If clicking on an already selected object (without Shift), drag all selected
                      if (!e.shiftKey && selectedObjectIndices.includes(index) && selectedObjectIndices.length > 1) {
                        objectsToDrag = selectedObjectIndices;
                      }

                      // Initiate Drag - Convert client coords to map coords for consistency
                      const rect = bgCanvasRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const containerWidth = containerRef.current?.clientWidth || rect.width;
                      const containerHeight = containerRef.current?.clientHeight || rect.height;
                      const image = bgImageObject;
                      const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
                      const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
                      const scaledWidth = imgWidth * scale * zoom;
                      const scaledHeight = imgHeight * scale * zoom;
                      const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                      const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                      setDragStart({ x: startMapX, y: startMapY });
                      setIsDraggingObject(true);
                      setDraggedObjectIndex(index);
                      setDraggedObjectOriginalPos({ x: obj.x, y: obj.y });

                      // Store original positions for all objects to drag
                      const originalPositions = objectsToDrag.map(idx => ({
                        index: idx,
                        x: objects[idx].x,
                        y: objects[idx].y
                      }));
                      setDraggedObjectsOriginalPositions(originalPositions);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const start = mouseClickStartRef.current;
                    if (start) {
                      const dist = Math.sqrt(Math.pow(e.clientX - start.x, 2) + Math.pow(e.clientY - start.y, 2));
                      if (dist < 5) {
                        // It was a click, not a drag
                        setContextMenuObjectId(obj.id);
                        setContextMenuObjectOpen(true);
                        // Ensure selection if not already (handled in mousedown but good to be safe)
                        if (!selectedObjectIndices.includes(index) && isMJ) {
                          setSelectedObjectIndices([index]);
                        }
                      }
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenuObjectId(obj.id);
                    setContextMenuObjectOpen(true);
                    // Also select it if not selected (MJ only)
                    if (!selectedObjectIndices.includes(index) && isMJ) {
                      setSelectedObjectIndices([index]);
                    }
                  }}
                >
                  <StaticToken
                    src={obj.imageUrl}
                    alt="Object"
                    performanceMode={performanceMode}
                    style={{
                      width: '100%',
                      height: '100%',
                      border: isSelected ? '2px solid #00BFFF' : (obj.isBackground && isBackgroundEditMode ? '2px dashed rgba(255, 255, 255, 0.5)' : 'none'),
                      opacity: obj.isBackground && isBackgroundEditMode ? 0.8 : 1,
                      objectFit: 'fill',
                      display: 'block'
                    }}
                  />

                  {/* Resize Handle (Bottom Right) */}
                  {isSelected && isMJ && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -6,
                        right: -6,
                        width: 12,
                        height: 12,
                        backgroundColor: '#00BFFF',
                        borderRadius: '50%',
                        cursor: 'nwse-resize',
                        zIndex: 6 // Resize handles above objects
                      }}
                      onMouseDown={(e) => handleResizeStart(e, index)}
                    />
                  )}
                </div>
              )
            })}

          </div>

          {/* 💡 LAYER LUMIÈRES (LIGHTS) */}
          <div className="lights-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: 45 }}>
            {/* Only visible for MJ to edit. Players see the light effect, not the icon. */}
            {isMJ && lights.map((light) => {
              if (!bgImageObject) return null;
              const image = bgImageObject;
              const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
              const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
              const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
              if (cWidth === 0 || cHeight === 0) return null;

              const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
              const scaledWidth = imgWidth * scale * zoom;
              const scaledHeight = imgHeight * scale * zoom;

              const lightScreenX = (light.x / imgWidth) * scaledWidth;
              const lightScreenY = (light.y / imgHeight) * scaledHeight;
              const size = 40 * zoom;

              // 🎯 Désactiver les interactions si un autre élément est actif
              const isThisElementActive = activeElementType === 'light' && activeElementId === light.id;
              const shouldDisableInteraction = activeElementType !== null && !isThisElementActive;

              return (
                <div
                  key={light.id}
                  style={{
                    position: 'absolute',
                    left: lightScreenX - offset.x,
                    top: lightScreenY - offset.y,
                    width: size + 'px',
                    height: size + 'px',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: shouldDisableInteraction ? 'none' : 'auto', // Désactiver si un autre élément est actif
                    cursor: isMJ ? 'move' : 'default',
                    opacity: shouldDisableInteraction ? 0.3 : 1, // Semi-transparent si désactivé
                    transition: 'opacity 0.2s ease',
                    zIndex: 50
                  }}
                  onMouseDown={(e) => {
                    if (!isMJ) return;
                    if (panMode) return; // ✋ Mode Pan prioritaire

                    // 🎯 Vérifier si un autre élément est actuellement actif
                    if (activeElementType !== null && (activeElementType !== 'light' || activeElementId !== light.id)) {
                      // Un autre élément est actif, bloquer cette interaction
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    // Calculer les coordonnées monde pour la détection
                    const rect = bgCanvasRef.current?.getBoundingClientRect();
                    if (!rect) return;

                    const clickMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                    const clickMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;

                    // 🎯 Si cet élément est déjà actif, bypasser la détection et commencer le drag directement
                    if (activeElementType === 'light' && activeElementId === light.id) {
                      setIsDraggingLight(true);
                      setDraggedLightId(light.id);
                      setDraggedLightOriginalPos({ x: light.x, y: light.y });
                      const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                      const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                      setDragStart({ x: startMapX, y: startMapY });
                      return;
                    }

                    // 🎯 Détection d'éléments superposés (seulement si pas encore actif)
                    const elementsAtPosition = detectElementsAtPosition(clickMapX, clickMapY);

                    if (elementsAtPosition.length > 1) {
                      // Plusieurs éléments détectés → afficher le menu
                      setDetectedElements(elementsAtPosition);
                      setSelectionMenuPosition({ x: e.clientX, y: e.clientY });
                      setShowElementSelectionMenu(true);
                      return;
                    }

                    // Un seul élément ou élément déjà actif → commencer le drag
                    setIsDraggingLight(true);
                    setDraggedLightId(light.id);
                    setDraggedLightOriginalPos({ x: light.x, y: light.y });

                    if (rect) {
                      const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                      const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                      setDragStart({ x: startMapX, y: startMapY });
                    }
                  }}
                  onDoubleClick={(e) => {
                    if (!isMJ) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenuLightId(light.id);
                    setContextMenuLightOpen(true);
                  }}
                  onContextMenu={(e) => {
                    if (!isMJ) return;
                    e.preventDefault();
                    setContextMenuLightId(light.id);
                    setContextMenuLightOpen(true);
                  }}
                >
                  <div className={`w-full h-full rounded-full flex items-center justify-center border-2 transition-transform hover:scale-110 ${light.visible ? 'bg-yellow-500/20 border-yellow-400 shadow-[0_0_20px_rgba(255,215,0,0.4)]' : 'bg-gray-500/20 border-gray-400'}`}>
                    <Lightbulb size={size * 0.6} className={light.visible ? "text-yellow-100 fill-yellow-500/50" : "text-gray-400"} />
                  </div>
                  {isMJ && (
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-yellow-500 whitespace-nowrap pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
                      {light.radius}m
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/*  PORTALS LAYER - Icons for MJ */}
          <div className="portals-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden', zIndex: 46 }}>
            {isMJ && portals.filter(p => !p.cityId || p.cityId === selectedCityId).map((portal, index) => {
              if (!bgImageObject) return null;
              const image = bgImageObject;
              const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
              const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
              const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
              if (cWidth === 0 || cHeight === 0) return null;

              const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
              const scaledWidth = imgWidth * scale * zoom;
              const scaledHeight = imgHeight * scale * zoom;

              const portalScreenX = (portal.x / imgWidth) * scaledWidth;
              const portalScreenY = (portal.y / imgHeight) * scaledHeight;
              const size = 40 * zoom;
              const isSelected = contextMenuPortalId === portal.id;

              // 🎯 Désactiver les interactions si un autre élément est actif
              const isThisElementActive = activeElementType === 'portal' && activeElementId === portal.id;
              const shouldDisableInteraction = activeElementType !== null && !isThisElementActive;

              return (
                <div
                  key={`${portal.id}-${index}`}
                  style={{
                    position: 'absolute',
                    left: portalScreenX - offset.x,
                    top: portalScreenY - offset.y,
                    width: size + 'px',
                    height: size + 'px',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: shouldDisableInteraction ? 'none' : 'auto', // Désactiver si un autre élément est actif
                    cursor: 'move',
                    opacity: shouldDisableInteraction ? 0.3 : 1, // Semi-transparent si désactivé
                    transition: 'opacity 0.2s ease',
                    zIndex: 50
                  }}
                  onMouseDown={(e) => {
                    if (panMode) return; // ✋ Mode Pan prioritaire

                    // 🎯 Vérifier si un autre élément est actuellement actif
                    if (activeElementType !== null && (activeElementType !== 'portal' || activeElementId !== portal.id)) {
                      // Un autre élément est actif, bloquer cette interaction
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }

                    e.preventDefault();
                    e.stopPropagation();

                    // Calculer les coordonnées monde pour la détection
                    const rect = bgCanvasRef.current?.getBoundingClientRect();
                    if (!rect) return;


                    const clickMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                    const clickMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;

                    // 🎯 Si cet élément est déjà actif, bypasser la détection et commencer le drag directement
                    if (activeElementType === 'portal' && activeElementId === portal.id) {
                      setIsDraggingPortal(true);
                      setDraggedPortalId(portal.id);
                      setDraggedPortalOriginalPos({ x: portal.x, y: portal.y }); // Store original position for twin portal update
                      const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                      const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                      setDragStart({ x: startMapX, y: startMapY });
                      return;
                    }

                    // 🎯 Détection d'éléments superposés (seulement si pas encore actif)
                    const elementsAtPosition = detectElementsAtPosition(clickMapX, clickMapY);


                    if (elementsAtPosition.length > 1) {
                      // Plusieurs éléments détectés → afficher le menu
                      setDetectedElements(elementsAtPosition);
                      setSelectionMenuPosition({ x: e.clientX, y: e.clientY });
                      setShowElementSelectionMenu(true);
                      return;
                    }

                    // Un seul élément ou élément déjà actif → commencer le drag
                    setIsDraggingPortal(true);
                    setDraggedPortalId(portal.id);
                    setDraggedPortalOriginalPos({ x: portal.x, y: portal.y }); // Store original position for twin portal update

                    if (rect) {
                      const startMapX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth;
                      const startMapY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight;
                      setDragStart({ x: startMapX, y: startMapY });
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditingPortal(portal);
                    setShowPortalConfig(true);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenuPortalId(portal.id);
                    setContextMenuPortalOpen(true);
                  }}
                >
                  <div style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: portal.color || '#3b82f6',
                    border: isSelected ? '4px solid #fbbf24' : '3px solid white',
                    boxShadow: isSelected
                      ? '0 0 20px rgba(251, 191, 36, 0.8), 0 0 10px rgba(0,0,0,0.3)'
                      : '0 0 10px rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    transform: isSelected ? 'scale(1.1)' : 'scale(1)'
                  }}>
                    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="8" stroke="white" strokeWidth="2" fill="none" />
                      <path d="M12 4 L12 20 M4 12 L20 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                  {portal.name && (
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-white whitespace-nowrap pointer-events-none">
                      {portal.name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <canvas
            ref={characterBordersCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }}
          />
          <div className="characters-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
            {isLayerVisible('characters') && characters.map((char, index) => {
              if (!bgImageObject) return null;
              const image = bgImageObject;
              const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
              const cWidth = containerSize.width || containerRef.current?.clientWidth || 0;
              const cHeight = containerSize.height || containerRef.current?.clientHeight || 0;
              if (cWidth === 0 || cHeight === 0) return null;

              // Vérifier que le personnage a des coordonnées valides
              if (typeof char.x !== 'number' || typeof char.y !== 'number' || isNaN(char.x) || isNaN(char.y)) {
                console.warn('⚠️ [Character Render] Skipping character with invalid coordinates:', char.id, char.name, 'x:', char.x, 'y:', char.y);
                return null;
              }

              const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
              const scaledWidth = imgWidth * scale * zoom;
              const scaledHeight = imgHeight * scale * zoom;

              // 💡 LIGHT SOURCE RENDER LOOP REMOVED - NOW HANDLED IN SEPARATE LAYER


              const x = (char.x / imgWidth) * scaledWidth - offset.x;
              const y = (char.y / imgHeight) * scaledHeight - offset.y;

              // Vérifier que les positions calculées sont valides
              if (!isFinite(x) || !isFinite(y)) {
                console.warn('⚠️ [Character Render] Skipping character with invalid calculated position:', char.id, char.name, 'x:', x, 'y:', y);
                return null;
              }

              let isVisible = true;
              let effectiveVisibility = char.visibility;

              // Utiliser la fonction centralisée qui gère les lumières, le brouillard, etc.
              if (!isCharacterVisibleToUser(char)) {
                if (char.visibility === 'invisible') return null;
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
                    const radiusScreen = ((viewer?.visibilityRadius ?? 100) / imgWidth) * scaledWidth;
                    isVisible = dist <= radiusScreen;
                  } else {
                    isVisible = false;
                  }
                } else {
                  isVisible = isMJ || (() => {
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

              if (!isVisible) return null;

              const isPlayerCharacter = char.type === 'joueurs';
              const baseRadius = isPlayerCharacter ? 30 : 20;
              const charScale = char.scale || 1;
              const iconRadius = baseRadius * charScale * globalTokenScale * zoom;

              // Déterminer si on doit appliquer l'effet d'invisibilité
              const effectiveIsMJ = (playerViewMode && viewAsPersoId) ? false : isMJ;
              const shouldApplyInvisibilityEffect = (effectiveVisibility === 'hidden' || effectiveVisibility === 'custom') && effectiveIsMJ && char.type !== 'joueurs';

              // Déterminer le borderRadius en fonction de la forme choisie ou par défaut
              let borderRadius = isPlayerCharacter ? '0' : '50%';
              if (char.shape === 'square') borderRadius = '0';
              if (char.shape === 'circle') borderRadius = '50%';

              // 🎯 Désactiver visuellement si un autre élément est actif
              const isThisCharacterActive = activeElementType === 'character' && activeElementId === char.id;
              const shouldDisableCharacter = activeElementType !== null && !isThisCharacterActive;

              return (
                <div
                  key={char.id}
                  style={{
                    position: 'absolute',
                    left: x - iconRadius,
                    top: y - iconRadius,
                    width: iconRadius * 2,
                    height: iconRadius * 2,
                    pointerEvents: 'none',
                    borderRadius: borderRadius,
                    overflow: 'hidden',
                    opacity: shouldDisableCharacter ? 0.3 : 1, // Semi-transparent si désactivé
                    transition: 'opacity 0.2s ease',
                    zIndex: 5 // Characters above objects (z=2) and borders (z=3)
                  }}
                >
                  {char.imageUrl && (
                    <StaticToken
                      src={typeof char.imageUrl === 'object' ? char.imageUrl.src : char.imageUrl}
                      alt={char.name}
                      performanceMode={performanceMode}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block',
                        ...(shouldApplyInvisibilityEffect ? {
                          opacity: 0.72
                        } : {})
                      }}
                    />
                  )}
                  {shouldApplyInvisibilityEffect && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'radial-gradient(circle, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.6) 65%, rgba(255, 255, 255, 0.95) 100%)',
                        mixBlendMode: 'screen',
                        pointerEvents: 'none',
                        borderRadius: isPlayerCharacter ? '0' : '50%'
                      }}
                    />
                  )}
                  {/* Status Effect Veils */}
                  {char.conditions?.includes('poisoned') && char.type !== 'joueurs' && (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          background: 'radial-gradient(circle, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.6) 65%, rgba(255, 255, 255, 0.95) 100%)',
                          mixBlendMode: 'screen',
                          pointerEvents: 'none',
                          borderRadius: '50%'
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          background: 'radial-gradient(circle, transparent 0%, transparent 20%, rgba(0, 255, 100, 0.6) 55%, rgba(0, 255, 100, 0.95) 100%)',
                          mixBlendMode: 'overlay',
                          pointerEvents: 'none',
                          borderRadius: '50%'
                        }}
                      />
                    </>
                  )}
                  {char.conditions?.includes('stunned') && char.type !== 'joueurs' && (
                    <>
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          background: 'radial-gradient(circle, transparent 0%, transparent 30%, rgba(255, 255, 255, 0.6) 65%, rgba(255, 255, 255, 0.95) 100%)',
                          mixBlendMode: 'screen',
                          pointerEvents: 'none',
                          borderRadius: '50%'
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          background: 'radial-gradient(circle, transparent 0%, transparent 40%, rgba(255, 200, 0, 1) 90%)',
                          mixBlendMode: 'overlay',
                          pointerEvents: 'none',
                          borderRadius: '50%'
                        }}
                      />
                    </>
                  )}
                  {char.conditions?.includes('blinded') && char.type !== 'joueurs' && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'radial-gradient(circle, transparent 0%, transparent 20%, rgba(30, 30, 30, 0.7) 55%, rgba(10, 10, 10, 0.95) 100%)',
                        mixBlendMode: 'multiply',
                        pointerEvents: 'none',
                        borderRadius: isPlayerCharacter ? '0' : '50%'
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
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





      {/* Modal moderne pour ajouter/modifier une note */}
      <CreateNoteModal
        isOpen={showCreateNoteModal}
        onClose={() => {
          setShowCreateNoteModal(false);
          setEditingNote(null);
        }}
        onConfirm={handleCreateNoteConfirm}
        initialValues={editingNote ? {
          text: editingNote.text,
          color: editingNote.color,
          fontSize: editingNote.fontSize,
          fontFamily: editingNote.fontFamily
        } : null}
      />

      <Dialog open={characterDialogOpen} onOpenChange={(open) => {
        setCharacterDialogOpen(open);
        if (!open) {
          // Reset state when dialog closes
          setEditingCharacter(null);
          setSelectedCharacterIndex(null);
        }
      }}>
        <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Modifier le personnage</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-auto max-h-[85vh] pr-4">
            <div className="space-y-6 py-4">

              {/* --- SECTION 1: GÉNÉRAL --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Général</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="characterName" className="text-xs text-gray-300">Nom du personnage</Label>
                    <Input
                      id="characterName"
                      value={editingCharacter?.name || ''}
                      onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, name: e.target.value })}
                      className="bg-[#2a2a2a] border-gray-600 focus:border-[#c0a080]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="characterImage" className="text-xs text-gray-300">Image / Token</Label>
                    <Input
                      key={editingCharacter?.id || 'new'}
                      id="characterImage"
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files ? e.target.files[0] : null;
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (e) => {
                            const img = new Image();
                            img.onload = () => editingCharacter && setEditingCharacter({ ...editingCharacter, image: img });
                            if (typeof e.target?.result === 'string') img.src = e.target.result;
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="bg-[#2a2a2a] border-gray-600 text-xs cursor-pointer file:bg-gray-700 file:text-white file:border-0 file:rounded-md file:px-2 file:py-1 file:mr-2 hover:bg-[#333]"
                    />
                  </div>
                </div>
              </div>

              {/* --- SECTION 2: COMBAT & VITALITÉ --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Combat & Vitalité</h3>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="PV" className="text-[10px] uppercase text-gray-400">PV Actuels</Label>
                    <Input
                      id="PV"
                      type="number"
                      value={editingCharacter?.PV || 0}
                      onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, PV: parseInt(e.target.value) || 0 })}
                      className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="PV_Max" className="text-[10px] uppercase text-gray-400">PV Max</Label>
                    <Input
                      id="PV_Max"
                      type="number"
                      value={editingCharacter?.PV_Max || editingCharacter?.PV || 0}
                      onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, PV_Max: parseInt(e.target.value) || 0 })}
                      className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="Defense" className="text-[10px] uppercase text-gray-400">Défense</Label>
                    <Input
                      id="Defense"
                      type="number"
                      value={editingCharacter?.Defense || 0}
                      onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, Defense: parseInt(e.target.value) || 0 })}
                      className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="INIT" className="text-[10px] uppercase text-gray-400">Initiative</Label>
                    <Input
                      id="INIT"
                      type="number"
                      value={editingCharacter?.INIT || 0}
                      onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, INIT: parseInt(e.target.value) || 0 })}
                      className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="niveau" className="text-[10px] uppercase text-gray-400">Niveau</Label>
                    <Input
                      id="niveau"
                      type="number"
                      value={editingCharacter?.niveau || 1}
                      onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, niveau: parseInt(e.target.value) || 1 })}
                      className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* --- SECTION 3: BONUS D'ATTAQUE --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Bonus d'Attaque</h3>
                <div className="grid grid-cols-3 gap-3">
                  {['Contact', 'Distance', 'Magie'].map((stat) => (
                    <div key={stat} className="space-y-1">
                      <Label htmlFor={stat} className="text-[10px] uppercase text-gray-400">{stat}</Label>
                      <Input
                        id={stat}
                        type="number"
                        value={editingCharacter?.[stat as keyof Character] as number || 0}
                        onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, [stat]: parseInt(e.target.value) || 0 })}
                        className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* --- SECTION 4: CARACTÉRISTIQUES --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Caractéristiques</h3>
                <div className="grid grid-cols-6 gap-2">
                  {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((stat) => (
                    <div key={stat} className="space-y-1 text-center">
                      <Label htmlFor={stat} className="text-[10px] uppercase text-gray-400 block">{stat}</Label>
                      <Input
                        id={stat}
                        type="number"
                        value={editingCharacter?.[stat as keyof Character] as number || 0}
                        onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, [stat]: parseInt(e.target.value) || 0 })}
                        className="h-8 bg-[#2a2a2a] border-gray-600 text-center font-mono px-1"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* --- SECTION 5: VISIBILITÉ --- */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 pb-1">Visibilité</h3>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    {[
                      { id: 'visible', label: 'Visible' },
                      { id: 'ally', label: 'Allié' },
                      { id: 'hidden', label: 'Caché' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => editingCharacter && setEditingCharacter({ ...editingCharacter, visibility: mode.id as any })}
                        className={`flex - 1 h - 9 rounded - md border text - sm font - medium transition - colors focus - visible: outline - none focus - visible: ring - 1 focus - visible: ring - ring disabled: pointer - events - none disabled: opacity - 50 ${editingCharacter?.visibility === mode.id
                          ? 'bg-[#c0a080] border-[#c0a080] text-[#1e1e1e] font-bold shadow-sm'
                          : 'bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-[#3a3a3a] hover:text-white'
                          } `}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {(editingCharacter?.type === 'joueurs' || editingCharacter?.visibility === 'ally') && (
                    <div className="bg-[#2a2a2a] p-3 rounded-lg border border-gray-700 flex items-center gap-4">
                      <Label htmlFor="visibilityRadius" className="text-xs text-gray-300 whitespace-nowrap">Rayon de vision</Label>
                      <div className="flex-1 flex items-center gap-3">
                        <input
                          id="visibilityRadius"
                          type="range"
                          min="10"
                          max="500"
                          value={editingCharacter?.visibilityRadius || 100}
                          onChange={(e) => editingCharacter && setEditingCharacter({ ...editingCharacter, visibilityRadius: parseInt(e.target.value) || 100 })}
                          className="flex-1 h-1.5 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-[#c0a080]"
                        />
                        <div className="flex gap-2 items-center">
                          <span className="text-xs font-mono text-[#c0a080] bg-[#1c1c1c] px-2 py-1 rounded border border-gray-600 min-w-[3rem] text-center">
                            {Math.round(1 + ((editingCharacter?.visibilityRadius || 100) - 10) / 490 * 29)} c.
                          </span>
                          <span className="text-[10px] text-gray-500">•</span>
                          <span className="text-xs font-mono text-blue-400 bg-[#1c1c1c] px-2 py-1 rounded border border-gray-600 min-w-[3rem] text-center">
                            {((editingCharacter?.visibilityRadius || 100) / pixelsPerUnit).toFixed(1)} {unitName}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={handleCharacterEditSubmit}>Modifier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p>Êtes-vous sûr de vouloir supprimer le personnage {characterToDelete?.name} ? Cette action est irréversible.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setConfirmDeleteOpen(false)}>Annuler</Button>
            <Button onClick={() => { handleDeleteCharacter(); setConfirmDeleteOpen(false); }}>Supprimer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {
        showCharacterSheet && selectedCharacterForSheet && roomId && (
          <CharacterSheet
            characterId={selectedCharacterForSheet}
            roomId={roomId}
            onClose={() => {
              setShowCharacterSheet(false);
              setSelectedCharacterForSheet(null);
            }}
          />
        )
      }

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





      {/*  CALIBRATION DIALOG */}
      <Dialog open={calibrationDialogOpen} onOpenChange={setCalibrationDialogOpen}>
        <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] border-[#FFD700]">
          <DialogHeader>
            <DialogTitle>Étalonnage de la carte</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm">Quelle distance représente la ligne que vous venez de tracer ?</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="distVal">Distance</Label>
                <Input
                  id="distVal"
                  type="number"
                  value={tempCalibrationDistance}
                  onChange={(e) => setTempCalibrationDistance(e.target.value)}
                  placeholder="Ex: 1.5"
                  autoFocus
                />
              </div>
              <div className="w-24">
                <Label htmlFor="unitVal">Unité</Label>
                <Input
                  id="unitVal"
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="m"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCalibrationDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleCalibrationSubmit} className="bg-[#FFD700] text-black hover:bg-[#e6c200]">Valider</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ⚠️ Performance CSS Injection */}
      {performanceMode === 'static' && (
        <style dangerouslySetInnerHTML={{
          __html: `
            * {
              animation: none !important;
              transition: none !important;
            }
          `
        }} />
      )}

      {/*  GLOBAL SETTINGS DIALOG */}
      <GlobalSettingsDialog
        isOpen={showGlobalSettingsDialog}
        onOpenChange={setShowGlobalSettingsDialog}
        isMJ={isMJ}
      />

      <MapContextMenu
        position={mapContextMenu}
        onClose={() => setMapContextMenu(null)}
        isMJ={isMJ}
        showAllBadges={showAllBadges}
        onToggleBadges={() => setShowAllBadges(!showAllBadges)}
      />

      <ContextMenuPanel
        character={contextMenuCharacterId ? characters.find(c => c.id === contextMenuCharacterId) || null : null}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false);
          setContextMenuCharacterId(null);
          setSelectedCharacterIndex(null); // Désélectionner aussi sur la map si on ferme le menu
        }}
        isMJ={isMJ}
        players={characters.filter(c => c.type === 'joueurs')}
        onUploadFile={async (file) => {
          if (!roomId) throw new Error("No Room ID");
          const storage = getStorage();
          const storageRef = ref(storage, `audio/${roomId}/${file.name}-${Date.now()}`);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          return url;
        }}
        pixelsPerUnit={pixelsPerUnit}
        unitName={unitName}
        onAction={async (action, characterId, value) => {
          // Gestion des actions du menu contextuel
          const char = characters.find(c => c.id === characterId);
          if (!char) return;

          if (action === 'openSheet') {
            setSelectedCharacterForSheet(characterId);
            setShowCharacterSheet(true);
            setContextMenuOpen(false); // Fermer le panel du personnage
          } else if (action === 'attack') {
            if (isMJ) {
              if (activePlayerId) {
                setAttackerId(activePlayerId);
                setTargetId(characterId);
                setTargetIds([]); // 🆕 Reset AoE targets
                setCombatOpen(true);
              } else {
                alert("Aucun personnage actif sélectionné pour attaquer (Tour du joueur)");
              }
            } else {
              // Player attack
              if (persoId) {
                setAttackerId(persoId);
                setTargetId(characterId);
                setTargetIds([]); // 🆕 Reset AoE targets
                setCombatOpen(true);
              }
            }
          } else if (action === 'updateCharacterAudio') {
            // value is audioData
            await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
              audio: value
            });
          } else if (action === 'updateShape') {
            await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
              shape: value
            });
          } else if (action === 'deleteCharacterAudio') {
            await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
              audio: null
            });
            // Also stop if playing currently? handled by snapshot listener usually
          } else if (action === 'toggleAudioPlay') {
            // Toggle loop or volume or remove?
            // For now maybe we just toggle loop or volume to 0/1?
            // Let's assume it means "Stop" if playing, or "Start" if stopped.
            // But the audio model is state-based.
            // If volume > 0, mute it?
            const newVolume = (char.audio?.volume || 0) > 0 ? 0 : 0.5;
            await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
              'audio.volume': newVolume
            });
          } else if (action === 'delete') {
            if (isMJ) {
              setCharacterToDelete(char);
              setConfirmDeleteOpen(true);
            }
          } else if (action === 'edit') {
            if (isMJ) {
              const charIndex = characters.findIndex(c => c.id === characterId);
              if (charIndex !== -1) {
                setSelectedCharacterIndex(charIndex);
                setEditingCharacter(char);
                setCharacterDialogOpen(true);
                setContextMenuOpen(false);
              }
            }
          } else if (action === 'setVisibility') {
            if (isMJ && roomId) {
              const newVisibility = value;
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              // 🆕 Si on passe en mode custom, initialiser visibleToPlayerIds si non défini
              if (newVisibility === 'custom') {
                const currentPlayerIds = char.visibleToPlayerIds || [];
                updateDoc(charRef, {
                  visibility: newVisibility,
                  visibleToPlayerIds: currentPlayerIds
                });
              } else {
                updateDoc(charRef, { visibility: newVisibility });
              }
            }
          } else if (action === 'updateRadius') {
            if (isMJ && roomId) {
              const newRadius = value;
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { visibilityRadius: newRadius });
            }
          } else if (action === 'updateScale') {
            if (isMJ && roomId) {
              const newScale = value;
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { scale: newScale });
            }
          } else if (action === 'updateVisibilityRadius') {
            if (isMJ && roomId) {
              const newRadius = Number(value);
              console.log('[DEBUG] Updating visibilityRadius:', { characterId, oldValue: char.visibilityRadius, newValue: newRadius, type: typeof newRadius });
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { visibilityRadius: newRadius }).then(() => {
                console.log('[DEBUG] visibilityRadius updated in Firebase');
              }).catch((error) => {
                console.error('[DEBUG] Error updating visibilityRadius:', error);
              });
            }
          } else if (action === 'toggleCondition') {
            if (isMJ && roomId) {
              const condition = value;
              const currentConditions = char.conditions || [];
              let newConditions;
              if (currentConditions.includes(condition)) {
                newConditions = currentConditions.filter((c: string) => c !== condition);
              } else {
                newConditions = [...currentConditions, condition];
              }
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { conditions: newConditions });
            }
          } else if (action === 'updateVisiblePlayers') {
            // 🆕 Nouvelle action pour mettre à jour la liste des joueurs autorisés
            if (isMJ && roomId) {
              const newPlayerIds = value; // array de player IDs
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { visibleToPlayerIds: newPlayerIds });
            }
          } else if (action === 'updateNotes') {
            if (roomId) {
              updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
                notes: value
              });
            }
          } else if (action === 'configureInteraction') {
            setInteractionConfigTarget(char);
            setContextMenuOpen(false);
          } else if (action === 'interact') {
            const interaction = char.interactions?.find(i => i.id === value);
            if (interaction) {
              if (interaction.type === 'vendor') {
                setActiveInteraction({ interaction: interaction as VendorInteraction, host: char });
                setContextMenuOpen(false);
              } else if (interaction.type === 'game') {
                setActiveInteraction({ interaction: interaction as GameInteraction, host: char });
                setContextMenuOpen(false);
              } else if (interaction.type === 'loot') {
                setActiveInteraction({ interaction: interaction as LootInteraction, host: char });
                setContextMenuOpen(false);
              }
            }
          }
        }}
      />

      {/* GM Templates Provider - centralised data for all drawers */}
      <GMTemplatesProvider roomId={roomId}>
        {/* NPC Template Drawer */}
        <NPCTemplateDrawer
          roomId={roomId}
          isOpen={isNPCDrawerOpen}
          onClose={() => setIsNPCDrawerOpen(false)}
          onDragStart={handleTemplateDragStart}
          currentCityId={selectedCityId}
        />

        <ObjectDrawer
          roomId={roomId}
          isOpen={isObjectDrawerOpen}
          onClose={() => setIsObjectDrawerOpen(false)}
          onDragStart={handleObjectDragStart}
          currentCityId={selectedCityId}
        />

        {/* Sound Drawer */}
        <SoundDrawer
          roomId={roomId}
          isOpen={isSoundDrawerOpen}
          onClose={() => setIsSoundDrawerOpen(false)}
          onDragStart={handleSoundDragStart}
          currentCityId={selectedCityId}
        />

        {/* Unified Search Drawer */}
        <UnifiedSearchDrawer
          roomId={roomId}
          isOpen={isUnifiedSearchOpen}
          onClose={() => setIsUnifiedSearchOpen(false)}
          onDragStart={(item) => {
            // Handle drag start based on item type
            if (item.type === 'sound') {
              handleSoundDragStart(item.data)
            } else if (item.type === 'object') {
              handleObjectDragStart(item.data as ObjectTemplate)
            } else if (item.type === 'npc') {
              handleTemplateDragStart(item.data as NPC)
            }
          }}
          currentCityId={selectedCityId}
        />
      </GMTemplatesProvider>

      {/* Audio Mixer Panel */}
      <AudioMixerPanel
        isOpen={isAudioMixerOpen}
        onClose={() => setIsAudioMixerOpen(false)}
      />

      {/* Place NPC Modal */}
      <PlaceNPCModal
        isOpen={showPlaceModal}
        template={draggedTemplate}
        onClose={() => {
          setShowPlaceModal(false)
          setDraggedTemplate(null)
          setDropPosition(null)
        }}
        onConfirm={handlePlaceConfirm}
      />

      <PlaceObjectModal
        isOpen={showPlaceObjectModal}
        template={draggedObjectTemplateForPlace}
        players={characters.filter(c => c.type === 'joueurs')}
        onClose={() => {
          setShowPlaceObjectModal(false)
          setDraggedObjectTemplateForPlace(null)
          setDropObjectPosition(null)
        }}
        onConfirm={handlePlaceObjectConfirm}
      />

      {/* Centralized Delete Confirmation Modal */}
      <DeleteConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        entity={entityToDelete}
        onConfirm={handleConfirmDelete}
      />



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

      {/* Background Selector */}
      <BackgroundSelector
        isOpen={showBackgroundSelector}
        onClose={() => setShowBackgroundSelector(false)}
        onSelectLocal={handleBackgroundSelectLocal}
      />

      {/* 🎵 Music Control & Dialog */}
      {
        isMJ && (
          <>
            <div className="absolute top-24 left-4 z-40 flex flex-col gap-2">
              {/* Radial Menu replaces this button generally, but we keep it if needed or remove it? User asked to place from Radial Menu */
                /* Removing the button as requested to use Radial Menu "d'abord les placer depuis la menu radial" implies this is the primary way */
              }
            </div>

            <Dialog open={showMusicDialog} onOpenChange={(open) => {
              setShowMusicDialog(open);
              if (!open) setAudioCharacterId(null);
            }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{audioCharacterId ? "Configurer Audio du Personnage" : "Ajouter une zone musicale"}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="m-name" className="text-right">Nom</Label>
                    <Input id="m-name" value={tempZoneData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempZoneData({ ...tempZoneData, name: e.target.value })} className="col-span-3" />
                  </div>

                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="m-upload" className="text-right">Fichier MP3</Label>
                    <div className="col-span-3 flex gap-2">
                      <Input
                        id="m-upload"
                        type="file"
                        accept="audio/*"
                        onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const storage = getStorage();
                            const storageRef = ref(storage, `audio / ${roomId}/${Date.now()}_${file.name}`);
                            try {
                              const snapshot = await uploadBytes(storageRef, file);
                              const downloadURL = await getDownloadURL(snapshot.ref);
                              setTempZoneData(prev => ({ ...prev, url: downloadURL }));
                            } catch (error) {
                              console.error("Upload failed", error);
                              alert("Upload failed!");
                            }
                          }
                        }}
                      />
                    </div >
                  </div >

                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="m-radius" className="text-right">Rayon</Label>
                    <Input id="m-radius" type="number" value={tempZoneData.radius} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempZoneData({ ...tempZoneData, radius: Number(e.target.value) })} className="col-span-3" />
                  </div>
                </div >
                <DialogFooter>
                  <Button onClick={saveMusicZone}>{audioCharacterId ? "Enregistrer" : "Créer"}</Button>
                </DialogFooter>
              </DialogContent >
            </Dialog >






          </>
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

      {/* Interaction Components */}
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

    </div >

  )
}

function pDistance(x: number, y: number, x1: number, y1: number, x2: number, y2: number) {
  var A = x - x1;
  var B = y - y1;
  var C = x2 - x1;
  var D = y2 - y1;

  var dot = A * C + B * D;
  var len_sq = C * C + D * D;
  var param = -1;
  if (len_sq != 0) //in case of 0 length line
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

