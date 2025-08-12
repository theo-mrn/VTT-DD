'use client'

import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { auth, db, getDoc, onAuthStateChanged, doc, collection, getDocs, updateDoc } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import dynamic from 'next/dynamic'

const ChangeComponent = dynamic(() => import('@/components/change'), {
  loading: () => <div className="text-center p-4">Chargement...</div>
})

interface Character {
    id: string
    Nomperso: string
    Voie1?: string
    Voie2?: string
    Voie3?: string
    Voie4?: string
    Voie5?: string
    Voie6?: string
    Voie7?: string
    Voie8?: string
    Voie9?: string
    Voie10?: string
    v1?: number
    v2?: number
    v3?: number
    v4?: number
    v5?: number
    v6?: number
    v7?: number
    v8?: number
    v9?: number
    v10?: number
    type: string
    niveau: number
    [key: string]: string | number | undefined // Allow dynamic access for voie properties
}

interface VoieData {
    Voie: string
    Affichage1: string
    Affichage2: string
    Affichage3: string
    Affichage4: string
    Affichage5: string
    rang1: string
    rang2: string
    rang3: string
    rang4: string
    rang5: string
}

interface Skill {
    name: string
    description: string
    rank: number
    voie: string
}

interface CustomCompetence {
    slotIndex: number
    voieIndex: number
    sourceVoie: string
    sourceRank: number
    competenceName: string
    competenceDescription: string
    competenceType: string
}

