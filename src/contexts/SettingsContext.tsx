'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useGame } from '@/contexts/GameContext';
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

/** Syncs the theme from Firestore to next-themes. Kept separate so it can
 *  safely call useTheme() which requires being inside ThemeProvider. */
function ThemeSyncFromDB({ userId }: { userId: string | undefined }) {
    const { setTheme } = useTheme();

    useEffect(() => {
        if (!userId) return;

        const userRef = doc(db, 'users', userId);
        const unsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const theme = docSnap.data()?.settings?.theme as ThemeName | undefined;
                if (theme) {
                    setTheme(theme);
                }
            }
        });

        return () => unsubscribe();
    }, [userId, setTheme]);

    return null;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
    const { user } = useGame();

    // State - only defaults, will be overwritten by DB
    const [cursorColor, setCursorColor] = useState('#000000');
    const [cursorTextColor, setCursorTextColor] = useState('#ffffff');
    const [showMyCursor, setShowMyCursor] = useState(true);
    const [showOtherCursors, setShowOtherCursors] = useState(true);

    const [showGrid, setShowGrid] = useState(false);
    const [showFogGrid, setShowFogGrid] = useState(false);
    const [showCharBorders, setShowCharBorders] = useState(true);
    const [globalTokenScale, setGlobalTokenScale] = useState(1);
    const [performanceMode, setPerformanceMode] = useState<'high' | 'eco' | 'static'>('high');

    const [showBackgroundSelector, setShowBackgroundSelector] = useState(false);

    const [isHydrated, setIsHydrated] = useState(false);

    // Subscribe to Firestore updates (READ ONLY - NO WRITES)
    useEffect(() => {
        if (!user || !user.uid) {
            setIsHydrated(true);
            return;
        }

        const userRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const settings = data.settings || {};

                if (settings.cursorColor !== undefined) setCursorColor(settings.cursorColor);
                if (settings.cursorTextColor !== undefined) setCursorTextColor(settings.cursorTextColor);
                if (settings.showMyCursor !== undefined) setShowMyCursor(settings.showMyCursor);
                if (settings.showOtherCursors !== undefined) setShowOtherCursors(settings.showOtherCursors);

                if (settings.showGrid !== undefined) setShowGrid(settings.showGrid);
                if (settings.showFogGrid !== undefined) setShowFogGrid(settings.showFogGrid);
                if (settings.showCharBorders !== undefined) setShowCharBorders(settings.showCharBorders);
                if (settings.globalTokenScale !== undefined) setGlobalTokenScale(Number(settings.globalTokenScale));
                if (settings.performanceMode !== undefined) setPerformanceMode(settings.performanceMode);
            }

            setIsHydrated(true);
        }, (error) => {
            console.error("❌ Error listening to settings:", error);
            setIsHydrated(true);
        });

        return () => unsubscribe();
    }, [user]);

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
            {/* Syncs theme from Firestore → next-themes without polluting context */}
            <ThemeSyncFromDB userId={user?.uid} />
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
