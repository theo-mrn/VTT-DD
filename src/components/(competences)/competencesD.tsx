"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, MinusCircle, Star, RefreshCw, X } from "lucide-react";
import { db, getDoc, doc, setDoc, updateDoc } from "@/lib/firebase";
import { useCharacter, Competence, BonusData } from "@/contexts/CharacterContext";

const statOptions = ["FOR", "DEX", "CON", "INT", "SAG", "CHA", "PV", "PV_Max", "Contact", "Distance", "Magie", "Defense"];

interface CompetencesDisplayProps {
  roomId: string;
  characterId: string;
  canEdit?: boolean;
}

export default function CompetencesDisplay({ roomId, characterId, canEdit = false }: CompetencesDisplayProps) {
  const { competences, refreshCompetences, selectedCharacter } = useCharacter();
  const [selectedCompetence, setSelectedCompetence] = useState<Competence | null>(null);
  const [newBonus, setNewBonus] = useState<{ stat: keyof BonusData | undefined; value: number }>({
    stat: undefined,
    value: 0,
  });
  const [bonusOpenCompetenceId, setBonusOpenCompetenceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

  // Synchroniser la compétence sélectionnée avec les données actuelles
  useEffect(() => {
    if (selectedCompetence) {
      const updatedComp = competences.find(c => c.id === selectedCompetence.id);
      if (updatedComp) {
        setSelectedCompetence(updatedComp);
      }
    }
  }, [competences]);

  const handleRemoveBonus = async (stat: string) => {
    if (selectedCompetence && selectedCharacter) {
      try {
        const bonusPath = `Bonus/${roomId}/${selectedCharacter.Nomperso}/${selectedCompetence.id}`;

        await updateDoc(doc(db, bonusPath), {
          [stat]: 0,
        });
        
        console.log("Bonus supprimé avec succès dans Firestore pour", stat);
        
        // Rafraîchir les compétences pour mettre à jour l'affichage
        await refreshCompetences();
        
        // Mettre à jour la compétence sélectionnée
        const updatedComp = competences.find(c => c.id === selectedCompetence.id);
        if (updatedComp) {
          setSelectedCompetence(updatedComp);
        }
      } catch (error) {
        console.error("Erreur lors de la suppression du bonus:", error);
      }
    }
  };

  const handleAddBonus = async () => {
    if (selectedCompetence && selectedCharacter && newBonus.stat && newBonus.value) {
      try {
        const bonusPath = `Bonus/${roomId}/${selectedCharacter.Nomperso}/${selectedCompetence.id}`;

        // Récupérer les bonus actuels
        const bonusDoc = await getDoc(doc(db, bonusPath));
        const currentBonuses = bonusDoc.exists() ? bonusDoc.data() : {};

        // Calculer le nouveau bonus
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
        console.log("Bonus successfully added to Firestore:", bonusData);

        // Rafraîchir les compétences pour mettre à jour l'affichage
        await refreshCompetences();

        // Mettre à jour la compétence sélectionnée
        const updatedComp = competences.find(c => c.id === selectedCompetence.id);
        if (updatedComp) {
          setSelectedCompetence(updatedComp);
        }

        // Réinitialiser le formulaire
        setNewBonus({ stat: undefined, value: 0 });
      } catch (error) {
        console.error("Error saving bonus:", error);
      }
    } else {
      console.error("Invalid bonus data or no competence selected.");
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
        await updateDoc(doc(db, bonusPath), {
          active: newActive,
        });
        console.log("Active state updated successfully in Firestore.");
      } else {
        console.warn("Document not found; creating new document with active state.");
        const comp = competences.find(c => c.id === competenceId);
        await setDoc(doc(db, bonusPath), {
          active: newActive,
          category: "competence",
          ...comp?.bonuses,
        });
      }

      // Rafraîchir les compétences pour mettre à jour l'affichage
      await refreshCompetences();
    } catch (error) {
      console.error("Error updating active state:", error);
    }
  };

  const renderCompetences = (type: "all" | "passive" | "limitée") => {
    // Filtrer par type
    let filteredCompetences = type === "all" ? competences : competences.filter((comp) => comp.type === type);
    
    // Filtrer par recherche
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      filteredCompetences = filteredCompetences.filter((comp) => {
        const name = comp.name.toLowerCase();
        const description = comp.description.toLowerCase();
        return name.includes(query) || description.includes(query);
      });
    }

    return (
      <div className="p-2">
        <div className="space-y-2">
          {filteredCompetences.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-secondary)]">
              {searchQuery ? "Aucune compétence trouvée pour cette recherche" : "Aucune compétence disponible"}
            </div>
          ) : (
            filteredCompetences.map((competence) => (
            <Card
              key={competence.id}
              className={`card transition-colors duration-200 cursor-pointer ${
                competence.isActive ? "border-[var(--accent-brown)]" : "border-[var(--border-color)]"
              }`}
              onClick={() => {
                setSelectedCompetence(competence);
                setIsDetailsDialogOpen(true);
              }}
            >
              <CardContent className="flex flex-col p-4 text-[var(--text-primary)]">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-[var(--accent-brown)] flex items-center gap-2">
                    {/* Indicateur d'état actif/inactif */}
                    <span
                      className={`w-2 h-2 rounded-full ${
                        competence.isActive
                          ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                          : "bg-gray-400"
                      }`}
                      title={competence.isActive ? "Compétence active" : "Compétence inactive"}
                    />
                    {(() => {
                      const name = competence.name || "";
                      const isCustomized = name.startsWith("🔄 ");
                      const cleanName = isCustomized ? name.slice(2).trim() : name;
                      return (
                        <>
                          {isCustomized && <RefreshCw className="h-4 w-4 text-[var(--accent-brown)]" />}
                          <span>{cleanName}</span>
                        </>
                      );
                    })()}
                  </span>
                  <div className="flex space-x-2">
                    {canEdit && (
                      <Dialog open={bonusOpenCompetenceId === competence.id} onOpenChange={(isOpen) => setBonusOpenCompetenceId(isOpen ? competence.id : null)}>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="button-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCompetence(competence);
                          }}
                        >
                          <Star className="h-4 w-4 mr-2" />
                          Bonus
                        </Button>
                      </DialogTrigger>
                      <DialogContent
                        className="modal-content"
                        onPointerDownOutside={(e) => e.stopPropagation()}
                        onEscapeKeyDown={(e) => e.stopPropagation()}
                      >
                        <DialogHeader>
                          <DialogTitle className="modal-title flex items-center gap-2">
                            {(() => {
                              const name = selectedCompetence?.name || "";
                              const isCustomized = name.startsWith("🔄 ");
                              const cleanName = isCustomized ? name.slice(2).trim() : name;
                              return (
                                <>
                                  <span>Gérer les bonus pour</span>
                                  {isCustomized && <RefreshCw className="h-4 w-4" />}
                                  <span>{cleanName}</span>
                                </>
                              );
                            })()}
                          </DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                          <div className="grid gap-4">
                            {selectedCompetence?.bonuses &&
                              Object.entries(selectedCompetence.bonuses)
                                .filter(([stat, value]) => stat !== "active" && value !== 0)
                                .map(([stat, value]) => (
                                  <div key={stat} className="flex justify-between items-center">
                                    <span>{stat}: {value}</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="button-cancel"
                                      onClick={() => handleRemoveBonus(stat)}
                                    >
                                      <MinusCircle className="h-4 w-4 mr-1" />
                                      Supprimer
                                    </Button>
                                  </div>
                                ))}
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="stat" className="text-right text-[var(--text-primary)]">
                                Statistique
                              </Label>
                              <Select onValueChange={(value) => setNewBonus({ ...newBonus, stat: value as keyof BonusData })} value={newBonus.stat}>
                                <SelectTrigger className="bg-[var(--bg-dark)] border border-[var(--border-color)] text-[var(--accent-brown)]">
                                  <SelectValue placeholder="Choisir une statistique" />
                                </SelectTrigger>
                                <SelectContent className="bg-[var(--bg-card)] border border-[var(--border-color)]">
                                  {statOptions.map((stat) => (
                                    <SelectItem key={stat} value={stat}>
                                      {stat}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="value" className="text-right text-[var(--text-primary)]">
                                Valeur
                              </Label>
                              <Input
                                id="value"
                                type="number"
                                value={newBonus.value}
                                onChange={(e) => setNewBonus({ ...newBonus, value: parseInt(e.target.value) })}
                                className="input-field col-span-3"
                              />
                            </div>
                          </div>
                          <Button onClick={handleAddBonus} className="button-primary w-full mt-4">
                            <PlusCircle className="h-4 w-4 mr-2" />
                            Ajouter le bonus
                          </Button>
                        </div>
                        <DialogFooter>
                          <Button variant="ghost" className="button-primary" onClick={(e) => {
                            e.stopPropagation();
                            setBonusOpenCompetenceId(null);
                          }}>
                            Fermer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    )}
                  </div>
                </div>
                {competence.isActive && competence.bonuses && Object.entries(competence.bonuses)
                  .filter(([stat, value]) => stat !== "active" && value !== 0)
                  .length > 0 && (
                  <div className="mt-2 ml-4">
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(competence.bonuses)
                        .filter(([stat, value]) => stat !== "active" && value !== 0)
                        .map(([stat, value], index) => {
                          const numValue = typeof value === 'number' ? value : 0;
                          return (
                            <span
                              key={index}
                              className="px-2 py-1 rounded-md bg-[var(--bg-card)] text-[var(--accent-brown)] text-sm"
                            >
                              {stat} {numValue > 0 ? "+" : ""}{numValue}
                            </span>
                          );
                        })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )))}
        </div>
      </div>
    );
  };

  return (
    <>
      <Card className="card w-full max-w-4xl mx-auto">


        {/* Barre de recherche */}
        <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-card)]">
          <div className="relative">
            <Input
              type="text"
              placeholder="Rechercher une compétence..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field pl-10 pr-10"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title="Effacer la recherche"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="text-xs text-[var(--text-secondary)] mt-2 flex items-center gap-1">
              <span className="font-semibold text-[var(--accent-brown)]">
                {competences.filter(c => {
                  const query = searchQuery.toLowerCase();
                  return c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query);
                }).length}
              </span>
              compétence(s) trouvée(s)
            </p>
          )}
        </div>

        <Tabs defaultValue="all">
          <TabsList className="grid grid-cols-3 bg-[var(--bg-dark)] text-[var(--accent-brown)]">
            <TabsTrigger value="all">Toutes</TabsTrigger>
            <TabsTrigger value="passive">Passives</TabsTrigger>
            <TabsTrigger value="limitée">Limitées</TabsTrigger>
          </TabsList>
          <TabsContent value="all">{renderCompetences("all")}</TabsContent>
          <TabsContent value="passive">{renderCompetences("passive")}</TabsContent>
          <TabsContent value="limitée">{renderCompetences("limitée")}</TabsContent>
        </Tabs>
      </Card>

      {/* Dialog des détails */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="modal-content">
          <DialogHeader>
            <DialogTitle className="modal-title flex items-center gap-2">
              {(() => {
                const name = selectedCompetence?.name || "";
                const isCustomized = name.startsWith("🔄 ");
                const cleanName = isCustomized ? name.slice(2).trim() : name;
                return (
                  <>
                    {isCustomized && <RefreshCw className="h-4 w-4" />}
                    <span>{cleanName}</span>
                  </>
                );
              })()}
            </DialogTitle>
            <DialogDescription className="modal-text" dangerouslySetInnerHTML={{ __html: selectedCompetence?.description || "" }} />
          </DialogHeader>

          {/* Affichage des bonus actifs */}
          {selectedCompetence?.bonuses && Object.entries(selectedCompetence.bonuses)
            .filter(([stat, value]) => stat !== "active" && value !== 0)
            .length > 0 && (
            <div className="py-2">
              <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Bonus accordés :</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(selectedCompetence.bonuses)
                  .filter(([stat, value]) => stat !== "active" && value !== 0)
                  .map(([stat, value], index) => {
                    const numValue = typeof value === 'number' ? value : 0;
                    return (
                      <span
                        key={index}
                        className="px-2 py-1 rounded-md bg-[var(--bg-card)] text-[var(--accent-brown)] text-sm"
                      >
                        {stat} {numValue > 0 ? "+" : ""}{numValue}
                      </span>
                    );
                  })}
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            {canEdit && selectedCompetence && (
              <Button
                className={selectedCompetence.isActive ? "button-cancel" : "button-primary"}
                onClick={async (e) => {
                  e.stopPropagation();
                  await toggleCompetenceActive(selectedCompetence.id, e);
                }}
              >
                {selectedCompetence.isActive ? "Désactiver" : "Activer"}
              </Button>
            )}
            <Button variant="ghost" className="button-primary" onClick={() => setIsDetailsDialogOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
