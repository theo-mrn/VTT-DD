"use client";

import React, { useState, useEffect, useRef } from "react";
// import { DiceRoll } from "@dice-roller/rpg-dice-roller"; // Removed unused import
import { motion, AnimatePresence } from "framer-motion";
import { Dice1, RotateCcw, History, Trash2, Shield, BarChart3, Store, Check, EyeOff, Box } from "lucide-react";
import { auth, db, addDoc, collection, getDocs, getDoc, doc, deleteDoc, query, orderBy, serverTimestamp, limit, updateDoc } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { trackDiceRoll } from '@/lib/challenge-tracker';
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiceStats } from "./dice-stats";
import { DICE_SKINS, DiceSkin } from "./dice-definitions";
import { DicePreview } from "./dice-preview";
import { DiceStoreModal } from "./dice-store-modal"; // Import new modal
import { getAssetUrl } from "@/lib/asset-loader";
import { InteractiveHoverButton } from "@/components/ui/interactive-hover-button";
import { generateSlug } from "@/lib/titles";
// Types
interface RollResult {
  id: string;
  notation: string;
  result: string;
  total: number;
  timestamp: Date;
  output: string;
}
import { toast } from 'sonner';


// Type compatible avec campagne.tsx
interface FirebaseRoll {
  id: string;
  isPrivate: boolean;
  isBlind?: boolean;
  diceCount: number;
  diceFaces: number;
  modifier: number;
  results: number[];
  total: number;
  userAvatar?: string;
  userName: string;
  type?: string;
  timestamp: number;
  notation?: string;
  output?: string;
  persoId?: string;
}



import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";

