'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, messageErreur } from '@/lib/api';
import {
  chatApi,
  upsertChatMessages,
  type ChatAudience,
  type ChatMessage,
  type ChatUser,
} from '@/lib/campaign-chat';
import type { ThreadMessage } from './chat-format';

/**
 * Envois de la discussion, affichés tout de suite (optimistes) : « Envoi… », puis remplacés
 * par le message du serveur, ou marqués en échec avec leur raison (reprise ou abandon).
 * Un refus de débit (429) ouvre une attente (`cooldownUntil`, d'après `retry-after`) : le
 * message patiente et repart tout seul à la fin de l'attente.
 */

interface PendingSend {
  localId: string;
  body: string;
  audience: ChatAudience | null;
  /** Destinataires affichés en attendant la réponse. */
  recipients: ChatMessage['recipients'];
  createdAt: string;
  status: 'sending' | 'waiting' | 'failed';
  error: string | null;
}

export interface ChatOutbox {
  pending: ThreadMessage[];
  /** Fin de l'attente imposée par le service (ms), ou null. */
  cooldownUntil: number | null;
  send: (
    body: string,
    audience: ChatAudience | null,
    recipients: ChatMessage['recipients'],
  ) => void;
  retry: (localId: string) => void;
  discard: (localId: string) => void;
}

let sequence = 0;

export function useChatOutbox(campaignId: string, author: ChatUser): ChatOutbox {
  const client = useQueryClient();
  const [items, setItems] = useState<PendingSend[]>([]);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const deliver = useCallback(
    async (p: PendingSend) => {
      setItems((list) =>
        list.map((x) => (x.localId === p.localId ? { ...x, status: 'sending', error: null } : x)),
      );
      try {
        const message = await chatApi.post(campaignId, p.body, p.audience);
        upsertChatMessages(client, campaignId, [message]);
        setItems((list) => list.filter((x) => x.localId !== p.localId));
      } catch (err) {
        if (err instanceof ApiError && err.status === 429) {
          const seconds = err.problem.retryAfter ?? 60;
          setCooldownUntil(Date.now() + seconds * 1000);
          setItems((list) =>
            list.map((x) => (x.localId === p.localId ? { ...x, status: 'waiting' } : x)),
          );
          return;
        }
        const error = messageErreur(err, 'Serveur injoignable.');
        setItems((list) =>
          list.map((x) => (x.localId === p.localId ? { ...x, status: 'failed', error } : x)),
        );
      }
    },
    [client, campaignId],
  );

  // Fin de l'attente : les messages en attente repartent, dans l'ordre
  useEffect(() => {
    if (cooldownUntil === null) return;
    const timer = setTimeout(
      async () => {
        setCooldownUntil(null);
        for (const p of itemsRef.current.filter((x) => x.status === 'waiting')) await deliver(p);
      },
      Math.max(0, cooldownUntil - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [cooldownUntil, deliver]);

  const send = useCallback<ChatOutbox['send']>(
    (body, audience, recipients) => {
      sequence += 1;
      const p: PendingSend = {
        localId: `local-${Date.now()}-${sequence}`,
        body,
        audience,
        recipients,
        createdAt: new Date().toISOString(),
        status: 'sending',
        error: null,
      };
      setItems((list) => [...list, p]);
      void deliver(p);
    },
    [deliver],
  );

  const retry = useCallback(
    (localId: string) => {
      const p = itemsRef.current.find((x) => x.localId === localId);
      if (p) void deliver(p);
    },
    [deliver],
  );

  const discard = useCallback((localId: string) => {
    setItems((list) => list.filter((x) => x.localId !== localId));
  }, []);

  const pending = useMemo<ThreadMessage[]>(
    () =>
      items.map((p) => ({
        key: p.localId,
        message: {
          id: p.localId,
          author,
          body: p.body,
          recipients: p.recipients,
          createdAt: p.createdAt,
          editedAt: null,
        },
        pending: { status: p.status, error: p.error },
      })),
    [items, author],
  );

  return { pending, cooldownUntil, send, retry, discard };
}
