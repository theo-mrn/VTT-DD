'use client';

import React, { useEffect, useRef } from 'react';
import { db, collection, onSnapshot, addDoc, serverTimestamp, doc } from '@/lib/firebase';
import { useCharacter } from '@/contexts/CharacterContext';

type EventType =
    | 'creation'
    | 'combat'
    | 'mort'
    | 'niveau'
    | 'stats'
    | 'inventaire'
    | 'competence'
    | 'note'
    | 'deplacement'
    | 'info';

interface GameEvent {
    type: EventType;
    message: string;
    characterId?: string;
    characterName?: string;
    characterAvatar?: string;
    targetUserId?: string;
    details?: Record<string, any>;
}

interface PendingMove {
    charId: string;
    name: string;
    avatar: string;
    cityId: string | null;
    timestamp: number;
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

    // City names for better messages
    const cityNamesRef = useRef<Record<string, string>>({});
    const previousGlobalCityIdRef = useRef<string | null>(null);

    // Buffering for movements
    const pendingMovesRef = useRef<PendingMove[]>([]);
    const bufferTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastGlobalMoveRef = useRef<{ cityId: string | null, timestamp: number } | null>(null);

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

    // Process buffered movement events
    const processPendingMoves = () => {
        if (pendingMovesRef.current.length === 0) return;

        const moves = [...pendingMovesRef.current];
        pendingMovesRef.current = [];

        // Group moves by destination (cityId)
        const groupedByCity: Record<string, PendingMove[]> = {};
        const returnedToGroup: PendingMove[] = [];

        moves.forEach(move => {
            if (move.cityId) {
                if (!groupedByCity[move.cityId]) groupedByCity[move.cityId] = [];
                groupedByCity[move.cityId].push(move);
            } else {
                returnedToGroup.push(move);
            }
        });

        // 1. Process moves to specific cities
        for (const [cityId, charMoves] of Object.entries(groupedByCity)) {
            // Check if this matches a very recent global move (suppression)
            const globalMove = lastGlobalMoveRef.current;
            if (globalMove && globalMove.cityId === cityId && (Date.now() - globalMove.timestamp < 3000)) {
                // Suppress: it's part of the group move already logged
                continue;
            }

            const cityName = cityNamesRef.current[cityId] || 'un nouveau lieu';
            const names = charMoves.map(m => m.name);

            let message = '';
            if (names.length === 1) {
                message = `${names[0]} a été déplacé vers : ${cityName}.`;
            } else if (names.length === 2) {
                message = `${names[0]} et ${names[1]} ont été déplacés vers : ${cityName}.`;
            } else {
                const last = names.pop();
                message = `${names.join(', ')} et ${last} ont été déplacés vers : ${cityName}.`;
            }

            logEvent({
                type: 'deplacement',
                message,
                // Only attach character info if it's a single person
                ...(charMoves.length === 1 ? {
                    characterId: charMoves[0].charId,
                    characterName: charMoves[0].name,
                    characterAvatar: charMoves[0].avatar
                } : {})
            });
        }

        // 2. Process returns to group
        if (returnedToGroup.length > 0) {
            const names = returnedToGroup.map(m => m.name);
            let message = '';
            if (names.length === 1) {
                message = `${names[0]} a rejoint le groupe.`;
            } else if (names.length === 2) {
                message = `${names[0]} et ${names[1]} ont rejoint le groupe.`;
            } else {
                const last = names.pop();
                message = `${names.join(', ')} et ${last} ont rejoint le groupe.`;
            }

            logEvent({
                type: 'deplacement',
                message,
                ...(returnedToGroup.length === 1 ? {
                    characterId: returnedToGroup[0].charId,
                    characterName: returnedToGroup[0].name,
                    characterAvatar: returnedToGroup[0].avatar
                } : {})
            });
        }
    };

