/**
 * useCharacterBubbles.ts — Bulles d'interaction (emoji/texte) au-dessus des tokens
 *
 * Une bulle éphémère par personnage, affichée au-dessus de son token.
 * Canal éphémère du temps réel (l'ancien nœud RTDB `rooms/{roomId}/bubbles`),
 * expiration calculée côté client, state isolé de `characters` pour ne jamais
 * redéclencher le pipeline des personnages.
 *
 * Messages : `bubble.set` { characterId, content, type, authorId, durationMs }
 * et `bubble.clear` { characterId }. durationMs = 0 → bulle persistante, pas
 * d'expiration automatique (reste jusqu'à remplacement ou suppression manuelle).
 * Rien n'est gardé côté serveur : un joueur qui arrive ne voit que les bulles
 * envoyées après son arrivée.
 */

import { useEffect, useState, useCallback } from 'react';
import { useCampaignEphemeral } from '@/lib/realtime';

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

  // ─── Écoute unique de toutes les bulles de la campagne ───────────────────
  // L'horodatage est celui de réception : l'expiration ne dépend pas de l'horloge de l'autre.
  const { send } = useCampaignEphemeral<Record<string, unknown>>(
    roomId || null,
    ['bubble.set', 'bubble.clear'],
    (m) => {
      const characterId = String(m.data?.characterId ?? '');
      if (!characterId) return;
      if (m.kind === 'bubble.clear') {
        setBubbles((prev) => {
          if (!(characterId in prev)) return prev;
          const next = { ...prev };
          delete next[characterId];
          return next;
        });
        return;
      }
      const d = m.data as Partial<BubbleData>;
      setBubbles((prev) => ({
        ...prev,
        [characterId]: {
          content: String(d.content ?? ''),
          type: d.type === 'text' ? 'text' : 'emoji',
          authorId: String(d.authorId ?? m.from.userId),
          timestamp: Date.now(),
          durationMs: typeof d.durationMs === 'number' ? d.durationMs : DEFAULT_BUBBLE_DURATION_MS,
        },
      }));
    },
  );

  // ─── Expiration côté client (interval, comme les measurements temporaires) ──
  useEffect(() => {
    if (!roomId) return;

    const interval = setInterval(() => {
      const now = Date.now();
      setBubbles((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [characterId, bubble] of Object.entries(prev)) {
          if (!bubble.durationMs) continue; // 0/undefined → persistante, pas d'expiration
          if (now - bubble.timestamp > bubble.durationMs) {
            delete next[characterId];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, CLEANUP_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [roomId]);

  // ─── Écriture ciblée : envoyer/remplacer la bulle d'un personnage ───────
  // durationMs: 0 (ou PERSISTENT_BUBBLE_DURATION) → bulle persistante (pas d'expiration automatique)
  const sendBubble = useCallback(
    async (
      characterId: string,
      content: string,
      type: 'emoji' | 'text',
      authorId: string,
      durationMs: number = DEFAULT_BUBBLE_DURATION_MS,
    ) => {
      if (!roomId || !characterId) return;
      const clampedDuration =
        durationMs === PERSISTENT_BUBBLE_DURATION
          ? PERSISTENT_BUBBLE_DURATION
          : Math.min(Math.max(durationMs, MIN_BUBBLE_DURATION_MS), MAX_BUBBLE_DURATION_MS);
      const bubble: BubbleData = {
        content,
        type,
        authorId,
        timestamp: Date.now(),
        durationMs: clampedDuration,
      };
      setBubbles((prev) => ({ ...prev, [characterId]: bubble }));
      send('bubble.set', { characterId, content, type, authorId, durationMs: clampedDuration });
    },
    [roomId, send],
  );

  // ─── Suppression manuelle : retirer la bulle d'un personnage (utile pour les bulles persistantes) ──
  const clearBubble = useCallback(
    async (characterId: string) => {
      if (!roomId || !characterId) return;
      setBubbles((prev) => {
        if (!(characterId in prev)) return prev;
        const next = { ...prev };
        delete next[characterId];
        return next;
      });
      send('bubble.clear', { characterId });
    },
    [roomId, send],
  );

  return { bubbles, sendBubble, clearBubble };
}
