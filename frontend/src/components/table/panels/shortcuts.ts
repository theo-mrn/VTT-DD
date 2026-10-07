/**
 * Raccourcis de la table (docs/raccourcis.md) : une commande par panneau (sa touche par défaut
 * vient du registre des panneaux), la note rapide et Échap.
 */
import type { ShortcutDescriptor } from '@/lib/shortcuts/registry';
import { panelRegistry, type PanelId, type TablePanel } from './registry';

export const panelShortcutId = (id: string) => `table.panel.${id}`;

export const panelShortcut = (p: TablePanel): ShortcutDescriptor => ({
  id: panelShortcutId(p.id),
  label: (t) => t('shortcuts.commands.panel', { panel: t(`table.panels.${p.id}.label`) }),
  scope: 'table',
  defaultBinding: p.shortcut?.code ?? null,
  roles: p.roles,
});

const BY_PANEL = new Map<string, ShortcutDescriptor>(
  panelRegistry.map((p) => [p.id, panelShortcut(p)]),
);

/** Commande d'un panneau. */
export const shortcutOfPanel = (id: PanelId) => BY_PANEL.get(id)!;

export const TABLE_SHORTCUTS = {
  quickNote: {
    id: 'table.quick-note',
    label: 'shortcuts.commands.quickNote',
    scope: 'table',
    defaultBinding: 'Shift+KeyN',
  },
  closePanel: {
    id: 'table.close-panel',
    label: 'shortcuts.commands.closePanel',
    scope: 'table',
    defaultBinding: 'Escape',
    fixed: true,
  },
} satisfies Record<string, ShortcutDescriptor>;

export const TABLE_PANEL_SHORTCUTS: readonly ShortcutDescriptor[] = [...BY_PANEL.values()];
