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
  /** Chemin Firestore de la sous-collection de CONTENU du système actif (voies, bestiaire,
   *  équipement... — cf src/modules/game-content/) : gameSystems/{id}/content pour un système du
   *  catalogue (y compris le contenu seedé d'un builtin comme dnd-classic), ou
   *  Salle/{roomId}/gameSystemOverrides/{id}/content pour un système legacy scopé à la salle. */
  contentPath: string;
}

/** Champs NARRATIFS d'un système — seuls champs qu'un doc Firestore peut superposer à un module
 *  builtin (le contenu seedé de dnd-classic vit dans gameSystems/dnd-classic) : jamais les stats,
 *  formules ou règles de création, qui restent la source de vérité du module en mémoire. */
function narrativeOverlay(data: Partial<GameSystemDefinition>): Partial<GameSystemDefinition> {
  const overlay: Partial<GameSystemDefinition> = {};
  if (Array.isArray(data.races)) overlay.races = data.races;
  if (Array.isArray(data.profiles)) overlay.profiles = data.profiles;
  if (Array.isArray(data.rules)) overlay.rules = data.rules;
  if (typeof data.raceLabel === 'string') overlay.raceLabel = data.raceLabel;
  if (typeof data.profileLabel === 'string') overlay.profileLabel = data.profileLabel;
  return overlay;
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
  const [overrideSource, setOverrideSource] = useState<'catalog' | 'legacy' | null>(null);
  const [builtinOverlay, setBuiltinOverlay] = useState<Partial<GameSystemDefinition> | null>(null);
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
  // Un module builtin (ex dnd-classic) s'abonne AUSSI à gameSystems/{id} : son contenu NARRATIF seedé
  // (races, profils, règles — cf scripts/seed-game-content.mjs) est superposé au module, sans jamais
  // écraser ses stats/formules qui restent la source de vérité du code.
  useEffect(() => {
    const registered = moduleRegistry.getGameSystemModule(gameSystemId);

    if (registered) {
      setOverrideDefinition(null);
      setOverrideSource(null);
      const unsubscribe = onSnapshot(doc(db, 'gameSystems', gameSystemId), (snap) => {
        setBuiltinOverlay(snap.exists() ? narrativeOverlay(snap.data() as Partial<GameSystemDefinition>) : null);
      }, () => setBuiltinOverlay(null));
      return () => unsubscribe();
    }

    setBuiltinOverlay(null);
    if (!roomId) {
      setOverrideDefinition(null);
      setOverrideSource(null);
      return;
    }
    // Les callbacks d'erreur sont indispensables : sans eux, un refus de permission (ex utilisateur
    // pas encore authentifié) devient un "Uncaught Error in snapshot listener" dans la console.
    const subscribeLegacy = () => onSnapshot(doc(db, `Salle/${roomId}/gameSystemOverrides`, gameSystemId), (legacySnap) => {
      setOverrideDefinition(legacySnap.exists() ? (legacySnap.data() as GameSystemDefinition) : null);
      setOverrideSource(legacySnap.exists() ? 'legacy' : null);
    }, () => {
      setOverrideDefinition(null);
      setOverrideSource(null);
    });

    let unsubscribeLegacy: (() => void) | null = null;
    const unsubscribeCatalog = onSnapshot(doc(db, 'gameSystems', gameSystemId), (catalogSnap) => {
      if (catalogSnap.exists()) {
        unsubscribeLegacy?.();
        unsubscribeLegacy = null;
        setOverrideDefinition(catalogSnap.data() as GameSystemDefinition);
        setOverrideSource('catalog');
        return;
      }
      if (!unsubscribeLegacy) {
        unsubscribeLegacy = subscribeLegacy();
      }
    }, () => {
      // Lecture du catalogue refusée (ex pas encore connecté) : tenter quand même le chemin legacy
      // de la salle, qui a ses propres règles d'accès (membre de la salle).
      if (!unsubscribeLegacy) {
        unsubscribeLegacy = subscribeLegacy();
      }
    });
    return () => {
      unsubscribeCatalog();
      unsubscribeLegacy?.();
    };
  }, [roomId, gameSystemId]);

  const registered = moduleRegistry.getGameSystemModule(gameSystemId);
  const gameSystem = registered
    ? { ...registered.gameSystem, ...(builtinOverlay ?? {}) }
    : overrideDefinition ?? dndClassicModule.gameSystem;

  const contentPath = !registered && overrideSource === 'legacy' && roomId
    ? `Salle/${roomId}/gameSystemOverrides/${gameSystemId}/content`
    : `gameSystems/${registered || overrideDefinition ? gameSystemId : DEFAULT_GAME_SYSTEM_ID}/content`;

  return { gameSystem, tableCustomStats, isLoading, contentPath };
}
