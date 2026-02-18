'use client'

import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { auth, db, getDoc, onAuthStateChanged, doc, collection, getDocs, updateDoc } from '@/lib/firebase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'

const ChangeComponent = dynamic(() => import('@/components/(competences)/change'), {
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

interface CompetencesProps {
    preSelectedCharacterId?: string
    onClose?: () => void
}

export default function Competences({ preSelectedCharacterId, onClose }: CompetencesProps) {
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
    const [userRole, setUserRole] = useState<string | null>(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)

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
                        const role = userData?.role
                        setRoomID(roomID)
                        setUserPersoId(persoId)
                        setUserRole(role)
                        if (roomID) {
                            await loadCharacters(roomID, persoId)
                        }
                    }
                }
            })
        }
        loadUser()
    }, [preSelectedCharacterId])

    const loadCharacters = async (roomID: string, persoId?: string) => {
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

        // Si un personnage est pré-sélectionné, le sélectionner automatiquement
        if (preSelectedCharacterId) {
            const preSelected = characterList.find(char => char.id === preSelectedCharacterId)
            if (preSelected) {
                await selectCharacter(preSelected)
            }
        }
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
        const isAlreadyUnlocked = currentRank >= rank
        const canUnlock = (rank === 1 || currentRank >= rank - 1) && !isAlreadyUnlocked
        const isOwnCharacter = selectedCharacter?.id === userPersoId

        setSelectedSkill({ name, description: description.replace(/<br>/g, '\n'), rank, voie })
        setIsUnlockable(canUnlock && isOwnCharacter)
        setModalVisible(true)
    }

    const unlockSkill = async () => {
        if (selectedSkill && selectedCharacter && roomID && selectedCharacter.id === userPersoId) {
            try {
                const updatedCharacterData = { ...selectedCharacter, [selectedSkill.voie]: selectedSkill.rank }
                await updateDoc(doc(db, `cartes/${roomID}/characters`, selectedCharacter.id), updatedCharacterData)

                setSelectedCharacter(updatedCharacterData)
                setModalVisible(false)
                calculateTotalPoints(updatedCharacterData)

                toast.success('Compétence débloquée', {
                    description: selectedSkill.name,
                    duration: 2000,
                })

                // Émettre un événement pour notifier les autres composants de la mise à jour
                window.dispatchEvent(new CustomEvent('competences-updated', {
                    detail: {
                        characterId: selectedCharacter.id,
                        roomId: roomID
                    }
                }))
            } catch (error) {
                console.error('Erreur lors du déblocage de la compétence:', error)
                toast.error('Erreur', {
                    description: "Impossible de débloquer la compétence.",
                    duration: 3000,
                })
            }
        }
    }

    const resetSkills = async () => {
        if (selectedCharacter && roomID && selectedCharacter.id === userPersoId) {
            try {
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

                toast.success('Compétences réinitialisées', {
                    description: `${selectedCharacter.Nomperso} : toutes les compétences ont été réinitialisées.`,
                    duration: 2000,
                })

                // Émettre un événement pour notifier les autres composants de la mise à jour
                window.dispatchEvent(new CustomEvent('competences-updated', {
                    detail: {
                        characterId: selectedCharacter.id,
                        roomId: roomID
                    }
                }))
            } catch (error) {
                console.error('Erreur lors de la réinitialisation:', error)
                toast.error('Erreur', {
                    description: "Impossible de réinitialiser les compétences.",
                    duration: 3000,
                })
            }
        }
    }

    if (showChangeComponent) {
        return <ChangeComponent
            characterId={selectedCharacter?.id}
            roomId={roomID || undefined}
            onClose={async () => {
                setShowChangeComponent(false)
                // Recharger les données du personnage depuis Firestore
                if (selectedCharacter && roomID) {
                    // Recharger le personnage depuis Firestore pour avoir les données à jour
                    const characterRef = doc(db, `cartes/${roomID}/characters/${selectedCharacter.id}`)
                    const characterDoc = await getDoc(characterRef)
                    if (characterDoc.exists()) {
                        const updatedCharacter = { id: selectedCharacter.id, ...characterDoc.data() } as Character
                        await selectCharacter(updatedCharacter)

                        // Attendre un court instant pour que Firestore se synchronise
                        await new Promise(resolve => setTimeout(resolve, 100))

                        // Émettre un événement personnalisé pour notifier competencesD de recharger depuis Firestore
                        window.dispatchEvent(new CustomEvent('competences-updated', {
                            detail: {
                                characterId: selectedCharacter.id,
                                roomId: roomID
                            }
                        }))
                    }
                }
            }} />
    }

    return (
        <div className="flex flex-col items-center bg-[var(--bg-dark)] text-[var(--text-primary)] min-h-screen p-4">
            {onClose && (
                <div className="w-full max-w-5xl mb-4 flex justify-end">
                    <Button onClick={onClose} className="button-cancel">
                        Fermer
                    </Button>
                </div>
            )}
            {!preSelectedCharacterId && (
                <>
                    <h1 className="text-2xl font-bold mb-5 text-[var(--accent-brown)]">Choisissez un Personnage</h1>
                    <div className="flex flex-wrap gap-4 mb-8">
                        {characters.map((character) => (
                            <Button
                                key={character.id}
                                onClick={() => selectCharacter(character)}
                                className={`button-primary ${character.id === userPersoId ? 'ring-2 ring-[var(--accent-brown)]' : ''
                                    }`}
                                title={character.id === userPersoId ? 'Votre personnage' : 'Personnage d\'un autre joueur (lecture seule)'}
                            >
                                {character.Nomperso}
                                {character.id === userPersoId && ' ⭐'}
                            </Button>
                        ))}
                    </div>
                </>
            )}

            {selectedCharacter && (
                <>
                    <div id="characterInfo" className="mb-3 text-[var(--accent-brown)]">
                        {selectedCharacter.Nomperso} - {totalPoints} Points
                    </div>
                    <div className="flex gap-4 mb-5">
                        <Button
                            onClick={resetSkills}
                            disabled={selectedCharacter?.id !== userPersoId}
                            className={`button-secondary ${selectedCharacter?.id !== userPersoId ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                        >
                            Réinitialiser
                        </Button>
                        {(selectedCharacter?.id === userPersoId || userRole === 'MJ') && (
                            <Button
                                onClick={() => setShowChangeComponent(true)}
                                className="button-primary"
                            >
                                Gérer les Voies
                            </Button>
                        )}
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
                                                    className={`skill-item mb-3 border-b border-[var(--border-color)] pb-2 ${isUnlocked ? 'text-[var(--accent-brown)]' : 'text-[var(--text-secondary)]'
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
                    <DialogContent className="bg-transparent border-none shadow-none p-0 max-w-lg">
                        <DialogTitle className="sr-only">
                            {selectedSkill?.name}
                        </DialogTitle>
                        {selectedSkill && (
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)]">
                                        {selectedSkill.name}
                                    </h2>
                                    <div className={`px-2 py-1 rounded text-xs font-semibold border ${selectedCharacter && Number(selectedCharacter[selectedSkill.voie as keyof Character] ?? 0) >= selectedSkill.rank
                                        ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                        : 'bg-[var(--accent-brown)]/10 text-[var(--accent-brown)] border-[var(--accent-brown)]/20'
                                        }`}>
                                        Rang {selectedSkill.rank}
                                    </div>
                                </div>

                                <div className="my-6 text-[var(--text-primary)] leading-relaxed whitespace-pre-line">
                                    {selectedSkill.description}
                                </div>

                                <div className="flex items-center justify-between mt-8 pt-4 border-t border-black/5 dark:border-white/5">
                                    <div className="text-sm text-[var(--text-secondary)]">
                                        Coût: <strong>{selectedSkill.rank <= 2 ? '1 point' : '2 points'}</strong>
                                    </div>

                                    <div className="flex gap-3">
                                        <Button
                                            variant="ghost"
                                            onClick={() => setModalVisible(false)}
                                            className="hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        >
                                            Fermer
                                        </Button>

                                        {selectedCharacter?.id === userPersoId ? (
                                            <Button
                                                onClick={unlockSkill}
                                                disabled={!isUnlockable}
                                                className={`relative overflow-hidden transition-all duration-300 ${!isUnlockable
                                                    ? 'opacity-50 cursor-not-allowed bg-[var(--bg-darker)]'
                                                    : 'bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-brown-hover)] hover:shadow-lg hover:shadow-[var(--accent-brown)]/20 text-[var(--bg-dark)] font-bold'
                                                    }`}
                                            >
                                                {selectedCharacter && Number(selectedCharacter[selectedSkill.voie as keyof Character] ?? 0) >= selectedSkill.rank
                                                    ? 'Déjà acquis'
                                                    : 'Débloquer'
                                                }
                                            </Button>
                                        ) : (
                                            <div className="text-xs text-[var(--text-secondary)] italic flex items-center">
                                                Lecture seule
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}