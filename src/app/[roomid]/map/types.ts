export type ViewMode = 'world' | 'city';

export type Point = { x: number; y: number };

export type Character = {
    niveau: number;
    id: string;
    name: string;
    x: number;
    y: number;
    image: HTMLImageElement;
    imageUrl: string;
    visibility: 'visible' | 'hidden' | 'ally';
    visibilityRadius: number;
    type: string;
    PV: number;
    PV_Max?: number;
    Defense: number;
    Contact: number;
    Distance: number;
    Magie: number;
    INIT: number;
    FOR: number;
    DEX: number;
    CON: number;
    SAG: number;
    INT: number;
    CHA: number;
    conditions?: string[];
    Actions?: Array<{
        Nom: string;
        Description: string;
        Toucher: number;
    }>;
};

export type MapText = {
    id: string;
    text: string;
    x: number;
    y: number;
    color: string;
    fontSize?: number;
    fontFamily?: string;
};

export type SavedDrawing = {
    id: string;
    points: Point[];
    color: string;
    width: number;
    type?: 'pen' | 'line' | 'rectangle' | 'circle';
};

export type NewCharacter = {
    niveau: number;
    name: string;
    image: { src: string } | null;
    visibility: 'visible' | 'hidden' | 'ally';
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
    Actions?: Array<{
        Nom: string;
        Description: string;
        Toucher: number;
    }>;
};

export type MapObject = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    imageUrl: string;
    cityId: string | null;
    image?: HTMLImageElement; // Preloaded image for rendering
    isAnimated?: boolean;
};

export type ObjectTemplate = {
    id: string;
    name: string;
    imageUrl: string;
    width?: number; // Default width
    height?: number; // Default height
    category?: string;
    isAnimated?: boolean;
};

export type Note = {
    text?: string;
    id?: string;
    color?: string;
    fontSize?: number;
    fontFamily?: string;
};

export type DrawingTool = 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle';

export type DrawingMode = 'drawing' | 'view';

export type LayerType = 'background' | 'grid' | 'drawings' | 'objects' | 'characters' | 'fog' | 'notes' | 'obstacles' | 'music';

export interface Layer {
    id: LayerType;
    label: string;
    isVisible: boolean;
    order: number;
}

export type MusicZone = {
    id: string;
    x: number;
    y: number;
    radius: number;
    url: string;
    name: string;
    volume: number;
    cityId: string | null;
};
