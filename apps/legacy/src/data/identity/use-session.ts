'use client';

import { useSyncExternalStore } from 'react';
import { getServerSession, getSession, subscribeSession, type SessionState } from './session';

/**
 * Session courante (utilisateur + profil), lue depuis le store partagé.
 * Aucun appel réseau par composant : tous lisent le même état en mémoire.
 */
export function useSession(): SessionState {
    return useSyncExternalStore(subscribeSession, getSession, getServerSession);
}
