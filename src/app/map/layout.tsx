"use client";

import { ReactNode, useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import GMDashboard from "@/components/MJcombat";
import Component from "@/components/fiche";
import MedievalNotes from "@/components/Notes";
import DiceRollerDnD from "@/components/campagne";
import Competences from "@/components/competences";
import OverlayComponent from "@/components/overlay";
import InfoComponent from "@/components/info"; // Ensure case matches the file name exactly
import { auth, db, getDoc, doc, onAuthStateChanged } from "@/lib/firebase";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const [activeTab, setActiveTab] = useState<string>("");
  const [isMJ, setIsMJ] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const uid = user.uid;
        try {
          const userDocRef = doc(db, `users/${uid}`);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setIsMJ(userData.perso === "MJ");
          }
        } catch (error) {
          console.error("Erreur lors de la récupération des données utilisateur :", error);
        }
      } else {
        setIsMJ(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const renderActiveTab = () => {
    switch (activeTab) {
      case "GMDashboard":
        return <GMDashboard />;
      case "Component":
        return <Component />;
      case "NewComponent":
        return <MedievalNotes />;
      case "DiceRollerDnD":
        return <DiceRollerDnD />;
      case "Competences":
        return <Competences />;
      case "infoComponent":
        return <InfoComponent />; 
      default:
        return null;
    }
  };
  
  const handleIconClick = (tabName: string) => {
    setActiveTab(activeTab === tabName ? "" : tabName);
  };

  const getPanelWidth = () => {
    return activeTab === "Competences" ? "w-[1200px]" : "w-[700px]";
  };

  return (
    <div className="relative h-screen bg-[#1c1c1c] text-[#d4d4d4] flex">
      {/* Sidebar Component */}
      <Sidebar activeTab={activeTab} handleIconClick={handleIconClick} isMJ={isMJ} />

      <div className="absolute left-0 z-10" style={{ transform: "translateY(10vh)" }}>
  <OverlayComponent />
</div>



      {/* Side Panel for Selected Tab */}
      {activeTab && (
        <aside
          className={`fixed left-20 top-0 h-full ${getPanelWidth()} bg-[#242424] shadow-lg  overflow-y-auto transition-transform duration-300 ease-in-out z-20`}
        >
          {renderActiveTab()}
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 h-full flex justify-center items-center bg-[#1c1c1c] p-4">
        <div className="w-full h-full px-4">{children}</div>
      </main>
    </div>
  );
}
