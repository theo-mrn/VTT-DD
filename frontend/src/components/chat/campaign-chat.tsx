'use client';

/**
 * Discussion de la campagne dans la table de jeu (l'ancien Chat.tsx refait) : fil groupé par
 * auteur, chuchotements à des membres ou au MJ (lus par eux seuls, filtrés par le service),
 * mentions `@Nom`, envoi optimiste avec reprise, correction et suppression de ses messages
 * (le MJ supprime ceux qu'il lit), « X écrit… », repère des nouveaux messages. Données et
 * temps réel : `lib/campaign-chat.ts`.
 */
import { useTranslations } from 'next-intl';
import { formatter } from '@/i18n/runtime';
import { WifiOff } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useChatLive,
  useChatMessages,
  type ChatAudience,
  type ChatMessage,
  type ChatUser,
} from '@/lib/campaign-chat';
import type { DetailCampagne } from '@/lib/campagnes';
import { usePersonnagesCampagne } from '@/lib/personnages';
import { useProfil } from '@/lib/session';
import { buildThread, type ChatPerson, type ThreadMessage } from './chat-format';
import { Composer, type ComposerHandle } from './composer';
import type { MessageContext } from './message-item';
import { MessageList } from './message-list';
import { useChatOutbox } from './use-chat-outbox';
import { useChatTyping, useTypingIds, type TypingStore } from './use-chat-typing';

/** Délai avant d'annoncer que le temps réel est coupé. */
const OFFLINE_NOTICE_MS = 5_000;

/** Vrai quand `flag` l'est depuis `ms` millisecondes. */
function useLasting(flag: boolean, ms: number): boolean {
  const [lasting, setLasting] = useState(false);
  useEffect(() => {
    if (!flag) {
      setLasting(false);
      return;
    }
    const timer = setTimeout(() => setLasting(true), ms);
    return () => clearTimeout(timer);
  }, [flag, ms]);
  return lasting;
}

/**
 * Mémoïsée : le panneau se re-rend à chaque changement d'adresse (ouverture d'un autre
 * panneau), la discussion seulement si ses propriétés changent.
 */
