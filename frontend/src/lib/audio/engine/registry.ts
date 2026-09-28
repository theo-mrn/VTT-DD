/**
 * Registre de tout ce qui peut sonner dans l'onglet : chaque voix (fichier, tampon, YouTube)
 * s'y inscrit à sa création et s'en retire à sa libération. Il vit sur `globalThis` : un
 * rechargement à chaud du code ne perd pas la trace des sons déjà lancés.
 *
 * `scanAudio()` lit l'état RÉEL de chaque voix (élément en lecture et temps qui avance,
 * lecteur YouTube en lecture, tampon dans sa fenêtre de lecture), pas ce que l'on croit qui
 * joue. Une voix dont le propriétaire ne veut plus (`owned()` faux : canal arrêté, effet fini,
 * écoute fermée, ancien moteur) est coupée : ce qui s'entend suit toujours l'état voulu.
 */

export type LiveKind = 'music' | 'ambience' | 'sfx' | 'zones' | 'preview';

export interface Registered {
  readonly id: string;
  readonly disposed: boolean;
  /** Nom affiché (titre du son) ; posé par le lecteur qui crée la voix. */
  label: string;
  kind: LiveKind;
  /** Le propriétaire veut-il encore cette voix ? Faux : voix orpheline, coupée au relevé. */
  owned: () => boolean;
  /** La voix produit-elle du son en ce moment (lu sur l'élément, le lecteur, le contexte) ? */
  sounding(): boolean;
  dispose(): void;
}

export interface LiveSound {
  id: string;
  label: string;
  kind: LiveKind;
}

interface Store {
  voices: Map<string, Registered>;
}

const store: Store = ((
  globalThis as unknown as { __vttAudioRegistry?: Store }
).__vttAudioRegistry ??= { voices: new Map() });

export function registerVoice(v: Registered): void {
  store.voices.set(v.id, v);
}

export function unregisterVoice(id: string): void {
  store.voices.delete(id);
}

/** Relevé réel : coupe les orphelines, renvoie ce qui sonne vraiment. */
export function scanAudio(): LiveSound[] {
  const live: LiveSound[] = [];
  for (const v of [...store.voices.values()]) {
    if (v.disposed) {
      store.voices.delete(v.id);
      continue;
    }
    let owned = true;
    try {
      owned = v.owned();
    } catch {
      owned = false;
    }
    if (!owned) {
      v.dispose();
      store.voices.delete(v.id);
      continue;
    }
    let sounding = false;
    try {
      sounding = v.sounding();
    } catch {
      sounding = false;
    }
    if (sounding) live.push({ id: v.id, label: v.label, kind: v.kind });
  }
  return live;
}

/** Coupe tout ce qui est inscrit (changement de moteur, « tout couper »). */
export function disposeAllVoices(): void {
  for (const v of [...store.voices.values()]) {
    try {
      v.dispose();
    } catch {
      // Déjà libérée
    }
  }
  store.voices.clear();
}
