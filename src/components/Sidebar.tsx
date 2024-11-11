// Sidebar.tsx
"use client";

import { Swords, BookOpen, FileText, Edit, Dice5, List, Music } from "lucide-react"; // Import Music icon

type SidebarProps = {
  activeTab: string;
  handleIconClick: (tabName: string) => void;
  isMJ: boolean;
};

export default function Sidebar({ activeTab, handleIconClick, isMJ }: SidebarProps) {
  return (
    <aside className="fixed top-1/2 left-0 transform -translate-y-1/2 z-10 bg-[#242424] p-4 rounded-r-lg shadow-lg flex flex-col items-center space-y-6">
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
      <button onClick={() => handleIconClick("infoComponent")} className="p-2">
        <BookOpen className={`h-6 w-6 ${activeTab === "infoComponent" ? "text-[#c0a080]" : "text-[#d4d4d4]"}`} />
      </button>
    </aside>
  );
}
