/**
 * Session vocale du navigateur (docs/voix.md § 3.2, § 4) : une `RTCPeerConnection` vers le SFU
 * Cloudflare, signalée par le service voice. Un seul micro envoyé (MJ, joueur), une voix reçue
 * par participant, chacune jouée dans le bus « voix » du moteur audio (mode Table : comme un
 * appel). Qui parle se mesure ici, sur les flux reçus et sur le micro : rien ne passe par le
 * réseau.
 *
 * Hors React : un seul exemplaire pour l'onglet (`getVoice`), l'interface lit son état par
 * `useVoice`. Les voix reçues sont tirées une file à la fois (une renégociation à la fois).
 */
import {
  VOICE_HEARTBEAT_S,
  type JoinVoice,
  type JoinVoiceResult,
  type PullVoice,
  type PullVoiceResult,
  type RenegotiateVoice,
  type VoiceHeartbeat,
  type VoiceIceServers,
  type VoiceParticipant,
  type VoiceRoom,
} from '@vtt/contracts';
import { createStore } from 'zustand/vanilla';

export type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface VoiceState {
  campaignId: string | null;
  status: VoiceStatus;
  /** Dernière erreur de connexion (`ApiError` du service, erreur WebRTC) ; null : aucune. */
  error: unknown;
  participants: readonly VoiceParticipant[];
  /** Utilisateurs qui parlent en ce moment (moi compris). */
  speaking: ReadonlySet<string>;
  /** Mon micro coupé. */
  muted: boolean;
  /** Je n'entends plus personne (et mon micro est coupé). */
  deafened: boolean;
  /** Volume des voix (0 à 1). */
  volume: number;
  /** Pas de micro (refusé ou absent, ou spectateur) : j'écoute seulement. */
  listenOnly: boolean;
}

export const IDLE: VoiceState = {
  campaignId: null,
  status: 'idle',
  error: null,
  participants: [],
  speaking: new Set(),
  muted: false,
  deafened: false,
  volume: 1,
  listenOnly: false,
};

/** Signalisation : les routes du service voice (`lib/voice/api.ts`). */
export interface VoiceSignaling {
  ice(campaignId: string): Promise<VoiceIceServers>;
  join(campaignId: string, body: JoinVoice): Promise<JoinVoiceResult>;
  pull(campaignId: string, body: PullVoice): Promise<PullVoiceResult>;
  renegotiate(campaignId: string, body: RenegotiateVoice): Promise<void>;
  heartbeat(campaignId: string, body: VoiceHeartbeat): Promise<VoiceRoom>;
  leave(campaignId: string): Promise<void>;
}

/** Ce que la session demande au navigateur (remplacé dans les tests). */
export interface VoiceAudio {
  context: AudioContext;
  bus: AudioNode;
  /** Relâche le contexte (il peut se mettre en veille). */
  release(): void;
}

export interface VoiceEnv {
  signaling: VoiceSignaling;
  /** Contexte et bus « voix » du moteur audio (déverrouillé au clic, gardé éveillé). */
  audio(): Promise<VoiceAudio>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createPeer(config: RTCConfiguration): RTCPeerConnection;
  /** Élément `<audio>` muet : Chrome ne passe une piste WebRTC à Web Audio qu'ainsi. */
  createAudioElement(): HTMLAudioElement;
  /** Erreur hors du parcours (battement, tirage) : signalée sans casser la session. */
  report?(error: unknown): void;
}

/** Seuil de parole (RMS) et maintien après le dernier son, en millisecondes. */
export const SPEAKING_RMS = 0.02;
export const SPEAKING_HOLD_MS = 350;
const SPEAKING_EVERY_MS = 120;
const SMOOTH_S = 0.05;

/** Voix à tirer : les participants qui parlent, hors moi, pas encore reçus. */
export function voicesToPull(
  participants: readonly VoiceParticipant[],
  received: ReadonlySet<string>,
  me: string,
): string[] {
  return participants
    .filter((p) => p.speaker && p.userId !== me && !received.has(p.userId))
    .map((p) => p.userId);
}

/** Voix reçues de participants partis : à libérer. */
export function voicesToDrop(
  participants: readonly VoiceParticipant[],
  received: ReadonlySet<string>,
): string[] {
  const here = new Set(participants.map((p) => p.userId));
  return [...received].filter((u) => !here.has(u));
}

/** Niveau RMS d'un tampon de l'analyseur. */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

interface Remote {
  userId: string;
  stream: MediaStream;
  element: HTMLAudioElement;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
}

const codeOf = (e: unknown) => (e as { problem?: { code?: string } } | null)?.problem?.code;

export class VoiceSession {
  readonly store = createStore<VoiceState>(() => IDLE);

