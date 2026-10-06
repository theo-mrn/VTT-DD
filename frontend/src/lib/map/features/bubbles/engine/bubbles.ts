/**
 * Bulles d'interaction (emoji ou texte) au-dessus du token de son héros : le joueur s'exprime
 * sans écrire dans le chat. Canal éphémère `map.bubble` (relayé, jamais stocké) ; une bulle dure
 * de 1 à 60 s, une nouvelle remplace la précédente.
 *
 * Réservé aux joueurs : à la réception, une bulle n'est acceptée que de celui qui incarne le
 * personnage (à défaut, son propriétaire), et jamais pour un PNJ.
 *
 * Aucune dépendance au DOM ni à Pixi : horloge et minuteries injectées.
 */
import {
  BUBBLE_DURATION_MAX_MS,
  BUBBLE_DURATION_MIN_MS,
  MAP_BUBBLE_KIND,
  MapBubbleMessage,
} from '@vtt/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { CharacterInfo } from '@/lib/map/features/tokens/engine/model';

export const BUBBLE_KIND = MAP_BUBBLE_KIND;

export type BubbleType = 'emoji' | 'text';

export interface Bubble {
  characterId: string;
  type: BubbleType;
  content: string;
  /** Instant de disparition (horloge locale). */
  until: number;
  /** Change à chaque nouvelle bulle du personnage (rejoue l'apparition). */
  seq: number;
}

export interface BubblesState {
  bubbles: Readonly<Record<string, Bubble>>;
}

interface Clock {
  now(): number;
  setTimeout(cb: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (cb, ms) => setTimeout(cb, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** Le personnage que ce joueur fait parler : celui qu'il incarne, sinon son seul héros. */
export function speakerOf(
  characters: readonly CharacterInfo[],
  userId: string,
): CharacterInfo | null {
  const played = characters.find((c) => c.playedBy === userId && c.kind !== 'npc');
  if (played) return played;
  const owned = characters.filter((c) => c.ownerId === userId && !c.playedBy && c.kind === 'pc');
  return owned.length === 1 ? owned[0]! : null;
}

/** L'émetteur a le droit de faire parler ce personnage. */
export function maySpeak(info: CharacterInfo | undefined, userId: string): boolean {
  if (!info || info.kind === 'npc') return false;
  return info.playedBy ? info.playedBy === userId : info.ownerId === userId;
}

const clampDuration = (ms: number) =>
  Math.round(Math.min(Math.max(ms, BUBBLE_DURATION_MIN_MS), BUBBLE_DURATION_MAX_MS));

export class BubbleBoard {
  readonly store: StoreApi<BubblesState> = createStore<BubblesState>()(() => ({ bubbles: {} }));
  private readonly timers = new Map<string, unknown>();
  private seq = 0;

  constructor(
    private readonly characters: (id: string) => CharacterInfo | undefined,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Message reçu d'un autre membre ; ignoré s'il est mal formé ou s'il n'en a pas le droit. */
  receive(data: unknown, from: { userId: string }): void {
    const parsed = MapBubbleMessage.safeParse(data);
    if (!parsed.success) return;
    const { c, b } = parsed.data;
    if (!maySpeak(this.characters(c), from.userId)) return;
    if (b) this.show(c, b.t, b.v, b.d);
    else this.clear(c);
  }

  show(characterId: string, type: BubbleType, content: string, durationMs: number): void {
    const ms = clampDuration(durationMs);
    this.cancel(characterId);
    this.seq += 1;
    const bubble: Bubble = {
      characterId,
      type,
      content,
      until: this.clock.now() + ms,
      seq: this.seq,
    };
    this.store.setState((s) => ({ bubbles: { ...s.bubbles, [characterId]: bubble } }));
    this.timers.set(
      characterId,
      this.clock.setTimeout(() => this.clear(characterId), ms),
    );
  }

  clear(characterId: string): void {
    this.cancel(characterId);
    if (!(characterId in this.store.getState().bubbles)) return;
    this.store.setState((s) => {
      const next = { ...s.bubbles };
      delete next[characterId];
      return { bubbles: next };
    });
  }

  dispose(): void {
    for (const h of this.timers.values()) this.clock.clearTimeout(h);
    this.timers.clear();
  }

  private cancel(characterId: string) {
    const h = this.timers.get(characterId);
    if (h !== undefined) this.clock.clearTimeout(h);
    this.timers.delete(characterId);
  }
}

/** Message à envoyer : une bulle, ou `null` pour retirer la sienne. */
export function bubbleMessage(
  characterId: string,
  bubble: { type: BubbleType; content: string; durationMs: number } | null,
): MapBubbleMessage {
  return {
    c: characterId,
    b: bubble
      ? { t: bubble.type, v: bubble.content.trim(), d: clampDuration(bubble.durationMs) }
      : null,
  };
}
