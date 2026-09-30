/**
 * Raccourcis clavier du panneau Combat : Suivant, Précédent, attaquer avec le personnage
 * actif, tout appliquer. Actifs quand le panneau est affiché et que le focus y est (ou nulle
 * part) : la carte garde ses flèches (déplacer un token) et ses lettres (outils). Jamais
 * pendant une saisie, dans un menu ou une fenêtre, jamais en répétition de touche ni avec
 * ⌘, Ctrl ou Alt. Les lettres des panneaux de la table (F D C N J H S B U E M O) sont évitées.
 */
import { shortcutCode } from '@/lib/keyboard';

export type CombatShortcut = 'next' | 'previous' | 'attack' | 'applyAll';

export const COMBAT_SHORTCUTS: Record<
  CombatShortcut,
  { code: string; label: string; aria: string; name: string }
> = {
  next: { code: 'ArrowRight', label: '→', aria: 'ArrowRight', name: 'Tour suivant' },
  previous: { code: 'ArrowLeft', label: '←', aria: 'ArrowLeft', name: 'Tour précédent' },
  attack: { code: 'KeyA', label: 'A', aria: 'A', name: 'Attaquer avec le personnage actif' },
  applyAll: { code: 'KeyT', label: 'T', aria: 'T', name: 'Tout appliquer' },
};

const BY_CODE = new Map(
  (Object.entries(COMBAT_SHORTCUTS) as [CombatShortcut, { code: string }][]).map(([k, v]) => [
    v.code,
    k,
  ]),
);

export interface ShortcutKey {
  key: string;
  code: string;
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** Raccourci du panneau pour cette touche, ou null. */
export function combatShortcutOf(e: ShortcutKey): CombatShortcut | null {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  return BY_CODE.get(shortcutCode(e)) ?? null;
}

/** Sélecteur des cibles où une touche appartient à la saisie ou à un menu ouvert. */
export const TYPING_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], [role="radiogroup"], [role="dialog"]:not([data-table-panel]), [role="alertdialog"]';
