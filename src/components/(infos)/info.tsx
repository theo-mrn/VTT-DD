"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, BookOpen, Info, Image as ImageIcon } from "lucide-react";
import Capacites from "@/components/(infos)/capacites";
import Information from "@/components/(infos)/Information";
import Component from "@/components/(infos)/wiki";
import Images from "@/components/(infos)/images";

export type InfoSection = "Compétences" | "Information" | "Images" | "wiki" | null;

const infoButtons = [
  { id: "Compétences" as InfoSection, icon: Sparkles, label: "Compétences" },
  { id: "wiki" as InfoSection, icon: BookOpen, label: "Wiki" },
  { id: "Information" as InfoSection, icon: Info, label: "Information" },
  { id: "Images" as InfoSection, icon: ImageIcon, label: "Images" },
];

interface InfoComponentProps {
  activeSection?: InfoSection | null;
  setActiveSection?: (section: InfoSection) => void;
  renderButtons?: boolean;
}

export default function InfoComponent({ 
  activeSection: externalActiveSection,
  setActiveSection: externalSetActiveSection,
  renderButtons = false
}: InfoComponentProps = {}) {
  const [internalActiveSection, setInternalActiveSection] = useState<InfoSection>(null);
  
  const activeSection = externalActiveSection !== undefined ? externalActiveSection : internalActiveSection;
  const setActiveSection = externalSetActiveSection || setInternalActiveSection;

  const closeFullScreen = () => setActiveSection(null);

  const renderFullScreen = () => {
    switch (activeSection) {
      case "Compétences":
        return <Capacites />;
      case "Information":
        return <Information />;
      case "wiki":
        return <Component />;
      case "Images":
        return <Images />;
      default:
        return null;
    }
  };

  if (renderButtons && !activeSection) {
    return (
      <div className="p-1">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {infoButtons.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className="px-3 py-2 rounded-lg bg-[#1c1c1c] text-[#d4d4d4] hover:bg-[#333] hover:text-[#c0a080] transition-colors border border-[#3a3a3a] flex items-center gap-2"
              title={label}
            >
              <Icon className="h-4 w-4" />
              <span className="text-xs">{label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!renderButtons && activeSection) {
    return (
      <div className="fixed inset-0 bg-black/95 backdrop-blur-sm z-[60] overflow-y-auto">
        <button
          onClick={closeFullScreen}
          className="fixed top-4 right-4 z-[70] rounded-lg p-2 bg-[#242424] text-[#d4d4d4] hover:bg-[#333] transition-colors shadow-lg border border-[#3a3a3a]"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex justify-center items-start p-4 sm:p-6 min-h-screen pt-16">
          {renderFullScreen()}
        </div>
      </div>
    );
  }

  return null;
}
