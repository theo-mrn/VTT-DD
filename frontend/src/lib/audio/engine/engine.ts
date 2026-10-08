// i18n-ignore-file : diagnostics du moteur (copiés pour le support), volontairement en français
/**
 * Moteur audio unique du front (docs/audio.md § 3.8, 4.5) : un seul
 * AudioContext, créé à la première demande, singleton hors React. Il porte
 * l'horloge du serveur, le mixeur, les canaux et les effets de la campagne
 * attachée (une à la fois).
 *
 * Autoplay : un seul déverrouillage, au premier `pointerdown`, `keydown` ou
 * `touchend` (capture) ; l'état `interrupted` d'iOS vaut `locked`. Au
 * déverrouillage, chaque canal repart à la position de la ligne de temps.
 *
 * Veille : sans voix ni effet depuis `IDLE_SUSPEND_MS`, le contexte est suspendu (le thread
 * audio s'arrête) ; toute demande de contexte le réveille. Le relevé ne tourne que s'il y a
 * quelque chose à surveiller (campagne, voix, contexte éveillé) et jamais onglet caché.
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
import {
  adoptContext,
  anyStalled,
  disposeAllVoices,
  kickAll,
  onVoiceRegistered,
  refreshAllOutputs,
  reportVoices,
  scanAudio,
  sweepYoutubeHost,
  voiceCount,
  type LiveSound,
} from './registry';
import { needsDirectMedia } from './compat';
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
  /** Relevé périodique de ce qui sonne (désactivé en test). */
  scan?: boolean;
  /** Fichiers hors graphe (Safari) ; absent : détection du navigateur. */
  directMedia?: boolean;
}

/** Fréquence du relevé réel de ce qui sonne (orphelines coupées, panneau à jour). */
export const SCAN_EVERY_MS = 500;

/** Silence (aucune voix, aucun effet, aucune demande) au bout duquel le contexte se met en veille. */
export const IDLE_SUSPEND_MS = 10_000;

