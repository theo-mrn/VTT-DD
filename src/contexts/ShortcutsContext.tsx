"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';

// Define the shape of a shortcut
export type KeyCombination = {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean; // Command on Mac
    shiftKey?: boolean;
    altKey?: boolean;
};

// Define all available actions
export const SHORTCUT_ACTIONS = {
    // Sidebar
    TOGGLE_SIDEBAR: 'toggle_sidebar',
    TAB_CHAT: 'tab_chat',
    TAB_DICE: 'tab_dice',
    TAB_NOTES: 'tab_notes',
    TAB_COMBAT: 'tab_combat',
    TAB_NPC: 'tab_npc', // GMDashboard / NPCManager logic might be complex

    // Map Tools
    TOOL_PAN: 'tool_pan',
    TOOL_SELECT: 'tool_select', // Corresponds to deactivating other tools or a specific select tool? Actually TOOLS.MULTI_SELECT might be what they mean by "Selection" or just default pointer. Usually "Select" implies turning off Pan/Draw/Measure.
    TOOL_DRAW: 'tool_draw',
    TOOL_MEASURE: 'tool_measure',
    TOOL_GRID: 'tool_grid',
    TOOL_FOG: 'tool_fog',

    // Dice
    ROLL_D4: 'roll_d4',
    ROLL_D6: 'roll_d6',
    ROLL_D8: 'roll_d8',
    ROLL_D10: 'roll_d10',
    ROLL_D12: 'roll_d12',
    ROLL_D20: 'roll_d20',
    ROLL_D100: 'roll_d100', // d100 usually 2d10 but let's assume standard notation "1d100"

    // Missing Tools
    TOOL_LAYERS: 'tool_layers',
    TOOL_BACKGROUND: 'tool_background',
    TOOL_VIEW_MODE: 'tool_view_mode', // Player View
    TOOL_SETTINGS: 'tool_settings',
    TOOL_ZOOM_IN: 'tool_zoom_in',
    TOOL_ZOOM_OUT: 'tool_zoom_out',
    TOOL_WORLD_MAP: 'tool_world_map',
    TOOL_ADD_CHAR: 'tool_add_char',
    TOOL_ADD_OBJ: 'tool_add_obj',
    TOOL_ADD_NOTE: 'tool_add_note',
    TOOL_MUSIC: 'tool_music',
    TOOL_SEARCH: 'tool_search', // Unified Search
    TOOL_PORTAL: 'tool_portal',
    TOOL_SPAWN: 'tool_spawn',
    TOOL_CLEAR: 'tool_clear', // Clear drawings
    TOOL_MULTI: 'tool_multi', // Multi Select
    TOOL_MIXER: 'tool_mixer',
    TOOL_BORDERS: 'tool_borders',
    TOOL_BADGES: 'tool_badges',

    // General
    CLOSE_DIALOG: 'close_dialog',
} as const;

export type ActionId = typeof SHORTCUT_ACTIONS[keyof typeof SHORTCUT_ACTIONS] | string;

interface ShortcutsContextType {
    shortcuts: Record<string, string>; // actionId -> keyString (e.g., "Ctrl+K")
    updateShortcut: (actionId: string, keyString: string) => void;
    resetShortcuts: () => void;
    isShortcutPressed: (event: KeyboardEvent, actionId: string) => boolean;
    getShortcutLabel: (actionId: string) => string;
}

const ShortcutsContext = createContext<ShortcutsContextType | undefined>(undefined);