    // 1. Observer for Characters collection
    useEffect(() => {
        if (!roomId || !isMJ) return;

        const charsRef = collection(db, `cartes/${roomId}/characters`);
        const unsubscribeChars = onSnapshot(charsRef, (snapshot) => {
            const currentChars: Record<string, any> = {};

            snapshot.forEach(docSnap => {
                currentChars[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
            });

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

                const rawImage = char.imageURL2 || char.imageURLFinal || char.image || char.imageUrl || char.imageURL;
                const avatar = typeof rawImage === 'object' && rawImage?.src ? rawImage.src : (typeof rawImage === 'string' ? rawImage : '');

                if (change.type === 'removed') {
                    logEvent({ type: 'mort', message: `${name} a été vaincu !`, characterId: id, characterName: name, characterAvatar: avatar });
                }
                else if (change.type === 'added') {
                    logEvent({ type: 'creation', message: `${name} a rejoint l'aventure.`, characterId: id, characterName: name, characterAvatar: avatar });
                }
                else if (change.type === 'modified') {
                    const prev = prevChars[id];
                    if (!prev) return;

                    // PV, Level, Stats tracking (simplified for space)
                    const prevPV = Number(prev.PV) || 0;
                    const currPV = Number(char.PV) || 0;
                    if (prevPV > 0 && currPV <= 0) logEvent({ type: 'mort', message: `${name} a succombé à ses blessures !`, characterId: id, characterName: name, characterAvatar: avatar });
                    else if (prevPV !== currPV && currPV > 0) {
                        const action = (currPV - prevPV) > 0 ? 'soigné' : 'attaqué';
                        if (!isPlayer) logEvent({ type: 'combat', message: `${name} a été ${action}.`, characterId: id, characterName: name, characterAvatar: avatar });
                        else logEvent({ type: 'combat', message: `${name} a ${currPV > prevPV ? "récupéré" : "perdu"} ${Math.abs(currPV - prevPV)} PV.`, characterId: id, characterName: name, characterAvatar: avatar });
                    }

                    if (isPlayer) {
                        const prevLevel = Number(prev.niveau) || 0;
                        const currLevel = Number(char.niveau) || 0;
                        if (currLevel > prevLevel) logEvent({ type: 'niveau', message: `${name} a atteint le niveau ${currLevel} !`, characterId: id, characterName: name, characterAvatar: avatar });

                        const statsToCheck = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA', 'Contact', 'Distance', 'Magie'];
                        const modifiedStats = [];
                        for (const stat of statsToCheck) {
                            const pStat = Number(prev[stat]) || 0;
                            const cStat = Number(char[stat]) || 0;
                            if (pStat !== cStat) modifiedStats.push(`${stat} (${cStat > pStat ? '+' : ''}${cStat - pStat})`);
                        }
                        if (modifiedStats.length > 0) logEvent({ type: 'stats', message: `${name} a vu ses statistiques modifiées : ${modifiedStats.join(', ')}.`, characterId: id, characterName: name, characterAvatar: avatar });

                        // DEPLACEMENT (currentSceneId) -> BUFFERED
                        const prevSceneId = prev.currentSceneId || null;
                        const currSceneId = char.currentSceneId || null;

                        if (prevSceneId !== currSceneId) {
                            pendingMovesRef.current.push({ charId: id, name, avatar, cityId: currSceneId, timestamp: Date.now() });
                            if (bufferTimeoutRef.current) clearTimeout(bufferTimeoutRef.current);
                            bufferTimeoutRef.current = setTimeout(processPendingMoves, 800);
                        }
                    }
                }
            });

            previousCharactersRef.current = currentChars;
        });

        return () => unsubscribeChars();
    }, [roomId, isMJ]);

    // 2. Observer for Cities
    useEffect(() => {
        if (!roomId || !isMJ) return;
        const citiesRef = collection(db, `cartes/${roomId}/cities`);
        const unsubscribeCities = onSnapshot(citiesRef, (snapshot) => {
            const names: Record<string, string> = {};
            snapshot.forEach(docSnap => { names[docSnap.id] = docSnap.data().name || 'Lieu inconnu'; });
            cityNamesRef.current = names;
        });
        return () => unsubscribeCities();
    }, [roomId, isMJ]);

    // 3. Observer for Global Settings (Group Location)
    useEffect(() => {
        if (!roomId || !isMJ) return;
        const settingsRef = doc(db, `cartes/${roomId}/settings/general`);
        const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            const currentCityId = data.currentCityId;
            const prevCityId = previousGlobalCityIdRef.current;

            if (prevCityId !== null && currentCityId !== prevCityId) {
                const cityName = cityNamesRef.current[currentCityId] || 'une nouvelle zone';

                // Track global move for suppression logic
                lastGlobalMoveRef.current = { cityId: currentCityId, timestamp: Date.now() };

                logEvent({
                    type: 'deplacement',
                    message: `Le groupe s'est déplacé vers : ${cityName}.`,
                });
            }
            previousGlobalCityIdRef.current = currentCityId;
        });
        return () => unsubscribeSettings();
    }, [roomId, isMJ]);

    // 4. Observer for Inventory
    useEffect(() => {
        if (!roomId || !isMJ || characters.length === 0) return;
        const unsubscribes: (() => void)[] = [];
        const players = characters.filter(c => c.type === 'joueurs');
        players.forEach(player => {
            const name = player.Nomperso;
            if (!name) return;
            const rawImage = player.imageURL2 || player.imageURLFinal || player.image || player.imageUrl || player.imageURL;
            const avatar = typeof rawImage === 'object' && rawImage?.src ? rawImage.src : (typeof rawImage === 'string' ? rawImage : '');
            const invRef = collection(db, `Inventaire/${roomId}/${name}`);
            const unsub = onSnapshot(invRef, (snapshot) => {
                const currentInv: Record<string, any> = {};
                snapshot.forEach(docSnap => { currentInv[docSnap.id] = { id: docSnap.id, ...docSnap.data() }; });
                if (!previousInventoriesRef.current[name]) { previousInventoriesRef.current[name] = currentInv; return; }
                const prevInv = previousInventoriesRef.current[name];
                for (const [id, item] of Object.entries(currentInv)) {
                    const prev = prevInv[id];
                    const itemName = item.message || 'un objet';
                    const currQty = Number(item.quantity) || 1;
                    if (!prev) logEvent({ type: 'inventaire', message: `${name} a reçu ${currQty}x [${itemName}] dans son inventaire.`, characterId: player.id, characterName: name, characterAvatar: avatar });
                    else if (currQty > (Number(prev.quantity) || 1)) logEvent({ type: 'inventaire', message: `${name} a reçu ${currQty - (Number(prev.quantity) || 1)}x [${itemName}] supplémentaire(s).`, characterId: player.id, characterName: name, characterAvatar: avatar });
                }
                previousInventoriesRef.current[name] = currentInv;
            });
            unsubscribes.push(unsub);
        });
        return () => unsubscribes.forEach(unsub => unsub());
    }, [roomId, isMJ, characters]);

    return null;
}
