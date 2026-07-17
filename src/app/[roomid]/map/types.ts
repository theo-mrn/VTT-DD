
export type ViewMode = 'world' | 'city';

export interface Point {
    x: number;
    y: number;
}

export interface Character {
    id: string;
    type: 'joueurs' | 'pnj' | 'monster';
    name: string;
    x: number;
    y: number;
    scale?: number;
    shape?: 'circle' | 'square';
    imageUrl?: string | { src: string };
    image?: string | { src: string };
    visible?: boolean;
    niveau?: number;
    conditions?: string[];
    visibility?: 'public' | 'gm_only' | 'ally' | 'hidden' | 'visible' | 'custom' | 'invisible';
    visibilityRadius?: number;

    visibleToPlayerIds?: string[];
    rotation?: number;
    size?: number;
    currentSceneId?: string | null;
    cityId?: string;
    initiative?: number;
    Actions?: any[];
    Contactable?: boolean;
    nombre?: number;
    audio?: {
        url: string;
        radius: number;
        volume: number;
        loop?: boolean;
        name?: string;
    };
    interactions?: Interaction[];
    positions?: Record<string, { x: number; y: number }>;
    notes?: string;
    // Index signature additive : toutes les stats viennent du système actif (gameSystem.stats) — ex
    // PV/PV_Max/Defense/FOR/DEX/... pour dnd-classic, vigueur/Stress/... pour un système custom (Star
    // Wars). Jamais de clé nommée en dur ici — cf NewCharacter/NPC/BonusData/Character
    // (CharacterContext.tsx, sans lien avec celui-ci malgré le nom identique).
    [key: string]: unknown;
}

export type Interaction = VendorInteraction | GameInteraction | LootInteraction;

export interface VendorInteraction {
    id: string;
    type: 'vendor';
    name: string; // "Magasin", "Auberge", etc.
    description?: string; // 🆕 Customizable welcome message
    items: VendorItem[];
}

export interface GameInteraction {
    id: string;
    type: 'game';
    name: string; // "Jeux de dés", "Cartes", etc.
    description?: string;
    gameType?: 'dice' | 'cards' | 'custom'; // Type de jeu
}

export interface LootInteraction {
    id: string;
    type: 'loot';
    name: string; // "Coffre", "Cadavre", etc.
    description?: string;
    items: LootItem[];
    locked?: boolean;
    linkedId?: string; // For shared/synchronized containers
}

export interface LootItem {
    id: string;
    name: string;
    quantity: number;
    description?: string;
    image?: string;
    weight?: number;
    // Inventory compatibility fields
    category?: string;
    diceSelection?: string;
    visibility?: string;
    bonusTypes?: any;
    target?: string;
    range?: string;
    damage?: string;
}

export interface VendorItem {
    id: string;
    name: string;
    price: string | number;
    description?: string;
    image?: string;
}

export interface MapText {
    id: string;
    x: number;
    y: number;
    text: string;
    color: string;
    fontSize: number;
    fontFamily?: string;
    isVisible?: boolean;
}

export type DrawingTool = 'pen' | 'brush' | 'eraser' | 'line' | 'rectangle' | 'circle';

export interface SavedDrawing {
    id: string;
    points: Point[];
    color: string;
    width: number;
    type: DrawingTool;
    fill?: string;
    closed?: boolean;
    smooth?: boolean;
    cityId?: string | null;
}

export interface NewCharacter {
    name: string;
    image: string | { src: string } | null;
    niveau: number;
    visibility: 'hidden' | 'visible' | 'public' | 'gm_only' | 'custom' | 'ally' | 'invisible';
    visibilityRadius?: number;
    nombre: number;
    Actions?: any[];
    type?: 'joueurs' | 'pnj' | 'monster';
    imageURL?: string; // Standardized casing
    // Index signature additive : toutes les stats (PV/Defense/FOR/... pour dnd-classic, ou tout autre
    // jeu de clés pour un système custom) viennent de gameSystem.stats, jamais nommées en dur ici — même
    // pattern que BonusData/Character (CharacterContext.tsx). Les templates PNJ (personnages.tsx,
    // NPCCreationForm, NPCTemplateDrawer, CreatureLibraryModal) écrivent/lisent leurs stats dynamiquement
    // via cette signature.
    [key: string]: unknown;
}

export interface Note {
    id: string;
    x: number;
    y: number;
    text: string;
    title?: string;
    color?: string;
    authorId?: string;
    visibleToPlayers?: boolean;
}

export interface MapObject {
    id: string;
    x: number;
    y: number;
    width: number;
    name: string;
    height: number;
    rotation: number;
    imageUrl: string;
    image?: CanvasImageSource | null;
    type: 'decors' | 'weapon' | 'item';
    visible?: boolean;
    locked?: boolean;
    visibility?: 'visible' | 'hidden' | 'public' | 'gm_only' | 'custom' | 'invisible';
    isBackground?: boolean;
    isLocked?: boolean;
    visibleToPlayerIds?: string[];
    cityId?: string | null;
    notes?: string;
    items?: LootItem[]; // 🆕 For chest/container objects
    linkedId?: string; // 🆕 For shared inventories
}

export interface ObjectTemplate {
    id: string;
    name: string;
    imageUrl: string;
    category?: string;
    defaultWidth?: number;
    defaultHeight?: number;
}

export interface Layer {
    id: string;
    label: string;
    isVisible: boolean;
    order: number;
    type?: LayerType;
    locked?: boolean;
    opacity?: number;
    // New fields for fog
    grid?: Map<string, boolean>; // or similar
}

export type LayerType = 'background' | 'grid' | 'tokens' | 'objects' | 'drawings' | 'fog' | 'notes' | 'music' | 'background_audio' | 'obstacles' | 'characters';

export interface MusicZone {
    id: string;
    x: number;
    y: number;
    radius: number;
    trackId?: string;
    volume: number;
    name?: string;
    color?: string;
    url?: string | null;
    cityId?: string | null;
}

export interface Scene {
    id: string;
    name: string;
    description?: string;
    visibleToPlayers?: boolean;
    backgroundUrl?: string;
    groupId?: string;
    x?: number;
    y?: number;
    spawnX?: number;  // 🆕 Default spawn X coordinate for players
    spawnY?: number;  // 🆕 Default spawn Y coordinate for players
}

export interface LightSource {
    id: string;
    x: number;
    y: number;
    name: string;
    radius: number; // Visibility radius in meters/pixels
    visible: boolean;
    cityId?: string | null;
}



export interface Portal {
    id: string;
    x: number;
    y: number;
    radius: number;
    portalType: 'scene-change' | 'same-map';  // Type of portal behavior
    targetSceneId?: string;  // Optional - only required for scene-change portals
    targetX?: number;  // Target X coordinate (required for same-map, optional for scene-change)
    targetY?: number;  // Target Y coordinate (required for same-map, optional for scene-change)
    name: string;
    iconType?: 'stairs' | 'door' | 'portal' | 'ladder';
    visible?: boolean;
    color?: string;
    cityId?: string | null;
}
