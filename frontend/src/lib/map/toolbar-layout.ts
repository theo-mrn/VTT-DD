/**
 * Disposition de la barre d'outils de la carte (docs/carte.md § 6, Personnalisation) : propre au
 * compte, partagée entre ses appareils (`GET/PUT /v1/users/me/map-toolbar`), avec une copie
 * locale pour s'afficher tout de suite (`AccountPrefsStore`).
 */
import {
  AccountPrefsStore,
  prefsClient,
  useAccountPrefs,
  type PrefsClient,
} from '../account-prefs';
import { DEFAULT_LAYOUT, type ToolbarLayout } from './engine/toolbar';

const URL = '/v1/users/me/map-toolbar';
export const TOOLBAR_LAYOUT_EVENT = 'identity.map_toolbar_updated';

export const toolbarLayoutApi: PrefsClient<ToolbarLayout> = prefsClient<ToolbarLayout>(URL);

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function normalize(raw: unknown): ToolbarLayout {
  const r = (raw ?? {}) as Partial<Record<keyof ToolbarLayout, unknown>>;
  return { order: strings(r.order), hidden: strings(r.hidden) };
}

export class ToolbarLayoutStore extends AccountPrefsStore<ToolbarLayout> {
  constructor(client: PrefsClient<ToolbarLayout> = toolbarLayoutApi, delayMs?: number) {
    super(
      {
        url: URL,
        cacheKey: 'vtt-map-toolbar',
        event: TOOLBAR_LAYOUT_EVENT,
        empty: DEFAULT_LAYOUT,
        normalize,
      },
      client,
      delayMs,
    );
  }
}

let store: ToolbarLayoutStore | null = null;

/** Magasin de l'onglet (créé au premier usage, côté client). */
export function toolbarLayoutStore(): ToolbarLayoutStore {
  store ??= new ToolbarLayoutStore();
  return store;
}

/** Disposition de l'utilisateur, relue du serveur et suivie sur ses autres appareils. */
export function useToolbarLayout(): ToolbarLayout {
  return (
    useAccountPrefs(typeof window === 'undefined' ? null : toolbarLayoutStore()) ?? DEFAULT_LAYOUT
  );
}
