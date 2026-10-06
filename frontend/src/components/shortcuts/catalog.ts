/**
 * Toutes les commandes du site, pour l'éditeur et l'aide-mémoire (docs/raccourcis.md § 5) :
 * général, table, carte, dés, notes, gestes standards, et les raccourcis créés par le joueur.
 */
import { TABLE_PANEL_SHORTCUTS, TABLE_SHORTCUTS } from '@/components/table/panels/shortcuts';
import { BUBBLE_SHORTCUT, MAP_SHORTCUTS } from '@/lib/map/shortcuts';
import {
  DICE_MACRO_SHORTCUTS,
  DICE_ROLL_SHORTCUTS,
  DICE_SHORTCUTS,
  FIXED_SHORTCUTS,
  GENERAL_SHORTCUTS,
  NOTES_SHORTCUTS,
} from '@/lib/shortcuts/catalog';
import type { ShortcutDescriptor, ShortcutScope } from '@/lib/shortcuts/registry';
import { customDescriptor, type ShortcutPrefs } from '@/lib/shortcuts/store';

/** Commandes du code (sans les raccourcis créés). */
export const BUILTIN_SHORTCUTS: readonly ShortcutDescriptor[] = [
  ...Object.values(GENERAL_SHORTCUTS),
  ...TABLE_PANEL_SHORTCUTS,
  TABLE_SHORTCUTS.quickNote,
  TABLE_SHORTCUTS.closePanel,
  BUBBLE_SHORTCUT,
  ...MAP_SHORTCUTS,
  ...Object.values(DICE_SHORTCUTS),
  ...DICE_MACRO_SHORTCUTS,
  ...DICE_ROLL_SHORTCUTS,
  ...Object.values(NOTES_SHORTCUTS),
  ...FIXED_SHORTCUTS,
];

/** Commandes du code et raccourcis créés par le joueur. */
export const allShortcuts = (prefs: ShortcutPrefs): ShortcutDescriptor[] => [
  ...BUILTIN_SHORTCUTS,
  ...prefs.custom.map(customDescriptor),
];

/** Sections de l'éditeur, dans l'ordre. */
export const SECTIONS: readonly { scope: ShortcutScope; title: string }[] = [
  { scope: 'global', title: 'Général' },
  { scope: 'table', title: 'Table' },
  { scope: 'map', title: 'Carte' },
  { scope: 'dice', title: 'Dés' },
  { scope: 'notes', title: 'Notes' },
];
