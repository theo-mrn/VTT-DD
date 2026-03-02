import React from 'react';
import { TokenSkin } from './token-definitions';
import { Lock, Check, Zap, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface TokenCardProps {
    skin: TokenSkin;
    src: string; // The image source from the API
    isOwned: boolean;
    isEquipped: boolean;
    canAfford: boolean;
    onBuy: () => void;
    onEquip: () => void;
}

export function TokenCard({ skin, src, isOwned, isEquipped, canAfford, onBuy, onEquip }: TokenCardProps) {
    const isPremiumOnly = skin.unlockCondition === 'purchase' && skin.price === 0; // If you want to define some as premium only without a price

    return (
        <div
            className="group relative flex flex-col rounded-xl overflow-hidden shadow-md transition-all duration-300"
            style={{
                background: 'var(--bg-card)',
                border: isEquipped ? '1px solid var(--accent-brown)' : '1px solid var(--border-color)',
                boxShadow: isEquipped ? '0 0 0 1px var(--accent-brown)' : 'none'
            }}
        >
            {/* Image Preview Container */}
            <div className="relative aspect-square w-full bg-black/40 p-4 shrink-0 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-5 pointer-events-none" />

                {/* Visual rarity background glow */}
                <div className="absolute inset-0 opacity-20 transition-opacity group-hover:opacity-40" />

                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="relative w-full h-full perspective-[1000px] flex items-center justify-center"
                >
                    <img
                        src={src}
                        alt={skin.name}
                        className={cn(
                            "w-full h-full object-contain transition-transform duration-500",
                            !isOwned && "grayscale-[0.5] opacity-80"
                        )}
                        style={{
                            filter: !isOwned ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' : 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))'
                        }}
                    />
                </motion.div>

                {/* Status Badges overlay */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
                    {isEquipped && (
                        <div className="bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/20 shadow-lg">
                            <Check className="w-3.5 h-3.5 text-green-400" strokeWidth={3} />
                        </div>
                    )}
                    {!isOwned && (
                        <div className="bg-black/60 backdrop-blur-md rounded-full p-1 border border-white/10">
                            <Lock className="w-3.5 h-3.5 text-neutral-400" />
                        </div>
                    )}
                </div>

                {skin.rarity !== 'common' && (
                    <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm border border-white/10">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-300">
                            {skin.rarity}
                        </span>
                    </div>
                )}
            </div>

            {/* Info Section */}
            <div className="flex flex-col flex-1 p-3 gap-1 relative z-10" style={{ background: 'var(--bg-darker)' }}>
                <h3 className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>{skin.name}</h3>
                <p className="text-[10px] line-clamp-2 leading-relaxed h-7" style={{ color: 'var(--text-secondary)' }}>
                    {skin.description}
                </p>

                <div className="mt-auto pt-2">
                    {isOwned ? (
                        <button
                            onClick={onEquip}
                            disabled={isEquipped}
                            className={cn(
                                "w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200",
                                isEquipped
                                    ? "bg-neutral-800/50 text-neutral-500 cursor-not-allowed border border-neutral-800/50"
                                    : "text-white shadow-sm hover:shadow-md active:scale-95"
                            )}
                            style={{
                                background: isEquipped ? 'undefined' : 'var(--accent-brown)',
                                border: isEquipped ? 'undefined' : '1px solid color-mix(in srgb, var(--accent-brown) 80%, white)'
                            }}
                        >
                            {isEquipped ? 'Équipé' : 'Équiper'}
                        </button>
                    ) : (
                        <button
                            onClick={onBuy}
                            disabled={!canAfford}
                            className={cn(
                                "w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all duration-200",
                                "bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 hover:text-emerald-400 disabled:opacity-50 border border-emerald-600/20 hover:border-emerald-600/40"
                            )}
                        >
                            {skin.price > 0 ? (
                                <>
                                    <ShoppingCart className="w-3.5 h-3.5" />
                                    {skin.price} <img src="/diamond.png" alt="gems" className="w-3 h-3 inline-block -ml-0.5 opacity-80" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                </>
                            ) : skin.unlockCondition === 'challenge' ? (
                                <>
                                    <Zap className="w-3.5 h-3.5 text-yellow-500" />
                                    Quête
                                </>
                            ) : isPremiumOnly ? (
                                <>
                                    <Lock className="w-3.5 h-3.5" />
                                    Premium
                                </>
                            ) : (
                                "Gratuit"
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
