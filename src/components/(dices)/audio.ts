// ============================================================================
// DICE AUDIO — one simple, discreet impact sound for every die.
// ============================================================================
// Kept intentionally minimal: a soft wood/metal-ish tap on each bounce.
// Frequencies stay in the audible-on-laptop band (~150 Hz – 3 kHz) and levels
// are low so rapid bounces during a roll never become harsh.

let sharedAudioContext: AudioContext | null = null;

export const getAudioContext = (): AudioContext | null => {
    try {
        if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
            sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return sharedAudioContext;
    } catch {
        return null;
    }
};

const noiseBuffer = (ctx: AudioContext, seconds: number) => {
    const size = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
};

// The ORIGINAL heavy dice sound: a low frequency "thud" (the weight of the
// die) plus a short soft noise clack (the scrape on the mat). Deep and
// discreet — this is the sound the project shipped with before any theming.
export const playRoll = (velocity: number) => {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => { });

        const t0 = ctx.currentTime;

        // 1. Low "thud": sine dropping from ~120Hz to 40Hz (percussion envelope).
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        const baseFreq = 120 + Math.random() * 40;
        osc.frequency.setValueAtTime(baseFreq, t0);
        osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.08);
        oscGain.gain.setValueAtTime(Math.min(0.4, velocity / 5), t0);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
        osc.connect(oscGain); oscGain.connect(ctx.destination);

        // 2. Short low-passed noise burst: the soft mat clack/scrape.
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer(ctx, 0.05);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 800 + velocity * 100;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(Math.min(0.4, velocity / 10), t0);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.03);
        noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(ctx.destination);

        osc.start(t0); osc.stop(t0 + 0.1);
        noise.start(t0);
    } catch { /* audio must never break the roll */ }
};

// ============================================================================
// THEMED ROLL AMBIENCE — a continuous sound bed for certain die themes, played
// for the whole life of the die (independent of bounces / speed). One theme
// implemented so far: 'soul' (cold wind + ghostly murmur). Returns a handle to
// fade out & clean up when the die disappears.
// ============================================================================

export type AmbienceId = 'soul' | 'storm' | 'acid' | 'fire' | 'cosmos' | 'cyber' | 'ocean';

export interface Ambience { stop: () => void; }

// URL of the looping audio file for each themed ambience.
const AMBIENCE_URL: Record<AmbienceId, string> = {
    soul: '/sons/ames.mp3',
    storm: '/sons/thunder.mp3',
    acid: '/sons/acid.mp3',
    fire: '/sons/fire.mp3',
    cosmos: '/sons/cosmos.mp3',
    cyber: '/sons/cyber.mp3',
    ocean: '/sons/ocean.mp3',
};

// Volume per ambience (files vary in loudness; keep discreet).
const AMBIENCE_VOLUME: Record<AmbienceId, number> = {
    soul: 0.55,
    storm: 0.6,
    acid: 0.6,
    fire: 0.6,
    cosmos: 0.6,
    cyber: 0.05,
    ocean: 0.5,
};

// Seconds to wait after the die is thrown before the ambience starts (the die
// is still in the air at t=0; the sound should kick in once it's rolling).
const AMBIENCE_DELAY: Record<AmbienceId, number> = {
    soul: 0.5,
    storm: 0.5,
    acid: 0.5,
    fire: 0.5,
    cosmos: 0,      // starts instantly (no pre-roll delay)
    cyber: 0.5,
    ocean: 0.5,
};

// Decoded audio buffers, fetched once and reused.
const bufferCache = new Map<string, AudioBuffer>();
const loadBuffer = async (ctx: AudioContext, url: string): Promise<AudioBuffer | null> => {
    if (bufferCache.has(url)) return bufferCache.get(url)!;
    try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        const buf = await ctx.decodeAudioData(arr);
        bufferCache.set(url, buf);
        return buf;
    } catch {
        return null;
    }
};

// Play a themed ambience by LOOPING its audio file for the whole life of the
// die. Returns a handle that fades out and cleans up on stop().
export const startAmbience = (id: AmbienceId): Ambience | null => {
    try {
        const ctx = getAudioContext();
        if (!ctx) return null;
        if (ctx.state === 'suspended') ctx.resume().catch(() => { });

        const url = AMBIENCE_URL[id];
        const vol = AMBIENCE_VOLUME[id] ?? 0.5;
        const delayMs = (AMBIENCE_DELAY[id] ?? 0) * 1000;

        const master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);

        let src: AudioBufferSourceNode | null = null;
        let alive = true;
        let startTimer: any = null;

        // Decode first (cached), then wait the theme's start delay (die still in
        // the air at t=0), then loop it in — unless we were already stopped.
        loadBuffer(ctx, url).then((buf) => {
            if (!alive || !buf) return;
            startTimer = setTimeout(() => {
                if (!alive) return;
                src = ctx.createBufferSource();
                src.buffer = buf;
                src.loop = true;
                src.connect(master);
                src.start();
                master.gain.setTargetAtTime(vol, ctx.currentTime, 0.35); // fade in
            }, delayMs);
        });

        return {
            stop: () => {
                if (!alive) return;
                alive = false;
                if (startTimer) clearTimeout(startTimer);            // die vanished before start
                master.gain.setTargetAtTime(0, ctx.currentTime, 0.3); // fade out
                setTimeout(() => {
                    try { src?.stop(); } catch { }
                    try { master.disconnect(); } catch { }
                }, 600);
            },
        };
    } catch {
        return null;
    }
};

// Which die skins get a themed ambience (data-driven, extend as we add themes).
export const ambienceForSkin = (skin: { id?: string; procStyle?: string; effectType?: string }): AmbienceId | null => {
    if (skin.procStyle === 'storm') return 'storm';
    if (skin.procStyle === 'poison') return 'acid';
    if (skin.procStyle === 'magma' || skin.procStyle === 'eclipse') return 'fire';
    if (skin.effectType === 'cyber') return 'cyber';
    // Cosmos family: the Singularity (astral) + all celestial dice.
    if (skin.procStyle === 'astral' || skin.effectType === 'celestial') return 'cosmos';
    // Soul (cold wind + murmur): Âme Errante + Marcheur du Vide.
    if (skin.procStyle === 'spectre' || skin.id === 'void_walker') return 'soul';
    if (skin.procStyle === 'ocean') return 'ocean';
    return null;
};
