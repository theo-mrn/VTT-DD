'use client';

import { useEffect, useState } from 'react';
import { db, doc, onSnapshot } from '@/lib/firebase';
import { moduleRegistry } from '@/modules/registry';
import { dndClassicModule } from '@/modules/builtin/dnd-classic';
import type { GameSystemDefinition, StatDefinition } from './types';

const DEFAULT_GAME_SYSTEM_ID = 'dnd-classic';

export interface UseGameSystemResult {
  gameSystem: GameSystemDefinition;
  tableCustomStats: StatDefinition[];
  isLoading: boolean;
}

/**
 * Charge le système de règles actif d'une room (Salle/{roomId}.gameSystemId, défaut 'dnd-classic')
 * + les stats custom de table (Salle/{roomId}.customStats). Rétrocompatible par construction :
 * une room sans ces champs se comporte exactement comme avant (système dnd-classic, pas de custom).
 */
export function useGameSystem(roomId: string | null): UseGameSystemResult {
  const [gameSystemId, setGameSystemId] = useState<string>(DEFAULT_GAME_SYSTEM_ID);
  const [tableCustomStats, setTableCustomStats] = useState<StatDefinition[]>([]);
  const [overrideDefinition, setOverrideDefinition] = useState<GameSystemDefinition | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!roomId) {
      setGameSystemId(DEFAULT_GAME_SYSTEM_ID);
      setTableCustomStats([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = onSnapshot(doc(db, 'Salle', roomId), (snap) => {
      const data = snap.data();
      setGameSystemId((data?.gameSystemId as string) || DEFAULT_GAME_SYSTEM_ID);
      setTableCustomStats((data?.customStats as StatDefinition[]) || []);
      setIsLoading(false);
    }, () => setIsLoading(false));

    return () => unsubscribe();
  }, [roomId]);

  // Un gameSystemId sans module enregistré en mémoire (builtin/externe) est résolu comme un système
  // custom créé par le MJ : d'abord le catalogue partagé gameSystems/{id} (nouveau), sinon fallback sur
  // l'ancien chemin scopé à la room Salle/{roomId}/gameSystemOverrides/{id} (compat salles existantes).
  useEffect(() => {
    if (!roomId || moduleRegistry.getGameSystemModule(gameSystemId)) {
      setOverrideDefinition(null);
      return;
    }
    let unsubscribeLegacy: (() => void) | null = null;
    const unsubscribeCatalog = onSnapshot(doc(db, 'gameSystems', gameSystemId), (catalogSnap) => {
      if (catalogSnap.exists()) {
        unsubscribeLegacy?.();
        unsubscribeLegacy = null;
        setOverrideDefinition(catalogSnap.data() as GameSystemDefinition);
        return;
      }
      if (!unsubscribeLegacy) {
        unsubscribeLegacy = onSnapshot(doc(db, `Salle/${roomId}/gameSystemOverrides`, gameSystemId), (legacySnap) => {
          setOverrideDefinition(legacySnap.exists() ? (legacySnap.data() as GameSystemDefinition) : null);
        });
      }
    });
    return () => {
      unsubscribeCatalog();
      unsubscribeLegacy?.();
    };
  }, [roomId, gameSystemId]);

  const registered = moduleRegistry.getGameSystemModule(gameSystemId);
  const gameSystem = registered?.gameSystem ?? overrideDefinition ?? dndClassicModule.gameSystem;

  return { gameSystem, tableCustomStats, isLoading };
}
