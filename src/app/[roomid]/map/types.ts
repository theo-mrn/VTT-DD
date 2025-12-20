export type ViewMode = 'world' | 'city';

export type Point = { x: number; y: number };

export type Character = {
    niveau: number;
    id: string;
    name: string;
    x: number;
    y: number;
    image: HTMLImageElement;
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
