/**
 * Dépôt local : ne sert plus que les notes (lib/notes.ts), en attendant leur
 * branchement sur le service notes (campaign). Les données restent dans ce
 * navigateur (localStorage). Campagnes, personnages et jets de dés passent
 * toujours par leurs services.
 *
 * NEXT_PUBLIC_SERVICES ne concerne donc plus que les notes (« campaign ») ;
 * leurs routes distantes ne sont pas encore celles du service : ne pas
 * l'activer d'ici là.
 */
import { ApiError } from './api';

export type Service = 'campaign';

const ACTIFS = new Set(
  (process.env.NEXT_PUBLIC_SERVICES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

/** Vrai si le service est joignable derrière la gateway. */
export function serviceActif(service: Service): boolean {
  return ACTIFS.has(service);
}

/** Vrai si les notes sont servies localement (affiché discrètement dans l'app). */
export const APERCU_LOCAL = !serviceActif('campaign');

// ─── Utilisateur courant ─────────────────────────────────────────────────────

export interface Auteur {
  id: string;
  name: string;
  avatarUrl: string | null;
}

let courant: Auteur | null = null;

/** Posé par la session : le dépôt local attribue les données à cet utilisateur. */
export function definirUtilisateurLocal(auteur: Auteur | null) {
  courant = auteur;
}

export function utilisateurLocal(): Auteur {
  if (!courant) throw new Error('Session requise');
  return courant;
}

// ─── Collections ─────────────────────────────────────────────────────────────

const PREFIXE = 'yner:v1:';

function stockage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function lireCollection<T>(collection: string): T[] {
  try {
    const brut = stockage()?.getItem(PREFIXE + collection);
    return brut ? (JSON.parse(brut) as T[]) : [];
  } catch {
    return [];
  }
}

export function ecrireCollection<T>(collection: string, elements: T[]) {
  try {
    stockage()?.setItem(PREFIXE + collection, JSON.stringify(elements));
  } catch {
    // Quota dépassé ou stockage bloqué : l'aperçu local ne garde pas l'écriture
    throw erreurLocale(
      "Le navigateur a refusé l'enregistrement (espace de stockage plein ?).",
      507,
    );
  }
}

/** Modifie une collection en une fois et renvoie la valeur calculée. */
export function modifierCollection<T, R>(
  collection: string,
  maj: (elements: T[]) => { elements: T[]; resultat: R },
): R {
  const { elements, resultat } = maj(lireCollection<T>(collection));
  ecrireCollection(collection, elements);
  return resultat;
}

/**
 * Prévenu quand un autre onglet modifie une collection (dans l'onglet courant,
 * les mutations mettent déjà le cache à jour).
 */
export function surChangementAutreOnglet(f: (collection: string) => void): () => void {
  const ecouteur = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIXE)) f(e.key.slice(PREFIXE.length));
  };
  window.addEventListener('storage', ecouteur);
  return () => window.removeEventListener('storage', ecouteur);
}

export function nouvelId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const maintenant = () => new Date().toISOString();

/** Erreur au format de l'API (problem+json), pour que les écrans la traitent pareil. */
export function erreurLocale(message: string, status = 400): ApiError {
  return new ApiError({ status, title: message, detail: message });
}
