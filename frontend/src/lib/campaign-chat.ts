/**
 * Discussion d'une campagne : service campaign (`/v1/campaigns/:id/messages`, contrat dans
 * docs/api-campaign.md), tenue à jour par le temps réel.
 *
 * - Lecture par pages, du plus ancien au plus récent : la dernière page d'abord, les
 *   précédentes à la demande (`before`). Le serveur ne renvoie que les messages lisibles par
 *   l'appelant (chuchotements compris).
 * - Temps réel : `campaign.message_posted`, `_updated`, `_deleted` ne portent jamais le texte.
 *   Un message posté déclenche un rattrapage (`after` le dernier connu), une modification une
 *   relecture du message, une suppression le retire du cache. Une reprise sans rejeu possible
 *   (`generation`) rattrape aussi ; temps réel coupé : rattrapage périodique.
 * - Le cache n'est jamais relu en entier (les pages précédentes chargées resteraient
 *   incohérentes) : il n'est modifié que par ces rattrapages et par les réponses d'écriture.
 */
'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { api, ApiError } from './api';
import { useCampaignEvents, type RealtimeEnvelope } from './realtime';

// ─── Types du contrat ────────────────────────────────────────────────────────

export interface ChatUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Destinataires d'un chuchotement ; `gm` : adressé aux MJ de la campagne. */
export interface ChatRecipients {
  gm: boolean;
  users: ChatUser[];
}

export interface ChatMessage {
  id: string;
  author: ChatUser;
  body: string;
  /** null : toute la table. */
  recipients: ChatRecipients | null;
  createdAt: string;
  editedAt: string | null;
}

/** Destinataires à l'envoi : null pour toute la table. */
export interface ChatAudience {
  gm: boolean;
  userIds: string[];
}

/** Charge utile des événements `campaign.message_*` (jamais le texte). */
export interface ChatEventPayload {
  id?: string;
  authorId?: string;
  recipients?: { gm: boolean; userIds: string[] } | null;
  editedAt?: string;
}

export const CHAT_MAX_BODY = 1000;
/** Taille d'une page de messages. */
export const CHAT_PAGE = 50;
/** Rattrapage : au-delà, la discussion est relue depuis la fin. */
const CATCH_UP_LIMIT = 100;
/** Rattrapage de secours quand le temps réel est coupé (onglet visible). */
const FALLBACK_POLL_MS = 20_000;

export const CHAT_EVENT_TYPES = [
  'campaign.message_posted',
  'campaign.message_updated',
  'campaign.message_deleted',
] as const;

const messagesUrl = (campaignId: string) =>
  `/v1/campaigns/${encodeURIComponent(campaignId)}/messages`;
const messageUrl = (campaignId: string, messageId: string) =>
  `${messagesUrl(campaignId)}/${encodeURIComponent(messageId)}`;

export const chatApi = {
  list: (campaignId: string, q: { before?: string; after?: string; limit?: number } = {}) => {
    const params = new URLSearchParams();
    if (q.before) params.set('before', q.before);
    if (q.after) params.set('after', q.after);
    if (q.limit) params.set('limit', String(q.limit));
    const query = params.toString();
    return api<ChatMessage[]>(`${messagesUrl(campaignId)}${query ? `?${query}` : ''}`);
  },
  read: (campaignId: string, messageId: string) =>
    api<ChatMessage>(messageUrl(campaignId, messageId)),
  post: (campaignId: string, body: string, audience: ChatAudience | null) =>
    api<ChatMessage>(messagesUrl(campaignId), {
      method: 'POST',
      body: JSON.stringify({ body, ...(audience ? { recipients: audience } : {}) }),
    }),
  edit: (campaignId: string, messageId: string, body: string) =>
    api<ChatMessage>(messageUrl(campaignId, messageId), {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    }),
  remove: (campaignId: string, messageId: string) =>
    api<void>(messageUrl(campaignId, messageId), { method: 'DELETE' }),
};

