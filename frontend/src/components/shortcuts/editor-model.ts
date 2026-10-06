/**
 * Logique de l'éditeur des raccourcis (docs/raccourcis.md § 5), sans React : qui gêne une
 * touche choisie, la remplacer, tout rétablir.
 */
import { bindingsClash } from '@/lib/shortcuts/chord';
import { rolesOverlap, scopesOverlap, type ShortcutDescriptor } from '@/lib/shortcuts/registry';
import { bindingOf, withBinding, type ShortcutPrefs } from '@/lib/shortcuts/store';

/** Commandes que gênerait cette touche pour `d` (portées et rôles communs). */
export function clashesFor(
  list: readonly ShortcutDescriptor[],
  prefs: ShortcutPrefs,
  d: ShortcutDescriptor,
  binding: string,
): ShortcutDescriptor[] {
  return list.filter((o) => {
    if (o.id === d.id || !scopesOverlap(o.scope, d.scope) || !rolesOverlap(o.roles, d.roles))
      return false;
    const current = bindingOf(prefs, o);
    return current !== null && bindingsClash(current, binding);
  });
}

/** La touche passe à `d` ; celles qui la gênaient n'ont plus de touche (un geste standard reste). */
export function replaceBinding(
  prefs: ShortcutPrefs,
  d: ShortcutDescriptor,
  binding: string,
  others: readonly ShortcutDescriptor[],
): ShortcutPrefs {
  let next = prefs;
  for (const o of others) if (!o.fixed) next = withBinding(next, o, null);
  return withBinding(next, d, binding);
}

/** Toutes les touches par défaut ; les raccourcis créés restent, sans touche. */
export const resetAll = (prefs: ShortcutPrefs): ShortcutPrefs => ({
  bindings: {},
  custom: prefs.custom.map((c) => ({ ...c, binding: null })),
});
