'use client';

import { ArrowDown, Loader2, MessagesSquare, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { messageErreur } from '@/lib/api';
import type { ThreadItem } from './chat-format';
import { MessageItem, type MessageContext } from './message-item';

/** Distance au bas (px) sous laquelle le fil reste collé en bas. */
const STICK_PX = 48;
/** Distance au haut (px) sous laquelle les messages précédents se chargent. */
const LOAD_OLDER_PX = 160;

interface MessageListProps {
  thread: ThreadItem[];
  ctx: MessageContext;
  /** Message en cours de correction. */
  editingId: string | null;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  hasOlder: boolean;
  isLoadingOlder: boolean;
  olderError: boolean;
  loadOlder: () => void;
}

/**
 * Fil de la discussion : collé en bas tant qu'on y est ; si on a remonté, les nouveaux
 * messages s'annoncent par un bouton « Nouveaux messages ». Remonter charge les précédents
 * sans faire sauter la lecture.
 */
export function MessageList({
  thread,
  ctx,
  editingId,
  isPending,
  isError,
  error,
  onRetry,
  hasOlder,
  isLoadingOlder,
  olderError,
  loadOlder,
}: Readonly<MessageListProps>) {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLOListElement>(null);
  const atBottom = useRef(true);
  const [away, setAway] = useState(false);
  const [unseen, setUnseen] = useState(0);
  /** Hauteur et position avant le chargement des messages précédents. */
  const restore = useRef<{ height: number; top: number } | null>(null);
  const edges = useRef<{ first: string | null; last: string | null; count: number }>({
    first: null,
    last: null,
    count: 0,
  });

  const toBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottom.current = true;
    setAway(false);
    setUnseen(0);
  }, []);

  const requestOlder = useCallback(() => {
    const el = scroller.current;
    if (!el || !hasOlder || isLoadingOlder) return;
    restore.current = { height: el.scrollHeight, top: el.scrollTop };
    loadOlder();
  }, [hasOlder, isLoadingOlder, loadOlder]);

  // Défilement lu une fois par image au plus (mesures et états, pas à chaque événement)
  const image = useRef(0);
  const lireDefilement = useRef(() => {});
  lireDefilement.current = () => {
    const el = scroller.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = distance < STICK_PX;
    setAway(!atBottom.current);
    if (atBottom.current) setUnseen(0);
    if (el.scrollTop < LOAD_OLDER_PX && !olderError) requestOlder();
  };
  const onScroll = useCallback(() => {
    if (image.current) return;
    image.current = requestAnimationFrame(() => {
      image.current = 0;
      lireDefilement.current();
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(image.current), []);

  // Après chaque changement du fil : garder la lecture en place (anciens messages ajoutés en
  // haut), rester en bas, ou compter les nouveaux messages arrivés pendant qu'on lit plus haut
  useLayoutEffect(() => {
    const el = scroller.current;
    const messages = thread.filter((i) => i.kind === 'message');
    const first = messages[0]?.key ?? null;
    const lastItem = messages.at(-1);
    const last = lastItem?.key ?? null;
    const prev = edges.current;
    edges.current = { first, last, count: messages.length };
    if (!el) return;

    if (restore.current && first !== prev.first) {
      el.scrollTop = restore.current.top + (el.scrollHeight - restore.current.height);
      restore.current = null;
      return;
    }
    if (last === prev.last) return;
    const mine = lastItem?.kind === 'message' && lastItem.item.message.author.id === ctx.me;
    if (atBottom.current || mine) {
      el.scrollTop = el.scrollHeight;
      atBottom.current = true;
      setAway(false);
    } else if (prev.last !== null) {
      setUnseen((n) => n + Math.max(1, messages.length - prev.count));
    }
  }, [thread, ctx.me]);

  // Fin d'un chargement sans nouveaux messages : plus rien à restaurer
  useEffect(() => {
    if (!isLoadingOlder) restore.current = null;
  }, [isLoadingOlder]);

  const messages = thread.some((i) => i.kind === 'message');

  // La zone change de taille (saisie qui grandit, fenêtre, correction en place) : on reste en bas
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, [isPending, messages]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages de la table"
        aria-busy={isPending || isLoadingOlder}
        tabIndex={0}
        className="h-full overflow-y-auto overscroll-contain pb-2 pt-3 outline-none [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
      >
        {isPending ? (
          <ChatSkeleton />
        ) : isError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium">Discussion indisponible</p>
            <p className="text-xs text-muted-foreground">{messageErreur(error)}</p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              <RotateCw />
              Réessayer
            </Button>
          </div>
        ) : !messages ? (
          <EmptyChat />
        ) : (
          <>
            <div className="flex justify-center px-4 pb-1">
              {hasOlder ? (
                olderError ? (
                  <Button variant="ghost" size="xs" onClick={requestOlder}>
                    <RotateCw />
                    Messages précédents indisponibles, réessayer
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={requestOlder}
                    disabled={isLoadingOlder}
                  >
                    {isLoadingOlder && <Loader2 className="animate-spin" />}
                    {isLoadingOlder ? 'Chargement…' : 'Messages précédents'}
                  </Button>
                )
              ) : (
                <p className="py-1 text-[11px] text-subtle">Début de la discussion</p>
              )}
            </div>
            <ol ref={content} className="flex flex-col">
              {thread.map((i) =>
                i.kind === 'day' ? (
                  <li
                    key={i.key}
                    className="flex items-center gap-3 px-4 pb-1 pt-4"
                    role="separator"
                  >
                    <span className="h-px flex-1 bg-border" aria-hidden />
                    <span className="text-[11px] font-medium text-subtle">{i.label}</span>
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </li>
                ) : i.kind === 'unread' ? (
                  <li key={i.key} className="flex items-center gap-2 px-4 pt-3" role="separator">
                    <span className="h-px flex-1 bg-destructive/50" aria-hidden />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-destructive">
                      Nouveaux messages
                    </span>
                  </li>
                ) : (
                  <MessageItem
                    key={i.key}
                    item={i.item}
                    first={i.first}
                    ctx={ctx}
                    editing={editingId === i.item.message.id}
                  />
                ),
              )}
            </ol>
          </>
        )}
      </div>

      {away && messages && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="xs"
            variant={unseen > 0 ? 'default' : 'secondary'}
            onClick={() => toBottom(true)}
            className="pointer-events-auto rounded-full shadow-elevated"
          >
            <ArrowDown />
            {unseen > 0
              ? `${unseen} nouveau${unseen > 1 ? 'x' : ''} message${unseen > 1 ? 's' : ''}`
              : 'Revenir en bas'}
          </Button>
        </div>
      )}
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-5 px-4 pt-2" aria-hidden>
      {[0.7, 0.45, 0.85, 0.55].map((w, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="h-3 rounded" style={{ width: `${w * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-border-strong bg-surface-2 shadow-surface">
        <MessagesSquare className="size-5 text-primary" aria-hidden />
      </div>
      <p className="text-[15px] font-semibold">Aucun message pour l’instant</p>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
        Écrivez le premier : toute la table le lira. Tapez{' '}
        <span className="text-foreground">@</span> pour mentionner quelqu’un, ou chuchotez depuis le
        choix des destinataires.
      </p>
    </div>
  );
}
