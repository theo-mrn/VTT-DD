import React from 'react';
import { Download } from 'lucide-react';
import { ThemeConfig } from './types';

interface ThemeCardProps {
    theme: {
        id: string;
        name: string;
        authorName: string;
        createdAt: number;
        config: ThemeConfig;
    };
    onApply: (config: ThemeConfig) => void;
    onHover: (theme: ThemeConfig['theme']) => void;
    onLeave: () => void;
}

export function ThemeCard({ theme, onApply, onHover, onLeave }: ThemeCardProps) {
    const { config } = theme;
    const themeColors = config.theme;

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div
            className="bg-[#1c1c1c] border border-[#3a3a3a] rounded-lg p-4 flex flex-col gap-3 hover:border-[#d4b48f]/60 transition-all relative group cursor-pointer"
            onMouseEnter={() => onHover(theme.config.theme)}
            onMouseLeave={onLeave}
        >
            <div className="flex justify-between items-start">
                <div>
                    <h4 className="text-sm font-bold text-[#d4d4d4] truncate pr-2">{theme.name}</h4>
                    <p className="text-xs text-[#a0a0a0]">par {theme.authorName}</p>
                </div>
            </div>

            {/* Color swatches */}
            <div className="flex gap-2 items-center my-1">
                <div
                    className="w-6 h-6 rounded-full border border-[#444] shadow-sm"
                    style={{ background: themeColors.theme_background }}
                    title="Fond"
                />
                <div
                    className="w-6 h-6 rounded-full border border-[#444] shadow-sm"
                    style={{ background: themeColors.theme_secondary_color }}
                    title="Blocs"
                />
                <div
                    className="w-6 h-6 rounded-full border border-[#444] shadow-sm flex items-center justify-center font-bold text-[10px]"
                    style={{ background: '#222', color: themeColors.theme_text_color }}
                    title="Texte Primaire"
                >
                    A
                </div>
                <div
                    className="w-6 h-6 rounded-full border border-[#444] shadow-sm flex items-center justify-center font-bold text-[10px]"
                    style={{ background: '#222', color: themeColors.theme_text_secondary_color }}
                    title="Texte Secondaire"
                >
                    a
                </div>
                <div
                    className="flex-1 h-4 rounded border border-[#444]"
                    style={{
                        background: themeColors.theme_secondary_color,
                        borderRadius: `${themeColors.theme_border_radius ?? 8}px`
                    }}
                    title="Arrondi des blocs"
                />
            </div>

            <div className="flex justify-between items-center mt-auto pt-2 border-t border-[#2a2a2a]">
                <span className="text-[10px] text-[#666]">{formatDate(theme.createdAt)}</span>
                <button
                    onClick={(e) => { e.stopPropagation(); onApply(config); }}
                    className="bg-blue-900/40 text-blue-300 hover:bg-blue-800/60 px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 transition-all"
                >
                    <Download size={14} />
                    Appliquer
                </button>
            </div>
        </div>
    );
}
