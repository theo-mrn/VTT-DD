'use client';

/**
 * Préférences de dés (skin, animation 3D, son, inventaire), partagées par
 * tous les panneaux ouverts : un seul chargement, mises à jour optimistes.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { DICE_SKINS } from '@/components/(dices)/dice-definitions';
import { errorMessage } from '@/lib/api';
import {
  getDicePreferences,
  updateDicePreferences,
  type DicePreferences,
  type DicePreferencesUpdate,
} from '@/lib/dice';
import { applyDiceSound } from './sound';

/** Repli quand le service ne répond pas : dés à plat (le canevas 3D est coûteux). */
const FALLBACK: DicePreferences = {
  skinId: 'gold',
  animation3d: false,
  sound: true,
  inventory: [],
};

interface State {
  prefs: DicePreferences;
  loaded: boolean;
  error: string | null;
}

let state: State = { prefs: FALLBACK, loaded: false, error: null };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function load() {
  if (!loading) {
    loading = getDicePreferences()
      .then((prefs) => set({ prefs: { ...FALLBACK, ...prefs }, loaded: true, error: null }))
      .catch((e) => {
        set({ loaded: true, error: errorMessage(e) });
        loading = null;
      });
  }
  return loading;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Skins utilisables : l'inventaire et les skins gratuits du catalogue. */
export function ownedSkins(prefs: DicePreferences): string[] {
  const owned = new Set(prefs.inventory);
  for (const s of Object.values(DICE_SKINS)) if (s.price === 0) owned.add(s.id);
  return Object.keys(DICE_SKINS).filter((id) => owned.has(id));
}

export function useDicePreferences() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (current.loaded) applyDiceSound(current.prefs.sound);
  }, [current.loaded, current.prefs.sound]);

  const update = useCallback(async (patch: DicePreferencesUpdate) => {
    const previous = state.prefs;
    set({ prefs: { ...previous, ...patch }, error: null });
    try {
      const saved = await updateDicePreferences(patch);
      set({ prefs: { ...FALLBACK, ...saved } });
    } catch (e) {
      set({ prefs: previous, error: errorMessage(e) });
    }
  }, []);

  return { ...current, update };
}
