"use client";

import React, { useState, useEffect } from "react";
import { DiceRoll } from "@dice-roller/rpg-dice-roller";
import { motion, AnimatePresence } from "framer-motion";
import { Dice1, RotateCcw, History, Trash2, Shield, BarChart3 } from "lucide-react";
import { auth, db, addDoc, collection, getDocs, getDoc, doc, deleteDoc, query, orderBy } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DiceStats } from "./dice-stats";

// Types
interface RollResult {
  id: string;
  notation: string;
  result: string;
  total: number;
  timestamp: Date;
  output: string;
}

// Type compatible avec campagne.tsx
interface FirebaseRoll {
  id: string;
  isPrivate: boolean;
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

export function DiceRoller() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<RollResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [firebaseRolls, setFirebaseRolls] = useState<FirebaseRoll[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHistory] = useState(true);
  const [showStats, setShowStats] = useState(false);
  
  // États utilisateur et personnage - récupérés directement de Firebase
  const [roomId, setRoomId] = useState<string | null>(null);
  const [persoId, setPersoId] = useState<string | null>(null);
  const [isMJ, setIsMJ] = useState(false);
  const [userName, setUserName] = useState("Utilisateur");
  const [userAvatar, setUserAvatar] = useState<string | undefined>(undefined);
  const [characterName, setCharacterName] = useState("Utilisateur");
  const [characterModifiers, setCharacterModifiers] = useState<{ [key: string]: number }>({});


