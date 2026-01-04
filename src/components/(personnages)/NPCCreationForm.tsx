"use client"

import React, { useState } from 'react'
import { UserPlus, Heart, Shield, Zap, Dices, Image as ImageIcon, User, Check, RotateCcw, Loader2, ImagePlus, Upload } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { type NewCharacter } from '@/app/[roomid]/map/types'
import { ImageSelectorDialog } from './ImageSelectorDialog'

interface NPCCreationFormProps {
    char: NewCharacter
    editingNpcId: string | null
    difficulty: number
    isSubmitting?: boolean
    onCharChange: (char: NewCharacter) => void
    onReset: () => void
    onCancel: () => void
    onSubmit: () => void
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
    onNumChange: (field: keyof NewCharacter, value: string) => void
    onGenerateStats: (diff: number) => void
}

export const NPCCreationForm = React.memo(({
    char,
    editingNpcId,
    difficulty,
    isSubmitting = false,
    onCharChange,
    onReset,
    onCancel,
    onSubmit,
    onImageUpload,
    onNumChange,
    onGenerateStats
}: NPCCreationFormProps) => {
    const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)

    const handleImageSelect = (imageUrl: string) => {
        const img = new Image()
        img.src = imageUrl
        onCharChange({ ...char, image: img })
    }
    const renderStatBar = (label: string, value: number, field: keyof NewCharacter, color: string) => (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[#c0a080] uppercase tracking-wider">{label}</span>
                <span className="font-mono text-white bg-black/30 px-2 py-0.5 rounded border border-[#ffffff10]">
                    {value}
                </span>
            </div>
            <div className="flex items-center gap-2">
                <Slider
                    value={[value]}
                    min={0}
                    max={30}
                    step={1}
                    onValueChange={(val) => onCharChange({ ...char, [field]: val[0] })}
                    className={`h-2 py-0 [&_.bg-primary]:bg-${color}-500`}
                />
            </div>
        </div>
    )

    return (
        <div className="flex flex-col h-full bg-[#1a1a1a] text-[#e0e0e0] overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-[#141414] border-b border-[#333] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20">
                        <UserPlus className="w-5 h-5 text-[#c0a080]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[#c0a080] tracking-tight">
                            {editingNpcId ? 'Modifier le PNJ' : 'Nouveau PNJ'}
                        </h2>
                        <p className="text-xs text-gray-500 font-medium">{editingNpcId ? 'Mise à jour' : 'Template réutilisable'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onReset}
                        className="h-8 border-[#333] hover:bg-[#222] text-gray-400"
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
                {/* LEFT - Preview + Identity */}
                <div className="w-full lg:w-1/3 bg-[#0f0f0f] border-b lg:border-b-0 lg:border-r border-[#333] flex flex-col relative overflow-hidden shrink-0">
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_#3a2a1a_0%,_transparent_70%)]" />
                    </div>

                    <ScrollArea className="flex-1">
                        <div className="p-6 flex flex-col items-center">
                            {/* Token Preview */}
                            <div className="relative z-10 group cursor-pointer" onClick={() => setIsImageDialogOpen(true)}>
                                <div className="w-32 h-32 lg:w-48 lg:h-48 rounded-full border-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden bg-[#222] transition-all duration-300 group-hover:shadow-[0_0_50px_rgba(192,160,128,0.3)] border-[#c0a080]">
                                    {char.image && (typeof char.image === 'object' ? char.image.src : char.image) ? (
                                        <img src={typeof char.image === 'object' ? char.image.src : char.image} alt="Token" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-16 h-16 lg:w-20 lg:h-20 text-gray-600 opacity-50" />
                                    )}

                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                        <ImageIcon className="w-6 h-6 lg:w-8 lg:h-8 text-white mb-2" />
                                        <span className="text-[10px] lg:text-xs font-bold text-white uppercase tracking-wider">Changer Image</span>
                                    </div>
                                </div>

                                {/* Stats Badge */}
                                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-[#333] px-3 py-1 rounded-full shadow-xl flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <Heart className="w-3.5 h-3.5 text-red-500" />
                                        <span className="text-xs font-bold font-mono">{char.PV}</span>
                                    </div>
                                    <div className="w-px h-3 bg-gray-700" />
                                    <div className="flex items-center gap-1.5">
                                        <Shield className="w-3.5 h-3.5 text-blue-500" />
                                        <span className="text-xs font-bold font-mono">{char.Defense}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Name Preview */}
                            <div className="mt-8 text-center z-10 w-full px-4">
                                <h3 className="text-lg lg:text-xl font-bold text-white truncate w-full">
                                    {char.name || "Sans Nom"}
                                </h3>
                                <p className="text-sm text-[#c0a080] opacity-80 mt-1 uppercase tracking-widest text-[10px]">
                                    Niveau {char.niveau} • PNJ
                                </p>
                            </div>

                            {/* Difficulty Slider */}
                            <div className="mt-6 w-full max-w-[280px] bg-[#1a1a1a] p-4 rounded-lg border border-[#333] space-y-3 z-10">
                                <Label className="text-gray-400 text-xs uppercase flex items-center gap-2">
                                    <Dices className="w-3 h-3" />
                                    Difficulté
                                </Label>
                                <Slider
                                    defaultValue={[difficulty]}
                                    max={10} min={0} step={1}
                                    className="[&_.bg-primary]:bg-[#c0a080]"
                                    onValueChange={(val) => onGenerateStats(val[0])}
                                />
                            </div>

                            {/* IDENTITY SECTION - Moved to left column */}
                            <div className="mt-8 w-full max-w-[280px] space-y-4 z-10">
                                <h3 className="text-sm font-bold text-[#c0a080] uppercase tracking-wider border-b border-[#333] pb-2">Identité</h3>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-gray-400 text-xs uppercase">Nom du Personnage</Label>
                                        <Input
                                            value={char.name}
                                            onChange={(e) => onCharChange({ ...char, name: e.target.value })}
                                            className="bg-[#252525] border-[#444] text-[#e0e0e0] focus:border-[#c0a080] h-10"
                                            placeholder="Ex: Gobelin Éclaireur"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-gray-400 text-xs uppercase">Niveau</Label>
                                        <div className="flex items-center gap-2 bg-[#252525] border border-[#444] rounded-md px-3 h-9">
                                            <span className="text-[#c0a080] font-bold text-sm">LVL</span>
                                            <input
                                                type="number"
                                                value={char.niveau}
                                                onChange={(e) => onNumChange('niveau', e.target.value)}
                                                className="w-full bg-transparent border-none text-right font-mono text-[#e0e0e0] focus:ring-0 p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>

                {/* RIGHT - Combat & Stats */}
                <div className="flex-1 bg-[#1a1a1a] flex flex-col min-w-0">
                    <ScrollArea className="flex-1">
                        <div className="p-4 lg:p-6 space-y-8">
                            {/* COMBAT SECTION */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-[#c0a080] uppercase tracking-wider border-b border-[#333] pb-2">Combat</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <Card className="bg-[#222] border-[#333]">
                                        <CardContent className="p-4 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Heart className="w-4 h-4 text-red-500" />
                                                <span className="text-sm font-bold text-gray-300">Vitalité</span>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="space-y-2">
                                                    <Label className="text-gray-400 text-xs uppercase">PV Max</Label>
                                                    <Input
                                                        type="number"
                                                        value={char.PV_Max ?? 20}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            onCharChange({ ...char, PV_Max: val, PV: val });
                                                        }}
                                                        className="bg-[#1a1a1a] border-[#444] text-center font-bold text-red-400 h-12 text-xl"
                                                        min={0}
                                                        max={500}
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="bg-[#222] border-[#333]">
                                        <CardContent className="p-4 space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Shield className="w-4 h-4 text-blue-500" />
                                                <span className="text-sm font-bold text-gray-300">Défense</span>
                                            </div>
                                            <div className="flex items-center justify-center p-2 bg-[#1a1a1a] rounded border border-[#333]">
                                                <input
                                                    type="number"
                                                    value={char.Defense}
                                                    onChange={(e) => onNumChange('Defense', e.target.value)}
                                                    className="bg-transparent text-center text-3xl font-bold font-mono text-blue-400 w-full focus:outline-none"
                                                />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    {['Contact', 'Distance', 'Magie'].map((stat) => (
                                        <div key={stat} className="bg-[#252525] p-3 rounded border border-[#333] space-y-2 text-center">
                                            <span className="text-[10px] uppercase text-gray-500 font-bold">{stat}</span>
                                            <input
                                                type="number"
                                                value={char[stat as keyof NewCharacter] as number}
                                                onChange={(e) => onNumChange(stat as keyof NewCharacter, e.target.value)}
                                                className="w-full bg-[#1a1a1a] border border-[#444] rounded text-center py-1 text-sm font-mono text-[#e0e0e0]"
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-[#222] p-4 rounded-lg border border-[#333] flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-yellow-500/10 rounded-lg">
                                            <Zap className="w-5 h-5 text-yellow-500" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-200">Initiative</p>
                                            <p className="text-xs text-gray-500">Bonus au jet d'initiative</p>
                                        </div>
                                    </div>
                                    <div className="w-20">
                                        <Input
                                            type="number"
                                            value={char.INIT}
                                            onChange={(e) => onNumChange('INIT', e.target.value)}
                                            className="bg-[#1a1a1a] border-[#444] text-center font-bold text-yellow-500"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* STATS SECTION */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-[#c0a080] uppercase tracking-wider border-b border-[#333] pb-2">Caractéristiques</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                                    {renderStatBar("Force", char.FOR ?? 10, 'FOR', 'red')}
                                    {renderStatBar("Dextérité", char.DEX ?? 10, 'DEX', 'green')}
                                    {renderStatBar("Constitution", char.CON ?? 10, 'CON', 'orange')}
                                    {renderStatBar("Intelligence", char.INT ?? 10, 'INT', 'blue')}
                                    {renderStatBar("Sagesse", char.SAG ?? 10, 'SAG', 'purple')}
                                    {renderStatBar("Charisme", char.CHA ?? 10, 'CHA', 'yellow')}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#141414] border-t border-[#333] flex justify-end gap-3 shrink-0">
                <Button
                    variant="ghost"
                    onClick={onCancel}
                    className="text-gray-400 hover:text-white hover:bg-[#222]"
                >
                    Annuler
                </Button>
                <Button
                    onClick={onSubmit}
                    disabled={isSubmitting}
                    className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070] px-8 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {editingNpcId ? 'Mise à jour...' : 'Création...'}
                        </>
                    ) : (
                        <>
                            <Check className="w-4 h-4 mr-2" />
                            {editingNpcId ? 'Mettre à jour' : 'Créer'}
                        </>
                    )}
                </Button>
            </div>

            {/* Image Selector Dialog */}
            <ImageSelectorDialog
                isOpen={isImageDialogOpen}
                onClose={() => setIsImageDialogOpen(false)}
                onSelectImage={handleImageSelect}
                currentImage={typeof char.image === 'object' ? char.image?.src : char.image}
            />
        </div>
    )
})

NPCCreationForm.displayName = 'NPCCreationForm'
