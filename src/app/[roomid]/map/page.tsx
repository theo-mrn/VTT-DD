"use client"

import { renderToStaticMarkup } from 'react-dom/server';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion'
import poisonIcon from './icons/poison.svg';
import stunIcon from './icons/stun.svg';
import blindIcon from './icons/blind.svg';
import otherIcon from './icons/other.svg';

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
      // Handle Next.js import (might be object with .src or just string)
      img.src = src.src || src;
      img.onload = () => {
        setIconCache(prev => ({ ...prev, [key]: img }));
      };
    };

    // Load predefined
    Object.entries(CONDITION_ICONS).forEach(([key, config]) => {
      loadIcon(key, config.src);
    });
    // Load default/custom
    loadIcon('default', otherIcon);

  }, []);

  const getIcon = (conditionId: string): HTMLImageElement | null => {
    // Predefined
    if (CONDITION_ICONS[conditionId]) {
      return iconCache[conditionId] || null;
    }
    // Custom/Default (always use 'other' for everything else)
    return iconCache['default'] || null;
  };

  return getIcon;
};
import { useParams } from 'next/navigation'
import { useGame } from '@/contexts/GameContext'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

import { X, Plus, Minus, Edit, Pencil, Eraser, CircleUserRound, Baseline, User, Grid, Cloud, CloudOff, ImagePlus, Trash2, Eye, EyeOff, ScanEye, Move, Hand, Square, Circle as CircleIcon, Slash, Ruler, MapPin, Heart, Shield, Zap, Dices, Sparkles, BookOpen, Flashlight, Info, Image as ImageIcon, Layers, Package, Skull, Ghost, Anchor, Flame, Snowflake, Loader2, Check, Music, Volume2, VolumeX } from 'lucide-react'
import { auth, db, onAuthStateChanged } from '@/lib/firebase'
import { doc, collection, onSnapshot, updateDoc, addDoc, deleteDoc, setDoc, getDocs, query, where } from 'firebase/firestore'
import Combat from '@/components/(combat)/combat2';
import { CONDITIONS } from '@/components/(combat)/MJcombat';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import CharacterSheet from '@/components/(fiches)/CharacterSheet';
import { Component as RadialMenu } from '@/components/ui/radial-menu';
import CitiesManager from '@/components/(worldmap)/CitiesManager';
import ContextMenuPanel from '@/components/(overlays)/ContextMenuPanel';
import ObjectContextMenu from '@/components/(overlays)/ObjectContextMenu';
import MusicZoneContextMenu from '@/components/(overlays)/MusicZoneContextMenu';
import { NPCTemplateDrawer } from '@/components/(personnages)/NPCTemplateDrawer';
import { ObjectDrawer } from '@/components/(personnages)/ObjectDrawer';
import { SoundDrawer } from '@/components/(personnages)/SoundDrawer';
import { PlaceNPCModal } from '@/components/(personnages)/PlaceNPCModal';
import { CreateNoteModal } from '@/components/(map)/CreateNoteModal';
import { NoBackgroundModal } from '@/components/(map)/NoBackgroundModal';
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
import { SelectionMenu, type SelectionCandidates, type SelectionType } from '@/components/(map)/SelectionMenu';
import { type ViewMode, type Point, type Character, type MapText, type SavedDrawing, type NewCharacter, type Note, type MapObject, type ObjectTemplate, type Layer, type LayerType, type MusicZone, type Scene, type DrawingTool } from './types';
import { useAudioZones } from '@/hooks/map/useAudioZones';
import { getResizeHandles, isPointOnDrawing, renderDrawings, renderCurrentPath } from './drawings';
import { useFogManager, calculateDistance, getCellKey, isCellInFog, renderFogLayer } from './shadows';
import MapToolbar, { TOOLS } from '@/components/(map)/MapToolbar';
import BackgroundSelector from '@/components/(map)/BackgroundSelector';

