"use client";

import { Swords, FileText, Edit, Dice5, UsersRound, Skull, History, MessageSquare, Map, PanelLeft } from "lucide-react";
import { useGame } from "@/contexts/GameContext";
import SearchMenu from "./SearchMenu";
import { useDialogVisibility } from "@/contexts/DialogVisibilityContext";
import { useShortcuts, SHORTCUT_ACTIONS } from "@/contexts/ShortcutsContext";
import { useChatNotification } from "@/contexts/ChatNotificationContext";
import { useEffect, useMemo } from "react";
import { moduleRegistry } from "@/modules/registry";

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

  const moduleTabs = useMemo(() =>
    moduleRegistry.getSidebarTabs()
      .filter(tab => !tab.mjOnly || isMJ)
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    [isMJ]
  );

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

  const surfaceStyle = {
    background: 'linear-gradient(135deg, var(--bg-card) 0%, var(--bg-darker) 100%)',
    borderColor: 'var(--border-color)',
  } as const;

  // ── Tab descriptors — single source of truth for both rail and dock ──
  type Item = {
    id: string;          // dom id suffix
    tab: string;         // activeTab key
    Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    label: string;
    badge?: number;      // optional notification count
  };

  const items: Item[] = [
    ...(isHydrated && isMJ ? [
      { id: 'combat', tab: 'GMDashboard', Icon: Swords, label: 'Combat' },
      { id: 'npc', tab: 'NPCManager', Icon: UsersRound, label: 'PNJ' },
      { id: 'encounter', tab: 'EncounterGenerator', Icon: Skull, label: 'Rencontre' },
      { id: 'historique', tab: 'Historique', Icon: History, label: 'Historique' },
    ] : []),
    { id: 'fiche', tab: 'Component', Icon: FileText, label: 'Fiche' },
    { id: 'notes', tab: 'NewComponent', Icon: Edit, label: 'Notes' },
    { id: 'dice', tab: 'DiceRoller', Icon: Dice5, label: 'Dés' },
    { id: 'chat', tab: 'Chat', Icon: MessageSquare, label: 'Chat', badge: unreadCount },
    ...moduleTabs.map(t => ({ id: `module-${t.id}`, tab: `module:${t.id}`, Icon: t.icon, label: t.label })),
  ];

  // ── Desktop rail: flat icon buttons ──
  const railIconCls = "h-5 w-5 sm:h-6 sm:w-6 transition-colors duration-150";
  const renderRailButton = (it: Item) => {
    const active = activeTab === it.tab;
    return (
      <button
        key={it.id}
        id={`vtt-sidebar-${it.id}`}
        onClick={() => handleIconClick(it.tab)}
        className="relative p-2 flex-shrink-0 transition-colors duration-150"
        title={it.label}
      >
        <it.Icon className={railIconCls} style={{ color: active ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
        {!!it.badge && it.badge > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-md border border-[#1c1c1c]">
            {it.badge > 99 ? '99+' : it.badge}
          </span>
        )}
      </button>
    );
  };

  // ── Mobile dock: flat buttons, same style as the rest of the app ──
  const renderDockButton = (it: Item) => {
    const active = activeTab === it.tab;
    return (
      <button
        key={it.id}
        id={`vtt-dock-${it.id}`}
        onClick={() => handleIconClick(it.tab)}
        className="relative flex-shrink-0 flex items-center justify-center h-11 w-11 transition-colors duration-150"
        title={it.label}
        aria-label={it.label}
      >
        <it.Icon className="h-6 w-6" style={{ color: active ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
        {!!it.badge && it.badge > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border border-[#1c1c1c]">
            {it.badge > 99 ? '99+' : it.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      {/* ── Desktop: vertical rail on the left edge ── */}
      <aside className="hidden lg:block fixed top-1/2 left-0 transform -translate-y-1/2 z-30">
        <div
          className="rounded-r-2xl relative isolate overflow-hidden backdrop-blur-xl shadow-lg border-t border-r border-b"
          style={surfaceStyle}
        >
          <div className="absolute inset-0 pointer-events-none rounded-r-2xl"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)' }} />
          <div className="relative p-4 rounded-r-xl flex flex-col items-center space-y-6">
            {items.map(renderRailButton)}
          </div>
        </div>
      </aside>

      {/* ── Mobile / tablet: full-width dock pinned to the bottom ──
          Lives in the reserved --dock-h band; panels stop above it. */}
      <aside
        className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-[#242424] border-t border-[#333]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-around gap-1 px-2 py-1.5 overflow-x-auto no-scrollbar">
          {/* Carte — dedicated button to return to the full-screen map */}
          <button
            id="vtt-dock-map"
            onClick={() => handleIconClick("")}
            className="relative flex-shrink-0 flex items-center justify-center h-11 w-11 transition-colors duration-150"
            title="Carte"
            aria-label="Carte"
          >
            <Map className="h-6 w-6" style={{ color: activeTab === "" ? 'var(--accent-brown)' : 'var(--text-secondary)' }} />
          </button>
          {/* Panel — opens the map side panel (profile / players / room), replaces the hidden top bar ☰ */}
          <button
            id="vtt-dock-panel"
            onClick={() => window.dispatchEvent(new CustomEvent('vtt-open-map-panel'))}
            className="relative flex-shrink-0 flex items-center justify-center h-11 w-11 transition-colors duration-150"
            title="Menu"
            aria-label="Menu"
          >
            <PanelLeft className="h-6 w-6" style={{ color: 'var(--text-secondary)' }} />
          </button>
          <div className="self-stretch w-px my-1.5 flex-shrink-0 bg-[#333]" />
          {items.map(renderDockButton)}
        </div>
      </aside>


      <SearchMenu />
    </>
  );
}
