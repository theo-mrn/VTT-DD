"use client"

import React, { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { X, Plus, Minus, Move, Edit, Pencil, Eraser ,CircleUserRound, Eclipse ,Baseline,SquareDashedMousePointer,ChevronRight,ChevronLeft, Eye, EyeOff} from 'lucide-react'
import { auth, db, onAuthStateChanged, doc,getDoc,getDocs, collection, onSnapshot, updateDoc, addDoc, deleteDoc, setDoc } from '@/lib/firebase'
import Combat from '@/components/combat2';  // Importez le composant de combat
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';


export default function Component() {
  const [combatOpen, setCombatOpen] = useState(false);
  const [attackerId, setAttackerId] = useState(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [persoId, setPersoId] = useState(null);
  const [backgroundImage, setBackgroundImage] = useState('/placeholder.svg?height=600&width=800')
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1.4)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [characters, setCharacters] = useState<Character[]>([]);
  const [notes, setNotes] = useState<Text[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false)
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
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number | null>(null);
  const [selectedNoteIndex, setSelectedNoteIndex] = useState<number | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false)
  const [characterDialogOpen, setCharacterDialogOpen] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawMode, setDrawMode] = useState(false)
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);  
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visibilityRadius, setVisibilityRadius] = useState(100);
  const [isMJ, setIsMJ] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [fogMode, setFogMode] = useState(false);
  const [fogPaths, setFogPaths] = useState<Drawing[]>([]);
  const [fogSquares, setFogSquares] = useState<Point[]>([]);
  const squareSize = 200; // Déclarer la taille des carrés de brouillard en dehors de la fonction drawMap
  const [revealMode, setRevealMode] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [shadowOpacity, setShadowOpacity] = useState(0.5); // Ajouter un état pour l'opacité des ombres
  const [fogRectangles, setFogRectangles] = useState<{ start: Point, end: Point }[]>([]);
  const [clearFogMode, setClearFogMode] = useState(false);
  const [selectedFogIndex, setSelectedFogIndex] = useState<number | null>(null);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
        await fetchRoomId(user.uid);
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const perso = userDoc.data().perso;
          const roomId = userDoc.data().room_id;
          setIsMJ(perso === "MJ"); 
          if (perso === "MJ") {
            if (roomId) {                                                                                                                                                      
              const settingsRef = doc(db, 'cartes', String(roomId), 'settings', 'general');  
              onSnapshot(settingsRef, (settingsDoc) => {
                if (settingsDoc.exists()) {
                  const tourJoueurId = settingsDoc.data().tour_joueur;
  
                  setPersoId(tourJoueurId); // Use tour_joueur ID as persoId for MJ
                } else {
                  console.warn("Settings document not found for room:", roomId);
                }
              });
            } else {
              console.warn("Room ID is not set. Cannot listen to `tour_joueur`.");
            }
          } else {
            const persoId = userDoc.data().persoId;
            setPersoId(persoId);
          }
        } else {
          console.warn("User document not found for UID:", user.uid);
        }
      } else {
        setUserId(null);
        setRoomId(null);
        setIsMJ(false);
      }
    });
    return () => unsubscribe();
  }, [roomId]);
  

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
  };
  const texts: Text[] = [];
  type Path = { x: number; y: number };
