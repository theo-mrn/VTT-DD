"use client";

import { ReactNode, useState, useEffect } from "react";
import { FileText, Edit, Dice5, List, Swords, X } from "lucide-react";
import GMDashboard from "@/components/MJcombat";
import Component from "@/components/fiche";
import MedievalNotes from "@/components/Notes";
import DiceRollerDnD from "@/components/campagne";
import Competences from "@/components/competences";
import { auth, db, getDoc, doc, onAuthStateChanged } from "@/lib/firebase";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const [activeTab, setActiveTab] = useState<string>(""); // Typage explicite pour activeTab
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
      {/* Always-visible Sidebar */}
      <aside className="fixed top-1/2 left-0 transform -translate-y-1/2 z-20 bg-[#242424] p-4 rounded-r-lg shadow-lg flex flex-col items-center space-y-6">
        {isMJ && (
          <button onClick={() => handleIconClick("GMDashboard")} className="p-2">
            <Swords className={`h-6 w-6 ${activeTab === "GMDashboard" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
          </button>
        )}

        <button onClick={() => handleIconClick("Component")} className="p-2">
          <FileText className={`h-6 w-6 ${activeTab === "Component" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>

        <button onClick={() => handleIconClick("NewComponent")} className="p-2">
          <Edit className={`h-6 w-6 ${activeTab === "NewComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>

        <button onClick={() => handleIconClick("DiceRollerDnD")} className="p-2">
          <Dice5 className={`h-6 w-6 ${activeTab === "DiceRollerDnD" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>

        <button onClick={() => handleIconClick("Competences")} className="p-2">
          <List className={`h-6 w-6 ${activeTab === "Competences" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
      </aside>

      {/* Side Panel for Selected Tab */}
      {activeTab && (
        <aside
          className={`fixed left-20 top-0 h-full ${getPanelWidth()} bg-[#242424] shadow-lg p-6 overflow-y-auto transition-transform duration-300 ease-in-out z-10`}
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
