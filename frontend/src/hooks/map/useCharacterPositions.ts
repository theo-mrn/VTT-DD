/**
 * useCharacterPositions.ts — Positions des personnages en temps réel
 *
 * Dans l'ancienne app : un listener RTDB `rooms/{roomId}/positions` dont les
 * positions recouvraient celles de Firestore. Ici, la position durable est
 * celle du token (map-store.ts) ; ce hook ne garde que les positions
 * **pendant** un glissement fait par un autre client (canal éphémère
 * `token.drag`), qui recouvrent les tokens jusqu'à l'arrivée de l'état final.
 *
 * Structure : positionsRef.current[characterId] = { x, y }
 */

import { useEffect, useRef, useCallback } from 'react';
import { moveCharacters } from '@/hooks/map/map-writes';
import { getDragPositions, onDragPositions } from '@/hooks/map/map-ephemeral';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CharacterPositionData {
  x: number;
  y: number;
  positions?: Record<string, { x: number; y: number }>;
}

export type PositionsMap = Record<string, CharacterPositionData>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCharacterPositions(roomId: string, onPositionsChange: () => void) {
  const positionsRef = useRef<PositionsMap>({});
  const onChangeRef = useRef(onPositionsChange);
  useEffect(() => {
    onChangeRef.current = onPositionsChange;
  });

  // ─── Écoute des glissements en cours (canal éphémère) ────────────────────
  useEffect(() => {
    if (!roomId) return;
    const sync = () => {
      const next: PositionsMap = {};
      for (const d of Object.values(getDragPositions())) next[d.characterId] = { x: d.x, y: d.y };
      positionsRef.current = next;
      onChangeRef.current();
    };
    sync();
    return onDragPositions(sync);
  }, [roomId]);

  // ─── Écriture : position sur la carte suivie ─────────────────────────────
  const updateCharacterPosition = useCallback(
    async (characterId: string, pos: { x: number; y: number }) => {
      if (!roomId) return;
      await moveCharacters(roomId, [{ characterId, pos }]);
    },
    [roomId],
  );

  // ─── Écriture : position dans une scène (la carte suivie) ────────────────
  const updateCityPosition = useCallback(
    async (characterId: string, _cityId: string, x: number, y: number) => {
      if (!roomId) return;
      await moveCharacters(roomId, [{ characterId, pos: { x, y } }]);
    },
    [roomId],
  );

  return {
    positionsRef,
    updateCharacterPosition,
    updateCityPosition,
  };
}
