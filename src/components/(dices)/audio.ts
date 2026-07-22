// ============================================================================
// DICE AUDIO — one simple, discreet impact sound for every die.
// ============================================================================
// Kept intentionally minimal: a soft wood/metal-ish tap on each bounce.
// Frequencies stay in the audible-on-laptop band (~150 Hz – 3 kHz) and levels
// are low so rapid bounces during a roll never become harsh.

let sharedAudioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;

// Dice sounds (impact + ambience) are routed through one master gain node so
// the "Dés 3D" (dice3d) slider in the mixer controls both — this module has
// no React tree of its own, so it reads the mixer's localStorage value
// directly instead of consuming the useAudioMixer() hook.
const readDice3dVolume = (): number => {
    try {
        const saved = localStorage.getItem('audioMixerVolumes');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (typeof parsed?.dice3d === 'number') return parsed.dice3d;
        }
    } catch { /* fall through to default */ }
    return 1;
};

// Themed mp3 EFFECTS toggle (from the global "Paramètres" panel, NOT the dice3d
// volume): when off, the per-skin ambiences (looping .mp3 beds) and one-shot
// skin sounds are silenced, but the roll/impact sound (playRoll) still plays.
// The SettingsContext owns the value; it mirrors it to a simple localStorage key
// (no user id needed here) and fires a dedicated event we listen to below.
export const DICE_THEMED_SOUNDS_KEY = 'vtt_dice_themed_sounds';
export const DICE_THEMED_SOUNDS_EVENT = 'vtt-dice-themed-sounds-change';

const readDiceThemedSoundsEnabled = (): boolean => {
    try {
        const saved = localStorage.getItem(DICE_THEMED_SOUNDS_KEY);
        if (saved !== null) return saved !== 'false';
    } catch { /* fall through to default */ }
    return true; // enabled by default
};

// Live mirror of the toggle, kept in sync via the event so the guards in
// startAmbience/playOneShotForSkin don't hit localStorage on every roll.
let diceThemedSoundsEnabled = typeof window !== 'undefined' ? readDiceThemedSoundsEnabled() : true;

if (typeof window !== 'undefined') {
    window.addEventListener('audioMixerVolumeChange', (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (masterGainNode && typeof detail?.dice3d === 'number') {
            masterGainNode.gain.value = detail.dice3d;
        }
    });

    // The global settings panel toggled the themed-sounds option.
    window.addEventListener(DICE_THEMED_SOUNDS_EVENT, (e: Event) => {
        const enabled = (e as CustomEvent).detail;
        if (typeof enabled === 'boolean') {
            diceThemedSoundsEnabled = enabled;
            // Turning effects OFF mid-roll: stop every ambience currently looping
            // so the themed bed goes quiet immediately (not just on the next die).
            if (!enabled) stopAllAmbiences();
        }
    });
}

export const getAudioContext = (): AudioContext | null => {
    try {
        if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
            sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            masterGainNode = sharedAudioContext.createGain();
            masterGainNode.gain.value = readDice3dVolume();
            masterGainNode.connect(sharedAudioContext.destination);
        }
        return sharedAudioContext;
    } catch {
        return null;
    }
};

// Destination every dice sound (impact + ambience) must connect to instead of
// ctx.destination directly, so the mixer's dice3d slider applies to it.
// getAudioContext() always creates masterGainNode alongside the context, so
// this is only ever called after it exists.
const getMasterGain = (ctx: AudioContext): AudioNode => masterGainNode ?? ctx.destination;

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
        const master = getMasterGain(ctx);

        // 1. Low "thud": sine dropping from ~120Hz to 40Hz (percussion envelope).
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sine';
        const baseFreq = 120 + Math.random() * 40;
        osc.frequency.setValueAtTime(baseFreq, t0);
        osc.frequency.exponentialRampToValueAtTime(40, t0 + 0.08);
        oscGain.gain.setValueAtTime(Math.min(0.4, velocity / 5), t0);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08);
        osc.connect(oscGain); oscGain.connect(master);

        // 2. Short low-passed noise burst: the soft mat clack/scrape.
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer(ctx, 0.05);
        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 800 + velocity * 100;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(Math.min(0.4, velocity / 10), t0);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.03);
        noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(master);

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

// ============================================================================
// ONE-SHOT SKIN SOUNDS — plays a themed sound file exactly once when a die of
// that skin is thrown (no loop, unlike the ambiences above). One skin
// implemented so far: 'butterfly_orb'.
// ============================================================================

const ONE_SHOT_URL: Record<string, string> = {
    butterfly_orb: '/sons/butterfly.mp3',
};
const ONE_SHOT_VOLUME: Record<string, number> = {
    butterfly_orb: 0.6,
};

export const playOneShotForSkin = (skin: { id?: string }) => {
    if (!diceThemedSoundsEnabled) return; // themed mp3 effects disabled in settings
    const url = skin.id ? ONE_SHOT_URL[skin.id] : undefined;
    if (!url) return;
    try {
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => { });
        loadBuffer(ctx, url).then((buf) => {
            if (!buf) return;
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const gain = ctx.createGain();
            gain.gain.value = ONE_SHOT_VOLUME[skin.id!] ?? 0.6;
            src.connect(gain);
            gain.connect(getMasterGain(ctx));
            src.start();
        });
    } catch { /* audio must never break the roll */ }
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