  private me = '';
  private pc: RTCPeerConnection | null = null;
  private mic: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private audio: VoiceAudio | null = null;
  private readonly remotes = new Map<string, Remote>();
  private queue: Promise<void> = Promise.resolve();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private speakingTimer: ReturnType<typeof setInterval> | null = null;
  private readonly lastHeard = new Map<string, number>();
  /** Génération de la session : une réponse d'une session close est ignorée. */
  private generation = 0;

  constructor(private readonly env: VoiceEnv) {}

  private set(patch: Partial<VoiceState>) {
    this.store.setState(patch);
  }

  get state(): VoiceState {
    return this.store.getState();
  }

  /** Rejoint la salle vocale de la campagne (au clic : déverrouille l'audio). */
  async join(campaignId: string, me: string): Promise<void> {
    if (this.state.campaignId === campaignId && this.state.status !== 'idle') return;
    await this.leave();
    const generation = ++this.generation;
    this.me = me;
    const { volume, muted, deafened } = this.state;
    this.set({ ...IDLE, campaignId, status: 'connecting', volume, muted, deafened });
    const { signaling } = this.env;
    try {
      this.audio = await this.env.audio();
      this.applyVolume();
      const ice = await signaling.ice(campaignId);
      const pc = this.env.createPeer({ iceServers: ice.iceServers, bundlePolicy: 'max-bundle' });
      this.pc = pc;
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'failed' && generation === this.generation)
          this.fail(new Error('Connexion vocale perdue'));
      });

      // Le micro (MJ, joueur) ; refusé ou absent : j'écoute seulement
      let micMid: string | undefined;
      try {
        this.mic = await this.env.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (e) {
        this.mic = null;
        this.report(e);
      }
      const track = this.mic?.getAudioTracks()[0];
      let sender: RTCRtpTransceiver | null = null;
      if (track) {
        track.enabled = !this.state.muted;
        sender = pc.addTransceiver(track, { direction: 'sendonly' });
        this.micAnalyser = this.analyse(this.mic!);
      } else {
        // Sans piste, une voie de données donne de quoi négocier
        pc.createDataChannel('voix');
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      micMid = sender?.mid ?? undefined;
      const res = await signaling.join(campaignId, {
        offer: { type: 'offer', sdp: pc.localDescription!.sdp },
        ...(micMid ? { micMid } : {}),
        muted: this.state.muted,
      });
      if (generation !== this.generation) return;
      await pc.setRemoteDescription(res.answer);
      const mine = res.room.participants.find((p) => p.userId === me);
      this.set({
        status: 'connected',
        participants: res.room.participants,
        listenOnly: !mine?.speaker,
      });
      this.startTimers(campaignId, generation);
      this.reconcile();
    } catch (e) {
      if (generation === this.generation) this.fail(e);
    }
  }

  /** Quitte la salle : annonce, coupe le micro, libère les voix et la connexion. */
  async leave(): Promise<void> {
    const campaignId = this.state.campaignId;
    const wasJoined = this.state.status === 'connected' || this.state.status === 'connecting';
    this.generation++;
    this.teardown();
    const { volume, muted, deafened } = this.state;
    this.set({ ...IDLE, volume, muted, deafened });
    if (campaignId && wasJoined) await this.env.signaling.leave(campaignId).catch(this.report);
  }

  setMuted(muted: boolean) {
    this.set({ muted });
    this.applyMic();
    const c = this.state.campaignId;
    if (c && this.state.status === 'connected')
      void this.env.signaling
        .heartbeat(c, { muted: muted || this.state.deafened })
        .then((room) => this.onRoom(room))
        .catch(this.report);
  }

  setDeafened(deafened: boolean) {
    this.set({ deafened });
    this.applyVolume();
    this.setMuted(this.state.muted);
  }

  setVolume(volume: number) {
    this.set({ volume: Math.min(1, Math.max(0, volume)) });
    this.applyVolume();
  }

  /** Annonce du bus (`voice.joined`, `voice.updated`, `voice.left`). */
  onEvent(type: string, payload: { userId?: unknown; participant?: VoiceParticipant }) {
    if (this.state.status !== 'connected' || typeof payload.userId !== 'string') return;
    const userId = payload.userId;
    if (userId === this.me) return;
    const others = this.state.participants.filter((p) => p.userId !== userId);
    if (type === 'voice.left') {
      this.set({ participants: others });
    } else if (payload.participant) {
      // Une nouvelle arrivée (nouvelle session) : sa voix d'avant ne vaut plus
      if (type === 'voice.joined') this.drop(userId);
      this.set({ participants: [...others, payload.participant] });
    }
    this.reconcile();
  }

  // ─── Interne ─────────────────────────────────────────────────────────────────

  private readonly report = (e: unknown) => this.env.report?.(e);

  private fail(e: unknown) {
    this.teardown();
    this.set({ status: 'error', error: e, participants: [], speaking: new Set() });
  }

  private onRoom(room: VoiceRoom) {
    this.set({ participants: room.participants });
    this.reconcile();
  }

  /** Tire les voix manquantes et libère celles des partis, une renégociation à la fois. */
  private reconcile() {
    const campaignId = this.state.campaignId;
    const generation = this.generation;
    if (!campaignId) return;
    this.queue = this.queue
      .then(async () => {
        if (generation !== this.generation || !this.pc) return;
        const received = new Set(this.remotes.keys());
        for (const u of voicesToDrop(this.state.participants, received)) this.drop(u);
        const wanted = voicesToPull(this.state.participants, received, this.me);
        if (!wanted.length) return;
        const res = await this.env.signaling.pull(campaignId, { userIds: wanted });
        if (generation !== this.generation || !this.pc) return;
        const pc = this.pc;
        if (res.offer) {
          await pc.setRemoteDescription(res.offer);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await this.env.signaling.renegotiate(campaignId, {
            answer: { type: 'answer', sdp: pc.localDescription!.sdp },
          });
        }
        for (const t of res.tracks) {
          const receiver = pc.getTransceivers().find((x) => x.mid === t.mid)?.receiver;
          if (receiver) this.attach(t.userId, receiver.track);
        }
      })
      .catch(this.report);
  }

  /** Joue une voix reçue dans le bus « voix » et mesure si elle parle. */
  private attach(userId: string, track: MediaStreamTrack) {
    if (!this.audio) return;
    this.drop(userId);
    const stream = new MediaStream([track]);
    const element = this.env.createAudioElement();
    element.muted = true;
    element.srcObject = stream;
    void element.play?.().catch(() => undefined);
    const { context, bus } = this.audio;
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    source.connect(gain).connect(bus);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    this.remotes.set(userId, { userId, stream, element, source, gain, analyser });
  }

  private drop(userId: string) {
    const r = this.remotes.get(userId);
    if (!r) return;
    r.source.disconnect();
    r.gain.disconnect();
    r.analyser.disconnect();
    r.element.srcObject = null;
    this.remotes.delete(userId);
    this.lastHeard.delete(userId);
  }

  private analyse(stream: MediaStream): AnalyserNode | null {
    if (!this.audio) return null;
    const analyser = this.audio.context.createAnalyser();
    analyser.fftSize = 512;
    this.audio.context.createMediaStreamSource(stream).connect(analyser);
    return analyser;
  }

  private startTimers(campaignId: string, generation: number) {
    this.heartbeatTimer = setInterval(() => {
      void this.env.signaling
        .heartbeat(campaignId, { muted: this.state.muted || this.state.deafened })
        .then((room) => generation === this.generation && this.onRoom(room))
        .catch((e) => {
          // Présence expirée (onglet en veille) : on revient dans la salle
          if (generation === this.generation && codeOf(e) === 'voice_not_joined')
            void this.leave().then(() => this.join(campaignId, this.me));
          else this.report(e);
        });
    }, VOICE_HEARTBEAT_S * 1000);
    const samples = new Float32Array(512);
    this.speakingTimer = setInterval(() => {
      const now = Date.now();
      const measure = (userId: string, a: AnalyserNode | null, silent: boolean) => {
        if (!a || silent) return;
        a.getFloatTimeDomainData(samples);
        if (rms(samples) > SPEAKING_RMS) this.lastHeard.set(userId, now);
      };
      measure(this.me, this.micAnalyser, this.state.muted || this.state.deafened);
      for (const r of this.remotes.values()) measure(r.userId, r.analyser, false);
      const speaking = new Set(
        [...this.lastHeard].filter(([, t]) => now - t < SPEAKING_HOLD_MS).map(([u]) => u),
      );
      const before = this.state.speaking;
      if (speaking.size !== before.size || [...speaking].some((u) => !before.has(u)))
        this.set({ speaking });
    }, SPEAKING_EVERY_MS);
  }

  private applyMic() {
    const track = this.mic?.getAudioTracks()[0];
    if (track) track.enabled = !(this.state.muted || this.state.deafened);
  }

  private applyVolume() {
    const bus = this.audio?.bus as GainNode | undefined;
    if (!bus?.gain || !this.audio) return;
    const v = this.state.deafened ? 0 : this.state.volume;
    bus.gain.setTargetAtTime(v, this.audio.context.currentTime, SMOOTH_S);
  }

  private teardown() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.speakingTimer) clearInterval(this.speakingTimer);
    this.heartbeatTimer = this.speakingTimer = null;
    for (const u of [...this.remotes.keys()]) this.drop(u);
    this.micAnalyser?.disconnect();
    this.micAnalyser = null;
    for (const t of this.mic?.getTracks() ?? []) t.stop();
    this.mic = null;
    this.pc?.close();
    this.pc = null;
    this.audio?.release();
    this.audio = null;
    this.lastHeard.clear();
  }
}
