/**
 * useMapData.ts — Hook centralisé pour tous les listeners Firestore de la map
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OPTIMISATIONS APPLIQUÉES :
 *
 * 1. FUSION des listeners redondants
 *    - cities/{selectedCityId} → scène + background image dans 1 seul listener
 *      (avant : 2 subscriptions sur le même doc)
 *
 * 2. SKIP hasPendingWrites
 *    - On ignore les snapshots générés par nos propres écritures pour les
 *      collections lourdes (objects, fog). Firestore les génère d'abord en local
 *      avant la confirmation serveur — on l'a déjà appliqué optimistiquement.
 *    - EXCEPTION : characters/NPCs conservent hasPendingWrites car la position
 *      pendant le drag doit être immédiate.
 *
 * 3. DEBOUNCE du brouillard (fog)
 *    - La grille de brouillard peut changer à chaque cell lors du peinture.
 *    - On debounce à 150ms pour éviter 30 setState/seconde.
 *
 * 4. React.startTransition pour les mises à jour non urgentes
 *    - drawings, notes, measurements, musicZones → mises à jour basses priorité
 *    - Le rendu canvas est prioritaire, ces données peuvent attendre 1 frame.
 *
 * 5. Refs stables pour les callbacks
 *    - Les setters passés en callbacks sont wrappés dans useRef pour éviter
 *      que les closures des onSnapshot capturent des références obsolètes.
 *
 * 6. GROUPEMENT per-city en 1 seul useEffect
 *    - Un seul cleanup pour 9 listeners per-city → moins d'overhead React.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useRef, startTransition } from 'react';
import {
    doc,
    collection,
    onSnapshot,
    query,
    where,
    setDoc,
} from 'firebase/firestore';
import { doc as firestoreDoc } from 'firebase/firestore';

import { db } from '@/lib/firebase';

import type {
    Character,
    LightSource,
    MapText,
    SavedDrawing,
    MusicZone,
    Layer,
    LayerType,
    Scene,
    Portal,
} from '@/app/[roomid]/map/types';
import type { MapObject } from '@/app/[roomid]/map/types';
import type { Obstacle } from '@/lib/visibility';
import type { SharedMeasurement } from '@/app/[roomid]/map/measurements';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MapDataCallbacks {
    setCharacters: (chars: Character[]) => void;
    setLoading: (v: boolean) => void;
    setLights: (lights: LightSource[]) => void;
    setObjects: (objects: MapObject[]) => void;
    setNotes: (notes: MapText[]) => void;
    setDrawings: (drawings: SavedDrawing[]) => void;
    setFogGrid: (grid: Map<string, boolean>) => void;
    setFullMapFog: (v: boolean) => void;
    setObstacles: (obs: Obstacle[]) => void;
    setMusicZones: (zones: MusicZone[]) => void;
    setMeasurements: (ms: SharedMeasurement[]) => void;
    setLayers: React.Dispatch<React.SetStateAction<Layer[]>>;
    setPortals: (portals: Portal[]) => void;
    setCurrentScene: (scene: Scene | null) => void;
    setBackgroundImage: (url: string | null) => void;
    setBgImageObject: (obj: HTMLImageElement | HTMLVideoElement | null) => void;
    setActivePlayerId: (id: string | null) => void;
    setGlobalTokenScale: (v: number) => void;
    setShadowOpacity: (v: number) => void;
    setPixelsPerUnit: (v: number) => void;
    setUnitName: (v: string) => void;
    setGlobalCityId: (id: string | null) => void;
    setCities: (cities: any[]) => void;
    setPlayersVersion: React.Dispatch<React.SetStateAction<number>>;
    selectedCityIdRef: React.MutableRefObject<string | null>;
    loadedPlayersRef: React.MutableRefObject<any[]>;
    loadedNPCsRef: React.MutableRefObject<Character[]>;
    mergeAndSetCharactersRef: React.MutableRefObject<() => void>;
    parseCharacterDocRef: React.MutableRefObject<(doc: any, cityId: string | null) => Character>;
    audioVolumes: { quickSounds: number; backgroundAudio: number };
    globalAudioRef: React.MutableRefObject<HTMLAudioElement | null>;
    isFirstSnapshotRef: React.MutableRefObject<boolean>;
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
    // ─── Refs stables pour tous les callbacks ──────────────────────────────────
    // On utilise des refs pour que les closures des onSnapshot ne capturent
    // jamais une version "périmée" d'un setter ou d'un ref.
    const cb = useRef(callbacks);
    useEffect(() => { cb.current = callbacks; });

    // ──────────────────────────────────────────────────────────────────────────
    // GROUPE GLOBAL : listeners dépendant uniquement de roomId
    // ──────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!roomId) return;
        const unsubs: (() => void)[] = [];

        // ─── 1. PORTALS ──────────────────────────────────────────────────────────
        unsubs.push(onSnapshot(
            query(collection(db, 'cartes', roomId, 'portals')),
            (snapshot) => {
                const newPortals: Portal[] = snapshot.docs.map(doc => ({
                    id: doc.id,
                    portalType: 'scene-change' as const,
                    ...doc.data(),
                } as Portal));
                cb.current.setPortals(newPortals);
            }
        ));

        // ─── 2. SETTINGS GENERAL (fusionné — remplace les 2 anciens doublons) ───
        //    Lit : globalTokenScale, shadowOpacity, pixelsPerUnit, unitName, currentCityId
        unsubs.push(onSnapshot(
            doc(db, 'cartes', roomId, 'settings', 'general'),
            (docSnap) => {
                // ✅ SKIP hasPendingWrites : paramètres rarement écrits, inutile de
                //    traiter notre propre écriture deux fois
                if (docSnap.metadata.hasPendingWrites) return;
                if (!docSnap.exists()) return;
                const data = docSnap.data();
                const c = cb.current;
                if (data.globalTokenScale !== undefined) c.setGlobalTokenScale(data.globalTokenScale);
                if (data.shadowOpacity !== undefined) c.setShadowOpacity(data.shadowOpacity);
                if (data.pixelsPerUnit) c.setPixelsPerUnit(data.pixelsPerUnit);
                if (data.unitName) c.setUnitName(data.unitName);
                if (data.currentCityId) c.setGlobalCityId(data.currentCityId);
            }
        ));

        // ─── 3. GLOBAL SOUND ────────────────────────────────────────────────────
        cb.current.isFirstSnapshotRef.current = true;
        unsubs.push(onSnapshot(
            firestoreDoc(db, 'global_sounds', roomId),
            (docSnap) => {
                const { isFirstSnapshotRef, globalAudioRef, audioVolumes } = cb.current;
                if (isFirstSnapshotRef.current) { isFirstSnapshotRef.current = false; return; }
                if (!docSnap.exists()) return;
                const data = docSnap.data();
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
                        audio.volume = audioVolumes.quickSounds;
                        globalAudioRef.current = audio;
                        audio.addEventListener('ended', () => { globalAudioRef.current = null; });
                        audio.play().catch(console.error);
                    }
                }
            }
        ));

        // ─── 4. PLAYERS (joueurs — global, stable lors des changements de ville) ─
        unsubs.push(onSnapshot(
            query(collection(db, 'cartes', roomId, 'characters'), where('type', '==', 'joueurs')),
            (snapshot) => {
                const { loadedPlayersRef, setPlayersVersion, mergeAndSetCharactersRef } = cb.current;
                loadedPlayersRef.current = snapshot.docs;
                setPlayersVersion(v => v + 1);
                mergeAndSetCharactersRef.current();
            }
        ));

        // ─── 5. CITIES COLLECTION (world map) ────────────────────────────────────
        unsubs.push(onSnapshot(
            collection(db, 'cartes', roomId, 'cities'),
            (snapshot) => {
                // ✅ SKIP hasPendingWrites : les villes changent rarement
                if (snapshot.metadata.hasPendingWrites) return;
                cb.current.setCities(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            }
        ));

        return () => unsubs.forEach(u => u());
    }, [roomId]);

    // ──────────────────────────────────────────────────────────────────────────
    // GROUPE PER-CITY : listeners dépendant de roomId + selectedCityId
    // ──────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!roomId) return;
        const unsubs: (() => void)[] = [];

        // ─── 6. SCENE + BACKGROUND IMAGE (FUSIONNÉS) ─────────────────────────────
        //    ✅ OPTIMISATION : avant = 2 subscriptions séparées sur cities/{cityId}
        //    Maintenant = 1 seule lecture qui alimente scene ET background
        if (selectedCityId) {
            unsubs.push(onSnapshot(
                doc(db, 'cartes', roomId, 'cities', selectedCityId),
                (snapshot) => {
                    const c = cb.current;
                    if (snapshot.exists()) {
                        // → Scene (spawn points)
                        c.setCurrentScene({ id: snapshot.id, ...snapshot.data() } as Scene);
                        // → Background image
                        const data = snapshot.data();
                        if (data.backgroundUrl) {
                            c.setBackgroundImage(data.backgroundUrl);
                        } else {
                            c.setBackgroundImage(null);
                            c.setBgImageObject(null);
                        }
                    } else {
                        c.setCurrentScene(null);
                    }
                }
            ));
        } else {
            // World map : fond global (pas de scène)
            cb.current.setCurrentScene(null);
            unsubs.push(onSnapshot(
                doc(db, 'cartes', roomId, 'fond', 'fond1'),
                (docSnap) => {
                    if (docSnap.exists() && docSnap.data().url) {
                        cb.current.setBackgroundImage(docSnap.data().url);
                    }
                }
            ));
        }

        // ─── 7. LAYERS (visibilité des couches par ville) ─────────────────────────
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
        unsubs.push(onSnapshot(layersRef, (docSnap) => {
            if (docSnap.exists()) {
                const remoteLayers = docSnap.data().layers as Layer[] | undefined;
                if (remoteLayers) {
                    cb.current.setLayers(() =>
                        localLayersDef.map(local => ({
                            ...local,
                            isVisible: remoteLayers.find(r => r.id === local.id)?.isVisible ?? local.isVisible,
                        }))
                    );
                }
            } else {
                setDoc(layersRef, { layers: localLayersDef }, { merge: true });
                cb.current.setLayers(localLayersDef);
            }
        }));

        // ─── 8. COMBAT STATE → activePlayerId ─────────────────────────────────────
        if (selectedCityId) {
            unsubs.push(onSnapshot(
                doc(db, 'cartes', roomId, 'cities', selectedCityId, 'combat', 'state'),
                (docSnap) => {
                    cb.current.setActivePlayerId(docSnap.exists() ? (docSnap.data().activePlayer || null) : null);
                }
            ));
        } else {
            cb.current.setActivePlayerId(null);
        }

        // ─── 9. NPCs ──────────────────────────────────────────────────────────────
        //    ❌ PAS de skip hasPendingWrites ici : la position des persos pendant
        //       le drag doit être immédiate localement.
        unsubs.push(onSnapshot(
            query(collection(db, 'cartes', roomId, 'characters'), where('cityId', '==', selectedCityId)),
            (snapshot) => {
                const { loadedNPCsRef, parseCharacterDocRef, mergeAndSetCharactersRef, selectedCityIdRef } = cb.current;
                loadedNPCsRef.current = snapshot.docs
                    .filter(d => d.data().type !== 'joueurs')
                    .map(d => parseCharacterDocRef.current(d, selectedCityIdRef.current));
                mergeAndSetCharactersRef.current();
            }
        ));

        // ─── 10-11. DRAWINGS + NOTES → MIGRÉS VERS RTDB (useRtdbCollections.ts)

        // ─── 12. FOG (avec debounce) ──────────────────────────────────────────────
        //    ✅ DEBOUNCE 150ms : évite 30 setState/s pendant la peinture du brouillard
        const fogDocId = selectedCityId ? `fog_${selectedCityId}` : 'fogData';
        const applyFog = debounce((grid: Map<string, boolean>, fullFog: boolean | undefined) => {
            const c = cb.current;
            c.setFogGrid(grid);
            if (fullFog !== undefined) c.setFullMapFog(fullFog);
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

        // ─── 13. OBSTACLES → MIGRÉ VERS RTDB (useRtdbCollections.ts)

        // ─── 14. LIGHTS ──────────────────────────────────────────────────────────
        unsubs.push(onSnapshot(
            query(collection(db, 'cartes', roomId, 'lights'), where('cityId', '==', selectedCityId)),
            (snapshot) => {
                if (snapshot.metadata.hasPendingWrites) return;
                cb.current.setLights(snapshot.docs.map(d => ({
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

        // ─── 15. OBJECTS ─────────────────────────────────────────────────────────
        unsubs.push(onSnapshot(
            query(collection(db, 'cartes', roomId, 'objects'), where('cityId', '==', selectedCityId)),
            (snapshot) => {
                // ✅ SKIP hasPendingWrites : les objets ne se déplacent pas pendant un drag "live"
                if (snapshot.metadata.hasPendingWrites) return;
                const objs: MapObject[] = snapshot.docs.map(d => {
                    const data = d.data();
                    const img = new Image();
                    if (data.imageUrl) img.src = data.imageUrl;
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
                        image: img,
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
                cb.current.setObjects(objs);
            }
        ));

        // ─── 16. MUSIC ZONES → startTransition ───────────────────────────────────
        unsubs.push(onSnapshot(
            query(collection(db, 'cartes', roomId, 'musicZones'), where('cityId', '==', selectedCityId)),
            (snapshot) => {
                if (snapshot.metadata.hasPendingWrites) return;
                const zones = snapshot.docs
                    .filter(d => d.data().cityId === selectedCityId)
                    .map(d => ({ id: d.id, ...d.data() } as MusicZone));
                startTransition(() => cb.current.setMusicZones(zones));
            }
        ));

        // ─── 17. MEASUREMENTS → startTransition ──────────────────────────────────
        unsubs.push(onSnapshot(
            query(collection(db, 'cartes', roomId, 'measurements'), where('cityId', '==', selectedCityId)),
            (snapshot) => {
                const ms = snapshot.docs.map(d => d.data() as SharedMeasurement);
                startTransition(() => cb.current.setMeasurements(ms));
            }
        ));

        return () => unsubs.forEach(u => u());
    }, [roomId, selectedCityId]);
}
