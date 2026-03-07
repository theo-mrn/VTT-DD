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
            key: 'tavern',
            label: 'Taverne',
            accent: '#96613d',
            bg: '#281d15',
            border: '#443224',
            text: '#e6dac3',
            ring: '#96613d',
        },
        {
            key: 'dungeon',
            label: 'Donjon',
            accent: '#3b5f70',
            bg: '#15181e',
            border: '#2b303b',
            text: '#b4bcc8',
            ring: '#3b5f70',
        },
        {
            key: 'royal',
            label: 'Cour Royale',
            accent: '#c7a442',
            bg: '#281017',
            border: '#4a1f2c',
            text: '#e6d3a8',
            ring: '#c7a442',
        },
        {
            key: 'druid',
            label: 'Bosquet',
            accent: '#547d41',
            bg: '#141c15',
            border: '#273829',
            text: '#dce6cc',
            ring: '#547d41',
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