/**
 * Un événement de message me concerne-t-il ? Le MJ reçoit aussi (sans le texte) ceux des
 * chuchotements entre joueurs, qu'il ne lit pas : ils ne comptent pas comme nouveautés.
 */
export function isChatEventForMe(
  event: Pick<RealtimeEnvelope, 'payload'>,
  me: { userId: string; gm: boolean },
): boolean {
  const recipients = (event.payload as ChatEventPayload).recipients;
  if (!recipients) return true;
  return (
    (recipients.gm && me.gm) ||
    recipients.userIds.includes(me.userId) ||
    (event.payload as ChatEventPayload).authorId === me.userId
  );
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export const chatKey = (campaignId: string) => ['campaign-chat', campaignId] as const;

interface ChatPage {
  messages: ChatMessage[];
  /** Curseur de la page précédente (le plus ancien message reçu) ; null : début de la discussion. */
  olderCursor: string | null;
}

type ChatData = InfiniteData<ChatPage, string | null>;

/** Identifiants UUIDv7 : l'ordre des chaînes est l'ordre d'envoi. */
const byId = (a: ChatMessage, b: ChatMessage) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function lastMessageId(data: ChatData | undefined): string | null {
  for (let p = (data?.pages.length ?? 0) - 1; p >= 0; p--) {
    const page = data!.pages[p]!;
    if (page.messages.length) return page.messages[page.messages.length - 1]!.id;
  }
  return null;
}

/** Ajoute ou remplace des messages : les nouveaux vont dans la page la plus récente. */
export function upsertChatMessages(
  client: QueryClient,
  campaignId: string,
  incoming: readonly ChatMessage[],
) {
  if (!incoming.length) return;
  client.setQueryData<ChatData>(chatKey(campaignId), (data) => {
    if (!data?.pages.length) return data;
    const fresh = new Map(incoming.map((m) => [m.id, m]));
    const pages = data.pages.map((page) => {
      if (!page.messages.some((m) => fresh.has(m.id))) return page;
      return {
        ...page,
        messages: page.messages.map((m) => {
          const next = fresh.get(m.id);
          if (!next) return m;
          fresh.delete(m.id);
          return next;
        }),
      };
    });
    if (fresh.size) {
      const last = pages[pages.length - 1]!;
      pages[pages.length - 1] = {
        ...last,
        messages: [...last.messages, ...fresh.values()].sort(byId),
      };
    }
    return { ...data, pages };
  });
}

export function removeChatMessage(client: QueryClient, campaignId: string, messageId: string) {
  client.setQueryData<ChatData>(chatKey(campaignId), (data) => {
    if (!data?.pages.some((p) => p.messages.some((m) => m.id === messageId))) return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        messages: p.messages.filter((m) => m.id !== messageId),
      })),
    };
  });
}

/**
 * Messages de la campagne, du plus ancien au plus récent : la dernière page, puis les
 * précédentes à la demande (`loadOlder`).
 */