export default function Competences() {
    const [showChangeComponent, setShowChangeComponent] = useState(false)
    const [characters, setCharacters] = useState<Character[]>([])
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
    const [voieData, setVoieData] = useState<Record<string, VoieData>>({})
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
    const [totalPoints, setTotalPoints] = useState(0)
    const [isModalVisible, setModalVisible] = useState(false)
    const [isUnlockable, setIsUnlockable] = useState(false)
    const [roomID, setRoomID] = useState<string | null>(null)
    const [userPersoId, setUserPersoId] = useState<string | null>(null)

    useEffect(() => {
        const loadUser = async () => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    const userRef = doc(db, 'users', user.uid)
                    const userDoc = await getDoc(userRef)
                    if (userDoc.exists()) {
                        const userData = userDoc.data()
                        const roomID = userData?.room_id
                        const persoId = userData?.persoId
                        setRoomID(roomID)
                        setUserPersoId(persoId)
                        if (roomID) {
                            loadCharacters(roomID)
                        }
                    }
                }
            })
        }
        loadUser()
    }, [])

    const loadCharacters = async (roomID: string) => {
        const charactersRef = collection(db, `cartes/${roomID}/characters`)
        const characterDocs = await getDocs(charactersRef)
        const characterList: Character[] = []

        characterDocs.forEach((doc) => {
            const data = doc.data() as Character
            if (data.type === "joueurs") {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...characterData } = data // exclude id from data
                characterList.push({ id: doc.id, ...characterData })
            }
        })

        setCharacters(characterList)
    }

    const loadCustomCompetences = async (roomId: string, persoId: string) => {
        try {
            const customCompetencesRef = collection(db, `cartes/${roomId}/characters/${persoId}/customCompetences`)
            const customCompetencesSnapshot = await getDocs(customCompetencesRef)
            
            const customComps: CustomCompetence[] = []
            customCompetencesSnapshot.forEach((doc) => {
                const data = doc.data()
                customComps.push({
                    slotIndex: data.slotIndex,
                    voieIndex: data.voieIndex,
                    sourceVoie: data.sourceVoie,
                    sourceRank: data.sourceRank,
                    competenceName: data.competenceName,
                    competenceDescription: data.competenceDescription,
                    competenceType: data.competenceType,
                })
            })
            
            return customComps
        } catch (error) {
            console.error('Error loading custom competences:', error)
            return []
        }
    }

    const applyCustomCompetences = (voieData: Record<string, VoieData>, customComps: CustomCompetence[]) => {
        const updatedVoieData = { ...voieData }
        
        customComps.forEach((customComp) => {
            const voieKey = `Voie${customComp.voieIndex + 1}`
            if (updatedVoieData[voieKey]) {
                const affichageKey = `Affichage${customComp.slotIndex + 1}` as keyof VoieData
                const rangKey = `rang${customComp.slotIndex + 1}` as keyof VoieData
                
                updatedVoieData[voieKey] = {
                    ...updatedVoieData[voieKey],
                    [affichageKey]: `🔄 ${customComp.competenceName}`,
                    [rangKey]: `${customComp.competenceDescription}<br><br><em>📍 Depuis: ${customComp.sourceVoie} (rang ${customComp.sourceRank})</em>`
                }
            }
        })
        
        return updatedVoieData
    }

    const selectCharacter = async (character: Character) => {
        setSelectedCharacter(character)
        setVoieData({})

        // Load custom competences first
        const customComps = await loadCustomCompetences(roomID!, character.id)

        // Dynamically find all available voies
        const voiePromises = []
        for (let j = 1; j <= 10; j++) { // Support up to 10 voies
            const voieFile = character[`Voie${j}` as keyof Character] as string
            if (voieFile && voieFile.trim() !== '') {
                voiePromises.push(
                    fetch(`/tabs/${voieFile}`)
                        .then(response => {
                            if (!response.ok) throw new Error('Failed to fetch')
                            return response.json()
                        })
                        .then(voieJson => ({
                            key: `Voie${j}`,
                            data: voieJson
                        }))
                        .catch(error => {
                            console.error('Error fetching voie data:', error)
                            return null
                        })
                )
            }
        }

        const results = await Promise.all(voiePromises)
        const newVoieData: Record<string, VoieData> = {}
        results.forEach(result => {
            if (result) {
                newVoieData[result.key] = result.data
            }
        })

        // Apply custom competences to the voie data
        const finalVoieData = applyCustomCompetences(newVoieData, customComps)
        setVoieData(finalVoieData)

        calculateTotalPoints(character)
    }

    const calculateTotalPoints = (character: Character) => {
        // S'assurer que `niveau` est un entier
        const pointsFromLevel = 2 * (character.niveau ?? 0)
    
        // Calcul des points perdus en fonction des valeurs de `v`
        const totalPointsLost = Object.entries(character)
            .filter(([key]) => key.startsWith('v') && key.match(/^v\d+$/)) // Only v1, v2, etc.
            .reduce((total, [, value]) => {
                const voieValue = Number(value ?? 0) // Convertir la valeur en nombre pour éviter NaN
                let pointsLost = 0
    
                // Check if this is a race voie (v6, v7, v8, v9, v10 could be race voies)
                // For now, we'll apply standard rules to all voies
                switch (voieValue) {
                    case 1:
                        pointsLost = 1
                        break
                    case 2:
                        pointsLost = 2
                        break
                    case 3:
                        pointsLost = 4
                        break
                    case 4:
                        pointsLost = 6
                        break
                    case 5:
                        pointsLost = 8
                        break
                    default:
                        pointsLost = 0 // Niveau 0 ou non défini, aucun point perdu
                }
    
                return total + pointsLost
            }, 0)
    
        // Calcul des points totaux disponibles
        setTotalPoints(pointsFromLevel - totalPointsLost)
    }
    
    

    const handleSkillClick = (name: string, description: string, rank: number, voie: string) => {
        const currentRank = Number(selectedCharacter?.[voie as keyof Character] ?? 0)
        const canUnlock = rank === 1 || currentRank >= rank - 1
        const isOwnCharacter = selectedCharacter?.id === userPersoId

        setSelectedSkill({ name, description: description.replace(/<br>/g, '\n'), rank, voie })
        setIsUnlockable(canUnlock && isOwnCharacter)
        setModalVisible(true)
    }

    const unlockSkill = async () => {
        if (selectedSkill && selectedCharacter && roomID && selectedCharacter.id === userPersoId) {
            const updatedCharacterData = { ...selectedCharacter, [selectedSkill.voie]: selectedSkill.rank }
            await updateDoc(doc(db, `cartes/${roomID}/characters`, selectedCharacter.id), updatedCharacterData)

            setSelectedCharacter(updatedCharacterData)
            setModalVisible(false)
            calculateTotalPoints(updatedCharacterData)
        }
    }

    const resetSkills = async () => {
        if (selectedCharacter && roomID && selectedCharacter.id === userPersoId) {
            const resetData: Partial<Character> = { ...selectedCharacter }
            
            // Reset all v properties dynamically
            for (let i = 1; i <= 10; i++) {
                if (selectedCharacter[`v${i}`] !== undefined) {
                    resetData[`v${i}`] = 0
                }
            }

            await updateDoc(doc(db, `cartes/${roomID}/characters`, selectedCharacter.id), resetData)
            setSelectedCharacter(resetData as Character)
            calculateTotalPoints(resetData as Character)
        }
    }

    if (showChangeComponent) {
        return <ChangeComponent onClose={() => setShowChangeComponent(false)} />
    }

    return (
        <div className="flex flex-col items-center bg-[var(--bg-dark)] text-[var(--text-primary)] min-h-screen p-4">
            <h1 className="text-2xl font-bold mb-5 text-[var(--accent-brown)]">Choisissez un Personnage</h1>
            <div className="flex flex-wrap gap-4 mb-8">
                {characters.map((character) => (
                    <Button
                        key={character.id}
                        onClick={() => selectCharacter(character)}
                        className={`button-primary ${
                            character.id === userPersoId ? 'ring-2 ring-[var(--accent-brown)]' : ''
                        }`}
                        title={character.id === userPersoId ? 'Votre personnage' : 'Personnage d\'un autre joueur (lecture seule)'}
                    >
                        {character.Nomperso}
                        {character.id === userPersoId && ' ⭐'}
                    </Button>
                ))}
            </div>

            {selectedCharacter && (
                <>
                    <div id="characterInfo" className="mb-3 text-[var(--accent-brown)]">
                        {selectedCharacter.Nomperso} - {totalPoints} Points
                    </div>
                    <div className="flex gap-4 mb-5">
                        <Button 
                            onClick={resetSkills} 
                            disabled={selectedCharacter?.id !== userPersoId}
                            className={`button-secondary ${
                                selectedCharacter?.id !== userPersoId ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            Réinitialiser
                        </Button>
                        <Button 
                            onClick={() => setShowChangeComponent(true)}
                            className="button-primary"
                        >
                        Gérer les Voies
                        </Button>
                    </div>
                    <div id="tabContent" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl w-full">
                        {Object.entries(voieData).map(([voieKey, voie]) => {
                            const voieNumber = voieKey.replace('Voie', '')
                            
                            return (
                                <Card key={voieKey} className="card">
                                    <CardHeader>
                                        <CardTitle className="text-[var(--accent-brown)]">{voie.Voie || voieKey}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {Array.from({ length: 5 }, (_, i) => {
                                            const isUnlocked = Number(selectedCharacter[`v${voieNumber}` as keyof Character] ?? 0) >= i + 1
                                            const skillName = voie[`Affichage${i + 1}` as keyof VoieData] as string
                                            const skillDescription = voie[`rang${i + 1}` as keyof VoieData] as string

                                            return (
                                                <div
                                                    key={i}
                                                    className={`skill-item mb-3 border-b border-[var(--border-color)] pb-2 ${
                                                        isUnlocked ? 'text-[var(--accent-brown)]' : 'text-[var(--text-secondary)]'
                                                    } cursor-pointer hover:text-[var(--text-primary)]`}
                                                    onClick={() => handleSkillClick(skillName, skillDescription, i + 1, `v${voieNumber}`)}
                                                >
                                                    <span className="inline-flex items-center gap-2">
                                                        {skillName?.startsWith('🔄 ')
                                                            ? <>
                                                                <RefreshCw className="h-4 w-4" />
                                                                <span>{skillName.slice(2).trim()}</span>
                                                              </>
                                                            : <span>{skillName}</span>
                                                        }
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </CardContent>
                                </Card>
                            )
                        })}
                    </div>
                </>
            )}
            <div className='max-w-3xl'>
                <Dialog open={isModalVisible} onOpenChange={setModalVisible}>
                    <DialogContent className="modal-content">
                        <DialogHeader>
                            <DialogTitle className="modal-title">{selectedSkill?.name}</DialogTitle>
                        </DialogHeader>
                        <p className="modal-text mb-4 whitespace-pre-line">
                            {selectedSkill?.description}
                        </p>
                        <p className="modal-text mb-4">
                            Points: {selectedSkill && (selectedSkill.rank <= 2 ? '1 point' : '2 points')}
                        </p>
                        {selectedCharacter?.id !== userPersoId && (
                            <p className="modal-text mb-4 text-[var(--text-secondary)] bg-[var(--bg-card)] p-2 rounded">
                                ⚠️ Vous ne pouvez modifier que votre propre personnage
                            </p>
                        )}
                        <DialogFooter>
                            <Button 
                                className="button-cancel"
                                onClick={() => setModalVisible(false)}
                            >
                                Annuler
                            </Button>
                            <Button
                                onClick={unlockSkill}
                                disabled={!isUnlockable}
                                className={`button-primary ${
                                    !isUnlockable ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                            >
                                Déverrouiller
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}