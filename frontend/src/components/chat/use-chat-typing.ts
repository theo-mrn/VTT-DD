'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useCampaignEphemeral } from '@/lib/realtime';

/**
 * « Alice écrit… » : canal éphémère du temps réel (`chat.typing`, jamais enregistré).
 * Signalé au plus toutes les 3 s pendant la frappe d'un message à toute la table (jamais
 * pour un chuchotement : la table n'a pas à savoir qu'on chuchote), montré 6 s au plus.
 *
 * Qui écrit est tenu hors de React (`TypingStore`) : seul l'indicateur le lit
 * (`useTypingIds`), la discussion ne se re-rend pas à chaque signal.
 */
const KIND = 'chat.typing';
const SEND_EVERY_MS = 3_000;
const SHOW_MS = 6_000;

const NOBODY: readonly string[] = [];

export interface TypingStore {
  ids: () => readonly string[];
  subscribe: (listener: () => void) => () => void;
}

function createTypingStore() {
  const until = new Map<string, number>();
  const listeners = new Set<() => void>();
  let ids: readonly string[] = NOBODY;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const changed = () => {
    ids = until.size ? [...until.keys()] : NOBODY;
    for (const l of listeners) l();
  };
  // Retire ceux qui se sont tus, au plus tôt de leurs échéances
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!until.size) return;
    const next = Math.min(...until.values());
    timer = setTimeout(
      () => {
        const now = Date.now();
        let removed = false;
        for (const [id, t] of until)
          if (t <= now) {
            until.delete(id);
            removed = true;
          }
        if (removed) changed();
        schedule();
      },
      Math.max(0, next - Date.now()) + 50,
    );
  };

  return {
    ids: () => ids,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    typing(userId: string) {
      const known = until.has(userId);
      until.set(userId, Date.now() + SHOW_MS);
      if (!known) changed();
      schedule();
    },
    clear(userId: string) {
      if (!until.delete(userId)) return;
      changed();
      schedule();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

export function useChatTyping(campaignId: string, me: string) {
  const [store] = useState(createTypingStore);
  useEffect(() => () => store.dispose(), [store]);
  const { send } = useCampaignEphemeral<Record<string, never>>(campaignId, [KIND], (m) => {
    if (m.from.userId === me) return;
    store.typing(m.from.userId);
  });
  const sendRef = useRef(send);
  sendRef.current = send;
  const lastSent = useRef(0);

  /** Je tape : signalé à la table, sans rafale. */
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current < SEND_EVERY_MS) return;
    lastSent.current = now;
    sendRef.current(KIND, {});
  }, []);

  /** Son message est arrivé : il n'écrit plus. */
  const clearTyping = useCallback((userId: string) => store.clear(userId), [store]);

  /** Message envoyé : le prochain signal part tout de suite. */
  const resetTyping = useCallback(() => {
    lastSent.current = 0;
  }, []);

  return { store: store as TypingStore, notifyTyping, clearTyping, resetTyping };
}

/** Qui écrit en ce moment (même tableau tant que rien ne change). */
export function useTypingIds(store: TypingStore): readonly string[] {
  return useSyncExternalStore(store.subscribe, store.ids, () => NOBODY);
}
