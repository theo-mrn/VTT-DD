"use client";

import React, { useState } from 'react';
import Image from 'next/image';
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
    Target,
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
    Sliders,
    Sparkles,
    Check,
    Cloud
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
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useEffects } from "@/hooks/map/useEffects";

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

const FIREBALL_SKIN_OPTIONS = [
    { label: 'Explosion 1', value: 'Fireballs/explosion1.webm' },
    { label: 'Explosion 2', value: 'Fireballs/explosion2.webm' },
    { label: 'Explosion 3', value: 'Fireballs/explosion3.webm' },
    { label: 'Explosion 4', value: 'Fireballs/explosion4.webm' },
    { label: 'Explosion 5', value: 'Fireballs/explosion5.webm' },
    { label: 'Explosion 6', value: 'Fireballs/explosion6.webm' },
    { label: 'Explosion 7', value: 'Fireballs/explosion7.webm' },
    { label: 'Loop 1', value: 'Fireballs/loop1.webm' },
    { label: 'Loop 2', value: 'Fireballs/loop2.webm' },
    { label: 'Loop 3', value: 'Fireballs/loop3.webm' },
    { label: 'Loop 4', value: 'Fireballs/loop4.webm' },
    { label: 'Loop 5', value: 'Fireballs/loop5.webm' },
    { label: 'Loop 6', value: 'Fireballs/loop6.webm' },
    { label: 'Loop 7', value: 'Fireballs/loop7.webm' },
];

const CONE_SKIN_OPTIONS = [
    { label: 'Cone 1', value: 'Cone/cone1.webm' },
    { label: 'Cone 2', value: 'Cone/cone2.webm' },
    { label: 'Cone 3', value: 'Cone/cone3.webm' },
    { label: 'Cone 4', value: 'Cone/cone4.webm' },
    { label: 'Cone 5', value: 'Cone/cone5.webm' },
    { label: 'Cone 6', value: 'Cone/cone6.webm' },
    { label: 'Cone 7', value: 'Cone/cone7.webm' },
    { label: 'Cone 8', value: 'Cone/cone8.webm' },
    { label: 'Cone 9', value: 'Cone/cone9.webm' },
    { label: 'Cone 10', value: 'Cone/cone10.webm' },
];

interface ToolbarSkinSelectorProps {
    selectedSkin: string;
    onSkinChange: (skin: string) => void;
    shape?: 'circle' | 'cone' | 'line' | 'cube';
}

export function ToolbarSkinSelector({ selectedSkin, onSkinChange, shape = 'circle' }: ToolbarSkinSelectorProps) {
    const options = shape === 'cone' ? CONE_SKIN_OPTIONS : FIREBALL_SKIN_OPTIONS;
    const [isOpen, setIsOpen] = useState(true);
    const [hoveredSkin, setHoveredSkin] = useState<string | null>(null);

    // Load effects from R2
    const category = shape === 'cone' ? 'Cone' : 'Fireballs';
    const { effects, isLoading } = useEffects(category);

    // Helper to get the URL for an effect
    const getUrl = (filename: string) => {
        if (isLoading || effects.length === 0) {
            // Fallback to local path while loading
            return `/Effect/${filename}`;
        }

        const effect = effects.find((e: { name: string; localPath: string; path: string }) =>
            e.name === filename || e.localPath.endsWith(filename)
        );
        return effect ? effect.path : `/Effect/${filename}`;
    };

    return (
        <div className="flex flex-col gap-2 bg-[#0a0a0a]/90 backdrop-blur-xl border border-[#333] rounded-xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] w-[340px] relative pointer-events-auto transition-all duration-300">
            <div
                className="flex items-center justify-between border-b border-white/5 pb-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="text-[#c0a080] text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    Effets Visuels {isLoading && <Cloud className="w-3 h-3 animate-pulse" />}
                </span>
                <button className="text-gray-500 hover:text-white transition-colors">
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {isOpen && (
                <ScrollArea className="w-full h-[240px] pr-3 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-4 gap-2 p-1">
                        {options.map((option) => (
                            <button
                                key={option.value}
                                onClick={() => {
                                    onSkinChange(option.value);
                                    setIsOpen(false);
                                }}
                                onMouseEnter={() => setHoveredSkin(option.value)}
                                onMouseLeave={() => setHoveredSkin(null)}
                                className={cn(
                                    "group relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200",
                                    selectedSkin === option.value
                                        ? "border-[#c0a080] shadow-[0_0_15px_rgba(192,160,128,0.4)] scale-100 z-10"
                                        : "border-transparent border-white/5 hover:border-white/30 hover:scale-105 hover:z-10 bg-black/40"
                                )}
                                title={option.label}
                            >
                                <Image
                                    src={getUrl(option.value.replace('.webm', '.webp'))}
                                    alt={option.label}
                                    fill
                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                    className="object-cover"
                                />
                                {hoveredSkin === option.value && (
                                    <video
                                        src={getUrl(option.value)}
                                        className="absolute inset-0 w-full h-full object-cover z-20"
                                        autoPlay
                                        loop
                                        muted
                                        playsInline
                                    />
                                )}

                                {/* Overlay Label on Hover */}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent pt-4 pb-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
                                    <span className="text-[9px] text-white/90 font-medium block text-center truncate px-1">
                                        {option.label}
                                    </span>
                                </div>

                                {/* Active Indicator */}
                                {selectedSkin === option.value && (
                                    <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#c0a080] rounded-full shadow-[0_0_8px_#c0a080] border border-black/50 z-30" />
                                )}
                            </button>
                        ))}
                    </div>
                </ScrollArea>
            )}
        </div>
    );
}

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
            "fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] transition-all duration-300 ease-in-out",
            isCollapsed ? "translate-y-[calc(100%+24px)]" : "translate-y-0",
            className || ""
        )}>
            {/* Active Tool Content (Sub-Menu) */}
            {activeToolContent && (
                <div className="mb-2 animate-in slide-in-from-bottom-4 fade-in duration-300 relative z-[110] pointer-events-auto">
                    {activeToolContent}
                </div>
            )}

            {/* Main Toolbar Container */}
            <div className="flex flex-col items-center gap-2 pointer-events-auto">

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
                            icon={Target}
                            label="Attaque de Zone"
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