// ⚡ Static Token Component for Performance Mode (Moved Outside Component to avoid Remounting/Flickering)
const StaticToken = React.memo(({ src, alt, style, className, performanceMode }: { src: string, alt: string, style?: React.CSSProperties, className?: string, performanceMode: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = src?.toLowerCase().endsWith('.webm') || src?.toLowerCase().endsWith('.mp4');

  useEffect(() => {
    // 🎨 Canvas Drawing for Static Images (GIFs) in Static Mode
    if (performanceMode === 'static' && !isVideo && canvasRef.current && src) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      img.onload = () => {
        if (canvasRef.current) {
          canvasRef.current.width = img.naturalWidth || 100;
          canvasRef.current.height = img.naturalHeight || 100;
          ctx.drawImage(img, 0, 0);
        }
      };
    }
  }, [src, performanceMode, isVideo]);

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
      // 🖼️ Static Canvas (Frozen GIF)
      return (
        <canvas
          ref={canvasRef}
          style={{ ...style, objectFit: 'cover' }}
          className={className}
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
import MeasurementShapeSelector from '@/components/(map)/MeasurementShapeSelector';
import ConeConfigDialog from '@/components/(map)/ConeConfigDialog';
import {
  type MeasurementShape,
  renderLineMeasurement,
  renderConeMeasurement,
  renderCircleMeasurement,
  renderCubeMeasurement,
  renderStartPoint
} from './measurements';

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
  const { volumes: audioVolumes } = useAudioMixer();
  const [combatOpen, setCombatOpen] = useState(false);
  const [attackerId, setAttackerId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [performanceMode, setPerformanceMode] = useState<'high' | 'eco' | 'static'>('high'); // ⚡ Performance Mode
  const [backgroundImage, setBackgroundImage] = useState('/placeholder.svg?height=600&width=800')
  const [bgImageObject, setBgImageObject] = useState<HTMLImageElement | HTMLVideoElement | null>(null);
  const [isBackgroundLoading, setIsBackgroundLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0); // 🆕 Progress state
  const videoRef = useRef<HTMLVideoElement | null>(null); // Ref to keep track of video element for cleanup

  useEffect(() => {
    if (backgroundImage) {
      loadBackground(backgroundImage);
    } else {
      setIsBackgroundLoading(false);
    }

    // Cleanup function
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

    // Cleanup previous video if exists
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current = null;
      // Revoke object URL if it was a blob (optional but good practice if we track it)
    }

    try {
      // 1. Fetch with progress
      const response = await fetch(url);
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
        video.loop = true;
        video.muted = audioVolumes.backgroundAudio === 0;
        video.volume = audioVolumes.backgroundAudio;
        video.playsInline = true;
        // video.crossOrigin = "anonymous"; // Not needed for Blob URL

        video.onloadedmetadata = () => {
          setBgImageObject(video);
          setIsBackgroundLoading(false);
          video.play().catch(e => console.error("Video play error:", e));
        };
        video.onerror = () => {
          setIsBackgroundLoading(false);
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
        }
      }

    } catch (error) {
      console.error("Erreur de chargement (fetch):", error);
      // Fallback: Default standard load
      loadBackgroundFallback(url);
    }
  };

  const loadBackgroundFallback = (url: string) => {
    const isVideo = url.toLowerCase().includes('.webm');
    if (isVideo) {
      const video = document.createElement('video');
      video.src = url;
      video.autoplay = true;
      video.loop = true;
      video.loop = true;
      video.muted = audioVolumes.backgroundAudio === 0;
      video.volume = audioVolumes.backgroundAudio;
      video.playsInline = true;
      video.crossOrigin = "anonymous";

      video.onloadedmetadata = () => {
        setBgImageObject(video);
        setIsBackgroundLoading(false);
        video.play().catch(e => console.error("Video play error:", e));
      };
      videoRef.current = video;
    } else {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        setBgImageObject(img);
        setIsBackgroundLoading(false);
      }
      img.crossOrigin = "anonymous";
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


  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1.4)
  const [globalTokenScale, setGlobalTokenScale] = useState(1);
  const [showGlobalSettingsDialog, setShowGlobalSettingsDialog] = useState(false);
  const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
  const [isBackgroundEditMode, setIsBackgroundEditMode] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [characters, setCharacters] = useState<Character[]>([]);
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

  // 🎯 NOUVEAUX ÉTATS pour le drag & drop des personnages
  const [isDraggingCharacter, setIsDraggingCharacter] = useState(false)
  const [draggedCharacterIndex, setDraggedCharacterIndex] = useState<number | null>(null)

  const [draggedCharactersOriginalPositions, setDraggedCharactersOriginalPositions] = useState<{ index: number, x: number, y: number }[]>([])

  // 🎯 NOUVEAUX ÉTATS pour le drag & drop des objets
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

  // 🎯 NOUVEAUX ÉTATS pour le drag & drop des notes
  const [isDraggingNote, setIsDraggingNote] = useState(false)
  const [draggedNoteIndex, setDraggedNoteIndex] = useState<number | null>(null)
  const [draggedNoteOriginalPos, setDraggedNoteOriginalPos] = useState({ x: 0, y: 0 })



  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number | null>(null);
  const [selectedObjectIndices, setSelectedObjectIndices] = useState<number[]>([]);

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

  // 🎯 Object Resizing State
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

  // 🎯 Context Menu State
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuCharacterId, setContextMenuCharacterId] = useState<string | null>(null);
  const [contextMenuObjectOpen, setContextMenuObjectOpen] = useState(false);
  const [contextMenuObjectId, setContextMenuObjectId] = useState<string | null>(null);

  const [isRadialMenuOpen, setIsRadialMenuOpen] = useState(false);
  const [isRadialMenuCentered, setIsRadialMenuCentered] = useState(false);

  // 🎯 Drawing Selection State
  const [selectedDrawingIndex, setSelectedDrawingIndex] = useState<number | null>(null);
  const [isDraggingDrawing, setIsDraggingDrawing] = useState(false);
  const [draggedDrawingOriginalPoints, setDraggedDrawingOriginalPoints] = useState<Point[]>([]);
  // 🎯 Drawing Resize State
  const [draggedHandleIndex, setDraggedHandleIndex] = useState<number | null>(null); // 0, 1, 2, 3...
  const [isResizingDrawing, setIsResizingDrawing] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false)

  // 🎯 NPC Template Drag & Drop States
  const [isNPCDrawerOpen, setIsNPCDrawerOpen] = useState(false)
  const [draggedTemplate, setDraggedTemplate] = useState<NPC | null>(null)
  const [dropPosition, setDropPosition] = useState<{ x: number; y: number } | null>(null)

  const [showPlaceModal, setShowPlaceModal] = useState(false)
  const [showCreateNoteModal, setShowCreateNoteModal] = useState(false)
  const [showNoBackgroundModal, setShowNoBackgroundModal] = useState(false)

  // 🎯 MULTI-SELECTION STATE
  const [selectionCandidates, setSelectionCandidates] = useState<SelectionCandidates | null>(null);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number, y: number }>({ x: 0, y: 0 });




  const [isDrawing, setIsDrawing] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [drawings, setDrawings] = useState<SavedDrawing[]>([]);

  // 🎯 Drawing Tools State
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingSize, setDrawingSize] = useState(5);

  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
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
  const fgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shadowTempCanvas = useRef<HTMLCanvasElement | null>(null);
  const shadowExteriorCanvas = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [visibilityRadius, setVisibilityRadius] = useState(100);
  // 🎯 NOUVEAU SYSTÈME DE BROUILLARD PAR QUADRILLAGE
  const [fogMode, setFogMode] = useState(false);
  const [fogGrid, setFogGrid] = useState<Map<string, boolean>>(new Map()); // clé: "x,y", valeur: true = brouillard
  const fogCellSize = 100; // Taille d'une cellule de brouillard en pixels
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);
  const [mouseButton, setMouseButton] = useState<number | null>(null); // Pour tracker quel bouton de souris est pressé
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref pour l'input de changement de fond
  const characterInputRef = useRef<HTMLInputElement>(null); // Ref pour l'input d'ajout de personnage
  const [panMode, setPanMode] = useState(false); // Mode déplacement de carte

  const [playerViewMode, setPlayerViewMode] = useState(false); // Mode "Vue Joueur" pour le MJ

  // 🎯 MEASUREMENT & CALIBRATION STATE
  const [measureMode, setMeasureMode] = useState(false);
  const [measurementShape, setMeasurementShape] = useState<MeasurementShape>('line');
  const [isCalibrating, setIsCalibrating] = useState(false); // Sub-mode of measureMode
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [measureEnd, setMeasureEnd] = useState<Point | null>(null);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(50); // Default: 50 pixels = 1 unit
  const [unitName, setUnitName] = useState('m'); // Default unit
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false);
  const [tempCalibrationDistance, setTempCalibrationDistance] = useState('');
  const [coneConfigDialogOpen, setConeConfigDialogOpen] = useState(false);
  const [coneWidth, setConeWidth] = useState<number | undefined>(undefined); // Custom cone width

  // 🆕 VIEW MODE & CITY NAVIGATION STATE

  const [viewMode, setViewMode] = useState<ViewMode>('world'); // 'world' = world map, 'city' = city map
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null); // null = world map
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
  const [currentVisibilityTool, setCurrentVisibilityTool] = useState<'fog' | 'chain' | 'polygon' | 'edit'>('chain');
  const [isDrawingObstacle, setIsDrawingObstacle] = useState(false);
  const [currentObstaclePoints, setCurrentObstaclePoints] = useState<Point[]>([]);
  const [selectedObstacleId, setSelectedObstacleId] = useState<string | null>(null);
  const [isDraggingObstacle, setIsDraggingObstacle] = useState(false);
  const [draggedObstacleId, setDraggedObstacleId] = useState<string | null>(null);
  const [draggedObstacleOriginalPoints, setDraggedObstacleOriginalPoints] = useState<Point[]>([]);
  const [isDraggingObstaclePoint, setIsDraggingObstaclePoint] = useState(false);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null);
  const [connectedPoints, setConnectedPoints] = useState<{ obstacleId: string, pointIndex: number }[]>([]);

  // 🎯 LAYERS STATE
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



  // 🔊 AUDIO MANAGER - Moved after isLayerVisible declaration

  const saveMusicZone = async () => {
    if (!newMusicZonePos || !tempZoneData.name || !tempZoneData.url || !roomId) return;

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
    await updateDoc(doc(db, 'cartes', roomId, 'musicZones', id), { x, y });
  };



  // 🔄 SYNC LAYERS AVEC FIREBASE
  useEffect(() => {
    if (!roomId) return;

    // Définition locale des layers (source de vérité pour les labels et l'ordre)
    const localLayersDef: Layer[] = [
      { id: 'background', label: 'Fond', isVisible: true, order: 0 },
      { id: 'notes', label: 'Notes', isVisible: true, order: 2 },
      { id: 'drawings', label: 'Dessins', isVisible: true, order: 3 },
      { id: 'objects', label: 'Objets', isVisible: true, order: 4 },
      { id: 'characters', label: 'Personnages', isVisible: true, order: 5 },
      { id: 'fog', label: 'Brouillard', isVisible: true, order: 6 },
      { id: 'obstacles', label: 'Obstacle', isVisible: true, order: 7 },
      { id: 'music', label: 'Musique (Zones)', isVisible: true, order: 8 },
    ];

    const getLayerDocId = () => selectedCityId ? `layers_${selectedCityId}` : 'layers';
    const layersRef = doc(db, 'cartes', roomId, 'settings', getLayerDocId());

    const unsubscribe = onSnapshot(layersRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.layers) {
          // Fusion intelligente : On garde les labels locaux mais on prend la visibilité de Firebase
          setLayers(prev => {
            const remoteLayers = data.layers as Layer[];

            return localLayersDef.map(localLayer => {
              const remoteLayer = remoteLayers.find(rl => rl.id === localLayer.id);
              // Si le layer existe distant, on prend sa visibilité, sinon défaut
              return {
                ...localLayer,
                isVisible: remoteLayer ? remoteLayer.isVisible : localLayer.isVisible
              };
            });
          });
        }
      } else {
        // Init default layers if doc doesn't exist used default visibility
        // But for per-city, maybe we want to inherit from global? 
        // For now let's just init defaults as requested: "independant de chaque ville"
        setDoc(layersRef, { layers: localLayersDef }, { merge: true });
        // Don't necessarily reset local state if we just switched, but here we do to sync with "default" state of that city
        setLayers(localLayersDef);
      }
    });

    return () => unsubscribe();
  }, [roomId, selectedCityId]);

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

  useEffect(() => {
    if (!roomId) return;
    const settingsRef = doc(db, 'cartes', roomId, 'settings', 'general');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.globalTokenScale !== undefined) {
          setGlobalTokenScale(data.globalTokenScale);
        }
      }
    });
    return () => unsubscribe();
  }, [roomId]);

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
  useAudioZones(musicZones, listenerPos, isLayerVisible('music'), audioVolumes.musicZones);

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




  const {
    saveFogGrid,
    saveFullMapFog,
    toggleFogCell,
    addFogCellIfNew,
    calculateFogOpacity,
    flushFogUpdates // [NEW]
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
    viewAsPersoId, // [NEW]
    characters,
    fogCellSize
  });

  // 🔦 KEYBOARD EVENT HANDLER pour les obstacles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Supprimer l'obstacle sélectionné avec Delete ou Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObstacleId && visibilityMode) {
        e.preventDefault();
        deleteObstacle(selectedObstacleId);
      }

      // Annuler le dessin d'obstacle en cours avec Escape
      if (e.key === 'Escape' && isDrawingObstacle) {
        e.preventDefault();
        setIsDrawingObstacle(false);
        setCurrentObstaclePoints([]);
      }

      // Quitter le mode obstacle avec Escape si pas de dessin en cours
      if (e.key === 'Escape' && visibilityMode && !isDrawingObstacle) {
        e.preventDefault();
        setVisibilityMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedObstacleId, visibilityMode, isDrawingObstacle]);

  // 🎵 Global audio reference for quick sounds
  const globalAudioRef = useRef<HTMLAudioElement | null>(null);

  // 🎵 Update global audio volume when mixer changes
  useEffect(() => {
    if (globalAudioRef.current) {
      globalAudioRef.current.volume = audioVolumes.quickSounds;
    }
  }, [audioVolumes.quickSounds]);

  // 🎵 GLOBAL SOUND PLAYBACK LISTENER - Listen for sounds played by MJ
  useEffect(() => {
    if (!roomId) return

    const globalSoundRef = firestoreDoc(db, 'global_sounds', roomId)

    const unsubscribe = onSnapshot(globalSoundRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data()

        // Check if it's a stop command
        if (data.soundUrl === null || !data.soundUrl) {
          // Stop current audio if any
          if (globalAudioRef.current) {
            globalAudioRef.current.pause();
            globalAudioRef.current = null;
          }
          return;
        }

        if (data.soundUrl && data.timestamp) {
          // Check if this is a new sound event (not older than 2 seconds)
          const eventTime = data.timestamp.toMillis ? data.timestamp.toMillis() : data.timestamp
          const now = Date.now()
          const timeDiff = now - eventTime

          // Tolerate up to 60 seconds of delay/clock drift
          if (timeDiff < 60000) {
            // Stop previous audio if any
            if (globalAudioRef.current) {
              globalAudioRef.current.pause();
              globalAudioRef.current = null;
            }

            // Play the sound with volume from mixer
            const audio = new Audio(data.soundUrl)
            audio.volume = audioVolumes.quickSounds

            // Store reference
            globalAudioRef.current = audio;

            // Clear reference when ended
            audio.addEventListener('ended', () => {
              globalAudioRef.current = null;
            });

            audio.play().catch(e => console.error('Error playing sound:', e))
          }
        }
      }
    })

    return () => unsubscribe()
  }, [roomId, audioVolumes.quickSounds])

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        if (cleanup) cleanup(); // Clean up previous listeners if any (though this runs mostly once)
        cleanup = INITializeFirebaseListeners(roomId);
      } else {
        setUserId(null);
        if (cleanup) cleanup();
      }
    });
    return () => {
      unsubscribe();
      if (cleanup) cleanup();
    };
  }, [roomId]);

  // 🆕 CHARGER LE FOND SELON LA VILLE SÉLECTIONNÉE
  useEffect(() => {
    if (!roomId) return;

    let unsubscribe: (() => void) | undefined;

    if (selectedCityId) {
      // En mode ville : charger le fond spécifique de la ville
      const cityRef = doc(db, 'cartes', roomId, 'cities', selectedCityId);
      unsubscribe = onSnapshot(cityRef, (docSnap) => {
        if (docSnap.exists()) {
          const cityData = docSnap.data();
          if (cityData.backgroundUrl) {
            setBackgroundImage(cityData.backgroundUrl);
          } else {
            setBackgroundImage('/placeholder.svg?height=600&width=800');
          }
        }
      });
    } else {
      // En mode world map : charger le fond global
      const fondRef = doc(db, 'cartes', roomId, 'fond', 'fond1');
      unsubscribe = onSnapshot(fondRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().url) {

          setBackgroundImage(docSnap.data().url);
        }
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [roomId, selectedCityId]);

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
      const isPlaceholder = backgroundImage.includes('placeholder.svg');
      if (isPlaceholder) {
        setShowNoBackgroundModal(true);
      }
    }
  }, [backgroundImage, isMJ, loading, selectedCityId, cities]);

  const loadedPlayersRef = useRef<any[]>([]); // Storing RAW docs to re-parse with new cityId
  const loadedNPCsRef = useRef<Character[]>([]);

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
      visibilityRadius: parseFloat(data.visibilityRadius) || 100,
      visibleToPlayerIds: data.visibleToPlayerIds || undefined, // 🆕 Charger la liste des joueurs autorisés
      type: data.type || 'pnj',
      PV: data.PV || 10,
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
      Actions: data.Actions || []
    };
    return charObj;
  }, []);

  const mergeAndSetCharacters = useCallback(() => {
    // Deduplicate by ID
    const visibleIds = new Set<string>();
    const combined: Character[] = [];

    const currentCityId = selectedCityIdRef.current; // Always use FRESH cityId

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

    [...visiblePlayers, ...loadedNPCsRef.current].forEach(char => {
      if (!visibleIds.has(char.id)) {
        visibleIds.add(char.id);
        combined.push(char);
      }
    });

    setCharacters(combined);
    setLoading(false);
  }, [globalCityId, parseCharacterDoc]);

  // 🆕 EFFET DE SYNCHRONISATION DE SCÈNE (PRIORITÉ AU PERSONNAGE)
  useEffect(() => {
    // Si MJ, on ne force pas (sauf si on veut suivre, mais généralement MJ est libre)
    // On peut ajouter une option "Suivre le groupe" plus tard pour le MJ
    if (isMJ) return;

    // 🔍 Find my character in the RAW loaded players (because 'characters' state might filter me out if I'm not in this scene!)
    const myPlayerDoc = loadedPlayersRef.current.find(doc => doc.id === persoId);
    const mySceneId = myPlayerDoc ? myPlayerDoc.data().currentSceneId : null;

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
      // Seulement si je ne suis pas déjà dessus (et que je n'ai pas d'override perso)
      if (selectedCityId !== globalCityId) {
        console.log('🔀 [Sync] Moving to global group scene:', globalCityId);
        setSelectedCityId(globalCityId);
        setViewMode('city');
      }
    }
  }, [globalCityId, characters, persoId, isMJ, selectedCityId]);

  // 2. NOW USE THEM IN EFFECT
  useEffect(() => {
    selectedCityIdRef.current = selectedCityId;
    // Force update characters when city changes (to update player positions)
    mergeAndSetCharacters();
  }, [selectedCityId, mergeAndSetCharacters]);

  // 🆕 CHARGER LES DONNÉES FILTRÉES PAR VILLE (depuis les collections globales)
  useEffect(() => {
    if (!roomId) return;

    const unsubscribers: (() => void)[] = [];

    // 1. CHARGER ET FILTRER LES PERSONNAGES (Split: Players Global + NPCs Local)
    const charactersRef = collection(db, 'cartes', roomId, 'characters');
    // let loadedPlayers: Character[] = []; // MOVED TO REF
    // let loadedNPCs: Character[] = []; // MOVED TO REF

    // PARSE FUNCTION MOVED OUTSIDE FOR REUSE
    // const parseCharacterDoc = ...

    // A. Subscribe to Players (Global)
    // MOVED TO GLOBAL EFFECT
    // const playersQuery = query(charactersRef, where('type', '==', 'joueurs'));
    // const playersUnsub = onSnapshot(playersQuery, (snapshot) => {
    //    loadedPlayers = snapshot.docs.map(doc => parseCharacterDoc(doc, selectedCityId));
    //    mergeAndSetCharacters();
    // });
    // unsubscribers.push(playersUnsub);

    // B. Subscribe to NPCs (Local)
    // Note: We include 'ally' visibility in global usually? 
    // The original code said: "isGlobal = data.type === 'joueurs' || data.visibility === 'ally'".
    // For now, let's assume allies are also players OR handled by city. 
    // If allies are NPCs, we might miss them if they are in another city but "allied".
    // Let's stick to cityId for NPCs to save reads.
    const npcsQuery = query(charactersRef, where('cityId', '==', selectedCityId));
    const npcsUnsub = onSnapshot(npcsQuery, (snapshot) => {
      // Filter out players if they appear here (shouldn't if data is clean, but safe to filter)
      loadedNPCsRef.current = snapshot.docs
        .filter(doc => doc.data().type !== 'joueurs')
        .map(doc => parseCharacterDoc(doc, selectedCityId));
      mergeAndSetCharacters();
    });
    unsubscribers.push(npcsUnsub);

    // 2. CHARGER ET FILTRER LES DESSINS
    const drawingsRef = collection(db, 'cartes', roomId, 'drawings');
    const drawingsQuery = query(drawingsRef, where('cityId', '==', selectedCityId));
    const drawingsUnsub = onSnapshot(drawingsQuery, (snapshot) => {
      const drws: SavedDrawing[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const points = data.points || data.paths;
        if (points && Array.isArray(points)) {
          drws.push({
            id: doc.id,
            points: points,
            color: data.color || '#000000',
            width: data.width || 5,
            type: data.type || 'pen',
          });
        }
      });
      setDrawings(drws);
    });
    unsubscribers.push(drawingsUnsub);

    // 3. CHARGER ET FILTRER LES NOTES
    const notesRef = collection(db, 'cartes', roomId, 'text');
    const notesQuery = query(notesRef, where('cityId', '==', selectedCityId));
    const notesUnsub = onSnapshot(notesQuery, (snapshot) => {
      const texts: MapText[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        texts.push({
          id: doc.id,
          text: data.content,
          x: data.x || 0,
          y: data.y || 0,
          color: data.color || 'yellow',
          fontSize: data.fontSize,
          fontFamily: data.fontFamily,
        });
      });
      setNotes(texts);
    });
    unsubscribers.push(notesUnsub);

    // 4. CHARGER LE BROUILLARD (Stocké par ID spécifique ex: fog_cityId)
    // Pour le brouillard, comme c'est un document unique souvent lourd, on utilise des docs séparés dans la même collection
    const fogDocId = selectedCityId ? `fog_${selectedCityId}` : 'fogData';
    const fogRef = doc(db, 'cartes', roomId, 'fog', fogDocId);


    const fogUnsub = onSnapshot(fogRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();


        if (data.grid) {
          const loadedGrid = new Map<string, boolean>(Object.entries(data.grid));
          setFogGrid(loadedGrid);
        } else {
          setFogGrid(new Map());
        }
        if (data.fullMapFog !== undefined) {
          setFullMapFog(data.fullMapFog);
        }
      } else {

        setFogGrid(new Map());
        setFullMapFog(false);
      }
    });
    unsubscribers.push(fogUnsub);

    // 5. 🔦 CHARGER LES OBSTACLES (pour la vision dynamique)
    const obstaclesRef = collection(db, 'cartes', roomId, 'obstacles');
    const obstaclesQuery = query(obstaclesRef, where('cityId', '==', selectedCityId));
    const obstaclesUnsub = onSnapshot(obstaclesQuery, (snapshot) => {
      const obs: Obstacle[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        obs.push({
          id: docSnap.id,
          type: data.type || 'wall',
          points: data.points || [],
          color: data.color,
          opacity: data.opacity,
        });
      });

      setObstacles(obs);
    });
    unsubscribers.push(obstaclesUnsub);

    // 6. CHARGER ET FILTRER LES OBJETS
    const objectsRef = collection(db, 'cartes', roomId, 'objects');
    // Important: we assume that if data.cityId is missing, it's effectively null (or arguably we should handle that case, but standardizing on null is better)
    // Firestore queries are strict: wheres are exact matches.
    const objectsQuery = query(objectsRef, where('cityId', '==', selectedCityId));
    const objectsUnsub = onSnapshot(objectsQuery, (snapshot) => {
      const objs: MapObject[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();

        // Créer l'image immédiatement
        const img = new Image();
        if (data.imageUrl) {
          img.src = data.imageUrl;
        }

        objs.push({
          id: doc.id,
          x: data.x || 0,
          y: data.y || 0,
          width: data.width || 100,
          height: data.height || 100,
          rotation: data.rotation || 0,
          imageUrl: data.imageUrl || '',
          name: data.name,
          cityId: data.cityId || null,
          image: img,
          isBackground: data.isBackground || false,
          isLocked: data.isLocked || false, // 🆕 Charger l'état de verrouillage
          visibility: data.visibility || undefined,
          type: (data.type || 'decors') as 'decors' | 'weapon' | 'item',
          visibleToPlayerIds: data.visibleToPlayerIds || undefined
        });
      });
      setObjects(objs);
    });
    unsubscribers.push(objectsUnsub);

    // 7. CHARGER ZONES DE MUSIQUE
    const musicZonesRef = collection(db, 'cartes', roomId, 'musicZones');
    const musicZonesQuery = query(musicZonesRef, where('cityId', '==', selectedCityId));
    const musicZonesUnsub = onSnapshot(musicZonesQuery, (snapshot) => {
      const zones: MusicZone[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.cityId === selectedCityId) {
          zones.push({ id: doc.id, ...data } as MusicZone);
        }
      });
      setMusicZones(zones);
    });

    unsubscribers.push(musicZonesUnsub);

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [roomId, selectedCityId, parseCharacterDoc, mergeAndSetCharacters]);


  // ------------------------------------------------------------------
  // 🌍 GLOBAL LISTENER (PLAYERS) - Stays connected across City Switches
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!roomId) return;

    const charactersRef = collection(db, 'cartes', roomId, 'characters');
    // A. Subscribe to Players (Global)
    const playersQuery = query(charactersRef, where('type', '==', 'joueurs'));
    const playersUnsub = onSnapshot(playersQuery, (snapshot) => {
      loadedPlayersRef.current = snapshot.docs; // Store RAW docs
      mergeAndSetCharacters();
    });

    return () => {
      playersUnsub();
      loadedPlayersRef.current = []; // Clear on unmount
    };
  }, [roomId, parseCharacterDoc, mergeAndSetCharacters]);


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
    // If we are dragging a character, throttle updates to 50ms (20fps)
    // This prevents the expensive shadow calculation from blocking the UI thread
    if (isDraggingCharacter) {
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
  }, [activeViewer?.x, activeViewer?.y, obstacles, bgImageObject, isMJ, playerViewMode, layers, activeViewer, isDraggingCharacter]);

  useEffect(() => {
    const bgCanvas = bgCanvasRef.current;
    const fgCanvas = fgCanvasRef.current;
    if (!bgCanvas || !fgCanvas) return;

    const bgCtx = bgCanvas.getContext('2d')!;
    const fgCtx = fgCanvas.getContext('2d')!;

    // ⚡ PERFORMANCE THROTTLE (Eco Mode)
    // Throttle the ENTIRE map render (Foreground + Background)
    if (performanceMode === 'eco') {
      const now = Date.now();
      if (now - lastMapDrawTimeRef.current < 30) { // Cap at ~30 FPS
        return;
      }
      lastMapDrawTimeRef.current = now;
    }


    // Fallback if no valid image: default 1920x1080 transparent canvas
    const image = bgImageObject || { width: 1920, height: 1080 } as HTMLImageElement;

    const sizeMultiplier = 1.5;
    // Use state dimensions if available, else fallbacks
    const containerWidth = containerSize.width || containerRef.current?.clientWidth || bgCanvas.width;
    const containerHeight = containerSize.height || containerRef.current?.clientHeight || bgCanvas.height;

    // Set dimensions for BOTH canvases
    bgCanvas.width = containerWidth * sizeMultiplier;
    bgCanvas.height = containerHeight * sizeMultiplier;
    fgCanvas.width = containerWidth * sizeMultiplier;
    fgCanvas.height = containerHeight * sizeMultiplier;

    bgCtx.scale(sizeMultiplier, sizeMultiplier);
    fgCtx.scale(sizeMultiplier, sizeMultiplier);

    // Initial draw
    drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight);
    drawForegroundLayers(fgCtx, image, containerWidth, containerHeight);

    // 🎥 VIDEO RENDER LOOP
    let animationFrameId: number;

    if (image instanceof HTMLVideoElement && performanceMode !== 'static') {
      let lastFrameTime = 0;
      const fpsInterval = performanceMode === 'eco' ? 1000 / 30 : 0; // 30fps for eco, 0 for max

      const renderLoop = (timestamp: number) => {
        // Redraw usually clears canvas

        if (performanceMode === 'eco') {
          const elapsed = timestamp - lastFrameTime;
          if (elapsed > fpsInterval) {
            lastFrameTime = timestamp - (elapsed % fpsInterval);
            drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight);
          }
        } else {
          // High perf: draw every frame
          drawBackgroundLayers(bgCtx, image, containerWidth, containerHeight);
        }

        animationFrameId = requestAnimationFrame(renderLoop);
      };
      animationFrameId = requestAnimationFrame(renderLoop);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };


  }, [bgImageObject, showGrid, zoom, offset, characters, objects, notes, selectedCharacterIndex, selectedObjectIndices, selectedNoteIndex, drawings, currentPath, fogGrid, showFogGrid, fullMapFog, isSelectingArea, selectionStart, selectionEnd, selectedCharacters, isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions, isDraggingNote, draggedNoteIndex, isDraggingObject, draggedObjectIndex, draggedObjectsOriginalPositions, isFogDragging, playerViewMode, isMJ, measureMode, measureStart, measureEnd, pixelsPerUnit, unitName, isCalibrating, obstacles, visibilityMode, selectedObstacleId, currentObstaclePoints, snapPoint, currentVisibilityTool, isDraggingObstaclePoint, isDraggingObstacle, layers, viewAsPersoId, containerSize, musicZones, selectedMusicZoneIds, isMusicMode, isDraggingMusicZone, globalTokenScale, precalculatedShadows, performanceMode]);

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

  // StaticToken component definition (assuming it's a simple image/video display)
  // This is a placeholder. The actual implementation might be more complex.





  // 🎯 NPC Template Drag & Drop Handlers
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

        await addDoc(collection(db, `cartes/${roomId}/objects`), {
          x,
          y,
          width: 100, // Default size
          height: 100,
          rotation: 0,
          imageUrl: template.imageUrl,
          name: template.name,
          cityId: selectedCityId,
          createdAt: new Date()
        })
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
      setDropPosition({ x, y })
      setShowPlaceModal(true)
    } catch (error) {
      console.error('❌ Error parsing template data:', error)
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
    nombre: number; visibility?: 'public' | 'gm_only' | 'ally' | 'hidden' | 'visible' | 'custom';
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
        await addDoc(charactersRef, {
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
        })
      }

    } catch (error) {
      console.error('❌ Error placing NPC:', error)
    } finally {
      setShowPlaceModal(false)
      setDraggedTemplate(null)
      setDropPosition(null)
    }
  }

  // Firebase Functions

  // 🎯 Configuration du menu radial
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

  // 🎯 Calculer les IDs des outils actuellement actifs (peut être plusieurs)
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
      setSelectedObstacleId(null);
      setFogMode(false);
    } else {
      // Entrer en mode visibilité : désélectionner les autres éléments
      setSelectedCharacterIndex(null);
      setSelectedObjectIndices([]);
      setSelectedNoteIndex(null);
      setSelectedDrawingIndex(null);
    }
  };

  const saveObstacle = async (type: 'wall' | 'polygon', points: Point[]) => {
    if (!roomId || points.length < 2) return;

    try {
      const obstacleData = {
        type,
        points,
        cityId: selectedCityId,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'cartes', String(roomId), 'obstacles'), obstacleData);
    } catch (error) {
      console.error('❌ Erreur sauvegarde obstacle:', error);
    }
  };

  const deleteObstacle = async (obstacleId: string) => {
    if (!roomId || !obstacleId) return;

    try {
      await deleteDoc(doc(db, 'cartes', String(roomId), 'obstacles', obstacleId));
      setSelectedObstacleId(null);

    } catch (error) {
      console.error('❌ Erreur suppression obstacle:', error);
    }
  };

  const updateObstacle = async (obstacleId: string, newPoints: Point[]) => {
    if (!roomId || !obstacleId || newPoints.length < 2) return;

    try {
      const obstacleRef = doc(db, 'cartes', String(roomId), 'obstacles', obstacleId);
      await updateDoc(obstacleRef, { points: newPoints });

    } catch (error) {
      console.error('❌ Erreur mise à jour obstacle:', error);
    }
  };

  const clearAllObstacles = async () => {
    if (!roomId) return;

    try {
      const obstaclesRef = collection(db, 'cartes', String(roomId), 'obstacles');
      const snapshot = await getDocs(obstaclesRef);

      // Ne supprimer que les obstacles de la ville actuelle
      const deletePromises = snapshot.docs
        .filter(doc => doc.data().cityId === selectedCityId)
        .map(doc => deleteDoc(doc.ref));

      await Promise.all(deletePromises);

    } catch (error) {
      console.error('❌ Erreur suppression obstacles:', error);
    }
  };

  const handleRadialMenuSelect = (item: { id: number; label: string; icon: any }) => {
    // 🎯 Désactiver les outils incompatibles avant d'activer le nouveau
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

        // 🎯 MUTUAL EXCLUSION: Close other drawers
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
      }
    };
    switch (actionId) {
      case TOOLS.PAN: deactivateIncompatible(TOOLS.PAN); togglePanMode(); break;
      case TOOLS.GRID: setShowGrid(!showGrid); break;
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
      case TOOLS.SETTINGS: setShowGlobalSettingsDialog(true); break;
      case TOOLS.AUDIO_MIXER: deactivateIncompatible(TOOLS.AUDIO_MIXER); setIsAudioMixerOpen(!isAudioMixerOpen); break;
      case TOOLS.ADD_CHAR: if (isMJ) { deactivateIncompatible(TOOLS.ADD_CHAR); setIsNPCDrawerOpen(!isNPCDrawerOpen); } break;
      case TOOLS.ADD_OBJ: if (isMJ) { deactivateIncompatible(TOOLS.ADD_OBJ); setIsObjectDrawerOpen(!isObjectDrawerOpen); } break;
      case TOOLS.ADD_NOTE: handleAddNote(); break;
      case TOOLS.MUSIC: if (isMJ) { deactivateIncompatible(TOOLS.MUSIC); setIsSoundDrawerOpen(!isSoundDrawerOpen); } break;
      case TOOLS.MULTI_SELECT: if (isMJ) { deactivateIncompatible(TOOLS.MULTI_SELECT); setMultiSelectMode(!multiSelectMode); } break;
      case TOOLS.BACKGROUND_EDIT: if (isMJ) setIsBackgroundEditMode(!isBackgroundEditMode); break;
      case TOOLS.DRAW: deactivateIncompatible(TOOLS.DRAW); toggleDrawMode(); break;
      case TOOLS.MEASURE: deactivateIncompatible(TOOLS.MEASURE); setMeasureMode(!measureMode); setMeasureStart(null); setMeasureEnd(null); setIsCalibrating(false); break;
      case TOOLS.VISIBILITY: if (isMJ) { deactivateIncompatible(TOOLS.VISIBILITY); toggleVisibilityMode(); } break;
      case TOOLS.CLEAR_DRAWINGS: clearDrawings(); break;
      case TOOLS.ZOOM_IN: setZoom(prev => Math.min(prev + 0.1, 5)); break;
      case TOOLS.ZOOM_OUT: setZoom(prev => Math.max(prev - 0.1, 0.1)); break;
      case TOOLS.WORLD_MAP: navigateToWorldMap(); break;
    }
  };

  const getActiveToolbarTools = (): string[] => {
    const active: string[] = [];
    if (drawMode) active.push(TOOLS.DRAW);
    if (visibilityMode) active.push(TOOLS.VISIBILITY);
    if (showGrid) active.push(TOOLS.GRID);
    if (panMode) active.push(TOOLS.PAN);
    if (playerViewMode) active.push(TOOLS.VIEW_MODE);
    if (measureMode) active.push(TOOLS.MEASURE);
    if (isMusicMode) active.push(TOOLS.MUSIC);
    if (showLayerControl) active.push(TOOLS.LAYERS);
    if (isObjectDrawerOpen) active.push(TOOLS.ADD_OBJ);
    if (isNPCDrawerOpen) active.push(TOOLS.ADD_CHAR);
    if (multiSelectMode) active.push(TOOLS.MULTI_SELECT);
    if (isBackgroundEditMode) active.push(TOOLS.BACKGROUND_EDIT);
    if (isAudioMixerOpen) active.push(TOOLS.AUDIO_MIXER);
    return active;
  };

  const getToolOptionsContent = () => {
    // 🎯 SELECTION : Dessin
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
                deleteDoc(doc(db, 'cartes', String(roomId), 'drawings', drawing.id));
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

    // 🎯 SELECTION : Objets (MJ)
    if (selectedObjectIndices.length > 0 && isMJ) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">{selectedObjectIndices.length} Objet(s)</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (selectedObjectIndices.length > 0 && roomId && isMJ) {
                selectedObjectIndices.forEach(index => {
                  const obj = objects[index];
                  if (obj) deleteDoc(doc(db, 'cartes', String(roomId), 'objects', obj.id));
                });
                setObjects(prev => prev.filter((_, i) => !selectedObjectIndices.includes(i)));
                setSelectedObjectIndices([]);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedObjectIndices([])}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    // 🎯 SELECTION : Note
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

    // 🎯 SELECTION : Obstacle (MJ)
    if (selectedObstacleId && isMJ) {
      return (
        <div className="w-fit mx-auto flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <span className="text-white text-sm font-medium pr-2">Obstacle</span>
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              if (selectedObstacleId && roomId && isMJ) {
                await deleteDoc(doc(db, 'cartes', String(roomId), 'obstacles', selectedObstacleId));
                setObstacles(prev => prev.filter(o => o.id !== selectedObstacleId));
                setSelectedObstacleId(null);
              }
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedObstacleId(null)}
            className="text-gray-400 hover:text-white"
          >
            Fermer
          </Button>
        </div>
      );
    }

    // 🎯 SELECTION : Multi-Char (MJ)
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

    // 🎯 SELECTION : Brouillard (MJ)
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
              saveFogGrid(new Map());
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

    // 🎯 MODE : Mesure
    if (measureMode) {
      return (
        <MeasurementShapeSelector
          selectedShape={measurementShape}
          onShapeChange={setMeasurementShape}
          onConeConfig={() => setConeConfigDialogOpen(true)}
          isCalibrating={isCalibrating}
          onStartCalibration={() => {
            setIsCalibrating(true);
            setMeasureStart(null);
            setMeasureEnd(null);
          }}
          onCancelCalibration={() => setIsCalibrating(false)}
        />
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
              <Move className="w-5 h-5" strokeWidth={currentVisibilityTool === 'edit' ? 2.5 : 2} />
            </Button>
          </div>
        </div>
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


  // 🎯 NAVIGATION FUNCTIONS
  const navigateToCity = async (cityId: string) => {
    setSelectedCityId(cityId);
    setViewMode('city');
    // Reset tool modes when entering city
    setDrawMode(false);
    setFogMode(false);
    setPanMode(false);
    setMeasureMode(false);



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

      await updateDoc(doc(db, 'cartes', roomId, 'settings', 'general'), {
        currentCityId: null,
      });
    }
  };


  const INITializeFirebaseListeners = (room: string) => {
    const unsubscribers: (() => void)[] = [];

    // Le chargement du fond est maintenant géré par un useEffect séparé (voir ligne ~165)

    // Écouter le personnage actif (tour_joueur)
    const settingsRef = doc(db, 'cartes', room.toString(), 'settings', 'general');
    const settingsUnsub = onSnapshot(settingsRef, (doc) => {
      if (doc.exists() && doc.data().tour_joueur) {
        setActivePlayerId(doc.data().tour_joueur);
      }
      // 🆕 CHARGER LA VILLE ACTUELLE (synchronisée pour tous les utilisateurs)
      if (doc.exists()) {
        const data = doc.data();
        if (data.pixelsPerUnit) setPixelsPerUnit(data.pixelsPerUnit);
        if (data.unitName) setUnitName(data.unitName);

        // Synchroniser la ville actuelle
        if (data.currentCityId) {
          setGlobalCityId(data.currentCityId); // Update global state
          // La redirection est gérée par le useEffect de synchronisation
        } else {
          if (!isMJ) {
            // Si pas de ville définie et qu'on n'est pas MJ, on reste sur une vue par défaut
          }
        }
      }
    });
    unsubscribers.push(settingsUnsub);

    // 🆕 Charger les villes pour la world map
    const citiesRef = collection(db, 'cartes', room.toString(), 'cities');
    const citiesUnsub = onSnapshot(citiesRef, (snapshot) => {
      const loadedCities: any[] = [];
      snapshot.forEach((doc) => {
        loadedCities.push({ id: doc.id, ...doc.data() });
      });
      setCities(loadedCities);
    });
    unsubscribers.push(citiesUnsub);

    // NOTE: Fog listener removed from here as it is handled by the main data loading useEffect (line ~890)
    // to correctly support switching between city-specific fog and global fog files.

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  };



  // 🎯 NOUVELLE FONCTION : Vérifier si un personnage est visible pour l'utilisateur actuel
  const isCharacterVisibleToUser = (char: Character): boolean => {
    // Le MJ en mode normal voit toujours tout
    const effectiveIsMJ = isMJ && !playerViewMode;
    if (effectiveIsMJ) return true;

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
          calculateDistance(charScreenX, charScreenY, playerScreenX, playerScreenY) <= (player.visibilityRadius ?? 100) * zoom
        );
      });
    }

    // Sinon, visible
    return true;
  };

  // 🎯 NOUVELLE FONCTION : Vérifier si un objet est visible pour l'utilisateur actuel
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
        ctx.fillText(note.text, x, y);

        if (index === selectedNoteIndex) {
          ctx.strokeStyle = '#4285F4';
          ctx.lineWidth = 2;
          const metrics = ctx.measureText(note.text);
          const padding = 4;
          ctx.strokeRect(x - padding, y - fontSize, metrics.width + (padding * 2), fontSize + padding);
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

    // 🎯 Optionnel : Dessiner les cercles de visibilité des joueurs et alliés (pour debug)
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
        calculateFogOpacity
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

        // Dessiner les ombres avec une opacité fixe (pas de superposition)
        drawShadows(
          ctx,
          viewerPosition,
          obstacles,
          mapBounds,
          1.0, // Opacité 100% - les joueurs ne voient rien derrière les obstacles
          transformPoint,
          {
            precalculated: precalculatedShadows ?? undefined,
            tempCanvas: shadowTempCanvas.current ?? undefined,
            exteriorCanvas: shadowExteriorCanvas.current ?? undefined
          }
        );
      }
    }


    // 🎵 DRAW MUSIC ZONES (Visible only for MJ, and not in Player View mode)
    if (isMJ && !viewAsPersoId && isLayerVisible('music')) {
      musicZones.forEach(zone => {
        const center = transformPoint({ x: zone.x, y: zone.y });
        const isSelected = selectedMusicZoneIds.includes(zone.id);
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

        // 🎯 RESIZE HANDLE (If Selected)
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
      });
    }

    // 🔦 DESSINER LES OBSTACLES (visible seulement pour le MJ en mode édition)
    if (isLayerVisible('obstacles') && (visibilityMode || (effectiveIsMJ && obstacles.length > 0))) {
      // 1. Base Layer (Thick Black)
      drawObstacles(ctx, obstacles, transformPoint, {
        strokeColor: '#000000',
        fillColor: visibilityMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.5)',
        strokeWidth: 10,
        showHandles: false, // Don't draw handles twice
        selectedId: selectedObstacleId,
      });

      // 2. Detail Layer (Inner Grey Line) - Makes it look like a constructed wall
      drawObstacles(ctx, obstacles, transformPoint, {
        strokeColor: '#555555',
        fillColor: 'transparent', // Don't fill twice
        strokeWidth: 4,
        showHandles: visibilityMode || !!selectedObstacleId,
        selectedId: selectedObstacleId,
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

    // 🎯 CALCUL DES OMBRES POUR MASQUER LES PNJs ET OBJETS (Côté Client seulement)
    // Si un PNJ ou objet est dans l'ombre du joueur (ou allié), il ne doit pas être affiché
    let activeShadowsForFiltering: Point[][] | null = null;
    let polygonsContainingViewerForFiltering: Obstacle[] = [];

    if (!effectiveIsMJ && obstacles.length > 0 && isLayerVisible('obstacles') && precalculatedShadows) {
      // ⚡ OPTIMIZATION: Use precalculated shadows from useMemo!
      activeShadowsForFiltering = precalculatedShadows.shadows;
      polygonsContainingViewerForFiltering = precalculatedShadows.polygonsContainingViewer;
    }






    // 🎯 Dessiner la zone de sélection en cours
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

        // 🎯 Vérifier si le personnage est masqué par une ombre (uniquement pour les joueurs)
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

        // 🎯 Vérifier si le personnage est dans le brouillard
        const isInFog = fullMapFog || isCellInFog(char.x, char.y, fogGrid, fogCellSize);

        // 🎯 Pour les PNJ (non joueurs et non alliés) : s'ils sont dans le brouillard, ils deviennent automatiquement cachés
        let effectiveVisibility = char.visibility;

        // 🆕 Vérifier la visibilité custom AVANT le fog
        if (!isCharacterVisibleToUser(char)) {
          effectiveVisibility = 'hidden';
        } else if (char.type !== 'joueurs' && char.visibility !== 'ally' && isInFog) {
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
              isVisible = dist <= (viewer.visibilityRadius ?? 100) * zoom;
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
              return dist <= (viewer.visibilityRadius ?? 100) * zoom;
            })();
          }
        }



        if (isVisible) {
          // 🎯 Couleur spéciale pour les personnages dans la zone de sélection
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

          // 🎯 Taille différente pour les personnages joueurs (avec imageURLFinal)
          // 🎯 Taille différente pour les personnages joueurs (avec imageURLFinal)
          const isPlayerCharacter = char.type === 'joueurs';
          const charScale = char.scale || 1;
          const finalScale = charScale * globalTokenScale;

          const baseRadius = isPlayerCharacter ? 30 : 20;
          const baseBorderRadius = isPlayerCharacter ? 32 : 22;

          // const iconRadius = baseRadius * finalScale * zoom; // Not used locally?
          const borderRadius = baseBorderRadius * finalScale * zoom;

          // Draw character border circle
          ctx.beginPath();
          ctx.arc(x, y, borderRadius, 0, 2 * Math.PI);
          ctx.stroke();

          // Note: Character image is now rendered as a DOM element (see characters-layer in JSX)
          // This allows animated GIFs to work properly
          // The canvas still renders the border circle and other UI elements






          // Configuration
          const uiScale = Math.max(0.6, Math.min(1.5, zoom));
          const isSelected = index === selectedCharacterIndex;
          const canSeeHP = (isMJ && !playerViewMode) || char.id === persoId; // Visible MJ or Owner

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

        // Draw hidden status badge if character is hidden (soit par défaut, soit par le brouillard) - uniquement en mode MJ normal, pas en vue joueur
        if (effectiveVisibility === 'hidden' && effectiveIsMJ) {
          const isPlayerCharacter = char.type === 'joueurs';
          const hiddenBadgeOffsetMultiplier = isPlayerCharacter ? 24 : 16;
          const badgeX = x + hiddenBadgeOffsetMultiplier * zoom; // Positioning the badge at the top-right
          const badgeY = y - hiddenBadgeOffsetMultiplier * zoom;

          ctx.fillStyle = char.id === persoId
            ? 'rgba(255, 0, 0, 1)'             // Red for the player's character
            : char.type === 'joueurs'
              ? 'rgba(0, 0, 255, 1)'             // Blue for 'joueurs'
              : 'rgba(255, 165, 0, 1)';          // Orange for other characters

          ctx.beginPath();
          ctx.arc(badgeX, badgeY, 8 * zoom, 0, 2 * Math.PI);
          ctx.fill();

          ctx.fillStyle = 'white';
          ctx.font = `${8 * zoom}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👁️', badgeX, badgeY); // EyeOff symbol
        }

        // Draw visibility radius outline for selected characters (no more filled semi-transparent disk)
        if (char.type === 'joueurs' && index === selectedCharacterIndex) {
          ctx.strokeStyle = 'rgba(0, 0, 255, 0.9)'; // Bright blue outline
          ctx.lineWidth = 2 * zoom;
          ctx.beginPath();
          ctx.arc(x, y, (char.visibilityRadius ?? 100) * zoom, 0, 2 * Math.PI);
          ctx.stroke();
        }

        // Draw visibility radius outline for allies when selected (MJ only)
        if (char.visibility === 'ally' && index === selectedCharacterIndex && isMJ) {
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)'; // Bright green outline
          ctx.lineWidth = 2 * zoom;
          ctx.beginPath();
          ctx.arc(x, y, (char.visibilityRadius ?? 100) * zoom, 0, 2 * Math.PI);
          ctx.stroke();
        }
      });
    }

    // 🎯 DRAW MEASUREMENT RULER
    if (measureMode && measureStart) {
      const p1 = measureStart;
      const p2 = measureEnd;

      if (p1 && p2) {
        // Convert world coordinates to screen coordinates
        const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
        const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;
        const x2 = (p2.x / imgWidth) * scaledWidth - offset.x;
        const y2 = (p2.y / imgHeight) * scaledHeight - offset.y;

        const screenStart = { x: x1, y: y1 };
        const screenEnd = { x: x2, y: y2 };

        // Render based on selected shape
        const renderOptions = {
          ctx,
          start: screenStart,
          end: screenEnd,
          zoom,
          pixelsPerUnit,
          unitName,
          isCalibrating,
          coneAngle: 53, // Standard D&D cone angle
          coneWidth: coneWidth // Custom cone width if set
        };

        switch (measurementShape) {
          case 'line':
            renderLineMeasurement(renderOptions);
            break;
          case 'cone':
            renderConeMeasurement(renderOptions);
            break;
          case 'circle':
            renderCircleMeasurement(renderOptions);
            break;
          case 'cube':
            renderCubeMeasurement(renderOptions);
            break;
        }
      } else if (p1 && !p2) {
        // Draw just the start point
        const x1 = (p1.x / imgWidth) * scaledWidth - offset.x;
        const y1 = (p1.y / imgHeight) * scaledHeight - offset.y;

        const shapeNames = {
          line: 'line',
          cone: 'cone',
          circle: 'circle',
          cube: 'cube'
        };

        renderStartPoint(ctx, { x: x1, y: y1 }, zoom, shapeNames[measurementShape]);
      }
    }
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





  // 🎯 CALIBRATION SUBMIT
  const handleCalibrationSubmit = async () => {
    const distanceVal = parseFloat(tempCalibrationDistance);
    if (!isNaN(distanceVal) && distanceVal > 0 && measureStart && measureEnd && roomId && bgImageObject) {
      // Convert world coordinates to screen coordinates (same as in rendering)
      const image = bgImageObject;
      const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
      const containerWidth = containerSize.width || containerRef.current?.clientWidth || 0;
      const containerHeight = containerSize.height || containerRef.current?.clientHeight || 0;
      const zoomScale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
      const scaledWidth = imgWidth * zoomScale * zoom;
      const scaledHeight = imgHeight * zoomScale * zoom;

      const x1 = (measureStart.x / imgWidth) * scaledWidth - offset.x;
      const y1 = (measureStart.y / imgHeight) * scaledHeight - offset.y;
      const x2 = (measureEnd.x / imgWidth) * scaledWidth - offset.x;
      const y2 = (measureEnd.y / imgHeight) * scaledHeight - offset.y;

      // Calculate pixel distance in screen space
      const pixelDist = calculateDistance(x1, y1, x2, y2);
      const newPixelsPerUnit = pixelDist / (distanceVal * zoom);

      // Save to Firebase
      try {
        const settingsRef = doc(db, 'cartes', String(roomId), 'settings', 'general');
        await setDoc(settingsRef, {
          pixelsPerUnit: newPixelsPerUnit
        }, { merge: true }); // Merge to keep other settings

        // Also update local state immediately for responsiveness
        setPixelsPerUnit(newPixelsPerUnit);

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
          await updateDoc(doc(db, 'cartes', roomIdStr, 'text', editingNote.id), {
            content: note.text,
            color: note.color,
            fontSize: note.fontSize,
            fontFamily: note.fontFamily
          });
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

          await addDoc(collection(db, 'cartes', roomIdStr, 'text'), {
            content: note.text,
            color: note.color,
            fontSize: note.fontSize,
            fontFamily: note.fontFamily,
            x: centerX,
            y: centerY,
            cityId: selectedCityId
          });
        }
        setShowCreateNoteModal(false);
        setEditingNote(null);
      } catch (error) {
        console.error("Erreur lors de l'ajout/modification de la note :", error);
      }
    }
  };


  // 🎯 Handle Object Resize Start
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

        // 2. Check if clicked on a zone icon
        const clickedZone = musicZones.find(z => {
          const dx = z.x - clickX;
          const dy = z.y - clickY;
          // Icon radius approx 15/zoom? No, world coordinates.
          // Let's assume click precision 
          // The icon is drawn with screen radius 15.
          // We need to convert screen radius to world.
          // screen = world * zoom. world = screen / zoom.
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist < (20 / zoom);
        });

        if (clickedZone) {
          e.preventDefault();

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
        // Clic gauche (0) = ajouter brouillard, Clic droit (2) = retirer brouillard
        const addMode = e.button === 0;
        setLastFogCell(null);
        await addFogCellIfNew(clickX, clickY, addMode);
        setIsFogAddMode(addMode);
        return;
      }

      // CLIC GAUCHE (button = 0) : SÉLECTION ET INTERACTIONS
      if (e.button === 0) {
        // 🎯 MODE MESURE
        if (measureMode) {


          // If no start point OR both points already set, start new measurement
          if (!measureStart || (measureStart && measureEnd &&
            Math.abs(measureStart.x - measureEnd.x) > 1 &&
            Math.abs(measureStart.y - measureEnd.y) > 1)) {
            // Start new measurement

            setMeasureStart({ x: clickX, y: clickY });
            setMeasureEnd(null);
          } else {
            // Set end point

            setMeasureEnd({ x: clickX, y: clickY });
          }
          return;
        }

        // 🎯 MODE DÉPLACEMENT DE CARTE - Seulement si le mode est explicitement activé (MJ uniquement)
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
          // Clic gauche (0) = ajouter brouillard, Clic droit (2) = retirer brouillard
          const addMode = e.button === 0;
          setLastFogCell(null);
          await addFogCellIfNew(clickX, clickY, addMode);
          setIsFogAddMode(addMode);
          return;
        }

        // 🔦 MODE VISIBILITÉ - MODE EDIT (sélection et manipulation d'obstacles)
        if (visibilityMode && currentVisibilityTool === 'edit' && isLayerVisible('obstacles')) {
          const handleRadius = 12 / zoom; // Rayon de détection des poignées

          // 1. Si un obstacle est sélectionné, vérifier si on clique sur une poignée
          if (selectedObstacleId) {
            const selectedObs = obstacles.find(o => o.id === selectedObstacleId);
            if (selectedObs) {
              for (let i = 0; i < selectedObs.points.length; i++) {
                const point = selectedObs.points[i];
                const dist = Math.sqrt(Math.pow(clickX - point.x, 2) + Math.pow(clickY - point.y, 2));
                if (dist < handleRadius) {
                  // Clic sur une poignée → commencer le drag du point
                  // Identifier TOUS les points connectés (même position) pour les déplacer ensemble
                  const connected: { obstacleId: string, pointIndex: number }[] = [];
                  const clickedPoint = selectedObs.points[i];
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
                  // Sauvegarder l'état original de TOUS les obstacles affectés serait lourd
                  // On utilisera la position actuelle + delta
                  setDraggedObstacleOriginalPoints([...selectedObs.points]); // Toujours utile de garder une ref
                  setConnectedPoints(connected);
                  setDragStartPos({ x: clickX, y: clickY });
                  return;
                }
              }

              // 2. Vérifier si on clique sur le corps de l'obstacle sélectionné (pour le déplacer)
              let clickedOnSelected = false;
              if (selectedObs.type === 'wall' && selectedObs.points.length >= 2) {
                const p1 = selectedObs.points[0];
                const p2 = selectedObs.points[1];
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
                clickedOnSelected = dist < 15 / zoom;
              } else if (selectedObs.type === 'polygon' && selectedObs.points.length >= 3) {
                let inside = false;
                for (let i = 0, j = selectedObs.points.length - 1; i < selectedObs.points.length; j = i++) {
                  const xi = selectedObs.points[i].x, yi = selectedObs.points[i].y;
                  const xj = selectedObs.points[j].x, yj = selectedObs.points[j].y;
                  if (((yi > clickY) !== (yj > clickY)) && (clickX < (xj - xi) * (clickY - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                  }
                }
                clickedOnSelected = inside;
              }

              if (clickedOnSelected) {
                // Clic sur l'obstacle sélectionné → commencer le drag de tout l'obstacle
                setIsDraggingObstacle(true);
                setDraggedObstacleOriginalPoints([...selectedObs.points]);
                setDragStartPos({ x: clickX, y: clickY });
                return;
              }
            }
          }

          // 3. Vérifier si on clique sur un autre obstacle pour le sélectionner
          const clickedObstacle = obstacles.find(obstacle => {
            if (obstacle.type === 'wall' && obstacle.points.length >= 2) {
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
            setSelectedObstacleId(clickedObstacle.id);
          } else {
            setSelectedObstacleId(null);
          }
          return;
        }

        // 🔦 MODE VISIBILITÉ - OUTILS DESSIN (chain, polygon)
        if (visibilityMode && (currentVisibilityTool === 'chain' || currentVisibilityTool === 'polygon')) {
          // Désélectionner tout obstacle si on dessine
          setSelectedObstacleId(null);

          if (isDrawingObstacle) {
            // CONTINUER le dessin en cours
            const clickPoint = snapPoint || { x: clickX, y: clickY };

            if (currentVisibilityTool === 'chain' && currentObstaclePoints.length >= 1) {
              // Murs connectés : sauvegarde le segment actuel, puis continue
              const finalPoints = [...currentObstaclePoints, clickPoint];
              await saveObstacle('wall', finalPoints);
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

        // 🎯 NOUVEAU Mode brouillard - priorité élevée (placement continu)
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
              deleteDoc(doc(db, 'cartes', String(roomId), 'drawings', drawingToDelete.id));
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

        // 🎯 MODE SÉLECTION PAR DÉFAUT - Nouveau comportement principal
        // Vérifier si on clique sur un élément existant ET s'il est visible
        const clickedCharIndex = isLayerVisible('characters') ? characters.findIndex(char => {
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

        // 🎯 NOUVEAU : Vérifier si on clique sur un objet
        // This logic is now handled by the DOM element's onMouseDown, as pointerEvents: 'auto' will prevent this from firing.
        // So, this block will effectively be skipped for objects.
        const clickedObjectIndex = -1; // No longer detected here

        // 🎯 NOUVEAU : Vérifier si on clique sur une cellule de brouillard
        const clickedFogIndex = isCellInFog(clickX, clickY, fogGrid, fogCellSize) ? 0 : -1;

        // 🎯 NOUVEAU : Vérifier si on clique sur un dessin (pour sélection)
        const clickedDrawingIndex = drawings.findIndex(drawing => isPointOnDrawing(clickX, clickY, drawing, zoom));

        // 🎯 NOUVEAU : Vérifier si on clique sur une poignée de redimensionnement
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

        // Si on clique sur un élément, le sélectionner
        if (clickedCharIndex !== -1) {
          // Si Ctrl/Cmd est pressé, ajouter à la sélection multiple
          if (e.ctrlKey || e.metaKey) {
            if (selectedCharacters.includes(clickedCharIndex)) {
              setSelectedCharacters(prev => prev.filter(index => index !== clickedCharIndex));
            } else {
              setSelectedCharacters(prev => [...prev, clickedCharIndex]);
            }
          } else {
            // 🎯 NOUVEAU : Commencer le drag & drop du personnage ou groupe
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

          // 🎯 NOUVEAU : Commencer le drag & drop de la note
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
          // 🎯 SELECTION DESSIN
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

        } else if (clickedFogIndex !== -1) {
          setSelectedFogIndex(clickedFogIndex);
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedCharacters([]);
          setSelectedDrawingIndex(null);
          setSelectedObjectIndices([]);
        } else {
          // 🎯 DETECTION D'OBSTACLE (Polygones / Murs)
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
              } else if (obs.type === 'wall') {
                // Line check
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
            setSelectedObstacleId(clickedObstacleId);
            // Clear others
            setSelectedCharacterIndex(null);
            setSelectedNoteIndex(null);
            setSelectedFogIndex(null);
            setSelectedCharacters([]);
            setSelectedDrawingIndex(null);
            setSelectedObjectIndices([]);

            setContextMenuOpen(false);

            // Start Drag
            setIsDraggingObstacle(true);
            setDraggedObstacleId(clickedObstacleId);
            const obs = obstacles.find(o => o.id === clickedObstacleId);
            if (obs) {
              // Deep copy points
              setDraggedObstacleOriginalPoints(obs.points.map(p => ({ ...p })));
            }
            setDragStart({ x: e.clientX, y: e.clientY });
          } else {
            // Clic sur zone vide
            setSelectedCharacterIndex(null);
            setSelectedNoteIndex(null);
            setSelectedFogIndex(null);
            setSelectedCharacters([]);
            setSelectedDrawingIndex(null);
            setSelectedObjectIndices([]); // Désélectionner l'objet
            setSelectedObstacleId(null);
            setContextMenuOpen(false);

            if (isMJ && multiSelectMode) {
              // MJ : Commencer une sélection par zone UNIQUEMENT si le mode est actif
              setSelectionStart({ x: clickX, y: clickY });
              setIsSelectingArea(true);
            } else {
              // Sinon : Déplacer la carte (comme le mode pan, comportement par défaut amélioré)
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

    // 🎯 RESIZING OBJECT
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

    // 🎯 PRIORITÉ 0: Placement continu de brouillard pendant le drag
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
    if (visibilityMode && currentVisibilityTool === 'edit' && isDraggingObstaclePoint && dragStartPos) {
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

    // ✏️ MODE EDIT - Drag de l'obstacle entier
    if (visibilityMode && currentVisibilityTool === 'edit' && isDraggingObstacle && selectedObstacleId && dragStartPos) {
      const deltaX = currentX - dragStartPos.x;
      const deltaY = currentY - dragStartPos.y;
      const newPoints = draggedObstacleOriginalPoints.map(p => ({
        x: p.x + deltaX,
        y: p.y + deltaY,
      }));
      // Mise à jour locale pour le rendu
      setObstacles(prev => prev.map(o => o.id === selectedObstacleId ? { ...o, points: newPoints } : o));
      return;
    }

    // 🔦 PRÉVISUALISATION OBSTACLE en cours de création
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

    // 🎯 MEASURE DRAG
    if (measureMode && measureStart && e.buttons === 1) {
      setMeasureEnd({ x: currentX, y: currentY });
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

    // 🎵 HANDLE MUSIC ZONE RESIZING
    if (isResizingMusicZone && resizingMusicZoneId && isMJ) {
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


    // 🎯 DRAG OBSTACLE
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

    // 🎯 DÉPLACEMENT DE CARTE
    // Pour le MJ : clic milieu OU clic gauche en panMode
    // Pour les joueurs : clic milieu OU clic gauche sur zone vide (isDragging sans autre action en cours)
    if (isDragging && (mouseButton === 1 || (mouseButton === 0 && (panMode || !isMJ)))) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setOffset((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    // 🎯 RESIZE DESSIN
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

    // 🎯 DRAG & DROP DESSIN
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

    // 🎯 DRAG & DROP NOTE
    if (isDraggingNote && draggedNoteIndex !== null) {
      setNotes(prev => prev.map((note, index) => {
        if (index === draggedNoteIndex) {
          return { ...note, x: currentX, y: currentY };
        }
        return note;
      }));
      return;
    }

    // 🎯 DRAG & DROP OBJET
    // 🎯 DRAG & DROP OBJET (MULTI)
    if (isDraggingObject && draggedObjectIndex !== null && draggedObjectsOriginalPositions.length > 0) {
      // Calculate start mouse position in MAP coordinates
      const startMapX = ((dragStart.x - rect.left + offset.x) / scaledWidth) * imgWidth;
      const startMapY = ((dragStart.y - rect.top + offset.y) / scaledHeight) * imgHeight;

      // Calculate the movement of the mouse
      const deltaX = currentX - startMapX;
      const deltaY = currentY - startMapY;

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

    // 🎯 DRAG & DROP PERSONNAGE
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
              x: originalPos.x + deltaX,
              y: originalPos.y + deltaY
            };
          }
          return char;
        }));
      }
      return;
    }

    // 🎯 SÉLECTION PAR ZONE
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

    // 🎯 MODE DESSIN (Drawing Tools)
    if (isDrawing && drawMode && !fogMode) {
      if (currentTool === 'eraser') {
        const drawingIndexToDelete = drawings.findIndex(drawing => isPointOnDrawing(x, y, drawing, zoom));
        if (drawingIndexToDelete !== -1 && roomId) {
          const drawingToDelete = drawings[drawingIndexToDelete];
          deleteDoc(doc(db, 'cartes', String(roomId), 'drawings', drawingToDelete.id));
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
    // 🎯 CALIBRATION END (OPEN DIALOG)
    if (isCalibrating && measureMode && measureStart && measureEnd) {
      // If dragged distance is significant, open dialog
      const dist = calculateDistance(measureStart.x, measureStart.y, measureEnd.x, measureEnd.y);
      if (dist > 10) {
        setCalibrationDialogOpen(true);
      }
    }

    setIsDragging(false);
    setDragStart({ x: 0, y: 0 });
    // Réinitialiser le bouton de souris
    const currentMouseButton = mouseButton;
    setMouseButton(null);

    // 🎯 FIN RESIZE OBJET
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
      if (selectedObstacleId) obstacleIdsToUpdate.add(selectedObstacleId);
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
      return;
    }

    // 🎵 END RESIZE MUSIC ZONE
    if (isResizingMusicZone && resizingMusicZoneId && roomId) {
      setIsResizingMusicZone(false);
      const zone = musicZones.find(z => z.id === resizingMusicZoneId);
      if (zone) {
        // Save new radius
        updateDoc(doc(db, 'cartes', roomId, 'musicZones', resizingMusicZoneId), {
          radius: zone.radius
        }).catch(err => console.error("Error saving music zone radius:", err));
      }
      setResizingMusicZoneId(null);
      return;
    }
    // ✏️ FIN DU DRAG OBSTACLE ENTIER
    if (isDraggingObstacle && selectedObstacleId) {
      const obstacle = obstacles.find(o => o.id === selectedObstacleId);
      if (obstacle) {
        await updateObstacle(selectedObstacleId, obstacle.points);
      }
      setIsDraggingObstacle(false);
      setDraggedObstacleOriginalPoints([]);
      setDragStartPos(null);
      return;
    }

    // 🎯 FIN RESIZE DESSIN
    if (isResizingDrawing && selectedDrawingIndex !== null) {
      const drawing = drawings[selectedDrawingIndex];
      if (roomId) {
        try {
          await updateDoc(doc(db, 'cartes', String(roomId), 'drawings', drawing.id), {
            points: drawing.points
          });
        } catch (error) {
          console.error("Error saving resize:", error);
        }
      }
      setIsResizingDrawing(false);
      setDraggedHandleIndex(null);
      return;
    }

    // 🎯 FIN DU DRAG & DROP DESSIN
    if (isDraggingDrawing && selectedDrawingIndex !== null) {
      const drawing = drawings[selectedDrawingIndex];
      // Check if actually moved
      const originalPoints = draggedDrawingOriginalPoints;
      // Simple check on first point (assuming rigid body)
      if (drawing.points && originalPoints && drawing.points.length > 0 && originalPoints.length > 0 &&
        (drawing.points[0].x !== originalPoints[0].x || drawing.points[0].y !== originalPoints[0].y)) {

        if (roomId) {
          try {
            await updateDoc(doc(db, 'cartes', String(roomId), 'drawings', drawing.id), {
              points: drawing.points
            });
          } catch (error) {
            console.error("Error updating drawing position:", error);
            // Revert ?
          }
        }
      }
      setIsDraggingDrawing(false);
      return;
    }

    // 🎯 FIN DU DRAG & DROP OBSTACLE
    if (isDraggingObstacle && draggedObstacleId && roomId) {
      const obs = obstacles.find(o => o.id === draggedObstacleId);
      if (obs) {
        // Check if changed
        const hasChanged = JSON.stringify(obs.points) !== JSON.stringify(draggedObstacleOriginalPoints);
        if (hasChanged) {
          try {
            await updateDoc(doc(db, 'cartes', String(roomId), 'obstacles', obs.id), {
              points: obs.points
            });
          } catch (e) {
            console.error("Error saving obstacle:", e);
            // Revert
            setObstacles(prev => prev.map(o => {
              if (o.id === draggedObstacleId) {
                return { ...o, points: draggedObstacleOriginalPoints };
              }
              return o;
            }));
          }
        }
      }

      setIsDraggingObstacle(false);
      setDraggedObstacleId(null);
      setDraggedObstacleOriginalPoints([]);
      return;
    }

    // 🎯 FIN DU DRAG BROUILLARD
    if (isFogDragging) {
      setIsFogDragging(false);
      // 🔥 FLUSH UPDATES TO FIREBASE
      await flushFogUpdates();
      return;
    }

    // 🎯 FIN DU DRAG & DROP NOTE - Priorité élevée
    if (isDraggingNote && draggedNoteIndex !== null) {
      const draggedNote = notes[draggedNoteIndex];

      // Vérifier si la position a vraiment changé
      const hasChanged = draggedNote.x !== draggedNoteOriginalPos.x ||
        draggedNote.y !== draggedNoteOriginalPos.y;

      if (hasChanged && roomId && draggedNote?.id) {
        try {
          // Sauvegarder la nouvelle position en Firebase
          await updateDoc(doc(db, 'cartes', String(roomId), 'text', draggedNote.id), {
            x: draggedNote.x,
            y: draggedNote.y
          });
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

    // 🎯 FIN DU DRAG & DROP OBJET (MULTI)
    if (isDraggingObject && draggedObjectIndex !== null && draggedObjectsOriginalPositions.length > 0) {
      if (roomId) {
        try {
          const updatePromises = draggedObjectsOriginalPositions.map(async (originalPos) => {
            const currentObj = objects[originalPos.index];
            const hasChanged = currentObj.x !== originalPos.x || currentObj.y !== originalPos.y;

            if (hasChanged && currentObj?.id) {
              await updateDoc(doc(db, 'cartes', String(roomId), 'objects', currentObj.id), {
                x: currentObj.x,
                y: currentObj.y
              });
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
      return;
    }

    // 🎯 FIN DU DRAG & DROP PERSONNAGE(S) - Priorité élevée
    if (isDraggingCharacter && draggedCharacterIndex !== null && draggedCharactersOriginalPositions.length > 0) {
      try {
        // Sauvegarder toutes les nouvelles positions en Firebase
        const updatePromises = draggedCharactersOriginalPositions.map(async (originalPos) => {
          const currentChar = characters[originalPos.index];
          const hasChanged = currentChar.x !== originalPos.x || currentChar.y !== originalPos.y;

          if (hasChanged && roomId && currentChar?.id) {
            // 🆕 RETOUR À LA COLLECTION CENTRALE
            // Tous les personnages sont dans 'characters', on a juste besoin de l'ID
            const charRef = doc(db, 'cartes', String(roomId), 'characters', currentChar.id);

            if (selectedCityId) {
              // Mode Ville : Sauvegarder dans positions.{cityId} (deep merge)
              await setDoc(charRef, {
                positions: {
                  [selectedCityId]: {
                    x: currentChar.x,
                    y: currentChar.y
                  }
                }
              }, { merge: true });
            } else {
              // Mode World Map : Sauvegarder dans la racine
              await updateDoc(charRef, {
                x: currentChar.x,
                y: currentChar.y
              });
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
      return;
    }

    // 🎯 FIN DE SÉLECTION PAR ZONE
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

      const totalFound =
        selectedChars.length +
        selectedObjs.length +
        selectedNotes.length +
        selectedDrawings.length +
        selectedObstacles.length +
        selectedMusicZonesIds.length;

      if (totalFound === 0) {
        // Clear all selections
        setSelectedCharacters([]);
        setSelectedObjectIndices([]);
        setSelectedNoteIndex(null);
        setSelectedDrawingIndex(null);
        setSelectedObstacleId(null);
        setSelectedMusicZoneIds([]);
      } else {
        const candidates: SelectionCandidates = {
          characters: selectedChars,
          objects: selectedObjs,
          notes: selectedNotes,
          drawings: selectedDrawings,
          obstacles: selectedObstacles,
          musicZones: selectedMusicZonesIds
        };

        // Determine if we need to show the menu
        const typesFound = [
          selectedChars.length > 0,
          selectedObjs.length > 0,
          selectedNotes.length > 0,
          selectedDrawings.length > 0,
          selectedObstacles.length > 0,
          selectedMusicZonesIds.length > 0
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

          if (selectedObstacles.length > 0) setSelectedObstacleId(selectedObstacles[0]);
          else setSelectedObstacleId(null);
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

    // 🎯 Fin du placement continu de brouillard (dans fogMode classique ou visibilityMode avec outil fog)
    if (isFogDragging && (fogMode || (visibilityMode && currentVisibilityTool === 'fog'))) {
      setIsFogDragging(false);
      setIsFogAddMode(true);
      setLastFogCell(null);
      return;
    }

    // 🎯 Fin du mode dessin normal - Sauvegarder le tracé
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
          const docRef = await addDoc(collection(db, 'cartes', String(roomId), 'drawings'), newDrawingData);
          setDrawings(prev => [...prev, { ...newDrawingData, id: docRef.id }]);
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





  // 🎯 SUPPRIMÉ : useEffect pour shadowOpacity


  // 🎯 SUPPRIMÉ : Mode donjon et fonctions associées

  const toggleFogMode = () => {
    setFogMode(!fogMode);
    setSelectedCharacterIndex(null);
    setSelectedNoteIndex(null);
  };

  // 🎯 NOUVELLE FONCTION : Gérer le changement du mode brouillard complet
  const handleFullMapFogChange = async (newValue: boolean) => {
    setFullMapFog(newValue);

    // Sauvegarder dans Firebase pour synchronisation via le hook unifié
    if (roomId) {
      try {
        await saveFullMapFog(newValue);
      } catch (error) {
        console.error('Erreur lors de la sauvegarde du mode brouillard complet:', error);
      }
    }
  };

  // 🎯 SUPPRIMÉ : toggleRevealMode (ancien système)




  const handleDeleteSelectedCharacters = async () => {
    if (selectedCharacters.length > 0 && roomId && isMJ) {
      // Collect valid characters to delete (objects, not just indices)
      const charsToDelete = selectedCharacters
        .map(index => characters[index])
        .filter(c => c && c.type !== 'joueurs');

      if (charsToDelete.length > 0) {
        // 1. Clear selection IMMEDIATELY
        setSelectedCharacters([]);

        // 2. Perform DB deletions
        const deletePromises = charsToDelete.map(async (char) => {
          if (char?.id) {
            await deleteDoc(doc(db, 'cartes', String(roomId), 'characters', char.id));
          }
        });

        await Promise.all(deletePromises);

        // 3. Update local state safely using IDs
        const deletedIds = charsToDelete.map((c: Character) => c.id);
        setCharacters(prev => prev.filter(c => !deletedIds.includes(c.id)));
      } else {
        // Clear selection if only players were selected (and ignored)
        setSelectedCharacters([]);
      }
    }
  };



  // 🎯 SUPPRIMÉ : Anciennes fonctions de brouillard (toggleClearFogMode, handleDeleteFog)

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.1, Math.min(5, zoom + delta));
    const zoomFactor = newZoom / zoom;

    if (zoomFactor === 1 || isNaN(zoomFactor)) return;

    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      const centerX = clientWidth / 2;
      const centerY = clientHeight / 2;

      setOffset((prevOffset) => ({
        x: prevOffset.x * zoomFactor + centerX * (zoomFactor - 1),
        y: prevOffset.y * zoomFactor + centerY * (zoomFactor - 1)
      }));
    } else {
      setOffset((prevOffset) => ({
        x: prevOffset.x * zoomFactor,
        y: prevOffset.y * zoomFactor
      }));
    }

    setZoom(newZoom);
  };

  const handleDeleteCharacter = async () => {
    if (characterToDelete && roomId) {
      if (characterToDelete?.id) {
        try {
          await deleteDoc(doc(db, 'cartes', String(roomId), 'characters', characterToDelete.id));
          setCharacters(characters.filter((char) => char.id !== characterToDelete.id));
          setSelectedCharacterIndex(null);
        } catch (error) {
          console.error("Erreur lors de la suppression du personnage :", error);
        }
      } else {
        console.error("ID du personnage introuvable pour la suppression.");
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
          await deleteDoc(doc(db, 'cartes', roomIdStr, 'text', noteToDelete.id));
          setNotes((prevNotes) => prevNotes.filter((n) => n.id !== noteToDelete.id));
        } catch (error) {
          console.error("Erreur lors de la suppression de la note :", error);
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
          await updateDoc(doc(db, 'cartes', roomId, 'text', noteToUpdate.id), {
            content: editingNote.text,
            color: editingNote.color
          });
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
    if (!db || !roomId) return;
    try {
      const drawingsRef = collection(db, 'cartes', String(roomId), 'drawings');
      const snapshot = await getDocs(drawingsRef);
      if (snapshot.empty) return;
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Error clearing drawings:', error);
    }
  };

  const clearFog = async () => {
    const emptyGrid = new Map<string, boolean>();
    setFogGrid(emptyGrid);
    if (roomId) {
      await saveFogGrid(emptyGrid);
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
      }
    } catch (error) {
      console.error("Error handling object action:", error);
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
      } else if (action === 'rename') {
        await updateDoc(doc(db, 'cartes', String(roomId), 'musicZones', zoneId), { name: value });
      } else if (action === 'updateVolume') {
        await updateDoc(doc(db, 'cartes', String(roomId), 'musicZones', zoneId), { volume: value });
      } else if (action === 'updateRadius') {
        await updateDoc(doc(db, 'cartes', String(roomId), 'musicZones', zoneId), { radius: value });
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
    setSelectedObstacleId(null);
    setSelectedMusicZoneIds([]);

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
        if (selectionCandidates.obstacles.length > 0) {
          setSelectedObstacleId(selectionCandidates.obstacles[0]);
        }
        break;
      case 'musicZones':
        setSelectedMusicZoneIds(selectionCandidates.musicZones);
        break;
    }

    setShowSelectionMenu(false);
    setSelectionCandidates(null);
  };

  // 🎯 RENDER CITY MAP (existing functionality)
  return (
    <div className="flex flex-col relative" ref={containerRef}>
      {/* 🎯 SELECTION MENU */}
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
      {/* 🆕 Bouton Retour à la World Map - UNIQUEMENT POUR LE MJ */}
      {/* 🆕 Bouton Retour à la World Map - UNIQUEMENT POUR LE MJ (DEPLACÉ EN HAUT À DROITE) */}
      {/* L'ancien emplacement en haut à gauche est supprimé pour Importer PNJ et Retour au Monde */}

      {/* 🎯 Contrôles de zoom flottants en haut à droite */}
      {/* 🎯 Contrôles de zoom flottants en haut à droite */}




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

      {/* 🎯 Object Context Menu */}
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

      {/* 🎯 Cone Configuration Dialog */}
      <ConeConfigDialog
        isOpen={coneConfigDialogOpen}
        onClose={() => setConeConfigDialogOpen(false)}
        onConfirm={(length, width) => {
          setConeWidth(width);
          setConeConfigDialogOpen(false);
        }}
        unitName={unitName}
      />

      {/* Styles pour l'animation de livre */}
      <style jsx global>{`
        @keyframes bookOpen {
          0% {
            opacity: 0;
            transform: perspective(2000px) rotateY(-90deg);
            transform-origin: right center; /* Changed to right center for right-side opening */
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
            transform: perspective(2000px) rotateY(0deg);
            transform-origin: right center;
          }
        }

        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>



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
        className={`w-full h-full flex-1 overflow-hidden border border-gray-300 ${isDraggingCharacter || isDraggingNote ? 'cursor-grabbing' :
          isDragging || isDraggingObject ? 'cursor-move' :
            panMode ? 'cursor-grab' :
              drawMode ? 'cursor-crosshair' :
                fogMode ? 'cursor-cell' : 'cursor-default'
          } relative`}
        style={{
          height: '100vh',
          userSelect: isDraggingCharacter || isDraggingNote || isDraggingObject ? 'none' : 'auto'
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

          // 🎯 CONFLICT RESOLUTION: Character Context Menu vs Tool interactions

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

            const hoveredCharIndex = characters.findIndex(char => {
              const charX = (char.x / imgWidth) * scaledWidth - offset.x + rect.left;
              const charY = (char.y / imgHeight) * scaledHeight - offset.y + rect.top;
              const clickRadius = char.type === 'joueurs' ? 30 * zoom : 20 * zoom;
              return Math.abs(charX - mouseX) < clickRadius && Math.abs(charY - mouseY) < clickRadius;
            });

            if (hoveredCharIndex !== -1) {
              // Cursor is over a character.
              // Prevent the Radial Menu (parent) from seeing this event.
              // The Character Context Menu mechanism (likely handleCanvasMouseDown right-click check) might handle it,
              // OR we need to trigger it here if it's not handled by 'contextmenu' event.

              // In existing code, handleCanvasMouseDown handles right-click detection explicitly for logic (like fog),
              // but `ContextMenuPanel` state is usually set there.

              // Let's ensure we stop propagation so RadialMenu doesn't open.
              e.stopPropagation();

              // Also, if the character right-click logic relies on 'mousedown', it has already fired.
              // If it relies on 'contextmenu', it might be on the canvas.

              // IMPORTANT: e.preventDefault() here would stop the browser native menu,
              // but we might WANT the custom Character Context Menu relative logic to run if it wasn't triggered by mousedown.
              // However, let's look at `handleCanvasMouseDown` again.
              // It handles `e.button === 2`? NOT explicitly for opening the character menu yet (it was mostly for fog).

              // To be safe: triggering character menu usually happens on clic.
              // Let's add the logic to OPEN the character menu here directly on contextmenu if generic right click didn't do it.

              const char = characters[hoveredCharIndex];
              if (char && char.id) {
                e.preventDefault(); // Stop native browser menu
                setContextMenuCharacterId(char.id);
                setContextMenuOpen(true);
              }
              return;
            }
          }
        }
        }
      >
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
              // 🎯 CALCUL DES OMBRES POUR MASQUER LES PNJs ET OBJETS (Côté Client seulement)
              let objectIsVisible = true;

              const activeShadows = precalculatedShadows?.shadows;
              const containingPolygons = precalculatedShadows?.polygonsContainingViewer;

              const objCenter = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 };

              // 1. Check Fog of War Grid (if active)
              // Only apply if not GM (or simulating player) OR if full map fog is on
              const effectiveIsMJLocal = isMJ && !playerViewMode;
              if (!effectiveIsMJLocal || fullMapFog) {
                if (fogMode || fullMapFog || fogGrid.size > 0) {
                  // We need to transform map coordinates to cell coordinates?
                  // isCellInFog takes (x, y, grid, cellSize). 
                  // IMPORTANT: isCellInFog expects coordinates in IMAGE space (which obj.x is).
                  if (isCellInFog(objCenter.x, objCenter.y, fogGrid, fogCellSize) && !fullMapFog) {
                    // If explicitly in fog cell and not full map fog (which is handled by calculateFogOpacity usually, 
                    // but for objects we just check if cell is revealed?)
                    // Wait, for Characters the logic is complex involving `calculateFogOpacity`.
                    // For objects, let's keep it simple: if cell is "fogged" (true in grid), it is HIDDEN?
                    // fogGrid stores REVEALED cells or FOGGED cells?
                    // ToggleFogCell: "if (newFogGrid.has(key)) newFogGrid.delete(key); else newFogGrid.set(key, true);"
                    // Usually "Fog of War" means black until revealed.
                    // But here it seems `fogGrid` stores where fog IS? Or where it is REMOVED?
                    // Looking at `calculateFogOpacity`: "if (!fullMapFog && !fogGrid.has(key)) return 0;" -> returns 0 opacity (visible).
                    // So fogGrid contains the fog cells?
                    // "if (opacity > 0) ... fillStyle black"
                    // So if `calculateFogOpacity(x, y)` > 0, then it's hidden.
                    // We don't have access to `calculateFogOpacity` easily here without recreating it or passing it down.
                    // However, we can check basic grid presence.

                    // Re-reading usage:
                    // `toggleFogCell` sets key to true.
                    // `renderFogLayer` iterates.

                    // Let's assume for now: if user draws fog, they want to HIDE things.
                    if (isCellInFog(objCenter.x, objCenter.y, fogGrid, fogCellSize)) {
                      // If cell is in fog list.
                      objectIsVisible = false;
                    }
                  }

                  // Full Map Fog handling: if enabled, everything is hidden unless revealed?
                  // We skip this for now to match current simple request. User said "currently it doesn't work".
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
                    pointerEvents: obj.isBackground && !isBackgroundEditMode ? 'none' : 'auto', // Allow interactions only if not background or in edit mode
                    cursor: isResizingObject ? 'nwse-resize' : (obj.isLocked && !isMJ ? 'default' : 'move'), // Change cursor if resizing or locked
                    zIndex: obj.isBackground ? 0 : 10 // Background objects lower in stack
                  }}
                  onMouseDown={(e) => {
                    // Prevent canvas from picking up this click
                    e.stopPropagation();

                    if (e.button === 0) {
                      // Tracking for click vs drag - ALWAYS set this even if locked
                      mouseClickStartRef.current = { x: e.clientX, y: e.clientY };

                      // 🆕 Empêcher le drag si objet verrouillé et utilisateur non-MJ
                      if (obj.isLocked && !isMJ) {
                        return;
                      }

                      // Select
                      if (!e.shiftKey) {
                        setSelectedObjectIndices([index]);
                      } else {
                        // Multi-select logic pending
                        setSelectedObjectIndices(prev => [...prev, index]);
                      }

                      // Initiate Drag (reuse existing state or logic if compatible)
                      setDragStart({ x: e.clientX, y: e.clientY });
                      setIsDraggingObject(true);
                      setDraggedObjectIndex(index);
                      setDraggedObjectOriginalPos({ x: obj.x, y: obj.y });

                      const originalPositions = selectedObjectIndices.includes(index) && selectedObjectIndices.length > 1
                        ? selectedObjectIndices.map(idx => ({ index: idx, x: objects[idx].x, y: objects[idx].y }))
                        : [{ index, x: obj.x, y: obj.y }];
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
                      objectFit: 'cover',
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
                        zIndex: 10
                      }}
                      onMouseDown={(e) => handleResizeStart(e, index)}
                    />
                  )}
                </div>
              )
            })}
          </div>
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

              const x = (char.x / imgWidth) * scaledWidth - offset.x;
              const y = (char.y / imgHeight) * scaledHeight - offset.y;

              let isVisible = true;
              const isInFog = fullMapFog || isCellInFog(char.x, char.y, fogGrid, fogCellSize);
              let effectiveVisibility = char.visibility;

              // 🆕 Vérifier la visibilité custom AVANT le fog
              if (!isCharacterVisibleToUser(char)) {
                effectiveVisibility = 'hidden';
              } else if (char.type !== 'joueurs' && char.visibility !== 'ally' && isInFog) {
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
                    isVisible = dist <= (viewer?.visibilityRadius ?? 100) * zoom;
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
                    return dist <= (viewer.visibilityRadius ?? 100) * zoom;
                  })();
                }
              }

              if (!isVisible) return null;

              const isPlayerCharacter = char.type === 'joueurs';
              const baseRadius = isPlayerCharacter ? 30 : 20;
              const charScale = char.scale || 1;
              const iconRadius = baseRadius * charScale * globalTokenScale * zoom;

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
                    borderRadius: '50%',
                    overflow: 'hidden'
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
                        display: 'block'
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <canvas
            ref={fgCanvasRef}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          />
        </div>
        {combatOpen && (
          <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center z-10">
            <div className="text-black p-6 rounded-lg shadow-lg w-1/3 h-2/5">
              <Combat
                attackerId={attackerId || ''}
                targetId={targetId || ''}
                onClose={() => setCombatOpen(false)}
              />
            </div>
          </div>
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
                        <span className="text-xs font-mono text-[#c0a080] bg-[#1c1c1c] px-2 py-1 rounded border border-gray-600 min-w-[3rem] text-center">
                          {Math.round(1 + ((editingCharacter?.visibilityRadius || 100) - 10) / 490 * 29)} c.
                        </span>
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

      {/* 🎯 PAN MODE OVERLAY */}
      {
        panMode && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/90 text-neutral-200 px-4 py-2 rounded-full border border-neutral-700 shadow-xl flex items-center gap-4 z-50 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Move className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-sm">Mode Déplacement</span>
            </div>
          </div>
        )
      }

      {/* 🎯 FOG MODE OVERLAY */}
      {
        fogMode && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/90 text-neutral-200 px-4 py-2 rounded-full border border-neutral-700 shadow-xl flex items-center gap-4 z-50 backdrop-blur-sm">
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





      {/* 🎯 CALIBRATION DIALOG */}
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

      {/* 🎯 GLOBAL SETTINGS DIALOG (Start) */}
      <Dialog open={showGlobalSettingsDialog} onOpenChange={setShowGlobalSettingsDialog}>
        <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] border-[#FFD700]">
          <DialogHeader>
            <DialogTitle>Paramètres de la Carte</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {isMJ && (
              <div className="bg-[#252525] p-3 rounded border border-[#333]">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>Échelle Globale des Pions</span>
                  <span>x{globalTokenScale.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={globalTokenScale}
                  onChange={(e) => setGlobalTokenScale(parseFloat(e.target.value))}
                  onMouseUp={() => updateGlobalTokenScale(globalTokenScale)}
                  onTouchEnd={() => updateGlobalTokenScale(globalTokenScale)}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}

            {/* ⚡ Performance Mode Selector */}
            <div className="bg-[#252525] p-3 rounded border border-[#333]">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>Mode Performance</span>
              </div>
              <div className="space-y-2">
                <div onClick={() => setPerformanceMode('high')} className={`cursor-pointer p-2 rounded flex items-center justify-between ${performanceMode === 'high' ? 'bg-[#c0a080] text-black' : 'bg-black/20 text-gray-400'}`}>
                  <span>Haute Qualité (Défaut)</span>
                  {performanceMode === 'high' && <Check className="w-4 h-4" />}
                </div>
                <div onClick={() => setPerformanceMode('eco')} className={`cursor-pointer p-2 rounded flex items-center justify-between ${performanceMode === 'eco' ? 'bg-[#c0a080] text-black' : 'bg-black/20 text-gray-400'}`}>
                  <span>Économie (30 FPS)</span>
                  {performanceMode === 'eco' && <Check className="w-4 h-4" />}
                </div>
                <div onClick={() => setPerformanceMode('static')} className={`cursor-pointer p-2 rounded flex items-center justify-between ${performanceMode === 'static' ? 'bg-[#c0a080] text-black' : 'bg-black/20 text-gray-400'}`}>
                  <span>Statique (Pas d'animations)</span>
                  {performanceMode === 'static' && <Check className="w-4 h-4" />}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* 🎯 GLOBAL SETTINGS DIALOG (End) */}

      <ContextMenuPanel
        character={contextMenuCharacterId ? characters.find(c => c.id === contextMenuCharacterId) || null : null}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false);
          setContextMenuCharacterId(null);
          setSelectedCharacterIndex(null); // Désélectionner aussi sur la map si on ferme le menu
        }}
        isMJ={isMJ}
        players={characters.filter(c => c.type === 'joueurs')} // 🆕 Liste des joueurs pour la sélection custom
        onAction={(action, characterId, value) => {
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
                setCombatOpen(true);
              } else {
                alert("Aucun personnage actif sélectionné pour attaquer (Tour du joueur)");
              }
            } else {
              if (persoId) {
                setAttackerId(persoId);
                setTargetId(characterId);
                setCombatOpen(true);
              }
            }
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
          }
        }}
      />

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


      {/* Background Loader Overlay */}
      {
        isBackgroundLoading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
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
          <div className="absolute top-24 left-24 z-50">
            <LayerControl layers={layers} onToggle={toggleLayer} />
          </div>
        )
      }

      {/* Background Selector */}
      <BackgroundSelector
        isOpen={showBackgroundSelector}
        onClose={() => setShowBackgroundSelector(false)}
        onSelectLocal={handleBackgroundSelectLocal}
        onUpload={handleBackgroundChange}
      />

      {/* 🎵 Music Control & Dialog */}
      {
        isMJ && (
          <>
            <div className="absolute top-24 left-4 z-50 flex flex-col gap-2">
              {/* Radial Menu replaces this button generally, but we keep it if needed or remove it? User asked to place from Radial Menu */
                /* Removing the button as requested to use Radial Menu "d'abord les placer depuis la menu radial" implies this is the primary way */
              }
            </div>

            <Dialog open={showMusicDialog} onOpenChange={setShowMusicDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter une zone musicale</DialogTitle>
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
                  <Button onClick={saveMusicZone}>Créer</Button>
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
              zIndex: 9999,
              pointerEvents: 'none'
            }}
            className="bg-black/90 text-white text-xs px-2 py-1 rounded shadow-xl border border-white/20"
          >
            {hoveredCondition.text}
          </div>
        )
      }

      {/* SCENE INVENTORY DRAWER */}
      <AnimatePresence>
        {viewMode === 'world' && (
          <CitiesManager
            onCitySelect={navigateToCity}
            roomId={roomId}
            onClose={() => setViewMode('city')}
            globalCityId={globalCityId}
          />
        )}
      </AnimatePresence>

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
