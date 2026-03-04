'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useGame } from '@/contexts/GameContext';
import { saveUserSettings } from '@/lib/saveSettings';
import type { ThemeName } from '@/lib/saveSettings';

interface SettingsContextType {
    // Cursor Settings
    cursorColor: string;
    setCursorColor: (color: string) => void;
    cursorTextColor: string;
    setCursorTextColor: (color: string) => void;
    showMyCursor: boolean;
    setShowMyCursor: (show: boolean) => void;
    showOtherCursors: boolean;
    setShowOtherCursors: (show: boolean) => void;

    // Map Appearance
    showGrid: boolean;
    setShowGrid: (show: boolean) => void;
    showFogGrid: boolean;
    setShowFogGrid: (show: boolean) => void;
    showCharBorders: boolean;
    setShowCharBorders: (show: boolean) => void;
    globalTokenScale: number;
    setGlobalTokenScale: (scale: number) => void;

    // Performance / Other
    performanceMode: 'high' | 'eco' | 'static';
    setPerformanceMode: (mode: 'high' | 'eco' | 'static') => void;

    // UI State
    showBackgroundSelector: boolean;
    setShowBackgroundSelector: (show: boolean) => void;

    isHydrated: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// ─── Refactored Provider ───────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
    const { user } = useGame();
    const { setTheme } = useTheme();

