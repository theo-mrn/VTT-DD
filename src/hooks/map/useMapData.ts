/**
 * useMapData.ts — Hook centralisé pour tous les listeners Firestore de la map
 */

import { useEffect, useRef, startTransition } from 'react';
import {
    doc,
    collection,
    onSnapshot,
    setDoc,
    query,
    where,
} from 'firebase/firestore';
import { doc as firestoreDoc } from 'firebase/firestore';
import { ref as rtdbRef, onValue as rtdbOnValue } from 'firebase/database';

import { db, realtimeDb } from '@/lib/firebase';
import { logHistoryEvent } from '@/lib/historiqueTrackerService';
import { registerPendingPlay } from '@/utils/audioAutoplay';

import type {
    Character,
    LightSource,
    MapText,
    SavedDrawing,
    MusicZone,
    Layer,
    Scene,
    Portal,
    MapObject,
    GroupEntity,
} from '@/app/[roomid]/map/types';
import type { Obstacle } from '@/lib/visibility';
import type { SharedMeasurement } from '@/app/[roomid]/map/measurements';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapDataCallbacks {
    setCharacters?: (chars: Character[]) => void;
    setLoading?: (v: boolean) => void;
    setLights?: (lights: LightSource[]) => void;
    setObjects?: (objects: MapObject[]) => void;
    setGroupEntities?: (entities: GroupEntity[]) => void;
    setNotes?: (notes: MapText[]) => void;
    setDrawings?: (drawings: SavedDrawing[]) => void;
    setFogGrid?: (grid: Map<string, boolean>) => void;
    setFullMapFog?: (v: boolean) => void;
    setObstacles?: (obs: Obstacle[]) => void;
    setMusicZones?: (zones: MusicZone[]) => void;
    setMeasurements?: (ms: SharedMeasurement[]) => void;
    setLayers?: React.Dispatch<React.SetStateAction<Layer[]>>;
    setPortals?: (portals: Portal[]) => void;
    setCurrentScene?: (scene: Scene | null) => void;
    setBackgroundImage?: (url: string | null) => void;
    setBgImageObject?: (obj: HTMLImageElement | HTMLVideoElement | null) => void;
    setActivePlayerId?: (id: string | null) => void;
    setGlobalTokenScale?: (v: number) => void;
    setShadowOpacity?: (v: number) => void;
    setPixelsPerUnit?: (v: number) => void;
    setUnitName?: (v: string) => void;
    setGlobalCityId?: (id: string | null) => void;
    setSettingsResolved?: (v: boolean) => void;
    setCities?: (cities: any[]) => void;
    setPlayersVersion?: React.Dispatch<React.SetStateAction<number>>;
    setRawPlayers?: (docs: any[]) => void;
    setRawNPCs?: (chars: Character[]) => void;
    selectedCityIdRef?: React.MutableRefObject<string | null>;
    loadedPlayersRef?: React.MutableRefObject<any[]>;
    loadedNPCsRef?: React.MutableRefObject<Character[]>;
    mergeAndSetCharactersRef?: React.MutableRefObject<() => void>;
    parseCharacterDocRef?: React.MutableRefObject<(doc: any, cityId: string | null) => Character>;
    audioVolumes?: { quickSounds: number; backgroundAudio: number };
    globalAudioRef?: React.MutableRefObject<HTMLAudioElement | null>;
    isFirstSnapshotRef?: React.MutableRefObject<boolean>;
    isMJ?: boolean;
}

