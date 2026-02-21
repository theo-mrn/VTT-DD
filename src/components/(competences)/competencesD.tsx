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
  style?: React.CSSProperties;
}

export default function CompetencesDisplay({ roomId, characterId, canEdit = false, onOpenFullscreen, onHeightChange, style }: CompetencesDisplayProps) {
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
        <div className="flex flex-col items-center justify-center py-12 text-[color:var(--text-secondary,#666)]">
          <p className="text-sm">Aucune compétence trouvée</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
        {filteredCompetences.map((competence) => (
          <div key={competence.id}
            onClick={() => {
              setSelectedCompetence(competence);
              setIsDetailsDialogOpen(true);
            }}
            className={`
              group relative flex flex-col justify-center
              bg-[var(--bg-card)] border rounded-lg p-3 cursor-pointer 
              transition-all duration-200
              min-h-[3.5rem]
              ${competence.isActive
                ? "border-[var(--accent-brown)] shadow-[0_0_0_1px_rgba(192,160,128,0.2)]"
                : "border-[var(--border-color)] hover:border-[var(--text-secondary)]"
              }
            `}
          >
            <div className="flex items-center gap-2.5 pr-10">
              <div className={`
                w-2 h-2 rounded-full shrink-0
                ${competence.isActive ? "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]" : "bg-gray-600"}
              `} />
              <h3 className={`font-semibold text-sm truncate ${competence.isActive ? "text-[color:var(--accent-brown)]" : "text-[color:var(--text-primary,#d4d4d4)]"}`}>
                {competence.name.replace(/^🔄\s*/, "")}
              </h3>
              {competence.name.startsWith("🔄") && (
                <RefreshCw className="h-3.5 w-3.5 text-[var(--accent-brown)] shrink-0" />
              )}
            </div>

            {canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setBonusOpenCompetenceId(competence.id);
                  setSelectedCompetence(competence);
                }}
                className="absolute top-1/2 -translate-y-1/2 right-3 p-1.5 rounded-full hover:bg-[var(--bg-darker)] text-[var(--text-secondary)] hover:text-[var(--accent-brown)] transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 ring-0 outline-none"
                title="Gérer les bonus"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}

            {(competence.isActive && competence.bonuses && Object.entries(competence.bonuses).some(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category' && stat !== 'name')) && (
              <div className="flex gap-1.5 overflow-hidden mt-2">
                {Object.entries(competence.bonuses)
                  .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category' && stat !== 'name')
                  .slice(0, 3)
                  .map(([stat, value], idx) => (
                    <span key={idx} className="text-[10px] font-medium leading-none px-1.5 py-0.5 rounded bg-[var(--bg-dark)] text-[var(--accent-brown)] border border-[var(--border-color)] whitespace-nowrap">
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
      <div className="w-full bg-[var(--bg-card)] rounded-lg p-8 text-center text-[color:var(--text-secondary,#888)]">
        Chargement...
      </div>
    );
  }

  return (
    <>
      <div ref={(el) => { containerRef.current = el }} className="w-full bg-[var(--bg-dark)] rounded-[length:var(--block-radius,0.5rem)] border border-[var(--border-color)] flex flex-col items-stretch overflow-hidden" style={style}>
        {/* Header Compact */}
        <div className="p-3 border-b border-[var(--border-color)] flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <h2 className="text-lg font-bold text-[var(--accent-brown)] shrink-0">
              Compétences
            </h2>
            <div className="relative flex-grow sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-secondary)]" />
              <Input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 pl-8 bg-[var(--bg-dark)] border-[var(--border-color)] text-[color:var(--text-primary,#d4d4d4)] text-sm focus:ring-1 focus:ring-[var(--accent-brown)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[color:var(--text-secondary,#666)] hover:text-[color:var(--text-primary,#d4d4d4)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto items-center">
            <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
              <TabsList className="h-9 bg-[var(--bg-dark)] border border-[var(--border-color)] p-0.5 w-full sm:w-auto">
                {['all', 'passive', 'limitée'].map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="text-xs px-3 data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-black h-full"
                  >
                    {tab === 'all' ? 'Toutes' : tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Button
              id="vtt-skills-btn-fullscreen"
              onClick={onOpenFullscreen}
              variant="ghost"
              size="sm"
              className="h-9 w-9 p-0 hover:bg-[var(--bg-darker)] text-[var(--accent-brown)]"
              title="Plein écran"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="bg-transparent p-3 flex-1 rounded-b-lg">
          {renderCompetences(activeTab as "all" | "passive" | "limitée")}
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="bg-transparent border-none shadow-none p-0 max-w-lg">
          <DialogTitle className="sr-only">
            {selectedCompetence?.name}
          </DialogTitle>
          {selectedCompetence && (
            <div className="w-full p-6">

              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] flex items-center gap-2">
                  {(() => {
                    const name = selectedCompetence?.name || "";
                    const cleanName = name.startsWith("🔄 ") ? name.slice(2).trim() : name;
                    return (
                      <>
                        {name.startsWith("🔄 ") && <RefreshCw className="h-5 w-5 text-[var(--accent-brown)]" />}
                        <span>{cleanName}</span>
                      </>
                    );
                  })()}
                </h2>
              </div>

              <div className="my-6 text-[var(--text-primary)] leading-relaxed text-sm md:text-base">
                <div dangerouslySetInnerHTML={{ __html: selectedCompetence?.description || "" }} />
              </div>

              {selectedCompetence?.bonuses && Object.entries(selectedCompetence.bonuses)
                .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category' && stat !== 'name')
                .length > 0 && (
                  <div className="py-4 border-t border-black/5 dark:border-white/5 mt-2">
                    <h4 className="text-sm font-semibold text-[var(--accent-brown)] mb-3">Bonus Actifs</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedCompetence.bonuses)
                        .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category' && stat !== 'name')
                        .map(([stat, value], index) => (
                          <span key={index} className="px-3 py-1.5 rounded bg-black/20 text-[var(--accent-brown)] border border-white/10 text-sm font-medium flex items-center gap-1">
                            <Star className="w-3 h-3" />
                            {stat} {Number(value) > 0 ? "+" : ""}{value}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

              <div className="flex items-center justify-between mt-8 pt-4 border-t border-black/5 dark:border-white/5">
                <Button
                  variant="ghost"
                  onClick={() => setIsDetailsDialogOpen(false)}
                  className="hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Fermer
                </Button>

                {canEdit && selectedCompetence && (
                  <Button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await toggleCompetenceActive(selectedCompetence.id, e);
                      setIsDetailsDialogOpen(false);
                    }}
                    className={`relative overflow-hidden transition-all duration-300 font-bold ${selectedCompetence.isActive
                      ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/50 border hover:shadow-lg hover:shadow-red-500/20"
                      : "bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/50 border hover:shadow-lg hover:shadow-green-500/20"
                      }`}
                  >
                    {selectedCompetence.isActive ? "Désactiver" : "Activer"}
                  </Button>
                )}
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bonus Management Dialog */}
      <Dialog open={!!bonusOpenCompetenceId} onOpenChange={(open) => !open && setBonusOpenCompetenceId(null)}>
        <DialogContent className="bg-transparent border-none shadow-none p-0 max-w-lg">
          <div className="p-6">

            <div className="flex flex-col gap-2 text-center sm:text-left mb-6">
              <DialogTitle className="text-xl font-bold text-[var(--accent-brown)]">Gérer les Bonus</DialogTitle>
              <DialogDescription className="text-[var(--text-secondary)] text-sm">
                Ajouter ou supprimer des bonus pour cette compétence
              </DialogDescription>
            </div>

            <div className="space-y-4">
              {selectedCompetence?.bonuses &&
                Object.entries(selectedCompetence.bonuses)
                  .filter(([stat, value]) => stat !== "active" && value !== 0 && stat !== 'category' && stat !== 'name')
                  .map(([stat, value]) => (
                    <div key={stat} className="flex justify-between items-center bg-black/20 p-3 rounded border border-white/10">
                      <span className="font-bold text-[var(--text-primary)]">{stat}: <span className="text-[var(--accent-brown)]">{Number(value) > 0 ? "+" : ""}{value}</span></span>
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

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-black/5 dark:border-white/5">
                <div className="space-y-2">
                  <Label className="text-[var(--text-secondary)]">Statistique</Label>
                  <Select onValueChange={(value) => setNewBonus({ ...newBonus, stat: value as keyof BonusData })} value={newBonus.stat}>
                    <SelectTrigger className="bg-black/20 border-white/10 text-[var(--text-primary)] focus:ring-[var(--accent-brown)]">
                      <SelectValue placeholder="Choisir..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-primary)]">
                      {statOptions.map((stat) => (
                        <SelectItem key={stat} value={stat}>{stat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[var(--text-secondary)]">Valeur</Label>
                  <Input
                    type="number"
                    value={newBonus.value}
                    onChange={(e) => setNewBonus({ ...newBonus, value: parseInt(e.target.value) })}
                    className="bg-black/20 border-white/10 text-[var(--text-primary)] focus:ring-[var(--accent-brown)]"
                  />
                </div>
              </div>

              <Button onClick={handleAddBonus} className="w-full mt-4 bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] text-[var(--bg-dark)] hover:shadow-lg hover:shadow-[var(--accent-brown)]/20 font-bold transition-all">
                <PlusCircle className="h-4 w-4 mr-2" />
                Ajouter le bonus
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
