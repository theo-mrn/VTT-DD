/** Amis et demandes d'amitié (service identity). */
import { useCallback, useState } from 'react';
import { api, errorMessage } from './api';
import { useResource } from './resource';

export interface Friend {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  since: string;
}

export interface FriendRequest {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface FriendRequests {
  received: FriendRequest[];
  sent: FriendRequest[];
}

export function getFriends() {
  return api<Friend[]>('/v1/friends');
}

export function getFriendRequests() {
  return api<FriendRequests>('/v1/friends/requests');
}

/** 'accepted' si l'autre joueur nous avait déjà envoyé une demande. 409 si déjà amis ou déjà demandé. */
export function sendFriendRequest(playerId: string) {
  return api<{ status: 'pending' | 'accepted' }>('/v1/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ userId: playerId }),
  });
}

export function acceptFriendRequest(playerId: string) {
  return api<void>(`/v1/friends/requests/${encodeURIComponent(playerId)}/accept`, {
    method: 'POST',
  });
}

/** Refuse une demande reçue ou annule une demande envoyée. */
export function deleteFriendRequest(playerId: string) {
  return api<void>(`/v1/friends/requests/${encodeURIComponent(playerId)}`, { method: 'DELETE' });
}

export function removeFriend(playerId: string) {
  return api<void>(`/v1/friends/${encodeURIComponent(playerId)}`, { method: 'DELETE' });
}

// ─── Hook de domaine ─────────────────────────────────────────────────────────

export type Relation = 'moi' | 'ami' | 'recue' | 'envoyee' | 'aucune';

/**
 * Amis et demandes de l'utilisateur, relation avec un joueur donné, et actions
 * (chaque action recharge les listes, puisqu'elle peut en modifier deux à la fois).
 */
export function useRelations(myId: string) {
  const friends = useResource('amis', getFriends);
  const requests = useResource('demandes-amis', getFriendRequests);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { reload: reloadFriends } = friends;
  const { reload: reloadRequests } = requests;

  const relation = (id: string): Relation => {
    if (id === myId) return 'moi';
    if (friends.data?.some((a) => a.id === id)) return 'ami';
    if (requests.data?.received.some((d) => d.id === id)) return 'recue';
    if (requests.data?.sent.some((d) => d.id === id)) return 'envoyee';
    return 'aucune';
  };

  const act = useCallback(
    async (playerId: string, action: (id: string) => Promise<unknown>) => {
      setBusy(playerId);
      setError(null);
      try {
        await action(playerId);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        return false;
      } finally {
        await Promise.all([reloadFriends(), reloadRequests()]);
        setBusy(null);
      }
    },
    [reloadFriends, reloadRequests],
  );

  return { friends, requests, relation, act, busy, error };
}
