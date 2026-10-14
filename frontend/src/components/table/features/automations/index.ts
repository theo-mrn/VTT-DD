import { Workflow } from 'lucide-react';
import { lazy } from 'react';
import type { PanelFeature } from '../types';

/**
 * Automatismes (MJ, docs/automatismes.md) : réglages complets (son, météo, écran, temps du
 * monde) lancés d'un clic, et règles « quand / si / alors ». Déclencheurs et règles sont
 * exécutés par le service campaign, même table fermée.
 */
export const automationsFeature = {
  kind: 'panel',
  id: 'automations',
  icon: Workflow,
  width: 'medium',
  mode: 'side',
  roles: ['gm'],
  extra: true,
  component: lazy(() =>
    import('./ui/automations-panel').then((m) => ({ default: m.AutomationsPanel })),
  ),
} as const satisfies PanelFeature;
