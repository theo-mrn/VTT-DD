"use client"

import React, { useState } from 'react'
import { UserPlus, Heart, Shield, Zap, Dices, Image as ImageIcon, User, Check, RotateCcw, Loader2, ImagePlus, Upload, Folder, Plus } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type NewCharacter } from '@/app/[roomid]/map/types'
import { ImageSelectorDialog } from './ImageSelectorDialog'
import { type Category } from './personnages'

interface NPCCreationFormProps {
    char: NewCharacter
    editingNpcId: string | null
    difficulty: number
    isSubmitting?: boolean
    categories: Category[]
    selectedCategoryId?: string
    onCategoryChange: (categoryId: string | undefined) => void
    onOpenCategoryManager: () => void
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
    categories,
    selectedCategoryId,
    onCategoryChange,
    onOpenCategoryManager,
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
                        variant="ghost"
                        size="sm"
                        onClick={onReset}
                        className="h-8 border-[#333] hover:bg-[#222] text-gray-400"
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* Main Content - Vertical Scroll */}
            <ScrollArea className="flex-1 bg-[#1a1a1a]">
                <div className="p-4 space-y-6">

                    {/* 1. Identity & Preview Block (Vertical Stack) */}
                    <div className="flex flex-col items-center space-y-4">
                        {/* Token Preview */}
                        <div className="relative z-10 group cursor-pointer" onClick={() => setIsImageDialogOpen(true)}>
                            <div className="w-32 h-32 rounded-full border-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden bg-[#222] transition-all duration-300 group-hover:shadow-[0_0_50px_rgba(192,160,128,0.3)] border-[#c0a080]">
                                {char.image && (typeof char.image === 'object' ? char.image.src : char.image) ? (
                                    <img src={typeof char.image === 'object' ? char.image.src : char.image} alt="Token" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-16 h-16 text-gray-600 opacity-50" />
                                )}

                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                    <ImageIcon className="w-6 h-6 text-white mb-2" />
                                    <span className="text-[10px] font-bold text-white uppercase tracking-wider">Modifier</span>
                                </div>
                            </div>
                        </div>

                        {/* Basic Fields */}
                        <div className="w-full space-y-4 bg-[#202022] p-4 rounded-lg border border-[#2a2a2a]">
                            <div className="space-y-2">
                                <Label className="text-gray-400 text-xs uppercase">Nom du Personnage</Label>
                                <Input
                                    value={char.name}
                                    onChange={(e) => onCharChange({ ...char, name: e.target.value })}
                                    className="bg-[#1a1a1a] border-[#444] text-[#e0e0e0] focus:border-[#c0a080] h-9"
                                    placeholder="Ex: Gobelin Éclaireur"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs uppercase">Niveau</Label>
                                    <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#444] rounded-md px-3 h-9">
                                        <span className="text-[#c0a080] font-bold text-xs">LVL</span>
                                        <input
                                            type="number"
                                            value={char.niveau}
                                            onChange={(e) => onNumChange('niveau', e.target.value)}
                                            className="w-full bg-transparent border-none text-right font-mono text-[#e0e0e0] focus:ring-0 p-0 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs uppercase">Difficulté</Label>
                                    <Slider
                                        defaultValue={[difficulty]}
                                        max={10} min={0} step={1}
                                        className="py-2 [&_.bg-primary]:bg-[#c0a080]"
                                        onValueChange={(val) => onGenerateStats(val[0])}
                                    />
                                </div>
                            </div>

                            {/* Category */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-gray-400 text-xs uppercase">Catégorie</Label>
                                    <Button
                                        type="button" variant="ghost" size="sm" onClick={onOpenCategoryManager}
                                        className="h-5 px-2 text-[#c0a080] hover:text-[#b09070] text-[10px]"
                                    >
                                        + Gérer
                                    </Button>
                                </div>
                                <Select value={selectedCategoryId || "none"} onValueChange={(val) => onCategoryChange(val === "none" ? undefined : val)}>
                                    <SelectTrigger className="bg-[#1a1a1a] border-[#444] text-[#e0e0e0] focus:border-[#c0a080] h-9">
                                        <SelectValue placeholder="Sans catégorie" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1a1a1a] border-[#444]">
                                        <SelectItem value="none" className="text-[#e0e0e0] hover:bg-[#333]">Sans catégorie</SelectItem>
                                        {categories.map((category) => (
                                            <SelectItem key={category.id} value={category.id} className="text-[#e0e0e0] hover:bg-[#333]">
                                                {category.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* 2. Combat Stats */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-[#c0a080] uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#c0a080]" />
                            Combat
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {/* PV */}
                            <div className="bg-[#222] border border-[#333] rounded p-3 flex flex-col items-center">
                                <span className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1"><Heart className="w-3 h-3 text-red-500" /> PV MAX</span>
                                <Input
                                    type="number"
                                    value={char.PV_Max ?? 20}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 0;
                                        onCharChange({ ...char, PV_Max: val, PV: val });
                                    }}
                                    className="bg-transparent border-none text-center font-bold text-red-400 h-8 text-lg p-0 focus-visible:ring-0"
                                />
                            </div>
                            {/* DEF */}
                            <div className="bg-[#222] border border-[#333] rounded p-3 flex flex-col items-center">
                                <span className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1"><Shield className="w-3 h-3 text-blue-500" /> DÉFENSE</span>
                                <Input
                                    type="number"
                                    value={char.Defense}
                                    onChange={(e) => onNumChange('Defense', e.target.value)}
                                    className="bg-transparent border-none text-center font-bold text-blue-400 h-8 text-lg p-0 focus-visible:ring-0"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            {['Contact', 'Distance', 'Magie'].map((stat) => (
                                <div key={stat} className="bg-[#252525] p-2 rounded border border-[#333] flex flex-col items-center">
                                    <span className="text-[9px] uppercase text-gray-500 font-bold mb-1">{stat}</span>
                                    <input
                                        type="number"
                                        value={char[stat as keyof NewCharacter] as number}
                                        onChange={(e) => onNumChange(stat as keyof NewCharacter, e.target.value)}
                                        className="w-full bg-transparent border-none text-center p-0 text-sm font-mono text-[#e0e0e0] focus:outline-none focus:ring-0"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="bg-[#222] p-3 rounded border border-[#333] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-yellow-500" />
                                <span className="text-xs font-bold text-gray-300 uppercase">Initiative</span>
                            </div>
                            <Input
                                type="number"
                                value={char.INIT}
                                onChange={(e) => onNumChange('INIT', e.target.value)}
                                className="w-16 bg-[#1a1a1a] border-[#444] text-center font-bold text-yellow-500 h-8"
                            />
                        </div>
                    </div>

                    {/* 3. Attributes */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-[#c0a080] uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#c0a080]" />
                            Caractéristiques
                        </h3>
                        <div className="grid grid-cols-1 gap-y-4 bg-[#202022] p-4 rounded-lg border border-[#2a2a2a]">
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
                    className="flex-1 bg-[#c0a080] text-black font-bold hover:bg-[#b09070] disabled:opacity-50"
                >
                    {isSubmitting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                        <Check className="w-4 h-4 mr-2" />
                    )}
                    {editingNpcId ? 'Sauvegarder' : 'Créer'}
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
