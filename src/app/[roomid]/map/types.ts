
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
    imageUrl?: string | { src: string };
    image?: string | { src: string };
    PV?: number;
    PV_Max?: number;
    visible?: boolean;
    niveau?: number;
    conditions?: string[];
    visibility?: 'public' | 'gm_only' | 'ally' | 'hidden' | 'visible' | 'custom';
    visibilityRadius?: number;

    visibleToPlayerIds?: string[];
    rotation?: number;
    size?: number;
    currentSceneId?: string | null;
    cityId?: string;
    stats?: {
        str: number;
        dex: number;
        con: number;
        int: number;
        wis: number;
        cha: number;
    };
    initiative?: number;
    Actions?: any[];
    Contactable?: boolean;
    Contact?: number;
    Defense?: number;
    Distance: number;
    Magie: number;
    INIT: number;
    nombre: number;
    FOR: number;
    DEX: number;
    CON: number;
    SAG: number;
    INT: number;
    CHA: number;
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
    visibility: 'hidden' | 'visible' | 'public' | 'gm_only' | 'custom' | 'ally';
    visibilityRadius?: number;
    PV: number;
    PV_Max?: number;
    Defense: number;
    Contact: number;
    Distance: number;
    Magie: number;
    INIT: number;
    nombre: number;
    FOR: number;
    DEX: number;
    CON: number;
    SAG: number;
    INT: number;
    CHA: number;
    Actions?: any[];
    type?: 'joueurs' | 'pnj' | 'monster';
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
    visibility?: 'visible' | 'hidden' | 'public' | 'gm_only' | 'custom';
    isBackground?: boolean;
    isLocked?: boolean;
    visibleToPlayerIds?: string[];
    cityId?: string | null;
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
}
