/**
 * Préférences du compte partagées entre ses appareils (barre de la carte, raccourcis) : en base
 * (identity, `GET/PUT` avec `version`), avec une copie locale pour s'afficher tout de suite.
 * Un changement s'applique aussitôt et s'enregistre par lot ; un autre appareil qui a écrit
 * entre-temps (409) cède : le dernier geste gagne. Un événement du compte (`owner`) apporte ce
 * qu'un autre appareil a enregistré.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { api, ApiError } from './api';
import { useCampaignEvents } from './realtime';

const SAVE_DELAY_MS = 400;

export type Versioned<T> = T & { version: number };

export interface PrefsClient<T> {
  get(): Promise<Versioned<T>>;
  save(body: T & { version?: number }): Promise<Versioned<T>>;
}

export interface AccountPrefsOptions<T> {
  /** Route du compte (`/v1/users/me/…`). */
  url: string;
  /** Clé de la copie locale. */
  cacheKey: string;
  /** Événement qui apporte l'état d'un autre appareil. */
  event: string;
  /** État sans préférence. */
  empty: T;
  /** Valeur lue (copie locale, serveur, événement) ramenée à un état valide. */
  normalize(raw: unknown): T;
  /** Compte encore vide (version 0) : reprise d'anciens réglages, ou null. */
  migrate?(): T | null;
}

export function prefsClient<T>(url: string): PrefsClient<T> {
  return {
    get: () => api<Versioned<T>>(url),
    save: (body) => api<Versioned<T>>(url, { method: 'PUT', body: JSON.stringify(body) }),
  };
}

export class AccountPrefsStore<T extends object> {
  state: T;
  private version = 0;
  /** État à enregistrer (prioritaire sur ce que renvoie le serveur). */
  private pending: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loaded: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly options: AccountPrefsOptions<T>,
    private readonly client: PrefsClient<T> = prefsClient<T>(options.url),
    private readonly delayMs = SAVE_DELAY_MS,
  ) {
    this.state = (typeof window === 'undefined' ? null : this.readCache()) ?? options.empty;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  getSnapshot = () => this.state;

  private readCache(): T | null {
    try {
      const raw = localStorage.getItem(this.options.cacheKey);
      return raw ? this.options.normalize(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private emit() {
    try {
      localStorage.setItem(this.options.cacheKey, JSON.stringify(this.state));
    } catch {
      // Stockage indisponible (navigation privée) : le serveur fait foi
    }
    for (const l of this.listeners) l();
  }

  /** Lecture du serveur, une fois par onglet ; reprise d'anciens réglages si le compte est vide. */
  load(): Promise<void> {
    this.loaded ??= this.client
      .get()
      .then((p) => {
        this.adopt(p);
        if (p.version > 0 || this.pending) return;
        const migrated = this.options.migrate?.();
        if (migrated) this.set(migrated);
      })
      .catch(() => undefined);
    return this.loaded;
  }

  /** État du serveur (réponse, autre appareil) ; un changement en attente reste prioritaire. */
  adopt(p: Versioned<T>) {
    if (p.version < this.version) return;
    this.version = p.version;
    if (this.pending) return;
    this.state = this.options.normalize(p);
    this.emit();
  }

  /**
   * Événement d'un autre appareil : l'état s'il le porte, sinon (version seule : texte libre
   * gardé hors du journal) une relecture du serveur.
   */
  receive(payload: unknown) {
    const p = (payload ?? {}) as Record<string, unknown>;
    if (typeof p.version !== 'number' || p.version <= this.version) return;
    const complete = Object.keys(this.options.empty).every((k) => k in p);
    if (complete) this.adopt(p as Versioned<T>);
    else void this.refresh();
  }

  /** Relit le serveur. */
  refresh(): Promise<void> {
    return this.client
      .get()
      .then((p) => this.adopt(p))
      .catch(() => undefined);
  }

  set(next: T) {
    this.state = next;
    this.pending = next;
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  reset() {
    this.set(this.options.empty);
  }

  /** Enregistre tout de suite ce qui attend (tests, fermeture). */
  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const sent = this.pending;
    if (!sent) return;
    try {
      const saved = await this.client.save({ ...sent, version: this.version });
      if (this.pending === sent) this.pending = null;
      this.adopt(saved);
    } catch (e) {
      // Conflit (autre appareil) : on repart de sa version, notre geste par-dessus
      if (e instanceof ApiError && e.status === 409) {
        const current = (e.problem as unknown as { current?: Versioned<T> }).current;
        if (!current) return;
        this.version = current.version;
        if (this.pending === sent) this.set(sent);
      }
    }
  }
}

const noop = () => () => undefined;

/** État du magasin, relu du serveur et suivi sur les autres appareils du compte. */
export function useAccountPrefs<T extends object>(store: AccountPrefsStore<T> | null): T | null {
  const state = useSyncExternalStore(
    store ? store.subscribe : noop,
    () => store?.getSnapshot() ?? null,
    () => null,
  );
  useEffect(() => void store?.load(), [store]);
  // Sans magasin (visiteur, rendu serveur) : aucune connexion temps réel ouverte pour rien
  useCampaignEvents(
    null,
    store ? [store.options.event] : [],
    (e) => store?.receive(e.event.payload),
    { enabled: Boolean(store) },
  );
  return state;
}
