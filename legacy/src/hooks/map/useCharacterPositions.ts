/**
 * useCharacterPositions.ts — Hook RTDB pour les positions des personnages
 *
 * Remplace les lectures de positions depuis Firestore par un listener unique
 * sur Firebase Realtime Database, réduisant drastiquement les coûts de lecture.
 *
 * Structure RTDB : rooms/{roomId}/positions/{characterId}
 *   { x, y, positions?: { [cityId]: { x, y } } }
 */

import { useEffect, useRef, useCallback } from 'react';
import { ref, onValue, update, get } from 'firebase/database';
import { collection, getDocs } from 'firebase/firestore';
import { realtimeDb, db } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CharacterPositionData {
    x: number;
    y: number;
    positions?: Record<string, { x: number; y: number }>;
}

export type PositionsMap = Record<string, CharacterPositionData>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCharacterPositions(
    roomId: string,
    onPositionsChange: () => void
) {
    const positionsRef = useRef<PositionsMap>({});
    const onChangeRef = useRef(onPositionsChange);
    useEffect(() => { onChangeRef.current = onPositionsChange; });

    // ─── Listener unique sur toutes les positions ────────────────────────────
    useEffect(() => {
        if (!roomId) return;
        const rtdbRef = ref(realtimeDb, `rooms/${roomId}/positions`);

        const unsubscribe = onValue(rtdbRef, (snapshot) => {
            const data = snapshot.val() as PositionsMap | null;
            positionsRef.current = data || {};
            onChangeRef.current();
        });

        return () => unsubscribe();
    }, [roomId]);

    // ─── Migration one-shot : Firestore → RTDB ──────────────────────────────
    useEffect(() => {
        if (!roomId) return;

        const migrateRef = ref(realtimeDb, `rooms/${roomId}/positions/_migrated`);

        get(migrateRef).then(async (snapshot) => {
            if (snapshot.val()) return; // déjà migré

            console.log('[RTDB Migration] Seeding positions from Firestore...');

            const charsSnapshot = await getDocs(collection(db, 'cartes', roomId, 'characters'));
            const updates: Record<string, any> = {};

            charsSnapshot.docs.forEach(doc => {
                const data = doc.data();
                const posData: any = { x: data.x || 0, y: data.y || 0 };
                if (data.positions) posData.positions = data.positions;
                updates[doc.id] = posData;
            });

            updates['_migrated'] = true;

            const rootRef = ref(realtimeDb, `rooms/${roomId}/positions`);
            await update(rootRef, updates);

            console.log(`[RTDB Migration] Seeded ${charsSnapshot.docs.length} character positions`);
        }).catch(err => {
            console.error('[RTDB Migration] Error:', err);
        });
    }, [roomId]);

    // ─── Écriture : position world map ───────────────────────────────────────
    const updateCharacterPosition = useCallback(async (
        characterId: string,
        pos: { x: number; y: number }
    ) => {
        if (!roomId) return;
        const charPosRef = ref(realtimeDb, `rooms/${roomId}/positions/${characterId}`);
        await update(charPosRef, pos);
    }, [roomId]);

    // ─── Écriture : position spécifique à une ville ──────────────────────────
    const updateCityPosition = useCallback(async (
        characterId: string,
        cityId: string,
        x: number,
        y: number
    ) => {
        if (!roomId) return;
        const cityPosRef = ref(realtimeDb, `rooms/${roomId}/positions/${characterId}/positions/${cityId}`);
        await update(cityPosRef, { x, y });
    }, [roomId]);

    return {
        positionsRef,
        updateCharacterPosition,
        updateCityPosition,
    };
}