/**
 * Gestes qui autorisent le son : le premier, n'importe où dans la page, débloque le contexte
 * et relance les lecteurs YouTube bloqués (le bandeau « Activer le son » n'est qu'une aide).
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'] as const;

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
  /** Prises en cours (voix de la table) : pas de veille tant qu'il en reste une. */
  private holds = 0;
  private resyncTimer: ReturnType<typeof setInterval> | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private liveSounds: LiveSound[] = [];
  /** Une voix voulue est bloquée par le navigateur (YouTube sans geste) : bandeau d'activation. */
  private blocked = false;
  /** Dernière activité (demande de contexte, voix ou effet vus au relevé). */
  private lastActiveAt = Date.now();
  /** Contexte suspendu par la veille (pas par le navigateur) : il compte comme déverrouillé. */
  private idleSuspended = false;
  /** Réveil en cours (`resume()` pas encore résolu). */
  private waking = false;

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
    this.directMedia = options.directMedia ?? needsDirectMedia();
    this.clock = options.clock ?? new ServerClock(() => audioApi.clock());
    this.clock.subscribe(() => this.reconcile());
    this.channels = {
      music: new ChannelPlayer(this, 'music'),
      ambience: new ChannelPlayer(this, 'ambience'),
    };
    for (const player of Object.values(this.channels))
      player.onYoutubeEnded = (s) => this.onYoutubeEnded?.(s);
    this.cues = new CuePlayer(this);
    // Relevé à la demande : une voix qui naît le relance, l'onglet caché l'arrête
    onVoiceRegistered(() => this.ensureScan());
    if (typeof document !== 'undefined' && options.scan !== false)
      document.addEventListener('visibilitychange', this.onVisibility);
  }

  // ── Ce qui sonne vraiment ──

  /** Sons qui s'entendent en ce moment dans l'onglet (relevé réel, pas l'état supposé). */
  get live(): LiveSound[] {
    return this.liveSounds;
  }

  private contextState(): string {
    if (this.ctx) return this.ctx.state;
    return this.unsupported ? 'Web Audio indisponible' : 'pas encore créé';
  }

  /** Photographie lisible du moteur (panneau de diagnostic). */
  diagnostics() {
    const ch = (name: ChannelName) => {
      const s = this.states[name];
      if (!s) return 'aucun état reçu';
      const morceau = s.track ? `${s.track.name} (${s.track.source})` : 'aucun morceau';
      return `v${s.version} · ${s.status} · ${morceau} · volume table ${Math.round(s.volume * 100)} %`;
    };
    return {
      campagne: this.campaignId ?? 'aucune (moteur détaché)',
      lecture: this.directMedia ? 'directe (compatibilité Safari)' : 'graphe Web Audio',
      contexte: this.contextState(),
      debloquage: this.needsUnlock ? 'requis' : 'non',
      youtubeBloque: this.blocked,
      mixeur: Object.entries(this.mixer.volumes)
        .map(
          ([b, v]) =>
            `${b} ${Math.round(v * 100)}${this.mixer.muted[b as BusName] ? ' (coupé)' : ''}`,
        )
        .join(', '),
      musique: ch('music'),
      ambiance: ch('ambience'),
      effetsActifs: this.cues.list.length,
      voix: reportVoices(),
    };
  }

  /** Relevé : coupe les voix orphelines et publie ce qui sonne, s'il a changé. */
  scan() {
    sweepYoutubeHost();
    const blocked = anyStalled();
    if (blocked !== this.blocked) {
      this.blocked = blocked;
      this.emit();
    }
    const next = scanAudio();
    const same =
      next.length === this.liveSounds.length &&
      next.every(
        (s, i) => s.id === this.liveSounds[i]!.id && s.label === this.liveSounds[i]!.label,
      );
    if (!same) {
      this.liveSounds = next;
      this.emit();
    }
    this.settle();
  }

  /** Relevé périodique, s'il n'est pas déjà lancé (jamais onglet caché ni côté serveur). */
  private ensureScan() {
    if (this.scanTimer || this.options.scan === false || typeof window === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.scanTimer = setInterval(() => this.scan(), SCAN_EVERY_MS);
  }

  private stopScan() {
    if (!this.scanTimer) return;
    clearInterval(this.scanTimer);
    this.scanTimer = null;
  }

  /**
   * Après un relevé : tant qu'une voix ou un effet existe, rien ne change. Sinon le contexte
   * éveillé passe en veille au bout d'`IDLE_SUSPEND_MS`, puis le relevé s'arrête (une voix
   * inscrite ou une demande de contexte le relance).
   */
  private settle() {
    const now = Date.now();
    if (this.holds > 0 || voiceCount() > 0 || this.cues.list.length > 0) {
      this.lastActiveAt = now;
      return;
    }
    if (this.waking) return;
    if (this.ctx?.state === 'running' && !this.idleSuspended) {
      if (now - this.lastActiveAt >= IDLE_SUSPEND_MS) this.suspendIdle();
      return;
    }
    if (this.liveSounds.length) {
      this.liveSounds = [];
      this.emit();
    }
    this.stopScan();
  }

  /** Veille : le thread audio s'arrête ; le moteur reste « déverrouillé » pour les lecteurs. */
  private suspendIdle() {
    const ctx = this.ctx as AudioContext | null;
    if (!ctx?.suspend || ctx.state !== 'running' || this.idleSuspended) return;
    this.idleSuspended = true;
    ctx.suspend().catch(() => {
      this.idleSuspended = false;
    });
  }

  /**
   * Sortie de veille. `idleSuspended` reste vrai jusqu'à la reprise effective : les lecteurs
   * planifient leurs voix tout de suite (heure du contexte figée, elles partent à la reprise,
   * aucun premier son perdu). Reprise refusée : le moteur redevient verrouillé (bandeau).
   */
  private wake() {
    if (!this.idleSuspended || this.waking) return;
    const ctx = this.ctx as AudioContext | null;
    if (!ctx?.resume) {
      this.idleSuspended = false;
      return;
    }
    this.waking = true;
    ctx
      .resume()
      .catch(() => undefined)
      .finally(() => {
        this.waking = false;
        this.idleSuspended = false;
        this.lastActiveAt = Date.now();
        this.emit();
      });
  }

  /** Une demande de contexte : activité, relevé relancé, sortie de veille. */
  private touch() {
    this.lastActiveAt = Date.now();
    this.ensureScan();
    this.wake();
  }

  private readonly onVisibility = () => {
    if (!document.hidden) {
      // Retour sur l'onglet : relevé seulement s'il a quelque chose à surveiller
      if (this.campaignId || voiceCount() > 0 || this.ctx?.state === 'running') this.ensureScan();
      return;
    }
    this.stopScan();
    // Onglet caché sans voix ni effet : personne n'écoute, veille tout de suite
    if (this.holds === 0 && voiceCount() === 0 && this.cues.list.length === 0 && !this.waking)
      this.suspendIdle();
  };

  /**
   * Garde le contexte éveillé (voix de la table : un flux continu que le relevé ne voit pas) ;
   * la fonction rendue relâche la prise.
   */
  hold(): () => void {
    this.holds++;
    this.touch();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
      this.lastActiveAt = Date.now();
    };
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
    // En veille, le contexte repart à la première demande : pas de bandeau « activer le son »
    if (this.idleSuspended) return 'running';
    return this.ctx?.state === 'running' ? 'running' : 'locked';
  }

  /** Quelque chose devrait s'entendre mais le navigateur bloque le son. */
  get needsUnlock(): boolean {
    return (this.status === 'locked' && this.soundWanted) || this.blocked;
  }

  // ── Contexte, graphe ──

  context(): BaseAudioContext | null {
    if (this.ctx) {
      this.touch();
      return this.ctx;
    }
    if (this.unsupported) return null;
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
      // Une seule sortie son : les contextes d'un ancien moteur sont fermés
      if (this.ctx) adoptContext(this.ctx);
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
      // Repris par un autre (dés, diagnostic) : la veille est finie, le relevé la surveillera
      if (this.ctx?.state === 'running' && !this.waking) {
        this.idleSuspended = false;
        this.ensureScan();
      }
      this.emit();
      if (this.ctx?.state === 'running') this.reconcile();
    };
    this.bindUnlock();
    this.touch();
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
    // Toujours par context() : une voix qui va naître réveille le contexte en veille
    this.context();
    this.elementPool ??= new ElementPool(
      this.context()!,
      this.options.createElement,
      undefined,
      this.directMedia
        ? {
            // Hors graphe : le volume du bus visé (preview : le général seul)
            gainFor: (node) => {
              const name = this.graph?.nameOf(node) ?? 'master';
              return this.externalGain(name === 'preview' || name === 'voice' ? 'master' : name);
            },
          }
        : null,
    );
    return this.elementPool;
  }

  /** Fichiers lus hors graphe (Safari) : voir compat.ts. */
  readonly directMedia: boolean;

  cache(): BufferCache {
    this.context();
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
    kickAll();
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
      // Pendant le geste : les lecteurs YouTube bloqués repartent (ils l'exigent)
      kickAll();
      // En veille, un clic ne réveille pas le contexte : seule une demande de son le fait
      if (this.ctx?.state === 'running' || this.idleSuspended) return;
      // Contexte créé ici au besoin : le geste courant l'autorise à démarrer
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
    // Voix hors graphe (Safari) : leur volume suit le mixeur
    refreshAllOutputs();
  }

  externalGain(bus: BusName): number {
    if (this.disabled.has(bus) || this.disabled.has('master')) return 0;
    return busGain(this.mixer, bus);
  }

  // ── Campagne ──

  /** Une campagne à la fois : attacher une autre libère toutes les voix. */
  attachCampaign(campaignId: string) {
    // Le prochain geste de l'utilisateur débloquera le son, avant même le premier morceau
    this.bindUnlock();
    if (this.campaignId === campaignId) return;
    this.detachCampaign();
    this.campaignId = campaignId;
    this.ensureScan();
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
    // Plus rien d'inscrit et contexte au repos : le relevé s'arrête ici, sinon au prochain tour
    this.settle();
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

const holder = globalThis as unknown as { __vttAudioEngine?: unknown };

/**
 * Moteur trop ancien pour ce code : le nouveau reprend sa campagne et son état, puis l'ancien
 * est coupé (jamais deux moteurs qui jouent, jamais un moteur détaché de la campagne).
 */
function takeOver(next: AudioEngine, current: Partial<AudioEngine>) {
  const campaignId = current.campaignId ?? null;
  const states = {
    music: current.channelState?.('music') ?? null,
    ambience: current.channelState?.('ambience') ?? null,
  };
  next.onYoutubeEnded = current.onYoutubeEnded ?? null;
  next.onError = current.onError ?? null;
  try {
    current.detachCampaign?.();
  } catch {
    // Ancien moteur déjà hors d'usage
  }
  disposeAllVoices();
  if (!campaignId) return;
  next.attachCampaign(campaignId);
  for (const s of [states.music, states.ambience]) if (s) next.applyChannel(s);
}

/**
 * Le moteur de l'onglet (créé au premier usage, jamais côté serveur). Unique même après un
 * rechargement à chaud du code : il vit sur `globalThis`. Si le rechargement a remplacé sa
 * classe, l'ancien moteur est détaché et toutes ses voix coupées avant d'en créer un neuf :
 * jamais deux moteurs qui jouent en même temps.
 */
export function getAudioEngine(): AudioEngine {
  const current = holder.__vttAudioEngine as Partial<AudioEngine> | undefined;
  // Le même moteur, même après un rechargement du code : il garde sa campagne et son état
  if (current instanceof AudioEngine || (current && typeof current.scan === 'function'))
    return current as AudioEngine;
  const next = new AudioEngine();
  if (current) takeOver(next, current);
  holder.__vttAudioEngine = next;
  return next;
}
