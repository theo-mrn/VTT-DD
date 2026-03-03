'use client';

import React, { useEffect, useRef } from 'react';
import { db, collection, onSnapshot, addDoc, serverTimestamp } from '@/lib/firebase';
import { useCharacter } from '@/contexts/CharacterContext';

type EventType =
    | 'creation'
    | 'combat'
    | 'mort'
    | 'niveau'
    | 'stats'
    | 'inventaire'
    | 'competence'
    | 'info';

interface GameEvent {
    type: EventType;
    message: string;
    characterId?: string;
    characterName?: string;
    details?: Record<string, any>;
}

interface HistoryTrackerProps {
    roomId: string;
    isMJ: boolean;
}

export default function HistoryTracker({ roomId, isMJ }: HistoryTrackerProps) {
    // Characters state to track differences
    const previousCharactersRef = useRef<Record<string, any>>({});
    const isInitialLoadRef = useRef(true);

    // Inventories state to track differences
    const previousInventoriesRef = useRef<Record<string, Record<string, any>>>({});

    const { characters } = useCharacter();

    // Helper to add an event to Firebase
    const logEvent = async (event: GameEvent) => {
        if (!roomId) return;
        try {
            await addDoc(collection(db, `Historique/${roomId}/events`), {
                ...event,
                timestamp: serverTimestamp()
            });
        } catch (err) {
            console.error("Erreur lors de l'enregistrement de l'historique:", err);
        }
    };

    // 1. Observer for Characters collection to detect changes (PV, creation, level up, stats)
    useEffect(() => {
        if (!roomId || !isMJ) return; // ONLY the MJ should run this tracking logic to avoid duplicating DB writes for all clients

        const charsRef = collection(db, `cartes/${roomId}/characters`);

        const unsubscribeChars = onSnapshot(charsRef, (snapshot) => {
            const currentChars: Record<string, any> = {};

            snapshot.forEach(doc => {
                currentChars[doc.id] = { id: doc.id, ...doc.data() };
            });

            // Don't log everything on first load
            if (isInitialLoadRef.current) {
                previousCharactersRef.current = currentChars;
                isInitialLoadRef.current = false;
                return;
            }

            const prevChars = previousCharactersRef.current;

            snapshot.docChanges().forEach((change) => {
                const char = change.doc.data();
                const id = change.doc.id;
                const name = char.Nomperso || 'Inconnu';
                const isPlayer = char.type === 'joueurs';

                if (change.type === 'removed') {
                    logEvent({
                        type: 'mort',
                        message: `${name} a été vaincu !`,
                        characterId: id,
                        characterName: name
                    });
                }
                else if (change.type === 'added') {
                    logEvent({
                        type: 'creation',
                        message: `${name} a rejoint l'aventure.`,
                        characterId: id,
                        characterName: name
                    });
                }
                else if (change.type === 'modified') {
                    const prev = prevChars[id];
                    if (!prev) return; // Par sécurité

                    // --- 2. MORT PAR PV ---
                    const prevPV = Number(prev.PV) || 0;
                    const currPV = Number(char.PV) || 0;

                    if (prevPV > 0 && currPV <= 0) {
                        logEvent({
                            type: 'mort',
                            message: `${name} a succombé à ses blessures !`,
                            characterId: id,
                            characterName: name
                        });
                    }
                    // --- 3. COMBAT / PV MODIFIÉS ---
                    else if (prevPV !== currPV && currPV > 0) {
                        const diff = currPV - prevPV;
                        const action = diff > 0 ? 'soigné' : 'attaqué';
                        const points = Math.abs(diff);

                        if (!isPlayer) {
                            logEvent({
                                type: 'combat',
                                message: `${name} a été ${action}.`,
                                characterId: id,
                                characterName: name
                            });
                        } else {
                            logEvent({
                                type: 'combat',
                                message: `${name} a ${diff > 0 ? "récupéré" : "perdu"} ${points} PV.`,
                                characterId: id,
                                characterName: name,
                                details: { diff, currPV }
                            });
                        }
                    }

                    // --- 4. JOUEURS UNIQUEMENT ---
                    if (isPlayer) {
                        // NIVEAU
                        const prevLevel = Number(prev.niveau) || 0;
                        const currLevel = Number(char.niveau) || 0;

                        if (currLevel > prevLevel) {
                            logEvent({
                                type: 'niveau',
                                message: `${name} a atteint le niveau ${currLevel} !`,
                                characterId: id,
                                characterName: name,
                                details: { level: currLevel }
                            });
                        }

                        // STATS
                        const statsToCheck = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA', 'Contact', 'Distance', 'Magie'];
                        const modifiedStats = [];

                        for (const stat of statsToCheck) {
                            const pStat = Number(prev[stat]) || 0;
                            const cStat = Number(char[stat]) || 0;
                            if (pStat !== cStat) {
                                const diff = cStat - pStat;
                                modifiedStats.push(`${stat} (${diff > 0 ? '+' : ''}${diff})`);
                            }
                        }

                        if (modifiedStats.length > 0) {
                            logEvent({
                                type: 'stats',
                                message: `${name} a vu ses statistiques modifiées : ${modifiedStats.join(', ')}.`,
                                characterId: id,
                                characterName: name,
                                details: { modifiedStats }
                            });
                        }

                        // COMPETENCES / VOIES
                        const voiesModifiees = [];
                        for (let i = 1; i <= 10; i++) {
                            const pV = Number(prev[`v${i}`]) || 0;
                            const cV = Number(char[`v${i}`]) || 0;
                            if (cV > pV && char[`Voie${i}`]) {
                                voiesModifiees.push(`Voie ${i} (Rang ${cV})`);
                            }
                        }

                        if (voiesModifiees.length > 0) {
                            logEvent({
                                type: 'competence',
                                message: `${name} a progressé dans ses apprentissages : ${voiesModifiees.join(', ')}.`,
                                characterId: id,
                                characterName: name
                            });
                        }
                    }
                }
            });

            previousCharactersRef.current = currentChars;
        });

        return () => unsubscribeChars();
    }, [roomId, isMJ]);


    // 2. Observer for Inventory for Players only
    useEffect(() => {
        if (!roomId || !isMJ || characters.length === 0) return; // ONLY the MJ should run this tracking logic

        const unsubscribes: (() => void)[] = [];

        // Only track players
        const players = characters.filter(c => c.type === 'joueurs');

        players.forEach(player => {
            const name = player.Nomperso;
            if (!name) return;

            const invRef = collection(db, `Inventaire/${roomId}/${name}`);
            const unsub = onSnapshot(invRef, (snapshot) => {
                const currentInv: Record<string, any> = {};
                snapshot.forEach(doc => {
                    currentInv[doc.id] = { id: doc.id, ...doc.data() };
                });

                // Init if first time
                if (!previousInventoriesRef.current[name]) {
                    previousInventoriesRef.current[name] = currentInv;
                    return;
                }

                const prevInv = previousInventoriesRef.current[name];

                // Check for new items or increased quantities
                for (const [id, item] of Object.entries(currentInv)) {
                    const prev = prevInv[id];
                    const itemName = item.message || 'un objet';
                    const currQty = Number(item.quantity) || 1;

                    // New object entirely
                    if (!prev) {
                        logEvent({
                            type: 'inventaire',
                            message: `${name} a reçu ${currQty}x [${itemName}] dans son inventaire.`,
                            characterId: player.id,
                            characterName: name
                        });
                    }
                    // Existing object, increased quantity
                    else {
                        const prevQty = Number(prev.quantity) || 1;
                        if (currQty > prevQty) {
                            const diff = currQty - prevQty;
                            logEvent({
                                type: 'inventaire',
                                message: `${name} a reçu ${diff}x [${itemName}] supplémentaire(s).`,
                                characterId: player.id,
                                characterName: name
                            });
                        }
                    }
                }

                previousInventoriesRef.current[name] = currentInv;
            });

            unsubscribes.push(unsub);
        });

        return () => {
            unsubscribes.forEach(unsub => unsub());
        };

    }, [roomId, isMJ, characters]);

    return null; // Headless component
}
