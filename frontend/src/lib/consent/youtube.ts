/**
 * Consentement au lecteur YouTube (politique de confidentialité, § cookies) : le lecteur
 * IFrame dépose ses propres traceurs, même sur youtube-nocookie.com. Rien n'est chargé
 * depuis YouTube avant l'accord ; un refus laisse les musiques YouTube muettes, sans
 * erreur, jusqu'à ce que la personne change d'avis (bandeau ou profil).
 *
 * Choix gardé dans ce navigateur (stockage local), comme tout consentement aux traceurs.
 */

export type YoutubeConsent = 'granted' | 'denied';

const KEY = 'yner:consent:youtube';

let choice: YoutubeConsent | null = null;
let loaded = false;
/** Lecteurs en attente d'un accord : le bandeau ne s'affiche que s'il y en a. */
let waiting = 0;
let grantedWaiters: (() => void)[] = [];
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === 'granted' || v === 'denied') choice = v;
  } catch {
    // Stockage indisponible (navigation privée stricte) : on redemandera
  }
}

function emit() {
  for (const l of listeners) l();
}

export function youtubeConsent(): YoutubeConsent | null {
  load();
  return choice;
}

/** `null` : oublier le choix (le bandeau reviendra à la prochaine musique YouTube). */
export function setYoutubeConsent(next: YoutubeConsent | null) {
  load();
  choice = next;
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Choix gardé pour cette page seulement
  }
  if (next === 'granted') {
    const ready = grantedWaiters;
    grantedWaiters = [];
    waiting = 0;
    for (const r of ready) r();
  }
  emit();
}

/** Résolue dès que YouTube est autorisé ; reste en attente sinon. */
export function whenYoutubeAllowed(): Promise<void> {
  load();
  if (choice === 'granted') return Promise.resolve();
  return new Promise((resolve) => {
    grantedWaiters.push(resolve);
    waiting += 1;
    emit();
  });
}

/** Le bandeau doit-il demander l'accord : un lecteur attend et rien n'a été choisi. */
export function youtubeConsentNeeded(): boolean {
  load();
  return waiting > 0 && choice === null;
}

export function subscribeYoutubeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
