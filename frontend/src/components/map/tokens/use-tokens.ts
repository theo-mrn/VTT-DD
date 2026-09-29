'use client';

/**
 * Accès React au module `tokens` d'un moteur : son état (bibliothèque, annuaire), par
 * sélecteurs à instantané stable.
 */
import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { CharacterInfo } from '@/lib/map/modules/tokens/model';
import { tokensStateOf, type LibraryState, type TokensState } from '@/lib/map/modules/tokens/state';

export function useTokens(engine: MapEngine): TokensState {
  const state = tokensStateOf(engine);
  if (!state) throw new Error('Module « tokens » absent de la carte');
  return state;
}

export function useLibrary<T>(tokens: TokensState, selector: (s: LibraryState) => T): T {
  return useStore(tokens.library, selector);
}

/** Personnage d'un token (nom, portrait, camp, ressource), relu quand l'annuaire change. */
export function useCharacterInfo(
  tokens: TokensState,
  characterId: string | null,
): CharacterInfo | undefined {
  const get = () => (characterId ? tokens.directory.get(characterId) : undefined);
  return useSyncExternalStore((cb) => tokens.directory.subscribe(() => cb()), get, get);
}
