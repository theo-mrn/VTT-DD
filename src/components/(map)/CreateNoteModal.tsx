"use client"

import React, { useState, useEffect } from 'react'
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
    Type,
    Palette,
    Minus,
    Plus,
    Check
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreateNoteModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (note: { text: string, color: string, fontSize: number, fontFamily: string }) => void
    initialValues?: {
        text?: string
        color?: string
        fontSize?: number
        fontFamily?: string
    } | null
}

const PRESET_COLORS = [
    { value: '#ffffff', label: 'Blanc' },
    { value: '#ffeb3b', label: 'Or' },
    { value: '#ff5252', label: 'Rouge' },
    { value: '#69f0ae', label: 'Menthe' },
    { value: '#448aff', label: 'Bleu' },
    { value: '#e040fb', label: 'Mauve' },
]

const FONTS = [
    { label: 'Standard', value: 'var(--font-body)', description: 'Lisible' },
    { label: 'Titre', value: 'var(--font-title)', description: 'Épique' },
    { label: 'Manuscrit', value: 'var(--font-hand)', description: 'Note' },
    { label: 'Médiéval', value: 'var(--font-medieval)', description: 'Ancien' },
    { label: 'Moderne', value: 'var(--font-modern)', description: 'Clean' },
]

export function CreateNoteModal({ isOpen, onClose, onConfirm, initialValues }: CreateNoteModalProps) {
    const [text, setText] = useState('')
    const [color, setColor] = useState('#ffffff')
    const [fontSize, setFontSize] = useState(32)
    const [fontFamily, setFontFamily] = useState(FONTS[2].value) // Default to Handwriting for notes

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setText(initialValues?.text || '')
            setColor(initialValues?.color || '#ffffff')
            setFontSize(initialValues?.fontSize || 32)
            setFontFamily(initialValues?.fontFamily || FONTS[2].value)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen])

    const handleConfirm = () => {
        if (!text.trim()) return
        onConfirm({ text, color, fontSize, fontFamily })
        onClose()
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogPortal>
                <DialogOverlay className="bg-black/20 backdrop-blur-sm z-[9999]" />
                <DialogPrimitive.Content
                    className="fixed inset-0 z-[9999] w-screen h-screen flex flex-col items-center justify-between border-none bg-transparent p-0 shadow-none focus:outline-none"
                >
                    <DialogPrimitive.Title className="sr-only">Édition de note</DialogPrimitive.Title>

                    {/* 1. Main Text Editor Area - Takes most of the space */}
                    <div className="flex-1 w-full max-w-5xl flex items-center justify-center p-4 min-h-0">
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            placeholder="Écrivez votre message ici..."
                            className={cn(
                                "w-full h-full bg-transparent border-none text-center resize-none focus:outline-none focus:ring-0 placeholder:text-white/10 transition-all duration-200",
                                "leading-normal flex items-center justify-center"
                            )}
                            style={{
                                color: color,
                                fontSize: `${fontSize}px`,
                                fontFamily: fontFamily,
                                textShadow: '0 4px 20px rgba(0,0,0,0.8)',
                                paddingTop: '20vh' // Visual centering
                            }}
                            autoFocus
                        />
                    </div>

                    {/* 2. Structured Control Panel */}
                    <div className="w-full max-w-3xl mb-8 mx-4 animate-in slide-in-from-bottom-10 fade-in duration-300">
                        <div className="bg-[#1a1a1a]/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-6">

                            {/* Top Row: Font Selection */}
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                                {FONTS.map((f) => (
                                    <button
                                        key={f.value}
                                        onClick={() => setFontFamily(f.value)}
                                        className={cn(
                                            "flex-shrink-0 px-6 py-3 rounded-xl border transition-all duration-200 flex flex-col items-center gap-1 min-w-[100px] snap-center",
                                            fontFamily === f.value
                                                ? "bg-white/10 border-white text-white shadow-lg scale-105"
                                                : "border-white/5 text-gray-400 hover:bg-white/5 hover:text-gray-200"
                                        )}
                                    >
                                        <span className="text-lg leading-none" style={{ fontFamily: f.value }}>Aa</span>
                                        <span className="text-[10px] uppercase tracking-wider opacity-60 font-sans">{f.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Middle Row: Customization */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center border-t border-white/5 pt-6">

                                {/* Color Palette */}
                                <div className="flex items-center gap-3 justify-center md:justify-start">
                                    {PRESET_COLORS.map((c) => (
                                        <button
                                            key={c.value}
                                            onClick={() => setColor(c.value)}
                                            className={cn(
                                                "w-8 h-8 rounded-full transition-all duration-200 border-2",
                                                color === c.value
                                                    ? "border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                                                    : "border-transparent hover:scale-110 opacity-70 hover:opacity-100"
                                            )}
                                            style={{ backgroundColor: c.value }}
                                            title={c.label}
                                        />
                                    ))}
                                    <div className="w-px h-8 bg-white/10 mx-2" />
                                    <div className="relative group">
                                        <input
                                            type="color"
                                            value={color}
                                            onChange={(e) => setColor(e.target.value)}
                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                        />
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 via-purple-500 to-orange-500 border border-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Palette className="w-4 h-4 text-white drop-shadow-md" />
                                        </div>
                                    </div>
                                </div>

                                {/* Size Slider */}
                                <div className="flex items-center gap-4 bg-black/20 rounded-full px-4 py-2 border border-white/5">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
                                        onClick={() => setFontSize(prev => Math.max(12, prev - 4))}
                                    >
                                        <Minus className="w-4 h-4" />
                                    </Button>

                                    <div className="flex-1 flex flex-col items-center gap-1">
                                        <Slider
                                            value={[fontSize]}
                                            min={12}
                                            max={120}
                                            step={4}
                                            onValueChange={(v) => setFontSize(v[0])}
                                            className="w-full cursor-pointer"
                                        />
                                    </div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"
                                        onClick={() => setFontSize(prev => Math.min(120, prev + 4))}
                                    >
                                        <Plus className="w-4 h-4" />
                                    </Button>

                                    <span className="text-xs font-mono text-gray-400 w-8 text-right tabular-nums">{fontSize}</span>
                                </div>
                            </div>

                            {/* Bottom Row: Actions */}
                            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                                <Button
                                    variant="ghost"
                                    onClick={onClose}
                                    className="px-6 text-gray-400 hover:text-white hover:bg-white/5"
                                >
                                    Annuler
                                </Button>
                                <Button
                                    onClick={handleConfirm}
                                    disabled={!text.trim()}
                                    className={cn(
                                        "px-8 bg-[#c0a080] text-black hover:bg-[#d4b48f] transition-all font-bold",
                                        "hover:shadow-[0_0_20px_rgba(192,160,128,0.3)] hover:scale-105 active:scale-95"
                                    )}
                                >
                                    <Check className="w-4 h-4 mr-2" />
                                    Placer sur la carte
                                </Button>
                            </div>
                        </div>
                    </div>

                </DialogPrimitive.Content>
            </DialogPortal>
        </Dialog>
    )
}
