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
import { db, getDoc, doc, setDoc, updateDoc } from "@/lib/firebase";

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
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isBonusOpen, setIsBonusOpen] = useState(false);
  

  useEffect(() => {
    const loadCompetences = async () => {
      await fetchCharacterSkills(roomId, characterId);
    };

    loadCompetences();
  }, [roomId, characterId]);

  const fetchCharacterSkills = async (roomId: string, characterId: string) => {
    try {
      const characterRef = doc(db, `cartes/${roomId}/characters/${characterId}`);
      const characterDoc = await getDoc(characterRef);

      if (characterDoc.exists()) {
        const characterData = characterDoc.data();
        const skillLevels = [characterData.v1, characterData.v2, characterData.v3, characterData.v4, characterData.v5, characterData.v6];

        const skills: Competence[] = [];
        for (let i = 1; i <= 6; i++) {
          const voieFile = characterData[`Voie${i}`];
          const voieLevel = skillLevels[i - 1];

          if (voieFile && voieLevel > 0) {
            const skillData = await fetch(`/tabs/${voieFile}`).then((res) => res.json());

            for (let j = 1; j <= voieLevel; j++) {
              const skillName = skillData[`Affichage${j}`];
              const skillDescription = skillData[`rang${j}`];
              const skillType = skillData[`type${j}`];

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
      <ScrollArea className="h-[600px]">
        <div className="space-y-2">
          {filteredCompetences.map((competence) => (
            <Card
              key={competence.id}
              className={`bg-[#242424] border border-[#3a3a3a] transition-colors duration-200 cursor-pointer ${
                competence.isActive ? "border-[#c0a080]" : "border-[#3a3a3a]"
              }`}
              onClick={(e) => toggleCompetenceActive(competence.id, e)}
            >
              <CardContent className="flex justify-between items-center p-4 text-[#d4d4d4]">
                <span className="font-semibold text-[#c0a080]">{competence.name}</span>
                <div className="flex space-x-2">
                  <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCompetence(competence);
                        }}
                      >
                        <Info className="h-4 w-4 mr-2" />
                        Détails
                      </Button>
                    </DialogTrigger>
                    <DialogContent className=" max-w-3xl bg-[#1c1c1c] text-[#d4d4d4]">
                      <DialogHeader>
                        <DialogTitle>{selectedCompetence?.name}</DialogTitle>
    
                        <DialogDescription dangerouslySetInnerHTML={{ __html: selectedCompetence?.description || "" }}/>

                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="ghost" className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]" onClick={() => setIsDetailsOpen(false)}>
                          Fermer
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Dialog open={isBonusOpen} onOpenChange={setIsBonusOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="bg-[#c0a080] max-w-3xl text-[#1c1c1c] hover:bg-[#d4b48f]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCompetence(competence);
                        }}
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Bonus
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl bg-[#1c1c1c] text-[#d4d4d4]">
                      <DialogHeader>
                        <DialogTitle>Gérer les bonus pour {selectedCompetence?.name}</DialogTitle>
                      </DialogHeader>
                      <div className="py-4">
                        <div className="grid gap-4">
                        {/* Afficher les bonus existants */}
{selectedCompetence?.bonuses &&
  Object.entries(selectedCompetence.bonuses)
    .filter(([stat, value]) => stat !== "active" && value !== 0) // Exclure "active" et les valeurs nulles
    .map(([stat, value]) => (
      <div key={stat} className="flex justify-between items-center">
        <span>{stat}: {value}</span>
        <Button
          variant="ghost"
          size="sm"
          className="bg-red-500 text-white"
          onClick={() => handleRemoveBonus(stat)}
        >
          <MinusCircle className="h-4 w-4 mr-1" />
          Supprimer
        </Button>
      </div>
    ))}                          
                          {/* Interface pour ajouter de nouveaux bonus */}
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="stat" className="text-right text-[#d4d4d4]">
                              Statistique
                            </Label>
                            <Select onValueChange={(value) => setNewBonus({ ...newBonus, stat: value as keyof BonusData })} value={newBonus.stat}>

                              <SelectTrigger className="bg-[#242424] border border-[#3a3a3a] text-[#c0a080]">
                                <SelectValue placeholder="Choisir une statistique" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#2a2a2a] border border-[#3a3a3a]">
                                {statOptions.map((stat) => (
                                  <SelectItem key={stat} value={stat}>
                                    {stat}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="value" className="text-right text-[#d4d4d4]">
                              Valeur
                            </Label>
                            <Input
                              id="value"
                              type="number"
                              value={newBonus.value}
                              onChange={(e) => setNewBonus({ ...newBonus, value: parseInt(e.target.value) })}
                              className="bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4] col-span-3"
                            />
                          </div>
                        </div>
                        <Button onClick={handleAddBonus} className="w-full mt-4 bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]">
                          <PlusCircle className="h-4 w-4 mr-2" />
                          Ajouter le bonus
                        </Button>
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" className="bg-[#c0a080] text-[#1c1c1c] hover:bg-[#d4b48f]" onClick={() => setIsBonusOpen(false)}>
                          Fermer
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    );
  };

  return (
    <Card className="w-full max-w-4xl mx-auto bg-[#242424] border border-[#3a3a3a] text-[#d4d4d4] shadow-lg rounded-lg">
      <Tabs defaultValue="all">
        <TabsList className="grid grid-cols-3 bg-[#1c1c1c] text-[#c0a080]">
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
