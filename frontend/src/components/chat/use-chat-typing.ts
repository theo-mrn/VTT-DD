'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCampaignEphemeral } from '@/lib/realtime';

/**
 * « Alice écrit… » : canal éphémère du temps réel (`chat.typing`, jamais enregistré).
 * Signalé au plus toutes les 3 s pendant la frappe d'un message à toute la table (jamais
 * pour un chuchotement : la table n'a pas à savoir qu'on chuchote), montré 6 s au plus.
 */
const KIND = 'chat.typing';
const SEND_EVERY_MS = 3_000;
const SHOW_MS = 6_000;

export function useChatTyping(campaignId: string, me: string) {
  const [typing, setTyping] = useState<ReadonlyMap<string, number>>(new Map());
  const { send } = useCampaignEphemeral<Record<string, never>>(campaignId, [KIND], (m) => {
    if (m.from.userId === me) return;
    setTyping((prev) => new Map(prev).set(m.from.userId, Date.now() + SHOW_MS));
  });
  const sendRef = useRef(send);
  sendRef.current = send;
  const lastSent = useRef(0);

  // Retire ceux qui se sont tus
  useEffect(() => {
    if (!typing.size) return;
    const next = Math.min(...typing.values());
    const timer = setTimeout(
      () =>
        setTyping((prev) => {
          const now = Date.now();
          return new Map([...prev].filter(([, until]) => until > now));
        }),
      Math.max(0, next - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [typing]);

  /** Je tape : signalé à la table, sans rafale. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = now;
    sendRef.current(KIND, {});
  }, []);

  /** Son message est arrivé : il n'écrit plus. */
  const clearTyping = useCallback((userId: string) => {
    setTyping((prev) => {
      if (!prev.has(userId)) return prev;
      const next = new Map(prev);
      next.delete(userId);
      return next;
    });
  }, []);

  /** Message envoyé : le prochain signal part tout de suite. */
  const resetTyping = useCallback(() => {
    lastSent.current = 0;
  }, []);

  return { typingIds: [...typing.keys()], notifyTyping, clearTyping, resetTyping };
}
