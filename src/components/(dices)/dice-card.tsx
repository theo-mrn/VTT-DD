"use client";

import React from 'react';
import { DiceSkin } from './dice-definitions';
import { DicePreviewCard } from './dice-preview';
import { cn } from '@/lib/utils';
import { Check, ShoppingCart, Eye } from 'lucide-react';

interface DiceCardProps {
    skin: DiceSkin;
    isOwned: boolean;
    isEquipped: boolean;
    canAfford: boolean;
    onBuy: () => void;
    onEquip: () => void;
    /** Ouvre la page de détail du dé — le SEUL endroit où un canvas 3D est monté. */
    onOpen: () => void;
}

// Carte 100% statique : vignette PNG pré-bakée, zéro WebGL, zéro animation de
// montage. La 3D vit exclusivement dans la page de détail (voir
// store/dice-detail.tsx), montée au clic et détruite au retour.
export function DiceCard({ skin, isOwned, isEquipped, canAfford, onBuy, onEquip, onOpen }: DiceCardProps) {
    const getRarityColor = (rarity: string) => {
        switch (rarity) {
            case 'legendary': return 'text-[var(--accent-brown)]';
            case 'epic': return 'text-[var(--accent-blue)]';
            case 'rare': return 'text-blue-500';
            case 'uncommon': return 'text-green-500';
            default: return 'text-[var(--text-secondary)]';
        }
    };

    return (
        <div
            onClick={onOpen}
            className={cn(
                "group relative flex flex-col rounded-2xl overflow-hidden cursor-pointer transition-colors duration-300",
                "bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--accent-brown)]/40",
                isEquipped && "border-[var(--accent-brown)]/40 bg-gradient-to-b from-[var(--bg-darker)] to-[var(--bg-card)]"
            )}
        >
            {/* --- PREVIEW (image pré-bakée uniquement) --- */}
            <div className="relative aspect-square w-full bg-[var(--bg-darker)] overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--text-primary-rgb),0.05)_0%,transparent_100%)]" />
                <div className="w-full h-full scale-95 group-hover:scale-105 transition-transform duration-300">
                    <DicePreviewCard skinId={skin.id} type="d20" active={false} />
                </div>

                {/* Affordance "voir le dé" */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/20">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-dark)]/90 border border-[var(--border-color)] text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]">
                        <Eye className="w-3.5 h-3.5" /> Voir en 3D
                    </div>
                </div>

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
                    <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-md bg-[var(--bg-dark)]/80 border border-[var(--border-color)]", getRarityColor(skin.rarity || 'common'))}>
                        {skin.rarity || 'common'}
                    </span>
                    {isEquipped && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-md text-[9px] font-black uppercase shadow-lg shadow-[var(--accent-brown)]/10">
                            <Check className="w-3 h-3" strokeWidth={4} />
                            Équipé
                        </div>
                    )}
                </div>
            </div>

            {/* --- INFO --- */}
            <div className="flex flex-col flex-1 p-5 gap-0.5">
                <h3 className="text-sm font-black text-[var(--text-primary)] italic truncate uppercase tracking-tight">{skin.name}</h3>
                <p className="text-[10px] font-medium text-[var(--text-secondary)] leading-normal line-clamp-2 h-8 uppercase tracking-tighter">
                    {skin.description}
                </p>

                <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                    {isOwned ? (
                        <button
                            onClick={(e) => { e.stopPropagation(); onEquip(); }}
                            disabled={isEquipped}
                            className={cn(
                                "w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors duration-300",
                                isEquipped
                                    ? "bg-[var(--text-primary)]/5 text-[var(--text-secondary)] cursor-not-allowed border border-transparent"
                                    : "bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] active:scale-95 shadow-lg shadow-[var(--accent-brown)]/5"
                            )}
                        >
                            {isEquipped ? 'Sélectionné' : 'Équiper'}
                        </button>
                    ) : (
                        <button
                            onClick={(e) => { e.stopPropagation(); onBuy(); }}
                            disabled={!canAfford}
                            className={cn(
                                "w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors duration-300",
                                "flex items-center justify-center gap-2",
                                "border border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-primary)] hover:bg-[var(--bg-dark)] hover:border-[var(--text-primary)]/20 active:scale-95 disabled:opacity-50"
                            )}
                        >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            {skin.price === 0 ? 'Gratuit' : `${(skin.price / 100).toFixed(2)} €`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
