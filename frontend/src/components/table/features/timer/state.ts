/**
 * Minuteur de la table : un compte à rebours lancé par le MJ, vu de tous. Passe par le canal
 * éphémère de la campagne (`table.timer`, jamais enregistré) ; un arrivant demande l'état
 * (`table.timer.ask`) et le MJ le lui renvoie. Les durées voyagent en « reste à courir » : chaque
 * appareil en déduit son échéance sur sa propre horloge (pas d'écart d'horloge entre appareils).
 */
import { createStore } from 'zustand/vanilla';

export const TIMER_KIND = 'table.timer';
export const TIMER_ASK_KIND = 'table.timer.ask';

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

interface TimerStore {
  timer: TimerState | null;
  /** Envoi à la table, posé par la surcouche une fois abonnée. */
  send: ((wire: TimerWire | null) => void) | null;
}

export const timerStore = createStore<TimerStore>(() => ({ timer: null, send: null }));

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

/** Change le minuteur ici et chez tous. */
function apply(next: TimerState | null) {
  timerStore.setState({ timer: next });
  timerStore.getState().send?.(toWire(next));
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