// ─── Utilitaire : debounce ────────────────────────────────────────────────────

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return ((...args: any[]) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { fn(...args); }, ms);
    }) as T;
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useMapData(
    roomId: string,
    selectedCityId: string | null,
    callbacks: MapDataCallbacks
) {
    const cb = useRef(callbacks);
    useEffect(() => { cb.current = callbacks; });

    // ──────────────────────────────────────────────────────────────────────────
    // GROUPE GLOBAL : listeners dépendant uniquement de roomId
    // ──────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) return;
        const unsubs: (() => void)[] = [];

        // ─── 1. PORTALS ──────────────────────────────────────────────────────────
        if (cb.current.setPortals) {
            unsubs.push(onSnapshot(
                query(collection(db, 'cartes', roomId, 'portals')),
                (snapshot) => {
                    const newPortals: Portal[] = snapshot.docs.map(doc => ({
                        id: doc.id,
                        portalType: 'scene-change' as const,
                        ...doc.data(),
                    } as Portal));
                    cb.current.setPortals?.(newPortals);
                }
            ));
        }

        // ─── 2. SETTINGS GENERAL (fusionné) ────────────────────────────────────
        const hasSettingsCbs = cb.current.setGlobalTokenScale || cb.current.setShadowOpacity ||
            cb.current.setPixelsPerUnit || cb.current.setUnitName || cb.current.setGlobalCityId ||
            cb.current.setSettingsResolved;

        if (hasSettingsCbs) {
            unsubs.push(onSnapshot(
                doc(db, 'cartes', roomId, 'settings', 'general'),
                (docSnap) => {
                    const c = cb.current;
                    if (!docSnap.exists()) {
                        c.setSettingsResolved?.(true);
                        return;
                    }
                    const data = docSnap.data();
                    if (data.globalTokenScale !== undefined) c.setGlobalTokenScale?.(data.globalTokenScale);
                    if (data.shadowOpacity !== undefined) c.setShadowOpacity?.(data.shadowOpacity);
                    if (data.pixelsPerUnit) c.setPixelsPerUnit?.(data.pixelsPerUnit);
                    if (data.unitName) c.setUnitName?.(data.unitName);
                    if (data.currentCityId) {
                        c.setGlobalCityId?.(data.currentCityId);
                    }
                    c.setSettingsResolved?.(true);
                }
            ));
        }

        // ─── 3. GLOBAL SOUND ────────────────────────────────────────────────────
        if (cb.current.globalAudioRef) {
            if (cb.current.isFirstSnapshotRef) cb.current.isFirstSnapshotRef.current = true;
            unsubs.push(onSnapshot(
                firestoreDoc(db, 'global_sounds', roomId),
                (docSnap) => {
                    const { isFirstSnapshotRef, globalAudioRef, audioVolumes } = cb.current;
                    if (isFirstSnapshotRef?.current) { isFirstSnapshotRef.current = false; return; }
                    if (!docSnap.exists()) return;
                    const data = docSnap.data();
                    if (!globalAudioRef) return;
                    if (data.soundUrl === null || !data.soundUrl) {
                        globalAudioRef.current?.pause();
                        globalAudioRef.current = null;
                        return;
                    }
                    if (data.soundUrl && data.timestamp) {
                        const eventTime = data.timestamp.toMillis ? data.timestamp.toMillis() : data.timestamp;
                        const timeDiff = Date.now() - eventTime;
                        if (timeDiff < 5000 && timeDiff > -2000) {
                            globalAudioRef.current?.pause();
                            const audio = new Audio(data.soundUrl);
                            if (audioVolumes) audio.volume = audioVolumes.quickSounds;
                            globalAudioRef.current = audio;
                            audio.addEventListener('ended', () => { globalAudioRef.current = null; });
                            audio.play().catch(e => {
                                if (e.name !== 'NotAllowedError') console.error(e);
                                registerPendingPlay(audio);
                            });
                        }
                    }
                }
            ));
        }

        // ─── 4. PLAYERS (joueurs) ────────────────────────────────────────────────
        if (cb.current.loadedPlayersRef || cb.current.setRawPlayers) {
            unsubs.push(onSnapshot(
                query(collection(db, 'cartes', roomId, 'characters'), where('type', '==', 'joueurs')),
                (snapshot) => {
                    const { loadedPlayersRef, setPlayersVersion, mergeAndSetCharactersRef, setRawPlayers } = cb.current;

                    if (loadedPlayersRef) loadedPlayersRef.current = snapshot.docs;
                    setPlayersVersion?.(v => v + 1);
                    setRawPlayers?.(snapshot.docs);
                    mergeAndSetCharactersRef?.current?.();
                }
            ));
        }

        // ─── 5. CITIES ───────────────────────────────────────────────────────────
        if (cb.current.setCities) {
            unsubs.push(onSnapshot(
                collection(db, 'cartes', roomId, 'cities'),
                (snapshot) => {
                    cb.current.setCities?.(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                }
            ));
        }

        // ─── 5b. GROUP ENTITIES (vaisseaux, base...) ────────────────────────────
        // Pas scopées par ville/scène — vivent sous Salle/{roomId}, pas cartes/{roomId}.
        if (cb.current.setGroupEntities) {
            unsubs.push(onSnapshot(
                collection(db, 'Salle', roomId, 'groupEntities'),
                (snapshot) => {
                    cb.current.setGroupEntities?.(snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<GroupEntity, 'id'>) })));
                }
            ));
        }

        return () => unsubs.forEach(u => u());
    }, [roomId]);

    // ──────────────────────────────────────────────────────────────────────────
    // GROUPE PER-CITY : listeners dépendant de roomId + selectedCityId
    // ──────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) return;
        const unsubs: (() => void)[] = [];
        let isInitialNPCLoad = true;

        // ─── 6. SCENE + BACKGROUND ─────────────────────────────────────────────
        if (selectedCityId) {
            if (cb.current.setCurrentScene || cb.current.setBackgroundImage) {
                unsubs.push(onSnapshot(
                    doc(db, 'cartes', roomId, 'cities', selectedCityId),
                    (snapshot) => {
                        const c = cb.current;
                        if (snapshot.exists()) {
                            c.setCurrentScene?.({ id: snapshot.id, ...snapshot.data() } as Scene);
                            const data = snapshot.data();
                            if (data.backgroundUrl) {
                                c.setBackgroundImage?.(data.backgroundUrl);
                            } else {
                                c.setBackgroundImage?.(null);
                                c.setBgImageObject?.(null);
                            }
                        } else {
                            c.setCurrentScene?.(null);
                        }
                    }
                ));
            }
        } else {
            cb.current.setCurrentScene?.(null);
            if (cb.current.setBackgroundImage) {
                unsubs.push(onSnapshot(
                    doc(db, 'cartes', roomId, 'fond', 'fond1'),
                    (docSnap) => {
                        if (docSnap.exists() && docSnap.data().url) {
                            cb.current.setBackgroundImage?.(docSnap.data().url);
                        }
                    }
                ));
            }
        }

        // ─── 7. LAYERS ──────────────────────────────────────────────────────────
        const localLayersDef: Layer[] = [
            { id: 'lights', label: 'Lumières', isVisible: true, order: 0 },
            { id: 'obstacles', label: 'Obstacles', isVisible: true, order: 1 },
            { id: 'notes', label: 'Notes', isVisible: true, order: 2 },
            { id: 'drawings', label: 'Dessins', isVisible: true, order: 3 },
            { id: 'objects', label: 'Objets', isVisible: true, order: 4 },
            { id: 'characters', label: 'Personnages', isVisible: true, order: 5 },
            { id: 'fog', label: 'Brouillard', isVisible: true, order: 6 },
            { id: 'music', label: 'Musique (Zones)', isVisible: true, order: 7 },
        ];
        const layerDocId = selectedCityId ? `layers_${selectedCityId}` : 'layers';
        const layersRef = doc(db, 'cartes', roomId, 'settings', layerDocId);
        if (cb.current.setLayers) {
            unsubs.push(onSnapshot(layersRef, (docSnap) => {
                if (docSnap.exists()) {
                    const remoteLayers = docSnap.data().layers as Layer[] | undefined;
                    if (remoteLayers) {
                        cb.current.setLayers?.(() =>
                            localLayersDef.map(local => ({
                                ...local,
                                isVisible: remoteLayers.find(r => r.id === local.id)?.isVisible ?? local.isVisible,
                            }))
                        );
                    }
                } else {
                    setDoc(layersRef, { layers: localLayersDef }, { merge: true });
                    cb.current.setLayers?.(localLayersDef);
                }
            }));
        }

        if (cb.current.setActivePlayerId) {
            if (selectedCityId) {
                unsubs.push(onSnapshot(
                    doc(db, 'cartes', roomId, 'cities', selectedCityId, 'combat', 'state'),
                    (docSnap) => {
                        cb.current.setActivePlayerId?.(docSnap.exists() ? (docSnap.data().activePlayer || null) : null);
                    }
                ));
            } else {
                cb.current.setActivePlayerId?.(null);
            }
        }

        // ─── 9. NPCs ──────────────────────────────────────────────────────────────
        if (cb.current.loadedNPCsRef || cb.current.setRawNPCs) {
            unsubs.push(onSnapshot(
                query(collection(db, 'cartes', roomId, 'characters'), where('cityId', '==', selectedCityId)),
                (snapshot) => {
                    const { loadedNPCsRef, parseCharacterDocRef, mergeAndSetCharactersRef, selectedCityIdRef, setRawNPCs, isMJ } = cb.current;
                    const docs = snapshot.docs.filter(d => d.data().type !== 'joueurs');

                    if (isMJ && !isInitialNPCLoad) {
                        snapshot.docChanges().forEach((change) => {
                            const data = change.doc.data();
                            if (data.type === 'joueurs') return;
                            const name = data.Nomperso || "Pnj";
                            const rawImage = data.imageURL2 || data.imageURLFinal || data.image || data.imageUrl || data.imageURL;
                            const avatar = typeof rawImage === 'object' && rawImage?.src ? rawImage.src : (typeof rawImage === 'string' ? rawImage : '');

                            if (change.type === "added") {
                                logHistoryEvent({ roomId, type: 'creation', message: `Apparition de : **${name}**.`, characterId: change.doc.id, characterName: name, characterAvatar: avatar, characterType: data.type });
                            } else if (change.type === "removed") {
                                logHistoryEvent({ roomId, type: 'info', message: `Disparition de : **${name}**.`, characterId: change.doc.id, characterName: name, characterAvatar: avatar, characterType: data.type });
                            }
                        });
                    }
                    isInitialNPCLoad = false;

                    if (setRawNPCs && parseCharacterDocRef) {
                        setRawNPCs(docs.map(d => parseCharacterDocRef.current(d, selectedCityIdRef?.current || null)));
                    }
                    if (loadedNPCsRef && parseCharacterDocRef) {
                        loadedNPCsRef.current = docs.map(d => parseCharacterDocRef.current(d, selectedCityIdRef?.current || null));
                        mergeAndSetCharactersRef?.current?.();
                    }
                }
            ));
        }

        // ─── 12. FOG ──────────────────────────────────────────────────────────────
        if (cb.current.setFogGrid) {
            const fogDocId = selectedCityId ? `fog_${selectedCityId}` : 'fogData';
            const applyFog = debounce((grid: Map<string, boolean>, fullFog: boolean | undefined) => {
                const c = cb.current;
                c.setFogGrid?.(grid);
                if (fullFog !== undefined) c.setFullMapFog?.(fullFog);
            }, 150);

            unsubs.push(onSnapshot(
                doc(db, 'cartes', roomId, 'fog', fogDocId),
                (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const grid = data.grid
                            ? new Map<string, boolean>(Object.entries(data.grid))
                            : new Map<string, boolean>();
                        applyFog(grid, data.fullMapFog);
                    } else {
                        applyFog(new Map(), false);
                    }
                }
            ));
        }

        // ─── 14. LIGHTS ──────────────────────────────────────────────────────────
        if (cb.current.setLights) {
            unsubs.push(onSnapshot(
                query(collection(db, 'cartes', roomId, 'lights'), where('cityId', '==', selectedCityId)),
                (snapshot) => {
                    cb.current.setLights?.(snapshot.docs.map(d => ({
                        id: d.id,
                        x: d.data().x,
                        y: d.data().y,
                        name: d.data().name || 'Lumière',
                        radius: d.data().radius || 10,
                        visible: d.data().visible ?? true,
                        cityId: d.data().cityId,
                    })));
                }
            ));
        }

        // ─── 15. OBJECTS ─────────────────────────────────────────────────────────
        if (cb.current.setObjects) {
            unsubs.push(onSnapshot(
                query(collection(db, 'cartes', roomId, 'objects'), where('cityId', '==', selectedCityId)),
                (snapshot) => {
                    const objs: MapObject[] = snapshot.docs.map(d => {
                        const data = d.data();
                        return {
                            id: d.id,
                            x: data.x || 0,
                            y: data.y || 0,
                            width: data.width || 100,
                            height: data.height || 100,
                            rotation: data.rotation || 0,
                            imageUrl: data.imageUrl || '',
                            name: data.name,
                            cityId: data.cityId || null,
                            isBackground: data.isBackground || false,
                            isLocked: data.isLocked || false,
                            visibility: data.visibility || undefined,
                            type: (data.type || 'decors') as 'decors' | 'weapon' | 'item',
                            visibleToPlayerIds: data.visibleToPlayerIds || undefined,
                            notes: data.notes || undefined,
                            items: data.items || [],
                            linkedId: data.linkedId || undefined,
                            groupEntityId: data.groupEntityId || undefined,
                        };
                    });
                    cb.current.setObjects?.(objs);
                }
            ));
        }

        // ─── 16. MUSIC ZONES ───────────────────────────────────
        if (cb.current.setMusicZones) {
            unsubs.push(onSnapshot(
                query(collection(db, 'cartes', roomId, 'musicZones'), where('cityId', '==', selectedCityId)),
                (snapshot) => {
                    const zones = snapshot.docs
                        .filter(d => d.data().cityId === selectedCityId)
                        .map(d => ({ id: d.id, ...d.data() } as MusicZone));
                    startTransition(() => cb.current.setMusicZones?.(zones));
                }
            ));
        }

        // ─── 17. MEASUREMENTS (RTDB — écritures à haute fréquence pendant le drag) ──
        // Filtre cityId fait côté client : RTDB n'a pas d'équivalent pratique au where()
        // composite de Firestore pour ce cas, et le volume de mesures actives est faible.
        if (cb.current.setMeasurements) {
            const measurementsRef = rtdbRef(realtimeDb, `rooms/${roomId}/measurements`);
            const unsubscribe = rtdbOnValue(measurementsRef, (snapshot) => {
                const val = snapshot.val() as Record<string, SharedMeasurement> | null;
                const ms = val
                    ? Object.values(val).filter(m => m.cityId === selectedCityId)
                    : [];
                startTransition(() => cb.current.setMeasurements?.(ms));
            });
            unsubs.push(unsubscribe);
        }

        return () => {
            unsubs.forEach(u => u());
        };
    }, [roomId, selectedCityId]);
}
