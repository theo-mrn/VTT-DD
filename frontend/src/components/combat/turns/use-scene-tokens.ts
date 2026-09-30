/**
 * Tokens de la scène affichée à la table (carte montée dans l'onglet), pour présélectionner
 * les participants d'un combat et retrouver le token d'un PNJ tombé. Sans carte affichée :
 * aucun token (le MJ coche lui-même).
 */
'use client';

import { useSyncExternalStore } from 'react';
import { useActiveMap } from '@/lib/map/active-map';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { TOKENS_COLLECTION, type TokenData } from '@/lib/map/modules/tokens/model';
import type { MapDto } from '@/lib/map/store/map-store';
import type { SceneToken } from './model';

const NONE: ReadonlyMap<string, MapDto> = new Map();
const noop = () => () => {};

/** Tokens de la scène (brouillons de pose exclus). */
export function tokensOf(engine: MapEngine | null): TokenData[] {
  const layer = engine?.store.getState().collections[TOKENS_COLLECTION] ?? NONE;
  return [...layer.values()].map((t) => t as TokenData).filter((t) => !t.draft);
}

export function useSceneTokens(campaignId: string): {
  engine: MapEngine | null;
  tokens: SceneToken[];
} {
  const { engine } = useActiveMap(campaignId);
  const layer = useSyncExternalStore(
    engine ? engine.store.subscribe : noop,
    () => engine?.store.getState().collections[TOKENS_COLLECTION] ?? NONE,
    () => NONE,
  );
  const tokens = [...layer.values()]
    .map((t) => t as TokenData)
    .filter((t) => !t.draft)
    .map((t) => ({ characterId: t.characterId, visibility: t.visibility }));
  return { engine, tokens };
}
