/**
 * useRtdbCollections.ts — Hook RTDB pour drawings, obstacles et notes
 *
 * Remplace les listeners Firestore de useMapData.ts pour ces 3 collections.
 * Un listener unique par collection, filtrage par cityId côté client.
 * Migration one-shot depuis Firestore au premier chargement.
 */

import { useEffect, useRef, startTransition } from 'react';
import { ref, onValue, get, update } from 'firebase/database';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { realtimeDb, db } from '@/lib/firebase';

import type { SavedDrawing, MapText } from '@/app/[roomid]/map/types';
import type { Obstacle } from '@/lib/visibility';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RtdbCollectionsCallbacks {
    setDrawings: (drawings: SavedDrawing[]) => void;
    setNotes: (notes: MapText[]) => void;
    setObstacles: (obs: Obstacle[]) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRtdbCollections(
    roomId: string,
    selectedCityId: string | null,
    callbacks: RtdbCollectionsCallbacks
) {
    const cb = useRef(callbacks);
    useEffect(() => { cb.current = callbacks; });

    const cityIdRef = useRef(selectedCityId);
    useEffect(() => { cityIdRef.current = selectedCityId; });

    // Données brutes RTDB (toutes les villes mélangées)
    const rawDrawingsRef = useRef<Record<string, any>>({});
    const rawObstaclesRef = useRef<Record<string, any>>({});
    const rawNotesRef = useRef<Record<string, any>>({});

    // ─── Filtrage par cityId et dispatch aux setters ─────────────────────────
    const refilter = useRef(() => {
        const cityId = cityIdRef.current;
        const c = cb.current;

        // Drawings
        const drws: SavedDrawing[] = [];
        for (const [id, data] of Object.entries(rawDrawingsRef.current)) {
            if (id === '_migrated') continue;
            if (data.cityId !== cityId) continue;
            const points = data.points || data.paths;
            if (points && Array.isArray(points)) {
                drws.push({ id, points, color: data.color || '#000000', width: data.width || 5, type: data.type || 'pen' });
            }
        }
        startTransition(() => c.setDrawings(drws));

        // Notes
        const texts: MapText[] = [];
        for (const [id, data] of Object.entries(rawNotesRef.current)) {
            if (id === '_migrated') continue;
            if (data.cityId !== cityId) continue;
            texts.push({
                id,
                text: data.content ?? data.text ?? '',
                x: data.x || 0,
                y: data.y || 0,
                color: data.color || 'yellow',
                fontSize: data.fontSize,
                fontFamily: data.fontFamily,
            });
        }
        startTransition(() => c.setNotes(texts));

        // Obstacles
        const obs: Obstacle[] = [];
        for (const [id, data] of Object.entries(rawObstaclesRef.current)) {
            if (id === '_migrated') continue;
            if (data.cityId !== cityId) continue;
            obs.push({
                id,
                type: data.type || 'wall',
                points: data.points || [],
                color: data.color,
                opacity: data.opacity,
                direction: data.direction,
                isOpen: data.isOpen,
                isLocked: data.isLocked,
                edges: data.edges,
            });
        }
        c.setObstacles(obs);
    });

    // Mettre à jour la closure de refilter
    useEffect(() => {
        refilter.current = () => {
            const cityId = cityIdRef.current;
            const c = cb.current;

            const drws: SavedDrawing[] = [];
            for (const [id, data] of Object.entries(rawDrawingsRef.current)) {
                if (id === '_migrated') continue;
                if (data.cityId !== cityId) continue;
                const points = data.points || data.paths;
                if (points && Array.isArray(points)) {
                    drws.push({ id, points, color: data.color || '#000000', width: data.width || 5, type: data.type || 'pen' });
                }
            }
            startTransition(() => c.setDrawings(drws));

            const texts: MapText[] = [];
            for (const [id, data] of Object.entries(rawNotesRef.current)) {
                if (id === '_migrated') continue;
                if (data.cityId !== cityId) continue;
                texts.push({
                    id,
                    text: data.content ?? data.text ?? '',
                    x: data.x || 0,
                    y: data.y || 0,
                    color: data.color || 'yellow',
                    fontSize: data.fontSize,
                    fontFamily: data.fontFamily,
                });
            }
            startTransition(() => c.setNotes(texts));

            const obs: Obstacle[] = [];
            for (const [id, data] of Object.entries(rawObstaclesRef.current)) {
                if (id === '_migrated') continue;
                if (data.cityId !== cityId) continue;
                obs.push({
                    id,
                    type: data.type || 'wall',
                    points: data.points || [],
                    color: data.color,
                    opacity: data.opacity,
                    direction: data.direction,
                    isOpen: data.isOpen,
                    isLocked: data.isLocked,
                    edges: data.edges,
                    roomMode: data.roomMode,
                });
            }
            c.setObstacles(obs);
        };
    });

    // ─── Listeners RTDB (1 par collection, dépend uniquement de roomId) ──────
    useEffect(() => {
        if (!roomId) return;

        const drawingsRef = ref(realtimeDb, `rooms/${roomId}/drawings`);
        const obstaclesRef = ref(realtimeDb, `rooms/${roomId}/obstacles`);
        const notesRef = ref(realtimeDb, `rooms/${roomId}/notes`);

        const unsub1 = onValue(drawingsRef, (snapshot) => {
            rawDrawingsRef.current = snapshot.val() || {};
            refilter.current();
        });

        const unsub2 = onValue(obstaclesRef, (snapshot) => {
            const data = snapshot.val() || {};

            // Auto-migration : convertir polygons/rectangles en murs individuels
            const migrations: Record<string, any> = {};
            for (const [id, obsData] of Object.entries(data) as [string, any][]) {
                if (obsData.type === 'polygon' && obsData.points?.length >= 3) {
                    const points = obsData.points;
                    const edges = obsData.edges || [];
                    for (let i = 0; i < points.length; i++) {
                        const next = (i + 1) % points.length;
                        const edge = edges[i];
                        const wallData: Record<string, any> = {
                            type: edge?.type || 'wall',
                            points: [points[i], points[next]],
                            cityId: obsData.cityId,
                        };
                        if (edge?.direction) wallData.direction = edge.direction;
                        if (edge?.isOpen !== undefined) wallData.isOpen = edge.isOpen;
                        migrations[`${id}_e${i}`] = wallData;
                    }
                    migrations[id] = null; // supprimer le polygon original
                } else if (obsData.type === 'rectangle' && obsData.points?.length >= 2) {
                    const [tl, br] = obsData.points;
                    const tr = { x: br.x, y: tl.y };
                    const bl = { x: tl.x, y: br.y };
                    const rectWalls = [
                        [tl, tr], [tr, br], [br, bl], [bl, tl]
                    ];
                    for (let i = 0; i < rectWalls.length; i++) {
                        migrations[`${id}_e${i}`] = {
                            type: 'wall',
                            points: rectWalls[i],
                            cityId: obsData.cityId,
                        };
                    }
                    migrations[id] = null; // supprimer le rectangle original
                }
            }

            if (Object.keys(migrations).length > 0) {
                console.log('[Migration] Converting polygons/rectangles to individual walls...');
                update(obstaclesRef, migrations).catch(err => {
                    console.error('[Migration] Error converting polygons:', err);
                });
                // L'update déclenchera un nouveau onValue avec les données migrées
                return;
            }

            rawObstaclesRef.current = data;
            refilter.current();
        });

        const unsub3 = onValue(notesRef, (snapshot) => {
            rawNotesRef.current = snapshot.val() || {};
            refilter.current();
        });

        return () => { unsub1(); unsub2(); unsub3(); };
    }, [roomId]);

    // ─── Refiltrer quand la ville change ─────────────────────────────────────
    useEffect(() => {
        refilter.current();
    }, [selectedCityId]);

    // ─── Migration one-shot : Firestore → RTDB ──────────────────────────────
    useEffect(() => {
        if (!roomId) return;

        const migrateRef = ref(realtimeDb, `rooms/${roomId}/_migrations/drawings_obstacles_notes`);

        get(migrateRef).then(async (snapshot) => {
            if (snapshot.val()) return;

            console.log('[RTDB Migration] Seeding drawings, obstacles, notes from Firestore...');

            const updates: Record<string, any> = {};
            let count = 0;

            // Drawings
            const drawingsSnap = await getDocs(collection(db, 'cartes', roomId, 'drawings'));
            drawingsSnap.docs.forEach(doc => {
                updates[`drawings/${doc.id}`] = doc.data();
                count++;
            });

            // Obstacles
            const obstaclesSnap = await getDocs(collection(db, 'cartes', roomId, 'obstacles'));
            obstaclesSnap.docs.forEach(doc => {
                updates[`obstacles/${doc.id}`] = doc.data();
                count++;
            });

            // Notes (text)
            const notesSnap = await getDocs(collection(db, 'cartes', roomId, 'text'));
            notesSnap.docs.forEach(doc => {
                updates[`notes/${doc.id}`] = doc.data();
                count++;
            });

            updates['_migrations/drawings_obstacles_notes'] = true;

            const rootRef = ref(realtimeDb, `rooms/${roomId}`);
            await update(rootRef, updates);

            console.log(`[RTDB Migration] Seeded ${count} documents (drawings + obstacles + notes)`);
        }).catch(err => {
            console.error('[RTDB Migration] Error:', err);
        });
    }, [roomId]);
}