    // State
    const [cursorColor, setCursorColorState] = useState('#000000');
    const [cursorTextColor, setCursorTextColorState] = useState('#ffffff');
    const [showMyCursor, setShowMyCursorState] = useState(true);
    const [showOtherCursors, setShowOtherCursorsState] = useState(true);
    const [showGrid, setShowGridState] = useState(false);
    const [showFogGrid, setShowFogGridState] = useState(false);
    const [showCharBorders, setShowCharBordersState] = useState(true);
    const [globalTokenScale, setGlobalTokenScaleState] = useState(1);
    const [performanceMode, setPerformanceModeState] = useState<'high' | 'eco' | 'static'>('high');
    const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);
    const [isHydrated, setIsHydrated] = useState(false);

    // Persistence Refs
    const pendingUpdatesRef = React.useRef<Record<string, any>>({});
    const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    // Persistence Helper (Debounced Firestore + Instant LocalStorage)
    const updateSetting = (key: string, value: any, setter: (v: any) => void) => {
        // 1. Instant UI update
        setter(value);

        if (!user?.uid) return;

        // 2. Instant LocalStorage update (for subsequent refreshes)
        try {
            const localKey = `vtt_settings_${user.uid}`;
            const existing = JSON.parse(localStorage.getItem(localKey) || '{}');
            localStorage.setItem(localKey, JSON.stringify({ ...existing, [key]: value }));
        } catch (e) {
            console.error("Failed to save to localStorage", e);
        }

        // 3. Debounced Firestore update
        pendingUpdatesRef.current[key] = value;

        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

        saveTimeoutRef.current = setTimeout(async () => {
            const updates = { ...pendingUpdatesRef.current };
            pendingUpdatesRef.current = {}; // Clear buffer
            saveTimeoutRef.current = null;

            try {
                await saveUserSettings(user.uid, updates);
            } catch (error) {
                console.error("❌ Failed to sync settings to Firestore:", error);
                // Optionally: merge back into pending if failed, but risk loops
            }
        }, 1500); // 1.5s delay fits group of changes
    };

    // Public Setters (Wrapped with persistence)
    const setCursorColor = (v: string) => updateSetting('cursorColor', v, setCursorColorState);
    const setCursorTextColor = (v: string) => updateSetting('cursorTextColor', v, setCursorTextColorState);
    const setShowMyCursor = (v: boolean) => updateSetting('showMyCursor', v, setShowMyCursorState);
    const setShowOtherCursors = (v: boolean) => updateSetting('showOtherCursors', v, setShowOtherCursorsState);
    const setShowGrid = (v: boolean) => updateSetting('showGrid', v, setShowGridState);
    const setShowFogGrid = (v: boolean) => updateSetting('showFogGrid', v, setShowFogGridState);
    const setShowCharBorders = (v: boolean) => updateSetting('showCharBorders', v, setShowCharBordersState);
    const setGlobalTokenScale = (v: number) => updateSetting('globalTokenScale', v, setGlobalTokenScaleState);
    const setPerformanceMode = (v: 'high' | 'eco' | 'static') => updateSetting('performanceMode', v, setPerformanceModeState);

    // Initial Hydration & Fetch
    useEffect(() => {
        async function hydrate() {
            if (!user?.uid) {
                setIsHydrated(true);
                return;
            }

            // A. Instant hydration from LocalStorage
            try {
                const localKey = `vtt_settings_${user.uid}`;
                const localData = localStorage.getItem(localKey);
                if (localData) {
                    const settings = JSON.parse(localData);
                    if (settings.cursorColor !== undefined) setCursorColorState(settings.cursorColor);
                    if (settings.cursorTextColor !== undefined) setCursorTextColorState(settings.cursorTextColor);
                    if (settings.showMyCursor !== undefined) setShowMyCursorState(settings.showMyCursor);
                    if (settings.showOtherCursors !== undefined) setShowOtherCursorsState(settings.showOtherCursors);
                    if (settings.showGrid !== undefined) setShowGridState(settings.showGrid);
                    if (settings.showFogGrid !== undefined) setShowFogGridState(settings.showFogGrid);
                    if (settings.showCharBorders !== undefined) setShowCharBordersState(settings.showCharBorders);
                    if (settings.globalTokenScale !== undefined) setGlobalTokenScaleState(Number(settings.globalTokenScale));
                    if (settings.performanceMode !== undefined) setPerformanceModeState(settings.performanceMode);
                    if (settings.theme) setTheme(settings.theme);
                    // We don't set isHydrated yet, wait for Firestore to be source of truth
                }
            } catch (e) {
                console.warn("LocalStorage hydration failed", e);
            }

            // B. Fetch from Firestore (Source of Truth)
            try {
                const docRef = doc(db, 'users', user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const settings = docSnap.data().settings || {};
                    if (settings.cursorColor !== undefined) setCursorColorState(settings.cursorColor);
                    if (settings.cursorTextColor !== undefined) setCursorTextColorState(settings.cursorTextColor);
                    if (settings.showMyCursor !== undefined) setShowMyCursorState(settings.showMyCursor);
                    if (settings.showOtherCursors !== undefined) setShowOtherCursorsState(settings.showOtherCursors);
                    if (settings.showGrid !== undefined) setShowGridState(settings.showGrid);
                    if (settings.showFogGrid !== undefined) setShowFogGridState(settings.showFogGrid);
                    if (settings.showCharBorders !== undefined) setShowCharBordersState(settings.showCharBorders);
                    if (settings.globalTokenScale !== undefined) setGlobalTokenScaleState(Number(settings.globalTokenScale));
                    if (settings.performanceMode !== undefined) setPerformanceModeState(settings.performanceMode);
                    if (settings.theme) setTheme(settings.theme);

                    // Update local storage with fresh data from source
                    localStorage.setItem(`vtt_settings_${user.uid}`, JSON.stringify(settings));
                }
            } catch (error) {
                console.error("❌ Error fetching settings:", error);
            } finally {
                setIsHydrated(true);
            }
        }

        hydrate();

        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [user, setTheme]);

    return (
        <SettingsContext.Provider value={{
            cursorColor, setCursorColor,
            cursorTextColor, setCursorTextColor,
            showMyCursor, setShowMyCursor,
            showOtherCursors, setShowOtherCursors,
            showGrid, setShowGrid,
            showFogGrid, setShowFogGrid,
            showCharBorders, setShowCharBorders,
            globalTokenScale, setGlobalTokenScale,
            performanceMode, setPerformanceMode,
            showBackgroundSelector, setShowBackgroundSelector,
            isHydrated
        }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}
