"use client";

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

// Define the shape of a shortcut
export type KeyCombination = {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean; // Command on Mac
    shiftKey?: boolean;
    altKey?: boolean;
};

export type CustomShortcut = {
    id: string;
    label: string;
    command: string;
    keyString: string;
};

// Define all available actions
export const SHORTCUT_ACTIONS = {
    // Sidebar
    TOGGLE_SIDEBAR: 'toggle_sidebar',
    TAB_CHAT: 'tab_chat',
    TAB_DICE: 'tab_dice',
    TAB_NOTES: 'tab_notes',
    QUICK_NOTE: 'quick_note', // Ouvre une saisie rapide de note (catégorie + texte), sans passer par le panneau Notes complet
    TAB_COMBAT: 'tab_combat',
    TAB_NPC: 'tab_npc', // GMDashboard / NPCManager logic might be complex
    TAB_FICHE: 'tab_fiche', // Fiche de personnage
    TAB_ENCOUNTER: 'tab_encounter', // Générateur de rencontre (MJ)
    TAB_HISTORIQUE: 'tab_historique', // Historique des événements (MJ)
    TOGGLE_CUSTOM_BUTTONS_EDIT: 'toggle_custom_buttons_edit', // Active/désactive le mode édition des boutons personnalisables (CustomButtons)

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
    QUICK_ROLL: 'quick_roll', // Ouvre un champ de saisie rapide flottant (notation libre)

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
    TOOL_ERASER: 'tool_eraser', // Active directement l'outil Gomme (drawMode + currentTool='eraser')
    TOOL_MUSIC_PLAY_PAUSE: 'tool_music_play_pause', // Play/Pause direct sur la musique en cours
    TOOL_FOG_REVEAL_ALL: 'tool_fog_reveal_all', // Révèle toute la carte (fullMapFog = false)
    TOOL_FOG_HIDE_ALL: 'tool_fog_hide_all', // Cache toute la carte (fullMapFog = true)
    TOOL_FOG_RESET: 'tool_fog_reset', // Réinitialise le brouillard peint (grille vide)

    // Interactions
    OPEN_BUBBLE_MENU: 'open_bubble_menu', // Bulle d'interaction (emoji/texte) au-dessus de son perso

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
    checkKeyCombination: (event: KeyboardEvent, keyString: string) => boolean;
    customShortcuts: CustomShortcut[];
    addCustomShortcut: (shortcut: Omit<CustomShortcut, 'id'>) => void;
    updateCustomShortcut: (id: string, updates: Partial<CustomShortcut>) => void;
    removeCustomShortcut: (id: string) => void;
    // Déclenchement par clic (boutons personnalisables) : un composant qui écoute déjà
    // isShortcutPressed(e, ACTION) dans un handler keydown peut s'abonner en plus à
    // onActionTriggered(ACTION, cb) pour réagir aussi à un clic sur un bouton flottant,
    // sans dupliquer sa logique ni simuler un faux KeyboardEvent.
    triggerAction: (actionId: string) => void;
    onActionTriggered: (actionId: string, callback: () => void) => () => void;
    // État partagé (pas juste un événement ponctuel) : CustomButtons.tsx (monté dans
    // layout.tsx) l'écrit quand son mode édition change, MapToolbar/page.tsx (composant
    // frère) le lit pour afficher son bouton "Personnaliser mes boutons" en actif.
    isCustomButtonsEditModeActive: boolean;
    setIsCustomButtonsEditModeActive: (v: boolean) => void;
    // Miroir de activeTools (getActiveToolbarTools, calculé dans page.tsx) : permet aux
    // boutons personnalisables (CustomButtons/Sidebar, montés hors de la page carte) de
    // savoir si l'action qu'ils représentent est actuellement active sur la carte
    // (ex: Gomme sélectionnée, brouillard caché, musique en lecture) pour se styliser en
    // conséquence, comme le fait déjà MapToolbar avec ses propres boutons.
    activeMapTools: string[];
    setActiveMapTools: (tools: string[]) => void;
}

