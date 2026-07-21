"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
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
    Map,
    SquareDashedMousePointer,
    Volume2,
    Sliders,
    Sparkles,
    Check,
    Cloud,
    Lightbulb,
    Search,
    Hexagon,
    MapPin,
    CirclePlus,
    SquarePlus,
    X,
    GripVertical
} from 'lucide-react';
import { useGame } from "@/contexts/GameContext";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { AVAILABLE_ACTIONS, getAvailableActions, ACTION_CATEGORIES, type CustomActionDef } from "@/lib/customActions";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
import { useEffects, getEffectUrl } from "@/hooks/map/useEffects";

interface MapToolbarProps {
    isMJ: boolean;
    activeTools: string[]; // List of active tool IDs force-casted to string or just mapped strings
    onAction: (actionId: string) => void;
    currentViewMode?: 'mj' | 'player';
    showGrid: boolean;
    activeToolContent?: React.ReactNode;
    className?: string;
    allies?: Array<{ id: string; name: string; avatar?: string }>;
    extraMJTools?: React.ReactNode;
}

export const TOOLS = {
    // Map & View
    PAN: 'pan',
    GRID: 'grid',
    LAYERS: 'layers',
    BACKGROUND: 'background',
    VIEW_MODE: 'view_mode',
    ZOOM_IN: 'zoom_in',
    ZOOM_OUT: 'zoom_out',
    WORLD_MAP: 'world_map',

    // Content
    ADD_CHAR: 'add_char',
    ADD_OBJ: 'add_obj',
    ADD_NOTE: 'add_note',
    MUSIC: 'music',
    BACKGROUND_EDIT: 'background_edit',
    UNIFIED_SEARCH: 'unified_search',
    PORTAL: 'portal',
    SPAWN_POINT: 'spawn_point',  // 🆕 Set default spawn point for scene

    // Tools
    DRAW: 'draw',
    MEASURE: 'measure',
    VISIBILITY: 'visibility',
    CLEAR_DRAWINGS: 'clear_drawings',
    MULTI_SELECT: 'multi_select',
    AUDIO_MIXER: 'audio_mixer',
    TOGGLE_CHAR_BORDERS: 'toggle_char_borders',
    TOGGLE_ALL_BADGES: 'toggle_all_badges',
    ERASER: 'eraser',
    FOG_REVEAL_ALL: 'fog_reveal_all',
    FOG_HIDE_ALL: 'fog_hide_all',
    MUSIC_PLAY_PAUSE: 'music_play_pause',
};

const FIREBALL_SKIN_OPTIONS = [
    { label: 'Sans Animation', value: '' },
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
    { label: 'Sans Animation', value: '' },
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
    className?: string;
}

