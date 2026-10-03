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
  /** Devait jouer mais le navigateur bloque la lecture (YouTube sans geste de l'utilisateur). */
  stalled?(): boolean;
  /** Relance une lecture bloquée ; appelé pendant un geste de l'utilisateur. */
  kick?(): void;
  /** État lisible pour le diagnostic (élément, lecteur, gain, dernière erreur). */
  describe?(): string;
  /** Mixeur changé : une voix lue hors graphe (mode direct) recalcule son volume. */
  refreshOutput?(): void;
  dispose(): void;
}

export interface VoiceReport {
  id: string;
  label: string;
  kind: LiveKind;
  owned: boolean;
  sounding: boolean;
  detail: string;
}

export interface LiveSound {
  id: string;
  label: string;
  kind: LiveKind;
}

interface Store {
  voices: Map<string, Registered>;
  /** Contextes audio créés par un moteur (une seule sortie son à la fois). */
  contexts?: Set<BaseAudioContext>;
  /** Boîtes des lecteurs YouTube suivis, dans le conteneur caché. */
  youtubeBoxes?: Set<Element>;
  /** Prévenu à chaque voix inscrite (le moteur relance son relevé). Un seul : le moteur courant. */
  onRegister?: (() => void) | null;
}

const store: Store = ((
  globalThis as unknown as { __vttAudioRegistry?: Store }
).__vttAudioRegistry ??= { voices: new Map() });
store.contexts ??= new Set();
store.youtubeBoxes ??= new Set();

/**
 * Nouveau contexte d'un moteur : tous les autres sont fermés. Un son routé par un ancien
 * moteur (code précédent, onglet resté ouvert pendant une mise à jour) se tait avec eux.
 */
export function adoptContext(ctx: BaseAudioContext): void {
  for (const other of store.contexts!) {
    if (other === ctx) continue;
    // Déjà fermé : la promesse est rejetée, sans conséquence
    void (other as AudioContext).close?.()?.catch(() => undefined);
    store.contexts!.delete(other);
  }
  store.contexts!.add(ctx);
}

export function trackYoutubeBox(box: Element): void {
  store.youtubeBoxes!.add(box);
}

export function untrackYoutubeBox(box: Element): void {
  store.youtubeBoxes!.delete(box);
}

/** Id du conteneur caché des lecteurs YouTube (partagé avec youtube.ts). */
export const YOUTUBE_HOST_ID = 'vtt-youtube-host';

/**
 * Supprime tout lecteur YouTube du conteneur caché qu'aucune voix ne suit (ancien code,
 * voix perdue) : retirer l'iframe arrête sa lecture. Filet indépendant du moteur.
 */
export function sweepYoutubeHost(): number {
  if (typeof document === 'undefined') return 0;
  const host = document.getElementById(YOUTUBE_HOST_ID);
  if (!host) return 0;
  let removed = 0;
  for (const child of [...host.children]) {
    if (store.youtubeBoxes!.has(child)) continue;
    child.remove();
    removed += 1;
  }
  return removed;
}

export function registerVoice(v: Registered): void {
  store.voices.set(v.id, v);
  store.onRegister?.();
}

/** Le moteur courant veut savoir qu'une voix est née (relevé arrêté quand il n'y en a aucune). */
export function onVoiceRegistered(listener: (() => void) | null): void {
  store.onRegister = listener;
}

/** Voix inscrites, sonnantes ou non. */
export function voiceCount(): number {
  return store.voices.size;
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

/** Une voix voulue est-elle bloquée par le navigateur ? */
export function anyStalled(): boolean {
  for (const v of store.voices.values()) {
    try {
      if (!v.disposed && v.stalled?.()) return true;
    } catch {
      // Lecteur indisponible : pas un blocage à signaler
    }
  }
  return false;
}

/** Relance les voix bloquées : à appeler pendant un geste de l'utilisateur (clic, touche). */
export function kickAll(): void {
  for (const v of store.voices.values()) {
    try {
      v.kick?.();
    } catch {
      // Lecteur indisponible
    }
  }
}

/** Mixeur changé : chaque voix hors graphe recalcule son volume. */
export function refreshAllOutputs(): void {
  for (const v of store.voices.values()) {
    try {
      v.refreshOutput?.();
    } catch {
      // Voix hors d'usage
    }
  }
}

/** Toutes les voix inscrites, telles qu'elles sont réellement (diagnostic). */
export function reportVoices(): VoiceReport[] {
  return [...store.voices.values()].map((v) => {
    const safe = <T>(f: () => T, d: T) => {
      try {
        return f();
      } catch {
        return d;
      }
    };
    return {
      id: v.id,
      label: v.label,
      kind: v.kind,
      owned: safe(() => v.owned(), false),
      sounding: safe(() => v.sounding(), false),
      detail: safe(() => v.describe?.() ?? '', 'illisible'),
    };
  });
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
