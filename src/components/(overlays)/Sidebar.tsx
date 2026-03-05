"use client";

import { Swords, FileText, Edit, Dice5, UsersRound, Skull, History, MessageSquare } from "lucide-react";
import { useGame } from "@/contexts/GameContext";
import SearchMenu from "./SearchMenu";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";
import { useChatNotification } from "@/contexts/ChatNotificationContext";
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
  const { unreadCount, clearUnread } = useChatNotification();

  useEffect(() => {
    if (activeTab === "Chat") clearUnread();
  }, [activeTab, clearUnread]);

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
        <div
          className="rounded-r-2xl relative isolate overflow-hidden backdrop-blur-xl shadow-lg"
          style={{
            background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-darker) 100%)',
            borderTop: '1px solid var(--border-color)',
            borderRight: '1px solid var(--border-color)',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          {/* Subtle shimmer overlay */}
          <div className="absolute inset-0 pointer-events-none rounded-r-2xl"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' }} />

          <div className="relative p-2 sm:p-3 md:p-4 rounded-r-xl flex flex-col items-center space-y-3 sm:space-y-4 md:space-y-6">
            {isHydrated && isMJ && (
              <>
                <button id="vtt-sidebar-combat" onClick={() => handleIconClick("GMDashboard")} className="p-1.5 sm:p-2 transition-colors duration-150">
                  <Swords className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                    style={{ color: activeTab === "GMDashboard" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
                </button>
                <button id="vtt-sidebar-npc" onClick={() => handleIconClick("NPCManager")} className="p-1.5 sm:p-2 transition-colors duration-150">
                  <UsersRound className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                    style={{ color: activeTab === "NPCManager" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
                </button>
                <button id="vtt-sidebar-encounter" onClick={() => handleIconClick("EncounterGenerator")} className="p-1.5 sm:p-2 transition-colors duration-150">
                  <Skull className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                    style={{ color: activeTab === "EncounterGenerator" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
                </button>
                <button id="vtt-sidebar-historique" onClick={() => handleIconClick("Historique")} className="p-1.5 sm:p-2 transition-colors duration-150">
                  <History className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                    style={{ color: activeTab === "Historique" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
                </button>
              </>
            )}
            <button id="vtt-sidebar-fiche" onClick={() => handleIconClick("Component")} className="p-1.5 sm:p-2 transition-colors duration-150">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                style={{ color: activeTab === "Component" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
            </button>
            <button id="vtt-sidebar-notes" onClick={() => handleIconClick("NewComponent")} className="p-1.5 sm:p-2 transition-colors duration-150">
              <Edit className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                style={{ color: activeTab === "NewComponent" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
            </button>
            <button id="vtt-sidebar-dice" onClick={() => handleIconClick("DiceRoller")} className="p-1.5 sm:p-2 transition-colors duration-150">
              <Dice5 className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                style={{ color: activeTab === "DiceRoller" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
            </button>
            <button id="vtt-sidebar-chat" onClick={() => handleIconClick("Chat")} className="relative p-1.5 sm:p-2 transition-colors duration-150">
              <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                style={{ color: activeTab === "Chat" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-md border border-[#1c1c1c]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </aside>


      <SearchMenu />
    </>
  );
}
