"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smile, Type, Timer, Send, Infinity as InfinityIcon, Trash2 } from 'lucide-react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { Input } from '@/components/ui/input';
import {
    DEFAULT_BUBBLE_DURATION_MS,
    MIN_BUBBLE_DURATION_MS,
    MAX_BUBBLE_DURATION_MS,
    PERSISTENT_BUBBLE_DURATION,
} from '@/hooks/map/useCharacterBubbles';

interface CharacterBubbleMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (content: string, type: 'emoji' | 'text', durationMs: number) => void;
    hasActiveBubble?: boolean;
    onClear?: () => void;
}

interface EmojiMartSelection {
    native: string;
}

type PopoverId = 'emoji' | 'text' | 'duration' | null;
type DurationChoice = number | 'infinite';

const MAX_TEXT_LENGTH = 40;
const DURATION_PRESETS_S = [3, 5, 10, 30];
const DEFAULT_DURATION_S = DEFAULT_BUBBLE_DURATION_MS / 1000;

export default function CharacterBubbleMenu({ isOpen, onClose, onSelect, hasActiveBubble, onClear }: CharacterBubbleMenuProps) {
    const [popover, setPopover] = useState<PopoverId>(null);
    const [text, setText] = useState('');
    const [duration, setDuration] = useState<DurationChoice>(DEFAULT_DURATION_S);
    const rootRef = useRef<HTMLDivElement>(null);

    // Source de vérité lue de façon synchrone par les callbacks passés à emoji-mart :
    // évite tout risque de closure figée sur une ancienne valeur de `duration`.
    const durationRef = useRef<DurationChoice>(duration);
    useEffect(() => { durationRef.current = duration; }, [duration]);

    const wasOpenRef = useRef(false);
    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            setText('');
            setDuration(DEFAULT_DURATION_S);
            setPopover(null);
        }
        wasOpenRef.current = isOpen;
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (rootRef.current && !rootRef.current.contains(target)) {
                // Ignore les clics sur un bouton personnalisable (CustomButtons) : sinon le
                // même clic qui vient d'ouvrir ce menu (via triggerAction) le referme aussitôt.
                if ((target as Element).closest?.('[data-custom-button]')) return;
                onClose();
            }
        };
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (popover) setPopover(null);
            else onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose, popover]);

    const clampDurationS = (s: number) => Math.min(
        Math.max(s, MIN_BUBBLE_DURATION_MS / 1000),
        MAX_BUBBLE_DURATION_MS / 1000
    );

    const handleDurationInputChange = (raw: string) => {
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) return;
        setDuration(clampDurationS(parsed));
    };

    const currentDurationMs = (): number => {
        const d = durationRef.current;
        return d === 'infinite' ? PERSISTENT_BUBBLE_DURATION : d * 1000;
    };

    const handleEmojiSelect = (emoji: EmojiMartSelection) => {
        setPopover(null);
        onSelect(emoji.native, 'emoji', currentDurationMs());
    };

    const handleSendText = () => {
        const trimmed = text.trim();
        if (!trimmed) return;
        setPopover(null);
        onSelect(trimmed, 'text', currentDurationMs());
    };

    const handleClear = () => {
        onClear?.();
        onClose();
    };

    const togglePopover = (id: Exclude<PopoverId, null>) => {
        setPopover((prev) => (prev === id ? null : id));
    };

    const durationLabel = duration === 'infinite' ? '∞' : `${duration}s`;

    return (
        <div
            ref={rootRef}
            style={{ position: 'fixed', zIndex: 50, bottom: '6rem', left: '50%', translate: '-50% 0' }}
        >
            {/* Popovers flottants — positionnés au-dessus de la barre, un seul actif à la fois */}
            <AnimatePresence>
                {isOpen && popover === 'emoji' && (
                    <Popover key="emoji" align="left">
                        <div className="emoji-mart-vtt-theme" style={{ width: 300, height: 360 }}>
                            <Picker
                                data={emojiData}
                                onEmojiSelect={handleEmojiSelect}
                                theme="dark"
                                previewPosition="none"
                                skinTonePosition="search"
                                searchPosition="sticky"
                                perLine={7}
                                maxFrequentRows={2}
                                set="native"
                            />
                        </div>
                    </Popover>
                )}

                {isOpen && popover === 'text' && (
                    <Popover key="text" align="center">
                        <div className="w-72 p-3 flex items-center gap-2">
                            <Input
                                autoFocus
                                value={text}
                                onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT_LENGTH))}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSendText();
                                }}
                                placeholder="Votre message…"
                                maxLength={MAX_TEXT_LENGTH}
                                className="h-9 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#c0a080]/50"
                            />
                            <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={handleSendText}
                                disabled={!text.trim()}
                                aria-label="Envoyer"
                                className="h-9 w-9 shrink-0 flex items-center justify-center rounded-lg bg-[#c0a080] text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed enabled:hover:bg-[#d4b594]"
                            >
                                <Send className="w-4 h-4" />
                            </motion.button>
                        </div>
                    </Popover>
                )}

                {isOpen && popover === 'duration' && (
                    <Popover key="duration" align="right">
                        <div className="p-2 flex items-center gap-1">
                            {DURATION_PRESETS_S.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => setDuration(s)}
                                    aria-pressed={duration === s}
                                    className={`relative h-8 min-w-[34px] px-1.5 rounded-md text-[11px] font-semibold tabular-nums transition-colors duration-150 ${duration === s ? 'text-black' : 'text-white/55 hover:text-white/85 hover:bg-white/5'
                                        }`}
                                >
                                    {duration === s && (
                                        <motion.span
                                            layoutId="bubble-duration-highlight"
                                            transition={{ type: 'spring', damping: 30, stiffness: 360 }}
                                            className="absolute inset-0 -z-10 rounded-md bg-[#c0a080]"
                                        />
                                    )}
                                    {s}s
                                </button>
                            ))}
                            <button
                                onClick={() => setDuration('infinite')}
                                title="Indéfiniment"
                                aria-label="Durée indéfinie"
                                aria-pressed={duration === 'infinite'}
                                className={`relative h-8 w-8 flex items-center justify-center rounded-md transition-colors duration-150 ${duration === 'infinite' ? 'text-black' : 'text-white/55 hover:text-white/85 hover:bg-white/5'
                                    }`}
                            >
                                {duration === 'infinite' && (
                                    <motion.span
                                        layoutId="bubble-duration-highlight"
                                        transition={{ type: 'spring', damping: 30, stiffness: 360 }}
                                        className="absolute inset-0 -z-10 rounded-md bg-[#c0a080]"
                                    />
                                )}
                                <InfinityIcon className="w-3.5 h-3.5" />
                            </button>
                            <div className="w-px h-5 bg-white/10 mx-0.5" />
                            <Input
                                type="number"
                                min={MIN_BUBBLE_DURATION_MS / 1000}
                                max={MAX_BUBBLE_DURATION_MS / 1000}
                                value={duration === 'infinite' ? '' : duration}
                                onChange={(e) => handleDurationInputChange(e.target.value)}
                                onBlur={(e) => handleDurationInputChange(e.target.value)}
                                aria-label="Durée personnalisée en secondes"
                                className="h-8 w-12 text-[11px] px-1.5 bg-white/5 border-white/10 text-white text-center tabular-nums focus-visible:ring-[#c0a080]/50"
                            />
                        </div>
                    </Popover>
                )}
            </AnimatePresence>

            {/* Barre compacte — toujours visible pendant que le menu est ouvert */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.94, y: 6, transition: { duration: 0.12 } }}
                        transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                        className="flex items-center gap-1 h-11 px-1.5 rounded-full border border-white/[0.08] bg-[#131315]/95 shadow-[0_16px_40px_-10px_rgba(0,0,0,0.7)] backdrop-blur-xl"
                    >
                        <IconButton
                            active={popover === 'emoji'}
                            onClick={() => togglePopover('emoji')}
                            label="Emoji"
                            icon={<Smile className="w-4 h-4" />}
                        />
                        <IconButton
                            active={popover === 'text'}
                            onClick={() => togglePopover('text')}
                            label="Texte"
                            icon={<Type className="w-4 h-4" />}
                        />
                        <IconButton
                            active={popover === 'duration'}
                            onClick={() => togglePopover('duration')}
                            label={durationLabel}
                            icon={<Timer className="w-4 h-4" />}
                            showLabel
                        />

                        {hasActiveBubble && (
                            <>
                                <div className="w-px h-5 bg-white/10 mx-0.5" />
                                <motion.button
                                    whileTap={{ scale: 0.9 }}
                                    onClick={handleClear}
                                    aria-label="Retirer la bulle actuelle"
                                    title="Retirer la bulle actuelle"
                                    className="h-8 w-8 flex items-center justify-center rounded-full text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </motion.button>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

function IconButton({
    active,
    onClick,
    icon,
    label,
    showLabel,
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    showLabel?: boolean;
}) {
    return (
        <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
            className={`relative flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium transition-colors duration-150 ${active ? 'text-black' : 'text-white/60 hover:text-white/90'
                }`}
        >
            {active && (
                <motion.span
                    layoutId="bubble-bar-active"
                    transition={{ type: 'spring', damping: 30, stiffness: 380 }}
                    className="absolute inset-0 -z-10 rounded-full bg-[#c0a080]"
                />
            )}
            {icon}
            {showLabel && <span className="tabular-nums">{label}</span>}
        </motion.button>
    );
}

function Popover({ children, align }: { children: React.ReactNode; align: 'left' | 'center' | 'right' }) {
    const alignClass = align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4, transition: { duration: 0.1 } }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className={`absolute bottom-full mb-2 ${alignClass} rounded-2xl border border-white/[0.08] bg-[#131315]/95 shadow-[0_24px_60px_-14px_rgba(0,0,0,0.75)] backdrop-blur-xl overflow-hidden`}
        >
            {children}
        </motion.div>
    );
}
