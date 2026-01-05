"use client";

import React, { useState } from 'react';
import {
    Move,
    Grid,
    Layers,
    ImagePlus,
    ScanEye,
    User,
    Settings,
    CircleUserRound,
    Package,
    Baseline,
    Pencil,
    Ruler,
    Eye,
    Trash2,
    Lock,
    Unlock,
    ChevronUp,
    ChevronDown,
    Menu,
    Plus,
    Minus,
    MapPin,
    SquareDashedMousePointer,
    Volume2,
    Sliders
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@/components/ui/tooltip";

interface MapToolbarProps {
    isMJ: boolean;
    activeTools: string[]; // List of active tool IDs force-casted to string or just mapped strings
    onAction: (actionId: string) => void;
    currentViewMode?: 'mj' | 'player';
    showGrid: boolean;
    activeToolContent?: React.ReactNode;
    className?: string;
}

export const TOOLS = {
    // Map & View
    PAN: 'pan',
    GRID: 'grid',
    LAYERS: 'layers',
    BACKGROUND: 'background',
    VIEW_MODE: 'view_mode',
    SETTINGS: 'settings',
    ZOOM_IN: 'zoom_in',
    ZOOM_OUT: 'zoom_out',
    WORLD_MAP: 'world_map',

    // Content
    ADD_CHAR: 'add_char',
    ADD_OBJ: 'add_obj',
    ADD_NOTE: 'add_note',
    MUSIC: 'music',
    BACKGROUND_EDIT: 'background_edit',

    // Tools
    DRAW: 'draw',
    MEASURE: 'measure',
    VISIBILITY: 'visibility',
    CLEAR_DRAWINGS: 'clear_drawings',
    MULTI_SELECT: 'multi_select',
    AUDIO_MIXER: 'audio_mixer',
    TOGGLE_CHAR_BORDERS: 'toggle_char_borders',
};

export default function MapToolbar({
    isMJ,
    activeTools,
    onAction,
    currentViewMode = 'mj',
    showGrid,
    activeToolContent,
    className
}: MapToolbarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const ToolButton = ({
        id,
        icon: Icon,
        label,
        isActive = false,
        danger = false,
        onClick
    }: {
        id: string;
        icon: any;
        label: string;
        isActive?: boolean;
        danger?: boolean;
        onClick?: () => void;
    }) => (
        <TooltipProvider delayDuration={300}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="icon"
                        className={cn(
                            "h-10 w-10 transition-all duration-200",
                            isActive
                                ? "bg-[#c0a080] text-black hover:bg-[#d4b494]"
                                : "text-gray-400 hover:text-white hover:bg-white/10",
                            (danger && !isActive) ? "hover:text-red-400 hover:bg-red-900/20" : "",
                            "rounded-lg"
                        )}
                        onClick={onClick || (() => onAction(id))}
                    >
                        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black/90 border-[#333] text-white">
                    <p>{label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );

    return (
        <div className={cn(
            "fixed bottom-4 left-1/2 -translate-x-1/2 z-10 transition-all duration-300 ease-in-out",
            isCollapsed ? "translate-y-[calc(100%+24px)]" : "translate-y-0",
            className || ""
        )}>
            {/* Active Tool Content (Sub-Menu) */}
            {activeToolContent && (
                <div className="mb-2 animate-in slide-in-from-bottom-4 fade-in duration-300">
                    {activeToolContent}
                </div>
            )}

            {/* Main Toolbar Container */}
            <div className="flex flex-col items-center gap-2">

                {/* Expand Toggle (Visible when collapsed) */}
                <div
                    className={cn(
                        "absolute -top-12 left-1/2 -translate-x-1/2 transition-opacity duration-300",
                        isCollapsed ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                    )}
                >
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsCollapsed(false)}
                        className="rounded-full bg-black/80 border-[#c0a080]/50 text-[#c0a080] hover:bg-[#c0a080] hover:text-black shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                    >
                        <ChevronUp size={20} />
                    </Button>
                </div>

                {/* Toolbar Body */}
                <div className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a]/80 backdrop-blur-xl border border-[#333] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">


                    {/* --- GROUP 1: NAVIGATION (+, -, Pan, World) --- */}
                    <div className="flex items-center gap-1">
                        <ToolButton
                            id={TOOLS.ZOOM_IN}
                            icon={Plus}
                            label="Zoomer"
                            isActive={false}
                        />
                        <ToolButton
                            id={TOOLS.ZOOM_OUT}
                            icon={Minus}
                            label="Dézoomer"
                            isActive={false}
                        />
                        <ToolButton
                            id={TOOLS.PAN}
                            icon={Move}
                            label="Déplacer la carte"
                            isActive={activeTools.includes(TOOLS.PAN)}
                        />
                        {isMJ && (
                            <ToolButton
                                id={TOOLS.WORLD_MAP}
                                icon={MapPin}
                                label="Villes / Carte du Monde"
                                isActive={activeTools.includes(TOOLS.WORLD_MAP)}
                            />
                        )}
                    </div>

                    <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

                    {/* --- GROUP 2: CREATION (Draw, Text, Measure) --- */}
                    <div className="flex items-center gap-1">
                        <ToolButton
                            id={TOOLS.DRAW}
                            icon={Pencil}
                            label="Dessin"
                            isActive={activeTools.includes(TOOLS.DRAW)}
                        />
                        <ToolButton
                            id={TOOLS.ADD_NOTE}
                            icon={Baseline}
                            label="Ajouter une note"
                            isActive={activeTools.includes(TOOLS.ADD_NOTE)}
                        />
                        <ToolButton
                            id={TOOLS.MEASURE}
                            icon={Ruler}
                            label="Mesure"
                            isActive={activeTools.includes(TOOLS.MEASURE)}
                        />
                    </div>

                    <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />

                    {/* --- GROUP 3: MAP SETTINGS (Grid, Layers, Bg, ViewMode) --- */}
                    <div className="flex items-center gap-1">
                        <ToolButton
                            id={TOOLS.GRID}
                            icon={Grid}
                            label={showGrid ? "Masquer la grille" : "Afficher la grille"}
                            isActive={activeTools.includes(TOOLS.GRID)}
                        />
                        {isMJ && (
                            <ToolButton
                                id={TOOLS.LAYERS}
                                icon={Layers}
                                label="Gestion des calques"
                                isActive={activeTools.includes(TOOLS.LAYERS)}
                            />
                        )}
                        {isMJ && (
                            <>
                                <ToolButton
                                    id={TOOLS.BACKGROUND}
                                    icon={ImagePlus}
                                    label="Changer le fond"
                                    isActive={activeTools.includes(TOOLS.BACKGROUND)}
                                />
                                <ToolButton
                                    id={TOOLS.VIEW_MODE}
                                    icon={currentViewMode === 'player' ? ScanEye : User}
                                    label={currentViewMode === 'player' ? "Vue MJ" : "Vue Joueur"}
                                    isActive={activeTools.includes(TOOLS.VIEW_MODE)}
                                />
                            </>
                        )}
                    </div>

                    {/* --- GROUP 4: DM ENTITIES (Visibility, Obj, NPC, Music) --- */}
                    {isMJ && (
                        <>
                            <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />
                            <div className="flex items-center gap-1">
                                <ToolButton
                                    id={TOOLS.VISIBILITY}
                                    icon={Eye}
                                    label="Visibilité & Brouillard"
                                    isActive={activeTools.includes(TOOLS.VISIBILITY)}
                                />
                                <ToolButton
                                    id={TOOLS.ADD_OBJ}
                                    icon={Package}
                                    label="Objets"
                                    isActive={activeTools.includes(TOOLS.ADD_OBJ)}
                                />
                                <ToolButton
                                    id={TOOLS.ADD_CHAR}
                                    icon={CircleUserRound}
                                    label="Personnages (NPC)"
                                    isActive={activeTools.includes(TOOLS.ADD_CHAR)}
                                />
                                <ToolButton
                                    id={TOOLS.MULTI_SELECT}
                                    icon={SquareDashedMousePointer}
                                    label="Sélection Multiple"
                                    isActive={activeTools.includes(TOOLS.MULTI_SELECT)}
                                />
                                <ToolButton
                                    id={TOOLS.MUSIC}
                                    icon={Volume2}
                                    label="Sons"
                                    isActive={activeTools.includes(TOOLS.MUSIC)}
                                />
                                <ToolButton
                                    id={TOOLS.BACKGROUND_EDIT}
                                    icon={activeTools.includes(TOOLS.BACKGROUND_EDIT) ? Unlock : Lock}
                                    label={activeTools.includes(TOOLS.BACKGROUND_EDIT) ? "Verrouiller le fond" : "Modifier le fond"}
                                    isActive={activeTools.includes(TOOLS.BACKGROUND_EDIT)}
                                />
                            </div>
                        </>
                    )}

                    {/* Global Settings (Available to ALL) */}
                    <Separator orientation="vertical" className="h-8 w-[1px] bg-white/10 mx-1" />
                    <div className="flex items-center gap-1">
                        <ToolButton
                            id={TOOLS.SETTINGS}
                            icon={Settings}
                            label="Options Globales"
                            isActive={activeTools.includes(TOOLS.SETTINGS)}
                        />
                    </div>

                    <ToolButton
                        id={TOOLS.AUDIO_MIXER}
                        icon={Sliders}
                        label="Mixeur Audio"
                        isActive={activeTools.includes(TOOLS.AUDIO_MIXER)}
                    />

                    {/* Collapse Button */}
                    <div className="ml-2 pl-2 border-l border-white/10">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-white"
                            onClick={() => setIsCollapsed(true)}
                        >
                            <ChevronDown size={16} />
                        </Button>
                    </div>

                </div>
            </div>
        </div>
    );
}
