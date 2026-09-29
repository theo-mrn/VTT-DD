import {
  Crown,
  Dices,
  History,
  Library,
  MapPinned,
  MessagesSquare,
  Music,
  NotebookPen,
  ScrollText,
  Settings2,
  Users,
  Volume2,
  type LucideIcon,
  Skull,
} from 'lucide-react';
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isChatEventForMe } from '@/lib/campaign-chat';
import type { RealtimeEnvelope } from '@/lib/realtime';

/**
 * Registre des panneaux de la table : la seule liste de ce qui s'ouvre par-dessus la carte.
 * Le rail, le dock, les raccourcis, l'URL et l'hôte des panneaux s'en déduisent ; ajouter un
 * panneau, c'est ajouter une entrée ici. Chaque panneau est chargé à la première ouverture,
 * puis reste monté (brouillons, listes chargées, position de défilement).
 */

/** Rôle d'un membre à la table. */
export type TableRole = 'gm' | 'player' | 'spectator';

/** Largeur d'un panneau latéral sur grand écran (plein écran sur mobile). */
export type PanelWidth = 'compact' | 'fit' | 'narrow' | 'medium' | 'wide' | 'full';

/**
 * `side` : ancré à gauche, contre le rail, la carte reste utilisable à côté.
 * `centered` : fenêtre modale au centre (focus piégé, voile sur la carte).
 * `floating` : carte flottante contre le rail, haute comme son contenu (défilement interne
 * au-delà de l'écran) ; la carte de jeu reste visible et cliquable autour.
 */
export type PanelMode = 'side' | 'centered' | 'floating';

export interface PanelShortcut {
  /** Code de raccourci (`shortcutCode` : `KeyX` pour la lettre tapée, AZERTY comme QWERTY). */
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
  /**
   * Filtre du domaine sur ces événements : ceux qui ne me concernent pas (un chuchotement entre
   * joueurs, dont le MJ reçoit l'id sans pouvoir le lire) ne comptent pas.
   */
  activityFilter?: (event: RealtimeEnvelope, viewer: { userId: string; gm: boolean }) => boolean;
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
    width: 'fit',
    mode: 'floating',
    roles: ALL_ROLES,
    activity: ['dice.rolled'],
    component: lazy(() => import('../onglets/des').then((m) => ({ default: m.OngletDes }))),
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Discuter avec la table, ou chuchoter à un joueur ou au MJ',
    icon: MessagesSquare,
    shortcut: { code: 'KeyC', label: 'C' },
    width: 'narrow',
    mode: 'side',
    roles: ALL_ROLES,
    activity: ['campaign.message_posted'],
    activityFilter: isChatEventForMe,
    component: lazy(() => import('../onglets/chat').then((m) => ({ default: m.ChatPanel }))),
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
    label: 'Personnages',
    description: 'Les personnages de la table, d’une fiche à l’autre en un clic',
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
    id: 'son',
    label: 'Son',
    description: 'Musique, ambiance et effets de la table, bibliothèque du MJ',
    icon: Music,
    // S comme son (Q, l'ancien raccourci du mixeur, reste libre)
    shortcut: { code: 'KeyS', label: 'S' },
    width: 'medium',
    mode: 'side',
    // Le son se pilote par le MJ seul ; les autres n'ont que leur volume (panneau « Volume »)
    roles: ['gm'],
    component: lazy(() => import('../onglets/son').then((m) => ({ default: m.OngletSon }))),
  },
  {
    id: 'volume',
    label: 'Volume',
    description: 'Mon volume : musique, ambiance, effets, dés, pour moi seul',
    icon: Volume2,
    // Même touche que « Son » pour le MJ : chacun ouvre son réglage du son avec S
    shortcut: { code: 'KeyS', label: 'S' },
    width: 'compact',
    mode: 'floating',
    roles: ['player', 'spectator'],
    component: lazy(() => import('../onglets/volume').then((m) => ({ default: m.OngletVolume }))),
  },
  {
    id: 'resources',
    label: 'Ressources',
    description: 'Capacités, marché, bestiaire et images du système de la campagne',
    icon: Library,
    // R relance le dernier jet dans le panneau Dés : B comme bibliothèque
    shortcut: { code: 'KeyB', label: 'B' },
    width: 'full',
    mode: 'side',
    roles: ALL_ROLES,
    component: lazy(() =>
      import('../onglets/resources').then((m) => ({ default: m.OngletResources })),
    ),
  },
  {
    id: 'pnj',
    label: 'Mes PNJ',
    description: 'Vos modèles de PNJ, rangés par catégories, à poser sur la carte',
    icon: Skull,
    shortcut: { code: 'KeyU', label: 'U' },
    width: 'wide',
    mode: 'side',
    roles: ['gm'],
    component: lazy(() => import('../onglets/pnj').then((m) => ({ default: m.OngletPnj }))),
  },
  {
    id: 'scenes',
    label: 'Scènes',
    description: 'Les scènes de la campagne : ouvrir, faire venir le groupe, fonds et dossiers',
    icon: MapPinned,
    // E comme scènE : ni un panneau (F D C N J H S B M O) ni un outil de la carte (V P T W G L R K)
    shortcut: { code: 'KeyE', label: 'E' },
    width: 'narrow',
    mode: 'side',
    roles: ['gm'],
    component: lazy(() =>
      import('../../map/scenes/scenes-panel').then((m) => ({ default: m.ScenesPanel })),
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
  {
    id: 'reglages',
    label: 'Réglages',
    description: 'Réglages de la campagne : règles optionnelles, lanceur, présentation',
    icon: Settings2,
    shortcut: { code: 'KeyO', label: 'O' },
    width: 'medium',
    mode: 'side',
    roles: ['gm'],
    component: lazy(() =>
      import('../onglets/reglages').then((m) => ({ default: m.OngletReglages })),
    ),
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
