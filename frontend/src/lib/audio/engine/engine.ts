/**
 * Moteur audio unique du front (docs/audio.md § 3.8, 4.5) : un seul
 * AudioContext, créé à la première demande, singleton hors React. Il porte
 * l'horloge du serveur, le mixeur, les canaux et les effets de la campagne
 * attachée (une à la fois).
 *
 * Autoplay : un seul déverrouillage, au premier `pointerdown`, `keydown` ou
 * `touchend` (capture) ; l'état `interrupted` d'iOS vaut `locked`. Au
 * déverrouillage, chaque canal repart à la position de la ligne de temps.
 */
import type { BusName, ChannelName, ChannelState } from '@vtt/contracts';
import { busGain, DEFAULT_MIXER, reduceChannel } from '@vtt/contracts/audio-sync';
import { audioApi } from '../api';
import { RESYNC_EVERY_MS, ServerClock } from '../sync/clock';
import { BufferCache } from './cache';
import { ChannelPlayer } from './channel-player';
import { CuePlayer } from './cue-player';
import { AudioGraph, type AudioBus } from './graph';
import type { EngineHost } from './host';
import { ElementPool } from './voices';

export type EngineStatus = 'locked' | 'running' | 'unsupported';

export interface MixerState {
  volumes: Record<BusName, number>;
  muted: Record<BusName, boolean>;
}

export interface AudioEngineOptions {
  createContext?: () => BaseAudioContext | null;
  createElement?: () => HTMLAudioElement;
  clock?: ServerClock;
  /** Branche les écouteurs de déverrouillage sur `document` (désactivé en test). */
  listenForUnlock?: boolean;
}

const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

export class AudioEngine implements EngineHost {
  readonly clock: ServerClock;
  private ctx: BaseAudioContext | null = null;
  private graph: AudioGraph | null = null;
  private elementPool: ElementPool | null = null;
  private buffers: BufferCache | null = null;
  private readonly listeners = new Set<() => void>();
  private mixer: MixerState = structuredClone(DEFAULT_MIXER);
  private readonly disabled = new Set<BusName>();
  private unsupported = false;
  private soundWanted = false;
  private unlockBound = false;
  private resyncTimer: ReturnType<typeof setInterval> | null = null;

  // Campagne attachée
  campaignId: string | null = null;
  readonly channels: Record<ChannelName, ChannelPlayer>;
  readonly cues: CuePlayer;
  private readonly states: Record<ChannelName, ChannelState | null> = {
    music: null,
    ambience: null,
  };
  /** Le client est-il MJ (fin des vidéos YouTube sans durée). */
  onYoutubeEnded: ((state: ChannelState) => void) | null = null;
  onError: ((message: string) => void) | null = null;

  constructor(private readonly options: AudioEngineOptions = {}) {
    this.clock = options.clock ?? new ServerClock(() => audioApi.clock());
    this.clock.subscribe(() => this.reconcile());
    this.channels = {
      music: new ChannelPlayer(this, 'music'),
      ambience: new ChannelPlayer(this, 'ambience'),
    };
    for (const player of Object.values(this.channels))
      player.onYoutubeEnded = (s) => this.onYoutubeEnded?.(s);
    this.cues = new CuePlayer(this);
  }

  // ── État observable ──

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  get status(): EngineStatus {
    if (this.unsupported) return 'unsupported';
    return this.ctx?.state === 'running' ? 'running' : 'locked';
  }

  /** Quelque chose devrait s'entendre mais le navigateur bloque le son. */
  get needsUnlock(): boolean {
    return this.status === 'locked' && this.soundWanted;
  }

  // ── Contexte, graphe ──

