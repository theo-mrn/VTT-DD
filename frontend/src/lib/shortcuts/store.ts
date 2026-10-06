/**
 * Raccourcis de l'utilisateur (docs/raccourcis.md § 4) : sur le compte
 * (`GET/PUT /v1/users/me/shortcuts`), copie locale, reprise des réglages du legacy.
 *
 * - `bindings` : les écarts aux touches par défaut (`null` : « Aucune ») ;
 * - `custom` : les raccourcis créés (une formule de dés sur une touche).
 */
import { AccountPrefsStore, prefsClient, type PrefsClient } from '../account-prefs';
import { isChord, parseBinding } from './chord';
import { shortcuts } from './dispatcher';
import type { ShortcutDescriptor } from './registry';

const URL = '/v1/users/me/shortcuts';
export const SHORTCUTS_EVENT = 'identity.shortcuts_updated';
export const CUSTOM_MAX = 50;

export interface UserShortcut {
  id: string;
  kind: 'roll';
  label: string;
  formula: string;
  binding: string | null;
}

export interface ShortcutPrefs {
  bindings: Record<string, string | null>;
  custom: UserShortcut[];
}

export const EMPTY_PREFS: ShortcutPrefs = { bindings: {}, custom: [] };

const ID = /^[a-z0-9][a-z0-9:._-]{0,79}$/i;
const validBinding = (v: unknown): v is string | null =>
  v === null || (typeof v === 'string' && parseBinding(v) !== null);

export function normalizePrefs(raw: unknown): ShortcutPrefs {
  const r = (raw ?? {}) as { bindings?: unknown; custom?: unknown };
  const bindings: Record<string, string | null> = {};
  if (r.bindings && typeof r.bindings === 'object')
    for (const [id, v] of Object.entries(r.bindings as Record<string, unknown>))
      if (ID.test(id) && validBinding(v)) bindings[id] = v;
  const custom: UserShortcut[] = [];
  if (Array.isArray(r.custom))
    for (const c of r.custom as Partial<UserShortcut>[]) {
      if (custom.length >= CUSTOM_MAX) break;
      if (!c || typeof c.id !== 'string' || !ID.test(c.id) || c.kind !== 'roll') continue;
      if (typeof c.label !== 'string' || !c.label.trim()) continue;
      if (typeof c.formula !== 'string' || !c.formula.trim()) continue;
      custom.push({
        id: c.id,
        kind: 'roll',
        label: c.label.trim().slice(0, 60),
        formula: c.formula.trim().slice(0, 200),
        binding: validBinding(c.binding) ? (c.binding ?? null) : null,
      });
    }
  return { bindings, custom };
}

/** Commande d'un raccourci créé (une formule, lancée par la table de dés affichée). */
export const customDescriptor = (u: UserShortcut): ShortcutDescriptor => ({
  id: `custom.${u.id}`,
  label: u.label,
  scope: 'dice',
  defaultBinding: null,
  late: true,
});

/** Touche effective d'une commande pour ces préférences. */
export function bindingOf(prefs: ShortcutPrefs, d: ShortcutDescriptor): string | null {
  if (d.fixed) return d.defaultBinding;
  if (d.id.startsWith('custom.')) {
    const id = d.id.slice('custom.'.length);
    return prefs.custom.find((c) => c.id === id)?.binding ?? null;
  }
  return Object.hasOwn(prefs.bindings, d.id) ? prefs.bindings[d.id]! : d.defaultBinding;
}

/** Préférences avec une nouvelle touche pour cette commande (le défaut n'est pas recopié). */
export function withBinding(
  prefs: ShortcutPrefs,
  d: ShortcutDescriptor,
  binding: string | null,
): ShortcutPrefs {
  if (d.fixed) return prefs;
  if (d.id.startsWith('custom.')) {
    const id = d.id.slice('custom.'.length);
    return { ...prefs, custom: prefs.custom.map((c) => (c.id === id ? { ...c, binding } : c)) };
  }
  const bindings = { ...prefs.bindings };
  if (binding === d.defaultBinding) delete bindings[d.id];
  else bindings[d.id] = binding;
  return { ...prefs, bindings };
}

