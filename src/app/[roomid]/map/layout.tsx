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
import QuestOverlay from "@/components/(overlays)/questOverlay";
import InfoComponent, { type InfoSection } from "@/components/(infos)/info";
import { DiceThrower } from "@/components/(dices)/throw";
import RollRequest from '@/components/(dices)/Rollrequest';

import { Button } from "@/components/ui/button";
import { Statistiques } from "@/components/Statistiques";
import CitiesManager from "@/components/(worldmap)/CitiesManager";
import Chat from "@/components/(chat)/Chat";
import { auth, db, onAuthStateChanged, collection, onSnapshot } from "@/lib/firebase";
import { X, Map, BookOpen, Scroll } from "lucide-react";
import FloatingMusic from "@/components/(music)/FloatingMusic";

type LayoutProps = {
  children: ReactNode;
};

function InfoComponentWrapper({ onClose }: { onClose: () => void }) {
  const [activeSection, setActiveSection] = useState<InfoSection>(null);

  return (
    <>
      {!activeSection && (
        <div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-40 bg-[#242424] rounded-lg shadow-lg border border-[#3a3a3a] p-2 pointer-events-auto">
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 rounded-full p-1 bg-[#1c1c1c] text-[#d4d4d4] hover:bg-[#333] transition-colors shadow-lg border border-[#3a3a3a] z-10"
            aria-label="Fermer"
          >
            <X className="h-3 w-3" />
          </button>
          <InfoComponent activeSection={activeSection} setActiveSection={setActiveSection} renderButtons={true} />
        </div>
      )}
      <InfoComponent activeSection={activeSection} setActiveSection={setActiveSection} renderButtons={false} />
    </>
  );
}

export default function Layout({ children }: LayoutProps) {
  const params = useParams();
  const roomId = params.roomid as string;
  const { isMJ } = useGame();

  const [activeTab, setActiveTab] = useState<string>("");
  const [showRollRequest, setShowRollRequest] = useState(false);
  const [showQuestOverlay, setShowQuestOverlay] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async () => {
      // Juste vérifier que l'utilisateur est connecté
      // Le statut MJ et roomId viennent du contexte et des paramètres
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!roomId) return;

    const requestsRef = collection(db, `Rollsrequests/${roomId}/requete`);

    const unsubscribe = onSnapshot(requestsRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added" || change.type === "modified") {
          const data = change.doc.data();
          if (data.isRequesting && !data.isCompleted) {
            setShowRollRequest(true);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [roomId]);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "GMDashboard":
        return <GMDashboard />;
      case "Component":
        return <Component />;
      case "NewComponent":
        return <MedievalNotes />;
      case "DiceRoller":
        return <DiceRoller />;
      case "Competences":
        return <Competences />;
      case "infoComponent":
        return <InfoComponent />;
      case "Statistiques":
        return <Statistiques />;
      case "Cities":
        return <CitiesManager />;
      case "Chat":
        return <Chat />;
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
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1400px]"; // Fiche de personnage responsive
      case "Competences":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[1200px]";
      case "GMDashboard":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] bg-white";
      case "DiceRoller":
        return "w-full sm:w-[90vw] md:w-[600px] lg:w-[500px]";
      case "NewComponent": // Style livre pour les notes
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1200px]";
      case "Cities":
        return "w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1400px]";
      case "Chat":
        return "w-full sm:w-[90vw] md:w-[500px] lg:w-[600px]";
      default:
        return "w-full sm:w-[90vw] md:w-[80vw] lg:w-[700px]";
    }
  };

  const isBookStyle = activeTab === "NewComponent";

  return (
    <div className="relative h-screen bg-[#1c1c1c] text-[#d4d4d4] flex">
      <div className="z-10">
        <Sidebar activeTab={activeTab} handleIconClick={handleIconClick} isMJ={isMJ} />
      </div>

      <div className="absolute left-0 z-10">
        <OverlayComponent />
      </div>

      {showQuestOverlay && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[100]" onClick={() => setShowQuestOverlay(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none">
            <div className="pointer-events-auto">
              <QuestOverlay isVisible={showQuestOverlay} />
            </div>
          </div>
        </>
      )}



      {activeTab && activeTab !== "Cities" && activeTab !== "infoComponent" && (
        <aside
          className={`fixed left-0 sm:left-16 md:left-20 top-0 h-full ${getPanelWidth()} text-black shadow-lg z-20
            ${activeTab === 'Chat' ? 'overflow-hidden' : 'overflow-y-auto'}
            ${isBookStyle
              ? 'bg-transparent animate-[bookOpen_0.6s_ease-out] [perspective:2000px]'
              : 'bg-[#242424] transition-transform duration-300 ease-in-out'
            }`}
          style={isBookStyle ? {
            transformStyle: 'preserve-3d',
            animation: 'bookOpen 0.6s ease-out forwards'
          } : undefined}
        >

          {/* Bouton de fermeture pour mobile/tablette */}
          <button
            onClick={() => setActiveTab("")}
            className={`lg:hidden fixed top-3 right-3 z-10 rounded-full p-2 transition-colors shadow-lg
              ${isBookStyle
                ? 'bg-amber-800 text-amber-50 hover:bg-amber-700'
                : 'bg-[#1c1c1c] text-white hover:bg-[#333]'
              }`}
            aria-label="Fermer le panneau"
          >
            <X className="h-5 w-5" />
          </button>

          <div className={activeTab === 'Chat' ? 'h-full' : (isBookStyle ? 'animate-[fadeIn_0.8s_ease-out_0.3s_both]' : '')}>
            {renderActiveTab()}
          </div>
        </aside>
      )}

      {/* InfoComponent en petit panneau flottant compact */}
      {activeTab === "infoComponent" && (
        <InfoComponentWrapper onClose={() => setActiveTab("")} />
      )}

      {/* CitiesManager en haut au centre */}
      {activeTab === "Cities" && (
        <div className="fixed inset-0 flex items-start justify-center bg-black bg-opacity-75 z-50 p-4 pt-8 sm:pt-12 md:pt-16">
          <div className="relative rounded-lg bg-[#242424] text-[#d4d4d4] w-full max-w-[95vw] sm:max-w-[90vw] md:max-w-[85vw] lg:max-w-[1400px] h-[90vh] max-h-[90vh] overflow-hidden shadow-2xl">
            <button
              onClick={() => setActiveTab("")}
              className="absolute top-2 right-2 z-[60] rounded-full p-2 bg-[#1c1c1c] text-white hover:bg-[#333] transition-colors shadow-lg"
              aria-label="Fermer"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="h-full overflow-y-auto pt-12">
              <CitiesManager />
            </div>
          </div>
        </div>
      )}

      {/* Styles pour l'animation de livre */}
      <style jsx global>{`
        @keyframes bookOpen {
          0% {
            opacity: 0;
            transform: perspective(2000px) rotateY(-90deg);
            transform-origin: left center;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
            transform: perspective(2000px) rotateY(0deg);
            transform-origin: left center;
          }
        }

        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pageTurnOut {
          0% {
            opacity: 1;
            transform: perspective(1200px) rotateY(0deg) translateX(0);
          }
          100% {
            opacity: 0;
            transform: perspective(1200px) rotateY(-30deg) translateX(-50px);
          }
        }

        @keyframes pageTurnIn {
          0% {
            opacity: 0;
            transform: perspective(1200px) rotateY(30deg) translateX(50px);
          }
          100% {
            opacity: 1;
            transform: perspective(1200px) rotateY(0deg) translateX(0);
          }
        }
      `}</style>

      <main className="flex-1 h-full flex justify-center items-center bg-[#1c1c1c]">
        <div className="w-full h-full">{children}</div>
      </main>

      {showRollRequest && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50 p-4">
          <div className="rounded text-black w-full xs:w-[95%] sm:w-[80%] md:w-[60%] lg:w-[50%] xl:w-[40%] 2xl:w-1/3 text-center max-h-[90vh] overflow-y-auto">
            <RollRequest />
            <Button
              onClick={() => setShowRollRequest(false)}
              className="mt-4 items-center justify-center text-xs sm:text-sm"
              variant="default"
            >
              Close
            </Button>
          </div>
        </div>
      )}
      <div className="z-50 music">
        {/* Lecteur Musical Flottant */}
        <FloatingMusic roomId={roomId} />
      </div>
      {/* Boutons Map, Info et Quêtes en haut au centre */}
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 z-10">
        <button
          onClick={() => handleIconClick("Cities")}
          className={`rounded-lg px-4 py-2 flex items-center gap-2 ${activeTab === "Cities"
            ? "bg-[#c0a080] text-black"
            : "bg-[#242424] text-[#d4d4d4] hover:bg-[#333]"
            }`}
          aria-label="Ouvrir le gestionnaire de villes"
        >
          <Map className="h-5 w-5" />
        </button>
        <button
          onClick={() => handleIconClick("infoComponent")}
          className={`rounded-lg px-4 py-2 flex items-center gap-2 ${activeTab === "infoComponent"
            ? "bg-[#c0a080] text-black"
            : "bg-[#242424] text-[#d4d4d4] hover:bg-[#333]"
            }`}
          aria-label="Ouvrir les informations"
        >
          <BookOpen className="h-5 w-5" />
        </button>
        {/* <button
          onClick={() => setShowQuestOverlay(!showQuestOverlay)}
          className="rounded-lg px-4 py-2 flex items-center gap-2 bg-[#242424] text-[#d4d4d4] hover:bg-[#333]"
          aria-label={showQuestOverlay ? "Masquer les quêtes" : "Afficher les quêtes"}
        >
          <Scroll className="h-5 w-5" />
        </button> */}
      </div>

      {/* 3D Dice Overlay */}
      <DiceThrower />
    </div>
  );
}
