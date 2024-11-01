"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlusCircle, MinusCircle, Info, Star, Power } from "lucide-react"

interface Competence {
  id: string
  name: string
  description: string
  cost: number
  bonuses: { [key: string]: number }
  isActive: boolean
}

const statOptions = ["FOR", "DEX", "CON", "INT", "SAG", "CHA", "PV", "PV_MAX", "DEF", "ATK"]

export default function CompetencesDisplay() {
  const [competences, setCompetences] = useState<Competence[]>([
    { id: "1", name: "Frappe Puissante", description: "Une attaque dévastatrice qui inflige des dégâts supplémentaires.", cost: 3, bonuses: {}, isActive: false },
    { id: "2", name: "Esquive Agile", description: "Augmente temporairement votre capacité à éviter les attaques.", cost: 2, bonuses: {}, isActive: false },
    { id: "3", name: "Concentration du Mage", description: "Améliore la puissance de vos sorts pendant un court instant.", cost: 4, bonuses: {}, isActive: false },
  ])
  const [selectedCompetence, setSelectedCompetence] = useState<Competence | null>(null)
  const [newBonus, setNewBonus] = useState({ stat: "", value: 0 })
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const [isBonusOpen, setIsBonusOpen] = useState(false)

  const handleAddBonus = () => {
    if (selectedCompetence && newBonus.stat && newBonus.value) {
      const updatedCompetences = competences.map(comp => 
        comp.id === selectedCompetence.id 
          ? { ...comp, bonuses: { ...comp.bonuses, [newBonus.stat]: (comp.bonuses[newBonus.stat] || 0) + newBonus.value } }
          : comp
      )
      setCompetences(updatedCompetences)
      setSelectedCompetence(updatedCompetences.find(comp => comp.id === selectedCompetence.id) || null)
      setNewBonus({ stat: "", value: 0 })
    }
  }

  const handleRemoveBonus = (competenceId: string, stat: string) => {
    const updatedCompetences = competences.map(comp => 
      comp.id === competenceId 
        ? { ...comp, bonuses: Object.fromEntries(Object.entries(comp.bonuses).filter(([key]) => key !== stat)) }
        : comp
    )
    setCompetences(updatedCompetences)
    setSelectedCompetence(updatedCompetences.find(comp => comp.id === competenceId) || null)
  }

  const toggleCompetenceActive = (competenceId: string) => {
    setCompetences(competences.map(comp =>
      comp.id === competenceId ? { ...comp, isActive: !comp.isActive } : comp
    ))
  }

  return (
    <div className="container mx-auto p-4">
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="active">Actives</TabsTrigger>
          <TabsTrigger value="passive">Passives</TabsTrigger>
          <TabsTrigger value="limited">Limitées</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <ScrollArea className="h-[600px]">
            <div className="space-y-2">
              {competences.map((competence) => (
                <Card key={competence.id} className={`bg-secondary transition-colors duration-200 ${competence.isActive ? 'border-primary' : ''}`}>
                  <CardContent className="flex justify-between items-center p-4">
                    <span className="font-semibold">{competence.name}</span>
                    <div className="flex space-x-2">
                      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedCompetence(competence)}>
                            <Info className="h-4 w-4 mr-2" />
                            Détails
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{selectedCompetence?.name}</DialogTitle>
                            <DialogDescription>{selectedCompetence?.description}</DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            <p className="text-sm font-semibold mb-2">Coût: {selectedCompetence?.cost}</p>
                            {selectedCompetence && Object.entries(selectedCompetence.bonuses).length > 0 && (
                              <div className="mt-2">
                                <h4 className="text-sm font-semibold mb-1">Bonus:</h4>
                                {Object.entries(selectedCompetence.bonuses).map(([stat, value]) => (
                                  <div key={stat} className="text-sm">
                                    <span>{stat}: +{value}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>Fermer</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={isBonusOpen} onOpenChange={setIsBonusOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedCompetence(competence)}>
                            <Star className="h-4 w-4 mr-2" />
                            Bonus
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Gérer les bonus pour {selectedCompetence?.name}</DialogTitle>
                          </DialogHeader>
                          <div className="py-4">
                            {selectedCompetence && Object.entries(selectedCompetence.bonuses).length > 0 && (
                              <div className="mb-4">
                                <h4 className="text-sm font-semibold mb-2">Bonus actuels:</h4>
                                {Object.entries(selectedCompetence.bonuses).map(([stat, value]) => (
                                  <div key={stat} className="flex justify-between items-center text-sm mb-1">
                                    <span>{stat}: +{value}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleRemoveBonus(selectedCompetence.id, stat)}
                                    >
                                      <MinusCircle className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="grid gap-4">
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="stat" className="text-right">
                                  Statistique
                                </Label>
                                <Select
                                  onValueChange={(value) => setNewBonus({ ...newBonus, stat: value })}
                                  value={newBonus.stat}
                                >
                                  <SelectTrigger className="col-span-3">
                                    <SelectValue placeholder="Choisir une statistique" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {statOptions.map((stat) => (
                                      <SelectItem key={stat} value={stat}>
                                        {stat}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="value" className="text-right">
                                  Valeur
                                </Label>
                                <Input
                                  id="value"
                                  type="number"
                                  value={newBonus.value}
                                  onChange={(e) => setNewBonus({ ...newBonus, value: parseInt(e.target.value) })}
                                  className="col-span-3"
                                />
                              </div>
                            </div>
                            <Button onClick={handleAddBonus} className="w-full mt-4">
                              <PlusCircle className="h-4 w-4 mr-2" />
                              Ajouter le bonus
                            </Button>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsBonusOpen(false)}>Fermer</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Button
                        variant={competence.isActive ? "default" : "secondary"}
                        size="sm"
                        onClick={() => toggleCompetenceActive(competence.id)}
                      >
                        <Power className="h-4 w-4 mr-2" />
                        {competence.isActive ? 'Activée' : 'Désactivée'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
        {/* Add similar TabsContent for other tabs if needed */}
      </Tabs>
    </div>
  )
}