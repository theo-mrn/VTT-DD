import { useState, useEffect } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer"
import { Plus, Minus, Dices, ChevronRight, Sword } from "lucide-react"
import { auth, db, doc, getDoc, onSnapshot, updateDoc, deleteDoc, collection, onAuthStateChanged } from "@/lib/firebase"

type Character = {
  id: string
  name: string
  avatar: string
  pv: number
  init: number
}

type AttackReport = {
  cible_nom: string
  attaque_result: number
  arme_utilisée: string
  réussite: boolean
  type: string
  degat_result: number
  attaquant: string
  cible: string
  reportId: string
}

export function GMDashboard() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [selectedAttack, setSelectedAttack] = useState<AttackReport | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isOtherDrawerOpen, setIsOtherDrawerOpen] = useState(false)
  const [hpChange, setHpChange] = useState(0)
  const [damageChange, setDamageChange] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [attackReports, setAttackReports] = useState<AttackReport[]>([])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid)
      } else {
        setUserId(null)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchRoomId = async () => {
      if (!userId) return
      try {
        const userDoc = await getDoc(doc(db, `users/${userId}`))
        if (userDoc.exists()) {
          const data = userDoc.data()
          setRoomId(data.room_id)
        }
      } catch (error) {
        console.error("Erreur lors de la récupération du roomId :", error)
      }
    }
    fetchRoomId()
  }, [userId])

  useEffect(() => {
    const fetchCharactersAndSettings = async () => {
      if (!roomId) return
  
      try {
        const settingsDoc = await getDoc(doc(db, `cartes/${roomId}/settings/general`))
        let activePlayerId: string | null = null
  
        if (settingsDoc.exists()) {
          const data = settingsDoc.data()
          activePlayerId = data.tour_joueur || null
        }
  
        const charactersRef = collection(db, `cartes/${roomId}/characters`)
  
        onSnapshot(charactersRef, (snapshot) => {
          const charactersData = snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              name: data.Nomperso || "absente",
              avatar: data.imageURL || `/placeholder.svg?height=40&width=40&text=${data.Nomperso ? data.Nomperso[0] : "?"}`,
              pv: data.PV ?? "absente",
              init: data.INIT ?? "absente",
            }
          })
  
          const sortedCharacters = charactersData.sort((a, b) => (b.init as number) - (a.init as number))
  
          if (activePlayerId) {
            const activePlayerIndex = sortedCharacters.findIndex((char) => char.id === activePlayerId)
            if (activePlayerIndex > 0) {
              const [activeCharacter] = sortedCharacters.splice(activePlayerIndex, 1)
              sortedCharacters.unshift(activeCharacter)
            }
          }
  
          setCharacters(sortedCharacters)
        })
      } catch (error) {
        console.error("Erreur lors du chargement des personnages et des paramètres :", error)
      }
    }
  
    fetchCharactersAndSettings()
  }, [roomId])

  useEffect(() => {
    const fetchAttackReports = async () => {
      if (!roomId || characters.length === 0) return

      const firstCharacterId = characters[0]?.id
      if (!firstCharacterId) return

      const rapportRef = collection(db, `cartes/${roomId}/combat/${firstCharacterId}/rapport`)
      
      const unsubscribe = onSnapshot(rapportRef, (snapshot) => {
        const reportsData = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            cible_nom: data.cible_nom || "Inconnu",
            attaque_result: data.attaque_result || 0,
            arme_utilisée: data.arme_utilisée || "Inconnu",
            réussite: data.réussite || false,
            type: data.type || "N/A",
            degat_result: data.degat_result || 0,
            attaquant: data.attaquant || "",
            cible: data.cible || "",
            reportId: doc.id // Store report ID to delete reports later
          }
        })

        setAttackReports(reportsData)
      })

      return () => unsubscribe()
    }

    fetchAttackReports()
  }, [roomId, characters])

  const applyDamage = async (targetId: string, damage: number) => {
    const targetCharacter = characters.find(char => char.id === targetId)
    if (!targetCharacter || !roomId) return

    try {
      const newPv = Math.max(0, targetCharacter.pv - damage)
      const characterRef = doc(db, `cartes/${roomId}/characters/${targetId}`)
      await updateDoc(characterRef, { PV: newPv })
      
      setCharacters(prevChars =>
        prevChars.map(char => char.id === targetId ? { ...char, pv: newPv } : char)
      )
    } catch (error) {
      console.error("Erreur lors de l'application des dégâts :", error)
    }
  }

  const rerollInitiative = () => {
    const updatedCharacters = characters.map(char => ({
      ...char,
      init: Math.floor(Math.random() * 20) + 1
    }))
    const sortedCharacters = updatedCharacters.sort((a, b) => b.init - a.init)
    setCharacters(sortedCharacters)
  }

  const nextCharacter = async () => {
    if (!roomId || characters.length === 0) return

    const firstCharacterId = characters[0].id
    const combatRef = collection(db, `cartes/${roomId}/combat/${firstCharacterId}/rapport`)

    // Delete each report for the current character
    const reportsToDelete = attackReports.filter(report => report.attaquant === firstCharacterId)
    for (const report of reportsToDelete) {
      const reportRef = doc(combatRef, report.reportId)
      await deleteDoc(reportRef)
    }

    setCharacters(prevChars => {
      const [first, ...rest] = prevChars
      return [...rest, first]
    })
  }

  const openDrawer = (character: Character) => {
    setSelectedCharacter(character)
    setIsDrawerOpen(true)
    setHpChange(0)
  }

  const openOtherDrawer = (attack: AttackReport) => {
    setSelectedAttack(attack)
    setIsOtherDrawerOpen(true)
    setDamageChange(attack.degat_result)
  }

  const updateCharacterHP = async () => {
    if (selectedCharacter && roomId) {
      try {
        const newPv = Math.max(0, selectedCharacter.pv + hpChange)
        const characterRef = doc(db, `cartes/${roomId}/characters/${selectedCharacter.id}`)
        await updateDoc(characterRef, { PV: newPv })
        setCharacters(prevChars =>
          prevChars.map(char => char.id === selectedCharacter.id ? { ...char, pv: newPv } : char)
        )
      } catch (error) {
        console.error("Erreur lors de la mise à jour des PV :", error)
      } finally {
        setIsDrawerOpen(false)
      }
    }
  }

  const applyManualDamage = async () => {
    if (selectedAttack && selectedAttack.cible && roomId) {
      await applyDamage(selectedAttack.cible, damageChange)
      setIsOtherDrawerOpen(false)
    }
  }

  const renderAttackReport = (report: AttackReport) => (
    <div key={report.reportId} className="mb-4 border-b pb-4">
      <p className="text-sm text-muted-foreground mt-2">
        <strong>Cible:</strong> {report.cible_nom}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        <strong>Attaque:</strong> {report.attaque_result} | <strong>Dégâts:</strong> {report.degat_result}
      </p>
      <p className="text-sm text-muted-foreground">
        <strong>Arme:</strong> {report.arme_utilisée} | <strong>Type:</strong> {report.type}
      </p>
      <p className="text-sm text-muted-foreground">
        <strong>Réussite:</strong> {report.réussite ? "Succès" : "Échec"}
      </p>
      <div className="flex space-x-2 mt-2">
        <Button size="sm" onClick={() => applyDamage(report.cible, report.degat_result)}>
          Appliquer les dégâts
        </Button>
        <Button size="sm" onClick={() => openOtherDrawer(report)}>
          Autre
        </Button>
      </div>
    </div>
  )

  const renderCharacterCard = (character: Character | undefined, index: number) => {
    if (!character) return null

    const characterReports = attackReports.filter(report => report.attaquant === character.id)

    return (
      <Card 
        key={character.id}
        className={`w-full ${index === 0 ? 'bg-primary/10' : 'hover:bg-secondary/50 cursor-pointer transition-colors'}`}
      >
        <CardContent className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {character.avatar ? (
              <img src={character.avatar} alt={character.name || "Inconnu"} className="h-12 w-12 rounded-full" />
            ) : (
              <Avatar className="h-12 w-12">
                <AvatarFallback>{character.name ? character.name[0] : "?"}</AvatarFallback>
              </Avatar>
            )}
            <div>
              <h2 className="text-xl font-semibold flex items-center mb-2">
                {character.name || "Inconnu"}
                {index === 0 && <Sword className="ml-2 h-4 w-4 text-primary" />}
              </h2>
              <p className="text-sm text-muted-foreground mb-2">
                PV: {character.pv ?? "absente"} | INIT: {character.init ?? "absente"}
              </p>
              {characterReports.map(report => renderAttackReport(report))}
            </div>
          </div>
          <Button size="sm" onClick={(e) => { e.stopPropagation(); openDrawer(character); }}>
            Ajuster PV
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <Button onClick={rerollInitiative}>
          <Dices className="mr-2 h-4 w-4" />
          Relancer l'initiative
        </Button>
        <Button onClick={nextCharacter}>
          <ChevronRight className="mr-2 h-4 w-4" />
          Suivant
        </Button>
      </div>
      
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Personnage actif</h2>
        {renderCharacterCard(characters[0], 0)}
      </div>
      
      {characters.length > 1 && (
        <>
          <h2 className="text-lg font-semibold mb-2">Autres personnages</h2>
          <ScrollArea className="h-[calc(100vh-24rem)] pr-4">
            <div className="space-y-4">
              {characters.slice(1).map((character, index) => renderCharacterCard(character, index + 1))}
            </div>
          </ScrollArea>
        </>
      )}

      <Drawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Ajuster les PV de {selectedCharacter?.name || "Inconnu"}</DrawerTitle>
            <DrawerDescription>Modifiez les points de vie du personnage</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 flex items-center justify-center space-x-4">
            <Button variant="outline" size="icon" onClick={() => setHpChange(prev => prev - 1)}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-4xl font-bold">{hpChange}</div>
            <Button variant="outline" size="icon" onClick={() => setHpChange(prev => prev + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <DrawerFooter>
            <Button onClick={updateCharacterHP}>Confirmer</Button>
            <DrawerClose asChild>
              <Button variant="outline">Annuler</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Drawer open={isOtherDrawerOpen} onClose={() => setIsOtherDrawerOpen(false)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Ajustter les Dégâts pour la cible {selectedAttack?.cible_nom || "Inconnue"}</DrawerTitle>
            <DrawerDescription>Modifiez les dégâts de l'attaque manuellement</DrawerDescription>
          </DrawerHeader>
          <div className="p-4 flex items-center justify-center space-x-4">
            <Button variant="outline" size="icon" onClick={() => setDamageChange(prev => Math.max(0, prev - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <div className="text-4xl font-bold">{damageChange}</div>
            <Button variant="outline" size="icon" onClick={() => setDamageChange(prev => prev + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <DrawerFooter>
            <Button onClick={applyManualDamage}>Appliquer les dégâts</Button>
            <DrawerClose asChild>
              <Button variant="outline">Annuler</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

export default GMDashboard
