import { db, addDoc, collection, serverTimestamp } from '@/lib/firebase';

export type EventType =
    | 'creation'
    | 'combat'
    | 'mort'
    | 'niveau'
    | 'stats'
    | 'inventaire'
    | 'competence'
    | 'note'
    | 'deplacement'
    | 'info';

export interface GameEventPayload {
    roomId: string;
    type: EventType;
    message: string;
    characterId?: string;
    characterName?: string;
    characterAvatar?: string;
    characterType?: string;
    targetUserId?: string;
    details?: Record<string, any>;
}

/**
 * Enregistre un événement dans l'historique de manière active (action-based).
 * Remplace l'ancien système passif basé sur des centaines de onSnapshot.
 */
export async function logHistoryEvent(payload: GameEventPayload) {
    if (!payload.roomId) return;

    try {
        const { roomId, ...eventData } = payload;
        await addDoc(collection(db, `Historique/${roomId}/events`), {
            ...eventData,
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Erreur lors de l'enregistrement de l'historique:", err);
    }
}
