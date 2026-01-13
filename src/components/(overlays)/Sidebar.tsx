"use client";

import { Swords, FileText, Edit, Dice5, ImagePlay, UsersRound, Skull } from "lucide-react";
import { useGame } from "@/contexts/GameContext";
import SearchMenu from "./SearchMenu";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";

type SidebarProps = {
  activeTab: string;
  handleIconClick: (tabName: string) => void;
  isMJ: boolean;
};


export default function Sidebar({ activeTab, handleIconClick, isMJ }: SidebarProps) {
  const { isHydrated } = useGame();
  const { isDialogOpen } = useDialogVisibility();

  // Hide sidebar when dialog is open
  if (isDialogOpen) {
    return null;
  }

  return (
    <>
      <aside className="fixed top-1/2 left-0 transform -translate-y-1/2 z-30 bg-[#242424] p-2 sm:p-3 md:p-4 rounded-r-lg shadow-lg flex flex-col items-center space-y-3 sm:space-y-4 md:space-y-6">
        {isHydrated && isMJ && (
          <>
            <button onClick={() => handleIconClick("GMDashboard")} className="p-1.5 sm:p-2">
              <Swords className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "GMDashboard" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
            </button>
            <button onClick={() => handleIconClick("NPCManager")} className="p-1.5 sm:p-2">
              <UsersRound className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "NPCManager" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
            </button>
            <button onClick={() => handleIconClick("EncounterGenerator")} className="p-1.5 sm:p-2">
              <Skull className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "EncounterGenerator" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
            </button>
          </>
        )}
        <button onClick={() => handleIconClick("Component")} className="p-1.5 sm:p-2">
          <FileText className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "Component" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("NewComponent")} className="p-1.5 sm:p-2">
          <Edit className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "NewComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>

        <button onClick={() => handleIconClick("DiceRoller")} className="p-1.5 sm:p-2">
          <Dice5 className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "DiceRoller" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>
        <button onClick={() => handleIconClick("Chat")} className="p-1.5 sm:p-2">
          <ImagePlay className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "Chat" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
        </button>

      </aside>

      <SearchMenu />
    </>
  );
}