// One shared playback per AmbienceId, ref-counted across dice: when several
// dice of the same theme roll together they must NOT stack N copies of the
// same looping file (that reads as one loud/muddy sound, not "louder"). The
// first caller actually starts playback; later callers just bump the
// refcount. Playback only stops (fades out) once the last referent stops.
interface SharedAmbience {
    refCount: number;
    master: GainNode;
    src: AudioBufferSourceNode | null;
    alive: boolean;
    startTimer: any;
    stopTimer: any; // pending fade-out cleanup, cancelled if reclaimed before it fires
    vol: number;
}
const activeAmbiences = new Map<AmbienceId, SharedAmbience>();

// Immediately silence every looping ambience, regardless of refcount — used
// when the "dice effects" toggle is switched OFF mid-roll so the themed beds
// go quiet at once. Each die's own handle.stop() is still called later when it
// disappears and safely no-ops (the entry is already gone).
const stopAllAmbiences = () => {
    const ctx = sharedAudioContext;
    activeAmbiences.forEach((s) => {
        try {
            s.alive = false;
            if (s.startTimer) clearTimeout(s.startTimer);
            if (s.stopTimer) clearTimeout(s.stopTimer);
            if (ctx) s.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2); // quick fade
            const src = s.src;
            setTimeout(() => {
                try { src?.stop(); } catch { }
                try { s.master.disconnect(); } catch { }
            }, 400);
        } catch { /* never throw from an audio cleanup */ }
    });
    activeAmbiences.clear();
};

// Play a themed ambience by LOOPING its audio file for the whole life of the
// die(s) using it. Returns a handle that releases this referent's share and
// cleans up on stop().
//
// Ref-counted AND fade-out-proof per AmbienceId: as long as any die of a
// theme is alive (or its predecessor's fade-out hasn't finished yet), we
// reuse the same underlying source instead of starting a second one — a die
// arriving just as the last one's ambience is fading out must revive that
// same instance, not layer a fresh loop on top of it (which sounded like the
// sound "restarting from the beginning").
export const startAmbience = (id: AmbienceId): Ambience | null => {
    if (!diceThemedSoundsEnabled) return null; // themed mp3 effects disabled in settings
    try {
        const ctx = getAudioContext();
        if (!ctx) return null;
        if (ctx.state === 'suspended') ctx.resume().catch(() => { });

        let shared = activeAmbiences.get(id);
        if (shared) {
            shared.refCount += 1;
            if (shared.stopTimer) {
                // Reclaimed mid fade-out: cancel the pending stop and fade back in.
                clearTimeout(shared.stopTimer);
                shared.stopTimer = null;
                shared.master.gain.cancelScheduledValues(ctx.currentTime);
                shared.master.gain.setTargetAtTime(shared.vol, ctx.currentTime, 0.35);
            }
        } else {
            const url = AMBIENCE_URL[id];
            const vol = AMBIENCE_VOLUME[id] ?? 0.5;
            const delayMs = (AMBIENCE_DELAY[id] ?? 0) * 1000;

            const master = ctx.createGain();
            master.gain.value = 0;
            master.connect(getMasterGain(ctx));

            shared = { refCount: 1, master, src: null, alive: true, startTimer: null, stopTimer: null, vol };
            activeAmbiences.set(id, shared);

            // Decode first (cached), then wait the theme's start delay (die still in
            // the air at t=0), then loop it in — unless we were already stopped.
            loadBuffer(ctx, url).then((buf) => {
                if (!shared!.alive || !buf) return;
                shared!.startTimer = setTimeout(() => {
                    if (!shared!.alive) return;
                    const src = ctx.createBufferSource();
                    src.buffer = buf;
                    src.loop = true;
                    src.connect(master);
                    src.start();
                    shared!.src = src;
                    master.gain.setTargetAtTime(vol, ctx.currentTime, 0.35); // fade in
                }, delayMs);
            });
        }

        let released = false;
        return {
            stop: () => {
                if (released) return;
                released = true;
                const s = activeAmbiences.get(id);
                if (!s) return;
                s.refCount -= 1;
                if (s.refCount > 0) return; // other dice still using this ambience

                s.master.gain.setTargetAtTime(0, ctx.currentTime, 0.3); // fade out
                s.stopTimer = setTimeout(() => {
                    activeAmbiences.delete(id);
                    s.alive = false;
                    try { s.src?.stop(); } catch { }
                    try { s.master.disconnect(); } catch { }
                }, 600);
            },
        };
    } catch {
        return null;
    }
};

// Which die skins get a themed ambience (data-driven, extend as we add themes).
export const ambienceForSkin = (skin: { id?: string; procStyle?: string; effectType?: string }): AmbienceId | null => {
    // Star Wars: reuse the closest existing sound bed (no dedicated SW audio
    // files ship yet). The Sith die's Force-lightning uses the same strike
    // scheduler as storm, so the thunder bed pairs naturally with its crackle.
    if (skin.procStyle === 'sith') return 'storm';
    // Kyber saber (humming energy), the serene light-side currents, the
    // balanced Force spirit and the hyperspace jump all sit best on the
    // ethereal cosmos pad.
    if (skin.procStyle === 'kyber' || skin.procStyle === 'lightside' || skin.procStyle === 'forcespirit' || skin.procStyle === 'hyperspace') return 'cosmos';
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
