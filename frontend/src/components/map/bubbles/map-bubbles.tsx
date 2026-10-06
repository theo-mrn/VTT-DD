'use client';

/**
 * Bulles d'interaction de la carte (lib/map/bubbles) : réception et envoi sur le canal éphémère,
 * bulles au-dessus des tokens, et K pour ouvrir le sélecteur du joueur (bouton « Bulle » de la
 * barre d'outils, `BubbleToolbarButton`).
 */
import { AnimatePresence, motion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { useStore } from 'zustand';
import {
  BUBBLE_KIND,
  BubbleBoard,
  bubbleMessage,
  speakerOf,
  type Bubble,
} from '@/lib/map/bubbles/bubbles';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { TOKENS_COLLECTION, type TokenData } from '@/lib/map/modules/tokens/model';
import { tokensStateOf } from '@/lib/map/modules/tokens/state';
import { useCampaignEphemeral } from '@/lib/realtime';
import { useMapEngine, useMapHost, useMapState } from '../engine-context';
import { trackOverlay } from '../overlay-tracker';
import { bubbleControlOf } from './bubble-control';

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function MapBubbles() {
  const engine = useMapEngine();
  const hostRef = useMapHost();
  const campaignId = useMapState((s) => s.campaignId);
  const board = useMemo(
    () => new BubbleBoard((id) => tokensStateOf(engine)?.directory.get(id)),
    [engine],
  );
  useEffect(() => () => board.dispose(), [board]);
  const { send } = useCampaignEphemeral(campaignId, [BUBBLE_KIND], (m) =>
    board.receive(m.data, m.from),
  );
  const sendRef = useRef(send);
  sendRef.current = send;
  const speaker = useSpeaker(engine);
  const active = useStore(board.store, (s) => !!speaker && speaker in s.bubbles);

  // La barre d'outils lit le héros, sa bulle, et envoie par ici
  const control = bubbleControlOf(engine);
  useEffect(() => {
    control.setState({
      speaker,
      ...(speaker ? {} : { open: false }),
      send: (type, content, durationMs) => {
        if (!speaker) return;
        const msg = bubbleMessage(speaker, { type, content, durationMs });
        board.show(speaker, type, msg.b!.v, msg.b!.d);
        sendRef.current(BUBBLE_KIND, msg);
      },
      clear: () => {
        if (!speaker) return;
        board.clear(speaker);
        sendRef.current(BUBBLE_KIND, bubbleMessage(speaker, null));
      },
    });
  }, [control, board, speaker]);
  useEffect(() => control.setState({ active }), [control, active]);

  // K : ouvrir ou fermer le sélecteur (hors saisie)
  useEffect(() => {
    if (!speaker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyK' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (editable(e.target)) return;
      e.preventDefault();
      control.setState((s) => ({ open: !s.open }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [control, speaker]);

  return <BubblesLayer engine={engine} board={board} hostRef={hostRef} />;
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
}: Readonly<{
  engine: MapEngine;
  board: BubbleBoard;
  hostRef: RefObject<HTMLElement | null>;
}>) {
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
}: Readonly<{
  engine: MapEngine;
  hostRef: RefObject<HTMLElement | null>;
  tokenId: string;
  bubble: Bubble;
}>) {
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
