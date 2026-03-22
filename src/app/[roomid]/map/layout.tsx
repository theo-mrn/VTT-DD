"use client";

import { ReactNode, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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
import Historique from "@/components/(historique)/Historique";
import EncounterGenerator from "@/components/(encounter)/EncounterGenerator";
import { X } from "lucide-react";
import { FloatingAiAssistant } from "@/components/ui/glowing-ai-chat-assistant";
import { toast } from "sonner";

import MJMusicPlayer from "@/components/(music)/MJMusicPlayer";
import YouTubeSFXPlayer from "@/components/(music)/YouTubeSFXPlayer";
import PlayerMusicControl from "@/components/(music)/PlayerMusicControl";
import { useAudioMixer } from '@/components/(audio)/AudioMixerPanel';
import { MapControlProvider } from '@/contexts/MapControlContext';
import { DialogVisibilityProvider } from '@/contexts/DialogVisibilityContext';
import { ShortcutsProvider } from '@/contexts/ShortcutsContext';
import { ChatNotificationProvider } from '@/contexts/ChatNotificationContext';
import { startSidebarTour } from "@/lib/tours";
import { moduleRegistry } from '@/modules/registry';

type LayoutProps = {
  children: ReactNode;
};

// Widths for "fresh" panels only (persistent panels have fixed widths inline)
const PANEL_WIDTHS: Record<string, string> = {
  Component: "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1100px]",
  Competences: "w-full sm:w-[95vw] md:w-[90vw] lg:w-[1200px]",
  EncounterGenerator: "w-full sm:w-[95vw] md:w-[90vw] lg:w-[1200px]",
};

// Panels handled by their own persistent <aside> — excluded from the "fresh" aside
const PERSISTENT_PANELS = new Set(['Music', 'DiceRoller', 'NewComponent', 'Chat', 'GMDashboard', 'NPCManager', 'Historique']);

export default function Layout({ children }: LayoutProps) {
  const params = useParams();
  const roomId = params.roomid as string;
  const router = useRouter();
  const { isMJ, user: gameUser } = useGame();
  const [activeTab, setActiveTab] = useState<string>("");
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Audio mixer volumes
  const { volumes: audioVolumes } = useAudioMixer();

  // Lazy-mount flags: component is mounted on first open, then stays in DOM
  const [mounted, setMounted] = useState({
    notes: true,
    chat: false,
    gmDashboard: false,
    npcManager: false,
    historique: false,
  });

  // Lazy-mount flags for module panels
  const [mountedModules, setMountedModules] = useState<Set<string>>(new Set());

  const handleIconClick = (tabName: string) => {
    const next = activeTab === tabName ? "" : tabName;
    // Trigger lazy-mount on first open
    if (next) {
      if (tabName.startsWith('module:')) {
        const moduleId = tabName.slice('module:'.length);
        setMountedModules(prev => {
          if (prev.has(moduleId)) return prev;
          const copy = new Set(prev);
          copy.add(moduleId);
          return copy;
        });
      } else {
        setMounted(prev => ({
          ...prev,
          ...(tabName === 'NewComponent' && { notes: true }),
          ...(tabName === 'Chat' && { chat: true }),
          ...(tabName === 'GMDashboard' && { gmDashboard: true }),
          ...(tabName === 'NPCManager' && { npcManager: true }),
          ...(tabName === 'Historique' && { historique: true }),
        }));
      }
    }
    setActiveTab(next);
  };

  // Detect kick/left room
  useEffect(() => {
    const userRoomId = gameUser?.roomId;
    if (!userRoomId) return;
    if (userRoomId !== roomId) {
      toast.error("Vous avez été expulsé de la salle.");
      router.push("/home");
    }
  }, [gameUser?.roomId, roomId, router]);

  // Auto-start tour
  useEffect(() => {
    const tourStatus = localStorage.getItem('vtt-tour-completed');
    if (tourStatus !== 'true') {
      const timer = setTimeout(() => {
        startSidebarTour(isMJ);
        localStorage.setItem('vtt-tour-completed', 'true');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isMJ]);

  // "Fresh" panels: remounted each time (data from context, no heavy fetch)
  const renderFreshPanel = () => {
    switch (activeTab) {
      case "Component": return <Component />;
      case "EncounterGenerator": return <EncounterGenerator />;
      case "Competences": return <Competences />;
      default: return null;
    }
  };

  const freshPanelWidth = PANEL_WIDTHS[activeTab] ?? "w-full sm:w-[90vw] md:w-[80vw] lg:w-[700px]";
  const showFreshPanel = activeTab && !PERSISTENT_PANELS.has(activeTab);

  // Shared close button (mobile)
  const CloseBtn = () => (
    <button
      onClick={() => setActiveTab("")}
      className="lg:hidden fixed top-3 right-3 z-10 rounded-full p-2 transition-colors shadow-lg bg-[#1c1c1c] text-white hover:bg-[#333]"
      aria-label="Fermer le panneau"
    >
      <X className="h-5 w-5" />
    </button>
  );

  // Shared aside class builder
  const asideClass = (width: string, isVisible: boolean, extra = "") =>
    `fixed left-0 sm:left-16 md:left-20 top-0 h-full ${width} text-black shadow-lg z-20 ${isVisible ? "" : "hidden"} ${extra}`.trim();

  return (
    <ShortcutsProvider>
      <DialogVisibilityProvider>
        <MapControlProvider>
          <ChatNotificationProvider>
            <div className="relative h-screen bg-[#1c1c1c] text-[#d4d4d4] flex z-30">
              <div className="z-10">
                {!isPanelOpen && (
                  <Sidebar activeTab={activeTab} handleIconClick={handleIconClick} isMJ={isMJ} />
                )}
              </div>

              <div className="absolute left-5 z-0">
                <OverlayComponent onPanelToggle={setIsPanelOpen} />
              </div>

              {/* ── MUSIC (persistent, always in DOM) ── */}
              <aside className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#242424] h-auto max-h-[85vh] rounded-xl border border-[#333] w-full sm:w-[95vw] md:w-[90vw] lg:w-[900px] text-black shadow-lg z-20 overflow-y-auto ${activeTab === 'Music' ? 'block' : 'hidden'}`}>
                <CloseBtn />
                <div>
                  {isMJ
                    ? <MJMusicPlayer roomId={roomId} masterVolume={audioVolumes.backgroundMusic} />
                    : <PlayerMusicControl roomId={roomId} />}
                  <YouTubeSFXPlayer roomId={roomId} volume={audioVolumes.globalSound} />
                </div>
              </aside>

              {/* ── FRESH panels (Fiche, EncounterGenerator, Compétences) ── */}
              {showFreshPanel && (
                <aside id="vtt-side-panel" className={`fixed left-0 sm:left-16 md:left-20 top-0 h-full ${freshPanelWidth} text-black shadow-lg z-20 overflow-y-auto`}>
                  <CloseBtn />
                  {renderFreshPanel()}
                </aside>
              )}

              {/* ── NOTES (lazy-persistent, all users) ── */}
              {mounted.notes && (
                <aside className={asideClass("w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1100px]", activeTab === 'NewComponent', "overflow-y-auto")}>
                  <CloseBtn />
                  <div className="h-full"><MedievalNotes /></div>
                </aside>
              )}

              {/* ── CHAT (lazy-persistent, all users) ── */}
              {mounted.chat && (
                <aside className={asideClass("w-full sm:w-[500px] md:w-[600px] lg:w-[400px]", activeTab === 'Chat', "overflow-hidden")}>
                  <CloseBtn />
                  <div className="h-full"><Chat /></div>
                </aside>
              )}

              {/* ── MJ-ONLY persistent panels ── */}
              {isMJ && (
                <>
                  {/* GMDashboard */}
                  {mounted.gmDashboard && (
                    <aside className={asideClass("w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw]", activeTab === 'GMDashboard', "overflow-y-auto")}>
                      <CloseBtn />
                      <GMDashboard />
                    </aside>
                  )}

                  {/* NPCManager */}
                  {mounted.npcManager && (
                    <aside className={asideClass("w-full sm:w-[95vw] md:w-[90vw] lg:w-[1200px]", activeTab === 'NPCManager', "overflow-y-auto h-full")}>
                      <CloseBtn />
                      <div className="h-full"><NPCManager /></div>
                    </aside>
                  )}

                  {/* Historique */}
                  {mounted.historique && (
                    <aside className={asideClass("w-full sm:w-[500px] md:w-[600px] lg:w-[400px]", activeTab === 'Historique', "overflow-hidden")}>
                      <CloseBtn />
                      <div className="h-full"><Historique roomId={roomId} /></div>
                    </aside>
                  )}
                </>
              )}

              {/* ── MODULE panels (dynamic) ── */}
              {moduleRegistry.getSidebarTabs().map(tab => {
                const tabKey = `module:${tab.id}`;
                if (tab.persistent) {
                  if (!mountedModules.has(tab.id)) return null;
                  return (
                    <aside key={tabKey} className={asideClass(tab.width || "w-full sm:w-[700px]", activeTab === tabKey, "overflow-y-auto")}>
                      <CloseBtn />
                      <tab.component />
                    </aside>
                  );
                } else {
                  if (activeTab !== tabKey) return null;
                  return (
                    <aside key={tabKey} className={`fixed left-0 sm:left-16 md:left-20 top-0 h-full ${tab.width || freshPanelWidth} text-black shadow-lg z-20 overflow-y-auto`}>
                      <CloseBtn />
                      <tab.component />
                    </aside>
                  );
                }
              })}

              {/* ── DICE ROLLER (persistent, all users) ── */}
              <FloatingAiAssistant
                isOpen={activeTab === 'DiceRoller'}
                onClose={() => setActiveTab("")}
              />

              <main className="flex-1 h-full flex justify-center items-center bg-[#1c1c1c] -z-10">
                <div className="w-full h-full">{children}</div>
              </main>

              {/* 3D Dice Overlay */}
              <DiceThrower />

            </div>
          </ChatNotificationProvider>
        </MapControlProvider>
      </DialogVisibilityProvider>
    </ShortcutsProvider>
  );
}

