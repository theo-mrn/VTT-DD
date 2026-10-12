'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { currentMinutes, worldTime, type WorldTime } from '../state';

/** Le temps du monde et l'heure présente, rafraîchie tant que le temps coule. */
export function useWorldTime(): { value: WorldTime | null; minutes: number } {
  const value = useStore(worldTime.store, (s) => s.value);
  const [now, setNow] = useState(() => Date.now());
  const rate = value?.rate ?? 0;
  useEffect(() => {
    if (!rate) return;
    // Une minute de jeu au plus entre deux rafraîchissements, une fois par seconde au moins
    const id = setInterval(() => setNow(Date.now()), Math.min(1000, 60_000 / rate));
    return () => clearInterval(id);
  }, [rate]);
  return { value, minutes: value ? currentMinutes(value, now) : 0 };
}
