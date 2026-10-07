'use client';

import { useTranslations } from 'next-intl';
import { Clock, Crown, Loader2, Lock, Pencil, RotateCw, Trash2, X } from 'lucide-react';
import { memo, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { AvatarJoueur } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import {
  CHAT_MAX_BODY,
  useDeleteChatMessage,
  useEditChatMessage,
  type ChatMessage,
} from '@/lib/campaign-chat';
import { cn } from '@/lib/utils';
import {
  audienceLabel,
  formatFull,
  formatTime,
  mentions,
  parseBody,
  type ChatPerson,
  type Segment,
  type ThreadMessage,
} from './chat-format';

export interface MessageContext {
  campaignId: string;
  me: string;
  gm: boolean;
  people: readonly ChatPerson[];
  personOf: (id: string) => ChatPerson | undefined;
  /** Nom affiché d'un utilisateur (membre, sinon nom connu du message). */
  nameOf: (id: string, fallback: string | null) => string;
  setEditingId: (id: string | null) => void;
  onRetrySend: (localId: string) => void;
  onDiscardSend: (localId: string) => void;
}

interface MessageItemProps {
  item: ThreadMessage;
  first: boolean;
  ctx: MessageContext;
  /** Ce message est en cours de correction. */
  editing: boolean;
}

/**
 * Un message du fil : en-tête (avatar, nom, heure) s'il ouvre un groupe, texte, actions.
 * Mémoïsé : un nouveau message, une frappe ou une correction ailleurs ne re-rendent pas
 * tout le fil (le fil est reconstruit à chaque message, d'où la comparaison sur le contenu).
 */
export const MessageItem = memo(
  MessageItemView,
  (a: MessageItemProps, b: MessageItemProps) =>
    a.item.message === b.item.message &&
    a.item.pending?.status === b.item.pending?.status &&
    a.item.pending?.error === b.item.pending?.error &&
    a.first === b.first &&
    a.editing === b.editing &&
    a.ctx === b.ctx,
);

function MessageItemView({ item, first, ctx, editing: enCorrection }: Readonly<MessageItemProps>) {
  const t = useTranslations();
  const m = item.message;
  const person = ctx.personOf(m.author.id);
  const name = ctx.nameOf(m.author.id, m.author.name);
  const at = new Date(m.createdAt);
  const mine = m.author.id === ctx.me;
  const segments = useMemo(() => parseBody(m.body, ctx.people), [m.body, ctx.people]);
  const forMe = !mine && mentions(segments, ctx.me);
  const whisper = m.recipients !== null;
  const editing = enCorrection && !item.pending;

  return (
    <li
      className={cn(
        'group relative flex gap-3 border-l-2 py-0.5 pl-[14px] pr-4 transition-colors',
        // Arrivée : fondu et léger glissé vers le haut
        'duration-200 ease-out animate-in fade-in-0 slide-in-from-bottom-1',
        first && 'mt-3',
        accentOf(forMe, whisper),
        !editing && 'hover:bg-surface-2/70',
        item.pending && 'opacity-70',
      )}
    >
      <div className="w-8 shrink-0 pt-0.5">
        {first ? (
          <AvatarJoueur nom={name} url={person?.avatarUrl ?? m.author.avatarUrl} taille="sm" />
        ) : (
          <time
            dateTime={m.createdAt}
            title={formatFull(at)}
            className="block pt-0.5 text-right text-[10px] tabular-nums text-subtle opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          >
            {formatTime(at)}
          </time>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <AuthorLine first={first} name={name} person={person} createdAt={m.createdAt} at={at} />

        {whisper && first && (
          <p className="flex items-center gap-1 text-[11px] font-medium text-arcane">
            <Lock className="size-3" aria-hidden />
            {audienceLabel(m.recipients!, ctx.me, ctx.nameOf)}
          </p>
        )}

        {editing ? (
          <EditMessage message={m} ctx={ctx} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            <Rich segments={segments} me={ctx.me} />
            {m.editedAt && (
              <span
                className="ml-1 text-[11px] text-subtle"
                title={t('chat.editedOn', { date: formatFull(new Date(m.editedAt)) })}
              >
                {t('chat.edited')}
              </span>
            )}
          </p>
        )}

        {item.pending && <PendingStatus item={item} ctx={ctx} />}
      </div>

      {!item.pending && !editing && (mine || ctx.gm) && (
        <MessageActions message={m} mine={mine} ctx={ctx} />
      )}
    </li>
  );
}

/** Auteur en tête d'un groupe (nom, MJ, personnage, heure) ; sinon son nom pour les lecteurs d'écran. */
function AuthorLine({
  first,
  name,
  person,
  createdAt,
  at,
}: Readonly<{
  first: boolean;
  name: string;
  person: ReturnType<MessageContext['personOf']>;
  createdAt: string;
  at: Date;
}>) {
  if (!first) return <span className="sr-only">{name} :</span>;
  return (
    <p className="flex min-w-0 items-baseline gap-1.5 leading-5">
      <span className="truncate text-[13px] font-semibold text-foreground">{name}</span>
      {person?.role === 'gm' && (
        <Crown className="size-3 shrink-0 self-center text-primary" aria-label="MJ" />
      )}
      {person?.characterName && (
        <span className="truncate text-[11px] text-subtle">{person.characterName}</span>
      )}
      <time
        dateTime={createdAt}
        title={formatFull(at)}
        className="shrink-0 text-[11px] tabular-nums text-subtle"
      >
        {formatTime(at)}
      </time>
    </p>
  );
}

/** Texte enrichi : mentions (la mienne ressort) et liens. */
function Rich({ segments, me }: Readonly<{ segments: readonly Segment[]; me: string }>) {
  return (
    <>
      {segments.map((s, i) => {
        if (s.kind === 'mention')
          return (
            <span
              key={i}
              className={cn(
                'rounded px-0.5 font-medium',
                s.userId === me ? 'bg-primary/20 text-primary-strong' : 'bg-info/10 text-info',
              )}
            >
              {s.text}
            </span>
          );
        if (s.kind === 'link')
          return (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-info underline decoration-info/40 underline-offset-2 hover:decoration-info"
            >
              {s.text}
            </a>
          );
        return <span key={i}>{s.text}</span>;
      })}
    </>
  );
}

function PendingStatus({ item, ctx }: Readonly<{ item: ThreadMessage; ctx: MessageContext }>) {
  const t = useTranslations();
  const p = item.pending!;
  if (p.status === 'waiting')
    return (
      <p className="flex items-center gap-1 text-[11px] text-warning">
        <Clock className="size-3" aria-hidden />
        {t('chat.pending')}
        <button
          type="button"
          onClick={() => ctx.onDiscardSend(item.key)}
          className="ml-1 text-subtle underline-offset-2 hover:text-foreground hover:underline"
        >
          {t('chat.abandon')}
        </button>
      </p>
    );
  if (p.status === 'sending')
    return (
      <p className="flex items-center gap-1 text-[11px] text-subtle">
        <Loader2 className="size-3 animate-spin" aria-hidden />
        {t('chat.sending')}
      </p>
    );
  return (
    <div
      role="alert"
      className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-destructive"
    >
      <span>Non envoyé : {p.error}</span>
      <button
        type="button"
        onClick={() => ctx.onRetrySend(item.key)}
        className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
      >
        <RotateCw className="size-3" aria-hidden />
        {t('common.actions.retry')}
      </button>
      <button
        type="button"
        onClick={() => ctx.onDiscardSend(item.key)}
        className="inline-flex items-center gap-1 text-subtle underline-offset-2 hover:text-foreground hover:underline"
      >
        <X className="size-3" aria-hidden />
        {t('chat.abandon')}
      </button>
    </div>
  );
}

/** Actions au survol ou au clavier : modifier (auteur), supprimer (auteur ou MJ). */
function MessageActions({
  message,
  mine,
  ctx,
}: Readonly<{
  message: ChatMessage;
  mine: boolean;
  ctx: MessageContext;
}>) {
  const t = useTranslations();
  const [confirm, setConfirm] = useState(false);
  const remove = useDeleteChatMessage(ctx.campaignId);
  const supprimer = () =>
    remove.mutate(message.id, {
      onSuccess: () => setConfirm(false),
      onError: (err) => toast.error(messageErreur(err, t('chat.deleteFailed'))),
    });

  return (
    <div
      className={cn(
        'absolute -top-3 right-3 z-10 flex items-center gap-0.5 rounded-lg border border-border-strong bg-popover p-0.5 shadow-elevated',
        'opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
        confirm && 'opacity-100',
      )}
    >
      {mine && (
        <Info texte={t('common.actions.edit')}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('chat.editMessage')}
            onClick={() => ctx.setEditingId(message.id)}
          >
            <Pencil />
          </Button>
        </Info>
      )}
      <Popover open={confirm} onOpenChange={setConfirm}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('chat.deleteMessage')}
            className="hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <p className="text-sm font-medium">{t('chat.deleteTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {message.recipients ? t('chat.goneForRecipients') : t('chat.goneForTable')}
            {!mine && ` ${t('chat.authorCantRecover')}`}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <PopoverClose asChild>
              <Button variant="ghost" size="xs">
                {t('common.actions.cancel')}
              </Button>
            </PopoverClose>
            <Button variant="destructive" size="xs" loading={remove.isPending} onClick={supprimer}>
              {t('common.actions.delete')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Correction en place : Entrée enregistre, Échap annule. */
function EditMessage({ message, ctx }: Readonly<{ message: ChatMessage; ctx: MessageContext }>) {
  const t = useTranslations();
  const [draft, setDraft] = useState(message.body);
  const edit = useEditChatMessage(ctx.campaignId);
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = draft.trim();
  const tooLong = trimmed.length > CHAT_MAX_BODY;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const cancel = () => ctx.setEditingId(null);
  const save = () => {
    if (!trimmed || tooLong) return;
    if (trimmed === message.body) return cancel();
    edit.mutate(
      { id: message.id, body: trimmed },
      {
        onSuccess: cancel,
        onError: (err) => toast.error(messageErreur(err, t('chat.editFailed'))),
      },
    );
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="mt-1">
      <textarea
        ref={ref}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        aria-label={t('chat.editMessage')}
        aria-invalid={tooLong || undefined}
        className="block w-full resize-none rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30"
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-subtle">
        <span className="flex items-center gap-1">
          {t.rich('chat.editKeys', {
            esc: () => <Kbd>{t('map.tokens.library.esc')}</Kbd>,
            enter: () => <Kbd>{t('chat.enterKey')}</Kbd>,
          })}
          {tooLong && (
            <span className="text-destructive">
              · {t('chat.tooLong', { count: trimmed.length - CHAT_MAX_BODY })}
            </span>
          )}
        </span>
        <span className="flex gap-1.5">
          <Button variant="ghost" size="xs" onClick={cancel}>
            {t('common.actions.cancel')}
          </Button>
          <Button size="xs" onClick={save} loading={edit.isPending} disabled={!trimmed || tooLong}>
            {t('common.actions.save')}
          </Button>
        </span>
      </div>
    </div>
  );
}

/** Liseré d'un message : pour moi, chuchoté, ou aucun. */
function accentOf(forMe: boolean, whisper: boolean): string {
  if (forMe) return 'border-primary bg-primary/[0.07]';
  return whisper ? 'border-arcane/60 bg-arcane/[0.06]' : 'border-transparent';
}