export function DiceRoller() {
  const { isShortcutPressed, customShortcuts, checkKeyCombination } = useShortcuts();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<RollResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [firebaseRolls, setFirebaseRolls] = useState<FirebaseRoll[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isBlind, setIsBlind] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHistory] = useState(true);
  const [showStats, setShowStats] = useState(false);
  const [show3DAnimations, setShow3DAnimations] = useState(true);

  // États utilisateur et personnage - récupérés directement de Firebase
  const [roomId, setRoomId] = useState<string | null>(null);
  const [persoId, setPersoId] = useState<string | null>(null);
  const [isMJ, setIsMJ] = useState(false);
  const [userName, setUserName] = useState("Utilisateur");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | undefined>(undefined);
  const [characterName, setCharacterName] = useState("Utilisateur");
  const [characterModifiers, setCharacterModifiers] = useState<{ [key: string]: number }>({});


  const [selectedSkinId, setSelectedSkinId] = useState("gold");
  const [isSkinDialogOpen, setIsSkinDialogOpen] = useState(false);

  // Charger le skin depuis Firestore et les préférences 3D depuis localStorage
  useEffect(() => {
    const saved3D = localStorage.getItem("vtt_3d_enabled");
    if (saved3D !== null) {
      setShow3DAnimations(saved3D === "true");
    }

    // Load selected skin from Firestore once auth is ready
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.dice_skin && DICE_SKINS[data.dice_skin]) {
            setSelectedSkinId(data.dice_skin);
          }
        }
      } catch (error) {
        console.error('Error loading dice skin from Firestore:', error);
      }
    });
    return () => unsubscribe();
  }, []);



  // Effet pour afficher les détails 1 seconde après le résultat
  useEffect(() => {
    if (result) {
      setShowDetails(false);
      const timer = setTimeout(() => {
        setShowDetails(true);
        // Afficher le toast avec le résultat
        if (result.result !== "?" && result.result !== "...") {
          let message = `${result.notation} : ${result.total}`;
          // Try to extract detailed view from output: "notation = details = total"
          if (result.output && result.output.includes('=')) {
            const parts = result.output.split('=');
            if (parts.length >= 3) {
              const details = parts.slice(1, parts.length - 1).join('=').trim();
              const total = parts[parts.length - 1].trim();
              message = `${details} = ${total}`;
            }
          }

          toast.success(message, {
            duration: 4000,
          });
        }
      }, 1100);
      return () => clearTimeout(timer);
    } else {
      setShowDetails(false);
    }
  }, [result]);

  // Calculer les modificateurs depuis les données Firebase
  const getCharacterModifiers = () => {
    return characterModifiers;
  };



  // Fonction pour charger les données du personnage depuis Firebase
  const fetchCharacterInfo = async (roomId: string, persoId: string) => {
    try {
      const charRef = doc(db, `cartes/${roomId}/characters/${persoId}`);
      const charSnap = await getDoc(charRef);

      if (charSnap.exists()) {
        const charData = charSnap.data();
        setCharacterName(charData.Nomperso || "Utilisateur");
        setUserName(charData.Nomperso || "Utilisateur");
        setUserAvatar(charData.imageURLFinal || charData.imageURL || undefined);

        // Set the raw values directly without calculating modifiers again (exactement comme campagne.tsx)
        setCharacterModifiers({
          CON: charData.CON_F || charData.CON || 0,
          DEX: charData.DEX_F || charData.DEX || 0,
          FOR: charData.FOR_F || charData.FOR || 0,
          SAG: charData.SAG_F || charData.SAG || 0,
          INT: charData.INT_F || charData.INT || 0,
          CHA: charData.CHA_F || charData.CHA || 0,
          Contact: charData.Contact_F || charData.Contact || 0,
          Distance: charData.Distance_F || charData.Distance || 0,
          Magie: charData.Magie_F || charData.Magie || 0,
          Defense: charData.Defense_F || charData.Defense || 0,
        });

        console.log("Fetched character info:", charData);
        return charData;
      } else {
        console.log("No character document found!");
      }
    } catch (error) {
      console.error("Error fetching character info:", error);
    }
    return null;
  };

  // Authentification et récupération des données utilisateur
  useEffect(() => {
    console.log("window.CHEAT_DICE=20;");
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        setUserEmail(authUser.email || null);
        const userRef = doc(db, 'users', authUser.uid);
        getDoc(userRef).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRoomId(data.room_id);
            setPersoId(data.persoId);
            setIsMJ(data.perso === "MJ");

            if (data.perso === "MJ") {
              setUserName("MJ");
              setUserAvatar(undefined);
            } else {
              // Charger les données du personnage directement depuis Firebase
              fetchCharacterInfo(data.room_id, data.persoId);
            }
            fetchFirebaseRolls(data.room_id);
          } else {
            console.log("No such document!");
          }
        }).catch((error) => console.error("Error fetching user data:", error));
      } else {
        console.log("No user is signed in.");
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchFirebaseRolls = async (roomId: string) => {

    try {
      const rollsRef = collection(db, `rolls/${roomId}/rolls`);
      const rollsQuery = query(rollsRef, orderBy("timestamp", "desc"), limit(50));
      const snapshot = await getDocs(rollsQuery);

      const fetchedRolls = snapshot.docs.map(doc => doc.data() as FirebaseRoll);
      setFirebaseRolls(fetchedRolls);
    } catch (error) {
      console.error("Error loading rolls:", error);
    }
  };

  // Helper function exactement comme dans campagne.tsx
  const calculateModifier = (value: number) => Math.floor(value);

  // Remplacer les caractéristiques dans une notation
  const replaceCharacteristics = (notation: string): string => {
    const modifiers = getCharacterModifiers();
    if (!modifiers || Object.keys(modifiers).length === 0) {
      return notation;
    }

    let processedNotation = notation;

    // Remplacer chaque caractéristique trouvée
    const characteristicsRegex = /(CON|FOR|DEX|CHA|INT|SAG|Contact|Distance|Magie|Defense)/gi;

    processedNotation = processedNotation.replace(characteristicsRegex, (match) => {
      const key = match.toUpperCase();
      let value = 0;

      if (["CON", "FOR", "DEX", "CHA", "INT", "SAG"].includes(key)) {
        // Calculate modifier here instead of using pre-calculated value (exactement comme campagne.tsx)
        const rawValue = characterModifiers[key] || 0;
        value = calculateModifier(rawValue);
      } else if (key === "CONTACT") {
        value = characterModifiers.Contact || 0;
      } else if (key === "DISTANCE") {
        value = characterModifiers.Distance || 0;
      } else if (key === "MAGIE") {
        value = characterModifiers.Magie || 0;
      } else if (key === "DEFENSE") {
        value = characterModifiers.Defense || 0;
      }

      console.log(`Replaced ${match} with ${value}`);
      return value.toString();
    });

    console.log("Original notation:", notation);
    console.log("Final processed notation:", processedNotation);
    return processedNotation;
  };

  // Parser une notation pour extraire les dés nécessaires
  // Supports: XdY, XdYkhN, XdYklN
  const parseDiceRequests = (notation: string) => {
    const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;
    const requests: { type: string, count: number }[] = [];
    let match;

    // We need to clone the regex or reset lastIndex if we were reusing it, but here it's new
    while ((match = diceRegex.exec(notation)) !== null) {
      const count = parseInt(match[1]);
      const faces = parseInt(match[2]);
      requests.push({ type: `d${faces}`, count });
    }

    return requests;
  };

  // Référence pour stocker les promesses de roll en attente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingRollsRef = React.useRef<Map<string, (results: { type: string, value: number }[]) => void>>(new Map());

  // Écouter les résultats des dés 3D
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleRollComplete = (e: any) => {
      const { rollId, results } = e.detail;
      const resolve = pendingRollsRef.current.get(rollId);
      if (resolve) {
        resolve(results);
        pendingRollsRef.current.delete(rollId);
      }
    };

    window.addEventListener('vtt-3d-roll-complete', handleRollComplete);
    return () => window.removeEventListener('vtt-3d-roll-complete', handleRollComplete);
  }, []);

  const perform3DRoll = async (requests: { type: string, count: number }[], targets?: { type: string, value: number }[]): Promise<{ type: string, value: number }[]> => {
    if (typeof window === 'undefined' || requests.length === 0) return Promise.resolve([]);

    // Filtrer les dés supportés par la 3D (d6, d10, d12, d20 comme demandé)
    const SUPPORTED_3D_DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
    const requests3D = requests.filter(req => SUPPORTED_3D_DICE.includes(req.type));
    const requestsInstant = requests.filter(req => !SUPPORTED_3D_DICE.includes(req.type));

    // Générer immédiatement les résultats pour les dés non-3D
    const instantResults: { type: string, value: number }[] = [];
    requestsInstant.forEach(req => {
      // Check if we have a target for this
      // Logic complex for instant dice if targets are mixed, but generally targets will cover all if from API
      const faces = parseInt(req.type.substring(1));
      for (let i = 0; i < req.count; i++) {
        // Simple random fallback or try to find in targets?
        // For now fallback random
        instantResults.push({
          type: req.type,
          value: Math.floor(Math.random() * faces) + 1
        });
      }
    });

    // Si aucun dé 3D n'est requis
    if (requests3D.length === 0 || !show3DAnimations || isBlind) {
      if ((!show3DAnimations || isBlind) && requests3D.length > 0) {
        // Return targets directly if available, else random
        const simulatedResults: { type: string, value: number }[] = [];
        requests3D.forEach(req => {
          for (let i = 0; i < req.count; i++) {
            // Try to grab from targets
            let val = Math.floor(Math.random() * parseInt(req.type.substring(1))) + 1;
            if (targets) {
              const tIdx = targets.findIndex(t => t.type === req.type);
              if (tIdx !== -1) {
                val = targets[tIdx].value;
                targets.splice(tIdx, 1);
              }
            }
            simulatedResults.push({ type: req.type, value: val });
          }
        });
        return Promise.resolve([...simulatedResults, ...instantResults]);
      }
      return Promise.resolve([...instantResults]);
    }

    // Play dice sound
    try {
      const audioUrl = getAssetUrl("/dice.mp3");
      const audio = new Audio(audioUrl);
      audio.volume = 0.5; // Reasonable volume
      setTimeout(() => {
        audio.play().catch(e => console.warn("Could not play dice sound:", e));
      }, 500);
    } catch (e) {
      console.error("Audio error:", e);
    }

    const rollId = crypto.randomUUID();
    return new Promise((resolve) => {
      // Set timeout de sécurité (si jamais la 3D plante ou n'est pas chargée)
      const timeoutId = setTimeout(() => {
        if (pendingRollsRef.current.has(rollId)) {
          console.warn("Roll timed out, generating fallback values");
          // Fallback: générer des valeurs aléatoires locales pour les dés 3D manquants
          // OR use targets if available!
          const fallbackResults: { type: string, value: number }[] = [];

          // Use targets copy to consume
          const fallbackTargets = targets ? [...targets] : [];

          requests3D.forEach(req => {
            const faces = parseInt(req.type.substring(1));
            for (let i = 0; i < req.count; i++) {
              let val = Math.floor(Math.random() * faces) + 1;
              if (fallbackTargets.length > 0) {
                const tIdx = fallbackTargets.findIndex(t => t.type === req.type);
                if (tIdx !== -1) {
                  val = fallbackTargets[tIdx].value;
                  fallbackTargets.splice(tIdx, 1);
                }
              }
              fallbackResults.push({
                type: req.type,
                value: val
              });
            }
          });
          pendingRollsRef.current.delete(rollId);
          // On retourne tout
          resolve([...fallbackResults, ...instantResults]);
        }
      }, 10000); // 10 secondes max

      pendingRollsRef.current.set(rollId, (results3D) => {
        clearTimeout(timeoutId);
        // On fusionne les résultats 3D reçus avec les résultats instantanés
        resolve([...results3D, ...instantResults]);
      });

      // Déclencher l'animation avec les targets !
      window.dispatchEvent(new CustomEvent('vtt-trigger-3d-roll', {
        detail: {
          rollId,
          requests: requests3D,
          skinId: selectedSkinId,
          targets: targets ? [...targets] : undefined // Pass copy of targets
        }
      }));
    });
  };

  // Calculer le résultat final à partir de la notation et des résultats physiques
  const calculateFinalResult = (notation: string, physicalResults: { type: string, value: number }[]) => {
    // Copie mutable des résultats pour les consommer
    const availableResults = [...physicalResults];
    const detailsParts: string[] = [];

    // 1. Remplacer les dés par leurs valeurs
    const diceRegex = /(\d+)d(\d+)(?:k([hl])(\d+))?/gi;

    const processedMathString = notation.replace(diceRegex, (match, countStr, facesStr, keepType, keepCountStr) => {
      const count = parseInt(countStr);
      const faces = parseInt(facesStr);
      const dieType = `d${faces}`;
      const keepCount = keepCountStr ? parseInt(keepCountStr) : 0;

      // Récupérer les N prochains résultats de ce type
      const rollsForMatches: number[] = [];
      // On cherche dans availableResults les premiers qui correspondent
      // Note: availableResults est mélangé temporellement, mais on suppose que DiceThrower a empilé les résultats
      // Le mieux est de les filtrer et de les enlever
      // Pour être robuste: on prend les premiers 'count' résultats du type correspondant

      let foundCount = 0;
      for (let i = 0; i < availableResults.length && foundCount < count; i++) {
        if (availableResults[i].type === dieType) {
          rollsForMatches.push(availableResults[i].value);
          availableResults.splice(i, 1); // Remove used result
          i--; // Adjust index
          foundCount++;
        }
      }

      // Si on a pas assez de résultats (fallback), on génère
      while (rollsForMatches.length < count) {
        rollsForMatches.push(Math.floor(Math.random() * faces) + 1);
      }

      // Appliquer la logique Keep High / Keep Low
      let total = 0;
      let usedRolls: { val: number, keep: boolean }[] = rollsForMatches.map(r => ({ val: r, keep: true }));

      if (keepType) {
        // Trier pour déterminer qui garder
        // kh = keep high (descending), kl = keep low (ascending)
        const sortedIndices = rollsForMatches.map((val, idx) => ({ val, idx }))
          .sort((a, b) => keepType === 'h' ? b.val - a.val : a.val - b.val);

        const indicesToKeep = new Set(sortedIndices.slice(0, keepCount).map(x => x.idx));

        usedRolls = rollsForMatches.map((val, idx) => ({
          val,
          keep: indicesToKeep.has(idx)
        }));

        total = usedRolls.filter(r => r.keep).reduce((sum, r) => sum + r.val, 0);
      } else {
        // Somme simple
        total = rollsForMatches.reduce((a, b) => a + b, 0);
      }

      // Formatter l'affichage: [17, r1]
      const formattedDice = usedRolls.map(r => r.keep ? `${r.val}` : `r${r.val}`).join(', ');
      detailsParts.push(`[${formattedDice}]`);

      return total.toString();
    });

    // 2. Évaluer l'expression mathématique finale (ex: "12 + 5")
    let grandTotal = 0;
    try {
      // Sécurisation basique: on ne garde que chiffres et opérateurs
      const safeExpression = processedMathString.replace(/[^0-9+\-*/().\s]/g, '');
      // eslint-disable-next-line no-eval
      grandTotal = eval(safeExpression);
    } catch (e) {
      console.error("Error evaluating roll expression", e);
      grandTotal = 0;
    }

    // 3. Construire la string de détail
    // On essaie de reconstruire quelque chose qui ressemble à l'input original mais avec les détails
    // Notation originale -> Processed (vars replaced) -> Output
    // Ex: 1d6+CON -> 1d6+3 -> [4]+3 = 7

    // Reconstruisons une string de détails 'riche' en remplaçant dans la notation
    let detailString = notation;
    let matchIndex = 0;
    detailString = detailString.replace(diceRegex, () => {
      const part = detailsParts[matchIndex] || "[?]";
      matchIndex++;
      return part;
    });

    return {
      total: Math.floor(grandTotal), // Arrondi par sécurité
      output: `${notation} = ${detailString} = ${grandTotal}`
    };
  };

  // Fonction principale de lancer de dés
  const rollDice = async (diceNotation?: string) => {
    const originalNotation = diceNotation || input;
    if (!originalNotation.trim()) {
      setError("Veuillez entrer une notation de dés");
      return;
    }

    // Afficher une carte provisoire immédiatement
    // Si blind (caché), on affiche un placeholder
    setResult(isBlind ? {
      id: "pending",
      notation: originalNotation,
      result: "?",
      total: 0,
      timestamp: new Date(),
      output: "Lancement caché..."
    } : {
      id: "pending",
      notation: originalNotation,
      result: "...",
      total: 0, // Placeholder
      timestamp: new Date(),
      output: "Lancement des dés..."
    });
    setIsLoading(true);
    setError("");

    try {
      // Remplacer les caractéristiques dans la notation
      const processedNotation = replaceCharacteristics(originalNotation);

      // Vérifier si des caractéristiques n'ont pas pu être remplacées
      if (processedNotation === originalNotation && originalNotation.match(/\b(CON|DEX|FOR|SAG|INT|CHA|Defense|Contact|Distance|Magie|INIT)\b/i)) {
        setError("Caractéristiques non trouvées. Assurez-vous d'être connecté et d'avoir un personnage.");
        setIsLoading(false);
        return;
      }

      // 1. Identifier les dés à lancer
      const requests = parseDiceRequests(processedNotation);
      let physicalResults: { type: string, value: number }[] = [];
      let total = 0;
      let output = "";
      let savedByApi = false;
      let timestamp = Date.now();

      if (show3DAnimations && !isBlind) {
        // --- 3D MODE (PHYSICS) ---
        // On n'utilise PAS l'API pour générer les résultats ici, on laisse la physique faire.
        // On sauvegarde ensuite via le client.

        // Lancer les dés 3D et attendre le résultat physique
        physicalResults = await perform3DRoll(requests);

        // Cheat code via console
        // @ts-ignore
        if (typeof window !== "undefined" && window.CHEAT_DICE !== undefined) {
          // @ts-ignore
          const cheat = window.CHEAT_DICE;
          console.log("CHEAT MODE:", cheat);
          physicalResults = physicalResults.map((r) => {
            let newVal = r.value;
            if (typeof cheat === "number") newVal = cheat;
            else if (typeof cheat === "object" && cheat[r.type]) newVal = cheat[r.type];
            return { ...r, value: newVal };
          });
        }

        // Calculer le résultat logique BASÉ sur le résultat physique
        const calculated = calculateFinalResult(processedNotation, physicalResults);
        total = calculated.total;
        output = calculated.output;

      } else {
        // --- API MODE (INSTANT / NO ANIMATION) ---
        // Utiliser l'API pour générer et enregistrer

        const apiResponse = await fetch('/api/roll-dice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notation: processedNotation
          })
        });

        if (!apiResponse.ok) {
          throw new Error("Erreur API : " + apiResponse.statusText);
        }

        const apiData = await apiResponse.json();
        physicalResults = apiData.rolls as { type: string, value: number }[];
        total = apiData.total;
        output = apiData.output;
        savedByApi = apiData.saved;
        timestamp = apiData.timestamp;
      }

      // Créer le résultat pour l'affichage
      const result: RollResult = {
        id: Date.now().toString(),
        notation: originalNotation,
        result: total.toString(),
        total: total,
        timestamp: new Date(timestamp),
        output: output
      };

      // Créer le résultat pour l'affichage local
      // Si blind, on montre un résultat masqué, MEME pour le lanceur
      if (isBlind) {
        setResult({
          id: Date.now().toString(),
          notation: originalNotation,
          result: "?",
          total: 0,
          timestamp: new Date(),
          output: "Résultat caché (envoyé au MJ)"
        });
      } else {
        setResult(result);
      }

      if (roomId && userName) {
        // Prepare FirebaseRoll for state update

        // Note: parseNotation était utilisé pour extraire diceFaces pour les stats firebase
        // On peut essayer de deviner le "dé principal" pour les stats
        // Prenons le premier dé de la notation
        let mainDieFaces = 20;
        let mainDieCount = 1;
        if (requests.length > 0) {
          mainDieFaces = parseInt(requests[0].type.substring(1));
          mainDieCount = requests[0].count;
        }

        const flatResults = physicalResults.map(r => r.value);

        const firebaseRoll: FirebaseRoll = {
          id: crypto.randomUUID(), // Local ID
          isPrivate,
          isBlind,
          diceCount: mainDieCount,
          diceFaces: mainDieFaces,
          modifier: 0,
          results: flatResults,
          total: total,
          userName,
          ...(userAvatar ? { userAvatar } : {}),
          type: show3DAnimations ? "Dice Roller" : "Dice Roller/API",
          timestamp: timestamp,
          notation: originalNotation,
          output: output,
          ...(persoId ? { persoId } : {})
        };

        // If NOT saved by API (either because we are in 3D mode, or API failed to save), save it here.
        if (!savedByApi) {
          await addDoc(collection(db, `rolls/${roomId}/rolls`), firebaseRoll);
        }

        // Update local state so we see it immediately
        setFirebaseRolls((prevRolls) => [firebaseRoll, ...prevRolls]);

        // === CHALLENGE TRACKING: Dice Roll ===
        if (auth.currentUser) {
          const isCritical = mainDieFaces === 20; // Critique uniquement pour d20
          const mainResult = physicalResults.length > 0 ? physicalResults[0].value : 0;

          trackDiceRoll(
            auth.currentUser.uid,
            mainDieFaces,
            mainResult,
            isCritical
          ).catch(error => console.error('Challenge tracking error:', error));
        }

        // === Détection échec critique (nat 1 sur d20) ===
        const hasD20 = requests.some(r => r.type === 'd20');
        const d20Results = physicalResults.filter(r => r.type === 'd20');
        const hasNat1 = d20Results.some(r => r.value === 1);
        const hasNat20 = d20Results.some(r => r.value === 20);

        if (hasD20 && hasNat1 && userEmail && auth.currentUser) {
          const titleLabel = "Maudit des dés";
          const slug = generateSlug(titleLabel);
          const userRef = doc(db, "users", auth.currentUser.uid);

          // Check if title is already unlocked
          getDoc(userRef).then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const isUnlocked = data.titles && data.titles[slug] === "unlocked";

              if (!isUnlocked) {
                // Unlock title
                updateDoc(userRef, {
                  [`titles.${slug}`]: "unlocked"
                }).then(() => {
                  toast.success(`Nouveau titre débloqué : ${titleLabel} !`, {
                    icon: '🔓',
                    duration: 5000
                  });
                }).catch(e => console.error("Error unlocking title:", e));

                // Send Email (ONLY if unlocking title)
                fetch('/api/send-critical-fail', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: userEmail,
                    firstName: userName,
                    rollDetails: output,
                    campaignName: undefined, // optionnel
                  }),
                })
                  .then(res => {
                    if (res.ok) {
                      toast.error('💀 Échec critique ! Un email de honte vous a été envoyé...', { duration: 6000 });
                    } else {
                      console.error('Failed to send critical fail email:', res.statusText);
                    }
                  })
                  .catch(err => console.error('Error sending critical fail email:', err));

              } else {
                console.log("Title 'Maudit des dés' already unlocked, skipping email.");
              }
            }
          });
        }

        if (hasD20 && hasNat20 && userEmail && auth.currentUser) {
          const titleLabel = "Béni des Dieux";
          const slug = generateSlug(titleLabel);
          const userRef = doc(db, "users", auth.currentUser.uid);

          // Check if title is already unlocked
          getDoc(userRef).then((snap) => {
            if (snap.exists()) {
              const data = snap.data();
              const isUnlocked = data.titles && data.titles[slug] === "unlocked";

              if (!isUnlocked) {
                // Unlock title
                updateDoc(userRef, {
                  [`titles.${slug}`]: "unlocked"
                }).then(() => {
                  toast.success(`Nouveau titre débloqué : ${titleLabel} !`, {
                    icon: '🏆',
                    duration: 5000
                  });
                }).catch(e => console.error("Error unlocking title:", e));

                // Send Email (ONLY if unlocking title)
                fetch('/api/send-critical-success', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: userEmail,
                    firstName: userName,
                    rollDetails: output,
                    campaignName: undefined, // optionnel
                  }),
                })
                  .then(res => {
                    if (res.ok) {
                      toast.success('🏆 Succès critique ! Votre gloire a été immortalisée par email !', { duration: 6000 });
                    } else {
                      console.error('Failed to send critical success email:', res.statusText);
                    }
                  })
                  .catch(err => console.error('Error sending critical success email:', err));

              } else {
                console.log("Title 'Béni des Dieux' already unlocked, skipping email.");
              }
            }
          });
        }
      }

    } catch (err) {
      setError("Erreur lors du lancer ou de l'API.");
      console.error("Erreur de lancer de dés:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Effacer les lancers Firebase
  const clearFirebaseRolls = async () => {
    if (roomId) {
      try {
        const rollsRef = collection(db, `rolls/${roomId}/rolls`);
        const snapshot = await getDocs(rollsRef);

        snapshot.forEach((doc) => {
          deleteDoc(doc.ref);
        });
        setFirebaseRolls([]);
      } catch (error) {
        console.error("Error deleting rolls:", error);
      }
    }
  };

  // Reprendre un lancer depuis Firebase
  const rerollFromFirebase = (firebaseRoll: FirebaseRoll) => {
    if (firebaseRoll.notation) {
      setInput(firebaseRoll.notation);
      rollDice(firebaseRoll.notation);
    }
  };

  // Vérifier si un lancer peut être affiché
  const canDisplayRoll = (roll: FirebaseRoll) => {
    if (isMJ) return true; // Le MJ voit TOUT
    if (roll.isBlind) return false; // Si c'est blind, PERSONNE d'autre ne voit (même pas le lanceur dans l'historique)
    if (!roll.isPrivate) return true;
    return roll.userName === characterName;
  };

  // Récupérer seulement les lancers Firebase filtrés
  const getFilteredRolls = () => {
    return firebaseRolls.filter(canDisplayRoll).sort((a, b) => b.timestamp - a.timestamp);
  };

  const RollingNumber = () => {
    const [num, setNum] = useState(0);
    useEffect(() => {
      const interval = setInterval(() => {
        setNum(Math.floor(Math.random() * 20) + 1);
      }, 100);
      return () => clearInterval(interval);
    }, []);
    return <span>{num}</span>;
  };

  // Refs for debouncing roll shortcuts
  const pendingDiceRef = useRef<string[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Effet pour les raccourcis clavier
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorer si on écrit dans un input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      let rollCmd = "";
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.ROLL_D4)) rollCmd = "1d4";
      else if (isShortcutPressed(e, SHORTCUT_ACTIONS.ROLL_D6)) rollCmd = "1d6";
      else if (isShortcutPressed(e, SHORTCUT_ACTIONS.ROLL_D8)) rollCmd = "1d8";
      else if (isShortcutPressed(e, SHORTCUT_ACTIONS.ROLL_D10)) rollCmd = "1d10";
      else if (isShortcutPressed(e, SHORTCUT_ACTIONS.ROLL_D12)) rollCmd = "1d12";
      else if (isShortcutPressed(e, SHORTCUT_ACTIONS.ROLL_D20)) rollCmd = "1d20";
      else if (isShortcutPressed(e, SHORTCUT_ACTIONS.ROLL_D100)) rollCmd = "1d100";

      // check for custom shortcuts
      if (!rollCmd) {
        for (const shortcut of customShortcuts) {
          if (checkKeyCombination(e, shortcut.keyString)) {
            rollCmd = shortcut.command;
            break;
          }
        }
      }

      if (rollCmd) {
        // Add to pending rolls
        pendingDiceRef.current.push(rollCmd);

        // Clear existing timer
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // Set new timer
        debounceTimerRef.current = setTimeout(() => {
          if (pendingDiceRef.current.length > 0) {
            // Combine all dice
            const combinedNotation = pendingDiceRef.current.join("+");

            toast.info("Lancer en cours...", { duration: 1000 });
            rollDice(combinedNotation);

            // Clear pending
            pendingDiceRef.current = [];
            debounceTimerRef.current = null;
          }
        }, 300); // 300ms delay to allow multiple key presses
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isShortcutPressed, rollDice]);

  return (
    <div className="mx-auto p-3 space-y-4 bg-[var(--bg-dark)] min-h-screen relative">
      {/* En-tête */}


      {/* Contrôles de confidentialité */}
      {roomId && (
        <Card className="card">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-black/20 p-1 rounded-lg">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsPrivate(!isPrivate)}
                  className={`h-8 px-2 gap-2 transition-all duration-200 ${isPrivate ? "bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  title="Mode Privé : visible uniquement par vous et le MJ"
                >
                  <Shield className="h-4 w-4" />
                  <span className="text-xs font-medium hidden sm:inline">Privé</span>
                </Button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsBlind(!isBlind)}
                  className={`h-8 px-2 gap-2 transition-all duration-200 ${isBlind ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  title="Mode Caché : résultat invisible pour vous (visible MJ)"
                >
                  <EyeOff className="h-4 w-4" />
                  <span className="text-xs font-medium hidden sm:inline">Caché</span>
                </Button>

                <div className="w-px h-4 bg-white/10 mx-1" />

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newVal = !show3DAnimations;
                    setShow3DAnimations(newVal);
                    localStorage.setItem("vtt_3d_enabled", String(newVal));
                  }}
                  className={`h-8 px-2 gap-2 transition-all duration-200 ${show3DAnimations ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                  title="Animation 3D"
                >
                  <Box className="h-4 w-4" />
                  <span className="text-xs font-medium hidden sm:inline">3D</span>
                </Button>
              </div>


            </div>
          </CardContent>
        </Card>
      )}

      {/* Input principal */}
      <Card className="card">
        <CardContent className="p-3 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rollDice()}
              placeholder="Ex: 1d20+5, 3d6, 2d20kh1, 1d20+CON..."
              className="input-field flex-1"
              disabled={isLoading}
            />
            <InteractiveHoverButton
              onClick={() => rollDice()}
              disabled={isLoading}
              className=""
            >
              <span className="flex items-center gap-2">
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
                  >
                    <Dice1 className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <Dice1 className="h-5 w-5" />
                )}
                <span>{isLoading ? "Lancement..." : "Lancer"}</span>
              </span>
            </InteractiveHoverButton>
          </div>

          <div className="pt-2 flex justify-between items-center">
            <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span
                className="w-3 h-3 rounded-full border border-white/20"
                style={{ backgroundColor: DICE_SKINS[selectedSkinId]?.bodyColor || '#f59e0b' }}
              />
              <span className="opacity-80">Skin: {DICE_SKINS[selectedSkinId]?.name || "Classique"}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 bg-transparent border-white/10 hover:bg-white/5"
              onClick={() => setIsSkinDialogOpen(true)}
            >
              <Store className="h-3.5 w-3.5" />
              Boutique
            </Button>

            <DiceStoreModal
              isOpen={isSkinDialogOpen}
              onClose={() => setIsSkinDialogOpen(false)}
              currentSkinId={selectedSkinId}
              onSelectSkin={(skinId) => {
                setSelectedSkinId(skinId);
              }}
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Résultat actuel */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
          >
            <Card className="card bg-gradient-to-r from-[var(--accent-brown)]/5 to-[var(--accent-brown)]/10 border-[var(--accent-brown)]/20">
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <div className="flex items-center justify-center gap-2">
                    <Dice1 className="h-6 w-6 text-[var(--accent-brown)]" />
                    <span className="text-lg font-medium text-[var(--text-secondary)]">
                      {result.notation}
                    </span>
                    {isPrivate && <Shield className="h-5 w-5 text-[var(--accent-brown)]" />}
                  </div>

                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="text-6xl font-bold text-[var(--accent-brown)]"
                  >
                    {isLoading ? (
                      <RollingNumber />
                    ) : (
                      <span className="text-6xl font-bold text-[var(--accent-brown)]">
                        {result.total}
                      </span>
                    )}
                  </motion.div>

                  <AnimatePresence>
                    {showDetails && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.5 }}
                        className="text-sm text-[var(--text-secondary)] font-mono"
                      >
                        {result.output}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex justify-center gap-2">
                    <Button
                      onClick={() => rollDice(result.notation)}
                      className="button-secondary flex items-center gap-1"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Relancer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onglets Historique / Statistiques */}
      <div className="space-y-2">
        <div className="flex gap-2 w-full">
          <Button
            onClick={() => setShowStats(false)}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-1.5 text-xs ${!showStats ? "button-primary" : "button-cancel"
              }`}
            size="sm"
          >
            <History className="h-4 w-4" />
            <span className="truncate">Historique ({getFilteredRolls().length})</span>
          </Button>
          <Button
            onClick={() => setShowStats(true)}
            className={`flex-1 flex items-center justify-center gap-2 px-2 py-1.5 text-xs ${showStats ? "button-primary" : "button-cancel"
              }`}
            size="sm"
          >
            <BarChart3 className="h-4 w-4" />
            <span>Stats</span>
          </Button>
        </div>

        {firebaseRolls.length > 0 && isMJ && !showStats && (
          <Button
            onClick={clearFirebaseRolls}
            className="w-full button-cancel flex items-center justify-center gap-2 px-2 py-1.5 text-xs"
            size="sm"
          >
            <Trash2 className="h-3 w-3" />
            Effacer tout l'historique
          </Button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {showStats ? (
          <motion.div
            key="stats"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <DiceStats
              rolls={getFilteredRolls()}
              currentUserName={characterName}
              isMJ={isMJ}
            />
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {showHistory && (
              <div className="overflow-y-auto">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  {getFilteredRolls().length === 0 ? (
                    <div className="text-center text-[var(--text-secondary)] py-8">
                      Aucun lancer dans l&apos;historique
                    </div>
                  ) : (
                    getFilteredRolls().map((roll, index) => (
                      <motion.div
                        key={roll.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <Card className="card">
                          <CardContent className="p-3 flex items-center space-x-3">
                            {roll.userAvatar && (
                              <Avatar className="h-16 w-16">
                                <AvatarImage src={roll.userAvatar} alt="Avatar" className="object-contain" />
                              </Avatar>
                            )}
                            <div className="flex-grow">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medieval text-[var(--text-primary)]">{roll.userName}</span>
                                {roll.isPrivate && <Shield className="h-4 w-4 text-[var(--accent-brown)]" />}
                              </div>
                              <span className="text-sm font-medium text-[var(--text-primary)]">
                                {roll.notation}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="text-lg font-bold text-[var(--text-primary)]">Total: {roll.total}</span>
                              </div>
                              <div className="text-xs text-[var(--text-secondary)] font-mono mt-1">
                                {roll.output}
                              </div>
                            </div>
                            <Button
                              onClick={() => rerollFromFirebase(roll)}
                              className="button-secondary opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-all"
                              size="sm"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Relancer
                            </Button>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}