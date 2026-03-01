"use client";

import { Swords, FileText, Edit, Dice5, ImagePlay, UsersRound, Skull } from "lucide-react";
import { useGame } from "@/contexts/GameContext";
import { useCharacter } from "@/contexts/CharacterContext";
import SearchMenu from "./SearchMenu";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";
import { useEffect, useState } from "react";

type SidebarProps = {
  activeTab: string;
  handleIconClick: (tabName: string) => void;
  isMJ: boolean;
};


export default function Sidebar({ activeTab, handleIconClick, isMJ }: SidebarProps) {
  const { isHydrated, persoId } = useGame();
  const { characters, selectedCharacter, setSelectedCharacter } = useCharacter();
  const { isDialogOpen } = useDialogVisibility();
  const { isShortcutPressed } = useShortcuts();

  const [isHovered, setIsHovered] = useState(false);

  // Sort characters: put the current user's character first
  const sortedCharacters = [...(characters || [])].sort((a, b) => {
    if (a.id === persoId) return -1;
    if (b.id === persoId) return 1;
    return 0; // maintain original order for others
  });

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
      <aside className="fixed top-40 left-0 z-30 transition-all duration-300">
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

            {/* Unified Player List Section */}
            {isHydrated && characters && characters.length > 0 && (
              <div
                className="flex flex-col items-center w-full relative z-50"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                {/* Current User Character (Always Visible) */}
                {sortedCharacters.length > 0 && (
                  <button
                    onClick={() => {
                      if (selectedCharacter?.id === sortedCharacters[0].id && activeTab === "Component") {
                        handleIconClick(""); // Toggle off
                      } else {
                        setSelectedCharacter(sortedCharacters[0]);
                        handleIconClick("Component");
                      }
                    }}
                    className={`relative w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full overflow-hidden transition-all duration-200 border-2 shadow-md
                      ${selectedCharacter?.id === sortedCharacters[0].id ? 'border-[var(--accent-brown)] scale-110' : 'border-[var(--border-color)] hover:border-[var(--accent-brown)]'}
                    `}
                  >
                    {sortedCharacters[0].imageURL ? (
                      <img src={sortedCharacters[0].imageURL} alt={sortedCharacters[0].Nomperso} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[var(--bg-dark)] flex items-center justify-center text-[10px] sm:text-xs font-bold text-[var(--accent-brown)]">
                        {sortedCharacters[0].Nomperso ? sortedCharacters[0].Nomperso.substring(0, 2).toUpperCase() : '?'}
                      </div>
                    )}
                  </button>
                )}

                {/* Other Characters (Visible on Hover - Overlaying below) */}
                <div
                  className={`absolute top-full left-1/2 -translate-x-1/2 w-[calc(100%+16px)] sm:w-[calc(100%+24px)] md:w-[calc(100%+32px)] flex flex-col items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out bg-[var(--bg-card)]/95 backdrop-blur-sm rounded-xl shadow-xl border border-[var(--border-color)]
                    ${isHovered ? 'max-h-96 opacity-100 mt-2 py-2 px-1' : 'max-h-0 opacity-0 mt-0 py-0 border-transparent'}
                  `}
                >
                  {sortedCharacters.slice(1).map((char) => (
                    <button
                      key={char.id}
                      onClick={() => {
                        if (selectedCharacter?.id === char.id && activeTab === "Component") {
                          handleIconClick(""); // Toggle off
                        } else {
                          setSelectedCharacter(char);
                          handleIconClick("Component");
                        }
                      }}
                      className={`relative w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full overflow-hidden transition-all duration-200 border-2
                        ${selectedCharacter?.id === char.id ? 'border-[var(--accent-brown)] scale-110' : 'border-transparent hover:border-[var(--accent-brown)]'}
                      `}
                      title={char.Nomperso}
                    >
                      {char.imageURL ? (
                        <img src={char.imageURL} alt={char.Nomperso} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[var(--bg-dark)] flex items-center justify-center text-[8px] sm:text-[10px] font-bold text-[var(--text-secondary)]">
                          {char.Nomperso ? char.Nomperso.substring(0, 2).toUpperCase() : '?'}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Separator if players exist */}
            {isHydrated && characters && characters.length > 0 && (
              <div className="w-full h-[1px] bg-[var(--border-color)] opacity-50 my-1"></div>
            )}

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
              </>
            )}
            <button id="vtt-sidebar-notes" onClick={() => handleIconClick("NewComponent")} className="p-1.5 sm:p-2 transition-colors duration-150">
              <Edit className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                style={{ color: activeTab === "NewComponent" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
            </button>
            <button id="vtt-sidebar-dice" onClick={() => handleIconClick("DiceRoller")} className="p-1.5 sm:p-2 transition-colors duration-150">
              <Dice5 className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                style={{ color: activeTab === "DiceRoller" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
            </button>
            <button id="vtt-sidebar-chat" onClick={() => handleIconClick("Chat")} className="p-1.5 sm:p-2 transition-colors duration-150">
              <ImagePlay className="h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150"
                style={{ color: activeTab === "Chat" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>
      </aside>


      <SearchMenu />
    </>
  );
}
