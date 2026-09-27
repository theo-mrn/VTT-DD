/**
 * Préférences de dés (service dice, docs/api-dice.md) : skin équipé, animation
 * 3D, son, skins possédés. Une seule requête partagée par la table de dés, le
 * lanceur rapide et la boutique ; mises à jour optimistes, annulées si le
 * service refuse (skin non possédé…).
 *
 * Un skin est possédé si `allSkins` (accès à tout le catalogue, ancien
 * premium) ou s'il figure dans `inventory` (gratuits compris) : la règle de
 * l'API, appliquée telle quelle par la boutique.
 */
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api';
import { setDiceSound } from './dice-throw';

// ─── Contrat de l'API ────────────────────────────────────────────────────────

export interface DicePreferences {
  skinId: string;
  animation3d: boolean;
  sound: boolean;
  /** Accès à tous les skins du catalogue (ancien premium, plus tard l'abonnement). */
  allSkins: boolean;
  /** Skins possédés en propre (gratuits et débloqués), dans l'ordre du catalogue. */
  inventory: string[];
}

export type DicePreferencesUpdate = Partial<
  Pick<DicePreferences, 'skinId' | 'animation3d' | 'sound'>
>;

/** Valeurs par défaut du service (skin « gold » de l'ancienne app). */
export const DEFAULT_DICE_PREFERENCES: DicePreferences = {
  skinId: 'gold',
  animation3d: true,
  sound: true,
  allSkins: false,
  inventory: [],
};

export const dicePreferencesApi = {
  read: () => api<DicePreferences>('/v1/dice/me/preferences'),
  /** Le skin choisi doit être possédé, sinon 403 `skin_not_owned`. */
  update: (patch: DicePreferencesUpdate) =>
    api<DicePreferences>('/v1/dice/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};

export const dicePreferencesKey = ['des', 'preferences'] as const;

/** Règle de l'API : `allSkins`, ou skin dans l'inventaire. */
export function ownsSkin(prefs: DicePreferences, skinId: string): boolean {
  return prefs.allSkins || prefs.inventory.includes(skinId);
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

const lire = async () => ({ ...DEFAULT_DICE_PREFERENCES, ...(await dicePreferencesApi.read()) });

/** Options de la requête, pour la lire hors d'un composant (`ensureQueryData`). */
export const dicePreferencesQuery = {
  queryKey: dicePreferencesKey,
  queryFn: lire,
  staleTime: 5 * 60_000,
};

export function useDicePreferences() {
  const query = useQuery(dicePreferencesQuery);
  const sound = query.data?.sound;
  // Le lanceur 3D lit le son dans son store : il suit la préférence
  useEffect(() => {
    if (sound !== undefined) setDiceSound(sound);
  }, [sound]);
  return query;
}

/** Modifie les préférences : appliqué tout de suite, annulé si le service refuse. */
export function useUpdateDicePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: dicePreferencesApi.update,
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: dicePreferencesKey });
      const previous = client.getQueryData<DicePreferences>(dicePreferencesKey);
      if (previous) client.setQueryData(dicePreferencesKey, { ...previous, ...patch });
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) client.setQueryData(dicePreferencesKey, context.previous);
    },
    onSuccess: (saved) =>
      client.setQueryData(dicePreferencesKey, { ...DEFAULT_DICE_PREFERENCES, ...saved }),
  });
}
