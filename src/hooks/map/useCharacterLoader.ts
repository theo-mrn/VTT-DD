/**
 * useCharacterLoader.ts — Centralises character parsing, merging,
 * and RTDB position overlay logic.
 *
 * Responsibilities:
 *  1. Parse raw Firestore character docs into `Character` objects
 *  2. Merge global players + per-city NPCs, deduplicate, filter by scene
 *  3. Overlay real-time positions from RTDB (via useCharacterPositions)
 *  4. Expose stable refs (`parseCharacterDocRef`, `mergeAndSetCharactersRef`)
 *     that useMapData can call when Firestore snapshots arrive
 *
 * NOTE: The actual Firestore listeners live in useMapData. This hook only owns
 * the *parsing* and *merging* pipeline plus the RTDB position layer.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    useCharacterPositions,
    type PositionsMap,
} from '@/hooks/map/useCharacterPositions';
import type { Character } from '@/app/[roomid]/map/types';

// ─── Return type ─────────────────────────────────────────────────────────────

export interface UseCharacterLoaderReturn {
    /** Current merged characters (players + NPCs with RTDB positions applied). */
    characters: Character[];
    setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;

    /** Loading flag — cleared after the first merge. */
    loading: boolean;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;

    /** Raw Firestore player docs (set by useMapData listener). */
    loadedPlayersRef: React.MutableRefObject<any[]>;
    /** Parsed NPC characters for the current city (set by useMapData listener). */
    loadedNPCsRef: React.MutableRefObject<Character[]>;
    /** Bumped by useMapData when the players snapshot fires. */
    playersVersion: number;
    setPlayersVersion: React.Dispatch<React.SetStateAction<number>>;

    /** Stable ref to the current `parseCharacterDoc` — safe to call from listeners. */
    parseCharacterDocRef: React.MutableRefObject<(doc: any, cityId: string | null) => Character>;
    /** Stable ref to the current `mergeAndSetCharacters` — safe to call from listeners. */
    mergeAndSetCharactersRef: React.MutableRefObject<() => void>;

    /** Ref kept in sync with `selectedCityId` for use inside callbacks. */
    selectedCityIdRef: React.MutableRefObject<string | null>;

    /** RTDB positions ref (from useCharacterPositions). */
    rtdbPositionsRef: React.MutableRefObject<PositionsMap>;

    /** Write helpers forwarded from useCharacterPositions. */
    updateCharacterPosition: (characterId: string, pos: { x: number; y: number }) => Promise<void>;
    updateCityPosition: (characterId: string, cityId: string, x: number, y: number) => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCharacterLoader(
    roomId: string,
    selectedCityId: string | null,
    globalCityId: string | null,
): UseCharacterLoaderReturn {
    // ─── State ───────────────────────────────────────────────────────────────
    const [characters, setCharacters] = useState<Character[]>([]);
    const [loading, setLoading] = useState(true);
    const [playersVersion, setPlayersVersion] = useState(0);

    // Raw storage filled by useMapData listeners
    const loadedPlayersRef = useRef<any[]>([]);
    const loadedNPCsRef = useRef<Character[]>([]);

    // ─── RTDB real-time positions ────────────────────────────────────────────
    const rtdbPositionsRef = useRef<PositionsMap>({});
    const mergeAndSetCharactersRtdbRef = useRef<() => void>(() => {});

    const {
        positionsRef: _rtdbPosRef,
        updateCharacterPosition,
        updateCityPosition,
    } = useCharacterPositions(roomId, () => {
        mergeAndSetCharactersRtdbRef.current();
    });

    // Keep local ref in sync with the hook's ref
    useEffect(() => {
        rtdbPositionsRef.current = _rtdbPosRef.current;
    });

    // ─── Ref for selectedCityId (avoids re-subscribing listeners) ────────────
    const selectedCityIdRef = useRef(selectedCityId);

    // ─── parseCharacterDoc ───────────────────────────────────────────────────
    const parseCharacterDoc = useCallback(
        (doc: any, cityId: string | null): Character => {
            const data = doc.data();
            const img = new Image();
            let imageUrl = '';
            if (data.type === 'joueurs') {
                imageUrl = data.imageURLFinal || data.imageURL2 || data.imageURL;
            } else {
                imageUrl = data.imageURL2 || data.imageURL;
            }
            if (imageUrl) img.src = imageUrl;

            let charX = data.x || 0;
            let charY = data.y || 0;
            if (cityId && data.positions && data.positions[cityId]) {
                charX = data.positions[cityId].x;
                charY = data.positions[cityId].y;
            }

            const charObj: any = {
                id: doc.id,
                currentSceneId: data.currentSceneId,
                niveau: data.niveau || 1,
                name: data.Nomperso || '',
                x: charX,
                y: charY,
                image: img,
                imageUrl: imageUrl,
                visibility: data.visibility || 'hidden',
                visibilityRadius: (() => {
                    const val = parseFloat(data.visibilityRadius);
                    if (val > 2000) return 2000; // Safety cap
                    return isNaN(val) ? 100 : val;
                })(),
                visibleToPlayerIds: data.visibleToPlayerIds || undefined,
                type: data.type || 'pnj',
                PV: data.PV || 0,
                PV_Max: data.PV_Max || data.PV || 10,
                Defense: data.Defense || 5,
                Contact: data.Contact || 5,
                Distance: data.Distance || 5,
                Magie: data.Magie || 5,
                INIT: data.INIT || 5,
                FOR: data.FOR || 0,
                DEX: data.DEX || 0,
                CON: data.CON || 0,
                SAG: data.SAG || 0,
                INT: data.INT || 0,
                CHA: data.CHA || 0,
                conditions: data.conditions || [],
                scale: data.scale || 1,
                Actions: data.Actions || [],
                audio: data.audio || undefined,
                interactions: data.interactions || undefined,
                shape: data.shape || 'circle',
                notes: data.notes || undefined,
            };
            return charObj;
        },
        [],
    );

    // ─── mergeAndSetCharacters ───────────────────────────────────────────────
    const mergeAndSetCharacters = useCallback(() => {
        const visibleIds = new Set<string>();
        const combined: Character[] = [];

        const currentCityId = selectedCityIdRef.current;
        const rtdbPositions = _rtdbPosRef.current;

        // Parse global players dynamically
        const parsedPlayers = loadedPlayersRef.current.map((doc) =>
            parseCharacterDoc(doc, currentCityId),
        );

        // Filter players by scene visibility
        const visiblePlayers = parsedPlayers.filter((player) => {
            if (player.currentSceneId === currentCityId) return true;
            if (!player.currentSceneId && globalCityId === currentCityId) return true;
            return false;
        });

        // Apply RTDB position overlay
        const applyRtdbPositions = (chars: Character[]): Character[] => {
            return chars.map((char) => {
                const rtdbPos = rtdbPositions[char.id];
                if (!rtdbPos) return char;

                let x = rtdbPos.x ?? char.x;
                let y = rtdbPos.y ?? char.y;

                if (currentCityId && rtdbPos.positions?.[currentCityId]) {
                    x = rtdbPos.positions[currentCityId].x;
                    y = rtdbPos.positions[currentCityId].y;
                }

                return { ...char, x, y };
            });
        };

        const positionedPlayers = applyRtdbPositions(visiblePlayers);
        const positionedNPCs = applyRtdbPositions(loadedNPCsRef.current);

        [...positionedPlayers, ...positionedNPCs].forEach((char) => {
            if (!visibleIds.has(char.id)) {
                visibleIds.add(char.id);
                combined.push(char);
            }
        });

        setCharacters(combined);
        setLoading(false);
    }, [globalCityId]); // parseCharacterDoc has empty deps — stable

    // ─── Stable refs for external callers (useMapData) ───────────────────────
    const parseCharacterDocRef = useRef(parseCharacterDoc);
    const mergeAndSetCharactersRef = useRef(mergeAndSetCharacters);

    useEffect(() => {
        parseCharacterDocRef.current = parseCharacterDoc;
    }, [parseCharacterDoc]);

    useEffect(() => {
        mergeAndSetCharactersRef.current = mergeAndSetCharacters;
        mergeAndSetCharactersRtdbRef.current = mergeAndSetCharacters;
    }, [mergeAndSetCharacters]);

    // ─── Keep selectedCityIdRef fresh + re-merge on city change ──────────────
    useEffect(() => {
        selectedCityIdRef.current = selectedCityId;
        mergeAndSetCharactersRef.current();
    }, [selectedCityId]);

    // ─── Return ──────────────────────────────────────────────────────────────
    return {
        characters,
        setCharacters,
        loading,
        setLoading,
        loadedPlayersRef,
        loadedNPCsRef,
        playersVersion,
        setPlayersVersion,
        parseCharacterDocRef,
        mergeAndSetCharactersRef,
        selectedCityIdRef,
        rtdbPositionsRef,
        updateCharacterPosition,
        updateCityPosition,
    };
}
