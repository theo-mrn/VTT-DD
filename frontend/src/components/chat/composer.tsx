'use client';

import { useTranslations } from 'next-intl';
import { formatter } from '@/i18n/runtime';
import type { Translator } from '@/i18n/text';
import { ChevronDown, Lock, SendHorizontal, Users, X } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AvatarJoueur } from '@/components/compte/elements';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { CHAT_MAX_BODY, type ChatAudience } from '@/lib/campaign-chat';
import { cn } from '@/lib/utils';
import { mentionCandidates, mentionQuery, type ChatPerson } from './chat-format';

/** Compteur affiché à partir de ce nombre de caractères. */
const COUNTER_FROM = CHAT_MAX_BODY - 200;
const MAX_HEIGHT_PX = 176;

export interface ComposerHandle {
  focus: () => void;
}

interface ComposerProps {
  me: ChatPerson;
  gm: boolean;
  people: readonly ChatPerson[];
  audience: ChatAudience | null;
  onAudienceChange: (audience: ChatAudience | null) => void;
  /** Fin de l'attente imposée par le service (ms), ou null. */
  cooldownUntil: number | null;
  onSend: (body: string) => void;
  /** Je tape un message à toute la table. */
  onTyping: () => void;
  /** Flèche haut dans une saisie vide : corriger mon dernier message. */
  onEditLast: () => void;
  /** « Alice écrit… » (un composant qui suit lui-même qui écrit) */
  typingLabel: ReactNode;
}