// ─── Reprise du legacy ───────────────────────────────────────────────────────

/** Ancien id → nouvel id, et touche par défaut du legacy (seuls les choix de l'utilisateur passent). */
const LEGACY: Record<string, { id: string; default: string }> = {
  tab_chat: { id: 'table.panel.chat', default: 'C' },
  tab_dice: { id: 'table.panel.des', default: 'D' },
  tab_notes: { id: 'table.panel.notes', default: 'N' },
  quick_note: { id: 'table.quick-note', default: 'Shift+N' },
  tab_historique: { id: 'table.panel.historique', default: '' },
  tab_encounter: { id: 'table.panel.rencontres', default: '' },
  tab_npc: { id: 'table.panel.pnj', default: '' },
  tool_open_search: { id: 'general.search', default: 'Ctrl+K' },
  quick_roll: { id: 'dice.quick-roll', default: 'Space Enter' },
  open_bubble_menu: { id: 'map.bubble', default: 'K' },
  tool_select: { id: 'map.tool.select', default: 'E' },
  tool_draw: { id: 'map.tool.draw', default: 'B' },
  tool_measure: { id: 'map.tool.measure', default: 'R' },
  tool_fog: { id: 'map.tool.fog', default: 'V' },
  tool_portal: { id: 'map.tool.portals', default: 'Y' },
  tool_add_char: { id: 'map.tool.tokens', default: 'A' },
  tool_add_obj: { id: 'map.tool.objects', default: 'O' },
  tool_add_note: { id: 'map.tool.text', default: 'T' },
  tool_grid: { id: 'map.action.grid.toggle', default: 'G' },
  tool_layers: { id: 'map.action.layers.panel', default: 'L' },
  tool_zoom_in: { id: 'map.action.camera.zoom-in', default: '+' },
  tool_zoom_out: { id: 'map.action.camera.zoom-out', default: '-' },
  roll_d4: { id: 'dice.roll.d4', default: 'Code:Digit1' },
  roll_d6: { id: 'dice.roll.d6', default: 'Code:Digit2' },
  roll_d8: { id: 'dice.roll.d8', default: 'Code:Digit3' },
  roll_d10: { id: 'dice.roll.d10', default: 'Code:Digit4' },
  roll_d12: { id: 'dice.roll.d12', default: 'Code:Digit5' },
  roll_d20: { id: 'dice.roll.d20', default: 'Code:Digit6' },
  roll_d100: { id: 'dice.roll.d100', default: 'Code:Digit7' },
};

const LEGACY_KEYS: Record<string, string> = { ' ': 'Space' };

/** Une touche du legacy (`Ctrl+K`, `Shift+N`, `Code:Digit1`, `+`) au format d'aujourd'hui. */
export function convertLegacyChord(token: string): string | null {
  if (token.startsWith('Code:')) return isChord(token.slice(5)) ? token.slice(5) : null;
  // La touche « + » s'écrit « …++ » dans le legacy
  const plus = token.endsWith('++') || token === '+';
  const parts = plus ? [...token.slice(0, -2).split('+').filter(Boolean), '+'] : token.split('+');
  const raw = LEGACY_KEYS[parts.at(-1)!] ?? parts.at(-1)!;
  const mods = new Set<string>();
  for (const m of parts.slice(0, -1)) {
    if (m === 'Meta' || m === 'Ctrl') mods.add('Mod');
    else if (m === 'Alt') mods.add('Alt');
    else if (m === 'Shift') mods.add('Shift');
    else return null;
  }
  let key: string;
  if (/^[A-Z]$/i.test(raw)) key = `Key${raw.toUpperCase()}`;
  else if (/^\d$/.test(raw)) key = `Digit${raw}`;
  else if (raw.length === 1) {
    key = `Char:${raw}`;
    mods.delete('Shift');
  } else key = raw;
  const chord = [...['Mod', 'Alt', 'Shift'].filter((m) => mods.has(m)), key].join('+');
  return isChord(chord) ? chord : null;
}