  context(): BaseAudioContext | null {
    if (this.ctx || this.unsupported) return this.ctx;
    try {
      const create =
        this.options.createContext ??
        (() => {
          const Ctor =
            typeof window === 'undefined'
              ? undefined
              : (window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext })
                  .webkitAudioContext);
          // Latence « interactive » (défaut) : les impacts des dés suivent l'animation
          return Ctor ? new Ctor() : null;
        });
      this.ctx = create();
    } catch {
      this.ctx = null;
    }
    if (!this.ctx) {
      this.unsupported = true;
      this.emit();
      return null;
    }
    this.graph = new AudioGraph(this.ctx);
    this.applyMixer();
    this.ctx.onstatechange = () => {
      this.emit();
      if (this.ctx?.state === 'running') this.reconcile();
    };
    this.bindUnlock();
    this.emit();
    return this.ctx;
  }

  running(): boolean {
    return this.status === 'running';
  }

  bus(name: AudioBus): AudioNode {
    this.context();
    if (!this.graph) throw new Error('Web Audio indisponible');
    return this.graph.bus(name);
  }

  pool(): ElementPool {
    this.elementPool ??= new ElementPool(this.context()!, this.options.createElement);
    return this.elementPool;
  }

  cache(): BufferCache {
    this.buffers ??= new BufferCache(this.context()!);
    return this.buffers;
  }

  wantSound() {
    if (this.soundWanted) return;
    this.soundWanted = true;
    this.emit();
  }

  reportError(message: string) {
    this.onError?.(message);
  }

  /** Débloque le son (geste de l'utilisateur) ; true si le contexte tourne. */
  async unlock(): Promise<boolean> {
    const ctx = this.context();
    if (!ctx) return false;
    if (ctx.state !== 'running') await (ctx as AudioContext).resume?.().catch(() => undefined);
    this.emit();
    if (ctx.state === 'running') this.reconcile();
    return ctx.state === 'running';
  }

  private bindUnlock() {
    if (this.unlockBound || this.options.listenForUnlock === false) return;
    if (typeof document === 'undefined') return;
    this.unlockBound = true;
    const handler = () => {
      if (this.ctx?.state === 'running') return;
      void this.unlock();
    };
    for (const e of UNLOCK_EVENTS) document.addEventListener(e, handler, { capture: true });
  }

  // ── Mixeur ──

  setMixer(mixer: MixerState) {
    this.mixer = mixer;
    this.applyMixer();
  }

  /** Préférence « son » des dés (service dice) : coupe le bus `dice` sans toucher au mixeur. */
  setBusEnabled(name: BusName, enabled: boolean) {
    if (enabled) this.disabled.delete(name);
    else this.disabled.add(name);
    this.applyMixer();
  }

  private gainOf(bus: BusName): number {
    if (this.disabled.has(bus)) return 0;
    if (bus === 'master') return this.mixer.muted.master ? 0 : this.mixer.volumes.master;
    return this.mixer.muted[bus] ? 0 : this.mixer.volumes[bus];
  }

  private applyMixer() {
    if (this.graph)
      for (const bus of Object.keys(this.mixer.volumes) as BusName[])
        this.graph.setBusGain(bus, this.gainOf(bus));
    for (const p of Object.values(this.channels)) p.mixerChanged();
  }

  externalGain(bus: BusName): number {
    if (this.disabled.has(bus) || this.disabled.has('master')) return 0;
    return busGain(this.mixer, bus);
  }

  // ── Campagne ──

  /** Une campagne à la fois : attacher une autre libère toutes les voix. */
  attachCampaign(campaignId: string) {
    if (this.campaignId === campaignId) return;
    this.detachCampaign();
    this.campaignId = campaignId;
    void this.clock.resync();
    if (!this.resyncTimer && typeof window !== 'undefined') {
      this.resyncTimer = setInterval(() => void this.clock.resync(), RESYNC_EVERY_MS);
      document.addEventListener('visibilitychange', this.onVisible);
    }
    this.emit();
  }

  private readonly onVisible = () => {
    if (document.visibilityState === 'visible') void this.clock.resync();
  };

  detachCampaign() {
    for (const p of Object.values(this.channels)) p.dispose();
    this.cues.dispose();
    this.states.music = null;
    this.states.ambience = null;
    this.campaignId = null;
    this.soundWanted = false;
    if (this.resyncTimer) {
      clearInterval(this.resyncTimer);
      this.resyncTimer = null;
      document.removeEventListener('visibilitychange', this.onVisible);
    }
    this.emit();
  }

  channelState(name: ChannelName): ChannelState | null {
    return this.states[name];
  }

  /** État reçu (REST, événement, réponse d'une commande) : gardé si plus récent. */
  applyChannel(state: ChannelState) {
    if (state.campaignId !== this.campaignId) return;
    const current = this.states[state.channel];
    const next = reduceChannel(current, state);
    if (next === current) return;
    this.states[state.channel] = next;
    if (next?.status === 'playing') {
      this.wantSound();
      this.context();
    }
    this.channels[state.channel].setState(next);
    this.emit();
  }

  /** Remplace l'état connu sans filtre de version (relecture après `resync`). */
  resetChannels(states: Record<ChannelName, ChannelState>) {
    for (const name of ['music', 'ambience'] as const) {
      const incoming = states[name];
      const current = this.states[name];
      if (current && incoming.version < current.version) continue;
      this.states[name] = incoming;
      if (incoming.status === 'playing') {
        this.wantSound();
        this.context();
      }
      this.channels[name].setState(incoming);
    }
    this.emit();
  }

  private reconcile() {
    for (const p of Object.values(this.channels)) p.reconcile();
  }
}

let engine: AudioEngine | null = null;

/** Le moteur de l'onglet (créé au premier usage, jamais côté serveur). */
export function getAudioEngine(): AudioEngine {
  engine ??= new AudioEngine();
  return engine;
}