/**
 * Saisie de la discussion : zone qui grandit avec le texte, Entrée envoie, Maj+Entrée va à la
 * ligne, `@` propose les membres, choix des destinataires (toute la table ou chuchotement),
 * compteur près de la limite, attente annoncée après un refus de débit.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  {
    me,
    gm,
    people,
    audience,
    onAudienceChange,
    cooldownUntil,
    onSend,
    onTyping,
    onEditLast,
    typingLabel,
  },
  handle,
) {
  const t = useTranslations();
  const [draft, setDraft] = useState('');
  const [caret, setCaret] = useState(0);
  const [activeMention, setActiveMention] = useState(0);
  const [mentionClosed, setMentionClosed] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const ids = useId();
  const hintId = `${ids}-hint`;
  const listId = `${ids}-mentions`;
  const statusId = `${ids}-status`;

  useImperativeHandle(handle, () => ({
    focus: () => ref.current?.focus({ preventScroll: true }),
  }));

  // La zone grandit avec le texte, jusqu'à ~7 lignes, puis défile
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [draft]);

  const remaining = useCooldown(cooldownUntil);
  const trimmed = draft.trim();
  const tooLong = trimmed.length > CHAT_MAX_BODY;
  const canSend = trimmed.length > 0 && !tooLong && remaining === 0;

  // Mentions : `@` puis le début d'un nom, juste avant le curseur
  const query = mentionQuery(draft, caret);
  const candidates = useMemo(
    () => (query ? mentionCandidates(people, query.query, me.id) : []),
    [people, query?.query, me.id],
  );
  const mentionOpen = Boolean(query) && candidates.length > 0 && !mentionClosed;
  useEffect(() => {
    setActiveMention(0);
    setMentionClosed(false);
  }, [query?.start, query?.query]);

  const insertMention = (p: ChatPerson) => {
    if (!query) return;
    const before = draft.slice(0, query.start);
    const after = draft.slice(caret);
    const inserted = `@${p.name} `;
    const next = `${before}${inserted}${after.replace(/^ /, '')}`;
    const position = before.length + inserted.length;
    setDraft(next);
    setCaret(position);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(position, position);
    });
  };

  const send = () => {
    if (!canSend) return;
    onSend(trimmed);
    setDraft('');
    setCaret(0);
  };

  /** Liste des mentions ouverte : flèches, Entrée ou Tab, Échap ; vrai si la touche est prise. */
  const onMentionKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActiveMention((i) => (i + delta + candidates.length) % candidates.length);
      return true;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(candidates[activeMention]!);
      return true;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setMentionClosed(true);
      return true;
    }
    return false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (mentionOpen && onMentionKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'ArrowUp' && !draft) {
      e.preventDefault();
      onEditLast();
      return;
    }
    if (e.key === 'Escape' && audience) {
      e.preventDefault();
      onAudienceChange(null);
    }
  };

  const whisperLabel = audience ? audienceText(t, audience, people) : null;

  return (
    <div className="shrink-0 border-t border-border bg-background px-3 pb-3 pt-2">
      <p aria-live="polite" className="h-4 truncate px-1 text-[11px] text-subtle">
        {typingLabel}
      </p>

      <div className="relative">
        {mentionOpen && (
          <ul
            id={listId}
            role="listbox"
            aria-label={t('chat.mention')}
            className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-xl border border-border-strong bg-popover p-1 shadow-elevated"
          >
            {candidates.map((p, i) => (
              <li
                key={p.id}
                id={`${listId}-${p.id}`}
                role="option"
                aria-selected={i === activeMention}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(p);
                }}
                onMouseEnter={() => setActiveMention(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]',
                  i === activeMention ? 'bg-surface-3 text-foreground' : 'text-muted-foreground',
                )}
              >
                <AvatarJoueur nom={p.name} url={p.avatarUrl} taille="xs" />
                <span className="truncate font-medium">{p.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-subtle">
                  {p.characterName ?? t(`common.roles.${p.role}`)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div
          className={cn(
            'rounded-xl border bg-surface-2 transition-colors focus-within:ring-2',
            audience
              ? 'border-arcane/40 focus-within:ring-arcane/30'
              : 'border-border-strong focus-within:border-primary/40 focus-within:ring-ring/25',
            tooLong && 'border-destructive/60',
          )}
        >
          {whisperLabel && (
            <div className="flex items-center gap-1.5 border-b border-arcane/20 px-3 py-1.5 text-[11px] font-medium text-arcane">
              <Lock className="size-3 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{whisperLabel}</span>
              <button
                type="button"
                onClick={() => onAudienceChange(null)}
                aria-label={t('chat.writeToTable')}
                className="grid size-5 place-items-center rounded text-arcane/80 hover:bg-arcane/15 hover:text-arcane"
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1.5 p-1.5 pl-3">
            <textarea
              ref={ref}
              role="combobox"
              value={draft}
              rows={1}
              onChange={(e) => {
                setDraft(e.target.value);
                setCaret(e.target.selectionStart);
                if (e.target.value.trim() && !audience) onTyping();
              }}
              onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
              onKeyDown={onKeyDown}
              placeholder={audience ? t('chat.whisperPlaceholder') : t('chat.tablePlaceholder')}
              aria-label={
                audience
                  ? t('chat.messageTo', { audience: whisperLabel ?? '' })
                  : t('chat.messageToTable')
              }
              aria-describedby={`${hintId} ${statusId}`}
              aria-invalid={tooLong || undefined}
              aria-autocomplete="list"
              aria-expanded={mentionOpen}
              aria-controls={mentionOpen ? listId : undefined}
              aria-activedescendant={
                mentionOpen ? `${listId}-${candidates[activeMention]?.id}` : undefined
              }
              className="max-h-44 min-h-[2.25rem] flex-1 resize-none bg-transparent py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-subtle"
            />
            <Button
              size="icon-sm"
              onClick={send}
              disabled={!canSend}
              aria-label={t('common.actions.send')}
              className={cn(audience && 'bg-arcane text-background hover:bg-arcane/85')}
            >
              <SendHorizontal />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-2 px-0.5 text-[11px] text-subtle">
        <AudiencePicker
          me={me}
          gm={gm}
          people={people}
          audience={audience}
          onChange={onAudienceChange}
        />
        <span id={hintId} className="hidden min-w-0 truncate lg:inline">
          {t.rich('chat.keys', {
            enter: () => <Kbd>{t('chat.enterKey')}</Kbd>,
            shift: () => <Kbd>{t('chat.shiftKey')}</Kbd>,
            at: () => <Kbd>@</Kbd>,
          })}
        </span>
        <span
          id={statusId}
          role="status"
          className={counterClass(tooLong, trimmed.length, remaining)}
        >
          {counterText(t, remaining, trimmed.length)}
        </span>
      </div>
    </div>
  );
});

/** Compteur : rouge au-delà de la limite, orange à l'approche ou pendant l'attente. */
function counterClass(tooLong: boolean, length: number, remaining: number): string {
  return cn(
    'ml-auto shrink-0 tabular-nums',
    tooLong ? 'text-destructive' : length > CHAT_MAX_BODY - 50 && 'text-warning',
    remaining > 0 && 'text-warning',
  );
}

/** Secondes restantes avant la fin de l'attente (0 : libre), rafraîchies chaque seconde. */
function useCooldown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

function audienceText(
  t: Translator,
  audience: ChatAudience,
  people: readonly ChatPerson[],
): string {
  const names = audience.userIds.map(
    (id) => people.find((p) => p.id === id)?.name ?? t('chat.aMember'),
  );
  if (audience.gm) names.push(t('chat.theGm'));
  return t('chat.whisperTo', { names: formatter().list(names, 'and') });
}

/**
 * Qui lira le message : toute la table, ou un chuchotement à des membres et/ou au MJ. Un joueur
 * chuchote « au MJ » (tous les MJ) ; le MJ choisit des membres un à un.
 */
function AudiencePicker({
  me,
  gm,
  people,
  audience,
  onChange,
}: Readonly<{
  me: ChatPerson;
  gm: boolean;
  people: readonly ChatPerson[];
  audience: ChatAudience | null;
  onChange: (audience: ChatAudience | null) => void;
}>) {
  const t = useTranslations();
  const others = people.filter((p) => p.id !== me.id && (gm || p.role !== 'gm'));
  const hasGm = !gm && people.some((p) => p.role === 'gm' && p.id !== me.id);

  const toggle = (next: ChatAudience) => onChange(next.gm || next.userIds.length ? next : null);
  const toggleUser = (id: string) => {
    const current = audience ?? { gm: false, userIds: [] };
    toggle({
      ...current,
      userIds: current.userIds.includes(id)
        ? current.userIds.filter((x) => x !== id)
        : [...current.userIds, id],
    });
  };

  if (!others.length && !hasGm) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 font-medium transition-colors hover:bg-surface-3 hover:text-foreground',
            audience ? 'text-arcane' : 'text-muted-foreground',
          )}
          aria-label={audience ? t('chat.audienceWhisper') : t('chat.audienceTable')}
        >
          {audience ? (
            <Lock className="size-3" aria-hidden />
          ) : (
            <Users className="size-3" aria-hidden />
          )}
          {audience ? t('chat.whisper') : t('chat.wholeTable')}
          <ChevronDown className="size-3" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel>{t('chat.whoReads')}</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={audience === null} onSelect={() => onChange(null)}>
          <Users className="mr-2 size-3.5" aria-hidden />
          {t('chat.wholeTable')}
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <Lock className="size-3 text-arcane" aria-hidden />
          {t('chat.whisperToLabel')}
        </DropdownMenuLabel>
        {hasGm && (
          <DropdownMenuCheckboxItem
            checked={audience?.gm ?? false}
            onSelect={(e) => {
              e.preventDefault();
              const current = audience ?? { gm: false, userIds: [] };
              toggle({ ...current, gm: !current.gm });
            }}
          >
            {t('chat.theGmCap')}
          </DropdownMenuCheckboxItem>
        )}
        {others.map((p) => (
          <DropdownMenuCheckboxItem
            key={p.id}
            checked={audience?.userIds.includes(p.id) ?? false}
            onSelect={(e) => {
              e.preventDefault();
              toggleUser(p.id);
            }}
          >
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            <span className="ml-2 shrink-0 text-[11px] text-subtle">
              {p.characterName ?? t(`common.roles.${p.role}`)}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-snug text-subtle">
          {t('chat.onlyChecked')}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Compteur sous la saisie : attente imposée, dépassement, ou longueur près de la limite. */
function counterText(t: Translator, remaining: number, length: number): string {
  if (remaining > 0) return t('chat.cooldown', { seconds: remaining });
  if (length > CHAT_MAX_BODY) return t('chat.tooLong', { count: length - CHAT_MAX_BODY });
  return length >= COUNTER_FROM ? `${length} / ${CHAT_MAX_BODY}` : '';
}