  // Effet pour afficher les détails 1 seconde après le résultat
  useEffect(() => {
    if (result) {
      setShowDetails(false);
      const timer = setTimeout(() => {
        setShowDetails(true);
      }, 1500);
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
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
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
      const rollsQuery = query(rollsRef, orderBy("timestamp", "desc"));
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
      console.log("CharacterModifiers not available for:", notation);
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

  // Parser une notation pour extraire les composants
  const parseNotation = (notation: string) => {
    // Regex pour capturer les dés de base (ex: 2d6, 1d20)
    const basicDiceRegex = /(\d+)d(\d+)/i;
    const match = notation.match(basicDiceRegex);
    
    if (match) {
      const diceCount = parseInt(match[1]);
      const diceFaces = parseInt(match[2]);
      
      // Extraire le modificateur (tout ce qui vient après les dés de base)
      const modifierPart = notation.replace(basicDiceRegex, '').trim();
      let modifier = 0;
      
      if (modifierPart) {
        // Évaluer l'expression mathématique simple
        try {
          const processedModifier = replaceCharacteristics(modifierPart);
          modifier = eval(processedModifier.replace(/[^0-9+\-*/\s]/g, '')) || 0;
        } catch {
          modifier = 0;
        }
      }
      
      return { diceCount, diceFaces, modifier };
    }
    
    return null;
  };

  // Fonction pour formater les détails des dés avec plus de précision
  const formatDiceDetails = (roll: DiceRoll, originalNotation: string, processedNotation: string): string => {
    try {
      const details: string[] = [];
      let totalDiceSum = 0;
      let hasModifiers = false;
             const keptDice: number[] = [];
       const allDice: number[] = [];
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      roll.rolls.forEach((rollGroup: any) => {
        if (rollGroup.rolls && rollGroup.rolls.length > 0) {
          // Vérifier s'il y a des modificateurs (keep highest, keep lowest, etc.)
          hasModifiers = rollGroup.modifiers && rollGroup.modifiers.length > 0;
          
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rollGroup.rolls.forEach((die: any) => {
            const value = die.value || die.result || die;
            allDice.push(value);
            if (!die.discarded) {
              keptDice.push(value);
              totalDiceSum += value;
            }
          });
          
          if (hasModifiers) {
            // Afficher tous les dés lancés et indiquer lesquels sont gardés
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const diceDisplay = rollGroup.rolls.map((die: any) => {
              const value = die.value || die.result || die;
              const isKept = !die.discarded;
              return isKept ? `**${value}**` : `~~${value}~~`;
            }).join(', ');
            
            details.push(`[${diceDisplay}]`);
          } else {
            // Pas de modificateurs, afficher simplement les résultats
            details.push(`[${keptDice.join(', ')}]`);
          }
        }
      });
      
      // Calculer le modificateur numérique
      const modifier = roll.total - totalDiceSum;
      
      // Construire l'affichage détaillé
      let result = `${originalNotation} → ${processedNotation}: ${details.join(' + ')}`;
      
      if (hasModifiers && keptDice.length < allDice.length) {
        // Pour les modificateurs comme kh, kl, etc.
        result += ` = [${keptDice.join(', ')}] = ${roll.total}`;
      } else if (modifier !== 0) {
        // Pour les modificateurs numériques comme +3, -2
        result += ` = ${totalDiceSum}`;
        if (modifier > 0) {
          result += `+${modifier}`;
        } else {
          result += `${modifier}`;
        }
        result += ` = ${roll.total}`;
      } else {
        // Pas de modificateur
        result += ` = ${roll.total}`;
      }
      
      return result;
    } catch {
      // En cas d'erreur, retourner un format de base
      return `${originalNotation} → ${processedNotation}: ${roll.output} = ${roll.total}`;
    }
  };

  // Extraire les résultats individuels des dés
  const extractDiceResults = (roll: DiceRoll): number[] => {
    try {
      const results: number[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      roll.rolls.forEach((rollGroup: any) => {
        if (rollGroup.rolls && rollGroup.rolls.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rollGroup.rolls.forEach((die: any) => {
            if (!die.discarded) {
              results.push(die.value || die.result || die);
            }
          });
        }
      });
      return results;
    } catch {
      return [];
    }
  };

  // Fonction principale de lancer de dés
  const rollDice = async (diceNotation?: string) => {
    const originalNotation = diceNotation || input;
    if (!originalNotation.trim()) {
      setError("Veuillez entrer une notation de dés");
      return;
    }

    // Effacer immédiatement le résultat précédent
    setResult(null);
    setIsLoading(true);
    setError("");

    try {
      // Petit délai pour l'animation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Remplacer les caractéristiques dans la notation
      const processedNotation = replaceCharacteristics(originalNotation);
      
      // Vérifier si des caractéristiques n'ont pas pu être remplacées (sauf "d" qui est normal)
      if (processedNotation === originalNotation && originalNotation.match(/\b(CON|DEX|FOR|SAG|INT|CHA|Defense|Contact|Distance|Magie|INIT)\b/i)) {
        setError("Caractéristiques non trouvées. Assurez-vous d'être connecté et d'avoir un personnage.");
        setIsLoading(false);
        return;
      }
      
      console.log("About to create DiceRoll with:", processedNotation);
      const roll = new DiceRoll(processedNotation);
      
      // Générer les détails formatés des dés avec le nouveau format
      const diceDetails = formatDiceDetails(roll, originalNotation, processedNotation);
      
      // Créer le résultat pour l'affichage
      const result: RollResult = {
        id: Date.now().toString(),
        notation: originalNotation, // Garder la notation originale avec les caractéristiques
        result: roll.toString(),
        total: roll.total,
        timestamp: new Date(),
        output: diceDetails
      };

      setResult(result);

      // Sauvegarder dans Firebase si connecté
      if (roomId && userName) {
        const parsedNotation = parseNotation(processedNotation);
        if (parsedNotation) {
          const diceResults = extractDiceResults(roll);
          
          const firebaseRoll: FirebaseRoll = {
            id: crypto.randomUUID(),
            isPrivate,
            diceCount: parsedNotation.diceCount,
            diceFaces: parsedNotation.diceFaces,
            modifier: parsedNotation.modifier,
            results: diceResults,
            total: roll.total,
            userName,
            userAvatar,
            type: "Dice Roller",
            timestamp: Date.now(),
            notation: originalNotation,
            output: diceDetails,
            ...(persoId ? { persoId } : {})
          };

          await addDoc(collection(db, `rolls/${roomId}/rolls`), firebaseRoll);
          setFirebaseRolls((prevRolls) => [firebaseRoll, ...prevRolls]);
        }
      }
      
    } catch (err) {
      setError("Notation invalide. Exemples: 1d20, 2d6+3, 4d6kh3, 1d20+CON");
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
    if (!roll.isPrivate) return true;
    if (isMJ) return true;
    return roll.userName === characterName;
  };

  // Récupérer seulement les lancers Firebase filtrés
  const getFilteredRolls = () => {
    return firebaseRolls.filter(canDisplayRoll).sort((a, b) => b.timestamp - a.timestamp);
  };

  return (
    <div className="container mx-auto p-4 space-y-6 bg-[var(--bg-dark)] min-h-screen relative">
      {/* En-tête */}


      {/* Contrôles de confidentialité */}
      {roomId && (
        <Card className="card">
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor="private-switch" className="text-[var(--text-primary)]">Lancer privé</Label>
              <Switch id="private-switch" checked={isPrivate} onCheckedChange={setIsPrivate} />
              {userName && (
                <div className="flex items-center gap-3 ml-4">
                  {userAvatar && (
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={userAvatar} alt="Avatar" className="object-contain" />
                    </Avatar>
                  )}
                  <span className="text-base font-medium text-[var(--text-primary)]">{userName}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Input principal */}
      <Card className="card">
        <CardContent className="space-y-4">
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
            <Button
              onClick={() => rollDice()}
              disabled={isLoading}
              className="button-primary flex items-center gap-2"
            >
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
              {isLoading ? "Lancement..." : "Lancer"}
            </Button>
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
                    <NumberTicker 
                      value={result.total} 
                      className="text-6xl font-bold text-[var(--accent-brown)]"
                      delay={0.5}
                    />
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
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              onClick={() => setShowStats(false)}
              className={`flex items-center gap-2 ${
                !showStats ? "button-primary" : "button-cancel"
              }`}
            >
              <History className="h-5 w-5" />
              Historique ({getFilteredRolls().length})
            </Button>
            <Button
              onClick={() => setShowStats(true)}
              className={`flex items-center gap-2 ${
                showStats ? "button-primary" : "button-cancel"
              }`}
            >
              <BarChart3 className="h-5 w-5" />
              Statistiques
            </Button>
          </div>
          <div className="flex gap-2">
            {firebaseRolls.length > 0 && isMJ && !showStats && (
              <Button
                onClick={clearFirebaseRolls}
                className="button-cancel flex items-center gap-1"
              >
                <Trash2 className="h-3 w-3" />
                Effacer tout
              </Button>
            )}
          </div>
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
    </div>
  );
} 