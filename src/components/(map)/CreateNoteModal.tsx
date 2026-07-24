"use client"

import React, { useState, useEffect, useMemo } from 'react'
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
import { useGameSystem } from '@/modules/game-system/useGameSystem'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface CreateNoteModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (note: { text: string, color: string, fontSize: number, fontFamily: string }) => void
    /** Salle courante — permet de proposer, EN PLUS des styles fixes, les polices custom déclarées
     *  par le système de règles actif (gameSystem.typography.fonts, ex Aurebesh pour Star Wars).
     *  Optionnel : sans roomId, seuls les 5 styles fixes s'affichent. */
    roomId?: string | null
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

const BASE_FONTS = [
    { label: 'Standard', value: 'var(--font-body)', description: 'Lisible' },
    { label: 'Titre', value: 'var(--font-title)', description: 'Épique' },
    { label: 'Manuscrit', value: 'var(--font-hand)', description: 'Note' },
    { label: 'Médiéval', value: 'var(--font-medieval)', description: 'Ancien' },
    { label: 'Moderne', value: 'var(--font-modern)', description: 'Clean' },
]

export function CreateNoteModal({ isOpen, onClose, onConfirm, initialValues, roomId = null }: CreateNoteModalProps) {
    const [text, setText] = useState('')
    const [color, setColor] = useState('#ffffff')
    const [fontSize, setFontSize] = useState(32)
    const [fontFamily, setFontFamily] = useState(BASE_FONTS[2].value) // Default to Handwriting for notes

    // Polices custom du système actif (ex Aurebesh pour Star Wars, cf typography.fonts du bundle) —
    // déjà chargées en document.fonts par GameSystemTypography, donc directement utilisables par
    // leur family CSS ; on ajoute juste un bouton par police déclarée, en plus des 5 styles fixes.
    const { gameSystem } = useGameSystem(roomId)
    const FONTS = useMemo(() => {
        // Fallback "serif" en dur, PAS var(--font-body) : cette valeur est aussi utilisée telle
        // quelle par ctx.font sur le Canvas de la carte (background-renderer.ts), qui ne sait pas
        // résoudre les variables CSS — une var() dans la chaîne y casse silencieusement le rendu.
        const custom = (gameSystem.typography?.fonts ?? [])
            .filter((f) => f?.family)
            .map((f) => ({ label: f.family, value: `"${f.family}", serif`, description: 'Système' }))
        return [...BASE_FONTS, ...custom]
    }, [gameSystem.typography])

    // Reset state on open
    useEffect(() => {
        if (isOpen) {
            setText(initialValues?.text || '')
            setColor(initialValues?.color || '#ffffff')
            setFontSize(initialValues?.fontSize || 32)
            setFontFamily(initialValues?.fontFamily || BASE_FONTS[2].value)
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
                            <Select value={fontFamily} onValueChange={setFontFamily}>
                                <SelectTrigger className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10">
                                    <SelectValue placeholder="Choisir une police" />
                                </SelectTrigger>
                                {/* z-[10000] : le SelectContent générique (select.tsx) n'a que z-50, insuffisant
                                    face au z-[9999] de cette modale plein écran — sans ce boost, le popup se
                                    rend visuellement sous la modale/derrière le fond flou de la carte. */}
                                <SelectContent className="z-[10000] bg-[#1a1a1a] border-white/10 text-white">
                                    {FONTS.map((f) => (
                                        <SelectItem key={f.value} value={f.value} className="focus:bg-white/10 focus:text-white">
                                            <span className="flex items-center gap-3">
                                                <span className="text-lg leading-none" style={{ fontFamily: f.value }}>Aa</span>
                                                <span>{f.label}</span>
                                                <span className="text-[10px] uppercase tracking-wider opacity-50">{f.description}</span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

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
