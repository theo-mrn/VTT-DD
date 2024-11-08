"use client"

import React, { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { X, Plus, Minus, Move, Edit, Pencil, Eraser ,ChevronDown ,ChevronUp,ChevronRight,ChevronLeft} from 'lucide-react'
import { auth, db, onAuthStateChanged, doc,getDoc,getDocs, collection, onSnapshot, updateDoc, addDoc, deleteDoc } from '@/lib/firebase'
import Combat from '@/components/combat';  // Importez le composant de combat
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';


export default function Component() {
  const [combatOpen, setCombatOpen] = useState(false);
  const [attackerId, setAttackerId] = useState(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [persoId, setPersoId] = useState(null);
  const [backgroundImage, setBackgroundImage] = useState('/placeholder.svg?height=600&width=800')
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1.2)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [characters, setCharacters] = useState<Character[]>([]);
  const [notes, setNotes] = useState<Text[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newCharacter, setNewCharacter] = useState<NewCharacter>({
    name: '',
    image: null,
    niveau :1,
    visibility: 'visible',
    PV: 100,
    Defense: 0,
    Contact: 0,
    Distance: 0,
    Magie: 0,
    INIT: 0,
    nombre: 1, 
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
  }, []);
  

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
  // Multiplier de taille pour agrandir le canvas (par exemple, 1.5 ou 2 pour doubler)
  const sizeMultiplier = 1.5;
  image.onload = () => {
    canvas.width = (containerRef.current?.clientWidth || canvas.width) * sizeMultiplier;
    canvas.height = (containerRef.current?.clientHeight || canvas.height) * sizeMultiplier;
    ctx.scale(sizeMultiplier, sizeMultiplier); // Mise à l'échelle du contenu pour correspondre à l'agrandissement
    drawMap(ctx, image);      
  };
}, [backgroundImage, showGrid, zoom, offset, characters, notes, selectedCharacterIndex, selectedNoteIndex, drawings, currentPath]);


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
    img.src = data.imageURL;

    // Ajoutez tous les champs requis
    chars.push({
      id: doc.id,
      niveau : data.niveau ||1,
      name: data.Nomperso || '',
      x: data.x || 0,
      y: data.y || 0,
      image: img,
      visibility: data.visibility || 'visible',
      visibilityRadius: parseFloat(data.visibilityRadius) || 100,
      type: data.type || 'pnj',
      PV: data.PV || 10, // Assurez-vous que chaque champ est bien extrait
      Defense: data.Defense || 5,
      Contact: data.Contact || 5,
      Distance: data.Distance || 5,
      Magie: data.Magie || 5,
      INIT: data.INIT || 5,
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
  };
  
  const calculateDistance = (x1:number, y1:number, x2:number, y2:number) => {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  };
  
  const drawMap = (ctx: CanvasRenderingContext2D, image: HTMLImageElement) => {
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  
    const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
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
  
    // Draw each character
    characters.forEach((char, index) => {
      const x = char.x * zoom - offset.x;
      const y = char.y * zoom - offset.y;
  
      let isVisible = true;
      if (char.visibility === 'hidden') {
        isVisible = isMJ || characters.some((player) => {
          return (
            player.type === 'joueurs' &&
            calculateDistance(char.x, char.y, player.x, player.y) <= (player.id === persoId ? visibilityRadius : player.visibilityRadius)
          );
        });
      }
  
      if (isVisible) {
        // Set border color based on character type
        const borderColor = char.type === 'joueurs' ? 'rgba(0, 0, 255, 0.8)' : 'rgba(255, 165, 0, 0.8)'; // Blue for 'joueurs', Orange for others
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
  
        // Draw the badge circle
        ctx.fillStyle = char.type === 'joueurs' ? 'rgba(0, 0, 255, 1)' : 'rgba(255, 165, 0, 1)'; // Blue for 'joueurs', Orange for others
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
    });
  
    // Draw each note
    notes.forEach((note, index) => {
      const x = note.x * zoom - offset.x;
      const y = note.y * zoom - offset.y;
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
            const x = point.x * zoom - offset.x;
            const y = point.y * zoom - offset.y;
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
  
    // Draw current path if in drawing mode
    if (currentPath.length > 0) {
      ctx.beginPath();
      currentPath.forEach((point, index) => {
        const x = point.x * zoom - offset.x;
        const y = point.y * zoom - offset.y;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
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
                  imageURL,  // Utiliser l'URL de téléchargement pour l'image
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

  const handleCanvasMouseDown = async (e: React.MouseEvent<Element>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = (e.clientX - rect.left + offset.x) / zoom;
    const clickY = (e.clientY - rect.top + offset.y) / zoom;
    if (drawMode) {
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
      }
      setIsMoving(false);
      setSelectedCharacterIndex(null);
      setSelectedNoteIndex(null);
    } else {
      const clickedCharIndex = characters.findIndex(char => 
        Math.abs(char.x - clickX) < 20 && Math.abs(char.y - clickY) < 20
      );
      const clickedNoteIndex = notes.findIndex(note => 
        Math.abs(note.x - clickX) < 50 && Math.abs(note.y - clickY) < 20
      );
      if (clickedCharIndex !== -1) {
        setSelectedCharacterIndex(clickedCharIndex);
        setSelectedNoteIndex(null);
      } else if (clickedNoteIndex !== -1) {
        setSelectedNoteIndex(clickedNoteIndex);
        setSelectedCharacterIndex(null);
      } else {
        setSelectedCharacterIndex(null);
        setSelectedNoteIndex(null);
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    }
  };
  
  
  const handleCanvasMouseMove = (e: React.MouseEvent<Element>) => {
    if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setOffset((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isDrawing) {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return; // Ensure canvasRef.current is not null

        const x = (e.clientX - rect.left + offset.x) / zoom;
        const y = (e.clientY - rect.top + offset.y) / zoom;
        setCurrentPath((prev) => [...prev, { x, y }]);
    }
};

  
  const handleCanvasMouseUp = async () => {
    setIsDragging(false);
    if (isDrawing) {
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
            imageURL?: string; // Add imageURL as an optional field
          } = {
            Nomperso: editingCharacter.name,
            niveau: editingCharacter.niveau,
            PV: editingCharacter.PV,
            Defense: editingCharacter.Defense,
            Contact: editingCharacter.Contact,
            Distance: editingCharacter.Distance,
            Magie: editingCharacter.Magie,
            INIT: editingCharacter.INIT,
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
            updatedData.imageURL = imageURL;
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
            updatedData.imageURL = imageURL;
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
        <Button onClick={() => handleZoom(-0.1)}>
          <Minus className="w-4 h-4" />
        </Button>
        <Button onClick={() => handleZoom(0.1)}>
          <Plus className="w-4 h-4" />
        </Button>

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

        <Button onClick={handleAddNote}>Ajouter une note</Button>

        {isMJ && (
          <Button onClick={() => setDialogOpen(true)}>Ajouter un personnage</Button>
        )}

        <Button onClick={toggleDrawMode}>
          {drawMode ? <Eraser className="w-4 h-4 mr-2" /> : <Pencil className="w-4 h-4 mr-2" />}
          {drawMode ? 'Arrêter de dessiner' : 'Dessiner'}
        </Button>

        {(
          <Button onClick={clearDrawings}>Effacer les dessins</Button>
        )}
      </div>
    )}
  </div>
</div>

  
      <div
    ref={containerRef}
    className="w-full h-full flex-1 overflow-hidden border border-gray-300 cursor-move relative"
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
            <div className="bg-white p-6 rounded-lg shadow-lg w-1/3 h-2/5">
            <Combat
  attackerId={attackerId || ''} // Fallback to an empty string
  targetId={targetId || ''}      // Fallback to an empty string
  onClose={() => setCombatOpen(false)}
/>

            </div>
        </div>
    )}
</div>

{selectedCharacterIndex !== null && (
    <div className="absolute bottom-3 flex left-1/2 space-x-2">
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
        <Label htmlFor="visibility" className="text-right">Visibilité</Label>
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
    </div>
    <DialogFooter>
      <Button onClick={handleCharacterEditSubmit}>Modifier</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
    </div>
  ); 
}
