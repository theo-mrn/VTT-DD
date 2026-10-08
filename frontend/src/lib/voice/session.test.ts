import type { PullVoice, VoiceParticipant, VoiceRoom } from '@vtt/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VoiceSession,
  rms,
  voicesToDrop,
  voicesToPull,
  type VoiceEnv,
  type VoiceSignaling,
} from './session';

const P = (userId: string, speaker = true, muted = false): VoiceParticipant => ({
  userId,
  speaker,
  muted,
  joinedAt: '2026-10-08T10:00:00.000Z',
  privateWith: null,
  privateLive: false,
});

describe('voix : calculs', () => {
  it('tire les voix des autres participants qui parlent, pas encore reçues', () => {
    const ps = [P('moi'), P('a'), P('b', false), P('c')];
    expect(voicesToPull(ps, new Set(['c']), 'moi')).toEqual(['a']);
  });

  it('libère les voix des participants partis', () => {
    expect(voicesToDrop([P('a')], new Set(['a', 'b']))).toEqual(['b']);
  });

  it('mesure le niveau RMS', () => {
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(rms(new Float32Array())).toBe(0);
  });
});

// ─── Faux navigateur ───────────────────────────────────────────────────────────

class FakeTrack {
  enabled = true;
  stopped = false;
  clones: FakeTrack[] = [];
  stop() {
    this.stopped = true;
  }
  clone() {
    const c = new FakeTrack();
    this.clones.push(c);
    return c;
  }
}

class FakeTransceiver {
  mid: string | null = null;
  readonly sender = { replaceTrack: vi.fn(async () => undefined) };
  constructor(readonly receiver: { track: unknown }) {}
}

class FakePeer {
  transceivers: FakeTransceiver[] = [];
  localDescription: { type: string; sdp: string } | null = null;
  remote: { type: string; sdp: string }[] = [];
  closed = false;
  connectionState = 'new';
  addEventListener() {}
  addTransceiver() {
    const t = new FakeTransceiver({ track: null });
    this.transceivers.push(t);
    return t;
  }
  createDataChannel() {}
  async createOffer() {
    return { type: 'offer', sdp: 'offre' };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'réponse' };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = d;
    this.transceivers.forEach((t, i) => (t.mid ??= String(i)));
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remote.push(d);
    // Une offre de tirage ajoute les voix reçues
    if (d.type === 'offer')
      for (const mid of d.sdp.split(',')) {
        const t = new FakeTransceiver({ track: { id: `voix-${mid}` } });
        t.mid = mid;
        this.transceivers.push(t);
      }
  }
  getTransceivers() {
    return this.transceivers;
  }
  close() {
    this.closed = true;
  }
}

const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
const node = () => ({ connect: vi.fn((n: unknown) => n), disconnect: vi.fn() });

function fakeAudio() {
  const bus = { ...node(), gain: param() };
  const made: {
    gain: ReturnType<typeof param>;
    pan: ReturnType<typeof param>;
    freq: ReturnType<typeof param>;
  }[] = [];
  const context = {
    currentTime: 0,
    createMediaStreamSource: vi.fn(() => node()),
    createGain: vi.fn(() => {
      const g = { ...node(), gain: param() };
      made.push({ gain: g.gain, pan: param(), freq: param() });
      return g;
    }),
    createBiquadFilter: vi.fn(() => {
      const f = { ...node(), type: '', frequency: param() };
      made.at(-1)!.freq = f.frequency;
      return f;
    }),
    createStereoPanner: vi.fn(() => {
      const p = { ...node(), pan: param() };
      made.at(-1)!.pan = p.pan;
      return p;
    }),
    createAnalyser: vi.fn(() => ({ ...node(), fftSize: 0, getFloatTimeDomainData: vi.fn() })),
  };
  return { bus, context, release: vi.fn(), made };
}