export function ToolbarSkinSelector({ selectedSkin, onSkinChange, shape = 'circle', className }: ToolbarSkinSelectorProps) {
    const options = shape === 'cone' ? CONE_SKIN_OPTIONS : FIREBALL_SKIN_OPTIONS;
    const [isOpen, setIsOpen] = useState(true);
    const [hoveredSkin, setHoveredSkin] = useState<string | null>(null);

    // Load effects from R2
    const category = shape === 'cone' ? 'Cone' : 'Fireballs';
    const { effects, isLoading } = useEffects(category);

    return (
        <div className={cn(
            "flex flex-col gap-2 bg-[#0a0a0a]/90 backdrop-blur-xl border border-[#333] rounded-xl p-3 shadow-[0_20px_50px_rgba(0,0,0,0.8)] w-full relative pointer-events-auto transition-all duration-300",
            className || ""
        )}>
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
                <ScrollArea className="w-full h-[180px] pr-3 animate-in slide-in-from-top-2 duration-200">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <Cloud className="w-6 h-6 animate-pulse mr-2" />
                            <span>Chargement des effets...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-2 p-1">
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
                                    {option.value === '' ? (
                                        // No Animation option - show text instead of image
                                        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 font-medium">
                                            Sans Anim
                                        </div>
                                    ) : (
                                        <>
                                            <Image
                                                src={getEffectUrl(option.value.replace('.webm', '.webp'), effects)}
                                                alt={option.label}
                                                fill
                                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                                className="object-cover"
                                            />
                                            {hoveredSkin === option.value && (
                                                <video
                                                    src={getEffectUrl(option.value, effects)}
                                                    className="absolute inset-0 w-full h-full object-cover z-20"
                                                    autoPlay
                                                    loop
                                                    muted
                                                    playsInline
                                                />
                                            )}
                                        </>
                                    )}

                                    {/* Active Indicator */}
                                    {selectedSkin === option.value && (
                                        <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#c0a080] rounded-full shadow-[0_0_8px_#c0a080] border border-black/50 z-30" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// BOUTONS PERSONNALISÉS DE LA TOOLBAR
// Remplace les anciens boutons flottants posés librement sur la carte
// (CustomButtons) : les actions choisies vivent dans la barre elle-même et se
// gèrent comme la Sidebar — mode édition, ajout via picker, retrait, drag pour
// réordonner, persistance localStorage par utilisateur.
// ─────────────────────────────────────────────────────────────────────────────

const TOOLBAR_BUTTONS_KEY_PREFIX = "vtt_toolbar_buttons_";
// Ancienne clé des boutons flottants sur la carte — migrée une fois (ids
// d'actions repris, positions abandonnées), l'ancienne donnée est laissée en place.
const LEGACY_FLOATING_KEY_PREFIX = "vtt_custom_buttons_";

function loadToolbarButtonIds(uid: string | undefined): string[] {
    if (!uid || typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(TOOLBAR_BUTTONS_KEY_PREFIX + uid);
        if (raw) return Array.from(new Set(JSON.parse(raw) as string[]));
        const legacy = localStorage.getItem(LEGACY_FLOATING_KEY_PREFIX + uid);
        if (legacy) {
            const ids = Array.from(new Set(
                (JSON.parse(legacy) as { actionId: string }[]).map(b => b.actionId)
            ));
            localStorage.setItem(TOOLBAR_BUTTONS_KEY_PREFIX + uid, JSON.stringify(ids));
            return ids;
        }
        return [];
    } catch {
        return [];
    }
}

function saveToolbarButtonIds(uid: string | undefined, ids: string[]) {
    if (!uid || typeof window === "undefined") return;
    try {
        localStorage.setItem(TOOLBAR_BUTTONS_KEY_PREFIX + uid, JSON.stringify(ids));
    } catch (e) {
        console.error("Failed to save toolbar buttons", e);
    }
}

function SortableCustomAction({
    action,
    isActive,
    editMode,
    onTrigger,
    onRemove,
}: {
    action: CustomActionDef;
    isActive: boolean;
    editMode: boolean;
    onTrigger: (actionId: string) => void;
    onRemove: (actionId: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: action.id, disabled: !editMode });
    const Icon = action.icon;

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
            className="relative shrink-0"
            {...attributes}
            {...(editMode ? listeners : {})}
        >
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant={isActive ? "secondary" : "ghost"}
                        size="icon"
                        className={cn(
                            "h-8 w-8 sm:h-9 sm:w-9 shrink-0 transition-all duration-200 rounded-lg",
                            isActive
                                ? "bg-[#c0a080] text-black hover:bg-[#d4b494] shadow-[0_0_10px_rgba(192,160,128,0.3)]"
                                : "text-gray-400 hover:text-white hover:bg-white/10",
                            editMode && "ring-1 ring-[#c0a080]/60 cursor-grab active:cursor-grabbing touch-none"
                        )}
                        onClick={() => { if (!editMode) onTrigger(action.id); }}
                    >
                        <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-black/90 border-[#333] text-white text-xs font-medium">
                    <p>{action.label}</p>
                </TooltipContent>
            </Tooltip>
            {editMode && (
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(action.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-500 z-10"
                >
                    <X className="w-2.5 h-2.5" />
                </button>
            )}
        </div>
    );
}

function ToolbarActionPicker({
    isMJ,
    excludeIds,
    onPick,
    onClose,
}: {
    isMJ: boolean;
    excludeIds: string[];
    onPick: (actionId: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState("");
    const inputRef = React.useRef<HTMLInputElement>(null);

    useEffect(() => {
        const t = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(t);
    }, []);

    const filteredActions = getAvailableActions(isMJ)
        .filter(a => !excludeIds.includes(a.id))
        .filter(a => a.label.toLowerCase().includes(query.trim().toLowerCase()));
    const groups = ACTION_CATEGORIES
        .map(category => ({ category, actions: filteredActions.filter(a => a.category === category) }))
        .filter(g => g.actions.length > 0);

    return createPortal(
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-2xl w-full max-w-3xl h-[85vh] max-h-[720px] shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
                    <span className="text-base font-bold text-[var(--text-primary)]">Ajouter un bouton</span>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-white/5">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="px-5 pt-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Rechercher une action..."
                            className="w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-zinc-600 outline-none focus:border-[var(--accent-brown)] transition-colors"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {groups.map(group => (
                        <div key={group.category}>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent-brown)] mb-2.5">
                                {group.category}
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {group.actions.map(a => (
                                    <button
                                        key={a.id}
                                        onClick={() => onPick(a.id)}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent-brown)] text-[var(--text-primary)] text-sm transition-colors"
                                    >
                                        <a.icon className="w-4 h-4 text-[var(--accent-brown)] shrink-0" />
                                        <span className="truncate">{a.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    {groups.length === 0 && (
                        <div className="text-center py-10 text-zinc-600 text-sm italic">
                            Aucune action trouvée.
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

function MapToolbar({
    isMJ,
    activeTools,
    onAction,
    currentViewMode = 'mj',
    showGrid,
    activeToolContent,
    className,
    allies = [],
    extraMJTools,
}: MapToolbarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // ── Boutons personnalisés (dans la barre, gérés comme la Sidebar) ──
    const { user } = useGame();
    const { triggerAction, activeMapTools } = useShortcuts();
    const [customIds, setCustomIds] = useState<string[]>([]);
    const [customEditMode, setCustomEditMode] = useState(false);
    const [customPickerOpen, setCustomPickerOpen] = useState(false);

    useEffect(() => {
        setCustomIds(loadToolbarButtonIds(user?.uid));
    }, [user?.uid]);

    const persistCustomIds = useCallback((next: string[]) => {
        setCustomIds(next);
        saveToolbarButtonIds(user?.uid, next);
    }, [user?.uid]);

    // Filtrage par rôle à l'affichage (les ids persistés peuvent contenir des
    // actions MJ si l'utilisateur a changé de rôle) — même logique que la Sidebar.
    const customActions = customIds
        .map(id => AVAILABLE_ACTIONS.find(a => a.id === id))
        .filter((a): a is CustomActionDef => !!a && (!a.mjOnly || isMJ) && (!a.hiddenForMJ || !isMJ));

    const customSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
    const handleCustomDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = customIds.indexOf(String(active.id));
        const newIndex = customIds.indexOf(String(over.id));
        if (oldIndex === -1 || newIndex === -1) return;
        persistCustomIds(arrayMove(customIds, oldIndex, newIndex));
    };

    const handleCustomPick = (actionId: string) => {
        if (!customIds.includes(actionId)) persistCustomIds([...customIds, actionId]);
        setCustomPickerOpen(false);
    };

    // ⚡ PERFORMANCE: Memoized ToolButton to prevent re-creation on every render
    const ToolButton = React.memo(({
        id,
        icon: Icon,
        label,
        isActive = false,
        danger = false,
        onClick,
        onAction
    }: {
        id: string;
        icon: any;
        label: string;
        isActive?: boolean;
        danger?: boolean;
        onClick?: () => void;
        onAction: (id: string) => void;
    }) => (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    id={`vtt-toolbar-${id}`}
                    variant={isActive ? "secondary" : "ghost"}
                    size="icon"
                    className={cn(
                        "h-8 w-8 sm:h-9 sm:w-9 shrink-0 transition-all duration-200",
                        isActive
                            ? "bg-[#c0a080] text-black hover:bg-[#d4b494] shadow-[0_0_10px_rgba(192,160,128,0.3)]"
                            : "text-gray-400 hover:text-white hover:bg-white/10",
                        (danger && !isActive) ? "hover:text-red-400 hover:bg-red-900/20" : "",
                        "rounded-lg"
                    )}
                    onClick={onClick || (() => onAction(id))}
                >
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-black/90 border-[#333] text-white text-xs font-medium">
                <p>{label}</p>
            </TooltipContent>
        </Tooltip>
    ));

    ToolButton.displayName = 'ToolButton';

    // Helper for separators (hidden on mobile to keep the bar compact)
    const GroupSeparator = () => (
        <div className="hidden sm:block h-6 w-[1px] bg-white/10 mx-1.5 self-center" />
    );

    return (
        <TooltipProvider delayDuration={300}>
            <div className={cn(
                // Mobile: top of screen, single scrollable row. Desktop: bottom-centered.
                "fixed z-[50] transition-all duration-300 ease-in-out font-sans flex flex-col",
                "top-2 left-0 right-0 px-2 lg:top-auto lg:bottom-6 lg:left-1/2 lg:right-auto lg:px-0 lg:-translate-x-1/2",
                isCollapsed ? "lg:translate-y-[calc(100%+24px)]" : "translate-y-0",
                className || ""
            )}>
                {/* Active Tool Content (Sub-Menu) — below the bar on mobile, above on desktop */}
                {activeToolContent && (
                    <div className="order-2 lg:order-1 mt-1.5 lg:mt-0 lg:mb-3 animate-in slide-in-from-bottom-2 fade-in duration-300 relative z-[110] pointer-events-auto flex justify-center">
                        <div className="bg-[#0a0a0a]/90 backdrop-blur-xl border border-[#333] rounded-xl p-1.5 sm:p-2 shadow-2xl max-w-[calc(100vw-1rem)]">
                            {activeToolContent}
                        </div>
                    </div>
                )}

                {/* Main Toolbar Container */}
                <div className="order-1 lg:order-2 flex flex-col items-center gap-1.5 sm:gap-2 pointer-events-auto">

                    {/* Expand Toggle (Visible when collapsed) — desktop only */}
                    <div
                        className={cn(
                            "hidden lg:block absolute -top-12 left-1/2 -translate-x-1/2 transition-opacity duration-300",
                            isCollapsed ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                        )}
                    >
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setIsCollapsed(false)}
                            className="rounded-full h-10 w-10 bg-black/80 border-[#c0a080]/50 text-[#c0a080] hover:bg-[#c0a080] hover:text-black shadow-[0_0_15px_rgba(0,0,0,0.5)] transition-all hover:scale-110"
                        >
                            <ChevronUp size={20} />
                        </Button>
                    </div>

                    {/* Toolbar Body — single scrollable row on mobile, wrapping centered bar on desktop */}
                    <div className="flex flex-nowrap lg:flex-wrap justify-start lg:justify-center items-center gap-y-0.5 lg:gap-y-1.5 p-1 sm:p-1.5 bg-[#0a0a0a]/90 backdrop-blur-2xl border border-[#333] rounded-2xl shadow-[0_10px_50px_rgba(0,0,0,0.7)] ring-1 ring-white/5 w-full lg:w-max max-w-full lg:max-w-[calc(100vw-2rem)] overflow-x-auto lg:overflow-visible no-scrollbar">

                        {/* --- GROUP 1: NAVIGATION & VIEW --- */}
                        {/* Zoom +/- and Pan are hidden on mobile (native pinch/drag gestures handle it) */}
                        <div id="vtt-toolbar-group-nav" className="flex items-center px-0.5 sm:px-1 shrink-0">
                            <span className="hidden sm:inline-flex">
                                <ToolButton onAction={onAction}
                                    id={TOOLS.ZOOM_IN}
                                    icon={Plus}
                                    label="Zoomer"
                                    isActive={false}
                                />
                            </span>
                            <span className="hidden sm:inline-flex">
                                <ToolButton onAction={onAction}
                                    id={TOOLS.ZOOM_OUT}
                                    icon={Minus}
                                    label="Dézoomer"
                                    isActive={false}
                                />
                            </span>
                            <span className="hidden sm:inline-flex">
                                <ToolButton onAction={onAction}
                                    id={TOOLS.PAN}
                                    icon={Move}
                                    label="Déplacer la carte"
                                    isActive={activeTools.includes(TOOLS.PAN)}
                                />
                            </span>
                            {isMJ && (
                                <>
                                    <ToolButton onAction={onAction}
                                        id={TOOLS.WORLD_MAP}
                                        icon={Map}
                                        label="Carte du Monde"
                                        isActive={activeTools.includes(TOOLS.WORLD_MAP)}
                                    />
                                    <ToolButton onAction={onAction}
                                        id={TOOLS.VIEW_MODE}
                                        icon={currentViewMode === 'player' ? ScanEye : User}
                                        label={currentViewMode === 'player' ? "Vue MJ" : "Vue Joueur"}
                                        isActive={activeTools.includes(TOOLS.VIEW_MODE)}
                                    />
                                </>
                            )}
                            {/* Player Ally View Button (like MJ View Mode) */}
                            {!isMJ && allies.length > 0 && (
                                <ToolButton onAction={onAction}
                                    id="ALLY_VIEW_MODE"
                                    icon={ScanEye}
                                    label="Vue Allié"
                                    isActive={activeTools.includes('ALLY_VIEW_MODE')}
                                />
                            )}
                        </div>

                        <GroupSeparator />

                        {/* --- GROUP 2: PRIMARY INTERACTION --- */}
                        <div id="vtt-toolbar-group-interaction" className="flex items-center px-0.5 sm:px-1 shrink-0">
                            {/* Multi-select hidden on mobile (drag-rectangle selection isn't touch-friendly) */}
                            {isMJ && (
                                <span className="hidden sm:inline-flex">
                                    <ToolButton onAction={onAction}
                                        id={TOOLS.MULTI_SELECT}
                                        icon={SquareDashedMousePointer}
                                        label="Sélection Multiple"
                                        isActive={activeTools.includes(TOOLS.MULTI_SELECT)}
                                    />
                                </span>
                            )}
                            <ToolButton onAction={onAction}
                                id={TOOLS.MEASURE}
                                icon={Target}
                                label="Mesure / Gabarits"
                                isActive={activeTools.includes(TOOLS.MEASURE)}
                            />
                            <ToolButton onAction={onAction}
                                id={TOOLS.DRAW}
                                icon={Pencil}
                                label="Dessin"
                                isActive={activeTools.includes(TOOLS.DRAW)}
                            />
                            <ToolButton onAction={onAction}
                                id={TOOLS.ADD_NOTE}
                                icon={Baseline}
                                label="Ajouter une note"
                                isActive={activeTools.includes(TOOLS.ADD_NOTE)}
                            />
                        </div>

                        <GroupSeparator />

                        {/* --- GROUP 3: MAP MANAGEMENT --- */}
                        <div id="vtt-toolbar-group-map" className="flex items-center px-0.5 sm:px-1 shrink-0">
                            <ToolButton onAction={onAction}
                                id={TOOLS.GRID}
                                icon={Grid}
                                label={showGrid ? "Masquer la grille" : "Afficher la grille"}
                                isActive={activeTools.includes(TOOLS.GRID)}
                            />
                            {isMJ && (
                                <>
                                    <ToolButton onAction={onAction}
                                        id={TOOLS.LAYERS}
                                        icon={Layers}
                                        label="Calques"
                                        isActive={activeTools.includes(TOOLS.LAYERS)}
                                    />
                                    <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5 mx-1">
                                        <ToolButton onAction={onAction}
                                            id={TOOLS.BACKGROUND}
                                            icon={ImagePlus}
                                            label="Changer le fond"
                                            isActive={activeTools.includes(TOOLS.BACKGROUND)}
                                        />
                                        <ToolButton onAction={onAction}
                                            id={TOOLS.BACKGROUND_EDIT}
                                            icon={activeTools.includes(TOOLS.BACKGROUND_EDIT) ? Unlock : Lock}
                                            label={activeTools.includes(TOOLS.BACKGROUND_EDIT) ? "Verrouiller le fond" : "Ajuster le fond"}
                                            isActive={activeTools.includes(TOOLS.BACKGROUND_EDIT)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* --- GROUP 4: CONTENT & AUDIO (MJ Only usually) --- */}
                        {isMJ && (
                            <>
                                <GroupSeparator />
                                <div id="vtt-toolbar-group-content" className="flex items-center px-0.5 sm:px-1 shrink-0">
                                    <ToolButton onAction={onAction}
                                        id={TOOLS.UNIFIED_SEARCH}
                                        icon={CirclePlus}
                                        label="Ajouter un élément"
                                        isActive={activeTools.includes(TOOLS.UNIFIED_SEARCH)}
                                    />
                                    <ToolButton onAction={onAction}
                                        id={TOOLS.PORTAL}
                                        icon={Hexagon}
                                        label="Portail"
                                        isActive={activeTools.includes(TOOLS.PORTAL)}
                                    />
                                    <ToolButton onAction={onAction}
                                        id={TOOLS.SPAWN_POINT}
                                        icon={MapPin}
                                        label="Point d'apparition"
                                        isActive={activeTools.includes(TOOLS.SPAWN_POINT)}
                                    />
                                </div>
                            </>
                        )}

                        {/* --- GROUP 5: SYSTEM & AUDIO --- */}
                        <GroupSeparator />
                        <div id="vtt-toolbar-group-system" className="flex items-center px-0.5 sm:px-1 shrink-0">
                            <ToolButton onAction={onAction}
                                id={TOOLS.AUDIO_MIXER}
                                icon={Sliders}
                                label="Mixeur Audio"
                                isActive={activeTools.includes(TOOLS.AUDIO_MIXER)}
                            />

                            <ToolButton onAction={onAction}
                                id={TOOLS.TOGGLE_ALL_BADGES}
                                icon={Eye}
                                label="Badges d'état"
                                isActive={activeTools.includes(TOOLS.TOGGLE_ALL_BADGES)}
                            />

                        </div>

                        {/* --- GROUP 6: BOUTONS PERSONNALISÉS (dans la barre, gérés comme la Sidebar) --- */}
                        <GroupSeparator />
                        <div id="vtt-toolbar-group-custom" className="flex items-center gap-0.5 px-0.5 sm:px-1 shrink-0">
                            <DndContext
                                id="vtt-toolbar-custom-dnd"
                                sensors={customSensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleCustomDragEnd}
                            >
                                <SortableContext items={customActions.map(a => a.id)} strategy={horizontalListSortingStrategy}>
                                    {customActions.map(action => (
                                        <SortableCustomAction
                                            key={action.id}
                                            action={action}
                                            isActive={!!action.mapToolId && activeMapTools.includes(action.mapToolId)}
                                            editMode={customEditMode}
                                            onTrigger={triggerAction}
                                            onRemove={(id) => persistCustomIds(customIds.filter(x => x !== id))}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                            {customEditMode && (
                                <ToolButton onAction={() => setCustomPickerOpen(true)}
                                    id="custom_add"
                                    icon={Plus}
                                    label="Ajouter un bouton"
                                    onClick={() => setCustomPickerOpen(true)}
                                />
                            )}
                            <ToolButton onAction={() => setCustomEditMode(e => !e)}
                                id="customize_buttons"
                                icon={customEditMode ? GripVertical : SquarePlus}
                                label={customEditMode ? "Terminer l'édition" : "Personnaliser mes boutons"}
                                isActive={customEditMode}
                                onClick={() => setCustomEditMode(e => !e)}
                            />
                        </div>

                        {/* Extra MJ Tools */}
                        {isMJ && extraMJTools && (
                            <>
                                <GroupSeparator />
                                <div className="flex items-center px-0.5 sm:px-1 shrink-0">{extraMJTools}</div>
                            </>
                        )}

                        {/* Collapse Button — desktop only (mobile bar stays at top) */}
                        <div className="hidden lg:block ml-1 pl-2 border-l border-white/10 shrink-0">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-500 hover:text-white rounded-md"
                                onClick={() => setIsCollapsed(true)}
                            >
                                <ChevronDown size={14} />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {customPickerOpen && (
                <ToolbarActionPicker
                    isMJ={isMJ}
                    excludeIds={customIds}
                    onPick={handleCustomPick}
                    onClose={() => setCustomPickerOpen(false)}
                />
            )}
        </TooltipProvider>
    );
}

// ⚡ PERFORMANCE: Export memoized version as default to prevent re-renders
export default React.memo(MapToolbar);
