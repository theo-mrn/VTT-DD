/**
 * Disposition de la barre d'outils de la carte (docs/carte.md § 6, Personnalisation) : propre au
 * compte, partagée entre ses appareils (`GET/PUT /v1/users/me/map-toolbar`), avec une copie
 * locale pour s'afficher tout de suite. Un changement s'applique aussitôt et s'enregistre par
 * lot (400 ms) ; un autre appareil qui a écrit entre-temps (409) cède : le dernier geste gagne.
 */
import type { MapToolbarLayout } from '@vtt/contracts';
import { useEffect, useSyncExternalStore } from 'react';
import { api, ApiError } from '../api';
import { useCampaignEvents } from '../realtime';
import { DEFAULT_LAYOUT, type ToolbarLayout } from './engine/toolbar';

const URL = '/v1/users/me/map-toolbar';
const CACHE_KEY = 'vtt-map-toolbar';
const SAVE_DELAY_MS = 400;
export const TOOLBAR_LAYOUT_EVENT = 'identity.map_toolbar_updated';

export const toolbarLayoutApi = {
  get: () => api<MapToolbarLayout>(URL),
  save: (body: ToolbarLayout & { version?: number }) =>
    api<MapToolbarLayout>(URL, { method: 'PUT', body: JSON.stringify(body) }),
};

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function readCache(): ToolbarLayout | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ToolbarLayout>;
    return { order: strings(parsed.order), hidden: strings(parsed.hidden) };
  } catch {
    return null;
  }
}

function writeCache(layout: ToolbarLayout) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(layout));
  } catch {
    // Stockage indisponible (navigation privée) : le serveur fait foi
  }
}

export class ToolbarLayoutStore {
  state: ToolbarLayout = DEFAULT_LAYOUT;
  private version = 0;
  /** Disposition à enregistrer (prioritaire sur ce que renvoie le serveur). */
  private pending: ToolbarLayout | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private loaded: Promise<void> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly client = toolbarLayoutApi,
    private readonly delayMs = SAVE_DELAY_MS,
  ) {
    if (typeof window !== 'undefined') this.state = readCache() ?? DEFAULT_LAYOUT;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  getSnapshot = () => this.state;

  private emit() {
    writeCache(this.state);
    for (const l of this.listeners) l();
  }

  /** Lecture du serveur, une fois par onglet. */
  load(): Promise<void> {
    this.loaded ??= this.client
      .get()
      .then((p) => this.adopt(p))
      .catch(() => undefined);
    return this.loaded;
  }

  /** État du serveur (réponse, autre appareil) ; un changement en attente reste prioritaire. */
  adopt(p: MapToolbarLayout) {
    if (p.version < this.version) return;
    this.version = p.version;
    if (this.pending) return;
    this.state = { order: p.order, hidden: p.hidden };
    this.emit();
  }

  set(next: ToolbarLayout) {
    this.state = next;
    this.pending = next;
    this.emit();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.delayMs);
  }

  reset() {
    this.set(DEFAULT_LAYOUT);
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
        const current = (e.problem as unknown as { current?: MapToolbarLayout }).current;
        if (!current) return;
        this.version = current.version;
        if (this.pending === sent) this.set(sent);
      }
    }
  }
}

let store: ToolbarLayoutStore | null = null;

/** Magasin de l'onglet (créé au premier usage, côté client). */
export function toolbarLayoutStore(): ToolbarLayoutStore {
  store ??= new ToolbarLayoutStore();
  return store;
}

const noop = () => () => undefined;

/** Disposition de l'utilisateur, relue du serveur et suivie sur ses autres appareils. */
export function useToolbarLayout(): ToolbarLayout {
  const s = typeof window === 'undefined' ? null : toolbarLayoutStore();
  const layout = useSyncExternalStore(
    s ? s.subscribe : noop,
    () => s!.getSnapshot(),
    () => DEFAULT_LAYOUT,
  );
  useEffect(() => void s?.load(), [s]);
  useCampaignEvents(null, [TOOLBAR_LAYOUT_EVENT], (e) =>
    s?.adopt(e.event.payload as unknown as MapToolbarLayout),
  );
  return layout;
}
