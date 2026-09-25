import { ReactNode, ComponentType } from 'react';

// ─── Module Identity ────────────────────────────────────────────────

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  type: 'game-system' | 'feature' | 'content';
  dependencies?: string[];
  coreVersion?: string;
  requiresMJ?: boolean;
  defaultEnabled?: boolean;
}

// ─── Module Lifecycle ───────────────────────────────────────────────

export interface ModuleDefinition {
  manifest: ModuleManifest;

  // Lifecycle hooks
  onRegister?: (api: ModuleAPI) => void | Promise<void>;
  onActivate?: (api: ModuleAPI) => void | Promise<void>;
  onDeactivate?: (api: ModuleAPI) => void | Promise<void>;
  onRoomJoin?: (api: ModuleAPI, roomId: string) => void | Promise<void>;

  // Declarative contributions
  contributions?: ModuleContributions;

  /** @internal — true for modules loaded from external URLs */
  __external?: boolean;
}

// ─── Declarative Contributions ──────────────────────────────────────

export interface ModuleContributions {
  sidebarTabs?: SidebarTabContribution[];
  sidebarActions?: SidebarActionContribution[];
  toolbarItems?: ToolbarItemContribution[];
  contextMenuItems?: ContextMenuContribution[];
  characterWidgets?: CharacterWidgetContribution[];
  conditions?: ConditionContribution[];
  settings?: ModuleSettingDefinition[];
  creationTabs?: CreationTabContribution[];
  searchDrawerTabs?: SearchDrawerTabContribution[];
  interactionGames?: InteractionGameContribution[];
}

// ─── Interaction game contributions ─────────────────────────────────
// Un module/bundle peut fournir un MINI-JEU d'interaction complet (ex la table de sabacc du bundle
// Star Wars) : il apparaît dans le dialogue "Ajouter une interaction" du MJ, et l'interaction créée
// porte gameType = contribution.id — InteractionLayer rend alors le composant fourni à l'ouverture.

/** Props passées par InteractionLayer au composant de jeu contribué. Le composant gère lui-même son
 *  état partagé (ex api.sharedState pour un script de bundle, clé dérivée d'interactionId). */
export interface InteractionGameProps {
  isOpen: boolean;
  onClose: () => void;
  /** Id de l'interaction (stable) — sert de clé d'état partagé pour la table de jeu. */
  interactionId: string;
  interactionName: string;
  /** Nom du PNJ/objet hôte de l'interaction. */
  hostName: string;
  roomId: string;
  /** persoId du joueur courant — undefined pour un MJ sans personnage incarné. */
  currentPlayerId?: string;
  currentPlayerName?: string;
  isMJ: boolean;
}

export interface InteractionGameContribution {
  /** Valeur de GameInteraction.gameType créée par le dialogue (ex 'sabacc') — unique par jeu. */
  id: string;
  /** Nom affiché dans le dialogue "Ajouter une interaction" (ex "Table de Sabacc"). */
  label: string;
  /** Sous-titre du bouton du dialogue. */
  description?: string;
  component: ComponentType<InteractionGameProps>;
}

// ─── UI Contributions ───────────────────────────────────────────────

export interface SidebarTabContribution {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  component: ComponentType;
  order?: number;
  mjOnly?: boolean;
  /** Classes Tailwind de largeur du panneau (ex 'w-full sm:w-[700px]') — PAS une valeur CSS brute. */
  width?: string;
  persistent?: boolean;
  /** Panneau flottant compact : dimensionné par son contenu au lieu d'occuper toute la colonne —
   *  la carte reste interactive autour (ex un radar posé par-dessus la carte). */
  floating?: boolean;
  /** Point d'ancrage du panneau flottant (floating uniquement) — 'left' (défaut, ancré au rail
   *  sidebar) ou 'bottom-right' (coin bas-droit de l'écran, ex un gabarit de ciblage qu'on veut
   *  garder visible sans masquer le centre de la carte). Ignoré si floating n'est pas true. */
  dock?: 'left' | 'bottom-right';
}

/** Un état d'un bouton d'action cyclique (ex vision normale ↔ vision verte) — le clic avance à
 *  l'état suivant, dont l'icône/label habillent le bouton. */
export interface SidebarActionState {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** URL d'image (ex asset d'un bundle réécrit en URL R2) affichée à la place d'une icône lucide. */
  iconUrl?: string;
}

/** Un bouton sidebar à comportement libre, contribué par un module ou un bundle de règles —
 *  contrairement à CustomActionDef (liste fermée d'actions natives), le comportement vit dans la
 *  closure onClick du contributeur, sans passer par ShortcutsContext.triggerAction. */
export interface SidebarActionContribution {
  id: string;
  label: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  iconUrl?: string;
  mjOnly?: boolean;
  /** Bouton cyclique : le clic avance à l'état suivant (bouclé), passé à onClick. Absent = bouton
   *  simple (onClick sans état). */
  states?: SidebarActionState[];
  /** state = état ATTEINT après le clic (undefined pour un bouton simple). */
  onClick: (state?: SidebarActionState) => void;
}

export interface ToolbarItemContribution {
  id: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  group?: string;
  mjOnly?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
}

export interface ContextMenuContribution {
  target: 'map' | 'character' | 'object';
  items: ContextMenuItemContribution[];
}

