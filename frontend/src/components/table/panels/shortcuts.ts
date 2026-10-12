/**
 * Raccourcis de la table (docs/raccourcis.md) : une commande par fonction (sa touche par défaut
 * vient de son manifeste, `features/<id>/index.ts`), la note rapide et Échap.
 */
import type { ShortcutDescriptor } from '@/lib/shortcuts/registry';
import { tableFeatures } from '../features';
import type { FeatureId, PanelId, TableFeatureItem } from './registry';

/** Identifiant de commande : `table.panel.<id>` (panneau) ou `table.action.<id>` (action). */
export const panelShortcutId = (id: string) => `table.panel.${id}`;
const actionShortcutId = (id: string) => `table.action.${id}`;

export const featureShortcut = (f: TableFeatureItem): ShortcutDescriptor => ({
  id: f.kind === 'panel' ? panelShortcutId(f.id) : actionShortcutId(f.id),
  label: (t) =>
    f.kind === 'panel'
      ? t('shortcuts.commands.panel', { panel: t(`table.panels.${f.id}.label`) })
      : t(`table.panels.${f.id}.label`),
  scope: 'table',
  defaultBinding: f.shortcut?.code ?? null,
  roles: f.roles,
});

const BY_FEATURE = new Map<string, ShortcutDescriptor>(
  tableFeatures.map((f: TableFeatureItem) => [f.id, featureShortcut(f)]),
);

/** Commande d'une fonction (panneau ou action). */
export const shortcutOfFeature = (id: FeatureId) => BY_FEATURE.get(id)!;

/** Commande d'un panneau. */
export const shortcutOfPanel = (id: PanelId) => BY_FEATURE.get(id)!;

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

export const TABLE_PANEL_SHORTCUTS: readonly ShortcutDescriptor[] = [...BY_FEATURE.values()];
