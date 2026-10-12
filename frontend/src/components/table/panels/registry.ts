import { tableFeatures } from '../features';
import type { PanelFeature, TableFeature, TableRole } from '../features/types';

export type {
  ActionFeature,
  PanelFeature,
  PanelMode,
  PanelShortcut,
  PanelWidth,
  TableActionContext,
  TableFeature,
  TableRole,
} from '../features/types';

/**
 * Registre des fonctions de la table, déduit de `features/index.ts` (une ligne par fonction) :
 * le rail, le dock, les raccourcis, l'URL, l'hôte des panneaux et les surcouches s'en déduisent.
 * Chaque panneau est chargé à la première ouverture, puis reste monté (brouillons, listes
 * chargées, position de défilement).
 */

/** Un panneau (ancien nom, gardé pour ses appelants). */
export type PanelDefinition = PanelFeature;

type Feature = (typeof tableFeatures)[number];

export type FeatureId = Feature['id'];

/** Panneaux de la table, dans l'ordre des fonctions. */
export const panelRegistry = tableFeatures.filter(
  (f): f is Extract<Feature, { kind: 'panel' }> => f.kind === 'panel',
);

export type PanelId = Extract<Feature, { kind: 'panel' }>['id'];

/** Un panneau du registre, identifiant typé. */
export type TablePanel = PanelDefinition & { id: PanelId };

const BY_ID = new Map<string, TablePanel>(panelRegistry.map((p) => [p.id, p]));

export function isPanelId(value: string | null | undefined): value is PanelId {
  return value != null && BY_ID.has(value);
}

/**
 * Identifiant de panneau lu dans une adresse ou une préférence ; null sinon (anciens panneaux
 * « MJ » et « Combat » compris : le combat se mène depuis la barre du MJ).
 */
export function resolvePanelId(value: string | null | undefined): PanelId | null {
  return isPanelId(value) ? value : null;
}

export function panelById(id: PanelId): TablePanel {
  return BY_ID.get(id)!;
}

/** Panneaux de ce rôle, dans l'ordre du registre. */
export function panelsFor(role: TableRole): TablePanel[] {
  return [...BY_ID.values()].filter((p) => p.roles.includes(role));
}

/** Une fonction de la table, identifiant typé. */
export type TableFeatureItem = TableFeature & { id: FeatureId };

const FEATURES = new Map<string, TableFeatureItem>(tableFeatures.map((f) => [f.id, f]));

export function resolveFeatureId(value: string | null | undefined): FeatureId | null {
  return value != null && FEATURES.has(value) ? (value as FeatureId) : null;
}

/** Fonctions de ce rôle (panneaux et actions), dans l'ordre de `features/index.ts`. */
export function featuresFor(role: TableRole): TableFeatureItem[] {
  return [...FEATURES.values()].filter((f) => f.roles.includes(role));
}

/**
 * Paramètres d'adresse de la table : le panneau ouvert et l'état profond de certains panneaux,
 * pour les liens directs (`?panneau=notes&note=…`, `?panneau=joueurs&personnage=…`,
 * `?panneau=chat&chuchoter=<userId>`).
 */
export const TABLE_PARAMS = {
  panel: 'panneau',
  note: 'note',
  newNote: 'nouvelle',
  character: 'personnage',
  /** Chat ouvert sur un chuchotement à ce membre (« Chuchoter » depuis Joueurs). */
  whisper: 'chuchoter',
  /** Scène ouverte par le MJ à la table (sinon celle du groupe). */
  scene: 'scene',
} as const;