function setup(room: (me: string) => VoiceRoom) {
  const peer = new FakePeer();
  const mic = new FakeTrack();
  let pulls = 0;
  const audio = fakeAudio();
  const signaling: VoiceSignaling = {
    ice: vi.fn(async () => ({ iceServers: [] })),
    join: vi.fn(async () => ({
      answer: { type: 'answer' as const, sdp: 'cf' },
      room: room('moi'),
    })),
    pull: vi.fn(async (_c: string, { userIds = [], privateUserIds = [] }: PullVoice) => {
      const all = [
        ...userIds.map((userId) => ({ userId, private: false })),
        ...privateUserIds.map((userId) => ({ userId, private: true })),
      ].map((t, i) => ({ ...t, mid: `p${++pulls}-${i}` }));
      return {
        offer: { type: 'offer' as const, sdp: all.map((t) => t.mid).join(',') },
        tracks: all,
      };
    }),
    openPrivate: vi.fn(async () => room('moi')),
    pushPrivate: vi.fn(async () => ({ answer: { type: 'answer' as const, sdp: 'cf-privé' } })),
    closePrivate: vi.fn(async () => room('moi')),
    renegotiate: vi.fn(async () => undefined),
    heartbeat: vi.fn(async () => room('moi')),
    leave: vi.fn(async () => undefined),
  };
  const env: VoiceEnv = {
    signaling,
    audio: async () => audio as never,
    getUserMedia: async () => ({ getAudioTracks: () => [mic], getTracks: () => [mic] }) as never,
    createPeer: () => peer as never,
    createAudioElement: () => ({ play: async () => undefined }) as never,
  };
  return { session: new VoiceSession(env), peer, mic, audio, signaling };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('voix : session', () => {
  beforeEach(() => {
    vi.stubGlobal('MediaStream', class {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejoint, envoie le micro et tire les voix des autres', async () => {
    const { session, signaling, peer } = setup(() => ({
      participants: [P('moi'), P('a'), P('spectateur', false)],
    }));
    await session.join('c1', 'moi');
    await settle();
    await settle();

    expect(session.state.status).toBe('connected');
    expect(signaling.join).toHaveBeenCalledWith('c1', {
      offer: { type: 'offer', sdp: 'offre' },
      micMid: '0',
      muted: false,
    });
    expect(signaling.pull).toHaveBeenCalledWith('c1', { userIds: ['a'], privateUserIds: [] });
    expect(signaling.renegotiate).toHaveBeenCalledWith('c1', {
      answer: { type: 'answer', sdp: 'réponse' },
    });
    expect(peer.remote.map((d) => d.type)).toEqual(['answer', 'offer']);
    await session.leave();
  });

  it('coupe le micro et le son', async () => {
    const { session, mic, audio, signaling } = setup(() => ({ participants: [P('moi')] }));
    await session.join('c1', 'moi');
    session.setMuted(true);
    expect(mic.enabled).toBe(false);
    expect(signaling.heartbeat).toHaveBeenCalledWith('c1', { muted: true });
    session.setMuted(false);
    session.setDeafened(true);
    expect(mic.enabled).toBe(false);
    expect(audio.bus.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, expect.any(Number));
    session.setDeafened(false);
    expect(mic.enabled).toBe(true);
    await session.leave();
  });

  it('suit les arrivées et les départs annoncés', async () => {
    const { session, signaling } = setup(() => ({ participants: [P('moi')] }));
    await session.join('c1', 'moi');
    session.onEvent('voice.joined', { userId: 'b', participant: P('b') });
    await settle();
    await settle();
    expect(signaling.pull).toHaveBeenCalledWith('c1', { userIds: ['b'], privateUserIds: [] });
    expect(session.state.participants.map((p) => p.userId)).toEqual(['moi', 'b']);
    session.onEvent('voice.left', { userId: 'b' });
    expect(session.state.participants.map((p) => p.userId)).toEqual(['moi']);
    await session.leave();
  });

  it('quitte : annonce, arrête le micro, ferme la connexion, relâche le son', async () => {
    const { session, signaling, mic, peer, audio } = setup(() => ({ participants: [P('moi')] }));
    await session.join('c1', 'moi');
    await session.leave();
    expect(signaling.leave).toHaveBeenCalledWith('c1');
    expect(mic.stopped).toBe(true);
    expect(peer.closed).toBe(true);
    expect(audio.release).toHaveBeenCalled();
    expect(session.state.status).toBe('idle');
  });

  it('sans micro : écoute seulement', async () => {
    const { session, signaling } = setup(() => ({ participants: [P('moi', false)] }));
    const env = (session as unknown as { env: VoiceEnv }).env;
    env.getUserMedia = async () => {
      throw new Error('NotAllowedError');
    };
    await session.join('c1', 'moi');
    expect(signaling.join).toHaveBeenCalledWith('c1', {
      offer: { type: 'offer', sdp: 'offre' },
      muted: false,
    });
    expect(session.state.listenOnly).toBe(true);
    await session.leave();
  });

  it('erreur du service : état « error », rien ne reste ouvert', async () => {
    const { session, signaling, peer } = setup(() => ({ participants: [] }));
    vi.mocked(signaling.join).mockRejectedValueOnce(new Error('voice_unconfigured'));
    await session.join('c1', 'moi');
    expect(session.state.status).toBe('error');
    expect(peer.closed).toBe(true);
  });

  it('après un échec, un nouveau clic réessaie', async () => {
    const { session, signaling } = setup(() => ({ participants: [P('moi')] }));
    vi.mocked(signaling.join).mockRejectedValueOnce(new Error('panne'));
    await session.join('c1', 'moi');
    expect(session.state.status).toBe('error');
    await session.join('c1', 'moi');
    expect(session.state.status).toBe('connected');
    expect(signaling.join).toHaveBeenCalledTimes(2);
    await session.leave();
  });

  it('mixage de proximité : volume, position et étouffement de chaque voix reçue', async () => {
    const { session, audio } = setup(() => ({ participants: [P('moi'), P('a')] }));
    await session.join('c1', 'moi');
    await settle();
    await settle();
    const voice = audio.made[0]!;
    // Mode Table à l'arrivée
    expect(voice.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, expect.any(Number));
    session.setMixes(new Map([['a', { gain: 0.25, pan: -0.5, cutoffHz: 1_200 }]]));
    expect(voice.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.25, 0, expect.any(Number));
    expect(voice.pan.setTargetAtTime).toHaveBeenLastCalledWith(-0.5, 0, expect.any(Number));
    expect(voice.freq.setTargetAtTime).toHaveBeenLastCalledWith(1_200, 0, expect.any(Number));
    // Plus d'entrée : retour au mode Table
    session.setMixes(new Map());
    expect(voice.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, expect.any(Number));
    await session.leave();
  });

  it('canal privé (MJ) : copie du micro envoyée, voix publique coupée, puis rétablie', async () => {
    let state = { participants: [P('moi'), P('a')] };
    const { session, signaling, mic } = setup(() => state);
    await session.join('c1', 'moi');
    await settle();
    // Le service ouvre le canal : je suis en privé avec « a »
    state = {
      participants: [
        { ...P('moi'), privateWith: 'a' },
        { ...P('a'), privateWith: 'moi' },
      ],
    };
    await session.openPrivate('a');
    for (let i = 0; i < 4; i++) await settle();
    expect(signaling.openPrivate).toHaveBeenCalledWith('c1', { userId: 'a' });
    expect(signaling.pushPrivate).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ mid: expect.any(String) }),
    );
    expect(mic.enabled).toBe(false);
    expect(mic.clones[0]!.enabled).toBe(true);
    // Fermeture : la copie s'arrête, la voix publique revient
    state = { participants: [P('moi'), P('a')] };
    await session.closePrivate();
    for (let i = 0; i < 4; i++) await settle();
    expect(mic.clones[0]!.stopped).toBe(true);
    expect(mic.enabled).toBe(true);
    await session.leave();
  });

  it('canal privé (joueur) : la voix privée du MJ est tirée et jamais mixée', async () => {
    const { session, signaling, audio } = setup(() => ({ participants: [P('moi'), P('mj')] }));
    await session.join('c1', 'moi');
    for (let i = 0; i < 4; i++) await settle();
    session.onEvent('voice.updated', {
      userId: 'moi',
      participant: { ...P('moi'), privateWith: 'mj' },
    });
    session.onEvent('voice.updated', {
      userId: 'mj',
      participant: { ...P('mj'), privateWith: 'moi', privateLive: true },
    });
    for (let i = 0; i < 6; i++) await settle();
    expect(signaling.pull).toHaveBeenLastCalledWith('c1', { userIds: [], privateUserIds: ['mj'] });
    // La proximité coupe la voix publique du MJ, pas sa voix privée
    session.setMixes(new Map([['mj', { gain: 0, pan: 1, cutoffHz: 500 }]]));
    const [publique, privee] = audio.made;
    expect(publique!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, expect.any(Number));
    expect(privee!.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, expect.any(Number));
    await session.leave();
  });
});
