/**
 * Commandes du site hors carte et hors panneaux de la table (docs/raccourcis.md § 6) : ce que
 * l'éditeur liste même là où elles ne sont pas montées (page du profil). Les panneaux de la
 * table et la carte ont leur liste à côté de leur code (`components/table/panels/shortcuts.ts`,
 * `lib/map/shortcuts.ts`) ; `components/shortcuts/catalog.ts` assemble le tout.
 */
import type { ShortcutDescriptor } from './registry';

export const GENERAL_SHORTCUTS = {
  search: {
    id: 'general.search',
    label: 'shortcuts.commands.search',
    scope: 'global',
    defaultBinding: 'Mod+KeyK',
    inInput: true,
  },
  cheatSheet: {
    id: 'general.cheat-sheet',
    label: 'shortcuts.commands.cheatSheet',
    scope: 'global',
    defaultBinding: 'Char:?',
  },
  quickRoll: {
    id: 'dice.quick-roll',
    label: 'shortcuts.commands.quickRoll',
    scope: 'global',
    defaultBinding: 'Space Enter',
  },
} satisfies Record<string, ShortcutDescriptor>;

const DICE_FACES = [4, 6, 8, 10, 12, 20, 100] as const;

export const DICE_SHORTCUTS = {
  reroll: {
    id: 'dice.reroll',
    label: 'shortcuts.commands.diceReroll',
    scope: 'dice',
    defaultBinding: 'KeyR',
    late: true,
  },
} satisfies Record<string, ShortcutDescriptor>;

/** Macros de dés 1 à 9 (dans l'ordre de la liste des macros). */
export const DICE_MACRO_SHORTCUTS: readonly ShortcutDescriptor[] = Array.from(
  { length: 9 },
  (_, i) => ({
    id: `dice.macro.${i + 1}`,
    label: (t) => t('shortcuts.commands.diceMacro', { n: i + 1 }),
    scope: 'dice',
    defaultBinding: `Digit${i + 1}`,
    late: true,
  }),
);

/** Lancer un dé (sans touche par défaut : les chiffres sont aux macros). */
export const DICE_ROLL_SHORTCUTS: readonly (ShortcutDescriptor & { faces: number })[] =
  DICE_FACES.map((faces) => ({
    id: `dice.roll.d${faces}`,
    label: (t) => t('shortcuts.commands.diceRoll', { faces }),
    scope: 'dice',
    defaultBinding: null,
    late: true,
    faces,
  }));

export const NOTES_SHORTCUTS = {
  create: {
    id: 'notes.create',
    label: 'shortcuts.commands.notesCreate',
    scope: 'notes',
    defaultBinding: 'KeyN',
    late: true,
  },
  createAnywhere: {
    id: 'notes.create-anywhere',
    label: 'shortcuts.commands.notesCreateAnywhere',
    scope: 'notes',
    defaultBinding: 'Mod+Alt+KeyN',
    late: true,
    inInput: true,
  },
  search: {
    id: 'notes.search',
    label: 'shortcuts.commands.notesSearch',
    scope: 'notes',
    defaultBinding: 'Char:/',
    late: true,
  },
} satisfies Record<string, ShortcutDescriptor>;

/** Gestes standards, affichés dans l'éditeur, non modifiables. */
export const FIXED_SHORTCUTS: readonly ShortcutDescriptor[] = [
  {
    id: 'fixed.undo',
    label: 'shortcuts.commands.undo',
    scope: 'map',
    defaultBinding: 'Mod+KeyZ',
    fixed: true,
  },
  {
    id: 'fixed.redo',
    label: 'shortcuts.commands.redo',
    scope: 'map',
    defaultBinding: 'Mod+Shift+KeyZ',
    fixed: true,
  },
  {
    id: 'fixed.redo-alt',
    label: 'shortcuts.commands.redo',
    scope: 'map',
    defaultBinding: 'Mod+KeyY',
    fixed: true,
  },
  {
    id: 'fixed.duplicate',
    label: 'shortcuts.commands.duplicate',
    scope: 'map',
    defaultBinding: 'Mod+KeyD',
    fixed: true,
  },
  {
    id: 'fixed.delete',
    label: 'shortcuts.commands.delete',
    scope: 'map',
    defaultBinding: 'Delete',
    fixed: true,
  },
  {
    id: 'fixed.rotate',
    label: 'shortcuts.commands.rotate',
    scope: 'map',
    defaultBinding: 'KeyR',
    fixed: true,
    roles: ['gm', 'player'],
  },
  {
    id: 'fixed.nudge',
    label: 'shortcuts.commands.nudge',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: { text: '↑ ↓ ← →' },
    fixed: true,
  },
  {
    id: 'fixed.arrange',
    label: 'shortcuts.commands.arrange',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: { text: '⌘↑ ⌘↓' },
    fixed: true,
  },
  {
    id: 'fixed.pan',
    label: 'shortcuts.commands.pan',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: 'shortcuts.gestures.pan',
    fixed: true,
  },
  {
    id: 'fixed.waypoint',
    label: 'shortcuts.commands.waypoint',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: 'shortcuts.gestures.pan',
    fixed: true,
    roles: ['gm', 'player'],
  },
  {
    id: 'fixed.tool-modes',
    label: 'shortcuts.commands.toolModes',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: 'shortcuts.gestures.toolModes',
    fixed: true,
  },
  {
    id: 'fixed.escape',
    label: 'shortcuts.commands.escape',
    scope: 'map',
    defaultBinding: 'Escape',
    fixed: true,
  },
  {
    id: 'fixed.save-note',
    label: 'shortcuts.commands.saveNote',
    scope: 'notes',
    defaultBinding: 'Mod+KeyS',
    fixed: true,
  },
];
