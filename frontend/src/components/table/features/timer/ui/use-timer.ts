'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { remainingOf, timerStore, type TimerState } from '../state';

/** Le minuteur et son reste, rafraîchi quatre fois par seconde tant qu'il court. */
export function useTimer(): { timer: TimerState | null; remaining: number } {
  const t = useStore(timerStore, (s) => s.timer);
  const [now, setNow] = useState(() => Date.now());
  const running = t?.endsAt != null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  return { timer: t, remaining: t ? remainingOf(t, now) : 0 };
}
