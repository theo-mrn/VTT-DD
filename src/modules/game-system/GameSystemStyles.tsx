"use client"

import { useEffect } from 'react';
import { db, collection, getDocs, query, where } from '@/lib/firebase';
import { useGameSystem } from './useGameSystem';
import type { StyleDoc } from '@/modules/game-content/types';

// Injecte les feuilles de style du bundle de règles de la salle (content docs kind:'style') dans
// <head>, et les retire à la sortie de salle / au changement de système. Le CSS est libre : il peut
// surcharger les variables du thème (:root, :root[class] { --accent-brown: ... } — la variante
// [class] bat les classes .dark/.tavern de globals.css) ou restyler n'importe quel composant.
// Lecture one-shot, comme l'ExtensionHost : un changement de règles = re-entrer dans la salle.
export function GameSystemStyles({ roomId }: { roomId: string | null }) {
  const { gameSystem, contentPath, isLoading } = useGameSystem(roomId);
  const systemId = gameSystem.systemId;

  useEffect(() => {
    if (!roomId || isLoading || !systemId) return;
    let cancelled = false;
    const injected: HTMLStyleElement[] = [];

    const load = async () => {
      let styleDocs: StyleDoc[];
      try {
        const snap = await getDocs(query(collection(db, contentPath), where('kind', '==', 'style')));
        styleDocs = snap.docs.map((d) => d.data() as StyleDoc).filter((d) => typeof d.css === 'string');
      } catch {
        return; // droits/room absents : rien à injecter
      }
      if (cancelled) return;
      for (const styleDoc of styleDocs.sort((a, b) => a.path.localeCompare(b.path))) {
        const el = document.createElement('style');
        el.dataset.bundleStyle = styleDoc.path;
        el.textContent = styleDoc.css;
        document.head.appendChild(el);
        injected.push(el);
      }
    };
    void load();

    return () => {
      cancelled = true;
      for (const el of injected) el.remove();
    };
  }, [roomId, contentPath, systemId, isLoading]);

  return null;
}
