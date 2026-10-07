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
    label: 'Recherche',
    scope: 'global',
    defaultBinding: 'Mod+KeyK',
    inInput: true,
  },
  cheatSheet: {
    id: 'general.cheat-sheet',
    label: 'Aide-mémoire des raccourcis',
    scope: 'global',
    defaultBinding: 'Char:?',
  },
  quickRoll: {
    id: 'dice.quick-roll',
    label: 'Jet rapide',
    scope: 'global',
    defaultBinding: 'Space Enter',
  },
} satisfies Record<string, ShortcutDescriptor>;

const DICE_FACES = [4, 6, 8, 10, 12, 20, 100] as const;

export const DICE_SHORTCUTS = {
  reroll: {
    id: 'dice.reroll',
    label: 'Relancer le dernier jet',
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
    label: `Macro ${i + 1}`,
    scope: 'dice',
    defaultBinding: `Digit${i + 1}`,
    late: true,
  }),
);

/** Lancer un dé (sans touche par défaut : les chiffres sont aux macros). */
export const DICE_ROLL_SHORTCUTS: readonly (ShortcutDescriptor & { faces: number })[] =
  DICE_FACES.map((faces) => ({
    id: `dice.roll.d${faces}`,
    label: `Lancer 1d${faces}`,
    scope: 'dice',
    defaultBinding: null,
    late: true,
    faces,
  }));

export const NOTES_SHORTCUTS = {
  create: {
    id: 'notes.create',
    label: 'Nouvelle note',
    scope: 'notes',
    defaultBinding: 'KeyN',
    late: true,
  },
  createAnywhere: {
    id: 'notes.create-anywhere',
    label: 'Nouvelle note, même en écrivant',
    scope: 'notes',
    defaultBinding: 'Mod+Alt+KeyN',
    late: true,
    inInput: true,
  },
  search: {
    id: 'notes.search',
    label: 'Chercher dans les notes',
    scope: 'notes',
    defaultBinding: 'Char:/',
    late: true,
  },
} satisfies Record<string, ShortcutDescriptor>;

/** Gestes standards, affichés dans l'éditeur, non modifiables. */
export const FIXED_SHORTCUTS: readonly ShortcutDescriptor[] = [
  { id: 'fixed.undo', label: 'Annuler', scope: 'map', defaultBinding: 'Mod+KeyZ', fixed: true },
  {
    id: 'fixed.redo',
    label: 'Refaire',
    scope: 'map',
    defaultBinding: 'Mod+Shift+KeyZ',
    fixed: true,
  },
  { id: 'fixed.redo-alt', label: 'Refaire', scope: 'map', defaultBinding: 'Mod+KeyY', fixed: true },
  {
    id: 'fixed.duplicate',
    label: 'Dupliquer la sélection',
    scope: 'map',
    defaultBinding: 'Mod+KeyD',
    fixed: true,
  },
  {
    id: 'fixed.delete',
    label: 'Supprimer la sélection',
    scope: 'map',
    defaultBinding: 'Delete',
    fixed: true,
  },
  {
    id: 'fixed.rotate',
    label: 'Tourner la sélection (⇧ : dans l’autre sens)',
    scope: 'map',
    defaultBinding: 'KeyR',
    fixed: true,
    roles: ['gm', 'player'],
  },
  {
    id: 'fixed.nudge',
    label: 'Déplacer la sélection (⇧ : 5 cases)',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: '↑ ↓ ← →',
    fixed: true,
  },
  {
    id: 'fixed.arrange',
    label: 'Ordre de la sélection (⇧ : tout devant, derrière ; ⌥ : calque)',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: '⌘↑ ⌘↓',
    fixed: true,
  },
  {
    id: 'fixed.pan',
    label: 'Déplacer la vue (maintenir et glisser)',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: 'Espace',
    fixed: true,
  },
  {
    id: 'fixed.waypoint',
    label: 'Point de passage pendant le glisser d’un token (⌫ : retirer le dernier)',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: 'Espace',
    fixed: true,
    roles: ['gm', 'player'],
  },
  {
    id: 'fixed.tool-modes',
    label: 'Mode de l’outil actif',
    scope: 'map',
    defaultBinding: null,
    fixedLabel: '1 à 9',
    fixed: true,
  },
  {
    id: 'fixed.escape',
    label: 'Annuler le geste, fermer, revenir à la sélection',
    scope: 'map',
    defaultBinding: 'Escape',
    fixed: true,
  },
  {
    id: 'fixed.save-note',
    label: 'Enregistrer la note',
    scope: 'notes',
    defaultBinding: 'Mod+KeyS',
    fixed: true,
  },
];
