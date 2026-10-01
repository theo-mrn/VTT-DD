'use client';

/**
 * Bulles d'interaction de la carte (lib/map/bubbles) : les bulles au-dessus des tokens, et la
 * barre du joueur (K) pour faire parler son héros d'un emoji ou d'un mot.
 */
import {
  BUBBLE_DURATION_DEFAULT_MS,
  BUBBLE_DURATION_MAX_MS,
  BUBBLE_DURATION_MIN_MS,
  BUBBLE_TEXT_MAX,
} from '@vtt/contracts';
import { AnimatePresence, motion } from 'motion/react';
import { SendHorizontal, Smile, Timer, Trash2, Type } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { useStore } from 'zustand';
import { HUD_BAR } from '@/components/combat/live-reports/look';
import { Info } from '@/components/ui/tooltip';
import {
  BUBBLE_KIND,
  BubbleBoard,
  bubbleMessage,
  speakerOf,
  type Bubble,
  type BubbleType,
} from '@/lib/map/bubbles/bubbles';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { TOKENS_COLLECTION, type TokenData } from '@/lib/map/modules/tokens/model';
import { tokensStateOf } from '@/lib/map/modules/tokens/state';
import { useCampaignEphemeral } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useMapEngine } from '../engine-context';
import { trackOverlay } from '../overlay-tracker';

export function MapBubbles({
  campaignId,
  hostRef,
}: {
  campaignId: string;
  hostRef: RefObject<HTMLElement | null>;
}) {
  const engine = useMapEngine();
  const board = useMemo(
    () => new BubbleBoard((id) => tokensStateOf(engine)?.directory.get(id)),
    [engine],
  );
  useEffect(() => () => board.dispose(), [board]);
  const { send } = useCampaignEphemeral(campaignId, [BUBBLE_KIND], (m) =>
    board.receive(m.data, m.from),
  );
  const speaker = useSpeaker(engine);
  const active = useStore(board.store, (s) => !!speaker && speaker in s.bubbles);

  return (
    <>
      <BubblesLayer engine={engine} board={board} hostRef={hostRef} />
      {speaker && (
        <BubbleBar
          active={active}
          onSend={(type, content, durationMs) => {
            const msg = bubbleMessage(speaker, { type, content, durationMs });
            board.show(speaker, type, msg.b!.v, msg.b!.d);
            send(BUBBLE_KIND, msg);
          }}
          onClear={() => {
            board.clear(speaker);
            send(BUBBLE_KIND, bubbleMessage(speaker, null));
          }}
        />
      )}
    </>
  );
}

/** Le héros que ce joueur fait parler ; null pour le MJ, un spectateur, ou sans héros. */
function useSpeaker(engine: MapEngine): string | null {
  const directory = tokensStateOf(engine)?.directory;
  const subscribe = useCallback(
    (cb: () => void) => directory?.subscribe(cb) ?? (() => undefined),
    [directory],
  );
  const list = useSyncExternalStore(
    subscribe,
    () => directory?.list() ?? EMPTY,
    () => EMPTY,
  );
  if (engine.viewer.role !== 'player') return null;
  return speakerOf(list, engine.viewer.userId)?.id ?? null;
}

const EMPTY: readonly never[] = [];

// ─── Bulles au-dessus des tokens ─────────────────────────────────────────────

