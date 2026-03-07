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
  toolbarItems?: ToolbarItemContribution[];
  contextMenuItems?: ContextMenuContribution[];
  characterWidgets?: CharacterWidgetContribution[];
  conditions?: ConditionContribution[];
  settings?: ModuleSettingDefinition[];
}

// ─── UI Contributions ───────────────────────────────────────────────

export interface SidebarTabContribution {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  component: ComponentType;
  order?: number;
  mjOnly?: boolean;
  width?: string;
  persistent?: boolean;
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
