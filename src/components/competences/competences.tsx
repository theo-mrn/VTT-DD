'use client'

import React, { useEffect, useState } from 'react'
import { auth, db, getDoc, onAuthStateChanged, doc, collection, getDocs, updateDoc } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Swords, BookOpen, FileText, Edit, Dice5, List, Music } from "lucide-react"

interface Character {
    id: string
    Nomperso: string
    Voie1: string
    Voie2: string
    Voie3: string
    Voie4: string
    Voie5: string
    Voie6: string
    v1: number
    v2: number
    v3: number
    v4: number
    v5: number
    v6: number
    type: string
    niveau: number
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

export default function Competences() {
    const [characters, setCharacters] = useState<Character[]>([])
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
    const [voieData, setVoieData] = useState<Record<string, VoieData>>({})
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
    const [totalPoints, setTotalPoints] = useState(0)
    const [isModalVisible, setModalVisible] = useState(false)
    const [isUnlockable, setIsUnlockable] = useState(false)
    const [roomID, setRoomID] = useState<string | null>(null)

    useEffect(() => {
        const loadUser = async () => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    const userRef = doc(db, 'users', user.uid)
                    const userDoc = await getDoc(userRef)
                    if (userDoc.exists()) {
                        const roomID = userDoc.data()?.room_id
                        setRoomID(roomID)
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
                const { id: _, ...characterData } = data // exclude id from data
                characterList.push({ id: doc.id, ...characterData })
            }
        })

        setCharacters(characterList)
    }

    const selectCharacter = async (character: Character) => {
        setSelectedCharacter(character)
        setVoieData({})

        await Promise.all(
            Array.from({ length: 6 }, async (_, j) => {
                const voieFile = character[`Voie${j + 1}` as keyof Character] as string
                if (voieFile) {
                    try {
                        const response = await fetch(`/tabs/${voieFile}`)
                        if (!response.ok) throw new Error('Failed to fetch')
                        const voieJson = await response.json()
                        setVoieData(prev => ({ ...prev, [`Voie${j + 1}`]: voieJson }))
                    } catch (error) {
                        console.error('Error fetching voie data:', error)
                    }
                }
            })
        )

        calculateTotalPoints(character)
    }

    const calculateTotalPoints = (character: Character) => {
        // S'assurer que `niveau` est un entier
        const pointsFromLevel = 2 * (character.niveau ?? 0)
    
        // Calcul des points perdus en fonction des valeurs de `v`
        const totalPointsLost = Object.entries(character)
            .filter(([key]) => key.startsWith('v')) // On prend uniquement les clés qui commencent par 'v'
            .reduce((total, [key, value]) => {
                const voieValue = Number(value ?? 0) // Convertir la valeur en nombre pour éviter NaN
                let pointsLost = 0
    
                if (key === 'v6') {
                    // Pour la Voie6, chaque niveau coûte 2 points
                    pointsLost = voieValue * 2
                } else {
                    // Pour les autres voies, appliquer la règle standard
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
                }
    
                return total + pointsLost
            }, 0)
    
        // Calcul des points totaux disponibles
        setTotalPoints(pointsFromLevel - totalPointsLost)
    }
    
    

    const handleSkillClick = (name: string, description: string, rank: number, voie: string) => {
        const currentRank = Number(selectedCharacter?.[voie as keyof Character] ?? 0)
        const canUnlock = rank === 1 || currentRank >= rank - 1

        setSelectedSkill({ name, description: description.replace(/<br>/g, '\n'), rank, voie })
        setIsUnlockable(canUnlock)
        setModalVisible(true)
    }

    const unlockSkill = async () => {
        if (selectedSkill && selectedCharacter && roomID) {
            const updatedCharacterData = { ...selectedCharacter, [selectedSkill.voie]: selectedSkill.rank }
            await updateDoc(doc(db, `cartes/${roomID}/characters`, selectedCharacter.id), updatedCharacterData)

            setSelectedCharacter(updatedCharacterData)
            setModalVisible(false)
            calculateTotalPoints(updatedCharacterData)
        }
    }

