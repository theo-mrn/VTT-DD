"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Sidebar from "@/components/(overlays)/panel";
import { db } from "@/lib/firebase";
import { useMapControl } from "@/contexts/MapControlContext";
import { useGame } from "@/contexts/GameContext";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useMapData } from "@/hooks/map/useMapData";
import { useGameSystem } from "@/modules/game-system/useGameSystem";
import { getFormulaDependencies } from "@/lib/rules-engine";
import { User, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Player = {
  id: string;
  name: string;
  image: string;
  health: number;
  maxHealth: number;
  // Sens du "bon état" pour cette jauge (cf StatDefinition.recoversToZero) : vrai si 0 = meilleur état
  // (ex Blessures EotE), faux si le MAX = meilleur état (ex PV D&D, comportement historique).
  recoversToZero: boolean;
  type?: string;
  currentSceneId?: string;
};

type OverlayProps = {
  onPanelToggle?: (isOpen: boolean) => void;
};

export default function Component({ onPanelToggle }: OverlayProps) {
  // Documents BRUTS conservés tels quels (pas encore convertis en Player) : la conversion dépend de
  // primaryVitalStat (dérivé de gameSystem, chargé en async). Si on convertit dans le callback
  // useMapData (rappelé seulement sur un nouveau snapshot Firestore), un gameSystem qui finit de
  // charger APRÈS le premier snapshot des personnages ne redéclenche jamais la conversion — la barre de
  // vie restait figée à 0/1 (donc invisible/grise) pour tout le monde sauf le personnage dont un second
  // snapshot Firestore arrivait par hasard après coup. En dérivant Player[] à chaque render à partir des
  // docs bruts, la conversion suit systématiquement gameSystem dès qu'il devient disponible.
  const [rawPlayerDocs, setRawPlayerDocs] = useState<Record<string, unknown>[]>([]);
  const [rawNpcDocs, setRawNpcDocs] = useState<Record<string, unknown>[]>([]);
  const params = useParams();
  const roomId = params.roomid as string;
  const [isSidebarOpen, _setIsSidebarOpen] = useState(false);
  const setIsSidebarOpen = (open: boolean) => {
    _setIsSidebarOpen(open);
    onPanelToggle?.(open);
  };
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const { centerOnCharacter, selectedCityId } = useMapControl();
  const { isMJ } = useGame();
  const { isDialogOpen } = useDialogVisibility();
  const [mode, setMode] = useState<'joueurs' | 'pnj'>('joueurs');
  const [globalCityId, setGlobalCityId] = useState<string | null>(null);
  const { gameSystem } = useGameSystem(roomId);

  // Stat vitale "principale" du système actif (ex PV pour D&D, Blessures pour EotE) : la première
  // stat 'vital' dont la borne max référence une autre stat — même mécanisme générique que WidgetVitals
  // (FicheWidgets.tsx) — jamais "PV"/"PV_Max" en dur, sans quoi la barre de vie resterait invisible ou
  // trompeuse pour tout système custom qui nomme ses stats différemment.
  const primaryVitalStat = (() => {
    for (const stat of gameSystem.stats) {
      if (stat.category !== 'vital' || !stat.maxFormula) continue;
      const [maxKey] = getFormulaDependencies(stat.maxFormula);
      if (maxKey) return { key: stat.key, maxKey, recoversToZero: !!stat.recoversToZero };
    }
    return null;
  })();

  // 🔄 Use centralized Map Data Hook — ne fait plus que stocker les docs bruts, la conversion en
  // Player[] (dépendante de primaryVitalStat) se fait ci-dessous à chaque render.
  useMapData(roomId, selectedCityId, {
    setGlobalCityId,
    setRawPlayers: (docs: any[]) => {
      setRawPlayerDocs(docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    },
    setRawNPCs: (parsedChars: any[]) => {
      setRawNpcDocs(parsedChars);
    },
    parseCharacterDocRef: {
      current: (doc: any) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          Nomperso: data.Nomperso || "NPC",
        } as any;
      }
    }
  });

  const toPlayer = (data: Record<string, any>, fallbackName: string): Player => ({
    id: data.id,
    name: data.Nomperso || fallbackName,
    image: data.imageURLFinal || data.imageURL2 || data.imageURL || "/placeholder.svg",
    health: primaryVitalStat ? (data[primaryVitalStat.key] || 0) : 0,
    maxHealth: primaryVitalStat ? (data[primaryVitalStat.maxKey] || 1) : 1,
    recoversToZero: !!primaryVitalStat?.recoversToZero,
    type: data.type,
    currentSceneId: data.currentSceneId,
  });

  const players = rawPlayerDocs.map((data) => toPlayer(data, "Joueur"));
  const npcs = rawNpcDocs.map((data) => toPlayer(data as Record<string, any>, "NPC"));

  // Allow opening the panel from elsewhere (e.g. the mobile dock) via a window event,
  // since the top bar that hosts the ☰ button is hidden on mobile.
  useEffect(() => {
    const open = () => setIsSidebarOpen(true);
    window.addEventListener('vtt-open-map-panel', open);
    return () => window.removeEventListener('vtt-open-map-panel', open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {/* Top bar — hidden on mobile (use the dock to open the panel instead) */}
      <div className="hidden lg:flex fixed top-4 gap-2 p-2 bg-black/70 backdrop-blur-sm rounded-lg border border-white/10 items-center max-w-[90vw] overflow-x-auto z-[90]">
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
              >
                <div className="relative">
                  <Avatar className={`h-10 w-10 border-2 transition-colors ${mode === 'pnj' ? 'border-red-500/50 group-hover:border-red-500' : 'border-blue-500/50 group-hover:border-blue-500'}`}>
                    <AvatarImage src={char.image} alt={char.name} className="object-cover" />
                    <AvatarFallback className="bg-primary-foreground text-xs">
                      {char.name[0]}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Barre de vie — sens inversé (jauge remplie = mauvais état) pour une stat où
                    recoversToZero est vrai (ex Blessures EotE : 0 = indemne, max = très blessé), sinon
                    comportement historique (PV D&D : plein = bonne santé). */}
                <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full transition-all duration-300 ease-in-out rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, ((char.recoversToZero ? char.maxHealth - char.health : char.health) / char.maxHealth) * 100))}%`,
                      backgroundColor: `hsl(${Math.min(120, Math.max(0, ((char.recoversToZero ? char.maxHealth - char.health : char.health) / char.maxHealth) * 120))}, 100%, 50%)`,
                    }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-center z-[110] bg-zinc-950 border-zinc-800 text-white">
              <p className="font-bold text-white">{char.name}</p>
              <p className="text-xs text-zinc-300">{char.health}/{char.maxHealth} {primaryVitalStat ? (gameSystem.stats.find((s) => s.key === primaryVitalStat.key)?.shortLabel ?? gameSystem.stats.find((s) => s.key === primaryVitalStat.key)?.label ?? '') : 'PV'}</p>
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
