"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Sidebar from "@/components/(overlays)/panel";
import CharacterSheet from "@/components/(fiches)/CharacterSheet";
import { db, collection, query, where, onSnapshot, doc } from "@/lib/firebase";
import { useMapControl } from "@/contexts/MapControlContext";
import { useGame } from "@/contexts/GameContext";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { User, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Player = {
  id: string;
  name: string;
  image: string;
  health: number;
  maxHealth: number;
  type?: string;
  currentSceneId?: string;
};

type OverlayProps = {
  onPanelToggle?: (isOpen: boolean) => void;
};

export default function Component({ onPanelToggle }: OverlayProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [npcs, setNpcs] = useState<Player[]>([]);
  const params = useParams();
  const roomId = params.roomid as string;
  const [isSidebarOpen, _setIsSidebarOpen] = useState(false);
  const setIsSidebarOpen = (open: boolean) => {
    _setIsSidebarOpen(open);
    onPanelToggle?.(open);
  };
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [showCharacterSheet, setShowCharacterSheet] = useState(false);
  const { centerOnCharacter, selectedCityId } = useMapControl();
  const { isMJ } = useGame();
  const { isDialogOpen } = useDialogVisibility();
  const [mode, setMode] = useState<'joueurs' | 'pnj'>('joueurs');
  const [globalCityId, setGlobalCityId] = useState<string | null>(null);

  // 🆕 Listen to Global Settings (Group Location)
  useEffect(() => {
    if (!roomId) return;
    const settingsRef = doc(db, 'cartes', roomId, 'settings', 'general');
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setGlobalCityId(docSnap.data().currentCityId || null);
      }
    });
    return () => unsubscribe();
  }, [roomId]);

  // Étape 2 : Récupérer les joueurs
  useEffect(() => {
    if (!roomId) return;

    const charactersRef = collection(db, `cartes/${roomId}/characters`);
    const q = query(charactersRef, where("type", "==", "joueurs"));

    const unsubscribeSnapshot = onSnapshot(q, (querySnapshot) => {
      const fetchedPlayers: Player[] = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.Nomperso || "Joueur",
          image: data.imageURLFinal || data.imageURL || "/placeholder.svg",
          health: data.PV || 0,
          maxHealth: data.PV_Max || 100,
          type: data.type,
          currentSceneId: data.currentSceneId
        };
      });

      setPlayers(fetchedPlayers);
    });

    return () => unsubscribeSnapshot();
  }, [roomId]);

  // Étape 3 : Récupérer les NPCs (uniquement de la carte active)
  useEffect(() => {
    if (!roomId) return;

    const charactersRef = collection(db, `cartes/${roomId}/characters`);
    // Filter by cityId to get NPCs on the current map
    // Note: If selectedCityId is null (world map), we might need to handle that. 
    // page.tsx seems to treat null as 'world' but let's check what data holds.
    // If filtering by cityId where cityId is null, firebase might need standard equality.

    // Assuming 'type' != 'joueurs' means NPC.
    const q = query(
      charactersRef,
      where("cityId", "==", selectedCityId),
      // where("type", "!=", "joueurs") // Compound queries need index. simpler to filter client side if needed or just trust cityId logic (players usually have cityId too?)
      // In page.tsx, NPCs are queried by cityId. Players are queried globally.
      // So if we query by cityId, we might get players too if they are assigned to that city.
      // We should filter them out in memory to be safe/consistent with "NPC Mode".
    );

    const unsubscribeSnapshot = onSnapshot(q, (querySnapshot) => {
      const fetchedNpcs: Player[] = querySnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.Nomperso || "NPC",
            image: data.imageURLFinal || data.imageURL2 || data.imageURL || "/placeholder.svg",
            health: data.PV || 0,
            maxHealth: data.PV_Max || 10,
            type: data.type
          };
        })
        .filter(p => p.type !== 'joueurs'); // Ensure only NPCs

      setNpcs(fetchedNpcs);
    });

    return () => unsubscribeSnapshot();
  }, [roomId, selectedCityId]);

  const handleDoubleClick = (playerId: string) => {
    setSelectedCharacterId(playerId);
    setShowCharacterSheet(true);
  };

  const visibleList = mode === 'joueurs'
    ? players.filter(player => {
      // 1. Explicitly assigned to this scene
      if (player.currentSceneId === selectedCityId) return true;
      // 2. Implicitly following the group (no assignment) AND this is the group scene
      if (!player.currentSceneId && globalCityId === selectedCityId) return true;

      return false;
    })
    : npcs;

  // Hide overlay when dialog is open
  if (isDialogOpen) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={0}>
      {isSidebarOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[100]" onClick={() => setIsSidebarOpen(false)} />
          <div className="sidebar z-[101]">
            <Sidebar onClose={() => setIsSidebarOpen(false)} />
          </div>
        </>
      )}

      {showCharacterSheet && selectedCharacterId && roomId && (
        <CharacterSheet
          characterId={selectedCharacterId}
          roomId={roomId}
          onClose={() => {
            setShowCharacterSheet(false);
            setSelectedCharacterId(null);
          }}
        />
      )}

      <div className="fixed top-4 flex gap-2 p-2 bg-black/70 backdrop-blur-sm rounded-lg border border-white/10 items-center max-w-[90vw] overflow-x-auto z-[90]">
        {/* Bouton pour ouvrir la sidebar */}
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="flex items-center justify-center h-8 w-8 flex-shrink-0 bg-gray-900 text-white rounded-full hover:bg-gray-700 transition-transform transform hover:scale-105 shadow-lg focus:outline-none"
        >
          <span className="text-lg">☰</span>
        </button>

        {/* Toggle Mode Button (Only for MJ) */}
        {isMJ && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setMode(prev => prev === 'joueurs' ? 'pnj' : 'joueurs')}
                className={`flex items-center justify-center h-8 w-8 flex-shrink-0 rounded-full transition-colors shadow-lg focus:outline-none ${mode === 'joueurs' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-600 hover:bg-red-500'
                  }`}
              >
                {mode === 'joueurs' ? <User className="h-4 w-4 text-white" /> : <Users className="h-4 w-4 text-white" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{mode === 'joueurs' ? 'Afficher les PNJ' : 'Afficher les Joueurs'}</p>
            </TooltipContent>
          </Tooltip>
        )}

        <div className="h-8 w-[1px] bg-white/20 mx-1 flex-shrink-0" />

        {visibleList.map((char) => (
          <Tooltip key={char.id}>
            <TooltipTrigger asChild>
              <div
                className="flex flex-col items-center gap-1 group relative flex-shrink-0 cursor-pointer"
                onClick={() => {
                  setSelectedCharacterId(char.id);
                  centerOnCharacter(char.id);
                }}
                onDoubleClick={() => handleDoubleClick(char.id)}
              >
                <div className="relative">
                  <Avatar className={`h-10 w-10 border-2 transition-colors ${mode === 'pnj' ? 'border-red-500/50 group-hover:border-red-500' : 'border-blue-500/50 group-hover:border-blue-500'}`}>
                    <AvatarImage src={char.image} alt={char.name} className="object-cover" />
                    <AvatarFallback className="bg-primary-foreground text-xs">
                      {char.name[0]}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Barre de santé */}
                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 ease-in-out rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, (char.health / char.maxHealth) * 100))}%`,
                      backgroundColor: `hsl(${Math.min(120, Math.max(0, (char.health / char.maxHealth) * 120))}, 100%, 50%)`,
                    }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-center z-[110] bg-zinc-950 border-zinc-800 text-white">
              <p className="font-bold text-white">{char.name}</p>
              <p className="text-xs text-zinc-300">{char.health}/{char.maxHealth} PV</p>
            </TooltipContent>
          </Tooltip>
        ))}

        {visibleList.length === 0 && (
          <div className="text-white text-sm italic px-2">
            Aucun {mode === 'joueurs' ? 'joueur' : 'PNJ'}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