export function convertLegacyBinding(value: string): string | null {
  const chords = value.trim().split(/\s+/).map(convertLegacyChord);
  return chords.every(Boolean) ? (chords as string[]).join(' ') : null;
}

/** Réglages du legacy (même domaine) ramenés aux préférences d'aujourd'hui, ou null. */
export function migrateLegacy(storage: Pick<Storage, 'getItem'> | null): ShortcutPrefs | null {
  if (!storage) return null;
  const prefs: ShortcutPrefs = { bindings: {}, custom: [] };
  try {
    const saved = JSON.parse(storage.getItem('vtt-dd-shortcuts-v2') ?? 'null') as Record<
      string,
      unknown
    > | null;
    for (const [old, value] of Object.entries(saved ?? {})) {
      const target = LEGACY[old];
      if (!target || typeof value !== 'string' || value === target.default) continue;
      const binding = value === '' ? null : convertLegacyBinding(value);
      if (value === '' || binding) prefs.bindings[target.id] = binding;
    }
    const custom = JSON.parse(storage.getItem('vtt-dd-custom-shortcuts') ?? 'null') as unknown;
    if (Array.isArray(custom))
      for (const c of custom as { label?: unknown; command?: unknown; keyString?: unknown }[]) {
        if (typeof c?.label !== 'string' || typeof c.command !== 'string' || !c.command.trim())
          continue;
        prefs.custom.push({
          id: crypto.randomUUID(),
          kind: 'roll',
          label: c.label.trim() || c.command.trim(),
          formula: c.command.trim(),
          binding: typeof c.keyString === 'string' ? convertLegacyBinding(c.keyString) : null,
        });
      }
  } catch {
    return null;
  }
  const normalized = normalizePrefs(prefs);
  return Object.keys(normalized.bindings).length || normalized.custom.length ? normalized : null;
}

// ─── Magasin ─────────────────────────────────────────────────────────────────

export const shortcutPrefsApi: PrefsClient<ShortcutPrefs> = prefsClient<ShortcutPrefs>(URL);

export class ShortcutPrefsStore extends AccountPrefsStore<ShortcutPrefs> {
  constructor(
    client: PrefsClient<ShortcutPrefs> = shortcutPrefsApi,
    delayMs?: number,
    legacy: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined'
      ? null
      : localStorage,
  ) {
    super(
      {
        url: URL,
        cacheKey: 'vtt-shortcuts',
        event: SHORTCUTS_EVENT,
        empty: EMPTY_PREFS,
        normalize: normalizePrefs,
        migrate: () => migrateLegacy(legacy),
      },
      client,
      delayMs,
    );
  }
}

let store: ShortcutPrefsStore | null = null;
/** Abonnés arrivés avant le magasin (connexion pas encore faite) : branchés à sa création. */
const waiting = new Map<() => void, (() => void) | null>();

/**
 * Magasin de l'onglet, créé une fois l'utilisateur connecté (`ShortcutsRoot`) ; l'aiguilleur lit
 * ses touches dedans.
 */
export function shortcutPrefsStore(): ShortcutPrefsStore {
  if (!store) {
    const s = new ShortcutPrefsStore();
    store = s;
    shortcuts.setResolver((d) => bindingOf(s.state, d));
    for (const l of waiting.keys()) {
      waiting.set(l, s.subscribe(l));
      l();
    }
  }
  return store;
}

/** Suit les préférences, même avant que le magasin existe. */
export function subscribePrefs(listener: () => void): () => void {
  if (store) return store.subscribe(listener);
  waiting.set(listener, null);
  return () => {
    waiting.get(listener)?.();
    waiting.delete(listener);
  };
}

export const getPrefs = (): ShortcutPrefs => store?.state ?? EMPTY_PREFS;

/** Touche effective, hors React (la carte) : les défauts tant que le magasin n'existe pas. */
export function effectiveBinding(d: ShortcutDescriptor): string | null {
  return store ? bindingOf(store.state, d) : d.defaultBinding;
}

/** Magasin existant, sans le créer (abonnement hors React, tests). */
export const currentShortcutPrefsStore = () => store;
