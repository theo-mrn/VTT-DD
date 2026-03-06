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

import { db } from '@/lib/firebase';
import { logHistoryEvent } from '@/lib/historiqueTrackerService';

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
} from '@/app/[roomid]/map/types';
import type { Obstacle } from '@/lib/visibility';
import type { SharedMeasurement } from '@/app/[roomid]/map/measurements';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapDataCallbacks {
    setCharacters?: (chars: Character[]) => void;
    setLoading?: (v: boolean) => void;
    setLights?: (lights: LightSource[]) => void;
    setObjects?: (objects: MapObject[]) => void;
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
    enableHistoryTracking?: boolean;
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
    const isInitialLoadRef = useRef(true);
    const lastCharsPVRef = useRef<Map<string, number>>(new Map());
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
            cb.current.setPixelsPerUnit || cb.current.setUnitName || cb.current.setGlobalCityId;

        if (hasSettingsCbs) {
            unsubs.push(onSnapshot(
                doc(db, 'cartes', roomId, 'settings', 'general'),
                (docSnap) => {
                    if (!docSnap.exists()) return;
                    const data = docSnap.data();
                    const c = cb.current;
                    if (data.globalTokenScale !== undefined) c.setGlobalTokenScale?.(data.globalTokenScale);
                    if (data.shadowOpacity !== undefined) c.setShadowOpacity?.(data.shadowOpacity);
                    if (data.pixelsPerUnit) c.setPixelsPerUnit?.(data.pixelsPerUnit);
                    if (data.unitName) c.setUnitName?.(data.unitName);
                    if (data.currentCityId) {
                        c.setGlobalCityId?.(data.currentCityId);
                    }
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
                            audio.play().catch(console.error);
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
                    const { loadedPlayersRef, setPlayersVersion, mergeAndSetCharactersRef, setRawPlayers, enableHistoryTracking, isMJ } = cb.current;

                    if (enableHistoryTracking && isMJ && !isInitialLoadRef.current) {
                        snapshot.docChanges().forEach((change) => {
                            const data = change.doc.data();
                            const name = data.Nomperso || "Joueur";
                            const rawImage = data.imageURL2 || data.imageURLFinal || data.image || data.imageUrl || data.imageURL;
                            const avatar = typeof rawImage === 'object' && rawImage?.src ? rawImage.src : (typeof rawImage === 'string' ? rawImage : '');

                            if (change.type === "added") {
                                logHistoryEvent({ roomId, type: 'creation', message: `**${name}** a rejoint l'aventure !`, characterId: change.doc.id, characterName: name, characterAvatar: avatar, characterType: 'joueurs' });
                            } else if (change.type === "removed") {
                                logHistoryEvent({ roomId, type: 'info', message: `**${name}** a quitté l'aventure.`, characterId: change.doc.id, characterName: name, characterAvatar: avatar, characterType: 'joueurs' });
                                lastCharsPVRef.current.delete(change.doc.id);
                            } else if (change.type === "modified") {
                                // Track PV changes for players
                                const oldPV = lastCharsPVRef.current.get(change.doc.id);
                                const newPV = Number(data.PV) || 0;
                                if (oldPV !== undefined && oldPV !== newPV) {
                                    const diff = newPV - oldPV;
                                    const action = diff > 0 ? "récupéré" : "perdu";
                                    logHistoryEvent({ roomId, type: 'combat', message: `**${name}** a **${action}** ${Math.abs(diff)} PV.`, characterId: change.doc.id, characterName: name, characterAvatar: avatar, characterType: 'joueurs' });
                                }
                            }
                            lastCharsPVRef.current.set(change.doc.id, Number(data.PV) || 0);
                        });
                    } else if (enableHistoryTracking && isMJ && isInitialLoadRef.current) {
                        // Fill the ref on initial load without logging
                        snapshot.docs.forEach(d => lastCharsPVRef.current.set(d.id, Number(d.data().PV) || 0));
                    }
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

        return () => unsubs.forEach(u => u());
    }, [roomId]);

    // ──────────────────────────────────────────────────────────────────────────
    // GROUPE PER-CITY : listeners dépendant de roomId + selectedCityId
    // ──────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!roomId) return;
        const unsubs: (() => void)[] = [];

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
                    const { loadedNPCsRef, parseCharacterDocRef, mergeAndSetCharactersRef, selectedCityIdRef, setRawNPCs, enableHistoryTracking, isMJ } = cb.current;
                    const docs = snapshot.docs.filter(d => d.data().type !== 'joueurs');

                    if (enableHistoryTracking && isMJ && !isInitialLoadRef.current) {
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
                                lastCharsPVRef.current.delete(change.doc.id);
                            } else if (change.type === "modified") {
                                // Track PV changes for NPCs
                                const oldPV = lastCharsPVRef.current.get(change.doc.id);
                                const newPV = Number(data.PV) || 0;
                                if (oldPV !== undefined && oldPV !== newPV) {
                                    const diff = newPV - oldPV;
                                    const action = diff > 0 ? "soigné" : "attaqué";
                                    logHistoryEvent({ roomId, type: 'combat', message: `**${name}** a été **${action}** (${diff > 0 ? "+" : ""}${diff} PV).`, characterId: change.doc.id, characterName: name, characterAvatar: avatar, characterType: data.type });
                                }
                            }
                            lastCharsPVRef.current.set(change.doc.id, Number(data.PV) || 0);
                        });
                    } else if (enableHistoryTracking && isMJ && isInitialLoadRef.current) {
                        // Fill the ref on initial load without logging
                        snapshot.docs.forEach(d => lastCharsPVRef.current.set(d.id, Number(d.data().PV) || 0));
                    }

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

        // ─── 17. MEASUREMENTS ──────────────────────────────────
        if (cb.current.setMeasurements) {
            unsubs.push(onSnapshot(
                query(collection(db, 'cartes', roomId, 'measurements'), where('cityId', '==', selectedCityId)),
                (snapshot) => {
                    const ms = snapshot.docs.map(d => d.data() as SharedMeasurement);
                    startTransition(() => cb.current.setMeasurements?.(ms));
                }
            ));
        }

        // Marquer la fin du chargement initial
        const timer = setTimeout(() => { isInitialLoadRef.current = false; }, 2000);
        return () => {
            unsubs.forEach(u => u());
            clearTimeout(timer);
        };
    }, [roomId, selectedCityId]);
}