const ShortcutsContext = createContext<ShortcutsContextType | undefined>(undefined);

const DEFAULT_SHORTCUTS: Record<string, string> = {
    // ========== TABS (Onglets latéraux) ==========
    [SHORTCUT_ACTIONS.TAB_CHAT]: 'C',       // Chat
    [SHORTCUT_ACTIONS.TAB_DICE]: 'D',       // Dice (Dés)
    [SHORTCUT_ACTIONS.TAB_NOTES]: 'N',      // Notes
    [SHORTCUT_ACTIONS.QUICK_NOTE]: 'Shift+N', // Quick Notes (saisie rapide)
    [SHORTCUT_ACTIONS.TAB_COMBAT]: 'I',     // Initiative/Combat
    [SHORTCUT_ACTIONS.TAB_FICHE]: '',       // Fiche de personnage (pas de raccourci par défaut)
    [SHORTCUT_ACTIONS.TAB_ENCOUNTER]: '',   // Générateur de rencontre (pas de raccourci par défaut)
    [SHORTCUT_ACTIONS.TAB_HISTORIQUE]: '',  // Historique (pas de raccourci par défaut)
    [SHORTCUT_ACTIONS.TOGGLE_CUSTOM_BUTTONS_EDIT]: '', // Édition boutons personnalisables (pas de raccourci par défaut)

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
    [SHORTCUT_ACTIONS.TOOL_ERASER]: '',            // Gomme directe (pas de raccourci par défaut)
    [SHORTCUT_ACTIONS.TOOL_MUSIC_PLAY_PAUSE]: '',  // Play/Pause musique (pas de raccourci par défaut)
    [SHORTCUT_ACTIONS.TOOL_FOG_REVEAL_ALL]: '',    // Révéler la carte (pas de raccourci par défaut)
    [SHORTCUT_ACTIONS.TOOL_FOG_HIDE_ALL]: '',      // Cacher la carte (pas de raccourci par défaut)
    [SHORTCUT_ACTIONS.TOOL_FOG_RESET]: '',         // Réinitialiser le brouillard (pas de raccourci par défaut)

    // ========== INTERACTIONS ==========
    [SHORTCUT_ACTIONS.OPEN_BUBBLE_MENU]: 'K', // bulle emoji/texte au-dessus de son perso

    // ========== LANCÉS DE DÉS ==========
    // Basés sur la POSITION physique de la touche (Code:DigitN), pas le caractère
    // produit (e.key) : "1".."7" en haut du clavier quel que soit le layout
    // (AZERTY Mac/Windows, QWERTY...). Sur AZERTY ça reste "1" en minuscule/sans
    // Shift, comme demandé, au lieu des symboles Shift (&é"'(-È) qui ne matchaient
    // que le Mac.
    [SHORTCUT_ACTIONS.ROLL_D4]: 'Code:Digit1',  // Dé 4 faces (touche 1)
    [SHORTCUT_ACTIONS.ROLL_D6]: 'Code:Digit2',  // Dé 6 faces (touche 2)
    [SHORTCUT_ACTIONS.ROLL_D8]: 'Code:Digit3',  // Dé 8 faces (touche 3)
    [SHORTCUT_ACTIONS.ROLL_D10]: 'Code:Digit4', // Dé 10 faces (touche 4)
    [SHORTCUT_ACTIONS.ROLL_D12]: 'Code:Digit5', // Dé 12 faces (touche 5)
    [SHORTCUT_ACTIONS.ROLL_D20]: 'Code:Digit6', // Dé 20 faces (touche 6)
    [SHORTCUT_ACTIONS.ROLL_D100]: 'Code:Digit7',// Dé 100 faces (touche 7)

    // ========== UNDO/REDO ==========
    [SHORTCUT_ACTIONS.UNDO]: 'Ctrl+Z',      // Annuler
    [SHORTCUT_ACTIONS.REDO]: 'Ctrl+Y',      // Refaire (Ctrl+Shift+Z aussi possible sur Mac)

    // ========== SAISIE RAPIDE ==========
    [SHORTCUT_ACTIONS.QUICK_ROLL]: 'Space Enter', // Séquence Espace puis Entrée : ouvre un champ de saisie rapide (notation libre, ex: 1d20)
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
const CUSTOM_STORAGE_KEY = 'vtt-dd-custom-shortcuts';

// Anciennes valeurs par défaut des raccourcis de dés (caractères produits par
// les touches 1..7 sur AZERTY Mac). Des profils sauvegardés avant l'ajout des
// raccourcis "Code:DigitN" (position physique, indépendante du layout) ont
// figé ces symboles dans leur localStorage — on les migre une fois vers le
// nouveau format tant qu'ils n'ont pas été personnalisés par l'utilisateur.
const LEGACY_AZERTY_MAC_DICE_SHORTCUTS: Record<string, string> = {
    [SHORTCUT_ACTIONS.ROLL_D4]: '&',
    [SHORTCUT_ACTIONS.ROLL_D6]: 'É',
    [SHORTCUT_ACTIONS.ROLL_D8]: '"',
    [SHORTCUT_ACTIONS.ROLL_D10]: "'",
    [SHORTCUT_ACTIONS.ROLL_D12]: '(',
    [SHORTCUT_ACTIONS.ROLL_D20]: '-',
    [SHORTCUT_ACTIONS.ROLL_D100]: 'È',
};

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
    const [shortcuts, setShortcuts] = useState<Record<string, string>>(DEFAULT_SHORTCUTS);
    const [customShortcuts, setCustomShortcuts] = useState<CustomShortcut[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isCustomButtonsEditModeActive, setIsCustomButtonsEditModeActive] = useState(false);
    const [activeMapTools, setActiveMapTools] = useState<string[]>([]);

    // History handling
    const keyHistory = useRef<string[]>([]);
    const historyTimeout = useRef<NodeJS.Timeout | null>(null);

    // Registre des abonnés triggerAction/onActionTriggered (boutons personnalisables) :
    // un Map<actionId, Set<callback>> tenu en ref pour ne jamais re-render le provider
    // quand un composant s'abonne/se désabonne.
    const actionListeners = useRef<Map<string, Set<() => void>>>(new Map());

    const triggerAction = useCallback((actionId: string) => {
        actionListeners.current.get(actionId)?.forEach(cb => cb());
    }, []);

    const onActionTriggered = useCallback((actionId: string, callback: () => void) => {
        if (!actionListeners.current.has(actionId)) {
            actionListeners.current.set(actionId, new Set());
        }
        actionListeners.current.get(actionId)!.add(callback);
        return () => {
            actionListeners.current.get(actionId)?.delete(callback);
        };
    }, []);

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
                const merged = { ...DEFAULT_SHORTCUTS, ...JSON.parse(stored) };

                // One-time migration: replace still-legacy AZERTY-Mac dice
                // shortcuts with the layout-independent physical-key default.
                let migrated = false;
                for (const [actionId, legacyValue] of Object.entries(LEGACY_AZERTY_MAC_DICE_SHORTCUTS)) {
                    if (merged[actionId] === legacyValue) {
                        merged[actionId] = DEFAULT_SHORTCUTS[actionId];
                        migrated = true;
                    }
                }
                if (migrated) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
                }

                setShortcuts(merged);
            }

            const storedCustom = localStorage.getItem(CUSTOM_STORAGE_KEY);
            if (storedCustom) {
                setCustomShortcuts(JSON.parse(storedCustom));
            }
        } catch (e) {
            console.error("Failed to load shortcuts", e);
        }
        setIsLoaded(true);
    }, []);

    const updateCustomShortcutsStorage = (newShortcuts: CustomShortcut[]) => {
        setCustomShortcuts(newShortcuts);
        localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(newShortcuts));
    };

    const addCustomShortcut = (shortcut: Omit<CustomShortcut, 'id'>) => {
        const newShortcut = { ...shortcut, id: crypto.randomUUID() };
        updateCustomShortcutsStorage([...customShortcuts, newShortcut]);
    };

    const updateCustomShortcut = (id: string, updates: Partial<CustomShortcut>) => {
        const newShortcuts = customShortcuts.map(s => s.id === id ? { ...s, ...updates } : s);
        updateCustomShortcutsStorage(newShortcuts);
    };

    const removeCustomShortcut = (id: string) => {
        const newShortcuts = customShortcuts.filter(s => s.id !== id);
        updateCustomShortcutsStorage(newShortcuts);
    };

    const updateShortcut = (actionId: string, keyString: string) => {
        const newShortcuts = { ...shortcuts, [actionId]: keyString };
        setShortcuts(newShortcuts);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newShortcuts));
    };

    const resetShortcuts = () => {
        setShortcuts(DEFAULT_SHORTCUTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SHORTCUTS));
    };

    // Compare the current event against one token of a shortcut sequence.
    // Tokens prefixed "Code:" (used by the default dice shortcuts) match the
    // PHYSICAL key position (event.code, e.g. "Digit1") instead of the
    // character produced (event.key) — that's what keeps "1".."7" mapped to
    // the same top-row keys regardless of keyboard layout (AZERTY Mac/Windows,
    // QWERTY...). Custom/recorded shortcuts keep using formatKeyEvent (e.key).
    const matchesToken = (event: KeyboardEvent, currentKey: string, token: string): boolean => {
        if (token.startsWith('Code:')) {
            return event.code === token.slice('Code:'.length);
        }
        return currentKey === token;
    };

    const checkKeyCombination = (event: KeyboardEvent, keyString: string): boolean => {
        if (!keyString) return false;

        // Ignore if user is typing in an input
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
            return false;
        }

        const currentKey = formatKeyEvent(event);

        // Handle sequences (space separated)
        const sequence = keyString.split(' ');

        if (sequence.length === 1) {
            // Simple shortcut
            return matchesToken(event, currentKey, sequence[0]);
        }

        // Complex shortcut
        // Check if [history + current] ends with sequence
        if (!matchesToken(event, currentKey, sequence[sequence.length - 1])) return false;

        // Le listener d'historique (useEffect plus haut) s'exécute avant ce check et pousse
        // déjà la touche COURANTE dans keyHistory — donc son dernier élément est toujours
        // égal à currentKey à ce stade, pas la touche précédente. On l'exclut avant de
        // comparer, sinon une séquence "A B" ne matche jamais sur l'événement B (le dernier
        // élément de l'historique serait "B" au lieu de "A").
        const previousKeys = keyHistory.current[keyHistory.current.length - 1] === currentKey
            ? keyHistory.current.slice(0, -1)
            : keyHistory.current;

        // Optim check: last key matches. Now check previous keys.
        // We need (sequence.length - 1) previous keys from history
        const needed = sequence.length - 1;
        if (previousKeys.length < needed) return false;

        const historySlice = previousKeys.slice(-needed);
        const sequenceSlice = sequence.slice(0, needed);

        // Array compare
        return historySlice.every((k, i) => k === sequenceSlice[i]);
    };

    const isShortcutPressed = (event: KeyboardEvent, actionId: string): boolean => {
        const shortcut = shortcuts[actionId];
        return checkKeyCombination(event, shortcut);
    };

    const getShortcutLabel = (actionId: string) => {
        const raw = shortcuts[actionId] || '';
        // "Code:Digit1" -> "1" for display; storage keeps the physical-key form.
        return raw.replace(/Code:Digit(\d)/g, '$1');
    };

    return (
        <ShortcutsContext.Provider value={{
            shortcuts,
            updateShortcut,
            resetShortcuts,
            isShortcutPressed,
            checkKeyCombination,
            getShortcutLabel,
            customShortcuts,
            addCustomShortcut,
            updateCustomShortcut,
            removeCustomShortcut,
            triggerAction,
            onActionTriggered,
            isCustomButtonsEditModeActive,
            setIsCustomButtonsEditModeActive,
            activeMapTools,
            setActiveMapTools,
        }}>
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