const DEFAULT_SHORTCUTS: Record<string, string> = {
    [SHORTCUT_ACTIONS.TAB_CHAT]: 'C',
    [SHORTCUT_ACTIONS.TAB_DICE]: 'D',
    [SHORTCUT_ACTIONS.TAB_NOTES]: 'N',
    [SHORTCUT_ACTIONS.TAB_COMBAT]: 'K',
    [SHORTCUT_ACTIONS.TOOL_PAN]: 'H',
    [SHORTCUT_ACTIONS.TOOL_SELECT]: 'V',
    [SHORTCUT_ACTIONS.TOOL_DRAW]: 'B',
    [SHORTCUT_ACTIONS.TOOL_MEASURE]: 'M',
    [SHORTCUT_ACTIONS.TOOL_GRID]: 'G',
    [SHORTCUT_ACTIONS.TOOL_FOG]: 'F',

    // Dice Defaults (optional, maybe none by default to avoid clutter?)
    // Let's omit defaults for now or maybe just D20 for 'D'? but 'D' is Tab Dice...
    // Let's leave them empty by default, user can bind them.

    // Defaults for new tools
    [SHORTCUT_ACTIONS.TOOL_LAYERS]: 'L',
    [SHORTCUT_ACTIONS.TOOL_BACKGROUND]: 'J',
    [SHORTCUT_ACTIONS.TOOL_VIEW_MODE]: 'P', // Player view
    [SHORTCUT_ACTIONS.TOOL_SETTINGS]: ',', // Standard for settings
    [SHORTCUT_ACTIONS.TOOL_ZOOM_IN]: '+',
    [SHORTCUT_ACTIONS.TOOL_ZOOM_OUT]: '-',
    [SHORTCUT_ACTIONS.TOOL_WORLD_MAP]: 'W',
    [SHORTCUT_ACTIONS.TOOL_ADD_CHAR]: 'A',
    [SHORTCUT_ACTIONS.TOOL_ADD_OBJ]: 'O',
    [SHORTCUT_ACTIONS.TOOL_ADD_NOTE]: 'S', // Sticky Note
    [SHORTCUT_ACTIONS.TOOL_MUSIC]: 'U', // Audio/Music
    [SHORTCUT_ACTIONS.TOOL_SEARCH]: 'F', // Ctrl+F usually, but single key? Let's try 'Q' or 'Search' logic. 'F' is taken by Fog. Let's use 'E' (Search/Explorer).
    [SHORTCUT_ACTIONS.TOOL_PORTAL]: 'T', // Teleport
    [SHORTCUT_ACTIONS.TOOL_SPAWN]: 'Y',
    [SHORTCUT_ACTIONS.TOOL_CLEAR]: 'Backscpace',
    [SHORTCUT_ACTIONS.TOOL_MULTI]: 'X',
    [SHORTCUT_ACTIONS.TOOL_MIXER]: 'VolumeUp', // Hard to map single key, maybe '9'?
    [SHORTCUT_ACTIONS.TOOL_BORDERS]: 'I', // Interface
    [SHORTCUT_ACTIONS.TOOL_BADGES]: 'Delete',
};

// Helper to format event to string
export const formatKeyEvent = (e: KeyboardEvent | React.KeyboardEvent): string => {
    const parts = [];
    if (e.metaKey) parts.push('Meta');
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    // Normalize key
    let key = e.key;
    if (key === ' ') key = 'Space';
    if (key.length === 1) key = key.toUpperCase();

    if (!['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
        parts.push(key);
    }

    return parts.join('+');
};

const STORAGE_KEY = 'vtt-dd-shortcuts-v2';

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
    const [shortcuts, setShortcuts] = useState<Record<string, string>>(DEFAULT_SHORTCUTS);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from local storage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setShortcuts({ ...DEFAULT_SHORTCUTS, ...JSON.parse(stored) });
            }
        } catch (e) {
            console.error("Failed to load shortcuts", e);
        }
        setIsLoaded(true);
    }, []);

    const updateShortcut = (actionId: string, keyString: string) => {
        const newShortcuts = { ...shortcuts, [actionId]: keyString };
        setShortcuts(newShortcuts);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newShortcuts));
    };

    const resetShortcuts = () => {
        setShortcuts(DEFAULT_SHORTCUTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SHORTCUTS));
    };

    const isShortcutPressed = (event: KeyboardEvent, actionId: string): boolean => {
        // Ignore if user is typing in an input
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return false;
        }

        const shortcut = shortcuts[actionId];
        if (!shortcut) return false;

        const pressed = formatKeyEvent(event);
        return pressed === shortcut;
    };

    const getShortcutLabel = (actionId: string) => {
        return shortcuts[actionId] || '';
    };

    return (
        <ShortcutsContext.Provider value={{ shortcuts, updateShortcut, resetShortcuts, isShortcutPressed, getShortcutLabel }}>
            {children}
        </ShortcutsContext.Provider>
    );
}

export const useShortcuts = () => {
    const context = useContext(ShortcutsContext);
    if (!context) {
        throw new Error("useShortcuts must be used within a ShortcutsProvider");
    }
    return context;
};
