"use client";

import React, { useRef, useState, useEffect } from 'react';
import { DiceSkin } from './dice-definitions';
import { DicePreviewCard } from './dice-preview';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
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

    const getRarityLabel = (rarity?: string) => {
        switch (rarity) {
            case 'legendary': return 'Légendaire';
            case 'epic': return 'Épique';
            case 'rare': return 'Rare';
            case 'uncommon': return 'Peu commun';
            default: return 'Commun';
        }
    };

    const getRarityStyle = (rarity?: string): React.CSSProperties => {
        switch (rarity) {
            case 'legendary': return { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)' };
            case 'epic': return { color: '#a78bfa', borderColor: 'rgba(167,139,250,0.4)', background: 'rgba(167,139,250,0.08)' };
            case 'rare': return { color: '#60a5fa', borderColor: 'rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.08)' };
            case 'uncommon': return { color: '#4ade80', borderColor: 'rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.08)' };
            default: return { color: 'var(--text-secondary)', borderColor: 'var(--border-color)', background: 'transparent' };
        }
    };

    return (
        <motion.div
            ref={cardRef}
            className="relative flex flex-col overflow-hidden rounded-lg"
            style={{
                background: 'var(--bg-card)',
                border: isEquipped
                    ? '1px solid var(--accent-brown)'
                    : '1px solid var(--border-color)',
                boxShadow: isEquipped
                    ? '0 0 12px color-mix(in srgb, var(--accent-brown) 25%, transparent)'
                    : 'none',
                opacity: (!isOwned && !canAfford) ? 0.6 : 1,
            }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: (!isOwned && !canAfford) ? 0.6 : 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            {/* 3D Preview */}
            <div className="relative aspect-square w-full" style={{ background: 'var(--bg-darker)' }}>
                {isVisible && <DicePreviewCard skinId={skin.id} type="d20" />}

                {/* Rarity badge */}
                <div className="absolute top-1.5 right-1.5 z-10">
                    <span
                        className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border"
                        style={getRarityStyle(skin.rarity)}
                    >
                        {getRarityLabel(skin.rarity)}
                    </span>
                </div>

                {/* Equipped badge */}
                {isEquipped && (
                    <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                        style={{ background: 'var(--accent-brown)', color: 'var(--bg-dark)' }}>
                        <Check className="w-2.5 h-2.5" />
                        ÉQUIPÉ
                    </div>
                )}
            </div>

            {/* Info & Action */}
            <div className="flex flex-col gap-1.5 px-2.5 pt-2 pb-2.5"
                style={{ borderTop: '1px solid var(--border-color)' }}>
                <div>
                    <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }} title={skin.name}>
                        {skin.name}
                    </p>
                    <p className="text-[10px] leading-tight line-clamp-2 mt-0.5" style={{ color: 'var(--text-secondary)', minHeight: '2.4em' }}>
                        {skin.description}
                    </p>
                </div>

                {isOwned ? (
                    <button
                        className="w-full text-[11px] font-semibold py-1 rounded transition-all duration-150 border"
                        style={{
                            background: isEquipped ? 'transparent' : 'var(--bg-darker)',
                            color: isEquipped ? 'var(--accent-brown)' : 'var(--text-primary)',
                            borderColor: isEquipped ? 'var(--accent-brown)' : 'var(--border-color)',
                            cursor: isEquipped ? 'default' : 'pointer',
                        }}
                        onClick={onEquip}
                        disabled={isEquipped}
                    >
                        {isEquipped ? 'Équipé' : 'Équiper'}
                    </button>
                ) : (
                    <button
                        className="w-full text-[11px] font-semibold py-1 rounded transition-all duration-150 flex items-center justify-between px-2"
                        style={{
                            background: canAfford ? 'var(--accent-brown)' : 'var(--bg-darker)',
                            color: canAfford ? 'var(--bg-dark)' : 'var(--text-secondary)',
                            border: '1px solid transparent',
                            cursor: canAfford ? 'pointer' : 'not-allowed',
                        }}
                        onClick={onBuy}
                        disabled={!canAfford}
                    >
                        <span>{canAfford ? 'Acheter' : 'Insuffisant'}</span>
                        <span className="font-bold">
                            {skin.price === 0 ? 'Gratuit' : `${(skin.price / 100).toFixed(2).replace('.', ',')} €`}
                        </span>
                    </button>
                )}
            </div>
        </motion.div>
    );
}
