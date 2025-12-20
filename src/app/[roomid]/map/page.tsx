"use client"

import React, { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useGame } from '@/contexts/GameContext'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

import { X, Plus, Minus, Edit, Pencil, Eraser, CircleUserRound, Baseline, User, Grid, Cloud, CloudOff, ImagePlus, Trash2, Eye, EyeOff, ScanEye, Move, Hand, Square, Circle as CircleIcon, Slash, Ruler, MapPin, Heart, Shield, Zap, Dices, Sparkles, BookOpen, Flashlight, Info, Image as ImageIcon } from 'lucide-react'
import { auth, db, onAuthStateChanged, doc, getDocs, collection, onSnapshot, updateDoc, addDoc, deleteDoc, setDoc } from '@/lib/firebase'
import Combat from '@/components/(combat)/combat2';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ScrollArea } from "@/components/ui/scroll-area";
import CharacterSheet from '@/components/(fiches)/CharacterSheet';
import { Component as RadialMenu } from '@/components/ui/radial-menu';
import CitiesManager from '@/components/(worldmap)/CitiesManager';
import ContextMenuPanel from '@/components/(overlays)/ContextMenuPanel';
import { NPCTemplateDrawer } from '@/components/(personnages)/NPCTemplateDrawer';
import { PlaceNPCModal } from '@/components/(personnages)/PlaceNPCModal';
import { CreateNoteModal } from '@/components/(map)/CreateNoteModal';
import InfoComponent, { type InfoSection } from "@/components/(infos)/info";
import { type NPC } from '@/components/(personnages)/personnages';
import {
  type Obstacle,
  type Point as VisibilityPoint,
  drawShadows,
  drawObstacles,
  calculateShadowPolygons,
  isPointInPolygon,
} from '@/lib/visibility';
import { type ViewMode, type Point, type Character, type MapText as Text, type SavedDrawing, type NewCharacter, type Note } from './types';
import { getResizeHandles, isPointOnDrawing, renderDrawings, renderCurrentPath } from './drawings';
import { useFogManager, calculateDistance, getCellKey, isCellInFog, renderFogLayer } from './shadows';





