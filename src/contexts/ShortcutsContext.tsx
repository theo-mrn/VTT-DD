"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';

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
    TOOL_OPEN_SEARCH: 'tool_open_search', // Open Unified Search Dialog
    TOOL_SEARCH: 'tool_search', // Unified Search (obsolete, kept for compatibility)
    TOOL_PORTAL: 'tool_portal',
    TOOL_SPAWN: 'tool_spawn',
    TOOL_CLEAR: 'tool_clear', // Clear drawings
    TOOL_MULTI: 'tool_multi', // Multi Select
    TOOL_MIXER: 'tool_mixer',
    TOOL_BORDERS: 'tool_borders',
    TOOL_BADGES: 'tool_badges',

    // General
    CLOSE_DIALOG: 'close_dialog',

    // Undo/Redo
    UNDO: 'undo',
    REDO: 'redo',
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
    // ========== TABS (Onglets latéraux) ==========
    [SHORTCUT_ACTIONS.TAB_CHAT]: 'C',       // Chat
    [SHORTCUT_ACTIONS.TAB_DICE]: 'D',       // Dice (Dés)
    [SHORTCUT_ACTIONS.TAB_NOTES]: 'N',      // Notes
    [SHORTCUT_ACTIONS.TAB_COMBAT]: 'I',     // Initiative/Combat

    // ========== OUTILS DE CARTE PRINCIPAUX ==========
    [SHORTCUT_ACTIONS.TOOL_PAN]: 'H',       // Hand (Main pour déplacer)
    [SHORTCUT_ACTIONS.TOOL_SELECT]: 'E',    // sElection
    [SHORTCUT_ACTIONS.TOOL_DRAW]: 'B',      // Brush/Brosse (dessin)
    [SHORTCUT_ACTIONS.TOOL_MEASURE]: 'R',   // Ruler (Règle/Mesure)
    [SHORTCUT_ACTIONS.TOOL_GRID]: 'G',      // Grid (Grille)
    [SHORTCUT_ACTIONS.TOOL_FOG]: 'V',       // Visibilité/Fog

    // ========== GESTION DES CALQUES ET VUE ==========
    [SHORTCUT_ACTIONS.TOOL_LAYERS]: 'L',    // Layers (Calques)
    [SHORTCUT_ACTIONS.TOOL_BACKGROUND]: 'F', // Fond (background)
    [SHORTCUT_ACTIONS.TOOL_VIEW_MODE]: 'P', // Player view (Vue Joueur)

    // ========== NAVIGATION ET ZOOM ==========
    [SHORTCUT_ACTIONS.TOOL_ZOOM_IN]: '+',   // Zoom avant
    [SHORTCUT_ACTIONS.TOOL_ZOOM_OUT]: '-',  // Zoom arrière
    [SHORTCUT_ACTIONS.TOOL_WORLD_MAP]: 'M', // Map (Carte du monde)

    // ========== AJOUT D'ÉLÉMENTS ==========
    [SHORTCUT_ACTIONS.TOOL_ADD_CHAR]: 'A',  // Add character (Ajouter personnage)
    [SHORTCUT_ACTIONS.TOOL_ADD_OBJ]: 'O',   // Object (Ajouter objet)
    [SHORTCUT_ACTIONS.TOOL_ADD_NOTE]: 'T',  // Texte/Note
    [SHORTCUT_ACTIONS.TOOL_PORTAL]: 'Y',    // Portal
    [SHORTCUT_ACTIONS.TOOL_SPAWN]: 'W',     // Spawn (Invocation)

    // ========== UTILITAIRES ==========
    [SHORTCUT_ACTIONS.TOOL_OPEN_SEARCH]: 'Ctrl+K', // Ouvrir la recherche (Ctrl+K ou Cmd+K)
    [SHORTCUT_ACTIONS.TOOL_SEARCH]: '/',    // Search (Standard pour recherche) - obsolete
    [SHORTCUT_ACTIONS.TOOL_SETTINGS]: ',',  // Settings (Standard)
    [SHORTCUT_ACTIONS.TOOL_MUSIC]: 'S',     // Sons/Musique
    [SHORTCUT_ACTIONS.TOOL_MIXER]: 'Q',     // miKseur/Mixer audio (déplacé de K)
    [SHORTCUT_ACTIONS.TOOL_CLEAR]: 'Backspace', // Clear drawings
    [SHORTCUT_ACTIONS.TOOL_MULTI]: 'X',     // Multi-select
    [SHORTCUT_ACTIONS.TOOL_BORDERS]: 'J',   // Borders
    [SHORTCUT_ACTIONS.TOOL_BADGES]: 'Delete', // Badges

    // ========== LANCÉS DE DÉS (AZERTY) ==========
    [SHORTCUT_ACTIONS.ROLL_D4]: '&',        // Dé 4 faces (touche 1 sur AZERTY)
    [SHORTCUT_ACTIONS.ROLL_D6]: 'É',        // Dé 6 faces (touche 2 sur AZERTY)
    [SHORTCUT_ACTIONS.ROLL_D8]: '"',        // Dé 8 faces (touche 3 sur AZERTY)
    [SHORTCUT_ACTIONS.ROLL_D10]: "'",       // Dé 10 faces (touche 4 sur AZERTY)
    [SHORTCUT_ACTIONS.ROLL_D12]: '(',       // Dé 12 faces (touche 5 sur AZERTY)
    [SHORTCUT_ACTIONS.ROLL_D20]: '-',       // Dé 20 faces (touche 6 sur AZERTY)
    [SHORTCUT_ACTIONS.ROLL_D100]: 'È',      // Dé 100 faces (touche 7 sur AZERTY)

    // ========== UNDO/REDO ==========
    [SHORTCUT_ACTIONS.UNDO]: 'Ctrl+Z',      // Annuler
    [SHORTCUT_ACTIONS.REDO]: 'Ctrl+Y',      // Refaire (Ctrl+Shift+Z aussi possible sur Mac)
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

    // History handling
    const keyHistory = useRef<string[]>([]);
    const historyTimeout = useRef<NodeJS.Timeout | null>(null);

    // Global listener to update history
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            // Ignore modifier-only presses for history (unless single key shortcut?)
            // Actually formatKeyEvent handles exclusions.
            const keyStr = formatKeyEvent(e);
            if (!keyStr) return; // Should not happen with current formatKeyEvent logic unless skipped

            // If just modifiers, ignore for sequence building usually, but user might want Ctrl then ...
            // Let's rely on formatKeyEvent. If it returns "Ctrl", it's a key.

            // We only update history here. 
            // IMPORTANT: This listener might run BEFORE or AFTER the consumer listener.
            // If AFTER, the consumer needs to assume current key is NOT in history yet.
            // If BEFORE, consumer assumes it IS.
            // Since we can't guarantee order across the app easily, let's treat history as "previous keys".
            // We will append current key in `isShortcutPressed` to check.
            // We will append current key to history HERE for *future* checks.
            // But we need to make sure we don't double count if we check in the same event loop?
            // Actually, `isShortcutPressed` is purely a checker. It doesn't modify state. 
            // This effect modifies state.

            // To ensure consistency: History contains keys from PREVIOUS events.
            // We update it here for the NEXT event.

            // Wait, if I type "d", then "2".
            // Event "d": history=[], current="d". Match?
            // Listener updates history=["d"].
            // Event "2": history=["d"], current="2". Match "d 2"? Yes.

            // So we just need to append to history here.

            // Clear timeout
            if (historyTimeout.current) clearTimeout(historyTimeout.current);

            keyHistory.current.push(keyStr);

            // Limit history size (e.g. 10 keys)
            if (keyHistory.current.length > 10) {
                keyHistory.current = keyHistory.current.slice(-10);
            }

            // Set timeout to clear history
            historyTimeout.current = setTimeout(() => {
                keyHistory.current = [];
            }, 1000); // 1.5s timeout? Let's try 1000ms.
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

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

        const currentKey = formatKeyEvent(event);

        // Handle sequences (space separated)
        const sequence = shortcut.split(' ');

        if (sequence.length === 1) {
            // Simple shortcut
            return currentKey === sequence[0];
        }

        // Complex shortcut
        // Check if [history + current] ends with sequence
        if (currentKey !== sequence[sequence.length - 1]) return false;

        // Optim check: last key matches. Now check previous keys.
        // We need (sequence.length - 1) previous keys from history
        const needed = sequence.length - 1;
        if (keyHistory.current.length < needed) return false;

        const historySlice = keyHistory.current.slice(-needed);
        const sequenceSlice = sequence.slice(0, needed);

        // Array compare
        return historySlice.every((k, i) => k === sequenceSlice[i]);
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
