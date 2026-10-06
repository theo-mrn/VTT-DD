/**
 * Raccourcis clavier de l'utilisateur (docs/raccourcis.md § 4) : les écarts aux touches par
 * défaut et les raccourcis créés, propres au compte. Les touches ne sont validées que dans leur
 * forme ici ; le site relit tout avec ses règles (une touche inconnue est ignorée).
 */
import { z } from 'zod';

/** Identifiant d'une commande (`table.panel.chat`, `map.tool.draw`, `custom.<id>`). */
const CommandId = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9:._-]*$/i);

/** Une touche ou une séquence (`Mod+Shift+KeyK`, `Space Enter`), ou null : « Aucune ». */
const Binding = z.string().min(1).max(64).nullable();

export const SHORTCUTS_MAX_BINDINGS = 300;
export const SHORTCUTS_MAX_CUSTOM = 50;

export const UserShortcut = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/i),
  kind: z.literal('roll'),
  label: z.string().trim().min(1).max(60),
  formula: z.string().trim().min(1).max(200),
  binding: Binding,
});
export type UserShortcut = z.infer<typeof UserShortcut>;

const fields = {
  bindings: z
    .record(CommandId, Binding)
    .refine((b) => Object.keys(b).length <= SHORTCUTS_MAX_BINDINGS, 'Trop de raccourcis'),
  custom: z.array(UserShortcut).max(SHORTCUTS_MAX_CUSTOM),
};

/** Sans ligne : `{ bindings: {}, custom: [], version: 0 }`. */
export const ShortcutPreferences = z.object({
  ...fields,
  version: z.number().int().nonnegative(),
});
export type ShortcutPreferences = z.infer<typeof ShortcutPreferences>;

/** Corps du PUT : les préférences entières ; `version` lue, pour refuser une écriture concurrente. */
export const ShortcutPreferencesUpdate = z.object({
  ...fields,
  version: z.number().int().nonnegative().optional(),
});
export type ShortcutPreferencesUpdate = z.infer<typeof ShortcutPreferencesUpdate>;

export const DEFAULT_SHORTCUT_PREFERENCES: ShortcutPreferences = {
  bindings: {},
  custom: [],
  version: 0,
};
