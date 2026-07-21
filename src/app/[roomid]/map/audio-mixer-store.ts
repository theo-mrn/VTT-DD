import type { ComponentType } from 'react';

// Store global du composant de REMPLACEMENT du mixeur audio, fourni par un script de bundle
// (api.audio.setMixerPanel) — même pattern singleton que map-overlay-store/sheet-background-store.
// Quand un override est posé, MapDialogs.tsx le rend à la place du AudioMixerPanel natif, avec les
// MÊMES props {isOpen, onClose} : tout le câblage existant (raccourci clavier Q, bouton tool_mixer
// de la sidebar/toolbar, état actif, toggle) reste inchangé — seul le visuel change.
// Vidé par l'ExtensionHost au déchargement du bundle.

export type AudioMixerPanelComponent = ComponentType<{ isOpen: boolean; onClose: () => void }>;

let override: AudioMixerPanelComponent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function setAudioMixerPanelOverride(next: AudioMixerPanelComponent | null): void {
  if (next === override) return;
  override = next;
  notify();
}

export function getAudioMixerPanelOverride(): AudioMixerPanelComponent | null {
  return override;
}

/** Snapshot serveur/SSR stable — useSyncExternalStore exige une référence constante. */
export function getServerAudioMixerPanelOverride(): AudioMixerPanelComponent | null {
  return null;
}

export function subscribeAudioMixerPanelOverride(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
