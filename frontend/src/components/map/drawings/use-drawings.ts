'use client';

/**
 * Accès React au module « dessins » : réglages des outils, éditeur de texte, caméra. Lectures
 * par sélecteurs à instantané stable : rien ne se re-rend au mouvement du pointeur.
 */
import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { NoteEditorState } from '@/lib/map/modules/drawings/note-editor';
import { drawingsRuntime, type DrawingsRuntime } from '@/lib/map/modules/drawings/runtime';
import type { DrawSettings } from '@/lib/map/modules/drawings/settings';

export function useDrawingsRuntime(engine: MapEngine): DrawingsRuntime {
  const rt = drawingsRuntime(engine);
  if (!rt) throw new Error('Module « dessins » absent de la carte');
  return rt;
}

export function useDrawSettings<T>(engine: MapEngine, selector: (s: DrawSettings) => T): T {
  return useStore(useDrawingsRuntime(engine).settings, selector);
}

export function useNoteEditor<T>(engine: MapEngine, selector: (s: NoteEditorState) => T): T {
  return useStore(useDrawingsRuntime(engine).editor.store, selector);
}

/** Compteur qui change avec la caméra (surcouches positionnées sur la carte). */
export function useCameraTick(engine: MapEngine, enabled: boolean): number {
  return useSyncExternalStore(
    (listener) => {
      if (!enabled) return () => undefined;
      return engine.camera.onChange(() => {
        tick += 1;
        listener();
      });
    },
    () => tick,
    () => tick,
  );
}

let tick = 0;
