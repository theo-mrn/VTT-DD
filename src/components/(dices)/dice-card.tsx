"use client";

import React, { useRef, useState, useEffect } from 'react';
import { DiceSkin } from './dice-definitions';
import { DicePreview } from './dice-preview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

interface DiceCardProps {
    skin: DiceSkin;
    isOwned: boolean;
    isEquipped: boolean;
    canAfford: boolean;
    onBuy: () => void;
    onEquip: () => void;
}

export function DiceCard({ skin, isOwned, isEquipped, canAfford, onBuy, onEquip }: DiceCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    // Only mount the 3D Canvas when this card is visible in the scroll area.
    // This keeps the number of simultaneous WebGL contexts within browser limits (~16).
    // We never exceed ~12–15 visible cards at once in the modal viewport.
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.05 }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const getRarityColor = (rarity: string | undefined) => {
        switch (rarity) {
            case 'legendary': return 'text-orange-400 border-orange-400/50 bg-orange-950/30';
            case 'epic': return 'text-purple-400 border-purple-400/50 bg-purple-950/30';
            case 'rare': return 'text-blue-400 border-blue-400/50 bg-blue-950/30';
            case 'uncommon': return 'text-green-400 border-green-400/50 bg-green-950/30';
            default: return 'text-gray-400 border-gray-400/50 bg-gray-950/30';
        }
    };

    return (
        <motion.div
            ref={cardRef}
            className={cn(
                "relative flex flex-col rounded-xl overflow-hidden border transition-all duration-300 bg-[#1a1b1e]",
                isEquipped
                    ? "border-[var(--accent-gold)] shadow-[0_0_15px_rgba(255,215,0,0.15)] ring-1 ring-amber-500/50"
                    : "border-white/10 hover:border-white/30",
                (!isOwned && !canAfford) ? "opacity-75" : ""
            )}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
        >
            {/* 3D Preview — Canvas only mounted when this card intersects the viewport */}
            <div className="relative aspect-square w-full bg-gradient-to-b from-black/50 to-black/20">
                {isVisible && (
                    <DicePreview
                        skinId={skin.id}
                        type="d20"
                        className="absolute inset-0 w-full h-full"
                    />
                )}

                {/* Badge Rareté */}
                <div className="absolute top-2 right-2 z-10">
                    <Badge
                        variant="outline"
                        className={cn(
                            "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0 border",
                            getRarityColor(skin.rarity) || ""
                        )}
                    >
                        {skin.rarity === 'common' ? 'Commun' : skin.rarity}
                    </Badge>
                </div>

                {/* Badge Équipé */}
                {isEquipped && (
                    <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-amber-400 to-amber-600 text-amber-950 shadow-[0_0_10px_rgba(251,191,36,0.3)] text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-2.5 h-2.5" />
                        ÉQUIPÉ
                    </div>
                )}
            </div>

            {/* Infos & Action */}
            <div className="px-3 flex flex-col gap-1 flex-grow bg-white/[0.03] pt-2 pb-3 border-t border-white/5">
                <div>
                    <h3 className="font-semibold text-sm text-white/90 truncate" title={skin.name}>
                        {skin.name}
                    </h3>
                    <p className="text-[10px] text-white/50 line-clamp-2 min-h-[2.5em] leading-tight mt-0.5">
                        {skin.description}
                    </p>
                </div>

                <div className="mt-1.5 pt-1.5">
                    {isOwned ? (
                        <Button
                            variant={isEquipped ? "secondary" : "default"}
                            size="sm"
                            className={cn(
                                "w-full text-xs font-medium h-7 rounded-md transition-all",
                                isEquipped
                                    ? "bg-white/10 text-white/50 hover:bg-white/20"
                                    : "bg-white/10 text-white hover:bg-white/20"
                            )}
                            onClick={onEquip}
                            disabled={isEquipped}
                        >
                            {isEquipped ? "Équipé" : "Équiper"}
                        </Button>
                    ) : (
                        <Button
                            variant="default"
                            size="sm"
                            className={cn(
                                "w-full text-xs font-bold h-7 rounded-md flex items-center justify-between px-2.5 transition-all shadow-[0_2px_10px_rgba(0,0,0,0.5)]",
                                canAfford
                                    ? "bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-500/50"
                                    : "bg-black/50 text-white/30 cursor-not-allowed border border-white/5"
                            )}
                            onClick={onBuy}
                            disabled={!canAfford}
                        >
                            <span>{canAfford ? "Acheter" : "Fonds insuffisants"}</span>
                            <span className="bg-black/40 px-1.5 py-0.5 rounded text-[10px]">
                                {(skin.price / 100).toFixed(2).replace('.', ',')} €
                            </span>
                        </Button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
