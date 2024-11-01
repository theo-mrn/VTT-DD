"use client";

import React, { useEffect, useState } from 'react';
import { auth, db, getDoc, onAuthStateChanged, doc, collection, getDocs, updateDoc } from '@/lib/firebase';

interface Character {
    id: string;
    Nomperso: string;
    Voie1: string;
    Voie2: string;
    Voie3: string;
    Voie4: string;
    Voie5: string;
    Voie6: string;
    v1: number;
    v2: number;
    v3: number;
    v4: number;
    v5: number;
    v6: number;
    type: string;
    niveau: number;
}

interface VoieData {
    Voie: string;
    Affichage1: string;
    Affichage2: string;
    Affichage3: string;
    Affichage4: string;
    Affichage5: string;
    rang1: string;
    rang2: string;
    rang3: string;
    rang4: string;
    rang5: string;
}

interface Skill {
    name: string;
    description: string;
    rank: number;
    voie: string;
}

const Competences: React.FC = () => {
    const [characters, setCharacters] = useState<Character[]>([]);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [voieData, setVoieData] = useState<{ [key: string]: VoieData }>({});
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
    const [totalPoints, setTotalPoints] = useState<number>(0);
    const [isModalVisible, setModalVisible] = useState(false);
    const [roomID, setRoomID] = useState<string | null>(null);
    const [isUnlockable, setIsUnlockable] = useState<boolean>(false);

    useEffect(() => {
        const loadUser = async () => {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    const userRef = doc(db, 'users', user.uid);
                    const userDoc = await getDoc(userRef);
                    if (userDoc.exists()) {
                        const roomID = userDoc.data()?.room_id;
                        setRoomID(roomID);
                        if (roomID) {
                            loadCharacters(roomID);
                        }
                    }
                }
            });
        };
        loadUser();
    }, []);

    const loadCharacters = async (roomID: string) => {
        const charactersRef = collection(db, `cartes/${roomID}/characters`);
        const characterDocs = await getDocs(charactersRef);
        const characterList: Character[] = [];

        characterDocs.forEach((doc) => {
            const data = doc.data() as Character;
            if (data.type === "joueurs") {
                const { id: _, ...characterData } = data; // exclude id from data
                characterList.push({ id: doc.id, ...characterData });
            }
        });

        setCharacters(characterList);
    };

    const selectCharacter = async (character: Character) => {
        setSelectedCharacter(character);
        setVoieData({});

        for (let j = 1; j <= 6; j++) {
            const voieFile = character[`Voie${j}` as keyof Character] as string;
            if (voieFile) {
                try {
                    const response = await fetch(`/tabs/${voieFile}`);
                    if (!response.ok) throw new Error("Failed to fetch");
                    const voieJson = await response.json();
                    setVoieData((prev) => ({ ...prev, [`Voie${j}`]: voieJson }));
                } catch (error) {
                    console.error("Error fetching voie data:", error);
                }
            }
        }
        calculateTotalPoints(character);
    };

    const calculateTotalPoints = (character: Character) => {
        const pointsFromLevel = 2 * (character.niveau ?? 0); // Using character.level instead of niveau
        let totalPointsLost = 0;

        for (let j = 1; j <= 6; j++) {
            const voieValue = Number(character[`v${j}` as keyof Character] ?? 0);
            totalPointsLost += j === 6 ? 2 * voieValue : voieValue <= 2 ? voieValue : 2 * (voieValue - 2) + 2;
        }
        setTotalPoints(pointsFromLevel - totalPointsLost);
    };

    const handleSkillClick = (name: string, description: string, rank: number, voie: string) => {
        const currentRank = Number(selectedCharacter?.[voie as keyof Character] ?? 0);
        const canUnlock = rank === 1 || currentRank >= rank - 1;

        setSelectedSkill({ name, description: description.replace(/<br>/g, '\n'), rank, voie });
        setIsUnlockable(canUnlock);
        setModalVisible(true);
    };

    const unlockSkill = async () => {
        if (selectedSkill && selectedCharacter && roomID) {
            const updatedCharacterData = { ...selectedCharacter, [selectedSkill.voie]: selectedSkill.rank };
            await updateDoc(doc(db, `cartes/${roomID}/characters`, selectedCharacter.id), updatedCharacterData);

            setSelectedCharacter(updatedCharacterData as Character);
            setModalVisible(false);
            calculateTotalPoints(updatedCharacterData as Character);
        }
    };
    const resetSkills = async () => {
        if (selectedCharacter && roomID) {
            const resetData: Partial<Character> = {
                ...selectedCharacter,
                v1: 0,
                v2: 0,
                v3: 0,
                v4: 0,
                v5: 0,
                v6: 0
            };
    
            await updateDoc(doc(db, `cartes/${roomID}/characters`, selectedCharacter.id), resetData);
            setSelectedCharacter(resetData as Character);
            calculateTotalPoints(resetData as Character);
        }
    };
    
    

    return (
        <div className="flex flex-col items-center text-white bg-black min-h-screen p-4">
            <h1 className="text-2xl font-bold mb-5">Choisissez un Personnage</h1>
            <div className="flex flex-wrap gap-4 mb-8">
                {characters.map((character) => (
                    <button
                        key={character.id}
                        onClick={() => selectCharacter(character)}
                        className="bg-[#7d5836] text-[#eae0c8] py-2 px-4 rounded-lg hover:bg-[#9a6b4d] transition"
                    >
                        {character.Nomperso}
                    </button>
                ))}
            </div>

            {selectedCharacter && (
                <>
                    <div id="characterInfo" className="mb-3">
                        {selectedCharacter.Nomperso} - {totalPoints} Points
                    </div>
                    <button
                        onClick={resetSkills}
                        className="bg-[#4c4c4c] text-[#d3d3d3] text-sm font-medium py-1 px-3 rounded mb-5"
                    >
                        Réinitialiser
                    </button>
                    <div id="tabContent" className="grid grid-cols-6 gap-4 max-w-5xl w-full">
                        {Array.from({ length: 6 }, (_, j) => {
                            const voie = voieData[`Voie${j + 1}`];
                            if (!voie) return null;

                            return (
                                <div key={j} className="skill-card bg-[#3b3a30] border border-[#8c7a6b] rounded-lg p-4">
                                    <h2 className="text-center mb-2 text-lg font-semibold">{voie.Voie || `Voie ${j + 1}`}</h2>
                                    {Array.from({ length: 5 }, (_, i) => {
                                        const isUnlocked = Number(selectedCharacter[`v${j + 1}` as keyof Character] ?? 0) >= i + 1;
                                        const skillName = voie[`Affichage${i + 1}` as keyof VoieData] as string;
                                        const skillDescription = voie[`rang${i + 1}` as keyof VoieData] as string;

                                        return (
                                            <div
                                                key={i}
                                                className={`skill-item mb-3 border-b border-[#8c7a6b] pb-2 ${isUnlocked ? 'text-white' : 'text-[#8c7a6b]'} cursor-pointer`}
                                                onClick={() => handleSkillClick(skillName, skillDescription, i + 1, `v${j + 1}`)}
                                            >
                                                {skillName}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {isModalVisible && selectedSkill && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="modal-content bg-white p-5 rounded-lg max-w-md w-full">
                        <span
                            className="close text-gray-400 hover:text-black cursor-pointer float-right text-2xl font-bold"
                            onClick={() => setModalVisible(false)}
                        >
                            &times;
                        </span>
                        <h2 id="modalSkillName" className="text-xl font-semibold mb-4 text-[#3b3a30]">{selectedSkill.name}</h2>
                        <p
                            id="modalDescription"
                            className="text-sm text-[#3b3a30] mb-4"
                            dangerouslySetInnerHTML={{ __html: selectedSkill.description.replace(/\n/g, '<br>') }}
                        />
                        <p id="modalPoints" className="text-sm text-[#3b3a30] mb-4">Points: {selectedSkill.rank <= 2 ? '1 point' : '2 points'}</p>
                        <div className="modal-actions flex justify-start mt-4">
                            <button
                                className="unlock-btn bg-[#eae0c8] text-[#3b3a30] font-bold py-2 px-4 rounded mr-4"
                                onClick={() => setModalVisible(false)}
                            >
                                Annuler
                            </button>
                            <button
                                className={`unlock-btn font-bold py-2 px-4 rounded ${isUnlockable ? 'bg-[#7d5836] text-[#eae0c8] cursor-pointer' : 'bg-gray-400 text-gray-200 cursor-not-allowed'}`}
                                onClick={isUnlockable ? unlockSkill : undefined}
                                disabled={!isUnlockable}
                            >
                                Déverrouiller
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Competences;
