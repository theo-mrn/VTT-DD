/**
 * Mixeur personnel (décision Q3) : en base par utilisateur, partagé entre ses
 * appareils, avec un cache local pour démarrer au bon volume avant la réponse
 * du serveur. Au premier chargement sans réglage serveur, les anciens réglages
 * du navigateur (`localStorage.audioMixerVolumes`) sont repris
 * (`migrateLegacyMixer`). Les changements sont appliqués tout de suite au
 * moteur et enregistrés par lots (400 ms).
 */
import type { BusName, MixerPreferences } from '@vtt/contracts';
import { DEFAULT_MIXER, migrateLegacyMixer } from '@vtt/contracts/audio-sync';
import { ApiError } from '../api';
import { audioApi } from './api';
import type { MixerState } from './engine/engine';

const CACHE_KEY = 'vtt-audio-mixer';
const LEGACY_KEY = 'audioMixerVolumes';
const SAVE_DELAY_MS = 400;

const clone = (m: MixerState): MixerState => ({
  volumes: { ...m.volumes },
  muted: { ...m.muted },
});

function readCache(): MixerState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MixerState;
    return {
      volumes: { ...DEFAULT_MIXER.volumes, ...parsed.volumes },
      muted: { ...DEFAULT_MIXER.muted, ...parsed.muted },
    };
  } catch {
    return null;
  }
}

function writeCache(m: MixerState) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(m));
  } catch {
    // Stockage indisponible (navigation privée) : le serveur fait foi
  }
}

export class MixerStore {
  state: MixerState = clone(DEFAULT_MIXER);
  private version = 0;
  private dirty: { volumes: Partial<MixerState['volumes']>; muted: Partial<MixerState['muted']> } =
    { volumes: {}, muted: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loaded: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly apply: (m: MixerState) => void) {
    if (typeof window !== 'undefined') {
      const cached = readCache();
      if (cached) this.state = cached;
    }
  }

  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  }
  private emit() {
    this.apply(this.state);
    writeCache(this.state);
    for (const l of this.listeners) l();
  }

  /** Lecture du serveur, une fois par onglet ; reprise des anciens réglages si besoin. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      this.apply(this.state);
      const server = await audioApi.mixer().catch(() => null);
      if (!server) return;
      if (server.version === 0) {
        let legacy: ReturnType<typeof migrateLegacyMixer> = null;
        try {
          legacy = migrateLegacyMixer(localStorage.getItem(LEGACY_KEY));
        } catch {
          legacy = null;
        }
        const local = readCache();
        const volumes = legacy ?? (local ? local.volumes : null);
        if (volumes) {
          const saved = await audioApi
            .saveMixer({ volumes, ...(local ? { muted: local.muted } : {}), version: 0 })
            .catch(() => null);
          if (saved) return this.adopt(saved);
        }
      }
      this.adopt(server);
    })();
    return this.loaded;
  }

  /** État du serveur (réponse, autre appareil) ; les changements en attente restent prioritaires. */
  adopt(p: MixerPreferences) {
    if (p.version < this.version) return;
    this.version = p.version;
    this.state = {
      volumes: { ...p.volumes, ...(this.dirty.volumes as MixerState['volumes']) },
      muted: { ...p.muted, ...(this.dirty.muted as MixerState['muted']) },
    };
    this.emit();
  }

  setVolume(bus: BusName, value: number) {
    const v = Math.max(0, Math.min(1, value));
    this.state = { ...this.state, volumes: { ...this.state.volumes, [bus]: v } };
    this.dirty.volumes[bus] = v;
    this.emit();
    this.schedule();
  }

  toggleMute(bus: BusName) {
    const m = !this.state.muted[bus];
    this.state = { ...this.state, muted: { ...this.state.muted, [bus]: m } };
    this.dirty.muted[bus] = m;
    this.emit();
    this.schedule();
  }

  reset() {
    this.state = clone(DEFAULT_MIXER);
    this.dirty = { volumes: { ...DEFAULT_MIXER.volumes }, muted: { ...DEFAULT_MIXER.muted } };
    this.emit();
    this.schedule();
  }

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  private async flush() {
    this.timer = null;
    const pending = this.dirty;
    if (!Object.keys(pending.volumes).length && !Object.keys(pending.muted).length) return;
    this.dirty = { volumes: {}, muted: {} };
    try {
      this.adopt(await audioApi.saveMixer({ ...pending, version: this.version }));
    } catch (e) {
      // Conflit (autre appareil) : on repart de son état, nos changements par-dessus
      if (e instanceof ApiError && e.status === 409) {
        const current = (e.problem as unknown as { current?: MixerPreferences }).current;
        this.dirty = {
          volumes: { ...pending.volumes, ...this.dirty.volumes },
          muted: { ...pending.muted, ...this.dirty.muted },
        };
        if (current) this.version = current.version;
        this.schedule();
      }
    }
  }
}