type Drawing = Path[];
const drws: Drawing[] = [];

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
type CombatProps = {
  attackerId: string | null;
  targetId: string | null;
  onClose: () => void;
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
}, [backgroundImage, showGrid, zoom, offset, characters, notes, selectedCharacterIndex, selectedNoteIndex, drawings, currentPath, fogPaths, fogSquares, fogRectangles]);


  // Firebase Functions
  const fetchRoomId = async (uid: string) => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      const roomId = userDoc.data().room_id;
      setRoomId(roomId);
      INITializeFirebaseListeners(roomId);
    }
  };
  
  const handleAttack = () => {
    if (persoId && selectedCharacterIndex !== null) {
      const targetCharacter = characters[selectedCharacterIndex];
      setAttackerId(persoId);           // L'attaquant est l'utilisateur actuel
      setTargetId(targetCharacter.id);   // La cible est le personnage sélectionné
      setCombatOpen(true);               // Ouvrir le composant de combat
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
        setFogPaths(data.paths || []);
        setFogSquares(data.squares || []);
        setFogRectangles(data.rectangles || []);
      }
    });
  };
  
  const calculateDistance = (x1:number, y1:number, x2:number, y2:number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };

  const updateCharacterVisibility = async () => {
    if (!roomId) return;
  
    const charactersRef = collection(db, 'cartes', String(roomId), 'characters');
    const snapshot = await getDocs(charactersRef);
  
    snapshot.forEach(async (doc) => {
      const data = doc.data();
      const charX = data.x;
      const charY = data.y;
  
      const isVisible = characters.some((player) => {
        return (
          player.type === 'joueurs' &&
          calculateDistance(charX, charY, player.x, player.y) <= player.visibilityRadius
        );
      });
    });
  };
  
  useEffect(() => {
    updateCharacterVisibility();
  }, [characters, visibilityRadius]);
  
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
      ctx.font = `${12 * zoom}px Arial`;
      ctx.fillText(note.text, x, y);
  
      if (index === selectedNoteIndex) {
        ctx.strokeStyle = 'blue';
        ctx.lineWidth = 2;
        const metrics = ctx.measureText(note.text);
        ctx.strokeRect(x - 2, y - 12, metrics.width + 4, 16);
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
  
    // Draw fog paths
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 2;
    if (fogPaths && Array.isArray(fogPaths)) {
      fogPaths.forEach(path => {
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
  
    // Draw fog squares
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`; // Utiliser l'état shadowOpacity pour l'opacité des ombres
    fogSquares.forEach((point) => {
      const x = (point.x / image.width) * scaledWidth - offset.x;
      const y = (point.y / image.height) * scaledHeight - offset.y;
      ctx.fillRect(x - (squareSize * zoom) / 2, y - (squareSize * zoom) / 2, squareSize * zoom, squareSize * zoom);
    });

    // Draw fog rectangles
    ctx.fillStyle = `rgba(0, 0, 0, ${shadowOpacity})`;
    fogRectangles.forEach(({ start, end }) => {
      const x1 = (start.x / image.width) * scaledWidth - offset.x;
      const y1 = (start.y / image.height) * scaledHeight - offset.y;
      const x2 = (end.x / image.width) * scaledWidth - offset.x;
      const y2 = (end.y / image.height) * scaledHeight - offset.y;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    });
  
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
        const borderColor = selectedCharacters.includes(index)
          ? 'rgba(0, 255, 0, 0.8)'           // Green for selected characters
          : char.id === persoId 
          ? 'rgba(255, 0, 0, 0.8)'           // Red for the player's character
          : char.type === 'joueurs' 
          ? 'rgba(0, 0, 255, 0.8)'           // Blue for other 'joueurs' type characters
          : 'rgba(255, 165, 0, 0.8)';        // Orange for other characters (e.g., NPCs)
          
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 3;
  
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
  const text = prompt("Entrez votre note:");
  console.log("Valeur de text:", text);
  console.log("Type de roomId:", typeof roomId, "Valeur de roomId:", roomId);
  // Conversion de roomId en chaîne de caractères
  const roomIdStr = String(roomId);

  if (text && typeof roomIdStr === 'string') {
    try {
      await addDoc(collection(db, 'cartes', roomIdStr, 'text'), {
        content: text,
        x: (Math.random() * (canvasRef.current?.width || 0) + offset.x) / zoom,
        y: (Math.random() * (canvasRef.current?.height || 0) + offset.y) / zoom,
      });
    } catch (error) {
      console.error("Erreur lors de l'ajout de la note :", error);
    }
  } else {
    console.error("Erreur : texte ou roomId manquant ou invalide.");
  }
};

const updateCharacterVisibilityAfterFogRemoval = async (removedSquare: Point) => {

  if (!roomId) return;

  const charactersRef = collection(db, 'cartes', String(roomId), 'characters');
  const snapshot = await getDocs(charactersRef);

  snapshot.forEach(async (doc) => {
    const data = doc.data();
    const charX = data.x;
    const charY = data.y;

    const wasInRemovedSquare = (
      charX >= removedSquare.x - squareSize / 2 &&
      charX <= squareSize / 2 &&
      charY >= removedSquare.y - squareSize / 2 &&
      charY <= squareSize / 2
    );

    if (wasInRemovedSquare && data.visibility === 'hidden') {
      const isVisible = characters.some((player) => {
        return (
          player.type === 'joueurs' &&
          calculateDistance(charX, charY, player.x, player.y) <= player.visibilityRadius
        );
      });

      if (isVisible) {
        await updateDoc(doc.ref, { visibility: 'visible' });
      }
    }
  });
};

const handleCanvasMouseDown = async (e: React.MouseEvent<Element>) => {
  const rect = canvasRef.current?.getBoundingClientRect();
  if (!rect) return;
  const containerWidth = containerRef.current?.clientWidth || rect.width;
  const containerHeight = containerRef.current?.clientHeight || rect.height;
  const image = new Image();
  image.src = backgroundImage;
  image.onload = async () => {
    const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
    const scaledWidth = image.width * scale * zoom;
    const scaledHeight = image.height * scale * zoom;
    const clickX = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width;
    const clickY = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height;

    if (fogMode) {
      const clickedSquareIndex = fogSquares.findIndex(square => 
        clickX >= square.x - squareSize / 2 &&
        clickX <= squareSize / 2 &&
        clickY >= square.y - squareSize / 2 &&
        clickY <= squareSize / 2
      );

      if (clickedSquareIndex !== -1) {
        const squareToRemove = fogSquares[clickedSquareIndex];
        if ((typeof roomId === 'string' || typeof roomId === 'number') && String(roomId).trim()) {
          const fogRef = collection(db, 'cartes', String(roomId), 'fog');
          const snapshot = await getDocs(fogRef);
          snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.x === squareToRemove.x && data.y === squareToRemove.y) {
              deleteDoc(doc.ref);
            }
          });
          setFogSquares(prev => prev.filter((_, index) => index !== clickedSquareIndex));
          await updateCharacterVisibilityAfterFogRemoval(squareToRemove); // Ajoutez cette ligne
        } else {
          console.error("Erreur: roomId n'est pas une chaîne valide.");
        }
      } else {
        setIsDrawing(true);
        setCurrentPath([{ x: clickX, y: clickY }]);
      }
    } else if (drawMode) {
      setIsDrawing(true);
      setCurrentPath([{ x: clickX, y: clickY }]);
    } else if (isMoving) {
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
    } else {
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
      const clickedFogIndex = fogRectangles.findIndex(({ start, end }) => {
        return (
          clickX >= Math.min(start.x, end.x) &&
          clickX <= Math.max(start.x, end.x) &&
          clickY >= Math.min(start.y, end.y) &&
          clickY <= Math.max(start.y, end.y)
        );
      });
      if (clickedCharIndex !== -1) {
        setSelectedCharacterIndex(clickedCharIndex);
        setSelectedNoteIndex(null);
        setSelectedFogIndex(null);
      } else if (clickedNoteIndex !== -1) {
        setSelectedNoteIndex(clickedNoteIndex);
        setSelectedCharacterIndex(null);
        setSelectedFogIndex(null);
      } else if (clickedFogIndex !== -1) {
        setSelectedFogIndex(clickedFogIndex);
        setSelectedCharacterIndex(null);
        setSelectedNoteIndex(null);
      } else {
        setSelectedCharacterIndex(null);
        setSelectedNoteIndex(null);
        setSelectedFogIndex(null);
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    }
  };
  if (isSelecting) {
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
      const clickX = ((e.clientX - rect.left + offset.x) / scaledWidth) * image.width;
      const clickY = ((e.clientY - rect.top + offset.y) / scaledHeight) * image.height;
      setSelectionStart({ x: clickX, y: clickY });
    };
  }
};


const handleCanvasMouseMove = (e: React.MouseEvent<Element>) => {
  if (isSelecting && selectionStart) {
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
      const selected = characters
        .map((char, index) => {
          return (
            char.type === 'pnj' &&
            char.x >= Math.min(selectionStart.x, x) &&
            char.x <= Math.max(selectionStart.x, x) &&
            char.y >= Math.min(selectionStart.y, y) &&
            char.y <= Math.max(selectionStart.y, y)
          )
            ? index
            : null;
        })
        .filter((index) => index !== null) as number[];
      setSelectedCharacters(selected);
    };
  } else if (isDragging) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setOffset((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  } else if (isDrawing && fogMode) {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return; // Ensure canvasRef.current is not null

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
  } else if (isDrawing) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return; // Ensure canvasRef.current is not null

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
  }
};


const handleCanvasMouseUp = async () => {
  setIsDragging(false);
  if (isDrawing && fogMode) {
    setIsDrawing(false);

    // Vérifie si roomId est une chaîne ou un nombre valide et si currentPath n'est pas vide
    if ((typeof roomId === 'string' || typeof roomId === 'number') && String(roomId).trim() && currentPath.length > 0) {
      const start = currentPath[0];
      const end = currentPath[currentPath.length - 1];
      const newFogRectangles = [...fogRectangles, { start, end }];
      const fogDocRef = doc(db, 'cartes', String(roomId), 'fog', 'fogData');
      const fogDoc = await getDoc(fogDocRef);
      if (fogDoc.exists()) {
        await updateDoc(fogDocRef, {
          rectangles: newFogRectangles
        });
      } else {
        await setDoc(fogDocRef, {
          rectangles: newFogRectangles
        });
      }
      setFogRectangles(newFogRectangles);
      setCurrentPath([]);
    } else {
      console.error("Erreur: roomId n'est pas une chaîne valide ou currentPath est vide.");
    }
  } else if (isDrawing) {
    setIsDrawing(false);

    // Vérifie si roomId est une chaîne ou un nombre valide et si currentPath n'est pas vide
    if ((typeof roomId === 'string' || typeof roomId === 'number') && String(roomId).trim() && currentPath.length > 0) {
      await addDoc(collection(db, 'cartes', String(roomId), 'drawings'), {
        paths: currentPath
      });
      setDrawings(prev => [...prev, currentPath]);
      setCurrentPath([]);
    } else {
      console.error("Erreur: roomId n'est pas une chaîne valide ou currentPath est vide.");
    }
  }
  if (isSelecting) {
    setIsSelecting(false);
    setSelectionStart(null);
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
    // Assurez-vous qu'un personnage est sélectionné et que roomId est valide
    if (selectedCharacterIndex !== null && roomId) {
      const charToDelete = characters[selectedCharacterIndex];
      
      // Vérifiez que l'ID du personnage existe
      if (charToDelete?.id) {
        try {
          // Supprimez le document Firestore correspondant
          await deleteDoc(doc(db, 'cartes', String(roomId), 'characters', charToDelete.id));
          // Mettez à jour l'état pour refléter la suppression
          setCharacters(characters.filter((_, index) => index !== selectedCharacterIndex));
          setSelectedCharacterIndex(null); // RéINITialisez l'index du personnage sélectionné
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
  
  const handleMoveCharacter = () => {
    setIsMoving(true)
  }

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


  const handleMoveNote = () => {
    setIsMoving(true)
  }

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

const handleNoteEditSubmit = async () => {
    if (editingNote && selectedNoteIndex !== null && roomId) {
        const noteToUpdate = notes[selectedNoteIndex];
        if (roomId && typeof noteToUpdate?.id === 'string') {
            await updateDoc(doc(db, 'cartes', roomId, 'text', noteToUpdate.id), {
                content: editingNote.text,
                color: editingNote.color
            });
            setEditingNote(null);
            setNoteDialogOpen(false);
            setSelectedNoteIndex(null);
        } else {
            console.error("Erreur: roomId ou noteToUpdate.id n'est pas une chaîne valide.");
        }
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
      const fogRef = collection(db, 'cartes', String(roomId), 'fog');
      const snapshot = await getDocs(fogRef);
  
      if (snapshot.empty) {
        return;
      }
  
      const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      setFogPaths([]);
      setFogRectangles([]);
    } catch (error) {
      console.error('Error clearing fog:', error);
    }
  };
  
  const toggleVisibility = async () => {
    if (selectedCharacterIndex !== null && roomId) {
      const charToUpdate = characters[selectedCharacterIndex];
      if (charToUpdate?.id) {
        const newVisibility = charToUpdate.visibility === 'visible' ? 'hidden' : 'visible';
        try {
          await updateDoc(doc(db, 'cartes', String(roomId), 'characters', charToUpdate.id), {
            visibility: newVisibility,
          });
          setCharacters((prevCharacters) =>
            prevCharacters.map((character, index) =>
              index === selectedCharacterIndex ? { ...character, visibility: newVisibility } : character
            )
          );
        } catch (error) {
          console.error("Erreur lors de la mise à jour de la visibilité du personnage :", error);
        }
      } else {
        console.error("Erreur: ID du personnage non valide.");
      }
    }
  };
  


  useEffect(() => {
    if (roomId) {
      const settingsRef = doc(db, 'cartes', String(roomId), 'settings', 'general');
      onSnapshot(settingsRef, (settingsDoc) => {
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          setShadowOpacity(data.ombre ? 1 : 0.5);
        }
      });
    }
  }, [roomId]);
  

const toggleDungeonMode = async () => {
  if (roomId) {
    const settingsRef = doc(db, 'cartes', String(roomId), 'settings', 'general');
    const newDungeonMode = shadowOpacity !== 1;
    await updateDoc(settingsRef, { donjon: newDungeonMode });
    setShadowOpacity(newDungeonMode ? 1 : 0.5);
  }
};

useEffect(() => {
  if (roomId) {
    const settingsRef = doc(db, 'cartes', String(roomId), 'settings', 'general');
    onSnapshot(settingsRef, (settingsDoc) => {
      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        setShadowOpacity(data.donjon ? 1 : 0.5);
      }
    });
  }
}, [roomId]);

  const toggleFogMode = () => {
    setFogMode(!fogMode);
    setSelectedCharacterIndex(null);
    setSelectedNoteIndex(null);
  };

  const toggleRevealMode = () => {
    setRevealMode(!revealMode);
    setSelectedCharacterIndex(null);
    setSelectedNoteIndex(null);
  };

  const updateCharacterVisibilityInFog = async () => {
    if (!roomId) return;
  
    const charactersRef = collection(db, 'cartes', String(roomId), 'characters');
    const snapshot = await getDocs(charactersRef);
  
    snapshot.forEach(async (doc) => {
      const data = doc.data();
      const charX = data.x;
      const charY = data.y;
  
      const isInFog = fogSquares.some(square => 
        charX >= square.x - squareSize / 2 &&
        charX <= squareSize / 2 &&
        charY >= square.y - squareSize / 2 &&
        charY <= squareSize / 2
      );
  
      if (isInFog && data.visibility === 'visible') {
        await updateDoc(doc.ref, { visibility: 'hidden' });
      }
    });
  };
  
  useEffect(() => {
    updateCharacterVisibilityInFog();
  }, [fogSquares]);
  

  const handleDeleteSelectedCharacters = async () => {
    if (selectedCharacters.length > 0 && roomId) {
      const deletePromises = selectedCharacters.map(async (index) => {
        const charToDelete = characters[index];
        if (charToDelete?.id) {
          await deleteDoc(doc(db, 'cartes', String(roomId), 'characters', charToDelete.id));
        }
      });
  
      await Promise.all(deletePromises);
      setCharacters(characters.filter((_, index) => !selectedCharacters.includes(index)));
      setSelectedCharacters([]);
    }
  };
  
  const handleToggleVisibilitySelectedCharacters = async (visibility: 'visible' | 'hidden') => {
    console.log("hdhdh");
    if (selectedCharacters.length > 0 && roomId) {
      const updatePromises = selectedCharacters.map(async (index) => {
        const charToUpdate = characters[index];
        if (charToUpdate?.id) {
          await updateDoc(doc(db, 'cartes', String(roomId), 'characters', charToUpdate.id), {
            visibility: visibility
          });
        }
      });
  
      await Promise.all(updatePromises);
      setCharacters(characters.map((character, index) => 
        selectedCharacters.includes(index) ? { ...character, visibility: visibility } : character
      ));
      setSelectedCharacters([]);
    }
  };

  const toggleClearFogMode = () => {
    setClearFogMode(!clearFogMode);
    setSelectedCharacterIndex(null);
    setSelectedNoteIndex(null);
  };

  const handleDeleteFog = async () => {
    if (selectedFogIndex !== null && roomId) {
      const fogToDelete = fogRectangles[selectedFogIndex];
      const newFogRectangles = fogRectangles.filter((_, index) => index !== selectedFogIndex);
      const fogDocRef = doc(db, 'cartes', String(roomId), 'fog', 'fogData');
      const fogDoc = await getDoc(fogDocRef);
      if (fogDoc.exists()) {
        await updateDoc(fogDocRef, {
          rectangles: newFogRectangles
        });
      } else {
        await setDoc(fogDocRef, {
          rectangles: newFogRectangles
        });
      }
      setFogRectangles(newFogRectangles);
      setSelectedFogIndex(null);
    }
  };
  

  if (loading) {
    return <div>Chargement...</div>
  }

  if (!userId || !roomId) {
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
      <div className="flex flex-col gap-6 w-64 rounded-lg  p-6 bg-white self-center text-black">
        <div className='flex flex-row gap-6 justify-center '>
        <Button onClick={() => handleZoom(-0.1)}>
          <Minus className="w-4 h-4" />
        </Button>
        <Button onClick={() => handleZoom(0.1)}>
          <Plus className="w-4 h-4" />
        </Button>
        </div>
       

        <div className="flex items-center space-x-2">
          <Switch
            id="grid-switch"
            checked={showGrid}
            onCheckedChange={setShowGrid}
          />
          <Label htmlFor="grid-switch">Quadrillage</Label>
        </div>

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

    

          {isMJ && (
           <Button onClick={() => setIsSelecting(!isSelecting)}>
           <SquareDashedMousePointer className="w-4 h-4 mr-2" />
             {isSelecting ? 'Quitter sélection' : 'Sélectionner'
             }
           </Button>
        )}


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
    <Button onClick={toggleFogMode}>
    {fogMode ? <Eraser className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
    {fogMode ? 'Quitter le brouillard' : 'Brouillard'}
  </Button>
        )}



      


       

        {isMJ && (
           <Button onClick={toggleDungeonMode}>
           <Eclipse  className="w-4 h-4 mr-2" />
             {shadowOpacity === 1 ? 'Quitter mode Donjon' : 'Mode donjon'}
           </Button>
        )}


       


      </div>
    )}
  </div>
</div>

  
      <div
    ref={containerRef}
    className={`w-full h-full flex-1 overflow-hidden border border-gray-300 ${isSelecting ? 'cursor-crosshair' : 'cursor-move'} relative`}
    style={{ height: '100vh' }}
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
  attackerId={attackerId || ''} // Fallback to an empty string
  onClose={() => setCombatOpen(false)}
/>

            </div>
        </div>
    )}
</div>

{selectedCharacterIndex !== null && (
  <div className="absolute bottom-3 flex left-1/2 space-x-2 items-center">
    {/* Afficher le nom du personnage sélectionné */}
    <Button className="disabled text-white">{characters[selectedCharacterIndex].name}</Button>
    {/* Vérifier si le joueur est MJ ou s'il s'agit de son propre personnage */}
    {isMJ || characters[selectedCharacterIndex].id === persoId ? (
      <>
        <Button onClick={handleMoveCharacter}>
          <Move className="w-4 h-4 mr-2" /> Déplacer
        </Button>
        {isMJ && (
          <>
            <Button onClick={handleDeleteCharacter}>
              <X className="w-4 h-4 mr-2" /> Supprimer
            </Button>
            <Button onClick={handleEditCharacter}>
              <Edit className="w-4 h-4 mr-2" /> Modifier
            </Button>
            <Button onClick={toggleVisibility}>
              {characters[selectedCharacterIndex].visibility === 'visible' ? (
                <EyeOff className="w-4 h-4 mr-2" /> // Icon for hiding
              ) : (
                <Eye className="w-4 h-4 mr-2" /> // Icon for showing
              )}
              {characters[selectedCharacterIndex].visibility === 'visible' ? 'Masquer' : 'Afficher'}
            </Button>
            {/* Bouton attaquer pour le MJ */}
            <Button onClick={handleAttack}>
              <Edit className="w-4 h-4 mr-2" /> Attaquer
            </Button>
          </>
        )}
      </>
    ) : (
      characters[selectedCharacterIndex].id !== persoId && (
        <Button onClick={handleAttack}>
          <Edit className="w-4 h-4 mr-2" /> Attaquer
        </Button>
      )
    )}
  </div>
)}

{selectedCharacters.length > 0 && (
  <div className="absolute bottom-3 flex left-1/2 space-x-2 items-center">
      <Button onClick={() => handleToggleVisibilitySelectedCharacters('hidden')}>
      <EyeOff className="w-4 h-4 mr-2" /> Rendre caché
    </Button>
    <Button onClick={() => handleToggleVisibilitySelectedCharacters('visible')}>
      <Eye className="w-4 h-4 mr-2" /> Rendre visible
    </Button>
    <Button onClick={() => setIsMoving(true)}>
      <Move className="w-4 h-4 mr-2" /> Déplacer
    </Button>
    <Button onClick={handleDeleteSelectedCharacters}>
      <X className="w-4 h-4 mr-2" /> Supprimer
    </Button>
   
  
  </div>
)}

      {selectedNoteIndex !== null  && (
        <div className="absolute bottom-3 flex left-1/2 space-x-2">
          <Button onClick={handleDeleteNote}>
            <X className="w-4 h-4 mr-2" /> Supprimer
          </Button>
          <Button onClick={handleMoveNote}>
            <Move className="w-4 h-4 mr-2" /> Déplacer
          </Button>
          <Button onClick={handleEditNote}>
            <Edit className="w-4 h-4 mr-2" /> Modifier
          </Button>
        </div>
      )}
  
{isMJ && selectedFogIndex !== null && (
  <div className="absolute bottom-3 flex left-1/2 space-x-2 items-center">
    <Button onClick={handleDeleteFog}>
      <X className="w-4 h-4 mr-2" /> Supprimer le brouillard
    </Button>
  </div>
)}

  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
  <DialogContent className="bg-[rgb(36,36,36)] max-w-3xl text-[#c0a080]">
    <DialogHeader>
      <DialogTitle>Ajouter un personnage</DialogTitle>
    </DialogHeader>
    <div className="grid gap-4 py-4">
      {/* Name Field */}
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


      <Dialog open={characterDialogOpen} onOpenChange={setCharacterDialogOpen}>
  <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] max-w-3xl">
    <DialogHeader>
      <DialogTitle>Modifier le personnage</DialogTitle>
    </DialogHeader>
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
    <DialogFooter>
      <Button onClick={handleCharacterEditSubmit}>Modifier</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  ); 
}
