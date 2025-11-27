"use client";

import { ReactNode, useState, useEffect } from "react";
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
import InfoComponent from "@/components/(infos)/info";
import RollRequest from '@/components/(dices)/Rollrequest';
import { Button } from "@/components/ui/button";
import { Statistiques } from "@/components/Statistiques";
import CitiesManager from "@/components/(worldmap)/CitiesManager";
import { auth, db, onAuthStateChanged, collection, onSnapshot } from "@/lib/firebase";
import { X } from "lucide-react";
import FloatingMusic from "@/components/(music)/FloatingMusic";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const params = useParams();
  const roomId = params.roomid as string;
  const { isMJ } = useGame();

  const [activeTab, setActiveTab] = useState<string>("");
  const [showRollRequest, setShowRollRequest] = useState(false);

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
      default:
        return "w-full sm:w-[90vw] md:w-[80vw] lg:w-[700px]";
    }
  };

  const isBookStyle = activeTab === "NewComponent";

  return (
    <div className="relative h-screen bg-[#1c1c1c] text-[#d4d4d4] flex">
      <Sidebar activeTab={activeTab} handleIconClick={handleIconClick} isMJ={isMJ} />

      <div className="absolute left-0 z-10">
        <OverlayComponent />
      </div>

      <QuestOverlay />

      {activeTab && (
        <aside
          className={`fixed left-0 sm:left-16 md:left-20 top-0 h-full ${getPanelWidth()} text-black shadow-lg overflow-y-auto z-20
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

          <div className={isBookStyle ? 'animate-[fadeIn_0.8s_ease-out_0.3s_both]' : ''}>
            {renderActiveTab()}
          </div>
        </aside>
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

      {/* Lecteur Musical Flottant */}
      <FloatingMusic roomId={roomId} />
    </div>
  );
}
