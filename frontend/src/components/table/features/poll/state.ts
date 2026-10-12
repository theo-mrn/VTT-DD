'use client';

/**
 * Sondage rapide : le MJ pose une question à choix, chacun vote (une voix, modifiable), les
 * résultats se mettent à jour en direct. Le MJ tient le décompte : les voix lui arrivent seul
 * (`table.poll.vote`, MJ seulement), il diffuse les totaux, jamais qui a voté quoi.
 */
import { createStore } from 'zustand/vanilla';
import { createGmSharedState } from '../shared/gm-state';

export const POLL_VOTE_KIND = 'table.poll.vote';
export const MAX_OPTIONS = 8;

export interface Poll {
  id: string;
  question: string;
  options: string[];
  counts: number[];
  closed: boolean;
}

export function normalizePoll(raw: unknown): Poll | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Poll>;
  if (typeof p.id !== 'string' || !Array.isArray(p.options)) return null;
  const options = p.options
    .filter((o): o is string => typeof o === 'string')
    .map((o) => o.slice(0, 80))
    .slice(0, MAX_OPTIONS);
  if (options.length < 2) return null;
  return {
    id: p.id,
    question: typeof p.question === 'string' ? p.question.slice(0, 160) : '',
    options,
    counts: options.map((_, i) => {
      const n = Array.isArray(p.counts) ? p.counts[i] : 0;
      return typeof n === 'number' && n >= 0 ? Math.floor(n) : 0;
    }),
    closed: p.closed === true,
  };
}

export const poll = createGmSharedState<Poll>('table.poll', { decode: normalizePoll });

/** MJ : voix reçues (utilisateur → option), pour le sondage en cours seulement. */
const votes = new Map<string, number>();

/** Mon vote, par sondage (local). */
export const myVotes = createStore<Record<string, number>>(() => ({}));

export const pollActions = {
  start(question: string, options: string[]) {
    votes.clear();
    poll.set({
      id: crypto.randomUUID(),
      question,
      options,
      counts: options.map(() => 0),
      closed: false,
    });
  },
  /** MJ : une voix (la sienne ou reçue) ; la précédente du même votant est remplacée. */
  tally(pollId: string, userId: string, option: number) {
    const p = poll.store.getState().value;
    if (!p || p.id !== pollId || p.closed || option < 0 || option >= p.options.length) return;
    votes.set(userId, option);
    const counts = p.options.map(() => 0);
    for (const o of votes.values()) counts[o] = (counts[o] ?? 0) + 1;
    poll.set({ ...p, counts });
  },
  close() {
    const p = poll.store.getState().value;
    if (p) poll.set({ ...p, closed: true });
  },
  clear() {
    votes.clear();
    poll.set(null);
  },
};
