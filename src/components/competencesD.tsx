"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, MinusCircle, Info, Star } from "lucide-react";
import { db, getDoc, doc, setDoc, updateDoc, collection, getDocs } from "@/lib/firebase";

// Type definitions
interface Competence {
  id: string;
  name: string;
  description: string;
  bonuses: Partial<BonusData>;
  isActive: boolean;
  type: "passive" | "limitée" | "other";
}

interface BonusData {
  CHA: number;
  CON: number;
  DEX: number;
  Defense: number;
  FOR: number;
  INIT: number;
  INT: number;
  Contact: number;
  Distance: number;
  Magie: number;
  PV: number;
  PV_Max:number;
  SAG: number;
  active: boolean;
  category: string;
}

interface CustomCompetence {
  slotIndex: number;
  voieIndex: number;
  sourceVoie: string;
  sourceRank: number;
  competenceName: string;
  competenceDescription: string;
  competenceType: string;
}

const statOptions = ["FOR", "DEX", "CON", "INT", "SAG", "CHA", "PV", "PV_Max","Contact","Distance","Magie", "Defense"];

interface CompetencesDisplayProps {
  roomId: string;
  characterId: string;
}

export default function CompetencesDisplay({ roomId, characterId }: CompetencesDisplayProps) {
  const [competences, setCompetences] = useState<Competence[]>([]);
  const [selectedCompetence, setSelectedCompetence] = useState<Competence | null>(null);
  const [newBonus, setNewBonus] = useState<{ stat: keyof BonusData | undefined; value: number }>({
  stat: undefined,
  value: 0,
});
  const [detailsOpenCompetenceId, setDetailsOpenCompetenceId] = useState<string | null>(null);
  const [bonusOpenCompetenceId, setBonusOpenCompetenceId] = useState<string | null>(null);
  const [customCompetences, setCustomCompetences] = useState<CustomCompetence[]>([]);
  

  useEffect(() => {
    const loadCompetences = async () => {
      await fetchCharacterSkills(roomId, characterId);
    };

    loadCompetences();
  }, [roomId, characterId]);

  const loadCustomCompetences = async (roomId: string, characterId: string) => {
    try {
      const customCompetencesRef = collection(db, `cartes/${roomId}/characters/${characterId}/customCompetences`);
      const customCompetencesSnapshot = await getDocs(customCompetencesRef);
      
      const customComps: CustomCompetence[] = [];
      customCompetencesSnapshot.forEach((doc) => {
        const data = doc.data();
        customComps.push({
          slotIndex: data.slotIndex,
          voieIndex: data.voieIndex,
          sourceVoie: data.sourceVoie,
          sourceRank: data.sourceRank,
          competenceName: data.competenceName,
          competenceDescription: data.competenceDescription,
          competenceType: data.competenceType,
        });
      });
      
      setCustomCompetences(customComps);
      return customComps;
    } catch (error) {
      console.error('Error loading custom competences:', error);
      return [];
    }
  };

  const fetchCharacterSkills = async (roomId: string, characterId: string) => {
    try {
      const characterRef = doc(db, `cartes/${roomId}/characters/${characterId}`);
      const characterDoc = await getDoc(characterRef);

      if (characterDoc.exists()) {
        const characterData = characterDoc.data();
        const skills: Competence[] = [];
        
        // Load custom competences first
        const customComps = await loadCustomCompetences(roomId, characterId);
        
        // Dynamically find all available voies (up to 10)
        for (let i = 1; i <= 10; i++) {
          const voieFile = characterData[`Voie${i}`];
          const voieLevel = characterData[`v${i}`] || 0;

          if (voieFile && voieFile.trim() !== '' && voieLevel > 0) {
            try {
              const skillData = await fetch(`/tabs/${voieFile}`).then((res) => res.json());

              for (let j = 1; j <= voieLevel; j++) {
                let skillName = skillData[`Affichage${j}`];
                let skillDescription = skillData[`rang${j}`];
                let skillType = skillData[`type${j}`];

                // Check if this competence has been customized
                const customComp = customComps.find(cc => 
                  cc.voieIndex === i - 1 && cc.slotIndex === j - 1
                );
                
                if (customComp) {
                  skillName = `🔄 ${customComp.competenceName}`;
                  skillDescription = `${customComp.competenceDescription}<br><br><em>📍 Depuis: ${customComp.sourceVoie} (rang ${customComp.sourceRank})</em>`;
                  skillType = customComp.competenceType;
                }

                if (skillName && skillDescription && skillType) {
                  const skillId = `${voieFile}-${j}`;
                  
                  // Récupérer les bonus associés depuis Firestore
                  const bonusData = await fetchBonusData(roomId, characterData.Nomperso, skillId);

                  skills.push({
                    id: skillId,
                    name: skillName,
                    description: skillDescription,
                    bonuses: bonusData,
                    isActive: bonusData.active || false,
                    type: skillType as Competence["type"],
                  });
                }
              }
            } catch (error) {
              console.error(`Error loading voie ${voieFile}:`, error);
            }
          }
        }
        setCompetences(skills);
      } else {
        console.error("Character document not found in Firestore.");
      }
    } catch (error) {
      console.error("Error fetching character skills:", error);
    }
  };

  const fetchBonusData = async (roomId: string, characterName: string, competenceId: string) => {
    const bonusRef = doc(db, `Bonus/${roomId}/${characterName}/${competenceId}`);
    const bonusDoc = await getDoc(bonusRef);

    if (bonusDoc.exists()) {
      const bonusData = bonusDoc.data() as BonusData;
      return {
        CHA: bonusData.CHA || 0,
        CON: bonusData.CON || 0,
        Contact: bonusData.Contact || 0,
        DEX: bonusData.DEX || 0,
        Defense: bonusData.Defense || 0,
        Distance: bonusData.Distance || 0,
        FOR: bonusData.FOR || 0,
        INIT: bonusData.INIT || 0,
        INT: bonusData.INT || 0,
        Magie: bonusData.Magie || 0,
        PV: bonusData.PV || 0,
        PV_Max: bonusData.PV_Max || 0,
        SAG: bonusData.SAG || 0,
        active: bonusData.active || false,
      };
    } else {
      return {}; // Si aucun bonus n'existe
    }
  };

  

const handleRemoveBonus = async (stat: string) => {
  if (selectedCompetence) {
    const updatedCompetences = competences.map((comp) =>
      comp.id === selectedCompetence.id
        ? { ...comp, bonuses: { ...comp.bonuses, [stat]: 0 } }
        : comp
    );

    setCompetences(updatedCompetences);
    setSelectedCompetence(updatedCompetences.find((comp) => comp.id === selectedCompetence.id) || null);

    try {
      const characterDoc = await getDoc(doc(db, `cartes/${roomId}/characters/${characterId}`));
      if (characterDoc.exists()) {
        const { Nomperso } = characterDoc.data();
        const bonusPath = `Bonus/${roomId}/${Nomperso}/${selectedCompetence.id}`;

        await updateDoc(doc(db, bonusPath), {
          [stat]: 0,
        });
        console.log("Bonus supprimé avec succès dans Firestore pour", stat);
      } else {
        console.error("Document de personnage introuvable pour characterId:", characterId);
      }
    } catch (error) {
      console.error("Erreur lors de la suppression du bonus:", error);
    }
  }
};

const handleAddBonus = async () => {
  if (selectedCompetence && newBonus.stat && newBonus.value) {
    const updatedCompetences = competences.map((comp) =>
      comp.id === selectedCompetence.id
        ? {
            ...comp,
            bonuses: {
              ...comp.bonuses,
              [newBonus.stat as string]: (Number(comp.bonuses[newBonus.stat as keyof BonusData]) || 0) + newBonus.value,
            },
          }
        : comp
    );

    setCompetences(updatedCompetences);
    setSelectedCompetence(updatedCompetences.find((comp) => comp.id === selectedCompetence.id) || null);
    setNewBonus({ stat: undefined, value: 0 });

    try {
      const characterDoc = await getDoc(doc(db, `cartes/${roomId}/characters/${characterId}`));
      if (characterDoc.exists()) {
        const { Nomperso } = characterDoc.data();
        const bonusPath = `Bonus/${roomId}/${Nomperso}/${selectedCompetence.id}`;

        const updatedCompetence = updatedCompetences.find((comp) => comp.id === selectedCompetence.id);

        const bonusData: BonusData = {
          CHA: updatedCompetence?.bonuses.CHA || 0,
          CON: updatedCompetence?.bonuses.CON || 0,
          Contact: updatedCompetence?.bonuses.Contact || 0,
          DEX: updatedCompetence?.bonuses.DEX || 0,
          Defense: updatedCompetence?.bonuses.Defense || 0,
          Distance: updatedCompetence?.bonuses.Distance || 0,
          FOR: updatedCompetence?.bonuses.FOR || 0,
          INIT: updatedCompetence?.bonuses.INIT || 0,
          INT: updatedCompetence?.bonuses.INT || 0,
          Magie: updatedCompetence?.bonuses.Magie || 0,
          PV: updatedCompetence?.bonuses.PV || 0,
          PV_Max: updatedCompetence?.bonuses.PV_Max || 0,
          SAG: updatedCompetence?.bonuses.SAG || 0,
          active: updatedCompetence?.isActive || false,
          category: "competence",
        };

        await setDoc(doc(db, bonusPath), bonusData, { merge: true });
        console.log("Bonus successfully added to Firestore:", bonusData);
      } else {
        console.error("Character document not found for characterId:", characterId);
      }
    } catch (error) {
      console.error("Error saving bonus:", error);
    }
  } else {
    console.error("Invalid bonus data or no competence selected.");
  }
};

  const toggleCompetenceActive = async (competenceId: string, event: React.MouseEvent) => {
    event.stopPropagation();

    const updatedCompetences = competences.map((comp) =>
      comp.id === competenceId ? { ...comp, isActive: !comp.isActive } : comp
    );

    setCompetences(updatedCompetences);

    const updatedCompetence = updatedCompetences.find((comp) => comp.id === competenceId);

    try {
      const characterDoc = await getDoc(doc(db, `cartes/${roomId}/characters/${characterId}`));
      if (characterDoc.exists()) {
        const { Nomperso } = characterDoc.data();
        const bonusPath = `Bonus/${roomId}/${Nomperso}/${competenceId}`;
        
        const bonusDoc = await getDoc(doc(db, bonusPath));
        if (bonusDoc.exists()) {
          await updateDoc(doc(db, bonusPath), {
            active: updatedCompetence?.isActive,
          });
          console.log("Active state updated successfully in Firestore.");
        } else {
          console.warn("Document not found; creating new document with active state.");
          await setDoc(doc(db, bonusPath), {
            active: updatedCompetence?.isActive,
            category: "competence",
            ...updatedCompetence?.bonuses,
          });
        }
      } else {
        console.error("Character document not found for characterId:", characterId);
      }
    } catch (error) {
      console.error("Error updating active state:", error);
    }
  };

  const renderCompetences = (type: "all" | "passive" | "limitée") => {
    const filteredCompetences = type === "all" ? competences : competences.filter((comp) => comp.type === type);

    return (
      <ScrollArea className="h-[600px] p-2">
        <div className="space-y-2">
          {filteredCompetences.map((competence) => (
            <Card
              key={competence.id}
              className={`card transition-colors duration-200 cursor-pointer ${
                competence.isActive ? "border-[var(--accent-brown)]" : "border-[var(--border-color)]"
              }`}
              onClick={(e) => toggleCompetenceActive(competence.id, e)}
            >
              <CardContent className="flex flex-col p-4 text-[var(--text-primary)]">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-[var(--accent-brown)]">{competence.name}</span>
                  <div className="flex space-x-2">
                    <Dialog open={detailsOpenCompetenceId === competence.id} onOpenChange={(isOpen) => setDetailsOpenCompetenceId(isOpen ? competence.id : null)}>
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
                          <Info className="h-4 w-4 mr-2" />
                          Détails
                        </Button>
                      </DialogTrigger>
                      <DialogContent
                        className="modal-content"
                        onPointerDownOutside={(e) => e.stopPropagation()}
                        onEscapeKeyDown={(e) => e.stopPropagation()}
                      >
                        <DialogHeader>
                          <DialogTitle className="modal-title">{selectedCompetence?.name}</DialogTitle>
                          <DialogDescription className="modal-text" dangerouslySetInnerHTML={{ __html: selectedCompetence?.description || "" }}/>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="ghost" className="button-primary" onClick={(e) => {
                            e.stopPropagation();
                            setDetailsOpenCompetenceId(null);
                          }}>
                            Fermer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
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
                          <DialogTitle className="modal-title">Gérer les bonus pour {selectedCompetence?.name}</DialogTitle>
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
          ))}
        </div>
      </ScrollArea>
    );
  };

  return (
    <Card className="card w-full max-w-4xl mx-auto">
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
  );
}
