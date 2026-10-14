/**
 * Minuteur de la table : un compte à rebours lancé par le MJ, vu de tous. Gardé par le service
 * campaign (état de la table) : l'échéance est un instant du serveur, ramené à l'horloge locale.
 * Les automatismes le lancent, et réagissent quand il arrive à zéro.
 */
import { createStore } from 'zustand/vanilla';
import { createTableSlice, toLocal } from '../shared/table-state';

/** Ce qui voyage ; null : minuteur arrêté. */
export interface TimerWire {
  label: string;
  durationMs: number;
  remainingMs: number;
  running: boolean;
}

export interface TimerState {
  label: string;
  durationMs: number;
  /** Échéance sur l'horloge locale ; null : en pause. */
  endsAt: number | null;
  /** Reste à courir quand le minuteur est en pause. */
  remainingMs: number;
}

export const remainingOf = (t: TimerState, now = Date.now()) =>
  t.endsAt === null ? t.remainingMs : Math.max(0, t.endsAt - now);

export const toWire = (t: TimerState | null, now = Date.now()): TimerWire | null =>
  t && {
    label: t.label,
    durationMs: t.durationMs,
    remainingMs: remainingOf(t, now),
    running: t.endsAt !== null,
  };

export function fromWire(w: unknown, now = Date.now()): TimerState | null {
  if (!w || typeof w !== 'object') return null;
  const { label, durationMs, remainingMs, running } = w as Partial<TimerWire>;
  if (typeof durationMs !== 'number' || typeof remainingMs !== 'number') return null;
  const reste = Math.max(0, Math.min(remainingMs, 24 * 3600_000));
  return {
    label: typeof label === 'string' ? label.slice(0, 80) : '',
    durationMs: Math.max(reste, durationMs),
    endsAt: running ? now + reste : null,
    remainingMs: reste,
  };
}

/** Tranche de l'état de table (serveur). */
const slice = createTableSlice<TimerState>(
  (s) =>
    s.timer && {
      label: s.timer.label,
      durationMs: s.timer.durationMs,
      remainingMs: s.timer.remainingMs,
      endsAt: s.timer.endsAt ? toLocal(s.timer.endsAt) : null,
    },
  (t) => ({ timer: toWire(t) }),
);

/** Le minuteur en cours (lecture). */
export const timerStore = createStore<{ timer: TimerState | null }>(() => ({ timer: null }));
slice.store.subscribe((s) => timerStore.setState({ timer: s.value }));

/** Change le minuteur ici et chez tous. */
function apply(next: TimerState | null) {
  slice.set(next);
}

/** Commandes du MJ. */
export const timer = {
  start(durationMs: number, label: string) {
    apply({ label, durationMs, endsAt: Date.now() + durationMs, remainingMs: durationMs });
  },
  pause() {
    const t = timerStore.getState().timer;
    if (t?.endsAt != null) apply({ ...t, endsAt: null, remainingMs: remainingOf(t) });
  },
  resume() {
    const t = timerStore.getState().timer;
    if (t && t.endsAt === null) apply({ ...t, endsAt: Date.now() + t.remainingMs });
  },
  add(ms: number) {
    const t = timerStore.getState().timer;
    if (!t) return;
    const reste = remainingOf(t) + ms;
    apply({
      ...t,
      durationMs: Math.max(t.durationMs, reste),
      remainingMs: reste,
      endsAt: t.endsAt === null ? null : Date.now() + reste,
    });
  },
  stop() {
    apply(null);
  },
};

/** « 4:05 », « 1:02:30 ». */
export function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
