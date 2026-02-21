"use client";

import { ReactNode, useState, useEffect, useRef, useLayoutEffect } from "react";
import { useParams } from "next/navigation";
import { useGame } from "@/contexts/GameContext";
import Sidebar from "@/components/(overlays)/Sidebar";
import GMDashboard from "@/components/(combat)/MJcombat";
import Component from "@/components/(fiches)/fiche";
import MedievalNotes from "@/components/Notes";
import { DiceRoller } from "@/components/(dices)/dice-roller";
import Competences from "@/components/(competences)/competences";
import OverlayComponent from "@/components/(overlays)/overlay";
import { DiceThrower } from "@/components/(dices)/throw";
import { NPCManager } from '@/components/(personnages)/personnages'
import Chat from "@/components/(chat)/Chat";
import EncounterGenerator from "@/components/(encounter)/EncounterGenerator";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import { X } from "lucide-react";
import { FloatingAiAssistant } from "@/components/ui/glowing-ai-chat-assistant";



import MJMusicPlayer from "@/components/(music)/MJMusicPlayer";
import YouTubeSFXPlayer from "@/components/(music)/YouTubeSFXPlayer";
import PlayerMusicControl from "@/components/(music)/PlayerMusicControl";
import { useAudioMixer } from '@/components/(audio)/AudioMixerPanel';
import { MapControlProvider } from '@/contexts/MapControlContext';
import { DialogVisibilityProvider } from '@/contexts/DialogVisibilityContext';
import { ShortcutsProvider } from '@/contexts/ShortcutsContext';
import { startSidebarTour } from "@/lib/tours";
import { HelpCircle } from "lucide-react";

type LayoutProps = {
  children: ReactNode;
};



export default function Layout({ children }: LayoutProps) {
  const params = useParams();
  const roomId = params.roomid as string;
  const { isMJ } = useGame();
  const [activeTab, setActiveTab] = useState<string>("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Audio mixer volumes
  const { volumes: audioVolumes } = useAudioMixer();


  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async () => { });
    return () => unsubscribeAuth();
  }, []);



  const renderActiveTab = () => {
    switch (activeTab) {
      case "GMDashboard":
        return <GMDashboard />;
      case "NPCManager":
        return <NPCManager />;
      case "Component":
        return <Component />;
      case "NewComponent":
        return <MedievalNotes />;
      case "EncounterGenerator":
        return <EncounterGenerator />;
      case "Competences":
        return <Competences />;
      case "Chat":
        return <Chat />;
      // Case DiceRoller removed from here to separate persistent rendering
      default:
        return null;
    }
  };

  const handleIconClick = (tabName: string) => {
    setActiveTab(activeTab === tabName ? "" : tabName);
  };

  const getPanelWidth = () => {
    switch (activeTab) {
      case "Component":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1400px]";
      case "Competences":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[1200px]";
      case "GMDashboard":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] h-auto";
      case "NPCManager":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[1200px]";
      // Case DiceRoller handled separately
      case "NewComponent":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1400px]";
      case "Chat":
        return "w-full sm:w-[500px] md:w-[600px] lg:w-[400px]";
      case "EncounterGenerator":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[1200px]";
      default:
        return "w-full sm:w-[90vw] md:w-[80vw] lg:w-[700px]";
    }
  };



  return (
    <ShortcutsProvider>
      <DialogVisibilityProvider>
        <MapControlProvider>
          <div className="relative h-screen bg-[#1c1c1c] text-[#d4d4d4] flex z-30">
            <div className="z-10">
              {!isPanelOpen && (
                <Sidebar activeTab={activeTab} handleIconClick={handleIconClick} isMJ={isMJ} />
              )}
            </div>

            <div className="absolute left-0 z-0">
              <OverlayComponent onPanelToggle={setIsPanelOpen} />
            </div>

            {/* Persistent Music Player Container */}
            <aside
              className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#242424] h-auto max-h-[85vh] rounded-xl border border-[#333]
          w-full sm:w-[95vw] md:w-[90vw] lg:w-[900px] text-black shadow-lg z-20 overflow-y-auto
          ${activeTab === 'Music' ? 'block' : 'hidden'}`}
            >
              <button
                onClick={() => setActiveTab("")}
                className={`lg:hidden fixed top-3 right-3 z-10 rounded-full p-2 transition-colors shadow-lg bg-[#1c1c1c] text-white hover:bg-[#333]`}
                aria-label="Fermer le panneau"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="">
                {isMJ ? <MJMusicPlayer roomId={roomId} masterVolume={audioVolumes.backgroundMusic} /> : <PlayerMusicControl roomId={roomId} />}
                {/* Dedicated Player for Global YouTube SFX */}
                <YouTubeSFXPlayer roomId={roomId} volume={audioVolumes.globalSound} />
              </div>
            </aside>

            {activeTab && activeTab !== 'Music' && activeTab !== 'DiceRoller' && (
              <aside
                id="vtt-side-panel"
                className={`fixed left-0 sm:left-16 md:left-20 top-0 h-full ${getPanelWidth()} text-black shadow-lg z-20
            ${activeTab === 'Chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}
              >

                {/* Bouton de fermeture pour mobile/tablette */}
                <button
                  onClick={() => setActiveTab("")}
                  className={`lg:hidden fixed top-3 right-3 z-10 rounded-full p-2 transition-colors shadow-lg bg-[#1c1c1c] text-white hover:bg-[#333]`}
                  aria-label="Fermer le panneau"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className={activeTab === 'Chat' || activeTab === 'NPCManager' ? 'h-full' : ""}>
                  {renderActiveTab()}
                </div>
              </aside>
            )}

            {/* Persistent DiceRoller Container */}
            <FloatingAiAssistant
              isOpen={activeTab === 'DiceRoller'}
              onClose={() => setActiveTab("")}
            />

            <main className="flex-1 h-full flex justify-center items-center bg-[#1c1c1c] -z-10">
              <div className="w-full h-full">{children}</div>
            </main>
            {/* 3D Dice Overlay */}
            <DiceThrower />

            {/* Tour Trigger Button */}
            <button
              onClick={() => startSidebarTour(isMJ)}
              className="fixed bottom-4 right-4 z-40 p-3 bg-[#c0a080] text-black rounded-full shadow-lg hover:bg-[#d4b090] transition-colors"
              title="Commencer le tutoriel"
            >
              <HelpCircle className="h-6 w-6" />
            </button>
          </div>
        </MapControlProvider>
      </DialogVisibilityProvider>
    </ShortcutsProvider >
  );
}
