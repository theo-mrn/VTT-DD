'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Shield, Dices, Swords, Trash2 ,Info} from 'lucide-react';
import { auth, db, addDoc, collection, getDocs, getDoc, doc, deleteDoc, query, orderBy } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import RollRequest from './Rollrequest'; // Importation du composant RollRequest
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select"; // Assurez-vous d'importer les composants nécessaires

type Roll = {
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
};

// Helper function to calculate the modifier from a characteristic value
const calculateModifier = (value: number) => Math.floor((value - 10) / 2);

export default function DiceRollerDnD() {
  const [isPrivate, setIsPrivate] = useState(false);
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [userAvatar, setUserAvatar] = useState<string | undefined>("/placeholder.svg?height=40&width=40");
  const [userName, setUserName] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [persoId, setPersoId] = useState<string | null>(null);
  const [isMJ, setIsMJ] = useState(false);
  const [characterName, setCharacterName] = useState("");
  const [characterModifiers, setCharacterModifiers] = useState<{ [key: string]: number }>({
    CON: 0,
    DEX: 0,
    FOR: 0,
    SAG: 0,
    INT: 0,
    CHA: 0,
  });
  const [showRollRequest, setShowRollRequest] = useState(false);
  const [rollCommand, setRollCommand] = useState(""); // État pour le champ de texte
  const [showInfo, setShowInfo] = useState(false); // État pour afficher ou masquer les informations
  const [characters, setCharacters] = useState<{ id: string, name: string }[]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        getDoc(userRef).then((docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRoomId(data.room_id);
            setPersoId(data.persoId);
            setIsMJ(data.perso === "MJ");
            if (data.perso === "MJ") {
              setUserName("MJ");
              setUserAvatar(undefined);
              fetchCharacters(data.room_id);
            } else {
              fetchCharacterInfo(data.room_id, data.persoId);
            }
            fetchRolls(data.room_id);
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

  const handleCharacteristicRoll = (char: string) => {
    const modifier = characterModifiers[char] || 0;
    rollDice(1, 20, modifier, char); // Ajout des arguments manquants
  };

  const fetchCharacterInfo = async (roomId: string, persoId: string) => {
    try {
      const charRef = doc(db, `cartes/${roomId}/characters/${persoId}`);
      const charSnap = await getDoc(charRef);

      if (charSnap.exists()) {
        const charData = charSnap.data();
        setCharacterName(charData.Nomperso || "Utilisateur");
        setUserName(charData.Nomperso || "Utilisateur");
        setUserAvatar(charData.imageURL || undefined);

        // Calculate and set the modifier for each characteristic
        setCharacterModifiers({
          CON: calculateModifier(charData.CON || 0),
          DEX: calculateModifier(charData.DEX || 0),
          FOR: calculateModifier(charData.FOR || 0),
          SAG: calculateModifier(charData.SAG || 0),
          INT: calculateModifier(charData.INT || 0),
          CHA: calculateModifier(charData.CHA || 0),
          Contact: charData.Contact || 0, // Ajout de Contact
          Distance: charData.Distance || 0, // Ajout de Distance
          Magie: charData.Magie || 0, // Ajout de Magie
        });
        console.log("Fetched character info:", charData);
        return charData; // Retourner les données du personnage
      } else {
        console.log("No character document found!");
      }
    } catch (error) {
      console.error("Error fetching character info:", error);
    }
    return null;
  };

  const fetchCharacters = async (roomId: string) => {
    try {
      const charactersRef = collection(db, `cartes/${roomId}/characters`);
      const snapshot = await getDocs(charactersRef);
  
      const fetchedCharacters = snapshot.docs
        .map(doc => {
          const data = doc.data();
          console.log("Character found:", data.Nomperso); // Log chaque Nomperso trouvé
          return { id: doc.id, name: data.Nomperso || "Unnamed Character", type: data.type };
        })
        .filter(char => char.type !== "joueurs");
  
      setCharacters(fetchedCharacters);
    } catch (error) {
      console.error("Error fetching characters:", error);
    }
  };
  

  const fetchRolls = async (roomId: string) => {
    try {
      const rollsRef = collection(db, `rolls/${roomId}/rolls`);
      const rollsQuery = query(rollsRef, orderBy("timestamp", "desc"));
      const snapshot = await getDocs(rollsQuery);

      const fetchedRolls = snapshot.docs.map(doc => doc.data() as Roll);
      setRolls(fetchedRolls);
    } catch (error) {
      console.error("Error loading rolls:", error);
    }
  };

  const parseRollCommand = (command: string, charData: any) => {
    console.log("Parsing command:", command);
    console.log("Character data:", charData);
  
    const regex = /^(\d+)d(\d+)(([+-](\d+|CON|DEX|SAG|FOR|INT|CHA|c|d|m))*)\s*(-p)?$/;
    const match = command.match(regex);
    if (match) {
      const diceCount = parseInt(match[1]);
      const diceFaces = parseInt(match[2]);
      let modifier = 0;
      const modifiers = match[3].match(/[+-](\d+|CON|DEX|SAG|FOR|INT|CHA|c|d|m)/g) || [];
      console.log("Modifiers found:", modifiers);
  
      modifiers.forEach(mod => {
        const sign = mod[0];
        const value = mod.substring(1);
        let modValue = 0;
        if (["CON", "DEX", "SAG", "FOR", "INT", "CHA"].includes(value)) {
          modValue = characterModifiers[value] || 0;
        } else if (value === "c") {
          modValue = charData.Contact || 0;
        } else if (value === "d") {
          modValue = charData.Distance || 0;
        } else if (value === "m") {
          modValue = charData.Magie || 0;
        } else {
          modValue = parseInt(value);
        }
        console.log(`Modifier ${mod}: ${sign}${modValue}`);
        modifier += (sign === '+' ? modValue : -modValue);
      });
      const isPrivate = match[5] !== undefined;
      console.log("Parsed command result:", { diceCount, diceFaces, modifier, isPrivate });
      return { diceCount, diceFaces, modifier, isPrivate };
    }
    console.log("No match found for command:", command);
    return null;
  };

  const handleRollCommand = () => {
    if (isMJ) {
      if (selectedCharacter) {
        fetchCharacterInfo(roomId!, selectedCharacter).then((charData) => {
          const parsed = parseRollCommand(rollCommand, charData);
          if (parsed) {
            rollDice(parsed.diceCount, parsed.diceFaces, parsed.modifier, "", selectedCharacter || undefined, persoId || undefined, true); // Toujours privé pour le MJ
          } else {
            console.error("Invalid roll command");
          }
        });
      } else {
        const parsed = parseRollCommand(rollCommand, characterModifiers);
        if (parsed) {
          rollDice(parsed.diceCount, parsed.diceFaces, parsed.modifier, "", undefined, undefined, true); // Toujours privé pour le MJ
        } else {
          console.error("Invalid roll command");
        }
      }
    } else {
      const parsed = parseRollCommand(rollCommand, characterModifiers);
      if (parsed) {
        rollDice(parsed.diceCount, parsed.diceFaces, parsed.modifier, "", undefined, undefined, parsed.isPrivate);
      } else {
        console.error("Invalid roll command");
      }
    }
  };

  const rollDice = async (diceCount: number, diceFaces: number, modifier: number, type: string, selectedCharacterId?: string, persoId?: string, isPrivate: boolean = false) => {
    const results = Array.from({ length: diceCount }, () => Math.floor(Math.random() * diceFaces) + 1);
    const total = results.reduce((sum, result) => sum + result, 0) + modifier;
    let userNameToUse = userName;
    let userAvatarToUse = userAvatar;
  
    if (isMJ && selectedCharacterId) {
      const charRef = doc(db, `cartes/${roomId}/characters/${selectedCharacterId}`);
      const charSnap = await getDoc(charRef);
      if (charSnap.exists()) {
        const charData = charSnap.data();
        userNameToUse = charData.Nomperso || "MJ";
        userAvatarToUse = charData.imageURL || userAvatar;
      }
    }
  
    const newRoll: Roll = {
      id: crypto.randomUUID(),
      isPrivate,
      diceCount,
      diceFaces,
      modifier,
      results,
      total,
      userName: userNameToUse,
      type,
      timestamp: Date.now(),
      ...(userAvatarToUse ? { userAvatar: userAvatarToUse } : {}),
      ...(persoId ? { persoId } : {})
    };
  
    try {
      if (roomId) {
        await addDoc(collection(db, `rolls/${roomId}/rolls`), newRoll);
        setRolls((prevRolls) => [newRoll, ...prevRolls]);
      }
    } catch (error) {
      console.error("Error saving roll:", error);
    }
  };

  const deleteAllRolls = async () => {
    if (roomId) {
      try {
        const rollsRef = collection(db, `rolls/${roomId}/rolls`);
        const snapshot = await getDocs(rollsRef);

        snapshot.forEach((doc) => {
          deleteDoc(doc.ref);
        });
        setRolls([]);
      } catch (error) {
        console.error("Error deleting rolls:", error);
      }
    }
  };

  const canDisplayRoll = (roll: Roll) => {
    if (!roll.isPrivate) return true;
    if (isMJ) return true;
    return roll.userName === characterName;
  };

  return (
    <div className="container mx-auto p-4 space-y-6 bg-parchment min-h-screen relative">
      <Card className="bg-leather border-2 border-brown-800">
        <CardContent className="bg-white space-y-4">
          {isMJ && (
            <Select value={selectedCharacter || "default"} onValueChange={setSelectedCharacter}>
              <SelectTrigger className="border-brown-600 text-black h-8 w-1/2">
                {selectedCharacter ? characters.find(char => char.id === selectedCharacter)?.name : "Sélectionner un personnage"}
              </SelectTrigger>
              <SelectContent>
  <SelectItem value="default" disabled className="text-black">
    Sélectionner un personnage
  </SelectItem>
  {characters.map(char => (
    <SelectItem key={char.id} value={char.id} className="text-black">
      {char.name}
    </SelectItem>
  ))}
</SelectContent>


            </Select>
          )}
      
        
          <div className="flex items-center space-x-2">
            <Input
              id="roll-command"
              type="text"
              value={rollCommand}
              onChange={(e) => setRollCommand(e.target.value)}
              className="bg-parchment border-brown-600 text-brown-900 h-8 w-1/2"
              placeholder="Ex: 1d20+3-p"
            />
            <Button
              onClick={handleRollCommand}
              className="bg-brown-700 hover:bg-brown-800 text-brown-100"
            >
              Lancer les dés
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              onClick={deleteAllRolls}
              className="bg-red-600 hover:bg-red-700 text-brown-100 flex items-center justify-center gap-2 w-1/2"
            >
              <Trash2 className="h-5 w-5" />
              Supprimer
            </Button>
            <Button
              onClick={() => setShowRollRequest((prev) => !prev)}
              className="bg-gray-800 hover:bg-gray-600 text-gray-800 flex items-center justify-center gap-2 w-1/2"
            >
              Demande de dé
            </Button>
          </div>
        </CardContent>
      </Card>

      {showRollRequest && <RollRequest />}

      <div className="space-y-3">
        {rolls.map(roll => (
          canDisplayRoll(roll) && (
            <Card key={roll.id} className="border border-brown-600">
              <CardContent className="p-3 flex items-center space-x-3">
                {roll.userAvatar && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={roll.userAvatar} alt="Avatar" />
                  </Avatar>
                )}
                <div className="flex-grow">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medieval text-white">{roll.userName}</span>
                    {roll.isPrivate && <Shield className="h-4 w-4 text-brown-600" />}
                  </div>
                  <span className="text-sm font-medium text-white">
                    {roll.type}: {roll.diceCount}d{roll.diceFaces}
                    {roll.modifier > 0 ? ` + ${roll.modifier}` : roll.modifier < 0 ? ` - ${Math.abs(roll.modifier)}` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-white">Total: {roll.total}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white">
                    <Dices className="h-4 w-4 text-brown-700" />
                    <span>{roll.results.join(', ')} {roll.modifier !== 0 ? `+ ${roll.modifier}` : ''}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        ))}
      </div>
    </div>
  );
}
