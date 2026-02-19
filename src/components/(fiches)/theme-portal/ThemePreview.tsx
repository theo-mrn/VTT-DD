import React from 'react';
import { ThemeValues } from './types';
import { useCharacter } from '@/contexts/CharacterContext';

interface ThemePreviewProps {
    theme: ThemeValues | null;
}

const STATS = ['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'] as const;

export function ThemePreview({ theme }: ThemePreviewProps) {
    const { selectedCharacter } = useCharacter();

    if (!theme) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-[#555] text-sm italic gap-2">
                <span className="text-2xl">🎨</span>
                Survolez un thème pour le prévisualiser
            </div>
        );
    }

    const bg = theme.theme_background || '#1c1c1c';
    const block = theme.theme_secondary_color || '#242424';
    const text = theme.theme_text_color || '#d4d4d4';
    const textSec = theme.theme_text_secondary_color || '#a0a0a0';
    const radius = `${theme.theme_border_radius ?? 8}px`;

    const blockStyle: React.CSSProperties = {
        background: block,
        borderRadius: radius,
        border: '1px solid rgba(255,255,255,0.07)',
    };

    const char = selectedCharacter;
    const pv = char?.PV ?? 0;
    const pvMax = char?.PV_Max ?? 1;
    const pvPct = Math.min(100, (pv / pvMax) * 100);

    return (
        <div
            className="w-full h-full overflow-y-auto rounded-lg transition-all duration-200 select-none"
            style={{ background: bg, color: text, padding: '10px' }}
        >
            {/* Header: Avatar + Name */}
            <div className="flex gap-2 mb-2">
                {char?.imageURL ? (
                    <img
                        src={char.imageURL}
                        alt="avatar"
                        className="w-12 h-12 object-cover flex-shrink-0"
                        style={{ borderRadius: radius }}
                    />
                ) : (
                    <div
                        className="w-12 h-12 flex-shrink-0 flex items-center justify-center text-lg"
                        style={{ ...blockStyle, color: textSec }}
                    >
                        🧙
                    </div>
                )}
                <div className="flex-1 flex flex-col justify-center min-w-0" style={{ ...blockStyle, padding: '4px 10px' }}>
                    <div className="text-xs font-bold truncate" style={{ color: text }}>
                        {char?.Nomperso || 'Personnage'}
                    </div>
                    <div className="text-[10px] truncate" style={{ color: textSec }}>
                        {[char?.Race, char?.Profile, char?.niveau ? `Nv. ${char.niveau}` : null].filter(Boolean).join(' • ')}
                    </div>
                </div>
            </div>

            {/* PV Bar */}
            {char && (
                <div className="mb-2 p-1.5" style={blockStyle}>
                    <div className="flex justify-between text-[9px] mb-1" style={{ color: textSec }}>
                        <span className="font-bold">PV</span>
                        <span style={{ color: text }}>{pv}/{pvMax}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                        <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pvPct}%`, background: '#e05555' }}
                        />
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-6 gap-1 mb-2">
                {STATS.map(key => (
                    <div
                        key={key}
                        className="flex flex-col items-center py-1"
                        style={blockStyle}
                    >
                        <span className="text-[8px] font-bold" style={{ color: textSec }}>{key}</span>
                        <span className="text-[11px] font-bold" style={{ color: text }}>{char?.[key] ?? '–'}</span>
                    </div>
                ))}
            </div>

            {/* Combat stats */}
            <div className="grid grid-cols-3 gap-1">
                {[['DEF', char?.Defense], ['INIT', char?.INIT], ['🎲', char?.deVie]].map(([label, val]) => (
                    <div
                        key={String(label)}
                        className="flex flex-col items-center py-1"
                        style={blockStyle}
                    >
                        <span className="text-[8px]" style={{ color: textSec }}>{label}</span>
                        <span className="text-[11px] font-bold" style={{ color: text }}>{val ?? '–'}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
