"use client"

import { useEffect } from 'react';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { setAudioMixerPanelOverride } from '@/app/[roomid]/map/audio-mixer-store';
import { DndMixerPanel } from './mixer';
import { DND_THEME_CSS } from './theme';

// Reskin visuel du système par défaut (dnd-classic) : thème parchemin/cuir + mixeur à
// potentiomètres rotatifs. Contrairement à un bundle importé (Star Wars...), dnd-classic est un
// module builtin câblé dans le code — pas de content doc Firestore à lire, on injecte directement
// le CSS et on pose l'override du mixeur tant que ce système est actif.
export function DndTheme({ roomId }: { roomId: string | null }) {
  const { gameSystem } = useGameSystem(roomId);
  const isActive = gameSystem.systemId === 'dnd-classic';

  useEffect(() => {
    if (!isActive) return;
    const el = document.createElement('style');
    el.dataset.dndTheme = 'true';
    el.textContent = DND_THEME_CSS;
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) return;
    setAudioMixerPanelOverride(DndMixerPanel);
    return () => setAudioMixerPanelOverride(null);
  }, [isActive]);

  return null;
}
