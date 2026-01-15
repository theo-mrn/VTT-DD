import React, { useState } from 'react';
import { DiceSkin } from './dice-definitions';
import { StaticDie2D, DicePreview } from './dice-preview';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Gem } from 'lucide-react';
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
    const [isHovered, setIsHovered] = useState(false);

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
            className={cn(
                "relative flex flex-col rounded-xl overflow-hidden border transition-all duration-300 bg-[#1a1b1e]",
                isEquipped ? "border-[var(--accent-gold)] shadow-[0_0_15px_rgba(255,215,0,0.15)]" : "border-white/10 hover:border-white/30",
                (!isOwned && !canAfford) ? "opacity-75" : ""
            )}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            {/* Haut de carte - Preview */}
            <div className="relative aspect-square w-full bg-black/20 p-4">
                <div className="absolute inset-0 flex items-center justify-center p-6">
                    {/* Static 2D version - always rendered */}
                    <div className={cn("absolute inset-0 transition-opacity duration-300 p-6", isHovered ? 'opacity-0' : 'opacity-100')}>
                        <StaticDie2D skinId={skin.id} type="d20" />
                    </div>

                    {/* 3D animated version - only visible on hover */}
                    <div className={cn("absolute inset-0 transition-opacity duration-300", isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
                        {isHovered && <DicePreview skinId={skin.id} type="d20" className="w-full h-full" />}
                    </div>
                </div>

                {/* Badge Rareté */}
                <div className="absolute top-2 right-2">
                    <Badge variant="outline" className={cn("text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 border h-auto", getRarityColor(skin.rarity) || "")}>
                        {skin.rarity === 'common' ? 'Commun' : skin.rarity}
                    </Badge>
                </div>

                {/* Badge Equipé */}
                {isEquipped && (
                    <div className="absolute top-2 left-2 bg-[var(--accent-gold)] text-black text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        ÉQUIPÉ
                    </div>
                )}
            </div>

            {/* Bas de carte - Infos & Action */}
            <div className="p-3 flex flex-col gap-2 flex-grow bg-[#242529]">
                <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)] truncate" title={skin.name}>
                        {skin.name}
                    </h3>
                    <p className="text-[10px] text-[var(--text-secondary)] line-clamp-2 min-h-[2.5em] leading-tight mt-0.5">
                        {skin.description}
                    </p>
                </div>

                <div className="mt-auto pt-2">
                    {isOwned ? (
                        <Button
                            variant={isEquipped ? "secondary" : "default"}
                            size="sm"
                            className={cn(
                                "w-full text-xs font-medium h-8",
                                isEquipped ? "bg-white/10 text-white hover:bg-white/20" : "button-primary"
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
                                "w-full text-xs font-bold h-8 flex items-center justify-between px-3",
                                canAfford ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500" : "bg-gray-700 text-gray-400 cursor-not-allowed"
                            )}
                            onClick={onBuy}
                            disabled={!canAfford}
                        >
                            <span className="flex items-center gap-1">
                                {canAfford ? "Acheter" : "Pas assez d'or"}
                            </span>
                            <span className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded">
                                {skin.price} <Gem className="w-3 h-3 text-[var(--accent-gold)]" />
                            </span>
                        </Button>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
