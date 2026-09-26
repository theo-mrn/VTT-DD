'use client';

/**
 * Point de montage du lanceur 3D des jets (`throw.tsx`), là où l'ancienne app
 * montait `<DiceThrower />` (layout de la carte) : table de jeu et page /dice.
 * Un seul lanceur par page, chargé à la demande : le module WebGL (three,
 * cannon, carte d'environnement) n'est téléchargé qu'au premier
 * `vtt-trigger-3d-roll` ou `vtt-prepare-3d-roll`. Les événements reçus pendant
 * le chargement sont rejoués dès que le lanceur écoute.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

const DiceThrower = dynamic(() => import('./throw'), { ssr: false });

const EVENTS = ['vtt-trigger-3d-roll', 'vtt-prepare-3d-roll'] as const;

export function DiceThrowerHost() {
  const [wanted, setWanted] = useState(false);
  const readyRef = useRef(false);
  const queue = useRef<{ type: string; detail: unknown }[]>([]);

  useEffect(() => {
    const hold = (e: Event) => {
      if (readyRef.current) return;
      queue.current.push({ type: e.type, detail: (e as CustomEvent).detail });
      setWanted(true);
    };
    EVENTS.forEach((name) => window.addEventListener(name, hold));
    return () => EVENTS.forEach((name) => window.removeEventListener(name, hold));
  }, []);

  const onReady = useCallback(() => {
    if (readyRef.current) return;
    readyRef.current = true;
    for (const { type, detail } of queue.current.splice(0))
      window.dispatchEvent(new CustomEvent(type, { detail }));
  }, []);

  return wanted ? <DiceThrower onReady={onReady} /> : null;
}
