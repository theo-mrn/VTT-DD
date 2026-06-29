// Shared AudioContext singleton — avoids creating a new context per collision
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
