"use client";

import { Swords, FileText, Edit, Dice5, ImagePlay, UsersRound, Skull } from "lucide-react";
import { useGame } from "@/contexts/GameContext";
import SearchMenu from "./SearchMenu";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";
import { useEffect } from "react";

type SidebarProps = {
  activeTab: string;
  handleIconClick: (tabName: string) => void;
  isMJ: boolean;
};


export default function Sidebar({ activeTab, handleIconClick, isMJ }: SidebarProps) {
  const { isHydrated } = useGame();
  const { isDialogOpen } = useDialogVisibility();
  const { isShortcutPressed } = useShortcuts();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // GM Shortcuts
      if (isMJ) {
        if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_COMBAT)) {
          e.preventDefault();
          handleIconClick("GMDashboard");
        }
        if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_NPC)) {
          e.preventDefault();
          handleIconClick("NPCManager");
        }
        // EncounterGenerator has no default shortcut yet, maybe add one or reuse?
      }

      // General Shortcuts
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_NOTES)) {
        e.preventDefault();
        handleIconClick("NewComponent"); // MedievalNotes maps to "NewComponent" in layout
      }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_DICE)) {
        e.preventDefault();
        handleIconClick("DiceRoller");
      }
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_CHAT)) {
        e.preventDefault();
        handleIconClick("Chat");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMJ, handleIconClick, isShortcutPressed]);

  // Hide sidebar when dialog is open
  if (isDialogOpen) {
    return null;
  }

  return (
    <>
      <aside className="fixed top-1/2 left-0 transform -translate-y-1/2 z-30">
        <div className="rounded-r-2xl relative isolate overflow-hidden bg-white/5 dark:bg-black/90 bg-gradient-to-br from-black/5 to-black/[0.02] dark:from-white/5 dark:to-white/[0.02] backdrop-blur-xl backdrop-saturate-[180%] border-y border-r border-black/10 dark:border-white/10 shadow-[0_8px_16px_rgb(0_0_0_/_0.15)] dark:shadow-[0_8px_16px_rgb(0_0_0_/_0.25)]">
          <div className="p-2 sm:p-3 md:p-4 rounded-r-xl relative bg-gradient-to-br from-black/[0.05] to-transparent dark:from-white/[0.08] dark:to-transparent backdrop-blur-md backdrop-saturate-150 border-y border-r border-black/[0.05] dark:border-white/[0.08] text-black/90 dark:text-white shadow-sm flex flex-col items-center space-y-3 sm:space-y-4 md:space-y-6">
            {isHydrated && isMJ && (
              <>
                <button id="vtt-sidebar-combat" onClick={() => handleIconClick("GMDashboard")} className="p-1.5 sm:p-2">
                  <Swords className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "GMDashboard" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
                </button>
                <button id="vtt-sidebar-npc" onClick={() => handleIconClick("NPCManager")} className="p-1.5 sm:p-2">
                  <UsersRound className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "NPCManager" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
                </button>
                <button id="vtt-sidebar-encounter" onClick={() => handleIconClick("EncounterGenerator")} className="p-1.5 sm:p-2">
                  <Skull className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "EncounterGenerator" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
                </button>
              </>
            )}
            <button id="vtt-sidebar-fiche" onClick={() => handleIconClick("Component")} className="p-1.5 sm:p-2">
              <FileText className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "Component" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
            </button>
            <button id="vtt-sidebar-notes" onClick={() => handleIconClick("NewComponent")} className="p-1.5 sm:p-2">
              <Edit className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "NewComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
            </button>

            <button id="vtt-sidebar-dice" onClick={() => handleIconClick("DiceRoller")} className="p-1.5 sm:p-2">
              <Dice5 className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "DiceRoller" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
            </button>
            <button id="vtt-sidebar-chat" onClick={() => handleIconClick("Chat")} className="p-1.5 sm:p-2">
              <ImagePlay className={`h-5 w-5 sm:h-6 sm:w-6 ${activeTab === "Chat" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
            </button>
          </div>
        </div>
      </aside>

      <SearchMenu />
    </>
  );
}
