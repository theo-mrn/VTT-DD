"use client"

import React, { useState, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useGame } from '@/contexts/GameContext'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { X, Plus, Minus, Move, Edit, Pencil, Eraser, CircleUserRound, Baseline, ChevronRight, ChevronLeft, User, Grid } from 'lucide-react'
import { auth, db, onAuthStateChanged, doc, getDoc, getDocs, collection, onSnapshot, updateDoc, addDoc, deleteDoc, setDoc } from '@/lib/firebase'
import Combat from '@/components/combat2';  // Importez le composant de combat
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ScrollArea } from "@/components/ui/scroll-area";
import CharacterSheet from '@/components/CharacterSheet'; // Importez le composant de fiche de personnage


export default function Component() {
  const params = useParams();
  const roomId = params.roomid as string;
  const { isMJ, persoId, playerData, setIsMJ, setPersoId, setPlayerData } = useGame();
  
  // Debug log to check context values
  console.log('Map component - isMJ:', isMJ, 'persoId:', persoId, 'playerData:', playerData);
  
  const [combatOpen, setCombatOpen] = useState(false);
  const [attackerId, setAttackerId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
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
    niveau :1,
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
  const [isMoving, setIsMoving] = useState(false)
  
  // 🎯 NOUVEAUX ÉTATS pour le drag & drop des personnages
  const [isDraggingCharacter, setIsDraggingCharacter] = useState(false)
  const [draggedCharacterIndex, setDraggedCharacterIndex] = useState<number | null>(null)

  const [draggedCharactersOriginalPositions, setDraggedCharactersOriginalPositions] = useState<{index: number, x: number, y: number}[]>([])
  
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
  const [toolbarVisible, setToolbarVisible] = useState(false);
  // 🎯 NOUVEAU SYSTÈME DE BROUILLARD PAR QUADRILLAGE
  const [fogMode, setFogMode] = useState(false);
  const [fogGrid, setFogGrid] = useState<Map<string, boolean>>(new Map()); // clé: "x,y", valeur: true = brouillard
  const fogCellSize = 100; // Taille d'une cellule de brouillard en pixels
  const [showFogGrid, setShowFogGrid] = useState(false); // Pour afficher/masquer la grille
  const [isFogDragging, setIsFogDragging] = useState(false); // Pour le placement continu de brouillard
  const [lastFogCell, setLastFogCell] = useState<string | null>(null); // Dernière cellule touchée pour éviter les doublons
  const [isFogAddMode, setIsFogAddMode] = useState(true); // Pour savoir si on ajoute (true) ou supprime (false) du brouillard
  const [fullMapFog, setFullMapFog] = useState(false); // Pour couvrir toute la carte de brouillard
  const [isSelecting, setIsSelecting] = useState(true);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null);
  const [isSelectingArea, setIsSelectingArea] = useState(false);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [selectedFogIndex, setSelectedFogIndex] = useState<number | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [characterToDelete, setCharacterToDelete] = useState<Character | null>(null);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        INITializeFirebaseListeners(roomId);
        
        // If context is empty, try to restore player data from Firebase
        if (!persoId && !isMJ) {
          await restorePlayerDataFromFirebase(user.uid);
        }
      } else {
        setUserId(null);
      }
    });
    return () => unsubscribe();
  }, [roomId, persoId, isMJ]);
  

  type Character = {
    niveau : number,
    id: string;
    name: string;
    x: number;
    y: number;
    image: HTMLImageElement;
    visibility: 'visible' | 'hidden';
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
    niveau : number;
    name: string;
    image: { src: string } | null;
    visibility: 'visible' | 'hidden';
    PV: number;
    Defense: number;
    Contact: number;
    Distance: number;
    Magie: number;
    INIT: number;
    nombre :number
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
}, [backgroundImage, showGrid, zoom, offset, characters, notes, selectedCharacterIndex, selectedNoteIndex, drawings, currentPath, fogGrid, showFogGrid, fullMapFog, isSelectingArea, selectionStart, selectionEnd, selectedCharacters, isDraggingCharacter, draggedCharacterIndex, draggedCharactersOriginalPositions, isDraggingNote, draggedNoteIndex, isFogDragging]);


  // Firebase Functions
  
  const restorePlayerDataFromFirebase = async (uid: string) => {
    try {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        if (userData.role === 'MJ') {
          setIsMJ(true);
          setPersoId(null);
          setPlayerData(null);
        } else if (userData.persoId) {
          // Get full character data
          const characterRef = doc(db, `cartes/${roomId}/characters`, userData.persoId);
          const characterDoc = await getDoc(characterRef);
          
          if (characterDoc.exists()) {
            const characterData = characterDoc.data();
            const fullCharacterData = { 
              id: userData.persoId, 
              Nomperso: characterData.Nomperso || userData.perso,
              ...characterData 
            };
            
            setIsMJ(false);
            setPersoId(userData.persoId);
            setPlayerData(fullCharacterData);
            
            console.log('Restored player data from Firebase:', {
              persoId: userData.persoId,
              playerData: fullCharacterData
            });
          }
        }
      }
    } catch (error) {
      console.error('Error restoring player data:', error);
    }
  };
  
  const handleAttack = () => {
    if (persoId && selectedCharacterIndex !== null) {
      const targetCharacter = characters[selectedCharacterIndex];
      if (targetCharacter && targetCharacter.id) {  // Add null check
        setAttackerId(persoId);           // L'attaquant est l'utilisateur actuel
        setTargetId(targetCharacter.id);   // La cible est le personnage sélectionné
        setCombatOpen(true);               // Ouvrir le composant de combat
      }
    }
  };


  const INITializeFirebaseListeners = (room:string) => {
    const fondRef = doc(db, 'cartes', room.toString(), 'fond', 'fond1');
    onSnapshot(fondRef, (doc) => {
      if (doc.exists() && doc.data().url) {
        setBackgroundImage(doc.data().url);
      }
    });
    // Charger les personnages
const charactersRef = collection(db, 'cartes', room.toString(), 'characters');
onSnapshot(charactersRef, (snapshot) => {
  const chars: Character[] = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const img = new Image();
    img.src = data.imageURL2 || data.imageURL; // Utiliser imageURL2 si disponible, sinon imageURL

    // Ajoutez tous les champs requis
    chars.push({
      id: doc.id,
      niveau : data.niveau ||1,
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
  
  const calculateDistance = (x1:number, y1:number, x2:number, y2:number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
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
    
    // Vérifier la distance à tous les personnages joueurs
    characters.forEach(character => {
      if (character.type === 'joueurs' && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
        const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
        const cellCenterY = cellY * fogCellSize + fogCellSize / 2;
        const distance = calculateDistance(character.x, character.y, cellCenterX, cellCenterY);
        
        // 🎯 Zone d'influence étendue à 2x le rayon de visibilité
        const extendedRadius = character.visibilityRadius * 2;
        
        if (distance <= extendedRadius) {
          let opacity;
          
          if (distance <= character.visibilityRadius * 0.8) {
            // Zone très proche : complètement visible (opacité = 0)
            opacity = 0;
          } else if (distance <= character.visibilityRadius * 1.2) {
            // Zone de visibilité : transition douce de 0 à 0.3
            const normalizedDistance = (distance - character.visibilityRadius * 0.8) / (character.visibilityRadius * 0.4);
            opacity = normalizedDistance * 0.3;
          } else if (distance <= character.visibilityRadius * 1.6) {
            // Zone intermédiaire : transition de 0.3 à 0.7
            const normalizedDistance = (distance - character.visibilityRadius * 1.2) / (character.visibilityRadius * 0.4);
            opacity = 0.3 + (normalizedDistance * 0.4);
          } else {
            // Zone étendue : transition de 0.7 à 1.0
            const extendedDistance = (distance - character.visibilityRadius * 1.6) / (character.visibilityRadius * 0.4);
            opacity = 0.7 + (extendedDistance * 0.3);
          }
          
          opacity = Math.max(0, Math.min(1, opacity));
          minOpacity = Math.min(minOpacity, opacity);
        }
      }
    });
    
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
            
            // Calculer l'opacité selon la distance aux joueurs (même si pas dans fogGrid)
            let opacity = 1; // Opacité par défaut pour toute la carte
            
            // Vérifier la distance à tous les personnages joueurs
            characters.forEach(character => {
              if (character.type === 'joueurs' && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
                const cellCenterX = cellX * fogCellSize + fogCellSize / 2;
                const cellCenterY = cellY * fogCellSize + fogCellSize / 2;
                const distance = calculateDistance(character.x, character.y, cellCenterX, cellCenterY);
                
                const extendedRadius = character.visibilityRadius * 2;
                
                if (distance <= extendedRadius) {
                  let cellOpacity;
                  
                  if (distance <= character.visibilityRadius * 0.8) {
                    cellOpacity = 0;
                  } else if (distance <= character.visibilityRadius * 1.2) {
                    const normalizedDistance = (distance - character.visibilityRadius * 0.8) / (character.visibilityRadius * 0.4);
                    cellOpacity = normalizedDistance * 0.3;
                  } else if (distance <= character.visibilityRadius * 1.6) {
                    const normalizedDistance = (distance - character.visibilityRadius * 1.2) / (character.visibilityRadius * 0.4);
                    cellOpacity = 0.3 + (normalizedDistance * 0.4);
                  } else {
                    const extendedDistance = (distance - character.visibilityRadius * 1.6) / (character.visibilityRadius * 0.4);
                    cellOpacity = 0.7 + (extendedDistance * 0.3);
                  }
                  
                  cellOpacity = Math.max(0, Math.min(1, cellOpacity));
                  opacity = Math.min(opacity, cellOpacity);
                }
              }
            });
            
            if (opacity > 0) {
              ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
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
              ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
              ctx.fillRect(screenX, screenY, screenWidth, screenHeight);
            }
          }
        }
      });
    }
    
    // 🎯 Optionnel : Dessiner les cercles de visibilité des joueurs (pour debug)
    if (isMJ && showFogGrid) {
      characters.forEach(character => {
        if (character.type === 'joueurs' && character.visibilityRadius && character.x !== undefined && character.y !== undefined) {
          const playerScreenX = (character.x / image.width) * scaledWidth - offset.x;
          const playerScreenY = (character.y / image.height) * scaledHeight - offset.y;
          const radiusScreen = (character.visibilityRadius / image.width) * scaledWidth;
          
          ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
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
      if (char.visibility === 'hidden') {
        isVisible = isMJ || characters.some((player) => {
          const playerX = (player.x / image.width) * scaledWidth - offset.x;
          const playerY = (player.y / image.height) * scaledHeight - offset.y;
          return (
            player.type === 'joueurs' &&
            calculateDistance(x, y, playerX, playerY) <= player.visibilityRadius * zoom
          );
        });
      }
  
  
  
      if (isVisible) {
        // Set border color based on character type or if it is the player's character
        // Debug logs
        if (char.type === 'joueurs') {
          console.log('Character:', char.name, 'ID:', char.id, 'Player ID:', persoId, 'Match:', char.id === persoId);
        }
        
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
            borderColor = char.id === persoId 
              ? 'rgba(255, 0, 0, 0.8)'           // Red for the player's character
              : char.type === 'joueurs' 
              ? 'rgba(0, 0, 255, 0.8)'           // Blue for other 'joueurs' type characters
              : 'rgba(255, 165, 0, 0.8)';        // Orange for other characters (e.g., NPCs)
          }
        } else {
          // Couleur normale selon le type
          borderColor = char.id === persoId 
            ? 'rgba(255, 0, 0, 0.8)'           // Red for the player's character
            : char.type === 'joueurs' 
            ? 'rgba(0, 0, 255, 0.8)'           // Blue for other 'joueurs' type characters
            : 'rgba(255, 165, 0, 0.8)';        // Orange for other characters (e.g., NPCs)
        }
          
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = lineWidth;
  
        // Draw character border circle
        ctx.beginPath();
        ctx.arc(x, y, 22 * zoom, 0, 2 * Math.PI);  // Slightly larger than the character icon
        ctx.stroke();
  
        // Draw character icon
        if (char.image) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 20 * zoom, 0, 2 * Math.PI);
          ctx.clip();
          ctx.drawImage(char.image, x - 20 * zoom, y - 20 * zoom, 40 * zoom, 40 * zoom);
          ctx.restore();
        } else {
          ctx.fillStyle = 'red';
          ctx.beginPath();
          ctx.arc(x, y, 20 * zoom, 0, 2 * Math.PI);
          ctx.fill();
        }
  
        // Draw discreet level badge at the bottom-right of the character icon
        const badgeRadius = 8 * zoom;  // Smaller and more discreet badge
        const badgeX = x + 16 * zoom;  // Positioning the badge slightly further out
        const badgeY = y + 16 * zoom;
  
        // Set badge color: Red if it's the player's character, Blue for 'joueurs', Orange for others
        ctx.fillStyle = char.id === persoId 
          ? 'rgba(255, 0, 0, 1)'             // Red for the player's character
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
  
      // Draw hidden status badge if character is hidden
      if (char.visibility === 'hidden' && isMJ) {
        const badgeX = x + 16 * zoom; // Positioning the badge at the top-right
        const badgeY = y - 16 * zoom;
  
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
  
      // Draw visibility radius if character is of type 'joueurs' and is selected
      if (char.type === 'joueurs' && index === selectedCharacterIndex) {
        ctx.fillStyle = 'rgba(0, 0, 255, 0.2)'; // Light blue with transparency
        ctx.beginPath();
        ctx.arc(x, y, char.visibilityRadius * zoom, 0, 2 * Math.PI);
        ctx.fill();
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
                  PV: newCharacter.PV,
                  niveau : newCharacter.niveau,
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
              niveau : 1,
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

    // Gérer le double-clic pour ouvrir les fiches de personnage
    if (e.detail === 2) {
      const clickedCharIndex = characters.findIndex(char => {
        const charX = (char.x / image.width) * scaledWidth - offset.x;
        const charY = (char.y / image.height) * scaledHeight - offset.y;
        return Math.abs(charX - e.clientX + rect.left) < 20 * zoom && Math.abs(charY - e.clientY + rect.top) < 20 * zoom;
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

    // Mode déplacement - priorité élevée
    if (isMoving) {
      if (selectedCharacterIndex !== null) {
        const charToMove = characters[selectedCharacterIndex];
        if ((typeof roomId === 'string' || typeof roomId === 'number') && String(roomId).trim() && typeof charToMove?.id === 'string' && charToMove.id.trim()) {
          await updateDoc(doc(db, 'cartes', String(roomId), 'characters', charToMove.id), {
            x: clickX,
            y: clickY
          });
        } else {
          console.error("Erreur: roomId ou charToMove.id n'est pas une chaîne valide.");
        }
      } else if (selectedNoteIndex !== null) {
        const noteToMove = notes[selectedNoteIndex];
        if ((typeof roomId === 'string' || typeof roomId === 'number') && String(roomId).trim() && typeof noteToMove?.id === 'string' && noteToMove.id.trim()) {
          await updateDoc(doc(db, 'cartes', String(roomId), 'text', noteToMove.id), {
            x: clickX,
            y: clickY
          });
        } else {
          console.error("Erreur: roomId ou noteToMove.id n'est pas une chaîne valide.");
        }
      } else if (selectedCharacters.length > 0) {
        const updatePromises = selectedCharacters.map(async (index) => {
          const charToMove = characters[index];
          if (charToMove?.id) {
            const deltaX = charToMove.x - characters[selectedCharacters[0]].x;
            const deltaY = charToMove.y - characters[selectedCharacters[0]].y;
            await updateDoc(doc(db, 'cartes', String(roomId), 'characters', charToMove.id), {
              x: clickX + deltaX,
              y: clickY + deltaY
            });
          }
        });
        await Promise.all(updatePromises);
        setSelectedCharacters([]);
      }
      setIsMoving(false);
      setSelectedCharacterIndex(null);
      setSelectedNoteIndex(null);
      return;
    }

    // 🎯 MODE SÉLECTION PAR DÉFAUT - Nouveau comportement principal
    // Vérifier si on clique sur un élément existant
    const clickedCharIndex = characters.findIndex(char => {
      const charX = (char.x / image.width) * scaledWidth - offset.x;
      const charY = (char.y / image.height) * scaledHeight - offset.y;
      return Math.abs(charX - e.clientX + rect.left) < 20 * zoom && Math.abs(charY - e.clientY + rect.top) < 20 * zoom;
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
          // Joueur peut seulement déplacer son propre personnage (type joueurs)
          return character.type === 'joueurs' && character.id === persoId;
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
        
        // Calculer l'offset entre la position du personnage cliqué et le clic

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
      // 🎯 COMPORTEMENT SELON LE MODE
      if (isSelecting) {
        // Mode sélection : Commencer une sélection par zone
        setSelectedCharacterIndex(null);
        setSelectedNoteIndex(null);
        setSelectedFogIndex(null);
        setSelectedCharacters([]);
        
        setSelectionStart({ x: clickX, y: clickY });
        setIsSelectingArea(true);
      } else {
        // Mode déplacement carte : Commencer le drag de la carte
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    }
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

    // 🎯 DÉPLACEMENT DE CARTE - Priorité élevée si mode déplacement activé
    if (isDragging && !isSelecting) {
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
      
      // Sélectionner tous les éléments dans la zone
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
        console.log(`Note déplacée vers (${Math.round(draggedNote.x)}, ${Math.round(draggedNote.y)})`);
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
      
      const results = await Promise.all(updatePromises);
      const movedCharacters = results.filter(result => result !== null);
      
      if (movedCharacters.length > 0) {
        console.log(`Personnages déplacés: ${movedCharacters.join(', ')}`);
      }
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

  // Fin du déplacement de carte
  setIsDragging(false);

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
        console.log(`Tracé sauvegardé avec ${currentPath.length} points`);
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
    console.log("Appel de handleDeleteNote");
    console.log("Valeur de selectedNoteIndex:", selectedNoteIndex);
    console.log("Type de roomId:", typeof roomId, "Valeur de roomId:", roomId);
    // Convertir roomId en chaîne de caractères
    const roomIdStr = String(roomId);
    // Vérifie que `selectedNoteIndex` est valide
    if (selectedNoteIndex !== null && typeof roomIdStr === 'string') {
      const noteToDelete = notes[selectedNoteIndex];
      console.log("Note à supprimer:", noteToDelete);
  
      // Vérifie que la note a un `id` valide avant de supprimer
      if (typeof noteToDelete?.id === 'string') {
        try {
          await deleteDoc(doc(db, 'cartes', roomIdStr, 'text', noteToDelete.id));
          console.log("Note supprimée avec succès");
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
    console.log("roomId:", roomId);
    console.log("noteToUpdate:", noteToUpdate);
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
    <div className="flex flex-col">
<div className="flex flex-row-reverse right-0">
  <div className="flex flex-row h-full absolute z-50 ">
    {/* Toggle button for toolbar visibility */}
    <Button onClick={() => setToolbarVisible(!toolbarVisible)} className="self-center">
      {toolbarVisible ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
    </Button>

    {/* Toolbar: conditionally rendered */}
    {toolbarVisible && (
      <div className="flex flex-col gap-6 w-64 rounded-lg  p-6 bg-[var(--bg-dark)] self-center text-white">
        {/* 🎯 Indicateur de statut */}
        <div className="text-center text-sm space-y-1 border-b border-gray-600 pb-3">
          <div className="text-gray-300">{isMJ ? '🎲 Maître du Jeu' : '👤 Joueur'}</div>
          <div className="text-xs text-gray-400">
            Drag personnage = Déplacer | Drag zone vide = Sélectionner
          </div>
        </div>
        
        <div className='flex flex-row gap-6 justify-center'>
        <Button className="button-primary " onClick={() => handleZoom(-0.1)}>
          <Minus className="w-4 h-4" />
        </Button>
        <Button className="button-primary" onClick={() => handleZoom(0.1)}>
          <Plus className="w-4 h-4" />
        </Button>
        </div>
       

        <div className="flex items-center space-x-2">
          <Switch
            className="bg-primary"
            id="grid-switch"
            checked={showGrid}
            onCheckedChange={setShowGrid}
          />
          <Label htmlFor="grid-switch">Quadrillage</Label>
        </div>

        {isMJ && (
          <div className="flex items-center space-x-2">
            <Switch
              className="bg-primary"
              id="full-fog-switch"
              checked={fullMapFog}
              onCheckedChange={handleFullMapFogChange}
            />
            <Label htmlFor="full-fog-switch">Brouillard sur toute la carte</Label>
          </div>
        )}

        <div className="flex items-center space-x-2">
          <Label htmlFor="visibilityRadiusSlider">Rayon de visibilité</Label>
          <input
            id="visibilityRadiusSlider"
            type="range"
            min="10"
            max="500"
            value={visibilityRadius}
            onChange={(e) => {
              const newRadius = parseInt(e.target.value, 10);
              setVisibilityRadius(newRadius);
              if (persoId) {
                updateDoc(doc(db, 'cartes', String(roomId), 'characters', persoId), {
                  visibilityRadius: newRadius
                });
              }
            }}
            className="w-32"
          />
        </div>

        {isMJ && (
          <Input
            type="file"
            onChange={handleBackgroundChange}
            className="w-40"
          />
        )}

    

          {/* 🎯 Bouton pour basculer mode déplacement carte */}
        <Button 
          onClick={() => setIsSelecting(!isSelecting)} 
          className={!isSelecting ? 'bg-green-600' : ''}
        >
          <Move className="w-4 h-4 mr-2" />
          {!isSelecting ? 'Mode Sélection' : 'Déplacer la carte'}
        </Button>


        {isMJ && (
          <Button onClick={() => setDialogOpen(true)}>
            <CircleUserRound/>
            Personnage</Button>
        )}

<Button onClick={handleAddNote}>
          <Baseline/>
          Texte
          </Button>


        <Button onClick={toggleDrawMode}>
          {drawMode ? <Eraser className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
          {drawMode ? 'Quitter dessin' : 'Dessiner'}
        </Button>


        

        {(
          <Button onClick={clearDrawings}>
            <X/>
            Effacer les dessins
            </Button>
        )}

        {isMJ && (
          <div className="flex flex-col gap-2">
            <Button 
              onClick={toggleFogMode}
              className={fogMode ? 'bg-orange-600 hover:bg-orange-700 border-orange-400' : 'bg-gray-600 hover:bg-gray-700'}
            >
              {fogMode ? <Eraser className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
              {fogMode ? '🌫️ Mode Brouillard ACTIF' : 'Activer le brouillard'}
            </Button>
            {fogMode && (
              <div className="text-xs text-yellow-300 bg-gray-800 p-2 rounded border border-yellow-500">
                <div className="font-medium mb-1">💡 Mode Brouillard :</div>
                <div>• Cliquer sur zone vide → Ajouter</div>
                <div>• Cliquer sur zone brouillée → Supprimer</div>
                <div>• Faire glisser pour zones continues</div>
              </div>
            )}
            <Button onClick={() => setShowFogGrid(!showFogGrid)} className={showFogGrid ? 'bg-yellow-600' : ''}>
              <Grid className="w-4 h-4 mr-2" />
              {showFogGrid ? 'Masquer grille' : 'Afficher grille'}
            </Button>
            <Button onClick={clearFog} className="bg-red-600 hover:bg-red-700">
              <X className="w-4 h-4 mr-2" />
              Supprimer tout le brouillard
            </Button>
          </div>
        )}



      


       

                  {/* 🎯 SUPPRIMÉ : Mode donjon (remplacé par fog of war) */}


       


      </div>
    )}
  </div>
</div>

  
      <div
    ref={containerRef}
    className={`w-full h-full flex-1 overflow-hidden border border-gray-300 ${
      isDraggingCharacter || isDraggingNote ? 'cursor-grabbing' : 
      !isSelecting ? 'cursor-move' : 'cursor-default'
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

{selectedCharacterIndex !== null && (
  <div className="absolute bottom-3 flex left-1/2 space-x-2 items-center">
    <Button className="button-primary">{characters[selectedCharacterIndex].name}</Button>
    {isMJ || characters[selectedCharacterIndex].id === persoId ? (
      <>
        {characters[selectedCharacterIndex].type === 'joueurs' && (
          <Button onClick={() => {
            setSelectedCharacterForSheet(characters[selectedCharacterIndex].id);
            setShowCharacterSheet(true);
          }}>
            <User className="w-4 h-4 mr-2 button-secondary" /> Voir fiche
          </Button>
        )}
        {/* Boutons pour les personnages non-joueurs (MJ seulement) */}
        {isMJ && characters[selectedCharacterIndex]?.type !== 'joueurs' && (
          <>
            <Button onClick={() => {
              setCharacterToDelete(characters[selectedCharacterIndex]);
              setConfirmDeleteOpen(true);
            }}>
              <X className="w-4 h-4 mr-2" /> Supprimer
            </Button>
            <Button onClick={handleEditCharacter}>
              <Edit className="w-4 h-4 mr-2" /> Modifier
            </Button>
            <Button className="button-primary" onClick={handleAttack}>
              <Edit className="w-4 h-4 mr-2" /> Attaquer
            </Button>
          </>
        )}
        
        {/* Bouton modifier pour les personnages joueurs (MJ seulement) */}
        {characters[selectedCharacterIndex]?.type === 'joueurs' && isMJ && (
          <Button onClick={handleEditCharacter}>
            <Edit className="w-4 h-4 mr-2" /> Modifier
          </Button>
        )}
      </>
    ) : (
      characters[selectedCharacterIndex].id !== persoId && (
        <>
          <Button className="button-primary" onClick={handleAttack}>
            <Edit className="w-4 h-4 mr-2" /> Attaquer
          </Button>
          {characters[selectedCharacterIndex].type === 'joueurs' && (
            <Button onClick={() => {
              setSelectedCharacterForSheet(characters[selectedCharacterIndex].id);
              setShowCharacterSheet(true);
            }}>
              <User className="w-4 h-4 mr-2" /> Voir fiche
            </Button>
          )}
        </>
      )
    )}
  </div>
)}

{selectedCharacters.length > 0 && isMJ && (
  // Afficher le bouton seulement si au moins un personnage non-joueur est sélectionné
  (() => {
    const hasNonPlayerCharacter = selectedCharacters.some(index => 
      characters[index]?.type !== 'joueurs'
    );
    return hasNonPlayerCharacter;
  })() && (
    <div className="absolute bottom-3 flex left-1/2 space-x-2 items-center">
      <Button onClick={handleDeleteSelectedCharacters}>
        <X className="w-4 h-4 mr-2" /> Supprimer
      </Button>
    </div>
  )
)}

      {selectedNoteIndex !== null  && (
        <div className="absolute bottom-3 flex left-1/2 space-x-2">
          <Button onClick={handleDeleteNote}>
            <X className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button onClick={handleEditNote}>
            <Edit className="w-4 h-4 mr-2" /> Modifier
          </Button>
        </div>
      )}
  
{isMJ && selectedFogIndex !== null && (
  <div className="absolute bottom-3 flex left-1/2 space-x-2 items-center">
                    <Button onClick={clearFog}>
      <X className="w-4 h-4 mr-2" /> Supprimer le brouillard
    </Button>
  </div>
)}

  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
  <DialogContent className="bg-[rgb(36,36,36)] max-w-3xl text-[#c0a080]">
    <DialogHeader>
      <DialogTitle>Ajouter un personnage</DialogTitle>
    </DialogHeader>
    <ScrollArea className="h-96"> {/* Ajouter ScrollArea ici */}
      <div className="grid gap-4 py-4">
        {/* Nombre Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="nombre" className="text-right">Nombre</Label>
          <Input
            id="nombre"
            type="number"
            value={newCharacter.nombre}
            onChange={(e) => setNewCharacter({ ...newCharacter, nombre: parseInt(e.target.value) || 1 })}
            className="col-span-3"
          />
        </div>
        {/* Name Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="name" className="text-right">Nom</Label>
          <Input
            id="name"
            value={newCharacter.name}
            onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
            className="col-span-3"
          />
        </div>
        {/* Image Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="image" className="text-right">Image</Label>
          <Input
            id="image"
            type="file"
            onChange={handleCharacterImageChange}
            className="col-span-3"
          />
        </div>
        {/* Visibility Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="visibility" className="text-right">Visible </Label>
          <Switch
            id="visibility"
            checked={newCharacter.visibility === 'visible'}
            onCheckedChange={(visible) => setNewCharacter({ ...newCharacter, visibility: visible ? 'visible' : 'hidden' })}
          />
        </div>
        {/* PV Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="PV" className="text-right">PV</Label>
          <Input
            id="PV"
            type="number"
            value={newCharacter.PV}
            onChange={(e) => setNewCharacter({ ...newCharacter, PV: parseInt(e.target.value) || 100 })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="niveau" className="text-right">niveau</Label>
          <Input
            id="niveau"
            type="number"
            value={newCharacter.niveau}
            onChange={(e) => setNewCharacter({ ...newCharacter, niveau: parseInt(e.target.value) || 1 })}
            className="col-span-3"
          />
        </div>
        {/* Defense Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="Defense" className="text-right">Defense</Label>
          <Input
            id="Defense"
            type="number"
            value={newCharacter.Defense}
            onChange={(e) => setNewCharacter({ ...newCharacter, Defense: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        {/* Contact Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="Contact" className="text-right">Contact</Label>
          <Input
            id="Contact"
            type="number"
            value={newCharacter.Contact}
            onChange={(e) => setNewCharacter({ ...newCharacter, Contact: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        {/* Distance Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="Distance" className="text-right">Distance</Label>
          <Input
            id="Distance"
            type="number"
            value={newCharacter.Distance}
            onChange={(e) => setNewCharacter({ ...newCharacter, Distance: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        {/* Magie Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="Magie" className="text-right">Magie</Label>
          <Input
            id="Magie"
            type="number"
            value={newCharacter.Magie}
            onChange={(e) => setNewCharacter({ ...newCharacter, Magie: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        {/* INIT Field */}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="INIT" className="text-right">INIT</Label>
          <Input
            id="INIT"
            type="number"
            value={newCharacter.INIT}
            onChange={(e) => setNewCharacter({ ...newCharacter, INIT: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="FOR" className="text-right">FOR</Label>
          <Input
            id="FOR"
            type="number"
            value={newCharacter.FOR}
            onChange={(e) => setNewCharacter({ ...newCharacter, FOR: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="DEX" className="text-right">DEX</Label>
          <Input
            id="DEX"
            type="number"
            value={newCharacter.DEX}
            onChange={(e) => setNewCharacter({ ...newCharacter, DEX: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="CON" className="text-right">CON</Label>
          <Input
            id="CON"
            type="number"
            value={newCharacter.CON}
            onChange={(e) => setNewCharacter({ ...newCharacter, CON: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="SAG" className="text-right">SAG</Label>
          <Input
            id="SAG"
            type="number"
            value={newCharacter.SAG}
            onChange={(e) => setNewCharacter({ ...newCharacter, SAG: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="INT" className="text-right">INT</Label>
          <Input
            id="INT"
            type="number"
            value={newCharacter.INT}
            onChange={(e) => setNewCharacter({ ...newCharacter, INT: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="CHA" className="text-right">CHA</Label>
          <Input
            id="CHA"
            type="number"
            value={newCharacter.CHA}
            onChange={(e) => setNewCharacter({ ...newCharacter, CHA: parseInt(e.target.value) || 0 })}
            className="col-span-3"
          />
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
