'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Shield, Dices, Swords, Trash2 } from 'lucide-react';
import { auth, db, addDoc, collection, getDocs, getDoc, doc, deleteDoc, query, orderBy } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import RollRequest from './Rollrequest'; // Importation du composant RollRequest

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
  const [diceCount, setDiceCount] = useState(1);
  const [diceFaces, setDiceFaces] = useState(20);
  const [modifier, setModifier] = useState(0);
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
  const [showRollRequest, setShowRollRequest] = useState(false); // État pour afficher ou masquer RollRequest

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
    rollDice(modifier, char);
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
        });
      } else {
        console.log("No character document found!");
      }
    } catch (error) {
      console.error("Error fetching character info:", error);
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

  const rollDice = async (modifier: number, type: string) => {
    const result = Math.floor(Math.random() * 20) + 1;
    const total = result + modifier;
    const newRoll: Roll = {
      id: crypto.randomUUID(),
      isPrivate,
      diceCount: 1,
      diceFaces: 20,
      modifier,
      results: [result],
      total,
      userName: isMJ ? "MJ" : userName,
      type,
      timestamp: Date.now(),
      ...(userAvatar ? { userAvatar } : {})
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
    <div className="container mx-auto p-4 space-y-6 bg-parchment min-h-screen">
      <Card className="bg-leather border-2 border-brown-800">
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="private-mode"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
            />
            <Label htmlFor="private-mode" className="text-sm text-brown-100">
              Privé
            </Label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label htmlFor="dice-count" className="text-sm text-brown-100">Nombre de dés</Label>
              <Input
                id="dice-count"
                type="number"
                min="1"
                value={diceCount}
                onChange={(e) => setDiceCount(parseInt(e.target.value))}
                className="bg-parchment border-brown-600 text-brown-900 h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dice-faces" className="text-sm text-brown-100">Nombre de faces</Label>
              <Input
                id="dice-faces"
                type="number"
                min="2"
                value={diceFaces}
                onChange={(e) => setDiceFaces(parseInt(e.target.value))}
                className="bg-parchment border-brown-600 text-brown-900 h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="modifier" className="text-sm text-brown-100">Modificateur</Label>
              <Input
                id="modifier"
                type="number"
                value={modifier}
                onChange={(e) => setModifier(parseInt(e.target.value))}
                className="bg-parchment border-brown-600 text-brown-900 h-8"
              />
            </div>
          </div>
          <Button
            onClick={() => rollDice(modifier, "Normal")}
            className="w-full bg-brown-700 hover:bg-brown-800 text-brown-100"
          >
            Lancer les dés
          </Button>
          <Button
            onClick={deleteAllRolls}
            className="w-full bg-red-600 hover:bg-red-700 text-brown-100 flex items-center justify-center gap-2"
          >
            <Trash2 className="h-5 w-5" />
            Supprimer tous les lancers
          </Button>

          <Button
            onClick={() => setShowRollRequest((prev) => !prev)}
            className="w-full bg-white hover:bg-white text-gray-900 flex items-center justify-center gap-2 mt-4"
          >
            Demande de dé
          </Button>

          {!isMJ && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {["CON", "DEX", "FOR", "SAG", "INT", "CHA"].map((char) => (
                <Button
                  key={char}
                  onClick={() => handleCharacteristicRoll(char)}
                  className="bg-brown-700 hover:bg-brown-800 text-brown-100 w-full"
                  title={`1d20+${characterModifiers[char] || 0}`}
                >
                  {char}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showRollRequest && <RollRequest />} {/* Afficher RollRequest si showRollRequest est vrai */}

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
                    <span className="text-sm font-medieval text-brown-900">{roll.userName}</span>
                    {roll.isPrivate && <Shield className="h-4 w-4 text-brown-600" />}
                  </div>
                  <span className="text-sm font-medium text-brown-700">
                    {roll.type}: {roll.diceCount}d{roll.diceFaces}
                    {roll.modifier > 0 ? ` + ${roll.modifier}` : roll.modifier < 0 ? ` - ${Math.abs(roll.modifier)}` : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-brown-900">Total: {roll.total}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-brown-700">
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
