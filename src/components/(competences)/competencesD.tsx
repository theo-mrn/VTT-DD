"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, MinusCircle, Star, RefreshCw, X, Settings, Search } from "lucide-react";
import { db, getDoc, doc, setDoc, updateDoc } from "@/lib/firebase";
import { useCharacter, Competence, BonusData } from "@/contexts/CharacterContext";

const statOptions = ["FOR", "DEX", "CON", "INT", "SAG", "CHA", "PV", "PV_Max", "Contact", "Distance", "Magie", "Defense"];

interface CompetencesDisplayProps {
  roomId: string;
  characterId: string;
  canEdit?: boolean;
  onOpenFullscreen?: () => void;
  onHeightChange?: (height: number) => void;
}

export default function CompetencesDisplay({ roomId, characterId, canEdit = false, onOpenFullscreen, onHeightChange }: CompetencesDisplayProps) {
  const { competences, refreshCompetences, selectedCharacter, setSelectedCharacter, characters, isLoading } = useCharacter();
  const [selectedCompetence, setSelectedCompetence] = useState<Competence | null>(null);
  const [newBonus, setNewBonus] = useState<{ stat: keyof BonusData | undefined; value: number }>({
    stat: undefined,
    value: 0,
  });
  const [bonusOpenCompetenceId, setBonusOpenCompetenceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const containerRef = useState<{ current: HTMLDivElement | null }>({ current: null })[0]; // Using a stable ref object

  useEffect(() => {
    if (onHeightChange && containerRef.current) {
      // Use a ResizeObserver for more robust size tracking
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          // Add a small buffer to prevent cutting off borders
          onHeightChange(entry.contentRect.height + 4);
        }
      });

      observer.observe(containerRef.current);

      return () => observer.disconnect();
    }
  }, [onHeightChange, competences, activeTab, searchQuery]); // Depend on data changes layout

  // Fallback measurement
  useEffect(() => {
    if (onHeightChange && containerRef.current) {
      onHeightChange(containerRef.current.scrollHeight);
    }
  }, [competences, activeTab, searchQuery, onHeightChange]);

  useEffect(() => {
    if (characterId && characters.length > 0) {
      const character = characters.find(c => c.id === characterId);
      if (character && selectedCharacter?.id !== characterId) {
        setSelectedCharacter(character);
      }
    }
  }, [characterId, characters, selectedCharacter?.id, setSelectedCharacter]);

  useEffect(() => {
    const handleCompetencesUpdate = async () => {
      await refreshCompetences();
    };

    window.addEventListener('competences-updated', handleCompetencesUpdate);
    return () => {
      window.removeEventListener('competences-updated', handleCompetencesUpdate);
    };
  }, [refreshCompetences]);

  useEffect(() => {
    if (selectedCompetence) {
      const updatedComp = competences.find(c => c.id === selectedCompetence.id);
      if (updatedComp) {
        setSelectedCompetence(updatedComp);
      }
    }
  }, [competences, selectedCompetence]);

  // ... (handlers omitted for brevity) ... 

  // Re-declare handlers to fix component structure in tool replacement
  const handleRemoveBonus = async (stat: string) => {
    if (selectedCompetence && selectedCharacter) {
      try {
        const bonusPath = `Bonus/${roomId}/${selectedCharacter.Nomperso}/${selectedCompetence.id}`;
        await updateDoc(doc(db, bonusPath), { [stat]: 0 });
        await refreshCompetences();
        const updatedComp = competences.find(c => c.id === selectedCompetence.id);
        if (updatedComp) setSelectedCompetence(updatedComp);
      } catch (error) {
        console.error("Erreur lors de la suppression du bonus:", error);
      }
    }
  };

  const handleAddBonus = async () => {
    if (selectedCompetence && selectedCharacter && newBonus.stat && newBonus.value) {
      try {
        const bonusPath = `Bonus/${roomId}/${selectedCharacter.Nomperso}/${selectedCompetence.id}`;
        const bonusDoc = await getDoc(doc(db, bonusPath));
        const currentBonuses = bonusDoc.exists() ? bonusDoc.data() : {};
        const currentValue = currentBonuses[newBonus.stat] || 0;
        const newValue = Number(currentValue) + Number(newBonus.value);

        const bonusData: BonusData = {
          CHA: currentBonuses.CHA || 0,
          CON: currentBonuses.CON || 0,
          Contact: currentBonuses.Contact || 0,
          DEX: currentBonuses.DEX || 0,
          Defense: currentBonuses.Defense || 0,
          Distance: currentBonuses.Distance || 0,
          FOR: currentBonuses.FOR || 0,
          INIT: currentBonuses.INIT || 0,
          INT: currentBonuses.INT || 0,
          Magie: currentBonuses.Magie || 0,
          PV: currentBonuses.PV || 0,
          PV_Max: currentBonuses.PV_Max || 0,
          SAG: currentBonuses.SAG || 0,
          [newBonus.stat]: newValue,
          active: currentBonuses.active !== undefined ? currentBonuses.active : selectedCompetence.isActive,
          category: "competence",
        };

        await setDoc(doc(db, bonusPath), bonusData, { merge: true });
        await refreshCompetences();
        const updatedComp = competences.find(c => c.id === selectedCompetence.id);
        if (updatedComp) setSelectedCompetence(updatedComp);
        setNewBonus({ stat: undefined, value: 0 });
      } catch (error) {
        console.error("Error saving bonus:", error);
      }
    }
  };

  const toggleCompetenceActive = async (competenceId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!selectedCharacter) return;

    try {
      const bonusPath = `Bonus/${roomId}/${selectedCharacter.Nomperso}/${competenceId}`;
      const bonusDoc = await getDoc(doc(db, bonusPath));
      const currentActive = bonusDoc.exists() ? bonusDoc.data()?.active : false;
      const newActive = !currentActive;

      if (bonusDoc.exists()) {
        await updateDoc(doc(db, bonusPath), { active: newActive });
      } else {
        const comp = competences.find(c => c.id === competenceId);
        await setDoc(doc(db, bonusPath), {
          active: newActive,
          category: "competence",
          ...comp?.bonuses,
        });
      }
      await refreshCompetences();
    } catch (error) {
      console.error("Error updating active state:", error);
    }
  };

  const renderCompetences = (type: "all" | "passive" | "limitée") => {
    let filteredCompetences = type === "all" ? competences : competences.filter((comp) => comp.type === type);

    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filteredCompetences = filteredCompetences.filter((comp) => {
        const name = comp.name.toLowerCase();
        const description = comp.description.toLowerCase();
        return name.includes(query) || description.includes(query);
      });
    }

    if (filteredCompetences.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-[#666]">
          <p className="text-sm">Aucune compétence trouvée</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
        {filteredCompetences.map((competence) => (
          <div
            key={competence.id}
            onClick={() => {
              setSelectedCompetence(competence);
              setIsDetailsDialogOpen(true);
            }}
            className={`
              group relative flex flex-col justify-center
              bg-[#2a2a2a] border rounded-lg p-3 cursor-pointer 
              transition-all duration-200
              min-h-[3.5rem]
              ${competence.isActive
                ? "border-[#c0a080] shadow-[0_0_0_1px_rgba(192,160,128,0.2)]"
                : "border-[#3a3a3a] hover:border-[#555]"
              }
            `}
          >
            <div className="flex items-center gap-2.5 pr-10">
              <div className={`
                w-2 h-2 rounded-full shrink-0
                ${competence.isActive ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" : "bg-gray-600"}
              `} />
              <h3 className={`font-semibold text-sm truncate ${competence.isActive ? "text-[#c0a080]" : "text-[#d4d4d4]"}`}>
                {competence.name.replace(/^🔄\s*/, "")}
              </h3>
              {competence.name.startsWith("🔄") && (
                <RefreshCw className="h-3.5 w-3.5 text-[#c0a080] shrink-0" />
              )}
            </div>

            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setBonusOpenCompetenceId(competence.id);
                  setSelectedCompetence(competence);
                }}
                className="absolute top-1/2 -translate-y-1/2 right-3 p-1.5 rounded-full hover:bg-[#3a3a3a] text-[#666] hover:text-[#c0a080] transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 ring-0 outline-none"
                title="Gérer les bonus"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}

            {(competence.isActive && competence.bonuses && Object.entries(competence.bonuses).some(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category')) && (
              <div className="flex gap-1.5 overflow-hidden mt-2">
                {Object.entries(competence.bonuses)
                  .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category')
                  .slice(0, 3)
                  .map(([stat, value], idx) => (
                    <span key={idx} className="text-[10px] font-medium leading-none px-1.5 py-0.5 rounded bg-[#1c1c1c] text-[#c0a080] border border-[#3a3a3a] whitespace-nowrap">
                      {stat} {Number(value) > 0 ? "+" : ""}{value}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="w-full bg-[#242424] rounded-lg p-8 text-center text-[#888]">
        Chargement...
      </div>
    );
  }

  return (
    <>
      <div ref={(el) => { containerRef.current = el }} className="w-full bg-[#1c1c1c] rounded-lg border border-[#333] flex flex-col items-stretch">
        {/* Header Compact */}
        <div className="p-3 border-b border-[#333] flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#242424]">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <h2 className="text-lg font-bold text-[#c0a080] shrink-0">
              Compétences
            </h2>
            <div className="relative flex-grow sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#666]" />
              <Input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 bg-[#1c1c1c] border-[#333] text-[#d4d4d4] text-sm focus:ring-1 focus:ring-[#c0a080]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#d4d4d4]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto items-center">
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
              <TabsList className="h-9 bg-[#1c1c1c] border border-[#333] p-0.5 w-full sm:w-auto">
                {['all', 'passive', 'limitée'].map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="text-xs px-3 data-[state=active]:bg-[#c0a080] data-[state=active]:text-[#1c1c1c] h-full"
                  >
                    {tab === 'all' ? 'Toutes' : tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Button
              onClick={onOpenFullscreen}
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 hover:bg-[#333] text-[#c0a080]"
              title="Plein écran"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="bg-[#1c1c1c] p-3 flex-1">
          {renderCompetences(activeTab as "all" | "passive" | "limitée")}
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="bg-[#242424] border-[#333] text-[#d4d4d4] max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-[#c0a080] flex items-center gap-2">
              {(() => {
                const name = selectedCompetence?.name || "";
                const cleanName = name.startsWith("🔄 ") ? name.slice(2).trim() : name;
                return (
                  <>
                    {name.startsWith("🔄 ") && <RefreshCw className="h-4 w-4" />}
                    <span>{cleanName}</span>
                  </>
                );
              })()}
            </DialogTitle>
          </DialogHeader>

          {/* Moved dangerous html out of DialogDescription to avoid hydration error */}
          <div className="text-[#a0a0a0] mt-2 text-sm md:text-base leading-relaxed p-4 bg-[#1c1c1c] rounded-lg border border-[#333]">
            <div dangerouslySetInnerHTML={{ __html: selectedCompetence?.description || "" }} />
          </div>

          {selectedCompetence?.bonuses && Object.entries(selectedCompetence.bonuses)
            .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category')
            .length > 0 && (
              <div className="py-4 border-t border-[#333] mt-2">
                <h4 className="text-sm font-semibold text-[#c0a080] mb-3">Bonus Actifs</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedCompetence.bonuses)
                    .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category')
                    .map(([stat, value], index) => (
                      <span key={index} className="px-3 py-1.5 rounded bg-[#1c1c1c] text-[#c0a080] border border-[#333] text-sm font-medium flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {stat} {Number(value) > 0 ? "+" : ""}{value}
                      </span>
                    ))}
                </div>
              </div>
            )}

          <DialogFooter className="flex gap-3 sm:justify-between border-t border-[#333] pt-4 mt-2">
            <div className="flex-1">
              {canEdit && selectedCompetence && (
                <Button
                  className={`
                    w-full sm:w-auto font-bold transition-all
                    ${selectedCompetence.isActive
                      ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/50 border"
                      : "bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/50 border"}
                  `}
                  onClick={async (e) => {
                    e.stopPropagation();
                    await toggleCompetenceActive(selectedCompetence.id, e);
                    setIsDetailsDialogOpen(false);
                  }}
                >
                  {selectedCompetence.isActive ? "Désactiver" : "Activer"}
                </Button>
              )}
            </div>
            <Button
              variant="secondary"
              onClick={() => setIsDetailsDialogOpen(false)}
              className="bg-[#3a3a3a] text-white hover:bg-[#4a4a4a]"
            >
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bonus Management Dialog */}
      <Dialog open={!!bonusOpenCompetenceId} onOpenChange={(open) => !open && setBonusOpenCompetenceId(null)}>
        <DialogContent className="bg-[#242424] border-[#333] text-[#d4d4d4]">
          <DialogHeader>
            <DialogTitle className="text-[#c0a080]">Gérer les Bonus</DialogTitle>
            {/* Accessible description for screen readers, optional visuals */}
            <DialogDescription className="sr-only">
              Ajouter ou supprimer des bonus pour cette compétence
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedCompetence?.bonuses &&
              Object.entries(selectedCompetence.bonuses)
                .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category')
                .map(([stat, value]) => (
                  <div key={stat} className="flex justify-between items-center bg-[#1c1c1c] p-3 rounded border border-[#333]">
                    <span className="font-bold">{stat}: <span className="text-[#c0a080]">{Number(value) > 0 ? "+" : ""}{value}</span></span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      onClick={() => handleRemoveBonus(stat)}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#333]">
              <div className="space-y-2">
                <Label className="text-[#a0a0a0]">Statistique</Label>
                <Select onValueChange={(value) => setNewBonus({ ...newBonus, stat: value as keyof BonusData })} value={newBonus.stat}>
                  <SelectTrigger className="bg-[#1c1c1c] border-[#333] text-[#d4d4d4]">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-[#333] text-[#d4d4d4]">
                    {statOptions.map((stat) => (
                      <SelectItem key={stat} value={stat}>{stat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-[#a0a0a0]">Valeur</Label>
                <Input
                  type="number"
                  value={newBonus.value}
                  onChange={(e) => setNewBonus({ ...newBonus, value: parseInt(e.target.value) })}
                  className="bg-[#1c1c1c] border-[#333] text-[#d4d4d4]"
                />
              </div>
            </div>

            <Button onClick={handleAddBonus} className="w-full bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f] font-bold">
              <PlusCircle className="h-4 w-4 mr-2" />
              Ajouter le bonus
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