export interface ContextMenuItemContribution {
  id: string;
  label: string | ((context: Record<string, unknown>) => string);
  icon: ReactNode;
  onClick: (context: Record<string, unknown>) => void;
  condition?: (context: Record<string, unknown>) => boolean;
}

export interface CharacterWidgetContribution {
  id: string;
  label: string;
  component: ComponentType<{ characterId: string; roomId: string }>;
  defaultLayout: { w: number; h: number; minW: number; minH: number };
}

/** Onglet supplémentaire du flux de création de personnage (/creation), contribué par un module ou
 *  un bundle de règles — n'existe que pour les salles dont le système enregistre la contribution.
 *  Le composant reçoit un BROUILLON générique de champs additionnels du futur doc personnage :
 *  setDraft merge un partiel ({ MonChamp: valeur }), et la page fusionne tout le brouillon dans le
 *  document au moment de la sauvegarde — la page ne connaît aucun champ par son nom.
 *  Clés réservées (préfixe '__', signaux pour la page, jamais persistées) :
 *  - __creationXpBonus (number) : XP de création SUPPLÉMENTAIRE accordé par cet onglet (ex chaque
 *    point d'Obligation EotE rapporte 1 XP), ajouté au startingXp du système. Les onglets de bundle
 *    sont insérés juste après "Informations", avant les étapes qui dépensent cet XP. */
export interface CreationTabContribution {
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  component: ComponentType<{ draft: Record<string, unknown>; setDraft: (partial: Record<string, unknown>) => void }>;
}

/** Onglet supplémentaire du drawer "Recherche unifiée" de la carte (ajout de PNJ/objets/sons par
 *  drag-and-drop) — contribué par un module ou un bundle de règles pour ses propres éléments
 *  déposables sur la carte (ex vaisseaux d'un système Star Wars). MJ uniquement : ce drawer entier
 *  n'est proposé qu'au MJ (cf UnifiedSearchDrawer, prop isMJ côté page). Le composant gère lui-même
 *  son drag-and-drop (draggable + e.dataTransfer.setData('application/json', ...)) — le format
 *  attendu par handleCanvasDrop (useDragAndDrop.ts) dépend du `type` posé dans ce JSON, ex
 *  'group_entity_template' pour référencer un doc Salle/{roomId}/groupEntities existant. */
export interface SearchDrawerTabContribution {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  component: ComponentType;
}

export interface ConditionContribution {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  color: string;
}

export interface ModuleSettingDefinition {
  id: string;
  label: string;
  type: 'boolean' | 'number' | 'string' | 'select';
  defaultValue: unknown;
  options?: Array<{ label: string; value: unknown }>;
  scope: 'global' | 'room' | 'character';
}

// ─── Event System ───────────────────────────────────────────────────

export type GameEvent =
  | { type: 'dice:roll'; payload: { userId: string; diceCount: number; diceFaces: number; results: number[]; total: number; modifier: number } }
  | { type: 'dice:critical_success'; payload: { userId: string; result: number } }
  | { type: 'dice:critical_fail'; payload: { userId: string; result: number } }
  | { type: 'combat:start'; payload: { combatants: string[] } }
  | { type: 'combat:turn_change'; payload: { previousId: string; currentId: string; round: number } }
  | { type: 'combat:end'; payload: { winnerId?: string } }
  | { type: 'combat:damage'; payload: { attackerId: string; targetId: string; amount: number; damageType?: string } }
  | { type: 'character:update'; payload: { characterId: string; changes: Record<string, unknown> } }
  | { type: 'character:condition_add'; payload: { characterId: string; conditionId: string } }
  | { type: 'character:condition_remove'; payload: { characterId: string; conditionId: string } }
  | { type: 'character:hp_change'; payload: { characterId: string; oldHp: number; newHp: number; maxHp: number } }
  | { type: 'chat:message'; payload: { userId: string; text: string } }
  | { type: 'module:custom'; payload: { moduleId: string; eventId: string; data: unknown } };

// ─── External Module Management ─────────────────────────────────────

export interface InstalledModule {
  /** URL of the external module script */
  url: string;
  /** Module ID (filled after successful load) */
  moduleId?: string;
  /** Display name (filled after load, or user-provided) */
  name?: string;
  /** Who installed this module */
  addedBy: string;
  /** Timestamp */
  addedAt: number;
  /** Whether this module should be loaded */
  enabled: boolean;
}

// ─── Module API ─────────────────────────────────────────────────────

export interface ModuleAPI {
  moduleId: string;

  // Event bus
  on: <T extends GameEvent['type']>(
    eventType: T,
    handler: (payload: Extract<GameEvent, { type: T }>['payload']) => void
  ) => () => void;

  emit: (event: GameEvent) => void;

  // Data storage (per-room, persisted in RTDB)
  getData: <T = unknown>(key: string) => T | undefined;
  setData: (key: string, value: unknown) => Promise<void>;
  getCharacterData: <T = unknown>(characterId: string, key: string) => T | undefined;
  setCharacterData: (characterId: string, key: string, value: unknown) => Promise<void>;

  // Game state (read-only)
  getGameState: () => {
    isMJ: boolean;
    userId: string | null;
    roomId: string | null;
    persoId: string | null;
  };

  // Settings
  getSetting: <T = unknown>(settingId: string) => T;
  setSetting: (settingId: string, value: unknown) => Promise<void>;

  // UI
  showToast: (message: string, options?: { type?: 'success' | 'error' | 'info'; duration?: number }) => void;
}
