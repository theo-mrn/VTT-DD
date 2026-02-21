'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useGame } from '@/contexts/GameContext';
import { saveUserSettings, ThemeName } from '@/lib/saveSettings';
import { cn } from '@/lib/utils';

const THEMES: {
    key: ThemeName;
    label: string;
    accent: string;
    bg: string;
    border: string;
    text: string;
    ring: string;
}[] = [
        {
            key: 'dark',
            label: 'Défaut',
            accent: '#c0a080',
            bg: '#18181b',
            border: '#2a2a2a',
            text: '#d4d4d4',
            ring: '#c0a080',
        },
        {
            key: 'forest',
            label: 'Forêt',
            accent: '#6abf6a',
            bg: '#162016',
            border: '#233223',
            text: '#c8d8c0',
            ring: '#6abf6a',
        },
        {
            key: 'crimson',
            label: 'Sang & Feu',
            accent: '#c0504a',
            bg: '#201212',
            border: '#331818',
            text: '#d8c8c0',
            ring: '#c0504a',
        },
        {
            key: 'parchment',
            label: 'Parchemin',
            accent: '#8b5e2c',
            bg: '#f5eedc',
            border: '#c8b890',
            text: '#2c1e0e',
            ring: '#8b5e2c',
        },
        {
            key: 'midnight',
            label: 'Minuit',
            accent: '#4aa8d8',
            bg: '#121c30',
            border: '#1e2e48',
            text: '#c8d8e8',
            ring: '#4aa8d8',
        },
    ];

export function ThemeSwitcher() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const { user } = useGame();
    // Needed to avoid hydration mismatch with next-themes
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const currentTheme = (mounted ? (resolvedTheme ?? theme) : 'dark') as ThemeName;

    const handleSelect = async (newTheme: ThemeName) => {
        setTheme(newTheme);
        if (user?.uid) {
            await saveUserSettings(user.uid, { theme: newTheme });
        }
    };

    return (
        <div className="grid grid-cols-5 gap-2">
            {THEMES.map((t) => {
                const isActive = currentTheme === t.key;
                return (
                    <button
                        key={t.key}
                        title={t.label}
                        onClick={() => handleSelect(t.key)}
                        className={cn(
                            'relative flex flex-col items-center gap-1.5 rounded-lg p-2 border transition-all duration-200',
                            isActive
                                ? 'scale-[1.05] shadow-lg'
                                : 'opacity-60 hover:opacity-100 hover:scale-[1.03]'
                        )}
                        style={{
                            background: t.bg,
                            borderColor: isActive ? t.ring : t.border,
                            boxShadow: isActive ? `0 0 0 2px ${t.ring}` : undefined,
                        }}
                    >
                        {/* Mini preview */}
                        <div
                            className="w-full h-8 rounded-md flex items-center justify-center text-[10px] font-bold font-title"
                            style={{ color: t.accent }}
                        >
                            Aa
                        </div>
                        {/* Accent dot */}
                        <div className="w-3 h-3 rounded-full" style={{ background: t.accent }} />
                        {/* Label */}
                        <span className="text-[9px] font-semibold leading-none" style={{ color: t.text }}>
                            {t.label}
                        </span>
                        {/* Active checkmark */}
                        {isActive && (
                            <span
                                className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px]"
                                style={{ background: t.ring, color: t.bg }}
                            >
                                ✓
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
