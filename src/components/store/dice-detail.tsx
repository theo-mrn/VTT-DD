"use client";

import React from 'react';
import { ArrowLeft, Check, ShoppingCart, Dices, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DiceSkin } from '../(dices)/dice-definitions';
import { DicePreview } from '../(dices)/dice-preview';

interface DiceDetailProps {
    skin: DiceSkin;
    isOwned: boolean;
    isEquipped: boolean;
    canAfford: boolean;
    onBack: () => void;
    onBuy: () => void;
    onEquip: () => void;
    onTry: () => void;
}

const RARITY_STYLE: Record<string, { label: string; className: string }> = {
    legendary: { label: 'Légendaire', className: 'text-[var(--accent-brown)] border-[var(--accent-brown)]/40 bg-[var(--accent-brown)]/10' },
    epic: { label: 'Épique', className: 'text-[var(--accent-blue)] border-[var(--accent-blue)]/40 bg-[var(--accent-blue)]/10' },
    rare: { label: 'Rare', className: 'text-blue-500 border-blue-500/40 bg-blue-500/10' },
    uncommon: { label: 'Peu commun', className: 'text-green-500 border-green-500/40 bg-green-500/10' },
    common: { label: 'Commun', className: 'text-[var(--text-secondary)] border-[var(--border-color)] bg-[var(--bg-darker)]' },
};

/**
 * Page de détail d'un dé — le SEUL endroit de la boutique où un canvas WebGL
 * existe. Monté au clic sur une carte, détruit au retour (le démontage du
 * <Canvas> libère le contexte). Un seul contexte 3D à la fois, jamais au hover.
 */
export function DiceDetail({ skin, isOwned, isEquipped, canAfford, onBack, onBuy, onEquip, onTry }: DiceDetailProps) {
    const rarity = RARITY_STYLE[skin.rarity || 'common'] ?? RARITY_STYLE.common;

    return (
        <div className="max-w-4xl mx-auto">
            <button
                onClick={onBack}
                className="mb-5 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--text-primary)]/5 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" /> Retour au catalogue
            </button>

            <div className="grid md:grid-cols-2 gap-6 items-start">
                {/* ── 3D live (unique canvas, tué au retour) ── */}
                <div className="relative aspect-square rounded-2xl overflow-hidden border border-[var(--border-color)] bg-[var(--bg-darker)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--text-primary-rgb),0.06)_0%,transparent_100%)]" />
                    {/* key={skin.id} : jamais de swap de skin sur un contexte actif
                        (voir l'historique HoverPreviewLayer) — un skin = un canvas. */}
                    <div className="absolute inset-0">
                        <DicePreview key={skin.id} skinId={skin.id} type="d20" className="w-full h-full" />
                    </div>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-dark)]/70 border border-[var(--border-color)]/50 text-[9px] font-bold uppercase tracking-widest text-[var(--text-secondary)] pointer-events-none">
                        <RotateCcw className="w-3 h-3" /> Glisser pour tourner
                    </div>
                </div>

                {/* ── Infos + actions ── */}
                <div className="flex flex-col gap-4 md:pt-2">
                    <span className={cn('self-start px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-[0.2em]', rarity.className)}>
                        {rarity.label}
                    </span>

                    <div>
                        <h3 className="text-2xl sm:text-3xl font-black italic uppercase tracking-tight text-[var(--text-primary)]">{skin.name}</h3>
                        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">{skin.description}</p>
                    </div>

                    <div className="mt-2 pt-4 border-t border-[var(--border-color)] flex flex-col gap-3">
                        {isOwned ? (
                            <button
                                onClick={onEquip}
                                disabled={isEquipped}
                                className={cn(
                                    'w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2',
                                    isEquipped
                                        ? 'bg-[var(--text-primary)]/5 text-[var(--text-secondary)] cursor-not-allowed'
                                        : 'bg-[var(--accent-brown)] text-[var(--bg-dark)] hover:bg-[var(--accent-brown-hover)] active:scale-95 shadow-lg shadow-[var(--accent-brown)]/10'
                                )}
                            >
                                {isEquipped ? (<><Check className="w-4 h-4" strokeWidth={3} /> Sélectionné</>) : 'Équiper'}
                            </button>
                        ) : (
                            <button
                                onClick={onBuy}
                                disabled={!canAfford}
                                className="w-full py-3.5 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border border-[var(--border-color)] bg-[var(--bg-darker)] text-[var(--text-primary)] hover:bg-[var(--bg-dark)] hover:border-[var(--text-primary)]/20 active:scale-95 disabled:opacity-50"
                            >
                                <ShoppingCart className="w-4 h-4" />
                                {skin.price === 0 ? 'Obtenir gratuitement' : `Acheter — ${(skin.price / 100).toFixed(2)} €`}
                            </button>
                        )}

                        <button
                            onClick={onTry}
                            className="w-full py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--accent-brown)] hover:border-[var(--accent-brown)]/40 active:scale-95"
                        >
                            <Dices className="w-4 h-4" /> Essayer un lancer
                        </button>
                        <p className="text-[10px] text-[var(--text-secondary)] opacity-60 text-center">
                            Le premier lancer peut prendre quelques secondes (préparation des effets).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