export function useChatMessages(campaignId: string) {
  const query = useInfiniteQuery({
    queryKey: chatKey(campaignId),
    queryFn: async ({ pageParam }): Promise<ChatPage> => {
      const messages = await chatApi.list(campaignId, {
        before: pageParam ?? undefined,
        limit: CHAT_PAGE,
      });
      return {
        messages,
        olderCursor: messages.length === CHAT_PAGE ? messages[0]!.id : null,
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: () => undefined,
    getPreviousPageParam: (first) => first.olderCursor ?? undefined,
    // Tenue à jour par le temps réel (useChatLive), jamais relue en entier
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const messages = useMemo(() => query.data?.pages.flatMap((p) => p.messages) ?? [], [query.data]);
  const { fetchPreviousPage, hasPreviousPage, isFetchingPreviousPage } = query;
  const loadOlder = useCallback(() => {
    if (hasPreviousPage && !isFetchingPreviousPage) void fetchPreviousPage();
  }, [fetchPreviousPage, hasPreviousPage, isFetchingPreviousPage]);

  return {
    messages,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    retry: query.refetch,
    hasOlder: hasPreviousPage,
    isLoadingOlder: isFetchingPreviousPage,
    olderError: query.isFetchPreviousPageError,
    loadOlder,
  };
}

/**
 * Tient la discussion à jour en direct (événements `campaign.message_*`) ; `onEvent` est
 * appelé pour chaque événement reçu (indicateur de frappe). `live` : temps réel actif.
 */
export function useChatLive(
  campaignId: string,
  onEvent?: (event: RealtimeEnvelope<ChatEventPayload>) => void,
): { live: boolean } {
  const client = useQueryClient();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const state = useRef({ running: false, again: false, pending: false });

  /** Rattrape les messages arrivés après le dernier connu ; groupé si une relecture est en cours. */
  const catchUp = useCallback(async () => {
    const s = state.current;
    const data = client.getQueryData<ChatData>(chatKey(campaignId));
    // Pas encore chargée : la première lecture est rattrapée dès qu'elle arrive
    if (!data) {
      s.pending = true;
      return;
    }
    if (s.running) {
      s.again = true;
      return;
    }
    s.running = true;
    try {
      do {
        s.again = false;
        const after = lastMessageId(client.getQueryData<ChatData>(chatKey(campaignId)));
        const fresh = await chatApi.list(campaignId, {
          ...(after ? { after } : {}),
          limit: CATCH_UP_LIMIT,
        });
        // Trop en retard : on repart de la fin de la discussion
        if (after && fresh.length >= CATCH_UP_LIMIT) {
          await client.resetQueries({ queryKey: chatKey(campaignId), exact: true });
          return;
        }
        upsertChatMessages(client, campaignId, fresh);
      } while (s.again);
    } catch {
      // Réseau ou service indisponible : le prochain événement ou la relève périodique rattrapera
    } finally {
      s.running = false;
    }
  }, [client, campaignId]);

  const { live, generation } = useCampaignEvents<ChatEventPayload>(
    campaignId,
    CHAT_EVENT_TYPES,
    (e) => {
      const { type, payload } = e.event;
      const id = payload.id;
      if (type === 'campaign.message_posted') void catchUp();
      else if (type === 'campaign.message_deleted' && id) removeChatMessage(client, campaignId, id);
      else if (type === 'campaign.message_updated' && id)
        chatApi.read(campaignId, id).then(
          (m) => upsertChatMessages(client, campaignId, [m]),
          (err: unknown) => {
            // Supprimé entre-temps (ou plus lisible) ; une panne ne retire rien
            if (err instanceof ApiError && err.status === 404)
              removeChatMessage(client, campaignId, id);
          },
        );
      onEventRef.current?.(e.event);
    },
  );

  // Reprise sans rejeu possible (premier abonnement, reconnexion) : rattrapage
  useEffect(() => {
    if (generation > 0) void catchUp();
  }, [generation, catchUp]);

  // Première lecture arrivée après un événement : rattrapage
  useEffect(
    () =>
      client.getQueryCache().subscribe((e) => {
        if (
          e.type === 'updated' &&
          e.action.type === 'success' &&
          state.current.pending &&
          e.query.queryKey[0] === chatKey(campaignId)[0] &&
          e.query.queryKey[1] === campaignId
        ) {
          state.current.pending = false;
          void catchUp();
        }
      }),
    [client, campaignId, catchUp],
  );

  // Temps réel coupé : rattrapage périodique, onglet visible
  useEffect(() => {
    if (live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void catchUp();
    }, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [live, catchUp]);

  return { live };
}

/** L'auteur corrige son message ; la réponse remplace le message du cache. */
export function useEditChatMessage(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => chatApi.edit(campaignId, id, body),
    onSuccess: (message) => upsertChatMessages(client, campaignId, [message]),
  });
}

/** L'auteur ou le MJ supprime un message ; déjà supprimé ailleurs (404) : retiré aussi. */
export function useDeleteChatMessage(campaignId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await chatApi.remove(campaignId, id);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
      }
      return id;
    },
    onSuccess: (id) => removeChatMessage(client, campaignId, id),
  });
}