    const resetSkills = async () => {
        if (selectedCharacter && roomID) {
            const resetData: Partial<Character> = {
                ...selectedCharacter,
                v1: 0, v2: 0, v3: 0, v4: 0, v5: 0, v6: 0
            }

            await updateDoc(doc(db, `cartes/${roomID}/characters`, selectedCharacter.id), resetData)
            setSelectedCharacter(resetData as Character)
            calculateTotalPoints(resetData as Character)
        }
    }

    return (
        <div className="flex flex-col items-center bg-[#242424] text-[#d4d4d4] min-h-screen p-4">
            <h1 className="text-2xl font-bold mb-5 text-[#c0a080]">Choisissez un Personnage</h1>
            <div className="flex flex-wrap gap-4 mb-8">
                {characters.map((character) => (
                    <Button
                        key={character.id}
                        onClick={() => selectCharacter(character)}
                        variant="outline"
                        className="bg-[#3a3a3a] text-black hover:bg-[#4a4a4a] hover:text-[#c0a080]"
                    >
                        {character.Nomperso}
                    </Button>
                ))}
            </div>

            {selectedCharacter && (
                <>
                    <div id="characterInfo" className="mb-3 text-[#c0a080]">
                        {selectedCharacter.Nomperso} - {totalPoints} Points
                    </div>
                    <Button 
                        onClick={resetSkills} 
                        variant="outline" 
                        className="mb-5 bg-[#3a3a3a] text-black hover:bg-[#4a4a4a] hover:text-[#c0a080]"
                    >
                        Réinitialiser
                    </Button>
                    <div id="tabContent" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl w-full">
                        {Array.from({ length: 6 }, (_, j) => {
                            const voie = voieData[`Voie${j + 1}`]
                            if (!voie) return null

                            return (
                                <Card key={j} className="bg-[#3a3a3a] border-[#4a4a4a]">
                                    <CardHeader>
                                        <CardTitle className="text-[#c0a080]">{voie.Voie || `Voie ${j + 1}`}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        {Array.from({ length: 5 }, (_, i) => {
                                            const isUnlocked = Number(selectedCharacter[`v${j + 1}` as keyof Character] ?? 0) >= i + 1
                                            const skillName = voie[`Affichage${i + 1}` as keyof VoieData] as string
                                            const skillDescription = voie[`rang${i + 1}` as keyof VoieData] as string

                                            return (
                                                <div
                                                    key={i}
                                                    className={`skill-item mb-3 border-b border-[#4a4a4a] pb-2 ${
                                                        isUnlocked ? 'text-[#c0a080]' : 'text-[#8a8a8a]'
                                                    } cursor-pointer hover:text-[#d4d4d4]`}
                                                    onClick={() => handleSkillClick(skillName, skillDescription, i + 1, `v${j + 1}`)}
                                                >
                                                    {skillName}
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
                <DialogContent className="bg-[#3a3a3a] text-white max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#c0a080]">{selectedSkill?.name}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-white mb-4 whitespace-pre-line">
                        {selectedSkill?.description}
                    </p>
                    <p className="text-sm text-white] mb-4">
                        Points: {selectedSkill && (selectedSkill.rank <= 2 ? '1 point' : '2 points')}
                    </p>
                    <DialogFooter>
                        <Button 
                            variant="outline" 
                            onClick={() => setModalVisible(false)}
                            className="bg-[#4a4a4a] text-white hover:bg-[#5a5a5a] hover:text-[#c0a080]"
                        >
                            Annuler
                        </Button>
                        <Button
                            onClick={unlockSkill}
                            disabled={!isUnlockable}
                            className={`bg-[#4a4a4a] text-white hover:bg-[#5a5a5a] hover:text-[#c0a080] ${
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