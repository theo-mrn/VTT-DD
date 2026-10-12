import { ShieldAlert } from 'lucide-react';
import { lazy } from 'react';
import { ALL_ROLES, type PanelFeature } from '../types';

/**
 * Sécurité : carte X (le MJ est prévenu, sans savoir par qui) et lignes et voiles de la
 * campagne, lisibles de tous (`state.ts`).
 */
export const safetyFeature = {
  kind: 'panel',
  id: 'safety',
  icon: ShieldAlert,
  width: 'narrow',
  mode: 'side',
  roles: ALL_ROLES,
  extra: true,
  component: lazy(() => import('./ui/safety-panel').then((m) => ({ default: m.SafetyPanel }))),
  overlay: lazy(() => import('./ui/safety-overlay').then((m) => ({ default: m.SafetyOverlay }))),
} as const satisfies PanelFeature;
