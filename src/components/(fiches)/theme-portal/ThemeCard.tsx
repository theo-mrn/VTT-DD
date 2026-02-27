import React, { useState, useEffect } from 'react';
import { Download, Heart, User, Edit2, Trash2 } from 'lucide-react';
import { ThemeConfig, CommunityTheme } from './types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface ThemeCardProps {
    theme: CommunityTheme;
    onApply: (config: ThemeConfig) => void;
    onHover: (theme: ThemeConfig['theme']) => void;
    onLeave: () => void;
    isPreviewLocked?: boolean;
    onTogglePreviewLock?: () => void;
    currentUserId?: string;
    onToggleLike?: (themeId: string, isLiked: boolean) => void;
    onEdit?: (theme: CommunityTheme) => void;
    onDelete?: (themeId: string) => void;
}

export function ThemeCard({ theme, onApply, onHover, onLeave, isPreviewLocked, onTogglePreviewLock, currentUserId, onToggleLike, onEdit, onDelete }: ThemeCardProps) {
    const { config } = theme;
    const themeColors = config.theme;

    const isLiked = currentUserId && theme.likedBy?.includes(currentUserId);

    const [authorData, setAuthorData] = useState<{ name: string, pp: string | null } | null>(null);

    useEffect(() => {
        const fetchAuthorData = async () => {
            if (!theme.authorId) return;
            try {
                const userDoc = await getDoc(doc(db, 'users', theme.authorId));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setAuthorData({
                        name: data.name || theme.authorName,
                        pp: data.pp || null
                    });
                }
            } catch (err) {
                console.error("Error fetching author data:", err);
            }
        };

        fetchAuthorData();
    }, [theme.authorId, theme.authorName]);

    const displayName = authorData?.name || theme.authorName;

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString();
    };

    return (
        <div
            className={`bg-[#1c1c1c] border rounded-lg p-3 flex items-center justify-between gap-4 transition-all relative group cursor-pointer ${isPreviewLocked ? 'border-[#80c0a0] shadow-[0_0_15px_rgba(128,192,160,0.2)]' : 'border-[#3a3a3a] hover:border-[#d4b48f]/60'}`}
            onPointerEnter={() => onHover(theme.config.theme)}
            onPointerLeave={onLeave}
            onClick={onTogglePreviewLock}
        >
            <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2 pr-2">
                    <h4 className="text-sm font-bold text-[#d4d4d4] truncate uppercase">{theme.name}</h4>
                    {onToggleLike && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleLike(theme.id, !!isLiked); }}
                            className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${isLiked ? 'text-pink-400 bg-pink-400/10 hover:bg-pink-400/20' : 'text-[#888] hover:text-[#bbb] hover:bg-[#333]'
                                }`}
                            aria-label={isLiked ? "Unlike" : "Like"}
                        >
                            <Heart size={12} className={isLiked ? "fill-pink-400" : ""} />
                            <span>{theme.likes || 0}</span>
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                    {authorData?.pp ? (
                        <img src={authorData.pp} alt={displayName} className="w-5 h-5 rounded-full object-cover border border-[#444]" />
                    ) : (
                        <div className="w-5 h-5 rounded-full bg-[#2a2a2a] border border-[#444] flex items-center justify-center text-[#888]">
                            <User size={10} />
                        </div>
                    )}
                    <p className="text-xs text-[#a0a0a0] truncate">par <span className="text-[#d4b48f] font-medium">{displayName}</span></p>
                </div>

                {/* Color swatches */}
                <div className="flex gap-2 items-center mt-2">
                    <div
                        className="w-5 h-5 rounded-full border border-[#444] shadow-sm"
                        style={{ background: themeColors.theme_background }}
                        title="Fond"
                    />
                    <div
                        className="w-5 h-5 rounded-full border border-[#444] shadow-sm"
                        style={{ background: themeColors.theme_secondary_color }}
                        title="Blocs"
                    />
                    <div
                        className="w-5 h-5 rounded-full border border-[#444] shadow-sm flex items-center justify-center font-bold text-[9px]"
                        style={{ background: '#222', color: themeColors.theme_text_color }}
                        title="Texte Primaire"
                    >
                        A
                    </div>
                    <div
                        className="w-5 h-5 rounded-full border border-[#444] shadow-sm flex items-center justify-center font-bold text-[9px]"
                        style={{ background: '#222', color: themeColors.theme_text_secondary_color }}
                        title="Texte Secondaire"
                    >
                        a
                    </div>
                </div>
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {isPreviewLocked && (
                    <span className="text-[10px] text-[#80c0a0] font-bold bg-[#80c0a0]/10 px-2 py-0.5 rounded border border-[#80c0a0]/30 absolute top-2 right-2">Fixé</span>
                )}
                <div className="flex gap-2 mt-auto">
                    {onEdit && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEdit(theme); }}
                            className="bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-darker)] px-2 py-1.5 rounded text-xs font-semibold flex items-center transition-all"
                            title="Modifier"
                        >
                            <Edit2 size={14} />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(theme.id); }}
                            className="bg-[var(--bg-card)] border border-[var(--border-color)] text-red-500 hover:text-red-600 hover:bg-[var(--bg-darker)] px-2 py-1.5 rounded text-xs font-semibold flex items-center transition-all"
                            title="Supprimer"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); onApply(config); }}
                        className="button-primary !px-3 !py-1.5 !text-xs flex items-center gap-1 shadow-sm"
                    >
                        <Download size={14} />
                        Appliquer
                    </button>
                </div>
            </div>
        </div>
    );
}
