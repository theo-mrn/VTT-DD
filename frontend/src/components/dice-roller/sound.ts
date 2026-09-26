/**
 * Son des dés 3D : le rendu (`(dices)/audio.ts`) lit le volume `dice3d` du
 * mixeur (clé `audioMixerVolumes`) et écoute ses changements. La préférence
 * « son » du service des dés s'y reporte : coupé, le volume des dés passe à 0 ;
 * rétabli, il reprend la valeur gardée avant la coupure.
 */
const MIXER_KEY = 'audioMixerVolumes';
const SAVED_KEY = 'vtt-dice-sound-volume';

function readMixer(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(MIXER_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function applyDiceSound(enabled: boolean) {
  if (typeof window === 'undefined') return;
  const mixer = readMixer();
  const current = typeof mixer.dice3d === 'number' ? mixer.dice3d : 1;
  let next = current;
  try {
    if (!enabled) {
      if (current > 0) localStorage.setItem(SAVED_KEY, String(current));
      next = 0;
    } else if (current === 0) {
      const saved = Number(localStorage.getItem(SAVED_KEY));
      next = Number.isFinite(saved) && saved > 0 ? saved : 1;
    }
    if (next !== current || typeof mixer.dice3d !== 'number')
      localStorage.setItem(MIXER_KEY, JSON.stringify({ ...mixer, dice3d: next }));
  } catch {
    // Stockage indisponible : seul le nœud audio déjà créé suit la préférence
  }
  window.dispatchEvent(new CustomEvent('audioMixerVolumeChange', { detail: { dice3d: next } }));
}
