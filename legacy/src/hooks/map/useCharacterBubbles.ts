/**
 * useCharacterBubbles.ts — Hook RTDB pour les bulles d'interaction (emoji/texte)
 *
 * Une bulle éphémère par personnage, affichée au-dessus de son token.
 * Écoute unique sur toute la room, expiration calculée côté client (pattern
 * identique à global_sounds dans useMapData.ts), state isolé de `characters`
 * pour ne jamais redéclencher le pipeline de merge Firestore+RTDB des personnages.
 *
 * Structure RTDB : rooms/{roomId}/bubbles/{characterId}
 *   { content, type: 'emoji' | 'text', authorId, timestamp, durationMs }
 *   durationMs = 0 → bulle persistante, pas d'expiration automatique
 *   (reste jusqu'à remplacement par une nouvelle bulle ou suppression manuelle)
 *
 *   ⚠️ On n'utilise PAS `null` pour représenter "persistante" : Firebase RTDB traite
 *   une valeur `null` passée à update() comme une instruction de SUPPRESSION de la
 *   clé — le champ durationMs ne serait alors jamais écrit, et sa lecture retomberait
 *   sur `undefined` (interprété comme la durée par défaut, pas comme "infini").
 */

import { useEffect, useState, useCallback } from 'react';
import { ref, onValue, update, remove } from 'firebase/database';
import { realtimeDb } from '@/lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BubbleData {
    content: string;
    type: 'emoji' | 'text';
    authorId: string;
    timestamp: number;
    durationMs: number;
}

export type BubblesMap = Record<string, BubbleData>;

export const DEFAULT_BUBBLE_DURATION_MS = 5000;
export const MIN_BUBBLE_DURATION_MS = 1000;
export const MAX_BUBBLE_DURATION_MS = 60000;
/** Valeur à passer à sendBubble pour une bulle qui ne disparaît jamais toute seule (0 = pas de TTL). */
export const PERSISTENT_BUBBLE_DURATION = 0;

const CLEANUP_INTERVAL_MS = 1000;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCharacterBubbles(roomId: string) {
    const [bubbles, setBubbles] = useState<BubblesMap>({});

    // ─── Listener unique sur toutes les bulles de la room ────────────────────
    useEffect(() => {
        if (!roomId) return;
        const bubblesRef = ref(realtimeDb, `rooms/${roomId}/bubbles`);

        const unsubscribe = onValue(bubblesRef, (snapshot) => {
            setBubbles((snapshot.val() as BubblesMap) || {});
        });

        return () => unsubscribe();
    }, [roomId]);

    // ─── Expiration côté client (interval, comme les measurements temporaires) ──
    useEffect(() => {
        if (!roomId) return;

        const interval = setInterval(() => {
            const now = Date.now();
            setBubbles(prev => {
                let changed = false;
                const next = { ...prev };
                for (const [characterId, bubble] of Object.entries(prev)) {
                    if (!bubble.durationMs) continue; // 0/undefined → persistante, pas d'expiration
                    if (now - bubble.timestamp > bubble.durationMs) {
                        delete next[characterId];
                        changed = true;
                        // Nettoyage RTDB best-effort : pas de garde d'ownership,
                        // une double-suppression concurrente est un no-op sans risque.
                        remove(ref(realtimeDb, `rooms/${roomId}/bubbles/${characterId}`)).catch(() => { });
                    }
                }
                return changed ? next : prev;
            });
        }, CLEANUP_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [roomId]);

    // ─── Écriture ciblée : envoyer/remplacer la bulle d'un personnage ───────
    // durationMs: 0 (ou PERSISTENT_BUBBLE_DURATION) → bulle persistante (pas d'expiration automatique)
    const sendBubble = useCallback(async (
        characterId: string,
        content: string,
        type: 'emoji' | 'text',
        authorId: string,
        durationMs: number = DEFAULT_BUBBLE_DURATION_MS
    ) => {
        if (!roomId || !characterId) return;
        const clampedDuration = durationMs === PERSISTENT_BUBBLE_DURATION
            ? PERSISTENT_BUBBLE_DURATION
            : Math.min(Math.max(durationMs, MIN_BUBBLE_DURATION_MS), MAX_BUBBLE_DURATION_MS);
        const bubbleRef = ref(realtimeDb, `rooms/${roomId}/bubbles/${characterId}`);
        await update(bubbleRef, { content, type, authorId, timestamp: Date.now(), durationMs: clampedDuration });
    }, [roomId]);

    // ─── Suppression manuelle : retirer la bulle d'un personnage (utile pour les bulles persistantes) ──
    const clearBubble = useCallback(async (characterId: string) => {
        if (!roomId || !characterId) return;
        setBubbles(prev => {
            if (!(characterId in prev)) return prev;
            const next = { ...prev };
            delete next[characterId];
            return next;
        });
        await remove(ref(realtimeDb, `rooms/${roomId}/bubbles/${characterId}`)).catch(() => { });
    }, [roomId]);

    return { bubbles, sendBubble, clearBubble };
}
