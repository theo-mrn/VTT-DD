import {
  Crown,
  Dices,
  History,
  NotebookPen,
  ScrollText,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Registre des panneaux de la table : la seule liste de ce qui s'ouvre par-dessus la carte.
 * Le rail, le dock, les raccourcis, l'URL et l'hôte des panneaux s'en déduisent ; ajouter un
 * panneau, c'est ajouter une entrée ici. Chaque panneau est chargé à la première ouverture,
 * puis reste monté (brouillons, listes chargées, position de défilement).
 */

/** Rôle d'un membre à la table. */
export type TableRole = 'gm' | 'player' | 'spectator';

/** Largeur d'un panneau latéral sur grand écran (plein écran sur mobile). */
export type PanelWidth = 'compact' | 'narrow' | 'medium' | 'wide' | 'full';

/**
 * `side` : ancré à gauche, contre le rail, la carte reste utilisable à côté.
 * `centered` : fenêtre modale au centre (focus piégé, voile sur la carte).
 * `floating` : carte flottante contre le rail, haute comme son contenu (défilement interne
 * au-delà de l'écran) ; la carte de jeu reste visible et cliquable autour.
 */
export type PanelMode = 'side' | 'centered' | 'floating';

export interface PanelShortcut {
  /** `KeyboardEvent.code`, indépendant de la disposition du clavier. */
  code: string;
  /** Touche affichée et annoncée (`aria-keyshortcuts`). */
  label: string;
}

export interface PanelDefinition {
  id: string;
  label: string;
  /** Phrase courte des infobulles et de la personnalisation du rail. */
  description: string;
  icon: LucideIcon;
  shortcut: PanelShortcut;
  width: PanelWidth;
  mode: PanelMode;
  /** Rôles qui voient ce panneau. */
  roles: readonly TableRole[];
  /**
   * Événements temps réel (`dice.rolled`, `note.*`) qui signalent du nouveau dans ce panneau
   * quand il est fermé : pastille de non-lus sur le rail. Ceux de l'utilisateur ne comptent pas.
   */
  activity?: readonly string[];
  component: LazyExoticComponent<ComponentType>;
}

const ALL_ROLES = ['gm', 'player', 'spectator'] as const;

export const panelRegistry = [
  {
    id: 'fiche',
    label: 'Ma fiche',
    description: 'La fiche de mon héros, modifiable en direct',
    icon: ScrollText,
    shortcut: { code: 'KeyF', label: 'F' },
    width: 'full',
    mode: 'side',
    roles: ['gm', 'player'],
    component: lazy(() => import('../onglets/fiche').then((m) => ({ default: m.OngletFiche }))),
  },
  {
    id: 'des',
    label: 'Dés',
    description: 'Lancer les dés et suivre les jets de la table',
    icon: Dices,
    shortcut: { code: 'KeyD', label: 'D' },
    width: 'compact',
    mode: 'floating',
    roles: ALL_ROLES,
    activity: ['dice.rolled'],
    component: lazy(() => import('../onglets/des').then((m) => ({ default: m.OngletDes }))),
  },
  {
    id: 'notes',
    label: 'Notes',
    description: 'Les notes de la campagne',
    icon: NotebookPen,
    shortcut: { code: 'KeyN', label: 'N' },
    width: 'full',
    mode: 'side',
    roles: ALL_ROLES,
    activity: ['note.created'],
    component: lazy(() => import('../onglets/notes').then((m) => ({ default: m.OngletNotes }))),
  },
  {
    id: 'joueurs',
    label: 'Joueurs',
    description: 'Les membres de la table et leurs héros',
    icon: Users,
    shortcut: { code: 'KeyJ', label: 'J' },
    width: 'full',
    mode: 'side',
    roles: ALL_ROLES,
    component: lazy(() =>
      import('../onglets/joueurs').then((m) => ({ default: m.PanneauJoueurs })),
    ),
  },
  {
    id: 'historique',
    label: 'Historique',
    description: 'La chronique de la campagne, en direct',
    icon: History,
    shortcut: { code: 'KeyH', label: 'H' },
    width: 'narrow',
    mode: 'side',
    roles: ALL_ROLES,
    component: lazy(() =>
      import('../onglets/historique').then((m) => ({ default: m.OngletHistorique })),
    ),
  },
  {
    id: 'mj',
    label: 'MJ',
    description: 'Les héros de la table d’un coup d’œil',
    icon: Crown,
    shortcut: { code: 'KeyM', label: 'M' },
    width: 'full',
    mode: 'side',
    roles: ['gm'],
    component: lazy(() => import('../onglets/mj').then((m) => ({ default: m.OngletMj }))),
  },
] as const satisfies readonly PanelDefinition[];

export type PanelId = (typeof panelRegistry)[number]['id'];

/** Un panneau du registre, identifiant typé. */
export type TablePanel = PanelDefinition & { id: PanelId };

const BY_ID = new Map<string, TablePanel>(panelRegistry.map((p) => [p.id, p]));

export function isPanelId(value: string | null | undefined): value is PanelId {
  return value != null && BY_ID.has(value);
}

export function panelById(id: PanelId): TablePanel {
  return BY_ID.get(id)!;
}

/** Panneaux de ce rôle, dans l'ordre du registre. */
export function panelsFor(role: TableRole): TablePanel[] {
  return [...BY_ID.values()].filter((p) => p.roles.includes(role));
}

/**
 * Paramètres d'adresse de la table : le panneau ouvert et l'état profond de certains panneaux,
 * pour les liens directs (`?panneau=notes&note=…`, `?panneau=joueurs&personnage=…`).
 */
export const TABLE_PARAMS = {
  panel: 'panneau',
  note: 'note',
  newNote: 'nouvelle',
  character: 'personnage',
} as const;
