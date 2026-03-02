"use client";

import React from 'react';
import { TokenSkin } from './token-definitions';
import { Lock, Check, Zap, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface TokenCardProps {
    skin: TokenSkin;
    src: string;
    isOwned: boolean;
    isEquipped: boolean;
    canAfford: boolean;
    onBuy: () => void;
    onEquip: () => void;
}

export function TokenCard({ skin, src, isOwned, isEquipped, canAfford, onBuy, onEquip }: TokenCardProps) {
    const isPremiumOnly = skin.unlockCondition === 'purchase' && skin.price === 0;

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
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "group relative flex flex-col rounded-2xl overflow-hidden transition-all duration-500",
                "bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--text-primary)]/20 hover:shadow-[0_0_30px_rgba(var(--accent-brown-rgb),0.03)]",
                isEquipped && "border-[var(--accent-brown)]/40 bg-gradient-to-b from-[var(--bg-darker)] to-[var(--bg-card)]"
            )}
        >
            {/* --- PREVIEW --- */}
            <div className="relative aspect-square w-full bg-[var(--bg-darker)] overflow-hidden flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--text-primary-rgb),0.05)_0%,transparent_100%)]" />

                <img
                    src={src}
                    alt={skin.name}
                    className={cn(
                        "w-full h-full object-contain transition-transform duration-700 group-hover:scale-110",
                        !isOwned && "grayscale-50 opacity-40"
                    )}
                    style={{
                        filter: !isOwned ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' : 'drop-shadow(0 15px 35px rgba(0,0,0,0.4))'
                    }}
                />

                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
                    <span className={cn("text-[9px] font-black uppercase tracking-[0.2em] px-2 py-1 rounded-md bg-[var(--bg-dark)]/80 border border-[var(--border-color)]", getRarityColor(skin.rarity || 'common'))}>
                        {skin.rarity || 'common'}
                    </span>
                    {isEquipped && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--accent-brown)] text-[var(--bg-dark)] rounded-md text-[9px] font-black uppercase shadow-lg shadow-[var(--accent-brown)]/10 animate-in zoom-in-50 duration-300">
                            <Check className="w-3 h-3" strokeWidth={4} />
                            Équipé
                        </div>
                    )}
                    {!isOwned && (
                        <div className="bg-[var(--bg-dark)]/40 backdrop-blur-md rounded-md p-1 border border-[var(--border-color)]/20">
                            <Lock className="w-3 h-3 text-[var(--text-secondary)]" />
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
                            onClick={onEquip}
                            disabled={isEquipped}
                            className={cn(
                                "w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                                isEquipped
                                    ? "bg-[var(--text-primary)]/5 text-[var(--text-secondary)] cursor-not-allowed border border-transparent"
                                    : "bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:scale-[1.02] active:scale-95 shadow-lg shadow-[var(--accent-brown)]/5"
                            )}
                        >
                            {isEquipped ? 'Sélectionné' : 'Équiper'}
                        </button>
                    ) : (
                        <button
                            onClick={onBuy}
                            disabled={!canAfford}
                            className={cn(
                                "w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300",
                                "flex items-center justify-center gap-2",
                                "border border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-primary)] hover:bg-[var(--bg-dark)] hover:border-[var(--text-primary)]/20 active:scale-95 disabled:opacity-50"
                            )}
                        >
                            {skin.price > 0 ? (
                                <>
                                    <ShoppingCart className="w-3.5 h-3.5" />
                                    {`${(skin.price / 100).toFixed(2)} €`}
                                </>
                            ) : skin.unlockCondition === 'challenge' ? (
                                <>
                                    <Zap className="w-3.5 h-3.5 text-yellow-500" />
                                    Challenge
                                </>
                            ) : (
                                "Gratuit"
                            )}
                        </button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
