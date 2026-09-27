'use client';

import { useEffect, useState } from 'react';

/** Heure courante rafraîchie régulièrement : les « il y a 3 min » restent justes. */
export function useMaintenant(intervalle = 30_000): number {
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), intervalle);
    return () => clearInterval(t);
  }, [intervalle]);
  return maintenant;
}
