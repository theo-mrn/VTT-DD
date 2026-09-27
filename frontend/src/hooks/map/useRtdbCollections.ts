/**
 * useRtdbCollections.ts — Dessins, obstacles et textes de la carte suivie
 *
 * Même signature que dans l'ancienne app, où il écoutait les nœuds RTDB
 * `rooms/{r}/drawings|obstacles|notes` et filtrait par cityId côté client. Ces
 * couches viennent maintenant de l'état partagé de la carte (map-store.ts :
 * chargement REST puis événements `map_drawing.*`, `map_obstacle.*`,
 * `map_note.*`), déjà limité à la carte suivie. La migration Firestore → RTDB
 * et l'éclatement des polygones en murs sont faits par l'import côté serveur.
 */

import { useEffect, useRef, startTransition } from 'react';
import { useMapStore } from '@/hooks/map/map-store';
import { toLegacyDrawing, toLegacyNote, toLegacyObstacle } from '@/hooks/map/map-adapters';

import type { SavedDrawing, MapText } from '@/app/(campaigns)/campaigns/[id]/play/map/types';
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
  _selectedCityId: string | null,
  callbacks: RtdbCollectionsCallbacks,
) {
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

  const data = useMapStore(roomId).data;
  const drawings = data?.drawings;
  const notes = data?.notes;
  const obstacles = data?.obstacles;

  // Drawings
  useEffect(() => {
    const drws = (drawings ?? []).map(toLegacyDrawing);
    startTransition(() => cb.current.setDrawings(drws));
  }, [drawings]);

  // Notes
  useEffect(() => {
    const texts = (notes ?? []).map(toLegacyNote);
    startTransition(() => cb.current.setNotes(texts));
  }, [notes]);

  // Obstacles
  useEffect(() => {
    cb.current.setObstacles((obstacles ?? []).map(toLegacyObstacle));
  }, [obstacles]);
}
