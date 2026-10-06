/** Raccourcis dans React : brancher une commande, lire sa touche (docs/raccourcis.md). */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAccountPrefs } from '../account-prefs';
import { bindingAria, bindingLabel } from './chord';
import { shortcuts, type ShortcutHandler } from './dispatcher';
import type { ShortcutDescriptor } from './registry';
import {
  bindingOf,
  EMPTY_PREFS,
  getPrefs,
  shortcutPrefsStore,
  subscribePrefs,
  type ShortcutPrefs,
} from './store';

/** Préférences du compte (et le magasin créé) : à n'appeler qu'une fois connecté. */
export function useShortcutPrefsStore(enabled: boolean) {
  return useAccountPrefs(enabled && typeof window !== 'undefined' ? shortcutPrefsStore() : null);
}

/** Préférences actuelles (vides tant que l'utilisateur n'est pas connecté). */
export function useShortcutPrefs(): ShortcutPrefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, () => EMPTY_PREFS);
}

/** Touche effective d'une commande. */
export function useBinding(d: ShortcutDescriptor | null | undefined): string | null {
  const prefs = useShortcutPrefs();
  return d ? bindingOf(prefs, d) : null;
}

/** Touche affichée (`⇧N`) et annoncée (`aria-keyshortcuts`) d'une commande. */
export function useBindingLabel(d: ShortcutDescriptor | null | undefined) {
  const binding = useBinding(d);
  return { label: bindingLabel(binding) ?? undefined, aria: bindingAria(binding) };
}

/**
 * Branche une commande tant que le composant est monté (et `enabled`). `run` peut renvoyer
 * faux : rien n'a été fait, la frappe continue.
 */
export function useShortcut(
  d: ShortcutDescriptor,
  run: ShortcutHandler['run'],
  options: { enabled?: boolean; available?: () => boolean } = {},
) {
  const latest = useRef({ run, available: options.available });
  latest.current = { run, available: options.available };
  const enabled = options.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    return shortcuts.bind(d, {
      run: () => latest.current.run(),
      available: () => latest.current.available?.() ?? true,
    });
    // La commande est stable par id ; son libellé peut changer (raccourci créé renommé)
  }, [d.id, d.label, d.scope, d.late, d.inInput, d.defaultBinding, enabled]);
}