export const CampaignChat = memo(function CampaignChat({
  campaign,
  visible,
  whisperTo,
  onWhisperHandled,
}: {
  campaign: DetailCampagne;
  /** Panneau affiché (il reste monté, masqué, une fois ouvert). */
  visible: boolean;
  /** Ouvrir sur un chuchotement à ce membre (lien « Chuchoter »). */
  whisperTo?: string | null;
  onWhisperHandled?: () => void;
}) {
  const t = useTranslations();
  const me = useProfil().id;
  const gm = campaign.role === 'gm';
  const characters = usePersonnagesCampagne(campaign.id);

  // ── Membres : nom, avatar, rôle et personnage incarné ──
  const people = useMemo<ChatPerson[]>(() => {
    const names = new Map((characters.data ?? []).map((p) => [p.id, p.name]));
    return campaign.members.map((m) => ({
      id: m.userId,
      name: m.name,
      avatarUrl: m.avatarUrl,
      role: m.role,
      characterName: m.characterId ? (names.get(m.characterId) ?? null) : null,
    }));
  }, [campaign.members, characters.data]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const self = useMemo<ChatPerson>(
    () =>
      byId.get(me) ?? {
        id: me,
        name: t('chat.me'),
        avatarUrl: null,
        role: campaign.role,
        characterName: null,
      },
    [byId, me, campaign.role],
  );
  const author = useMemo<ChatUser>(
    () => ({ id: me, name: self.name, avatarUrl: self.avatarUrl }),
    [me, self.name, self.avatarUrl],
  );

  // ── Données, temps réel, envois ──
  const chat = useChatMessages(campaign.id);
  const typing = useChatTyping(campaign.id, me);
  const { clearTyping } = typing;
  const { live } = useChatLive(campaign.id, (e) => {
    if (e.type === 'campaign.message_posted' && e.actor.userId) clearTyping(e.actor.userId);
  });
  const outbox = useChatOutbox(campaign.id, author);
  const [audience, setAudience] = useState<ChatAudience | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);

  // ── Repère « Nouveaux messages » : ce qui est arrivé pendant que le panneau était fermé ──
  const [unreadFrom, setUnreadFrom] = useState<string | null>(null);
  const lastSeen = useRef<string | null>(null);
  const wasVisible = useRef(visible);
  const messagesRef = useRef(chat.messages);
  messagesRef.current = chat.messages;
  useEffect(() => {
    const list = messagesRef.current;
    // Fermeture : on retient le dernier message vu
    if (wasVisible.current && !visible) lastSeen.current = list[list.length - 1]?.id ?? null;
    // Réouverture : le repère se pose avant le premier message d'un autre arrivé depuis
    if (!wasVisible.current && visible) {
      const seen = lastSeen.current;
      const first = seen ? list.find((m) => m.id > seen && m.author.id !== me) : undefined;
      setUnreadFrom(first?.id ?? null);
    }
    wasVisible.current = visible;
  }, [visible, me]);

  // ── Ouverture : la saisie prend le focus (pas sur écran tactile : le clavier surgirait) ──
  useEffect(() => {
    if (!visible) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    // Après l'effet du cadre (focus sur le panneau) et le début de son animation
    const timer = setTimeout(() => composer.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [visible]);

  // ── « Chuchoter » depuis Joueurs : destinataire présélectionné ──
  const whisperHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!whisperTo || whisperHandled.current === whisperTo) return;
    whisperHandled.current = whisperTo;
    if (whisperTo !== me && byId.has(whisperTo)) {
      setAudience({ gm: false, userIds: [whisperTo] });
      requestAnimationFrame(() => composer.current?.focus());
    }
    onWhisperHandled?.();
  }, [whisperTo, me, byId, onWhisperHandled]);
  useEffect(() => {
    if (!whisperTo) whisperHandled.current = null;
  }, [whisperTo]);

  // ── Fil ──
  const thread = useMemo(() => {
    const sent: ThreadMessage[] = chat.messages.map((m) => ({ key: m.id, message: m }));
    return buildThread([...sent, ...outbox.pending], unreadFrom);
  }, [chat.messages, outbox.pending, unreadFrom]);

  const nameOf = useCallback(
    (id: string, fallback: string | null) =>
      byId.get(id)?.name ?? fallback ?? t('chat.formerMember'),
    [byId],
  );

  const ctx = useMemo<MessageContext>(
    () => ({
      campaignId: campaign.id,
      me,
      gm,
      people,
      personOf: (id) => byId.get(id),
      nameOf,
      setEditingId: (id) => {
        setEditingId(id);
        // Fin de correction : retour à la saisie
        if (id === null) requestAnimationFrame(() => composer.current?.focus());
      },
      onRetrySend: outbox.retry,
      onDiscardSend: outbox.discard,
    }),
    [campaign.id, me, gm, people, byId, nameOf, outbox.retry, outbox.discard],
  );

  const { send: sendOutbox } = outbox;
  const { resetTyping } = typing;
  const send = useCallback(
    (body: string) => {
      const recipients: ChatMessage['recipients'] = audience
        ? {
            gm: audience.gm,
            users: audience.userIds.map((id) => ({
              id,
              name: byId.get(id)?.name ?? null,
              avatarUrl: byId.get(id)?.avatarUrl ?? null,
            })),
          }
        : null;
      sendOutbox(body, audience, recipients);
      resetTyping();
      setUnreadFrom(null);
    },
    [audience, byId, sendOutbox, resetTyping],
  );

  const editLast = useCallback(() => {
    const mine = [...messagesRef.current].reverse().find((m) => m.author.id === me);
    if (mine) setEditingId(mine.id);
  }, [me]);

  const { retry: retryChat } = chat;
  const onRetry = useCallback(() => void retryChat(), [retryChat]);

  // Temps réel absent depuis un moment (pas pendant la connexion d'ouverture)
  const offline = useLasting(!live && !chat.isPending, OFFLINE_NOTICE_MS);

  return (
    <div className="flex h-[calc(100%-3.5rem)] min-h-0 flex-col">
      {offline && (
        <p
          role="status"
          className="flex shrink-0 items-center gap-1.5 border-b border-border bg-warning/10 px-4 py-1.5 text-[11px] text-warning"
        >
          <WifiOff className="size-3" aria-hidden />
          {t('chat.realtimeDown')}
        </p>
      )}
      <MessageList
        thread={thread}
        ctx={ctx}
        editingId={editingId}
        isPending={chat.isPending}
        isError={chat.isError}
        error={chat.error}
        onRetry={onRetry}
        hasOlder={chat.hasOlder}
        isLoadingOlder={chat.isLoadingOlder}
        olderError={chat.olderError}
        loadOlder={chat.loadOlder}
      />
      <Composer
        ref={composer}
        me={self}
        gm={gm}
        people={people}
        audience={audience}
        onAudienceChange={setAudience}
        cooldownUntil={outbox.cooldownUntil}
        onSend={send}
        onTyping={typing.notifyTyping}
        onEditLast={editLast}
        typingLabel={<TypingLabel store={typing.store} byId={byId} />}
      />
    </div>
  );
});

/** « Alice écrit… » : seul ce texte se re-rend quand quelqu'un écrit. */
function TypingLabel({
  store,
  byId,
}: {
  store: TypingStore;
  byId: ReadonlyMap<string, ChatPerson>;
}) {
  const t = useTranslations();
  const ids = useTypingIds(store);
  const names = ids.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
  if (!names.length) return null;
  if (names.length <= 2)
    return t('chat.typing', { count: names.length, names: formatter().list(names, 'and') });
  return t('chat.manyTyping');
}
