"use client"

import React, { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useGame } from '@/contexts/GameContext'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { X, Plus, Minus, Edit, Pencil, Eraser, CircleUserRound, Baseline, User, Grid, Cloud, CloudOff, ImagePlus, Trash2, Eye, EyeOff, ScanEye, Move } from 'lucide-react'
import { auth, db, onAuthStateChanged, doc, getDocs, collection, onSnapshot, updateDoc, addDoc, deleteDoc, setDoc } from '@/lib/firebase'
import Combat from '@/components/(combat)/combat2';  // Importez le composant de combat
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ScrollArea } from "@/components/ui/scroll-area";
import CharacterSheet from '@/components/(fiches)/CharacterSheet'; // Importez le composant de fiche de personnage
import { Component as RadialMenu } from '@/components/ui/radial-menu'; // Menu radial


export default function Component() {
  const params = useParams();
  const roomId = params.roomid as string;
  const { isMJ, persoId } = useGame();

  // Debug logs pour vérifier la restauration du contexte
  useEffect(() => {
    console.log('=== MAP COMPONENT DEBUG ===');
    console.log('roomId:', roomId);
    console.log('isMJ:', isMJ);
    console.log('persoId:', persoId);
    console.log('==========================');
  }, [roomId, isMJ, persoId]);

  const [combatOpen, setCombatOpen] = useState(false);
  const [attackerId, setAttackerId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState('/placeholder.svg?height=600&width=800')
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1.4)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [characters, setCharacters] = useState<Character[]>([]);
  const [notes, setNotes] = useState<Text[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false)
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
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false)
  const [addNoteDialogOpen, setAddNoteDialogOpen] = useState(false)
  const [newNote, setNewNote] = useState({ text: '', color: '#ffff00', fontSize: 16 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true)
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


  type Character = {
    niveau: number,
    id: string;
    name: string;
    x: number;
    y: number;
    image: HTMLImageElement;
    visibility: 'visible' | 'hidden' | 'ally';
    visibilityRadius: number;
    type: string;
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
  };


  type Text = {
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize?: number;
  };
  type Path = { x: number; y: number };
  type Drawing = Path[];

  type NewCharacter = {
    niveau: number;
    name: string;
    image: { src: string } | null;
    visibility: 'visible' | 'hidden' | 'ally';
    PV: number;
    Defense: number;
    Contact: number;
    Distance: number;
    Magie: number;
    INIT: number;
    nombre: number
    FOR: number;
    DEX: number;
    CON: number;
    SAG: number;
    INT: number;
    CHA: number;
  };
  type Point = { x: number; y: number };

  type Note = {
    text?: string;
    id?: string;
    color?: string;
  };





  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const image = new Image();
    image.src = backgroundImage;
    const sizeMultiplier = 1.5;
    image.onload = () => {
      const containerWidth = containerRef.current?.clientWidth || canvas.width;
      const containerHeight = containerRef.current?.clientHeight || canvas.height;
      canvas.width = containerWidth * sizeMultiplier;
      canvas.height = containerHeight * sizeMultiplier;
      ctx.scale(sizeMultiplier, sizeMultiplier);
      drawMap(ctx, image, containerWidth, containerHeight); // Pass container dimensions
    };
  }, [backgroundImage, showGrid, zoom, offset, characters, notes, selectedCharacterIndex, selectedNoteIndex, drawings, currentPath, fogGrid, showFogGrid, fullMapFog, isSelectingArea, selectionStart, selectionEnd, selectedCharacters, isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions, isDraggingNote, draggedNoteIndex, isFogDragging, playerViewMode, isMJ]);


  // Firebase Functions

  // 🎯 Configuration du menu radial
  const radialMenuItems = isMJ ? [
    { id: 1, label: 'Ajouter Personnage', icon: CircleUserRound },
    { id: 2, label: 'Ajouter Texte', icon: Baseline },
    { id: 3, label: 'Dessiner', icon: Pencil },
    { id: 4, label: 'Brouillard', icon: Cloud },
    { id: 5, label: fullMapFog ? 'Masquer brouillard' : 'Brouillard complet', icon: fullMapFog ? EyeOff : Eye },
    { id: 6, label: 'Supprimer brouillard', icon: CloudOff },
    { id: 7, label: showGrid ? 'Masquer grille' : 'Afficher grille', icon: Grid },
    { id: 8, label: 'Effacer dessins', icon: Trash2 },
    { id: 9, label: 'Changer fond', icon: ImagePlus },
    { id: 10, label: 'Déplacer carte', icon: Move },
    { id: 11, label: playerViewMode ? 'Vue MJ' : 'Vue Joueur', icon: playerViewMode ? ScanEye : User },
  ] : [
    { id: 1, label: 'Ajouter Texte', icon: Baseline },
    { id: 2, label: 'Dessiner', icon: Pencil },
    { id: 3, label: showGrid ? 'Masquer grille' : 'Afficher grille', icon: Grid },
    { id: 4, label: 'Déplacer carte', icon: Move },
    { id: 5, label: 'Effacer dessins', icon: Trash2 },
  ];

  // 🎯 Calculer les IDs des outils actuellement actifs (peut être plusieurs)
  const getActiveToolIds = (): number[] => {
    const activeIds: number[] = [];

    if (isMJ) {
      // Menu MJ
      if (drawMode) activeIds.push(3); // Dessiner
      if (fogMode) activeIds.push(4); // Brouillard
      if (fullMapFog) activeIds.push(5); // Brouillard complet
      if (showGrid) activeIds.push(7); // Afficher grille
      if (panMode) activeIds.push(10); // Déplacer carte
      if (playerViewMode) activeIds.push(11); // Vue Joueur
    } else {
      // Menu Joueur
      if (drawMode) activeIds.push(2); // Dessiner
      if (showGrid) activeIds.push(3); // Afficher grille
      if (panMode) activeIds.push(4); // Déplacer carte
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

  const handleRadialMenuSelect = (item: { id: number; label: string; icon: any }) => {
    // 🎯 Désactiver les outils incompatibles avant d'activer le nouveau
    const desactiverOutilsIncompatibles = (toolId: number) => {
      if (isMJ) {
        // Pour le MJ : ID 3 (Dessin), ID 4 (Brouillard), ID 10 (Déplacement) sont incompatibles
        if (toolId === 3 || toolId === 4 || toolId === 10) {
          // Désactiver les deux autres
          if (toolId !== 3 && drawMode) setDrawMode(false);
          if (toolId !== 4 && fogMode) setFogMode(false);
          if (toolId !== 10 && panMode) setPanMode(false);
        }
      } else {
        // Pour le joueur : ID 2 (Dessin), ID 4 (Déplacement) sont incompatibles
        if (toolId === 2 || toolId === 4) {
          // Désactiver l'autre
          if (toolId !== 2 && drawMode) setDrawMode(false);
          if (toolId !== 4 && panMode) setPanMode(false);
        }
      }
    };

    if (isMJ) {
      // Menu MJ
      switch (item.id) {
        case 1:
          // Ajouter Personnage
          setDialogOpen(true);
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
          // Brouillard (toggle mode)
          desactiverOutilsIncompatibles(4);
          toggleFogMode();
          break;
        case 5:
          // Brouillard complet (toggle)
          handleFullMapFogChange(!fullMapFog);
          break;
        case 6:
          // Supprimer tout le brouillard
          clearFog();
          break;
        case 7:
          // Toggle grille
          setShowGrid(!showGrid);
          break;
        case 8:
          // Effacer dessins
          clearDrawings();
          break;
        case 9:
          // Changer fond
          fileInputRef.current?.click();
          break;
        case 10:
          // Déplacer carte
          desactiverOutilsIncompatibles(10);
          togglePanMode();
          break;
        case 11:
          // Toggle Vue Joueur
          setPlayerViewMode(!playerViewMode);
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
      }
    }
  };

  const handleAttack = () => {
    console.log('=== HANDLE ATTACK DEBUG ===');
    console.log('persoId:', persoId);
    console.log('selectedCharacterIndex:', selectedCharacterIndex);
    console.log('activePlayerId:', activePlayerId);
    console.log('isMJ:', isMJ);

    if (selectedCharacterIndex !== null) {
      const targetCharacter = characters[selectedCharacterIndex];
      console.log('targetCharacter:', targetCharacter);

      if (targetCharacter && targetCharacter.id) {
        console.log('Setting combat parameters...');

        if (isMJ) {
          // Pour le MJ : l'attaquant est le personnage actif (en rouge)
          if (activePlayerId) {
            setAttackerId(activePlayerId);
            setTargetId(targetCharacter.id);
            setCombatOpen(true);
            console.log('MJ attacking with activePlayer:', activePlayerId, 'against:', targetCharacter.id);
          } else {
            console.log('No active player ID for MJ attack');
          }
        } else {
          // Pour les joueurs : l'attaquant est leur personnage
          if (persoId) {
            setAttackerId(persoId);
            setTargetId(targetCharacter.id);
            setCombatOpen(true);
            console.log('Player attacking with:', persoId, 'against:', targetCharacter.id);
          } else {
            console.log('No persoId for player attack');
          }
        }
      } else {
        console.log('Target character has no ID');
      }
    } else {
      console.log('No character selected');
    }
    console.log('=========================');
  };


  const INITializeFirebaseListeners = (room: string) => {
    const fondRef = doc(db, 'cartes', room.toString(), 'fond', 'fond1');
    onSnapshot(fondRef, (doc) => {
      if (doc.exists() && doc.data().url) {
        setBackgroundImage(doc.data().url);
      }
    });

    // Écouter le personnage actif (tour_joueur)
    const settingsRef = doc(db, 'cartes', room.toString(), 'settings', 'general');
    onSnapshot(settingsRef, (doc) => {
      if (doc.exists() && doc.data().tour_joueur) {
        setActivePlayerId(doc.data().tour_joueur);
      }
    });
    // Charger les personnages
    const charactersRef = collection(db, 'cartes', room.toString(), 'characters');
    onSnapshot(charactersRef, (snapshot) => {
      const chars: Character[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const img = new Image();
        // Pour les joueurs : utiliser imageURLFinal si disponible, sinon imageURL2, sinon imageURL
        // Pour les PNJ : utiliser imageURL2 si disponible, sinon imageURL
        if (data.type === 'joueurs') {
          img.src = data.imageURLFinal || data.imageURL2 || data.imageURL;
        } else {
          img.src = data.imageURL2 || data.imageURL;
        }

        // Ajoutez tous les champs requis
        chars.push({
          id: doc.id,
          niveau: data.niveau || 1,
          name: data.Nomperso || '',
          x: data.x || 0,
          y: data.y || 0,
          image: img,
          visibility: data.visibility || 'hidden',
          visibilityRadius: parseFloat(data.visibilityRadius) || 100,
          type: data.type || 'pnj',
          PV: data.PV || 10, // Assurez-vous que chaque champ est bien extrait
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
        });
      });
      setCharacters(chars);
      setLoading(false);
    });

    // Charger les notes
    const notesRef = collection(db, 'cartes', room.toString(), 'text');
    onSnapshot(notesRef, (snapshot) => {
      const texts = [] as Text[];
      snapshot.forEach((doc) => {
        const data = doc.data();
        texts.push({
          id: doc.id,
          text: data.content,
          x: data.x || 0,
          y: data.y || 0,
          color: data.color || 'yellow'
        });
      });
      setNotes(texts);
    });

    // Charger les dessins
    const drawingsRef = collection(db, 'cartes', room.toString(), 'drawings');
    onSnapshot(drawingsRef, (snapshot) => {
      const drws: Drawing[] = [];
      snapshot.forEach((doc) => {
        const paths = doc.data().paths;
        if (paths && Array.isArray(paths)) {
          drws.push(paths);
        }
      });
      setDrawings(drws);
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

  const calculateDistance = (x1: number, y1: number, x2: number, y2: number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };

  // 🎯 NOUVELLE FONCTION : Vérifier si un personnage est visible pour l'utilisateur actuel
  const isCharacterVisibleToUser = (char: Character): boolean => {
    // Le MJ en mode normal voit toujours tout
    const effectiveIsMJ = isMJ && !playerViewMode;
    if (effectiveIsMJ) return true;

    // Vérifier si le personnage est dans le brouillard
    const isInFog = fullMapFog || isCellInFog(char.x, char.y);

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
      if (!containerRef_current || !canvasRef_current) return false;

      const rect = canvasRef_current.getBoundingClientRect();
      const containerWidth = containerRef_current.clientWidth || rect.width;
      const containerHeight = containerRef_current.clientHeight || rect.height;
      const image = new Image();
      image.src = backgroundImage;

      const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
      const scaledWidth = image.width * scale * zoom;
      const scaledHeight = image.height * scale * zoom;

      const charScreenX = (char.x / image.width) * scaledWidth - offset.x;
      const charScreenY = (char.y / image.height) * scaledHeight - offset.y;

      // Vérifier si dans le rayon de vision d'un joueur ou allié
      return characters.some((player) => {
        const playerScreenX = (player.x / image.width) * scaledWidth - offset.x;
        const playerScreenY = (player.y / image.height) * scaledHeight - offset.y;
        return (
          (player.type === 'joueurs' || player.visibility === 'ally') &&
          calculateDistance(charScreenX, charScreenY, playerScreenX, playerScreenY) <= player.visibilityRadius * zoom
        );
      });
    }

    // Sinon, visible
    return true;
  };

  // 🎯 NOUVELLES FONCTIONS UTILITAIRES POUR LE BROUILLARD
  const getCellKey = (x: number, y: number): string => {
    const cellX = Math.floor(x / fogCellSize);
    const cellY = Math.floor(y / fogCellSize);
    return `${cellX},${cellY}`;
  };



  const isCellInFog = (x: number, y: number): boolean => {
    const key = getCellKey(x, y);
    return fogGrid.get(key) || false;
  };

  const toggleFogCell = async (x: number, y: number, forceState?: boolean) => {
    const key = getCellKey(x, y);
    const newFogGrid = new Map(fogGrid);

    if (forceState !== undefined) {
      // Mode forcé (pour le drag continu)
      if (forceState) {
        newFogGrid.set(key, true);
      } else {
        newFogGrid.delete(key);
      }
    } else {
      // Mode toggle (pour le clic simple)
      if (newFogGrid.has(key)) {
        newFogGrid.delete(key);
      } else {
        newFogGrid.set(key, true);
      }
    }

    setFogGrid(newFogGrid);

    // Sauvegarder en Firebase
    if (roomId) {
      const fogDocRef = doc(db, 'cartes', String(roomId), 'fog', 'fogData');
      const gridObject = Object.fromEntries(newFogGrid);
      await setDoc(fogDocRef, { grid: gridObject }, { merge: true });
    }
  };

  const addFogCellIfNew = async (x: number, y: number, addMode: boolean) => {
    const key = getCellKey(x, y);

    // Éviter de modifier la même cellule plusieurs fois pendant un drag
    if (lastFogCell === key) return;

    setLastFogCell(key);
    await toggleFogCell(x, y, addMode);
  };



  // 🎯 NOUVELLE FONCTION : Calculer l'opacité fog of war selon la distance aux joueurs
  const calculateFogOpacity = (cellX: number, cellY: number): number => {
    if (!fogGrid.has(`${cellX},${cellY}`)) return 0; // Pas de brouillard sur cette cellule

    let minOpacity = 1; // Opacité maximale par défaut (brouillard complet)

    // Pour mieux coller au cercle de vision, on ajoute une marge
    // correspondant à la moitié de la diagonale d'une case de brouillard.
    // Ainsi, toute case qui touche le cercle est considérée comme visible.
    const cellDiagonalHalf = fogCellSize * Math.SQRT2 * 0.5;

    // Vérifier la distance à tous les personnages joueurs et alliés
    for (const character of characters) {
      if ((character.type === 'joueurs' || character.visibility === 'ally') && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
        const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
        const cellCenterY = cellY * fogCellSize + fogCellSize / 2;
        const distance = calculateDistance(character.x, character.y, cellCenterX, cellCenterY);

        const visibilityRadius = character.visibilityRadius;

        // Rayon effectif pour considérer une case totalement visible
        const visibleRadiusWithMargin = visibilityRadius + cellDiagonalHalf;

        if (distance <= visibleRadiusWithMargin) {
          // Dans le cercle (avec marge) : complètement visible (opacité = 0)
          return 0;
        }

        // 🎯 En dehors du cercle visible : calculer l'opacité de transition
        const extendedRadius = visibleRadiusWithMargin + visibilityRadius; // zone de fade d'environ 1x le rayon

        if (distance <= extendedRadius) {
          // Transition progressive du brouillard
          const fadeDistance = distance - visibleRadiusWithMargin;
          const fadeRange = extendedRadius - visibleRadiusWithMargin;
          const normalizedFade = fadeDistance / fadeRange;

          // Opacité augmente progressivement de 0 à 1
          const opacity = Math.min(1, Math.max(0, normalizedFade));
          minOpacity = Math.min(minOpacity, opacity);
        }
      }
    }

    return minOpacity;
  };



  const drawMap = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, containerWidth: number, containerHeight: number) => {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
    const scaledWidth = image.width * scale * zoom;
    const scaledHeight = image.height * scale * zoom;

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
      ctx.font = `${fontSize}px Arial`;
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
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    if (drawings && Array.isArray(drawings)) {
      drawings.forEach(path => {
        if (path && Array.isArray(path)) {
          ctx.beginPath();
          path.forEach((point, index) => {
            const x = (point.x / image.width) * scaledWidth - offset.x;
            const y = (point.y / image.height) * scaledHeight - offset.y;
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          ctx.stroke();
        }
      });
    }

    // 🎯 NOUVEAU SYSTÈME : Dessiner la grille de brouillard par quadrillage

    // Afficher la grille de guidage si activée
    if (showFogGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;

      // Calculer les limites visibles de la grille
      const startCellX = Math.floor((-offset.x) / (fogCellSize * zoom)) - 1;
      const endCellX = Math.floor((-offset.x + containerWidth) / (fogCellSize * zoom)) + 1;
      const startCellY = Math.floor((-offset.y) / (fogCellSize * zoom)) - 1;
      const endCellY = Math.floor((-offset.y + containerHeight) / (fogCellSize * zoom)) + 1;

      // Dessiner les lignes verticales de la grille
      for (let cellX = startCellX; cellX <= endCellX; cellX++) {
        const x = cellX * fogCellSize;
        const screenX = (x / image.width) * scaledWidth - offset.x;
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, containerHeight);
        ctx.stroke();
      }

      // Dessiner les lignes horizontales de la grille  
      for (let cellY = startCellY; cellY <= endCellY; cellY++) {
        const y = cellY * fogCellSize;
        const screenY = (y / image.height) * scaledHeight - offset.y;
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(containerWidth, screenY);
        ctx.stroke();
      }
    }

    // 🎯 NOUVEAU FOG OF WAR : Dessiner avec opacité variable selon la distance aux joueurs
    if (fullMapFog) {
      // Mode brouillard sur toute la carte : calculer dynamiquement les cellules visibles
      // Convertir les coordonnées écran en coordonnées image
      const topLeftImageX = (offset.x / scaledWidth) * image.width;
      const topLeftImageY = (offset.y / scaledHeight) * image.height;
      const bottomRightImageX = ((offset.x + containerWidth) / scaledWidth) * image.width;
      const bottomRightImageY = ((offset.y + containerHeight) / scaledHeight) * image.height;

      // Calculer les cellules nécessaires avec une marge pour être sûr de tout couvrir
      const startCellX = Math.floor(topLeftImageX / fogCellSize) - 2;
      const endCellX = Math.ceil(bottomRightImageX / fogCellSize) + 2;
      const startCellY = Math.floor(topLeftImageY / fogCellSize) - 2;
      const endCellY = Math.ceil(bottomRightImageY / fogCellSize) + 2;

      for (let cellX = startCellX; cellX <= endCellX; cellX++) {
        for (let cellY = startCellY; cellY <= endCellY; cellY++) {
          const x = cellX * fogCellSize;
          const y = cellY * fogCellSize;

          const screenX = (x / image.width) * scaledWidth - offset.x;
          const screenY = (y / image.height) * scaledHeight - offset.y;
          const screenWidth = (fogCellSize / image.width) * scaledWidth;
          const screenHeight = (fogCellSize / image.height) * scaledHeight;

          // Ne dessiner que si la cellule est visible à l'écran
          if (screenX + screenWidth >= 0 && screenX <= containerWidth &&
            screenY + screenHeight >= 0 && screenY <= containerHeight) {

            // Calculer l'opacité selon la distance aux joueurs et alliés (même si pas dans fogGrid)
            let opacity = 1; // Opacité par défaut pour toute la carte

            // Vérifier la distance à tous les personnages joueurs et alliés
            for (const character of characters) {
              if ((character.type === 'joueurs' || character.visibility === 'ally') && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
                const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
                const cellCenterY = cellY * fogCellSize + fogCellSize / 2;
                const distance = calculateDistance(character.x, character.y, cellCenterX, cellCenterY);

                const visibilityRadius = character.visibilityRadius;
                const cellDiagonalHalf = fogCellSize * Math.SQRT2 * 0.5;
                const visibleRadiusWithMargin = visibilityRadius + cellDiagonalHalf;

                if (distance <= visibleRadiusWithMargin) {
                  // Dans le cercle (avec marge) : complètement visible (opacité = 0)
                  opacity = 0;
                  break; // Sortir de la boucle car la cellule est visible
                }

                // 🎯 En dehors du cercle visible : calculer l'opacité de transition
                const extendedRadius = visibleRadiusWithMargin + visibilityRadius;

                if (distance <= extendedRadius) {
                  // Transition progressive du brouillard
                  const fadeDistance = distance - visibleRadiusWithMargin;
                  const fadeRange = extendedRadius - visibleRadiusWithMargin;
                  const normalizedFade = fadeDistance / fadeRange;

                  // Opacité augmente progressivement de 0 à 1
                  const cellOpacity = Math.min(1, Math.max(0, normalizedFade));
                  opacity = Math.min(opacity, cellOpacity);
                }
              }
            }

            if (opacity > 0) {
              // 🎯 Pour le MJ : 55% d'opacité, pour les joueurs : 90% d'opacité
              const effectiveIsMJ = isMJ && !playerViewMode;
              const finalOpacity = effectiveIsMJ ? opacity * 0.55 : opacity * 0.90;
              ctx.fillStyle = `rgba(0, 0, 0, ${finalOpacity})`;
              ctx.fillRect(screenX, screenY, screenWidth, screenHeight);
            }
          }
        }
      }
    } else {
      // Mode brouillard classique : seulement les cellules du fogGrid
      fogGrid.forEach((isFogged, key) => {
        if (isFogged) {
          const [cellX, cellY] = key.split(',').map(Number);
          const x = cellX * fogCellSize;
          const y = cellY * fogCellSize;

          const screenX = (x / image.width) * scaledWidth - offset.x;
          const screenY = (y / image.height) * scaledHeight - offset.y;
          const screenWidth = (fogCellSize / image.width) * scaledWidth;
          const screenHeight = (fogCellSize / image.height) * scaledHeight;

          // Ne dessiner que si la cellule est visible à l'écran
          if (screenX + screenWidth >= 0 && screenX <= containerWidth &&
            screenY + screenHeight >= 0 && screenY <= containerHeight) {

            // Calculer l'opacité selon la distance aux joueurs
            const opacity = calculateFogOpacity(cellX, cellY);

            if (opacity > 0) { // Ne dessiner que si il y a une opacité
              // 🎯 Pour le MJ : 55% d'opacité, pour les joueurs : 90% d'opacité
              const effectiveIsMJ = isMJ && !playerViewMode;
              const finalOpacity = effectiveIsMJ ? opacity * 0.55 : opacity * 0.90;
              ctx.fillStyle = `rgba(0, 0, 0, ${finalOpacity})`;
              ctx.fillRect(screenX, screenY, screenWidth, screenHeight);
            }
          }
        }
      });
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
    if (currentPath.length > 0) {
      ctx.beginPath();
      currentPath.forEach((point, index) => {
        const x = (point.x / image.width) * scaledWidth - offset.x;
        const y = (point.y / image.height) * scaledHeight - offset.y;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
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

    // Draw each character
    characters.forEach((char, index) => {
      const x = (char.x / image.width) * scaledWidth - offset.x;
      const y = (char.y / image.height) * scaledHeight - offset.y;

      let isVisible = true;

      // 🎯 En mode "Vue Joueur", le MJ voit comme un joueur (pas les ennemis cachés)
      const effectiveIsMJ = isMJ && !playerViewMode;

      // 🎯 Vérifier si le personnage est dans le brouillard
      const isInFog = fullMapFog || isCellInFog(char.x, char.y);

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
            (player.type === 'joueurs' || player.visibility === 'ally') &&
            calculateDistance(x, y, playerX, playerY) <= player.visibilityRadius * zoom
          );
        });
      }



      if (isVisible) {
        // Set border color based on character type or if it is the player's character
        // Debug logs


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

        // Update Firestore with the download URL instead of the image data
        await updateDoc(doc(db, 'cartes', roomId, 'fond', 'fond1'), {
          url: downloadURL,
        });

        // Set the background image locally (optional, if needed for immediate display)
        setBackgroundImage(downloadURL);
      } catch (error) {
        console.error("Error uploading background image:", error);
      }
    }
  };


  const handleCharacterSubmit = async () => {
    if (newCharacter.name && newCharacter.image && roomId) {
      const storage = getStorage();
      const charactersCollectionRef = collection(db, 'cartes', roomId.toString(), 'characters');
      // Charger l'image dans Firebase Storage
      try {
        // Créez une référence pour l'image dans le dossier "characters"
        const imageRef = ref(storage, `characters/${newCharacter.name}-${Date.now()}`);
        const imageFile = newCharacter.image.src; // Image data URL
        // Extraire les données de l'image du Data URL
        const response = await fetch(imageFile);
        const blob = await response.blob();
        // Upload l'image dans Firebase Storage
        await uploadBytes(imageRef, blob);
        // Obtenez l'URL de téléchargement
        const imageURL = await getDownloadURL(imageRef);
        // Créer `nombre` personnages avec les mêmes statistiques et l'URL de l'image téléchargée
        for (let i = 1; i <= newCharacter.nombre; i++) {
          const characterName = `${newCharacter.name} ${i}`; // Ajouter un numéro au nom
          await addDoc(charactersCollectionRef, {
            Nomperso: characterName,
            imageURL2: imageURL,  // Utiliser imageURL2 pour l'image
            x: (Math.random() * (canvasRef.current?.width || 0) + offset.x) / zoom,
            y: (Math.random() * (canvasRef.current?.height || 0) + offset.y) / zoom,
            visibility: newCharacter.visibility,
            visibilityRadius: newCharacter.visibility === 'ally' ? visibilityRadius : 100,
            PV: newCharacter.PV,
            niveau: newCharacter.niveau,
            Defense: newCharacter.Defense,
            Contact: newCharacter.Contact,
            Distance: newCharacter.Distance,
            Magie: newCharacter.Magie,
            INIT: newCharacter.INIT,
            FOR: newCharacter.FOR,
            DEX: newCharacter.DEX,
            CON: newCharacter.CON,
            SAG: newCharacter.SAG,
            INT: newCharacter.INT,
            CHA: newCharacter.CHA,
            type: "pnj"
          });
        }

        // RéINITialiser les champs du formulaire
        setNewCharacter({
          name: '',
          image: null,
          niveau: 1,
          visibility: 'visible',
          PV: 10,
          Defense: 5,
          Contact: 5,
          Distance: 5,
          Magie: 5,
          INIT: 5,
          nombre: 1, // RéINITialiser le champ nombre
          FOR: 0,
          DEX: 0,
          CON: 0,
          SAG: 0,
          INT: 0,
          CHA: 0,
        });
        setDialogOpen(false);

      } catch (error) {
        console.error("Erreur lors du chargement de l'image dans Firebase Storage :", error);
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
    // Réinitialiser et ouvrir le dialog
    setNewNote({ text: '', color: '#ffff00', fontSize: 16 });
    setAddNoteDialogOpen(true);
  };

  const handleNoteSubmitNew = async () => {
    const roomIdStr = String(roomId);

    if (newNote.text.trim() && typeof roomIdStr === 'string') {
      try {
        await addDoc(collection(db, 'cartes', roomIdStr, 'text'), {
          content: newNote.text,
          color: newNote.color,
          fontSize: newNote.fontSize,
          x: (Math.random() * (canvasRef.current?.width || 0) + offset.x) / zoom,
          y: (Math.random() * (canvasRef.current?.height || 0) + offset.y) / zoom,
        });
        setAddNoteDialogOpen(false);
        setNewNote({ text: '', color: '#ffff00', fontSize: 16 });
      } catch (error) {
        console.error("Erreur lors de l'ajout de la note :", error);
      }
    } else {
      console.error("Erreur : texte ou roomId manquant ou invalide.");
    }
  };



  const handleCanvasMouseDown = async (e: React.MouseEvent<Element>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Stocker quel bouton de souris est pressé (0 = gauche, 1 = milieu, 2 = droit)
    setMouseButton(e.button);

    const containerWidth = containerRef.current?.getBoundingClientRect().width || rect.width;
    const containerHeight = containerRef.current?.getBoundingClientRect().height || rect.height;
    const image = new Image();
    image.src = backgroundImage;
    image.onload = async () => {
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

      // CLIC GAUCHE (button = 0) : SÉLECTION ET INTERACTIONS
      if (e.button === 0) {
        // 🎯 MODE DÉPLACEMENT DE CARTE - Priorité élevée
        if (panMode) {
          setIsDragging(true);
          setDragStart({ x: e.clientX, y: e.clientY });
          return;
        }

        // Gérer le double-clic pour ouvrir les fiches de personnage
        if (e.detail === 2) {
          const clickedCharIndex = characters.findIndex(char => {
            const charX = (char.x / image.width) * scaledWidth - offset.x;
            const charY = (char.y / image.height) * scaledHeight - offset.y;
            const clickRadius = char.type === 'joueurs' ? 30 * zoom : 20 * zoom;
            return Math.abs(charX - e.clientX + rect.left) < clickRadius && Math.abs(charY - e.clientY + rect.top) < clickRadius;
          });

          if (clickedCharIndex !== -1 && characters[clickedCharIndex].type === "joueurs") {
            const character = characters[clickedCharIndex];
            setSelectedCharacterForSheet(character.id);
            setShowCharacterSheet(true);
            return;
          }
        }

        // 🎯 NOUVEAU Mode brouillard - priorité élevée (placement continu)
        if (fogMode) {
          setIsFogDragging(true);
          const firstCellKey = getCellKey(clickX, clickY);
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
          setCurrentPath([{ x: clickX, y: clickY }]);
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
          return Math.abs(noteX - e.clientX + rect.left) < 50 * zoom && Math.abs(noteY - e.clientY + rect.top) < 20 * zoom;
        });

        // 🎯 NOUVEAU : Vérifier si on clique sur une cellule de brouillard
        const clickedFogIndex = isCellInFog(clickX, clickY) ? 0 : -1;

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
        } else if (clickedFogIndex !== -1) {
          setSelectedFogIndex(clickedFogIndex);
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedCharacters([]);
        } else {
          // Clic sur zone vide : Commencer une sélection par zone
          setSelectedCharacterIndex(null);
          setSelectedNoteIndex(null);
          setSelectedFogIndex(null);
          setSelectedCharacters([]);

          setSelectionStart({ x: clickX, y: clickY });
          setIsSelectingArea(true);
        }
      } // Fin du clic gauche
    };
  };


  const handleCanvasMouseMove = (e: React.MouseEvent<Element>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const containerWidth = containerRef.current?.clientWidth || rect.width;
    const containerHeight = containerRef.current?.clientHeight || rect.height;
    const image = new Image();
    image.src = backgroundImage;
    image.onload = () => {
      const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
      const scaledWidth = image.width * scale * zoom;
      const scaledHeight = image.height * scale * zoom;
      const currentX = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width;
      const currentY = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height;

      // 🎯 PRIORITÉ 0: Placement continu de brouillard pendant le drag
      if (isFogDragging && fogMode) {
        const addMode = isFogAddMode; // isFogAddMode stocke si on ajoute (true) ou supprime (false)
        addFogCellIfNew(currentX, currentY, addMode);
        return;
      }

      // 🎯 DÉPLACEMENT DE CARTE - Priorité élevée (clic milieu OU mode pan avec clic gauche)
      if (isDragging && (mouseButton === 1 || (mouseButton === 0 && panMode))) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setOffset((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
        return;
      }

      // 🎯 DRAG & DROP NOTE - Priorité élevée
      if (isDraggingNote && draggedNoteIndex !== null) {
        // Mettre à jour temporairement la position de la note
        setNotes(prev => prev.map((note, index) => {
          if (index === draggedNoteIndex) {
            return { ...note, x: currentX, y: currentY };
          }
          return note;
        }));
        return;
      }

      // 🎯 DRAG & DROP PERSONNAGE(S) - Priorité élevée
      if (isDraggingCharacter && draggedCharacterIndex !== null && draggedCharactersOriginalPositions.length > 0) {
        // Calculer le décalage depuis la position originale du personnage de référence
        const originalRefChar = draggedCharactersOriginalPositions.find(pos => pos.index === draggedCharacterIndex);
        if (originalRefChar) {
          const deltaX = currentX - originalRefChar.x;
          const deltaY = currentY - originalRefChar.y;

          // Mettre à jour temporairement la position de tous les personnages sélectionnés
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

      // 🎯 SÉLECTION PAR ZONE - Comportement principal
      if (isSelectingArea && selectionStart) {
        // Mettre à jour la fin de sélection
        setSelectionEnd({ x: currentX, y: currentY });

        // Sélectionner tous les éléments dans la zone (seulement ceux qui sont visibles)
        const selectedChars = characters
          .map((char, index) => {
            // Calculer la zone de sélection
            const minX = Math.min(selectionStart.x, currentX);
            const maxX = Math.max(selectionStart.x, currentX);
            const minY = Math.min(selectionStart.y, currentY);
            const maxY = Math.max(selectionStart.y, currentY);

            // Inclure tous les types de personnages et notes dans la sélection
            return (
              char.x >= minX &&
              char.x <= maxX &&
              char.y >= minY &&
              char.y <= maxY
            ) ? index : null;
          })
          .filter((index) => index !== null) as number[];

        setSelectedCharacters(selectedChars);
      };
      return;
    }

    // Mode dessin normal (sans brouillard)
    if (isDrawing && drawMode && !fogMode) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const containerWidth = containerRef.current?.clientWidth || rect.width;
      const containerHeight = containerRef.current?.clientHeight || rect.height;
      const image = new Image();
      image.src = backgroundImage;
      image.onload = () => {
        const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
        const scaledWidth = image.width * scale * zoom;
        const scaledHeight = image.height * scale * zoom;
        const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width;
        const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height;
        setCurrentPath((prev) => [...prev, { x, y }]);
      };
      return;
    }
  };


  const handleCanvasMouseUp = async () => {
    // Réinitialiser le bouton de souris
    const currentMouseButton = mouseButton;
    setMouseButton(null);

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

    // 🎯 NOUVEAU : Fin du placement continu de brouillard
    if (isFogDragging && fogMode) {
      setIsFogDragging(false);
      setIsFogAddMode(true); // Réinitialiser au mode ajout par défaut
      setLastFogCell(null);
      return;
    }

    // 🎯 Fin du mode dessin normal - Sauvegarder le tracé
    if (isDrawing && !fogMode && drawMode) {
      setIsDrawing(false);

      if ((typeof roomId === 'string' || typeof roomId === 'number') && String(roomId).trim() && currentPath.length > 0) {
        try {
          await addDoc(collection(db, 'cartes', String(roomId), 'drawings'), {
            paths: currentPath
          });
          setDrawings(prev => [...prev, currentPath]);
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
    setZoom((prev) => {
      const newZoom = Math.max(0.1, Math.min(5, prev + delta));
      const zoomFactor = newZoom / prev;
      setOffset((prev) => ({
        x: prev.x * zoomFactor,
        y: prev.y * zoomFactor
      }));
      return newZoom;
    });
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
    // Vérifie que `selectedNoteIndex` est valide
    if (selectedNoteIndex !== null && typeof roomIdStr === 'string') {
      const noteToDelete = notes[selectedNoteIndex];

      // Vérifie que la note a un `id` valide avant de supprimer
      if (typeof noteToDelete?.id === 'string') {
        try {
          await deleteDoc(doc(db, 'cartes', roomIdStr, 'text', noteToDelete.id));
          // Met à jour la liste des notes en retirant celle qui a été supprimée
          setNotes((prevNotes) => prevNotes.filter((_, index) => index !== selectedNoteIndex));
          setSelectedNoteIndex(null);
        } catch (error) {
          console.error("Erreur lors de la suppression de la note :", error);
        }
      } else {
        console.error("Erreur: noteToDelete.id n'est pas une chaîne valide.");
      }
    } else {
      console.error("Erreur : selectedNoteIndex est invalide ou roomId est manquant.");
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
      setNoteDialogOpen(true);
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
    if (!db) {
      console.error("Database instance 'db' is not initialisée.");
      return;
    }

    if (!roomId) {
      console.error("Room ID is missing or undefined.");
      return;
    }

    try {
      // Effacer toute la grille de brouillard
      setFogGrid(new Map());

      // Supprimer de Firebase
      const fogDocRef = doc(db, 'cartes', String(roomId), 'fog', 'fogData');
      await setDoc(fogDocRef, { grid: {} }, { merge: true });
    } catch (error) {
      console.error('Error clearing fog:', error);
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
      // Filtrer pour ne supprimer que les personnages non-joueurs
      const nonPlayerIndices = selectedCharacters.filter(index =>
        characters[index]?.type !== 'joueurs'
      );

      if (nonPlayerIndices.length > 0) {
        const deletePromises = nonPlayerIndices.map(async (index) => {
          const charToDelete = characters[index];
          if (charToDelete?.id) {
            await deleteDoc(doc(db, 'cartes', String(roomId), 'characters', charToDelete.id));
          }
        });

        await Promise.all(deletePromises);
        setCharacters(characters.filter((_, index) => !nonPlayerIndices.includes(index)));
      }

      setSelectedCharacters([]);
    }
  };



  // 🎯 SUPPRIMÉ : Anciennes fonctions de brouillard (toggleClearFogMode, handleDeleteFog)


  if (loading) {
    return <div>Chargement...</div>
  }

  if (!userId) {
    return <div>Veuillez vous connecter pour accéder à la carte</div>
  }

  return (
    <div className="flex flex-col relative">
      {/* 🎯 Contrôles de zoom flottants en haut à droite */}
      <div className="absolute top-4 right-4 z-[5] flex flex-col gap-2">
        <Button
          onClick={() => handleZoom(0.1)}
          className="w-10 h-10 p-0 bg-black/50 hover:bg-black/70 border border-gray-600 backdrop-blur-sm"
          title="Zoomer"
        >
          <Plus className="w-4 h-4" />
        </Button>
        <Button
          onClick={() => handleZoom(-0.1)}
          className="w-10 h-10 p-0 bg-black/50 hover:bg-black/70 border border-gray-600 backdrop-blur-sm"
          title="Dézoomer"
        >
          <Minus className="w-4 h-4" />
        </Button>
      </div>

      {/* 🎯 Indicateurs de mode actif en haut à gauche */}
      {(drawMode || fogMode || panMode || playerViewMode) && (
        <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
          {playerViewMode && isMJ && (
            <div className="text-xs text-purple-300 bg-black/70 backdrop-blur-sm p-3 rounded-lg border border-purple-500 shadow-lg">
              <div className="font-semibold mb-1">👁️ Vue Joueur Active</div>
              <div className="text-gray-300">Vous voyez la carte comme un joueur</div>
              <div className="text-gray-400 text-[10px] mt-1">Les ennemis cachés ne sont pas visibles</div>
            </div>
          )}
          {panMode && (
            <div className="text-xs text-blue-300 bg-black/70 backdrop-blur-sm p-3 rounded-lg border border-blue-500 shadow-lg">
              <div className="font-semibold mb-1">🔄 Mode Déplacement</div>
              <div className="text-gray-300">Cliquez et glissez pour déplacer la carte</div>
            </div>
          )}
          {drawMode && (
            <div className="text-xs text-yellow-300 bg-black/70 backdrop-blur-sm p-3 rounded-lg border border-yellow-500 shadow-lg">
              <div className="font-semibold mb-1">✏️ Mode Dessin</div>
              <div className="text-gray-300">Clic gauche pour dessiner</div>
            </div>
          )}
          {fogMode && (
            <div className="text-xs text-yellow-300 bg-black/70 backdrop-blur-sm p-3 rounded-lg border border-yellow-500 shadow-lg">
              <div className="font-semibold mb-1">🌫️ Mode Brouillard</div>
              <div className="text-gray-300">• Zone vide → Ajouter</div>
              <div className="text-gray-300">• Zone brouillée → Supprimer</div>
              {isMJ && (
                <Button
                  onClick={() => setShowFogGrid(!showFogGrid)}
                  className={`mt-2 text-xs h-7 w-full ${showFogGrid ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  <Grid className="w-3 h-3 mr-1" />
                  {showFogGrid ? 'Masquer grille' : 'Grille'}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Input caché pour le changement de fond */}
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
        >
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100vh' }}
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

      {selectedCharacterIndex !== null && isCharacterVisibleToUser(characters[selectedCharacterIndex]) && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[90vw]">
          <div className="flex flex-wrap gap-2 items-center justify-center bg-black/50 backdrop-blur-sm p-3 rounded-lg border border-gray-600">
            <Button className="button-primary">{characters[selectedCharacterIndex].name}</Button>

            {/* Slider de rayon de visibilité pour les personnages joueurs */}
            {characters[selectedCharacterIndex].type === 'joueurs' && (isMJ || characters[selectedCharacterIndex].id === persoId) && (
              <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg border border-gray-600">
                <ScanEye className="w-4 h-4 text-blue-400" />
                <input
                  type="range"
                  min="10"
                  max="500"
                  value={characters[selectedCharacterIndex].visibilityRadius || visibilityRadius}
                  onChange={(e) => {
                    const newRadius = parseInt(e.target.value, 10);
                    const charId = characters[selectedCharacterIndex].id;
                    if (charId && roomId) {
                      updateDoc(doc(db, 'cartes', String(roomId), 'characters', charId), {
                        visibilityRadius: newRadius
                      });
                      setCharacters(prevCharacters =>
                        prevCharacters.map((char, index) =>
                          index === selectedCharacterIndex
                            ? { ...char, visibilityRadius: newRadius }
                            : char
                        )
                      );
                    }
                  }}
                  className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-white text-sm font-medium min-w-[3rem]">
                  {Math.round(1 + ((characters[selectedCharacterIndex].visibilityRadius || visibilityRadius) - 10) / 490 * 29)}
                </span>
              </div>
            )}

            {/* Slider de rayon de visibilité pour les alliés (MJ uniquement) */}
            {characters[selectedCharacterIndex].visibility === 'ally' && isMJ && (
              <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg border border-green-600">
                <ScanEye className="w-4 h-4 text-green-400" />
                <input
                  type="range"
                  min="10"
                  max="500"
                  value={characters[selectedCharacterIndex].visibilityRadius || visibilityRadius}
                  onChange={(e) => {
                    const newRadius = parseInt(e.target.value, 10);
                    const charId = characters[selectedCharacterIndex].id;
                    if (charId && roomId) {
                      updateDoc(doc(db, 'cartes', String(roomId), 'characters', charId), {
                        visibilityRadius: newRadius
                      });
                      setCharacters(prevCharacters =>
                        prevCharacters.map((char, index) =>
                          index === selectedCharacterIndex
                            ? { ...char, visibilityRadius: newRadius }
                            : char
                        )
                      );
                    }
                  }}
                  className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-white text-sm font-medium min-w-[3rem]">
                  {Math.round(1 + ((characters[selectedCharacterIndex].visibilityRadius || visibilityRadius) - 10) / 490 * 29)}
                </span>
              </div>
            )}

            {isMJ || characters[selectedCharacterIndex].id === persoId ? (
              <>
                {characters[selectedCharacterIndex].type === 'joueurs' && (
                  <Button onClick={() => {
                    setSelectedCharacterForSheet(characters[selectedCharacterIndex].id);
                    setShowCharacterSheet(true);
                  }}>
                    fiche
                  </Button>
                )}
                {/* Boutons pour les personnages non-joueurs (MJ seulement) */}
                {isMJ && characters[selectedCharacterIndex]?.type !== 'joueurs' && (
                  <>
                    <Button
                      onClick={async () => {
                        const character = characters[selectedCharacterIndex];
                        if (character.id && roomId) {
                          try {
                            await updateDoc(doc(db, 'cartes', String(roomId), 'characters', character.id), {
                              visibility: 'visible'
                            });
                            setCharacters(prevCharacters =>
                              prevCharacters.map((char, index) =>
                                index === selectedCharacterIndex
                                  ? { ...char, visibility: 'visible' }
                                  : char
                              )
                            );
                          } catch (error) {
                            console.error("Erreur lors du changement de visibilité :", error);
                          }
                        }
                      }}
                      className={characters[selectedCharacterIndex].visibility === 'visible' ? 'bg-blue-600' : ''}
                    >
                      👁️ Visible
                    </Button>
                    <Button
                      onClick={async () => {
                        const character = characters[selectedCharacterIndex];
                        if (character.id && roomId) {
                          try {
                            await updateDoc(doc(db, 'cartes', String(roomId), 'characters', character.id), {
                              visibility: 'ally'
                            });
                            setCharacters(prevCharacters =>
                              prevCharacters.map((char, index) =>
                                index === selectedCharacterIndex
                                  ? { ...char, visibility: 'ally' }
                                  : char
                              )
                            );
                          } catch (error) {
                            console.error("Erreur lors du changement de visibilité :", error);
                          }
                        }
                      }}
                      className={characters[selectedCharacterIndex].visibility === 'ally' ? 'bg-green-600' : ''}
                    >
                      🤝 Allié
                    </Button>
                    <Button
                      onClick={async () => {
                        const character = characters[selectedCharacterIndex];
                        if (character.id && roomId) {
                          try {
                            await updateDoc(doc(db, 'cartes', String(roomId), 'characters', character.id), {
                              visibility: 'hidden'
                            });
                            setCharacters(prevCharacters =>
                              prevCharacters.map((char, index) =>
                                index === selectedCharacterIndex
                                  ? { ...char, visibility: 'hidden' }
                                  : char
                              )
                            );
                          } catch (error) {
                            console.error("Erreur lors du changement de visibilité :", error);
                          }
                        }
                      }}
                      className={characters[selectedCharacterIndex].visibility === 'hidden' ? 'bg-gray-600' : ''}
                    >
                      👁️‍🗨️ Caché
                    </Button>
                    <Button onClick={() => {
                      setCharacterToDelete(characters[selectedCharacterIndex]);
                      setConfirmDeleteOpen(true);
                    }}>
                      <X className="w-4 h-4 mr-2" /> Supprimer
                    </Button>
                    <Button onClick={handleEditCharacter}>
                      <Edit className="w-4 h-4 mr-2" /> Modifier
                    </Button>
                  </>
                )}

                {/* Bouton Attaquer pour TOUS les personnages (MJ seulement) */}
                {isMJ && (
                  <Button className="button-primary" onClick={handleAttack}>
                    <Edit className="w-4 h-4 mr-2" /> Attaquer
                  </Button>
                )}

                {/* Bouton modifier pour les personnages joueurs (MJ seulement) */}
                {characters[selectedCharacterIndex]?.type === 'joueurs' && isMJ && (
                  <Button onClick={handleEditCharacter}>
                    <Edit className="w-4 h-4 mr-2" /> Modifier
                  </Button>
                )}
              </>
            ) : (
              (isMJ || characters[selectedCharacterIndex].id !== persoId) && (
                <>
                  {(() => {
                    console.log('=== BUTTON DISPLAY DEBUG ===');
                    console.log('persoId:', persoId);
                    console.log('activePlayerId:', activePlayerId);
                    console.log('selectedCharacter:', characters[selectedCharacterIndex]);
                    console.log('selectedCharacter.id:', characters[selectedCharacterIndex]?.id);
                    console.log('selectedCharacter.type:', characters[selectedCharacterIndex]?.type);
                    console.log('selectedCharacter.id !== persoId:', characters[selectedCharacterIndex]?.id !== persoId);
                    console.log('isMJ:', isMJ);
                    console.log('Overall condition:', isMJ || characters[selectedCharacterIndex]?.id !== persoId);
                    console.log('=========================');
                    return null;
                  })()}
                  <Button className="button-primary" onClick={handleAttack}>
                    <Edit className="w-4 h-4 mr-2" /> Attaquer
                  </Button>
                  {characters[selectedCharacterIndex].type === 'joueurs' && (
                    <Button onClick={() => {
                      setSelectedCharacterForSheet(characters[selectedCharacterIndex].id);
                      setShowCharacterSheet(true);
                    }}>
                      Fiche
                    </Button>
                  )}
                </>
              )
            )}
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
            <Button onClick={clearFog}>
              <X className="w-4 h-4 mr-2" /> Supprimer le brouillard
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[rgb(36,36,36)] max-w-4xl text-[#c0a080]">
          <DialogHeader>
            <DialogTitle className="text-base">Ajouter un personnage</DialogTitle>
          </DialogHeader>
          <ScrollArea className="">
            <div className="space-y-2 py-1">
              {/* Section Informations générales */}
              <div className="space-y-1 ml-2">
                <h3 className="text-sm font-semibold border-b border-gray-600 pb-0.5 mb-1">Informations</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="nombre" className="text-xs">Nombre</Label>
                    <Input
                      id="nombre"
                      type="number"
                      value={newCharacter.nombre}
                      onChange={(e) => setNewCharacter({ ...newCharacter, nombre: parseInt(e.target.value) || 1 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="name" className="text-xs">Nom</Label>
                    <Input
                      id="name"
                      value={newCharacter.name}
                      onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Label htmlFor="image" className="text-xs">Image</Label>
                  <Input
                    id="image"
                    type="file"
                    onChange={handleCharacterImageChange}
                    className="h-10 mt-0.5"
                  />
                </div>
              </div>

              {/* Section Statistiques de combat */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold border-b border-gray-600 pb-0.5 mb-1">Combat</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="PV" className="text-xs">PV</Label>
                    <Input
                      id="PV"
                      type="number"
                      value={newCharacter.PV}
                      onChange={(e) => setNewCharacter({ ...newCharacter, PV: parseInt(e.target.value) || 100 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="niveau" className="text-xs">Niveau</Label>
                    <Input
                      id="niveau"
                      type="number"
                      value={newCharacter.niveau}
                      onChange={(e) => setNewCharacter({ ...newCharacter, niveau: parseInt(e.target.value) || 1 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="Defense" className="text-xs">Défense</Label>
                    <Input
                      id="Defense"
                      type="number"
                      value={newCharacter.Defense}
                      onChange={(e) => setNewCharacter({ ...newCharacter, Defense: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="INIT" className="text-xs">Init</Label>
                    <Input
                      id="INIT"
                      type="number"
                      value={newCharacter.INIT}
                      onChange={(e) => setNewCharacter({ ...newCharacter, INIT: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="Contact" className="text-xs">Contact</Label>
                    <Input
                      id="Contact"
                      type="number"
                      value={newCharacter.Contact}
                      onChange={(e) => setNewCharacter({ ...newCharacter, Contact: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="Distance" className="text-xs">Distance</Label>
                    <Input
                      id="Distance"
                      type="number"
                      value={newCharacter.Distance}
                      onChange={(e) => setNewCharacter({ ...newCharacter, Distance: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="Magie" className="text-xs">Magie</Label>
                    <Input
                      id="Magie"
                      type="number"
                      value={newCharacter.Magie}
                      onChange={(e) => setNewCharacter({ ...newCharacter, Magie: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Section Caractéristiques */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold border-b border-gray-600 pb-0.5 mb-1">Caractéristiques</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="FOR" className="text-xs">FOR</Label>
                    <Input
                      id="FOR"
                      type="number"
                      value={newCharacter.FOR}
                      onChange={(e) => setNewCharacter({ ...newCharacter, FOR: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="DEX" className="text-xs">DEX</Label>
                    <Input
                      id="DEX"
                      type="number"
                      value={newCharacter.DEX}
                      onChange={(e) => setNewCharacter({ ...newCharacter, DEX: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="CON" className="text-xs">CON</Label>
                    <Input
                      id="CON"
                      type="number"
                      value={newCharacter.CON}
                      onChange={(e) => setNewCharacter({ ...newCharacter, CON: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="SAG" className="text-xs">SAG</Label>
                    <Input
                      id="SAG"
                      type="number"
                      value={newCharacter.SAG}
                      onChange={(e) => setNewCharacter({ ...newCharacter, SAG: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="INT" className="text-xs">INT</Label>
                    <Input
                      id="INT"
                      type="number"
                      value={newCharacter.INT}
                      onChange={(e) => setNewCharacter({ ...newCharacter, INT: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                  <div>
                    <Label htmlFor="CHA" className="text-xs">CHA</Label>
                    <Input
                      id="CHA"
                      type="number"
                      value={newCharacter.CHA}
                      onChange={(e) => setNewCharacter({ ...newCharacter, CHA: parseInt(e.target.value) || 0 })}
                      className="h-7 mt-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Section Visibilité */}
              <div className="space-y-1">
                <h3 className="text-sm font-semibold border-b border-gray-600 pb-0.5 mb-1">Visibilité</h3>
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => setNewCharacter({ ...newCharacter, visibility: 'visible' })}
                      className={`flex-1 h-7 text-xs px-2 ${newCharacter.visibility === 'visible' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                      👁️ Visible
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setNewCharacter({ ...newCharacter, visibility: 'ally' })}
                      className={`flex-1 h-7 text-xs px-2 ${newCharacter.visibility === 'ally' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                      🤝 Allié
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setNewCharacter({ ...newCharacter, visibility: 'hidden' })}
                      className={`flex-1 h-7 text-xs px-2 ${newCharacter.visibility === 'hidden' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                    >
                      👁️‍🗨️ Caché
                    </Button>
                  </div>
                  {newCharacter.visibility === 'ally' && (
                    <div>
                      <Label htmlFor="visibilityRadiusNew" className="text-xs">Rayon de vision</Label>
                      <div className="flex items-center gap-2 mt-0.5">
                        <input
                          id="visibilityRadiusNew"
                          type="range"
                          min="10"
                          max="500"
                          value={visibilityRadius}
                          onChange={(e) => setVisibilityRadius(parseInt(e.target.value) || 100)}
                          className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-xs text-white font-medium min-w-[2.5rem]">
                          {Math.round(1 + (visibilityRadius - 10) / 490 * 29)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={handleCharacterSubmit}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="bg-[rgb(36,36,36)] max-w-3xl text-[#c0a080]">
          <DialogHeader>
            <DialogTitle>Modifier la note</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="noteText" className="text-right">Texte</Label>
              <Input
                id="noteText"
                value={editingNote?.text || ''}
                onChange={(e) => setEditingNote({ ...editingNote, text: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="noteColor" className="text-right">Couleur</Label>
              <Input
                id="noteColor"
                type="color"
                value={editingNote?.color || '#ffff00'}
                onChange={(e) => setEditingNote({ ...editingNote, color: e.target.value })}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleNoteSubmit}>Modifier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pour ajouter une nouvelle note */}
      <Dialog open={addNoteDialogOpen} onOpenChange={setAddNoteDialogOpen}>
        <DialogContent className="bg-[rgb(36,36,36)] max-w-md text-[#c0a080]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center mb-4">📝 Créer une note</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Texte de la note */}
            <div className="space-y-2">
              <Label htmlFor="newNoteText" className="text-lg font-medium">Texte de la note</Label>
              <textarea
                id="newNoteText"
                value={newNote.text}
                onChange={(e) => setNewNote({ ...newNote, text: e.target.value })}
                className="w-full h-24 p-3 bg-[rgb(50,50,50)] border border-gray-600 rounded-lg text-white resize-none focus:ring-2 focus:ring-[#c0a080] focus:border-[#c0a080]"
                placeholder="Entrez votre note ici..."
              />
            </div>

            {/* Couleur */}
            <div className="space-y-2">
              <Label htmlFor="newNoteColor" className="text-lg font-medium">Couleur du texte</Label>
              <div className="flex items-center space-x-3">
                <input
                  id="newNoteColor"
                  type="color"
                  value={newNote.color}
                  onChange={(e) => setNewNote({ ...newNote, color: e.target.value })}
                  className="w-12 h-12 rounded-lg border-2 border-gray-600 cursor-pointer"
                />
                <div className="flex space-x-2">
                  {/* Couleurs prédéfinies */}
                  {['#ffff00', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'].map(color => (
                    <button
                      key={color}
                      onClick={() => setNewNote({ ...newNote, color })}
                      className={`w-8 h-8 rounded-full border-2 ${newNote.color === color ? 'border-white' : 'border-gray-600'} transition-all hover:scale-110`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Taille de police */}
            <div className="space-y-2">
              <Label htmlFor="newNoteFontSize" className="text-lg font-medium">Taille du texte</Label>
              <div className="space-y-2">
                <input
                  id="newNoteFontSize"
                  type="range"
                  min="12"
                  max="48"
                  value={newNote.fontSize}
                  onChange={(e) => setNewNote({ ...newNote, fontSize: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Petit (12px)</span>
                  <span className="font-medium" style={{ color: newNote.color, fontSize: `${Math.min(newNote.fontSize, 24)}px` }}>
                    Aperçu ({newNote.fontSize}px)
                  </span>
                  <span>Grand (48px)</span>
                </div>
              </div>
            </div>

            {/* Aperçu de la note */}
            <div className="bg-[rgb(50,50,50)] p-4 rounded-lg border border-gray-600">
              <Label className="text-sm text-gray-400 mb-2 block">Aperçu :</Label>
              <div
                style={{
                  color: newNote.color,
                  fontSize: `${Math.min(newNote.fontSize, 24)}px`,
                  lineHeight: '1.4'
                }}
                className="font-medium"
              >
                {newNote.text || 'Votre texte apparaîtra ici...'}
              </div>
            </div>
          </div>
          <DialogFooter className="flex space-x-3">
            <Button
              variant="outline"
              onClick={() => setAddNoteDialogOpen(false)}
              className="px-6 py-2 border-gray-600 text-gray-300 hover:bg-gray-700"
            >
              Annuler
            </Button>
            <Button
              onClick={handleNoteSubmitNew}
              disabled={!newNote.text.trim()}
              className="px-6 py-2 bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ✨ Créer la note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={characterDialogOpen} onOpenChange={setCharacterDialogOpen}>
        <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] max-w-3xl">
          <DialogHeader>
            <DialogTitle>Modifier le personnage</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-96"> {/* Ajouter ScrollArea ici */}
            <div className="grid gap-4 py-4">
              {/* Nom Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="characterName" className="text-right text-white">Nom</Label>
                <Input
                  id="characterName"
                  value={editingCharacter?.name || ''}
                  onChange={(e) => {
                    if (editingCharacter) { // Vérifie que `editingCharacter` n'est pas null
                      setEditingCharacter({ ...editingCharacter, name: e.target.value });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* Image Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="characterImage" className="text-right text-white">Image</Label>
                <Input
                  id="characterImage"
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null;
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                          if (editingCharacter) { // Vérifie que `editingCharacter` n'est pas null
                            setEditingCharacter({ ...editingCharacter, image: img });
                          }
                        };
                        if (typeof e.target?.result === 'string') {
                          img.src = e.target.result;
                        }
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* PV Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="PV" className="text-right text-white">PV</Label>
                <Input
                  id="PV"
                  type="number"
                  value={editingCharacter?.PV || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, PV: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* niveau Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="niveau" className="text-right text-white">Niveau</Label>
                <Input
                  id="niveau"
                  type="number"
                  value={editingCharacter?.niveau || 1}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, niveau: parseInt(e.target.value) || 1 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* Contact Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="Contact" className="text-right text-white">Contact</Label>
                <Input
                  id="Contact"
                  type="number"
                  value={editingCharacter?.Contact || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, Contact: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* Distance Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="Distance" className="text-right text-white">Distance</Label>
                <Input
                  id="Distance"
                  type="number"
                  value={editingCharacter?.Distance || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, Distance: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* Distance Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="Magie" className="text-right text-white">Magie</Label>
                <Input
                  id="Magie"
                  type="number"
                  value={editingCharacter?.Magie || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, Magie: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* INIT Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="INIT" className="text-right text-white">INIT</Label>
                <Input
                  id="INIT"
                  type="number"
                  value={editingCharacter?.INIT || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, INIT: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="FOR" className="text-right text-white">FOR</Label>
                <Input
                  id="FOR"
                  type="number"
                  value={editingCharacter?.FOR || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, FOR: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="DEX" className="text-right text-white">DEX</Label>
                <Input
                  id="DEX"
                  type="number"
                  value={editingCharacter?.DEX || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, DEX: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="CON" className="text-right text-white">CON</Label>
                <Input
                  id="CON"
                  type="number"
                  value={editingCharacter?.CON || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, CON: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="SAG" className="text-right text-white">SAG</Label>
                <Input
                  id="SAG"
                  type="number"
                  value={editingCharacter?.SAG || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, SAG: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="INT" className="text-right text-white">INT</Label>
                <Input
                  id="INT"
                  type="number"
                  value={editingCharacter?.INT || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, INT: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="CHA" className="text-right text-white">CHA</Label>
                <Input
                  id="CHA"
                  type="number"
                  value={editingCharacter?.CHA || 0}
                  onChange={(e) => {
                    if (editingCharacter) {
                      setEditingCharacter({ ...editingCharacter, CHA: parseInt(e.target.value) || 0 });
                    }
                  }}
                  className="col-span-3"
                />
              </div>
              {/* Visibility Field */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="visibility" className="text-right text-white">Visibilité</Label>
                <div className="col-span-3 flex gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      if (editingCharacter) {
                        setEditingCharacter({ ...editingCharacter, visibility: 'visible' });
                      }
                    }}
                    className={`flex-1 ${editingCharacter?.visibility === 'visible' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                  >
                    👁️ Visible
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (editingCharacter) {
                        setEditingCharacter({ ...editingCharacter, visibility: 'ally' });
                      }
                    }}
                    className={`flex-1 ${editingCharacter?.visibility === 'ally' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                  >
                    🤝 Allié
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (editingCharacter) {
                        setEditingCharacter({ ...editingCharacter, visibility: 'hidden' });
                      }
                    }}
                    className={`flex-1 ${editingCharacter?.visibility === 'hidden' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gray-700 hover:bg-gray-600'}`}
                  >
                    👁️‍🗨️ Caché
                  </Button>
                </div>
              </div>
              {/* Visibility Radius Field - Affiché seulement pour les joueurs et alliés */}
              {(editingCharacter?.type === 'joueurs' || editingCharacter?.visibility === 'ally') && (
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="visibilityRadius" className="text-right text-white">Rayon de vision</Label>
                  <div className="col-span-3 flex items-center gap-2">
                    <input
                      id="visibilityRadius"
                      type="range"
                      min="10"
                      max="500"
                      value={editingCharacter?.visibilityRadius || 100}
                      onChange={(e) => {
                        if (editingCharacter) {
                          setEditingCharacter({ ...editingCharacter, visibilityRadius: parseInt(e.target.value) || 100 });
                        }
                      }}
                      className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-sm text-white font-medium min-w-[3rem]">
                      {Math.round(1 + ((editingCharacter?.visibilityRadius || 100) - 10) / 490 * 29)}
                    </span>
                  </div>
                </div>
              )}
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

      {showCharacterSheet && selectedCharacterForSheet && roomId && (
        <CharacterSheet
          characterId={selectedCharacterForSheet}
          roomId={roomId}
          onClose={() => {
            setShowCharacterSheet(false);
            setSelectedCharacterForSheet(null);
          }}
        />
      )}
    </div>
  );
}
