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

// ─── Utilitaire pour grouper les logs de déplacements (Debounce) ────────────────

interface PendingMove {
    charId: string;
    name: string;
    avatar: string;
    type: string;
    cityId: string | null;
    timestamp: number;
}

let pendingMoves: PendingMove[] = [];
let bufferTimeout: NodeJS.Timeout | null = null;
let lastGlobalMove: { cityId: string | null, timestamp: number } | null = null;

/**
 * Logue un déplacement individuel et le regroupe avec d'autres s'ils
 * interviennent dans la même fenêtre de temps courte (ex: changement de scène de groupe).
 */
export function logCharacterMoveBuffered(
    roomId: string,
    move: { charId: string, name: string, avatar: string, type: string, cityId: string | null },
    getCityName: (cityId: string) => Promise<string> | string
) {
    pendingMoves.push({ ...move, timestamp: Date.now() });

    if (bufferTimeout) clearTimeout(bufferTimeout);

    bufferTimeout = setTimeout(async () => {
        if (pendingMoves.length === 0) return;
        const moves = [...pendingMoves];
        pendingMoves = [];

        // Groupement par ville destination
        const groupedByCity: Record<string, PendingMove[]> = {};
        const returnedToGroup: PendingMove[] = [];

        moves.forEach(m => {
            if (m.cityId) {
                if (!groupedByCity[m.cityId]) groupedByCity[m.cityId] = [];
                groupedByCity[m.cityId].push(m);
            } else {
                returnedToGroup.push(m);
            }
        });

        for (const [cityId, charMoves] of Object.entries(groupedByCity)) {
            // Identifier si cela fait partie d'un déplacement global récent
            const globalMove = lastGlobalMove;
            if (globalMove && globalMove.cityId === cityId && (Date.now() - globalMove.timestamp < 3000)) {
                continue; // Suppressed: is part of the global group move already logged
            }

            const cityName = await getCityName(cityId);
            const names = charMoves.map(m => m.name);

            let message = '';
            if (names.length === 1) message = `**${names[0]}** a été déplacé vers : **${cityName}**.`;
            else if (names.length === 2) message = `**${names[0]}** et **${names[1]}** ont été déplacés vers : **${cityName}**.`;
            else {
                const last = names.pop();
                message = `**${names.join('**, **')}** et **${last}** ont été déplacés vers : **${cityName}**.`;
            }

            logHistoryEvent({
                roomId,
                type: 'deplacement',
                message,
                ...(charMoves.length === 1 ? {
                    characterId: charMoves[0].charId,
                    characterName: charMoves[0].name,
                    characterAvatar: charMoves[0].avatar,
                    characterType: charMoves[0].type
                } : {})
            });
        }

        if (returnedToGroup.length > 0) {
            const names = returnedToGroup.map(m => m.name);
            let message = '';
            if (names.length === 1) message = `**${names[0]}** a rejoint le groupe.`;
            else if (names.length === 2) message = `**${names[0]}** et **${names[1]}** ont rejoint le groupe.`;
            else {
                const last = names.pop();
                message = `**${names.join('**, **')}** et **${last}** ont rejoint le groupe.`;
            }

            logHistoryEvent({
                roomId,
                type: 'deplacement',
                message,
                ...(returnedToGroup.length === 1 ? {
                    characterId: returnedToGroup[0].charId,
                    characterName: returnedToGroup[0].name,
                    characterAvatar: returnedToGroup[0].avatar,
                    characterType: returnedToGroup[0].type
                } : {})
            });
        }

    }, 800);
}

/**
 * Indique qu'un mouvement global (de tout le groupe) vient d'être déclenché.
 * Permet au dé-bounceur de filtrer les déplacements persos redondants.
 */
export async function logGlobalMove(roomId: string, cityId: string | null, getCityName: (cityId: string) => Promise<string> | string) {
    if (!cityId) return;
    lastGlobalMove = { cityId, timestamp: Date.now() };
    const cityName = await getCityName(cityId);

    await logHistoryEvent({
        roomId,
        type: 'deplacement',
        message: `Le groupe s'est déplacé vers : **${cityName}**.`
    });
}