function BubblesLayer({
  engine,
  board,
  hostRef,
}: {
  engine: MapEngine;
  board: BubbleBoard;
  hostRef: RefObject<HTMLElement | null>;
}) {
  const bubbles = useStore(board.store, (s) => s.bubbles);
  const tokens = useStore(engine.store, (s) => s.collections[TOKENS_COLLECTION]);
  // Tokens de chaque personnage qui parle (un personnage peut en avoir plusieurs sur la scène)
  const placed = useMemo(() => {
    const out: { tokenId: string; bubble: Bubble }[] = [];
    if (!tokens) return out;
    for (const t of tokens.values() as Iterable<TokenData>) {
      const bubble = bubbles[t.characterId];
      if (bubble) out.push({ tokenId: t.id, bubble });
    }
    return out;
  }, [tokens, bubbles]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-live="polite">
      <AnimatePresence>
        {placed.map(({ tokenId, bubble }) => (
          <TokenBubble
            key={`${tokenId}:${bubble.seq}`}
            engine={engine}
            hostRef={hostRef}
            tokenId={tokenId}
            bubble={bubble}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function TokenBubble({
  engine,
  hostRef,
  tokenId,
  bubble,
}: {
  engine: MapEngine;
  hostRef: RefObject<HTMLElement | null>;
  tokenId: string;
  bubble: Bubble;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const host = hostRef.current;
    if (!el || !host) return;
    return trackOverlay(engine, el, host, (sizes) => {
      const entity = engine.entity(tokenId);
      // Token caché (vision, calque, affichage) : sa bulle ne le trahit pas
      if (!entity || entity.masks.size) {
        el.style.visibility = 'hidden';
        return;
      }
      const box = entity.bounds();
      const p = engine.camera.worldToScreen({ x: box.x + box.width / 2, y: box.y });
      el.style.visibility = '';
      el.style.transform = `translate(${Math.round(p.x - sizes.w / 2)}px, ${Math.round(p.y - sizes.h - 6)}px)`;
    });
  }, [engine, hostRef, tokenId]);

  return (
    <div ref={ref} className="absolute left-0 top-0" style={{ visibility: 'hidden' }}>
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.6 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.7, transition: { duration: 0.15 } }}
        transition={{ type: 'spring', damping: 22, stiffness: 380 }}
        className="origin-bottom"
      >
        {bubble.type === 'emoji' ? (
          <span className="block text-[30px] leading-none drop-shadow-[0_2px_4px_rgb(0_0_0/0.5)]">
            {bubble.content}
          </span>
        ) : (
          <span className="relative block max-w-[200px] truncate rounded-xl border border-border-strong bg-popover/95 px-2.5 py-1 text-[13px] font-medium text-foreground shadow-elevated">
            {bubble.content}
          </span>
        )}
      </motion.div>
    </div>
  );
}

// ─── Barre du joueur (K) ─────────────────────────────────────────────────────

/** Emoji utiles en partie : réactions, émotions, combat, table. */
const PALETTE = [
  '😀',
  '😂',
  '😅',
  '😊',
  '😉',
  '😍',
  '🤔',
  '🤨',
  '😐',
  '😏',
  '😬',
  '😳',
  '😱',
  '😨',
  '😢',
  '😭',
  '😡',
  '🤬',
  '😴',
  '🤢',
  '😵',
  '🥳',
  '😎',
  '🤫',
  '👍',
  '👎',
  '👏',
  '🙏',
  '💪',
  '✋',
  '👀',
  '🤝',
  '❤️',
  '💔',
  '❗',
  '❓',
  '💤',
  '💀',
  '⚔️',
  '🛡️',
  '🏹',
  '🔥',
  '⚡',
  '🩸',
  '💰',
  '🍺',
  '🎲',
  '🎉',
];
const RECENT_KEY = 'vtt:bulles:recents';
const RECENT_MAX = 8;
const DURATIONS_S = [3, 5, 10, 30];

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function pushRecent(emoji: string): string[] {
  const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* stockage indisponible : la liste ne sera pas retenue */
  }
  return next;
}

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

type Pane = 'emoji' | 'text' | 'duration' | null;

function BubbleBar({
  active,
  onSend,
  onClear,
}: {
  active: boolean;
  onSend: (type: BubbleType, content: string, durationMs: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pane, setPane] = useState<Pane>('emoji');
  const [text, setText] = useState('');
  const [seconds, setSeconds] = useState(BUBBLE_DURATION_DEFAULT_MS / 1000);
  const [recent, setRecent] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);

  // K : ouvrir ou fermer (hors saisie) ; Échap : fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        return;
      }
      if (e.code !== 'KeyK' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (editable(e.target)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    setPane('emoji');
    setText('');
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const ms = seconds * 1000;
  const sendEmoji = (emoji: string) => {
    setRecent(pushRecent(emoji));
    onSend('emoji', emoji, ms);
    setOpen(false);
  };
  const sendText = () => {
    if (!text.trim()) return;
    onSend('text', text, ms);
    setOpen(false);
  };

  return (
    <div
      ref={root}
      className="pointer-events-none absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      <AnimatePresence>
        {open && pane && (
          <motion.div
            key={pane}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className="pointer-events-auto rounded-2xl border border-border-strong bg-popover/95 p-2 shadow-elevated"
          >
            {pane === 'emoji' && (
              <div className="w-[19rem] space-y-1.5">
                {recent.length > 0 && (
                  <>
                    <EmojiGrid emojis={recent} onPick={sendEmoji} />
                    <div className="h-px bg-border" />
                  </>
                )}
                <EmojiGrid emojis={PALETTE} onPick={sendEmoji} />
              </div>
            )}
            {pane === 'text' && (
              <form
                className="flex w-72 items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendText();
                }}
              >
                <input
                  autoFocus
                  value={text}
                  maxLength={BUBBLE_TEXT_MAX}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Votre réplique…"
                  aria-label="Texte de la bulle"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface-2 px-2.5 text-sm text-foreground outline-none placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-ring/40"
                />
                <button
                  type="submit"
                  disabled={!text.trim()}
                  aria-label="Envoyer"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary-strong disabled:opacity-40"
                >
                  <SendHorizontal className="size-4" />
                </button>
              </form>
            )}
            {pane === 'duration' && (
              <div className="flex items-center gap-1">
                {DURATIONS_S.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={seconds === s}
                    onClick={() => setSeconds(s)}
                    className={cn(
                      'h-8 min-w-9 rounded-lg px-2 text-xs font-medium tabular-nums transition-colors',
                      seconds === s
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
                    )}
                  >
                    {s} s
                  </button>
                ))}
                <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
                <input
                  type="number"
                  min={BUBBLE_DURATION_MIN_MS / 1000}
                  max={BUBBLE_DURATION_MAX_MS / 1000}
                  value={seconds}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v))
                      setSeconds(
                        Math.min(
                          Math.max(Math.round(v), BUBBLE_DURATION_MIN_MS / 1000),
                          BUBBLE_DURATION_MAX_MS / 1000,
                        ),
                      );
                  }}
                  aria-label="Durée en secondes"
                  className="h-8 w-14 rounded-lg border border-border-strong bg-surface-2 px-1.5 text-center text-xs tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className={HUD_BAR}
            role="toolbar"
            aria-label="Bulle de mon héros"
          >
            <PaneButton
              label="Emoji"
              icon={Smile}
              on={pane === 'emoji'}
              onClick={() => setPane('emoji')}
            />
            <PaneButton
              label="Texte"
              icon={Type}
              on={pane === 'text'}
              onClick={() => setPane('text')}
            />
            <PaneButton
              label="Durée"
              icon={Timer}
              on={pane === 'duration'}
              onClick={() => setPane('duration')}
              value={`${seconds} s`}
            />
            {active && (
              <>
                <span className="mx-0.5 h-6 w-px bg-border" aria-hidden />
                <Info texte="Retirer ma bulle">
                  <button
                    type="button"
                    aria-label="Retirer ma bulle"
                    onClick={() => {
                      onClear();
                      setOpen(false);
                    }}
                    className="flex size-10 items-center justify-center rounded-[14px] text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </Info>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PaneButton({
  label,
  icon: Icon,
  on,
  onClick,
  value,
}: {
  label: string;
  icon: typeof Smile;
  on: boolean;
  onClick: () => void;
  value?: string;
}) {
  return (
    <Info texte={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        onClick={onClick}
        className={cn(
          'flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-[14px] px-2.5 text-xs font-medium tabular-nums transition-colors',
          on
            ? 'bg-primary/15 text-primary-strong'
            : 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
        )}
      >
        <Icon className="size-4" />
        {value}
      </button>
    </Info>
  );
}

function EmojiGrid({ emojis, onPick }: { emojis: readonly string[]; onPick: (e: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emojis.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          aria-label={e}
          className="flex size-9 items-center justify-center rounded-lg text-[22px] leading-none transition-transform hover:scale-110 hover:bg-surface-3"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
