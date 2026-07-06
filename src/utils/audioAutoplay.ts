// Browsers reject audio.play() until the page has seen a user gesture
// (click/keydown/touch). Our music players call play() from a Firebase
// listener that can fire before any interaction (e.g. a player joins a room
// where the MJ already has music running) — that call is silently rejected
// with NotAllowedError and the track never starts.
//
// registerPendingPlay(audio) queues that element; the first interaction
// anywhere on the page retries play() on every still-queued element.

const pending = new Set<HTMLAudioElement>();
let listenerAttached = false;

const retryPending = () => {
    pending.forEach(audio => {
        // Element may have been paused/swapped since it was queued.
        if (audio.paused) {
            audio.play().catch(() => { /* still blocked or no longer relevant */ });
        }
    });
    pending.clear();
};

const attachListener = () => {
    if (listenerAttached || typeof window === 'undefined') return;
    listenerAttached = true;
    ['pointerdown', 'keydown'].forEach(evt =>
        window.addEventListener(evt, retryPending, { capture: true }),
    );
};

// Call from a play().catch() handler to retry once the user interacts.
export const registerPendingPlay = (audio: HTMLAudioElement) => {
    pending.add(audio);
    attachListener();
};