export default function Component() {
  const params = useParams();
  const roomId = params.roomid as string;
  const { isMJ, persoId } = useGame();
  const [combatOpen, setCombatOpen] = useState(false);
  const [attackerId, setAttackerId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState('/placeholder.svg?height=600&width=800')
  const [bgImageObject, setBgImageObject] = useState<HTMLImageElement | null>(null);


  useEffect(() => {
    if (!backgroundImage) return;
    const img = new Image();
    img.src = backgroundImage;
    img.onload = () => setBgImageObject(img);
  }, [backgroundImage]);

  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1.4)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [characters, setCharacters] = useState<Character[]>([]);
  const [notes, setNotes] = useState<Text[]>([]);

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

  // 🎯 NOUVEAUX ÉTATS pour le drag & drop des notes
  const [isDraggingNote, setIsDraggingNote] = useState(false)
  const [draggedNoteIndex, setDraggedNoteIndex] = useState<number | null>(null)
  const [draggedNoteOriginalPos, setDraggedNoteOriginalPos] = useState({ x: 0, y: 0 })

  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number | null>(null);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  // 🎯 Context Menu State
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuCharacterId, setContextMenuCharacterId] = useState<string | null>(null);

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
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [drawings, setDrawings] = useState<SavedDrawing[]>([]);

  // 🎯 Drawing Tools State
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser' | 'line' | 'rectangle' | 'circle'>('pen');
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

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
  const [isCalibrating, setIsCalibrating] = useState(false); // Sub-mode of measureMode
  const [measureStart, setMeasureStart] = useState<Point | null>(null);
  const [measureEnd, setMeasureEnd] = useState<Point | null>(null);
  const [pixelsPerUnit, setPixelsPerUnit] = useState(50); // Default: 50 pixels = 1 unit
  const [unitName, setUnitName] = useState('m'); // Default unit
  const [calibrationDialogOpen, setCalibrationDialogOpen] = useState(false);
  const [tempCalibrationDistance, setTempCalibrationDistance] = useState('');

  // 🆕 VIEW MODE & CITY NAVIGATION STATE

  const [viewMode, setViewMode] = useState<ViewMode>('world'); // 'world' = world map, 'city' = city map
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null); // null = world map
  const [cities, setCities] = useState<any[]>([]); // Villes disponibles

  // 🆕 RANDOM STAT GENERATOR STATE
  const [difficulty, setDifficulty] = useState(3); // 1-5

  const generateRandomStats = () => {
    const level = newCharacter.niveau;
    const diffMultiplier = difficulty; // 1 to 5

    // Helper for random variation
    const vary = (base: number, variation: number) => {
      return Math.max(0, base + Math.floor(Math.random() * (variation * 2 + 1)) - variation);
    };

    setNewCharacter(prev => ({
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
  const [draggedObstacleOriginalPoints, setDraggedObstacleOriginalPoints] = useState<Point[]>([]);
  const [snapPoint, setSnapPoint] = useState<Point | null>(null);
  // États pour l'édition d'obstacles
  const [isDraggingObstaclePoint, setIsDraggingObstaclePoint] = useState(false);
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null);
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null);
  const [connectedPoints, setConnectedPoints] = useState<{ obstacleId: string, pointIndex: number }[]>([]);



  const {
    saveFogGrid,
    saveFullMapFog,
    toggleFogCell,
    addFogCellIfNew,
    calculateFogOpacity
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        INITializeFirebaseListeners(roomId);
      } else {
        setUserId(null);
      }
    });
    return () => unsubscribe();
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
            console.log('📍 Chargement fond de ville:', cityData.name, cityData.backgroundUrl);
            setBackgroundImage(cityData.backgroundUrl);
          } else {
            console.log('📍 Aucun fond pour la ville, utilisation du placeholder');
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

  // 🆕 CHARGER LES DONNÉES FILTRÉES PAR VILLE (depuis les collections globales)
  useEffect(() => {
    if (!roomId) return;

    const unsubscribers: (() => void)[] = [];

    // 1. CHARGER ET FILTRER LES PERSONNAGES
    const charactersRef = collection(db, 'cartes', roomId, 'characters');
    const charsUnsub = onSnapshot(charactersRef, (snapshot) => {
      const allChars: Character[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();

        // CRITÈRE DE FILTRAGE :
        // - Soit c'est un joueur ou allié (toujours visible partout)
        // - Soit c'est un PNJ lié à la ville actuelle
        const isGlobal = data.type === 'joueurs' || data.visibility === 'ally';
        const isForCurrentCity = data.cityId === selectedCityId;

        if (isGlobal || isForCurrentCity) {
          const img = new Image();
          if (data.type === 'joueurs') {
            img.src = data.imageURLFinal || data.imageURL2 || data.imageURL;
          } else {
            img.src = data.imageURL2 || data.imageURL;
          }
          allChars.push({
            id: doc.id,
            niveau: data.niveau || 1,
            name: data.Nomperso || '',
            x: data.x || 0,
            y: data.y || 0,
            image: img,
            visibility: data.visibility || 'hidden',
            visibilityRadius: parseFloat(data.visibilityRadius) || 100,
            type: data.type || 'pnj',
            PV: data.PV || 10,
            PV_Max: data.PV_Max || data.PV || 10, // Use PV as fallback if PV_Max is missing
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
            // cityId: data.cityId // Garder l'info
          });
        }
      });
      setCharacters(allChars);
      setLoading(false);
    });
    unsubscribers.push(charsUnsub);

    // 2. CHARGER ET FILTRER LES DESSINS
    const drawingsRef = collection(db, 'cartes', roomId, 'drawings');
    const drawingsUnsub = onSnapshot(drawingsRef, (snapshot) => {
      const drws: SavedDrawing[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Afficher seulement les dessins de la ville actuelle
        if (data.cityId === selectedCityId) {
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
        }
      });
      setDrawings(drws);
    });
    unsubscribers.push(drawingsUnsub);

    // 3. CHARGER ET FILTRER LES NOTES
    const notesRef = collection(db, 'cartes', roomId, 'text');
    const notesUnsub = onSnapshot(notesRef, (snapshot) => {
      const texts: Text[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Afficher seulement les notes de la ville actuelle
        if (data.cityId === selectedCityId) {
          texts.push({
            id: doc.id,
            text: data.content,
            x: data.x || 0,
            y: data.y || 0,
            color: data.color || 'yellow',
            fontSize: data.fontSize,
            fontFamily: data.fontFamily,
          });
        }
      });
      setNotes(texts);
    });
    unsubscribers.push(notesUnsub);

    // 4. CHARGER LE BROUILLARD (Stocké par ID spécifique ex: fog_cityId)
    // Pour le brouillard, comme c'est un document unique souvent lourd, on utilise des docs séparés dans la même collection
    const fogDocId = selectedCityId ? `fog_${selectedCityId}` : 'fogData';
    const fogRef = doc(db, 'cartes', roomId, 'fog', fogDocId);

    console.log(`🔌 Initialisation listener brouillard pour: ${fogDocId}`);

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
    const obstaclesUnsub = onSnapshot(obstaclesRef, (snapshot) => {
      const obs: Obstacle[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Afficher seulement les obstacles de la ville actuelle
        if (data.cityId === selectedCityId) {
          obs.push({
            id: docSnap.id,
            type: data.type || 'wall',
            points: data.points || [],
            color: data.color,
            opacity: data.opacity,
          });
        }
      });

      setObstacles(obs);
    });
    unsubscribers.push(obstaclesUnsub);

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [roomId, selectedCityId]);




  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bgImageObject) return;
    const ctx = canvas.getContext('2d')!;
    const image = bgImageObject;

    const sizeMultiplier = 1.5;
    const containerWidth = containerRef.current?.clientWidth || canvas.width;
    const containerHeight = containerRef.current?.clientHeight || canvas.height;
    canvas.width = containerWidth * sizeMultiplier;
    canvas.height = containerHeight * sizeMultiplier;
    ctx.scale(sizeMultiplier, sizeMultiplier);
    drawMap(ctx, image, containerWidth, containerHeight); // Pass container dimensions
  }, [bgImageObject, showGrid, zoom, offset, characters, notes, selectedCharacterIndex, selectedNoteIndex, drawings, currentPath, fogGrid, showFogGrid, fullMapFog, isSelectingArea, selectionStart, selectionEnd, selectedCharacters, isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions, isDraggingNote, draggedNoteIndex, isFogDragging, playerViewMode, isMJ, measureMode, measureStart, measureEnd, pixelsPerUnit, unitName, isCalibrating, obstacles, visibilityMode, selectedObstacleId, currentObstaclePoints, snapPoint, currentVisibilityTool, isDraggingObstaclePoint, isDraggingObstacle]);


  // 🎯 NPC Template Drag & Drop Handlers
  const handleTemplateDragStart = (template: NPC) => {
    console.log('🎯 Drag started:', template.Nomperso)
    setDraggedTemplate(template)
  }

  const handleCanvasDrop = (e: React.DragEvent) => {
    console.log('📍 Drop event triggered')
    e.preventDefault()

    const canvas = canvasRef.current
    const image = bgImageObject
    if (!canvas || !image) {
      console.log('❌ No canvas ref or image')
      return
    }

    // Get template data from dataTransfer
    const templateData = e.dataTransfer.getData('application/json')
    console.log('📦 Template data:', templateData ? 'Found' : 'Not found')

    if (!templateData) {
      console.log('❌ No template data in drop event')
      return
    }

    try {
      const template = JSON.parse(templateData) as NPC
      console.log('✅ Template parsed:', template.Nomperso)

      const rect = canvas.getBoundingClientRect()
      const containerWidth = containerRef.current?.clientWidth || rect.width
      const containerHeight = containerRef.current?.clientHeight || rect.height

      // Calcul de l'échelle et des dimensions scalées (même logique que drawMap)
      const scale = Math.min(containerWidth / image.width, containerHeight / image.height)
      const scaledWidth = image.width * scale * zoom
      const scaledHeight = image.height * scale * zoom

      // IMPORTANT: Utiliser la même formule que handleCanvasMouseMove (lignes 2425-2426)
      // Le canvas utilise ctx.scale(sizeMultiplier) donc pas besoin de diviser par sizeMultiplier
      const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width
      const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height

      console.log('📍 Drop position:', {
        x: x.toFixed(2),
        y: y.toFixed(2),
        zoom,
        offset,
        clientX: e.clientX,
        clientY: e.clientY,
        scaledWidth: scaledWidth.toFixed(2),
        scaledHeight: scaledHeight.toFixed(2),
        imageWidth: image.width,
        imageHeight: image.height
      })

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

  const handlePlaceConfirm = async (config: { nombre: number; visibility: 'visible' | 'hidden' | 'ally' }) => {
    if (!draggedTemplate || !dropPosition) return

    console.log('🎯 Placement de', config.nombre, 'PNJ(s) à la position:', dropPosition)

    try {
      const charactersRef = collection(db, `cartes/${roomId}/characters`)

      // Create instances based on nombre
      for (let i = 0; i < config.nombre; i++) {
        const offsetX = i * 50 // Offset each instance slightly
        const offsetY = i * 50

        const finalX = dropPosition.x + offsetX
        const finalY = dropPosition.y + offsetY

        console.log(`📍 Placement PNJ ${i + 1}/${config.nombre} à x:${finalX.toFixed(2)}, y:${finalY.toFixed(2)}`)

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
          visibility: config.visibility,
          visibilityRadius: 100, // Default visibility radius
          cityId: selectedCityId, // Associate with current city
          x: finalX,
          y: finalY,
          createdAt: new Date()
        })
      }

      console.log(`✅ ${config.nombre} NPC(s) placé(s) sur la carte`)
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
    { id: 2, label: 'Ajouter Texte', icon: Baseline },
    { id: 3, label: 'Dessiner', icon: Pencil },
    { id: 4, label: 'Visibilité', icon: Eye }, // 🔦 Mode unifié brouillard + obstacles
    { id: 5, label: showGrid ? 'Masquer grille' : 'Afficher grille', icon: Grid },
    { id: 6, label: 'Effacer dessins', icon: Trash2 },
    { id: 7, label: 'Changer fond', icon: ImagePlus },
    { id: 8, label: 'Déplacer carte', icon: Move },
    { id: 9, label: playerViewMode ? 'Vue MJ' : 'Vue Joueur', icon: playerViewMode ? ScanEye : User },
    { id: 10, label: 'Mesurer', icon: Ruler },
  ] : [
    { id: 1, label: 'Ajouter Texte', icon: Baseline },
    { id: 2, label: 'Dessiner', icon: Pencil },
    { id: 3, label: showGrid ? 'Masquer grille' : 'Afficher grille', icon: Grid },
    { id: 4, label: 'Déplacer carte', icon: Move },
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
      console.log(`🔦 Obstacle sauvegardé: ${docRef.id}`);
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
        // Pour le MJ : ID 3 (Dessin), ID 4 (Visibilité), ID 8 (Déplacement), ID 10 (Mesure) sont incompatibles
        if ([3, 4, 8, 10].includes(toolId)) {
          if (toolId !== 3 && drawMode) setDrawMode(false);
          if (toolId !== 4 && visibilityMode) {
            setVisibilityMode(false);
            setIsDrawingObstacle(false);
            setCurrentObstaclePoints([]);
            setFogMode(false);
          }
          if (toolId !== 8 && panMode) setPanMode(false);
          if (toolId !== 10 && measureMode) setMeasureMode(false);
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
          setIsCalibrating(false);
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
      }
    }
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

    // 🆕 Sauvegarder la ville actuelle dans Firebase (pour synchroniser tous les joueurs)
    if (roomId && isMJ) {

      await updateDoc(doc(db, 'cartes', roomId, 'settings', 'general'), {
        currentCityId: cityId,
      });
    }
  };

  const navigateToWorldMap = async () => {
    // Limiter la navigation à la world map au MJ uniquement
    if (!isMJ) {

      return;
    }

    setSelectedCityId(null);
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
    // Le chargement du fond est maintenant géré par un useEffect séparé (voir ligne ~165)

    // Écouter le personnage actif (tour_joueur)
    const settingsRef = doc(db, 'cartes', room.toString(), 'settings', 'general');
    onSnapshot(settingsRef, (doc) => {
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

          setSelectedCityId(data.currentCityId);
          setViewMode('city');
        } else if (!isMJ) {
          // Si pas de ville définie et qu'on n'est pas MJ, on reste sur une vue par défaut

        }
      }
    });

    // 🆕 Charger les villes pour la world map
    const citiesRef = collection(db, 'cartes', room.toString(), 'cities');
    onSnapshot(citiesRef, (snapshot) => {
      const loadedCities: any[] = [];
      snapshot.forEach((doc) => {
        loadedCities.push({ id: doc.id, ...doc.data() });
      });
      setCities(loadedCities);
    });

    // Charger le brouillard
    const fogRef = doc(db, 'cartes', room.toString(), 'fog', 'fogData');
    onSnapshot(fogRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        // 🎯 NOUVEAU : Charger la grille de brouillard depuis Firebase
        const gridMap = new Map<string, boolean>();
        if (data.grid) {
          Object.entries(data.grid).forEach(([key, value]) => {
            gridMap.set(key, value as boolean);
          });
        }
        setFogGrid(gridMap);

        // 🎯 CHARGER le mode brouillard complet depuis Firebase
        if (data.fullMapFog !== undefined) {
          setFullMapFog(data.fullMapFog);
        }
      }
    });
  };



  // 🎯 NOUVELLE FONCTION : Vérifier si un personnage est visible pour l'utilisateur actuel
  const isCharacterVisibleToUser = (char: Character): boolean => {
    // Le MJ en mode normal voit toujours tout
    const effectiveIsMJ = isMJ && !playerViewMode;
    if (effectiveIsMJ) return true;

    // Vérifier si le personnage est dans le brouillard
    const isInFog = fullMapFog || isCellInFog(char.x, char.y, fogGrid, fogCellSize);

    // Déterminer la visibilité effective (les PNJ dans le brouillard deviennent cachés)
    let effectiveVisibility = char.visibility;
    if (char.type !== 'joueurs' && char.visibility !== 'ally' && isInFog) {
      effectiveVisibility = 'hidden';
    }

    // Les alliés sont toujours visibles
    if (char.visibility === 'ally') {
      return true;
    }

    // Les personnages cachés ne sont visibles que s'ils sont dans le rayon de vision d'un joueur/allié
    if (effectiveVisibility === 'hidden') {
      const containerRef_current = containerRef.current;
      const canvasRef_current = canvasRef.current;
      if (!containerRef_current || !canvasRef_current || !bgImageObject) return false;

      const rect = canvasRef_current.getBoundingClientRect();
      const containerWidth = containerRef_current.clientWidth || rect.width;
      const containerHeight = containerRef_current.clientHeight || rect.height;
      const image = bgImageObject;

      const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
      const scaledWidth = image.width * scale * zoom;
      const scaledHeight = image.height * scale * zoom;

      const charScreenX = (char.x / image.width) * scaledWidth - offset.x;
      const charScreenY = (char.y / image.height) * scaledHeight - offset.y;

      // Vérifier si dans le rayon de vision de SON joueur ou d'un allié
      return characters.some((player) => {
        const playerScreenX = (player.x / image.width) * scaledWidth - offset.x;
        const playerScreenY = (player.y / image.height) * scaledHeight - offset.y;
        return (
          (player.id === persoId || player.visibility === 'ally') &&
          calculateDistance(charScreenX, charScreenY, playerScreenX, playerScreenY) <= player.visibilityRadius * zoom
        );
      });
    }

    // Sinon, visible
    return true;
  };





  const drawMap = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, containerWidth: number, containerHeight: number) => {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
    const scaledWidth = image.width * scale * zoom;
    const scaledHeight = image.height * scale * zoom;

    // Fonction de transformation des coordonnées map -> screen
    const transformPoint = (p: Point): Point => ({
      x: (p.x / image.width) * scaledWidth - offset.x,
      y: (p.y / image.height) * scaledHeight - offset.y,
    });

    // Draw background image
    ctx.drawImage(image, -offset.x, -offset.y, scaledWidth, scaledHeight);

    // Draw grid if enabled
    if (showGrid) {
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
    notes.forEach((note, index) => {
      const x = (note.x / image.width) * scaledWidth - offset.x;
      const y = (note.y / image.height) * scaledHeight - offset.y;
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
    // Draw each saved drawing path
    // Draw each saved drawing path
    if (drawings && Array.isArray(drawings)) {
      renderDrawings(
        ctx,
        drawings,
        transformPoint,
        selectedDrawingIndex,
        image.width,
        image.height,
        zoom,
        offset,
        scaledWidth,
        scaledHeight
      );
    }

    // 🎯 Optionnel : Dessiner les cercles de visibilité des joueurs et alliés (pour debug)
    // En mode Vue Joueur, le MJ ne voit pas les cercles de debug
    if (isMJ && !playerViewMode && showFogGrid) {
      characters.forEach(character => {
        if ((character.type === 'joueurs' || character.visibility === 'ally') && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
          const playerScreenX = (character.x / image.width) * scaledWidth - offset.x;
          const playerScreenY = (character.y / image.height) * scaledHeight - offset.y;
          const radiusScreen = (character.visibilityRadius / image.width) * scaledWidth;

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
    renderFogLayer(
      ctx,
      offset,
      scaledWidth,
      scaledHeight,
      image.width,
      image.height,
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

    // 🔦 SHADOW CASTING - Seulement pour les JOUEURS (pas le MJ)
    // Le MJ voit tout, pas besoin de calculer les ombres
    if (hasObstacles && !effectiveIsMJ) {
      // Trouver le personnage du joueur
      let viewerPosition: Point | null = null;

      for (const character of characters) {
        if ((character.id === persoId || character.visibility === 'ally') &&
          character.x !== undefined && character.y !== undefined) {
          viewerPosition = { x: character.x, y: character.y };
          break;
        }
      }

      if (viewerPosition) {
        const mapBounds = { width: image.width, height: image.height };

        // Dessiner les ombres avec une opacité fixe (pas de superposition)
        drawShadows(
          ctx,
          viewerPosition,
          obstacles,
          mapBounds,
          1.0, // Opacité 100% - les joueurs ne voient rien derrière les obstacles
          transformPoint
        );
      }
    }

    // 🔦 DESSINER LES OBSTACLES (visible seulement pour le MJ en mode édition)
    if (visibilityMode || (effectiveIsMJ && obstacles.length > 0)) {
      drawObstacles(ctx, obstacles, transformPoint, {
        strokeColor: visibilityMode ? 'rgba(255, 100, 100, 0.9)' : 'rgba(255, 100, 100, 0.4)',
        fillColor: visibilityMode ? 'rgba(255, 100, 100, 0.3)' : 'rgba(255, 100, 100, 0.1)',
        strokeWidth: 2,
        showHandles: visibilityMode,
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

    // 🎯 Dessiner la zone de sélection en cours
    if (isSelectingArea && selectionStart && selectionEnd) {
      const startX = (selectionStart.x / image.width) * scaledWidth - offset.x;
      const startY = (selectionStart.y / image.height) * scaledHeight - offset.y;
      const endX = (selectionEnd.x / image.width) * scaledWidth - offset.x;
      const endY = (selectionEnd.y / image.height) * scaledHeight - offset.y;

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

      // Afficher les dimensions de la zone
      if (rectWidth > 50 && rectHeight > 20) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(rectX + 5, rectY + 5, 100, 20);
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.fillText(`${Math.round(rectWidth)}×${Math.round(rectHeight)}`, rectX + 10, rectY + 18);
      }
    }

    // 🎯 CALCUL DES OMBRES POUR MASQUER LES PNJs (Côté Client seulement)
    // Si un PNJ est dans l'ombre du joueur (ou allié), il ne doit pas être affiché, même s'il est techniquement "visible"
    let activeShadowsForFiltering: Point[][] | null = null;

    if (!effectiveIsMJ && obstacles.length > 0) {
      for (const char of characters) {
        if ((char.id === persoId || char.visibility === 'ally') && char.x !== undefined && char.y !== undefined) {
          activeShadowsForFiltering = calculateShadowPolygons({ x: char.x, y: char.y }, obstacles, { width: image.width, height: image.height });
          break;
        }
      }
    }

    // Draw each character
    characters.forEach((char, index) => {
      const x = (char.x / image.width) * scaledWidth - offset.x;
      const y = (char.y / image.height) * scaledHeight - offset.y;

      let isVisible = true;

      // 🎯 Vérifier si le personnage est masqué par une ombre (uniquement pour les joueurs)
      if (activeShadowsForFiltering && char.type !== 'joueurs' && char.visibility !== 'ally') {
        const charPos = { x: char.x, y: char.y };
        for (const shadow of activeShadowsForFiltering) {
          if (isPointInPolygon(charPos, shadow)) {
            isVisible = false;
            break;
          }
        }
        if (!isVisible) return; // Ne pas dessiner si dans l'ombre
      }

      // 🎯 Vérifier si le personnage est dans le brouillard
      const isInFog = fullMapFog || isCellInFog(char.x, char.y, fogGrid, fogCellSize);

      // 🎯 Pour les PNJ (non joueurs et non alliés) : s'ils sont dans le brouillard, ils deviennent automatiquement cachés
      let effectiveVisibility = char.visibility;
      if (char.type !== 'joueurs' && char.visibility !== 'ally' && isInFog) {
        effectiveVisibility = 'hidden';
      }

      // Les alliés sont toujours visibles (même dans le brouillard complet)
      if (char.visibility === 'ally') {
        isVisible = true;
      }
      // Les personnages cachés (ou cachés par le brouillard) ne sont visibles que pour le MJ (en mode normal) ou s'ils sont dans le rayon de vision d'un joueur ou allié
      else if (effectiveVisibility === 'hidden') {
        isVisible = effectiveIsMJ || characters.some((player) => {
          const playerX = (player.x / image.width) * scaledWidth - offset.x;
          const playerY = (player.y / image.height) * scaledHeight - offset.y;
          return (
            (player.id === persoId || player.visibility === 'ally') &&
            calculateDistance(x, y, playerX, playerY) <= player.visibilityRadius * zoom
          );
        });
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
        const isPlayerCharacter = char.type === 'joueurs';
        const iconRadius = isPlayerCharacter ? 30 * zoom : 20 * zoom;
        const borderRadius = isPlayerCharacter ? 32 * zoom : 22 * zoom;

        // Draw character border circle
        ctx.beginPath();
        ctx.arc(x, y, borderRadius, 0, 2 * Math.PI);
        ctx.stroke();

        // Draw character icon
        if (char.image) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, iconRadius, 0, 2 * Math.PI);
          ctx.clip();
          ctx.drawImage(char.image, x - iconRadius, y - iconRadius, iconRadius * 2, iconRadius * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = 'red';
          ctx.beginPath();
          ctx.arc(x, y, iconRadius, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Draw discreet level badge at the bottom-right of the character icon
        const badgeRadius = 8 * zoom;  // Smaller and more discreet badge
        const badgeOffsetMultiplier = isPlayerCharacter ? 24 : 16; // Plus loin pour les personnages joueurs
        const badgeX = x + badgeOffsetMultiplier * zoom;
        const badgeY = y + badgeOffsetMultiplier * zoom;

        // Set badge color: Red if it's the player's character, Green for allies, Blue for 'joueurs', Orange for others
        ctx.fillStyle = char.id === persoId
          ? 'rgba(255, 0, 0, 1)'             // Red for the player's character
          : char.visibility === 'ally'
            ? 'rgba(0, 255, 0, 1)'             // Green for allies
            : char.type === 'joueurs'
              ? 'rgba(0, 0, 255, 1)'             // Blue for 'joueurs'
              : 'rgba(255, 165, 0, 1)';          // Orange for other characters
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
        ctx.fill();

        // Draw the level number inside the badge
        ctx.fillStyle = 'white';
        ctx.font = `${8 * zoom}px Arial`;  // Smaller font size for the discreet badge
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${char.niveau}`, badgeX, badgeY);

        /**
         * 🎯 RENDU DES NOMS ET BARRES DE VIE
         * - Nom : Visible au survol ou si sélectionné (tout le monde)
         * - Barre de Vie : Visible POUr le MJ (isMJ) et pour le propriétaire du perso (persoId)
         */
        const isHovered = false; // TODO: Ajouter la détection de survol si nécessaire plus tard
        const isSelected = index === selectedCharacterIndex;

        // 1. RENDU DU NOM
        // Le nom s'affiche si : sélectionné OU MJ (toujours visible pour MJ pour identifier)
        if (isSelected || (isMJ && !playerViewMode)) {
          const nameY = y + borderRadius + (15 * zoom);

          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.strokeStyle = borderColor; // Rappel de la couleur de faction/état

          // Fond du nom
          const fontSize = 12 * zoom;
          ctx.font = `bold ${fontSize}px sans-serif`;
          const textMetrics = ctx.measureText(char.name);
          const textPadding = 4 * zoom;
          const textBgWidth = textMetrics.width + (textPadding * 2);
          const textBgHeight = fontSize + (textPadding * 2);

          ctx.beginPath();
          ctx.roundRect(x - (textBgWidth / 2), nameY - (textBgHeight / 2), textBgWidth, textBgHeight, 4 * zoom);
          ctx.fill();
          // Ligne fine colorée sous le nom pour rappel de faction
          ctx.lineWidth = 1 * zoom;
          ctx.stroke();

          // Texte du nom
          ctx.fillStyle = 'white';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(char.name, x, nameY);
        }

        // 2. RENDU DE LA BARRE DE VIE (HP BAR)
        // Visible pour le MJ (sauf mode vue joueur) OU pour le propriétaire
        const canSeeHP = (isMJ && !playerViewMode) || char.id === persoId;

        if (canSeeHP && char.PV !== undefined) {
          // Valeurs par défaut si PV Max non défini (on suppose 100% si pas de max, ou on estime)
          // Idéalement il faudrait PV_Max dans le type Character. Pour l'instant on va utiliser une logique simple
          // Si PV > 0, on affiche. On suppose un max basé sur le PV actuel si c'est un PNJ simple, 
          // ou on essaie de récupérer le max si disponible.
          // Note: Le type Character a PV mais pas toujours PV_Max explicite ici. 
          // On va supposer que PV est la vie ACTUELLE.

          // Pour l'affichage "Barre", il nous faut un Max. 
          // Hack temporaire : Si c'est un PNJ, on considère que ses PV initiaux étaient le Max s'ils ne sont pas stockés.
          // Mais ici on n'a que "PV". On va afficher une barre de vie proportionnelle ou juste le chiffre pour le MJ.

          // Amélioration : Barre de vie standardisée
          const barWidth = 40 * zoom;
          const barHeight = 6 * zoom;
          const barY = y - borderRadius - (10 * zoom); // Au dessus du token
          const currentPV = char.PV || 0;
          const maxPV = char.PV_Max || char.PV || 100; // Fallback to current PV or 100 if undefined
          const normalizedHealth = Math.max(0, Math.min(100, (currentPV / maxPV) * 100));

          // 1. Fond de la barre (Gris sombre/Noir)
          ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
          ctx.beginPath();
          ctx.roundRect(x - (barWidth / 2), barY, barWidth, barHeight, 3 * zoom);
          ctx.fill();

          // 2. Barre de vie colorée (HSL dynamic)
          // 120 (Green) -> 0 (Red)
          const hue = (normalizedHealth / 100) * 120;
          ctx.fillStyle = `hsl(${hue}, 100%, 45%)`;
          ctx.beginPath();
          // Clip width based on health %
          const healthWidth = (normalizedHealth / 100) * barWidth;
          if (healthWidth > 0) {
            ctx.roundRect(x - (barWidth / 2), barY, healthWidth, barHeight, 3 * zoom);
            ctx.fill();
          }

          // 3. Texte des PV (Centré)
          ctx.fillStyle = 'white';
          ctx.shadowColor = 'black';
          ctx.shadowBlur = 2;
          ctx.font = `bold ${8 * zoom}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const textY = barY + (barHeight / 2) - (1 * zoom); // Slight adjustment for vertical centering
          ctx.fillText(`${currentPV} / ${maxPV}`, x, textY);
          ctx.shadowBlur = 0; // Reset shadow
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
        ctx.arc(x, y, char.visibilityRadius * zoom, 0, 2 * Math.PI);
        ctx.stroke();
      }

      // Draw visibility radius outline for allies when selected (MJ only)
      if (char.visibility === 'ally' && index === selectedCharacterIndex && isMJ) {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)'; // Bright green outline
        ctx.lineWidth = 2 * zoom;
        ctx.beginPath();
        ctx.arc(x, y, char.visibilityRadius * zoom, 0, 2 * Math.PI);
        ctx.stroke();
      }
    });

    // 🎯 DRAW MEASUREMENT RULER
    if (measureMode && measureStart) {
      // Draw a line from start to current mouse position (measureEnd)
      // If measureEnd is null, we might be just starting click, so nothing to draw yet or draw point.
      const p1 = measureStart;
      const p2 = measureEnd;

      if (p1 && p2) {
        const x1 = (p1.x / image.width) * scaledWidth - offset.x;
        const y1 = (p1.y / image.height) * scaledHeight - offset.y;
        const x2 = (p2.x / image.width) * scaledWidth - offset.x;
        const y2 = (p2.y / image.height) * scaledHeight - offset.y;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#FFD700'; // Gold
        ctx.lineWidth = 3 * zoom;
        ctx.setLineDash([15, 10]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw Endpoints
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x1, y1, 5 * zoom, 0, 2 * Math.PI);
        ctx.arc(x2, y2, 5 * zoom, 0, 2 * Math.PI);
        ctx.fill();

        // Draw Label
        // Calculate pixel distance
        const pixelDist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const unitDist = pixelDist / pixelsPerUnit;
        const text = isCalibrating
          ? `Calibration: ${pixelDist.toFixed(0)} px`
          : `${unitDist.toFixed(1)} ${unitName}`;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        ctx.font = `bold ${14 * zoom}px Arial`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const textMetrics = ctx.measureText(text);
        const padding = 6 * zoom;

        ctx.fillRect(midX - textMetrics.width / 2 - padding, midY - 25 * zoom, textMetrics.width + padding * 2, 30 * zoom);

        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, midX, midY - 10 * zoom);
      } else if (p1 && !p2) {
        // Draw just the start point
        const x1 = (p1.x / image.width) * scaledWidth - offset.x;
        const y1 = (p1.y / image.height) * scaledHeight - offset.y;

        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(x1, y1, 7 * zoom, 0, 2 * Math.PI);
        ctx.fill();

        // Draw a small label
        ctx.font = `bold ${12 * zoom}px Arial`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        const text = 'Click to set end point';
        const textMetrics = ctx.measureText(text);
        const padding = 6 * zoom;

        ctx.fillRect(x1 - textMetrics.width / 2 - padding, y1 - 35 * zoom, textMetrics.width + padding * 2, 25 * zoom);

        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x1, y1 - 22 * zoom);
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


  const handleCharacterSubmit = async () => {
    // Legacy function - kept just in case but shouldn't be used with NPCManager
  };





  // 🎯 CALIBRATION SUBMIT
  const handleCalibrationSubmit = async () => {
    const distanceVal = parseFloat(tempCalibrationDistance);
    if (!isNaN(distanceVal) && distanceVal > 0 && measureStart && measureEnd && roomId) {
      // Calculate pixel distance
      const pixelDist = calculateDistance(measureStart.x, measureStart.y, measureEnd.x, measureEnd.y);
      const newPixelsPerUnit = pixelDist / distanceVal;

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
        setNewCharacter((prevCharacter) => ({
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
          const centerX = (container.clientWidth / 2 - offset.x) / zoom;
          const centerY = (container.clientHeight / 2 - offset.y) / zoom;

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



  const handleCanvasMouseDown = async (e: React.MouseEvent<Element>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Stocker quel bouton de souris est pressé (0 = gauche, 1 = milieu, 2 = droit)
    setMouseButton(e.button);

    const containerWidth = containerRef.current?.getBoundingClientRect().width || rect.width;
    const containerHeight = containerRef.current?.getBoundingClientRect().height || rect.height;
    if (!bgImageObject) return;
    const image = bgImageObject;
    if (image) {
      const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
      const scaledWidth = image.width * scale * zoom;
      const scaledHeight = image.height * scale * zoom;
      const clickX = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width;
      const clickY = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height;


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

        // 🎯 MODE DÉPLACEMENT DE CARTE - Priorité élevée
        if (panMode) {
          setIsDragging(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          return;
        }


        // 🔦 MODE VISIBILITÉ - MODE EDIT (sélection et manipulation d'obstacles)
        if (visibilityMode && currentVisibilityTool === 'edit') {
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
                    obs.points.forEach((p, idx) => {
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
        if (fogMode) {
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
        if (drawMode) {
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
        const clickedCharIndex = characters.findIndex(char => {
          const charX = (char.x / image.width) * scaledWidth - offset.x;
          const charY = (char.y / image.height) * scaledHeight - offset.y;
          const clickRadius = char.type === 'joueurs' ? 30 * zoom : 20 * zoom;
          return Math.abs(charX - e.clientX + rect.left) < clickRadius && Math.abs(charY - e.clientY + rect.top) < clickRadius;
        });

        const clickedNoteIndex = notes.findIndex(note => {
          const noteX = (note.x / image.width) * scaledWidth - offset.x;
          const noteY = (note.y / image.height) * scaledHeight - offset.y;

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
        });

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
            const handleX = (handle.x / image.width) * scaledWidth - offset.x;
            const handleY = (handle.y / image.height) * scaledHeight - offset.y;
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
        } else if (clickedDrawingIndex !== -1) {
          // 🎯 SELECTION DESSIN
          setSelectedDrawingIndex(clickedDrawingIndex);
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedFogIndex(null);
          setSelectedCharacters([]);

          setIsDraggingDrawing(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          // Clone points to avoid reference issues
          const pointsCopy = drawings[clickedDrawingIndex].points.map(p => ({ ...p }));
          setDraggedDrawingOriginalPoints(pointsCopy);

        } else if (clickedFogIndex !== -1) {
          setSelectedFogIndex(clickedFogIndex);
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedCharacters([]);
          setSelectedDrawingIndex(null);
        } else {
          // Clic sur zone vide : Commencer une sélection par zone
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedFogIndex(null);
          setSelectedCharacters([]);
          setSelectedDrawingIndex(null);
          setContextMenuOpen(false);

          setSelectionStart({ x: clickX, y: clickY });
          setIsSelectingArea(true);
        }
      } // Fin du clic gauche
    };
  };

  const handleCanvasDoubleClick = (e: React.MouseEvent<Element>) => {
    if (!bgImageObject) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const containerWidth = containerRef.current?.clientWidth || rect.width
    const containerHeight = containerRef.current?.clientHeight || rect.height

    const image = bgImageObject
    const scale = Math.min(containerWidth / image.width, containerHeight / image.height)
    const scaledWidth = image.width * scale * zoom
    const scaledHeight = image.height * scale * zoom
    const clickX = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width
    const clickY = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height

    // Check if double-clicked on a character
    const clickedCharIndex = characters.findIndex((char) => {
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

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const containerWidth = containerRef.current?.clientWidth || rect.width;
    const containerHeight = containerRef.current?.clientHeight || rect.height;

    const image = bgImageObject;
    const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
    const scaledWidth = image.width * scale * zoom;
    const scaledHeight = image.height * scale * zoom;
    const currentX = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width;
    const currentY = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height;


    const x = currentX;
    const y = currentY;

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

    // 🎯 DÉPLACEMENT DE CARTE
    if (isDragging && (mouseButton === 1 || (mouseButton === 0 && panMode))) {
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
      const startX = (dragStart.x - rect.left + offset.x) / scaledWidth * image.width;
      const startY = (dragStart.y - rect.top + offset.y) / scaledHeight * image.height;
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
            await updateDoc(doc(db, 'cartes', String(roomId), 'characters', currentChar.id), {
              x: currentChar.x,
              y: currentChar.y
            });
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
    if (isSelectingArea) {
      setIsSelectingArea(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }

    // Fin du déplacement de carte (clic milieu OU mode pan avec clic gauche)
    if (currentMouseButton === 1 || (currentMouseButton === 0 && panMode)) {
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
    // Convertir roomId en chaîne de caractères
    const roomIdStr = String(roomId);

    // Check local selection validity
    if (selectedNoteIndex !== null && typeof roomIdStr === 'string') {
      const noteToDelete = notes[selectedNoteIndex];

      // Ensure note exists and has ID
      if (noteToDelete && typeof noteToDelete.id === 'string') {
        try {
          // 1. Clear selection IMMEDIATELY to prevent double-trigger
          setSelectedNoteIndex(null);

          // 2. Perform DB deletion
          await deleteDoc(doc(db, 'cartes', roomIdStr, 'text', noteToDelete.id));

          // 3. Update local state safely using ID (not index, which is unstable)
          setNotes((prevNotes) => prevNotes.filter((n) => n.id !== noteToDelete.id));
        } catch (error) {
          console.error("Erreur lors de la suppression de la note :", error);
        }
      } else {
        console.error("Erreur: Note introuvable ou ID invalide.");
      }
    }
  };


  const handleEditCharacter = () => {
    if (selectedCharacterIndex !== null) {  // Ensure index is not null
      setEditingCharacter(characters[selectedCharacterIndex]);
      setCharacterDialogOpen(true);
    }
  };

  const handleEditNote = () => {
    if (selectedNoteIndex !== null) {  // Ensure index is not null
      setEditingNote(notes[selectedNoteIndex]);
      setShowCreateNoteModal(true);
    }
  };




  const handleCharacterEditSubmit = async () => {
    if (editingCharacter && selectedCharacterIndex !== null && roomId) {
      const charToUpdate = characters[selectedCharacterIndex];
      if (charToUpdate?.id) {
        try {
          // Met à jour les données du personnage dans Firestore
          const updatedData: {
            Nomperso: string;
            niveau: number;
            PV: number;
            Defense: number;
            Contact: number;
            Distance: number;
            Magie: number;
            INIT: number;
            FOR: number;
            DEX: number;
            CON: number;
            SAG: number;
            INT: number;
            CHA: number;
            visibility: 'visible' | 'hidden' | 'ally';
            visibilityRadius: number;
            imageURL2?: string; // Add imageURL2 as an optional field
          } = {
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

          // Check if a new image is selected and upload it if necessary
          if (editingCharacter.image?.src !== charToUpdate.image.src) {
            const storage = getStorage();
            const imageRef = ref(storage, `characters/${editingCharacter.name}-${Date.now()}`);
            const response = await fetch(editingCharacter.image.src);
            const blob = await response.blob();
            await uploadBytes(imageRef, blob);
            const imageURL = await getDownloadURL(imageRef);

            // Add the image URL to Firestore data
            updatedData.imageURL2 = imageURL;
          }


          // Vérifiez si une nouvelle image est sélectionnée et téléchargez-la si nécessaire
          if (editingCharacter.image?.src !== charToUpdate.image.src) {
            const storage = getStorage();
            const imageRef = ref(storage, `characters/${editingCharacter.name}-${Date.now()}`);
            const response = await fetch(editingCharacter.image.src);
            const blob = await response.blob();
            await uploadBytes(imageRef, blob);
            const imageURL = await getDownloadURL(imageRef);

            // Ajoutez l'URL de l'image au document Firestore
            updatedData.imageURL2 = imageURL;
          }

          // Mise à jour dans Firestore
          await updateDoc(doc(db, 'cartes', String(roomId), 'characters', charToUpdate.id), updatedData);

          // Mettez à jour le personnage localement
          setCharacters((prevCharacters) =>
            prevCharacters.map((character, index) =>
              index === selectedCharacterIndex ? { ...character, ...updatedData } : character
            )
          );

          // Réinitialisez l'état d'édition
          setEditingCharacter(null);
          setCharacterDialogOpen(false);
          setSelectedCharacterIndex(null);
        } catch (error) {
          console.error("Erreur lors de la mise à jour du personnage :", error);
        }
      } else {
        console.error("Erreur: ID du personnage non valide.");
      }
    }
  };



  const handleNoteSubmit = async () => {
    if (editingNote && roomId && selectedNoteIndex !== null) {  // Vérifie que selectedNoteIndex n'est pas null
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
      } else {
        console.error("Erreur: roomId ou noteToUpdate.id n'est pas une chaîne valide.");
      }
    } else {
      console.error("Erreur : 'editingNote', 'roomId', ou 'selectedNoteIndex' est invalide.");
    }
  };


  const toggleDrawMode = () => {
    setDrawMode(!drawMode)
    setSelectedCharacterIndex(null)
    setSelectedNoteIndex(null)
  }

  const clearDrawings = async () => {
    if (!db) {
      console.error("Database instance 'db' is not INITialized.");
      return;
    }

    if (!roomId) {
      console.error("Room ID is missing or undefined.");
      return;
    }

    try {
      const drawingsRef = collection(db, 'cartes', String(roomId), 'drawings'); // Convert roomId to string
      const snapshot = await getDocs(drawingsRef);

      if (snapshot.empty) {

        return;
      }

      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

    } catch (error) {
      console.error('Error clearing drawings:', error);
    }
  };

  const clearFog = async () => {
    // Effacer toute la grille de brouillard localement
    const emptyGrid = new Map<string, boolean>();
    setFogGrid(emptyGrid);

    // Sauvegarder dans Firebase via la fonction centralisée

    if (roomId) {
      await saveFogGrid(emptyGrid);
    } else {
      console.error("❌ Room ID missing when trying to clear fog");
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

    // Sauvegarder dans Firebase pour synchronisation
    if (roomId) {
      try {
        const fogDocRef = doc(db, 'cartes', String(roomId), 'fog', 'fogData');
        await setDoc(fogDocRef, { fullMapFog: newValue }, { merge: true });
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
        const deletedIds = charsToDelete.map(c => c.id);
        setCharacters(prev => prev.filter(c => !deletedIds.includes(c.id)));
      } else {
        // Clear selection if only players were selected (and ignored)
        setSelectedCharacters([]);
      }
    }
  };



  // 🎯 SUPPRIMÉ : Anciennes fonctions de brouillard (toggleClearFogMode, handleDeleteFog)


  if (loading) {
    return <div>Chargement...</div>
  }

  if (!userId) {
    return <div>Veuillez vous connecter pour accéder à la carte</div>
  }

  // 🆕 RENDER WORLD MAP if in world mode
  if (viewMode === 'world') {
    return (
      <div className="h-screen w-full relative">
        <CitiesManager onCitySelect={navigateToCity} />
      </div>
    );
  }

  // 🎯 RENDER CITY MAP (existing functionality)
  return (
    <div className="flex flex-col relative">
      {/* 🆕 Bouton Retour à la World Map - UNIQUEMENT POUR LE MJ */}
      {/* 🆕 Bouton Retour à la World Map - UNIQUEMENT POUR LE MJ (DEPLACÉ EN HAUT À DROITE) */}
      {/* L'ancien emplacement en haut à gauche est supprimé pour Importer PNJ et Retour au Monde */}

      {/* 🎯 Contrôles de zoom flottants en haut à droite */}
      {/* 🎯 Contrôles de zoom flottants en haut à droite */}
      <div className="absolute top-4 right-4 z-[5] flex flex-col gap-2 items-end">
        <Button
          onClick={() => handleZoom(0.1)}
          className="w-10 h-10 p-0 bg-black/50 hover:bg-black/70 border border-gray-600 backdrop-blur-sm origin-center"
          title="Zoomer"
        >
          <Plus className="w-4 h-4" />
        </Button>
        <Button
          onClick={() => handleZoom(-0.1)}
          className="w-10 h-10 p-0 bg-black/50 hover:bg-black/70 border border-gray-600 backdrop-blur-sm origin-center"
          title="Dézoomer"
        >
          <Minus className="w-4 h-4" />
        </Button>

        {/* 🆕 Bouton Retour à la World  - Déplacé ici */}
        {isMJ && (
          <Button
            onClick={navigateToWorldMap}
            className="w-10 h-10 p-0 bg-black/50 hover:bg-black/70 border border-gray-600 backdrop-blur-sm origin-center"
            title="Retour à la carte du monde"
          >
            <MapPin className="w-4 h-4" />
          </Button>
        )}
      </div>



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

      {/* 🎯 Indicateurs de mode actif - REPLACED BY CENTERED OVERLAYS */}

      {drawMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
          <div className="flex items-center gap-4 bg-neutral-900/90 backdrop-blur-md px-4 py-2 rounded-full border border-neutral-700 shadow-2xl">
            {/* Tools */}
            <div className="flex bg-zinc-800 rounded-lg p-1 border border-zinc-600">
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-md ${currentTool === 'pen' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                onClick={() => setCurrentTool('pen')}
                title="Crayon"
              >
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-md ${currentTool === 'line' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                onClick={() => setCurrentTool('line')}
                title="Ligne"
              >
                <Slash className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-md ${currentTool === 'rectangle' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                onClick={() => setCurrentTool('rectangle')}
                title="Rectangle"
              >
                <Square className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-md ${currentTool === 'circle' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                onClick={() => setCurrentTool('circle')}
                title="Cercle"
              >
                <CircleIcon className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-md ${currentTool === 'eraser' ? 'bg-red-600 text-white' : 'text-zinc-400 hover:text-white'}`}
                onClick={() => setCurrentTool('eraser')}
                title="Gomme (supprime le trait entier)"
              >
                <Eraser className="w-4 h-4" />
              </Button>
            </div>

            <div className="w-px h-8 bg-zinc-700" />

            {/* Colors */}
            <div className="flex items-center gap-2">
              {['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'].map((color) => (
                <button
                  key={color}
                  className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${drawingColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setDrawingColor(color);
                    setCurrentTool('pen');
                  }}
                />
              ))}

              <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-zinc-600 hover:border-white transition-colors">
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

            <div className="w-px h-8 bg-zinc-700" />

            {/* Size */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-xs font-medium">Taille</span>
              <input
                type="range"
                min="1"
                max="20"
                value={drawingSize}
                onChange={(e) => setDrawingSize(parseInt(e.target.value))}
                className="w-24 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-white text-xs w-4">{drawingSize}</span>
            </div>

            <div className="w-px h-8 bg-zinc-700" />

            {/* Actions */}
            <Button
              variant="ghost"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-900/30"
              onClick={() => {
                if (confirm('Voulez-vous vraiment effacer tous les dessins ?')) {
                  clearDrawings();
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Tout
            </Button>
          </div>

          {/* Instructions overlay */}
          <div className="text-[10px] text-zinc-400 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm border border-white/10">
            {currentTool === 'pen' ? 'Clic gauche pour dessiner' : 'Clic ou glisser sur un trait pour effacer'}
          </div>
        </div>
      )}

      {/* 🔦 VISIBILITY MODE TOOLBAR - Design professionnel */}
      {visibilityMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-3">
          {/* Toolbar principale */}
          <div className="flex items-center gap-1 bg-gradient-to-b from-zinc-800 to-zinc-900 backdrop-blur-xl px-3 py-2 rounded-xl border border-zinc-700/50 shadow-2xl shadow-black/50">

            {/* Logo / Titre */}
            <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800/50 rounded-lg border border-zinc-700/30">
              <Eye className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-300 font-semibold text-xs tracking-wide uppercase">Visibilité</span>
            </div>

            <div className="w-px h-7 bg-zinc-700/50 mx-2" />

            {/* Section Brouillard */}
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-950/30 rounded-lg border border-blue-800/30">
              <span className="text-blue-400 text-[10px] font-medium mr-1 opacity-70">FOG</span>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-lg transition-all ${currentVisibilityTool === 'fog'
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                  : 'text-blue-300 hover:text-white hover:bg-blue-600/50'}`}
                onClick={() => setCurrentVisibilityTool('fog')}
                title="Brouillard (clic gauche = ajouter, clic droit = retirer)"
              >
                <Cloud className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-2 rounded-lg text-xs transition-all ${fullMapFog
                  ? 'bg-blue-600 text-white'
                  : 'text-blue-300 hover:text-white hover:bg-blue-600/50'}`}
                onClick={() => handleFullMapFogChange(!fullMapFog)}
                title="Activer/désactiver le brouillard total"
              >
                {fullMapFog ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </Button>
            </div>

            <div className="w-px h-7 bg-zinc-700/50 mx-1" />

            {/* Section Obstacles (Murs) */}
            <div className="flex items-center gap-1 px-2 py-1 bg-amber-950/30 rounded-lg border border-amber-800/30">
              <span className="text-amber-400 text-[10px] font-medium mr-1 opacity-70">OBSTACLE</span>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-lg transition-all ${currentVisibilityTool === 'chain'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                  : 'text-amber-300 hover:text-white hover:bg-amber-600/50'}`}
                onClick={() => setCurrentVisibilityTool('chain')}
                title="Murs connectés (clic pour chaîner, Escape pour terminer)"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="4,18 10,8 18,12 22,4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-lg transition-all ${currentVisibilityTool === 'polygon'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30'
                  : 'text-amber-300 hover:text-white hover:bg-amber-600/50'}`}
                onClick={() => setCurrentVisibilityTool('polygon')}
                title="Polygone (cliquer sur le 1er point pour fermer)"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12,2 22,8.5 18,20 6,20 2,8.5" />
                </svg>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 rounded-lg transition-all ${currentVisibilityTool === 'edit'
                  ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30'
                  : 'text-violet-300 hover:text-white hover:bg-violet-600/50'}`}
                onClick={() => {
                  setCurrentVisibilityTool('edit');
                  setIsDrawingObstacle(false);
                  setCurrentObstaclePoints([]);
                }}
                title="Éditer les obstacles (sélectionner, supprimer)"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                  <path d="M13 13l6 6" />
                </svg>
              </Button>
            </div>

            <div className="w-px h-7 bg-zinc-700/50 mx-1" />

            {/* Actions */}
            <div className="flex items-center gap-1">
              {selectedObstacleId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-900/30"
                  onClick={() => deleteObstacle(selectedObstacleId)}
                  title="Supprimer l'obstacle sélectionné"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-lg text-zinc-400 hover:text-red-300 hover:bg-red-900/30"
                onClick={() => {
                  if (confirm('Supprimer tout le brouillard et les obstacles ?')) {
                    clearFog();
                    clearAllObstacles();
                  }
                }}
                title="Tout effacer"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700/50"
                onClick={() => toggleVisibilityMode()}
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 🆕 MENU ORB - Stylized Trigger */}
      <div className="absolute bottom-6 right-6 z-[40]">
        <button
          onClick={() => {
            setIsRadialMenuCentered(true);
            setIsRadialMenuOpen(!isRadialMenuOpen);
          }}
          className={`
            relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300
            ${isRadialMenuOpen ? 'bg-[#c0a080] shadow-[0_0_20px_rgba(192,160,128,0.5)] scale-110' : 'bg-black/40 hover:bg-black/60 backdrop-blur-md border border-[#c0a080]/30 hover:border-[#c0a080]/70 hover:scale-105 hover:shadow-[0_0_15px_rgba(192,160,128,0.3)]'}
          `}
          title="Ouvrir le menu (ou Clic Droit)"
        >
          {/* Inner ring for detail */}
          <div className={`absolute inset-1 rounded-full border border-white/10 ${isRadialMenuOpen ? 'border-black/20' : ''}`} />

          {/* Icon */}
          <div className={`transition-transform duration-500 ${isRadialMenuOpen ? 'rotate-180' : 'rotate-0'}`}>
            {isRadialMenuOpen ? (
              <X className="w-6 h-6 text-black" />
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#c0a080]">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleBackgroundChange}
        style={{ display: 'none' }}
      />

      <RadialMenu
        menuItems={radialMenuItems}
        onSelect={handleRadialMenuSelect}
        size={280}
        iconSize={20}
        activeItemIds={getActiveToolIds()}
        open={isRadialMenuOpen}
        onOpenChange={setIsRadialMenuOpen}
        centered={isRadialMenuCentered}
      >
        <div
          ref={containerRef}
          className={`w-full h-full flex-1 overflow-hidden border border-gray-300 ${isDraggingCharacter || isDraggingNote ? 'cursor-grabbing' :
            isDragging ? 'cursor-move' :
              panMode ? 'cursor-grab' :
                drawMode ? 'cursor-crosshair' :
                  fogMode ? 'cursor-cell' : 'cursor-default'
            } relative`}
          style={{
            height: '100vh',
            userSelect: isDraggingCharacter || isDraggingNote ? 'none' : 'auto'
          }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          onContextMenu={(e) => {
            // Empêcher le menu contextuel en mode visibilité + brouillard (clic droit = retirer brouillard)
            if (visibilityMode && currentVisibilityTool === 'fog') {
              e.preventDefault();
              return;
            }

            // Ensure Radial Menu is NOT centered when triggered by right-click
            setIsRadialMenuCentered(false);

            // 🎯 CONFLICT RESOLUTION: Character Context Menu vs Radial Menu
            // If we are hovering over a character, we want the CHARACTER context menu to open (handled elsewhere or natively if implemented),
            // and we want to PREVENT the Radial Menu from opening.

            // Check if cursor is over a character
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect && bgImageObject) {
              const containerWidth = containerRef.current?.clientWidth || rect.width;
              const containerHeight = containerRef.current?.clientHeight || rect.height;
              const image = bgImageObject;
              const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
              const scaledWidth = image.width * scale * zoom;
              const scaledHeight = image.height * scale * zoom;
              const mouseX = e.clientX;
              const mouseY = e.clientY;

              const hoveredCharIndex = characters.findIndex(char => {
                const charX = (char.x / image.width) * scaledWidth - offset.x + rect.left;
                const charY = (char.y / image.height) * scaledHeight - offset.y + rect.top;
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
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100vh' }}
            onDrop={handleCanvasDrop}
            onDragOver={handleCanvasDragOver}
            onDoubleClick={handleCanvasDoubleClick}
          />
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
      </RadialMenu>

      {selectedDrawingIndex !== null && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90vw]">
          <div className="flex flex-wrap gap-2 items-center justify-center bg-black/50 backdrop-blur-sm p-3 rounded-lg border border-gray-600 shadow-xl z-50">
            <span className="text-white text-sm font-medium pr-2">Dessin sélectionné</span>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedDrawingIndex !== null && roomId) {
                  const drawing = drawings[selectedDrawingIndex];
                  deleteDoc(doc(db, 'cartes', String(roomId), 'drawings', drawing.id));
                  // Optimistic update
                  setDrawings(prev => prev.filter((_, i) => i !== selectedDrawingIndex));
                  setSelectedDrawingIndex(null);
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Supprimer
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSelectedDrawingIndex(null)}
            >
              Fermer
            </Button>
          </div>
        </div>
      )}



      {selectedCharacters.length > 1 && isMJ && (
        // Afficher le bouton seulement si plusieurs personnages non-joueurs sont sélectionnés
        (() => {
          const hasNonPlayerCharacter = selectedCharacters.some(index =>
            characters[index]?.type !== 'joueurs'
          );
          return hasNonPlayerCharacter;
        })() && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90vw]">
            <div className="flex flex-wrap gap-2 items-center justify-center bg-black/50 backdrop-blur-sm p-3 rounded-lg border border-gray-600">
              <Button onClick={handleDeleteSelectedCharacters}>
                <X className="w-4 h-4 mr-2" /> Supprimer la sélection
              </Button>
            </div>
          </div>
        )
      )}

      {selectedNoteIndex !== null && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90vw]">
          <div className="flex flex-wrap gap-2 items-center justify-center bg-black/50 backdrop-blur-sm p-3 rounded-lg border border-gray-600">
            <Button onClick={handleDeleteNote}>
              <X className="w-4 h-4 mr-2" /> Supprimer
            </Button>
            <Button onClick={handleEditNote}>
              <Edit className="w-4 h-4 mr-2" /> Modifier
            </Button>
          </div>
        </div>
      )}

      {isMJ && selectedFogIndex !== null && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90vw]">
          <div className="flex flex-wrap gap-2 items-center justify-center bg-black/50 backdrop-blur-sm p-3 rounded-lg border border-gray-600">
            <Button onClick={() => {
              console.log("🧨 Radial Menu: Suppression totale du brouillard");
              setFullMapFog(false);
              saveFullMapFog(false);
              // 🆕 SUPPRIMER AUSSI TOUTE LA GRILLE DE BROUILLARD
              setFogGrid(new Map());
              saveFogGrid(new Map());
            }}>
              <X className="w-4 h-4 mr-2" /> Supprimer le brouillard
            </Button>
          </div>
        </div>
      )}



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

      <Dialog open={characterDialogOpen} onOpenChange={setCharacterDialogOpen}>
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
                        className={`flex-1 h-9 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${editingCharacter?.visibility === mode.id
                          ? 'bg-[#c0a080] border-[#c0a080] text-[#1e1e1e] font-bold shadow-sm'
                          : 'bg-[#2a2a2a] border-gray-600 text-gray-300 hover:bg-[#3a3a3a] hover:text-white'}`}
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
                className={`h-7 px-2 text-xs ml-2 ${showFogGrid ? 'text-yellow-400 bg-yellow-400/10' : 'text-neutral-400 hover:text-white'}`}
              >
                <Grid className="w-3 h-3 mr-1" />
                Grille
              </Button>
            )}
          </div>
        )
      }

      {/* 🎯 PLAYER VIEW OVERLAY */}
      {
        playerViewMode && isMJ && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-purple-900/90 text-purple-100 px-4 py-2 rounded-full border border-purple-700 shadow-xl flex items-center gap-3 z-40 backdrop-blur-sm pointer-events-none">
            <ScanEye className="w-4 h-4" />
            <span className="font-medium text-sm">Vue Joueur Active</span>
          </div>
        )
      }

      {/* 🎯 MEASUREMENT OVERLAY UI */}
      {
        measureMode && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-neutral-900/90 text-neutral-200 px-4 py-2 rounded-full border border-neutral-700 shadow-xl flex items-center gap-4 z-50 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-neutral-400" />
              <span className="font-medium text-sm">Mode Mesure</span>
            </div>

            <div className="h-4 w-px bg-neutral-700 mx-1"></div>

            <div className="text-xs text-neutral-400">
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
                className="h-7 px-2 text-xs text-neutral-400 hover:text-white hover:bg-white/5 ml-2"
              >
                Étalonner
              </Button>
            )}
            {isCalibrating && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCalibrating(false)}
                className="h-7 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 ml-2"
              >
                Annuler
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

      <ContextMenuPanel
        character={contextMenuCharacterId ? characters.find(c => c.id === contextMenuCharacterId) || null : null}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false);
          setContextMenuCharacterId(null);
          setSelectedCharacterIndex(null); // Désélectionner aussi sur la map si on ferme le menu
        }}
        isMJ={isMJ}
        onAction={(action, characterId, value) => {
          // Gestion des actions du menu contextuel
          const char = characters.find(c => c.id === characterId);
          if (!char) return;

          if (action === 'openSheet') {
            setSelectedCharacterForSheet(characterId);
            setShowCharacterSheet(true);
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
              setEditingCharacter(char);
              setCharacterDialogOpen(true);
              setContextMenuOpen(false); // Close context menu when opening edit
            }
          } else if (action === 'setVisibility') {
            if (isMJ && roomId) {
              const newVisibility = value;
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { visibility: newVisibility });
            }
          } else if (action === 'updateRadius') {
            if (isMJ && roomId) {
              const newRadius = value;
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { visibilityRadius: newRadius });
            }
          } else if (action === 'toggleCondition') {
            if (isMJ && roomId) {
              const condition = value;
              const currentConditions = char.conditions || [];
              let newConditions;
              if (currentConditions.includes(condition)) {
                newConditions = currentConditions.filter(c => c !== condition);
              } else {
                newConditions = [...currentConditions, condition];
              }
              const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
              updateDoc(charRef, { conditions: newConditions });
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
    </div >
  )
}
