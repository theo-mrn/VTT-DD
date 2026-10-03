"use client"

import React, { useMemo, useState } from 'react'
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
import { useNpcStatFields } from '@/hooks/useNpcStatFields'
import { NpcSkillRanksEditor } from './NpcSkillRanksEditor'
import { useGameSystem } from '@/modules/game-system/useGameSystem'
import { useParams } from 'next/navigation'

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
    onNumChange: (field: string, value: string) => void
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
    // Onglet du corps du formulaire : combat+caractéristiques d'un côté, compétences de l'autre —
    // empilées, la liste de compétences se retrouvait hors de portée du scroll.
    const [activeTab, setActiveTab] = useState<'stats' | 'skills'>('stats')
    const params = useParams()
    const roomId = (params?.roomid as string) ?? null
    const { abilityStats, vitalStats, defenseKey, combatAttackKeys, extraCombatStats, skills, skillLabel, skillGroups } = useNpcStatFields(roomId)
    const { gameSystem } = useGameSystem(roomId)
    const statByKey = useMemo(() => new Map(gameSystem.stats.map((s) => [s.key, s])), [gameSystem.stats])
    const skillRanks = (char.skillRanks as Record<string, number> | undefined) ?? {}

    const handleImageSelect = (imageUrl: string) => {
        const img = new Image()
        img.src = imageUrl
        onCharChange({ ...char, image: img })
    }
    const renderStatBar = (label: string, value: number, field: string, color: string) => (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[var(--accent-brown)] uppercase tracking-wider">{label}</span>
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
        <div className="flex flex-col h-full bg-[var(--bg-dark)] text-[var(--text-primary)] overflow-hidden">
            {/* Header */}
            <div className="p-4 bg-[var(--bg-darker)] border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg border" style={{ background: 'color-mix(in srgb, var(--accent-brown) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent-brown) 20%, transparent)' }}>
                        <UserPlus className="w-5 h-5 text-[var(--accent-brown)]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[var(--accent-brown)] tracking-tight">
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
                        className="h-8 border-[var(--border-color)] hover:bg-[var(--bg-dark)] text-gray-400"
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* Main Content - Vertical Scroll */}
            <ScrollArea className="flex-1 bg-[var(--bg-dark)]">
                <div className="p-4 space-y-6">

                    {/* 1. Identity & Preview Block (Vertical Stack) */}
                    <div className="flex flex-col items-center space-y-4">
                        {/* Token Preview */}
                        <div className="relative z-10 group cursor-pointer" onClick={() => setIsImageDialogOpen(true)}>
                            <div className="w-32 h-32 rounded-full border-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden bg-[var(--bg-dark)] transition-all duration-300 group-hover:shadow-[0_0_50px_rgba(192,160,128,0.3)] border-[var(--accent-brown)]">
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
                        <div className="w-full space-y-4 bg-[var(--bg-card)] p-4 rounded-lg border border-[var(--border-color)]">
                            <div className="space-y-2">
                                <Label className="text-gray-400 text-xs uppercase">Nom du Personnage</Label>
                                <Input
                                    value={char.name}
                                    onChange={(e) => onCharChange({ ...char, name: e.target.value })}
                                    className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] h-9"
                                    placeholder="Ex: Gobelin Éclaireur"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs uppercase">Niveau</Label>
                                    <div className="flex items-center gap-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md px-3 h-9">
                                        <span className="text-[var(--accent-brown)] font-bold text-xs">LVL</span>
                                        <input
                                            type="number"
                                            value={char.niveau}
                                            onChange={(e) => onNumChange('niveau', e.target.value)}
                                            className="w-full bg-transparent border-none text-right font-mono text-[var(--text-primary)] focus:ring-0 p-0 text-sm"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-400 text-xs uppercase">Difficulté</Label>
                                    <Slider
                                        defaultValue={[difficulty]}
                                        max={10} min={0} step={1}
                                        className="py-2 [&_.bg-primary]:bg-[var(--accent-brown)]"
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
                                        className="h-5 px-2 text-[var(--accent-brown)] hover:text-[var(--accent-brown-hover)] text-[10px]"
                                    >
                                        + Gérer
                                    </Button>
                                </div>
                                <Select value={selectedCategoryId || "none"} onValueChange={(val) => onCategoryChange(val === "none" ? undefined : val)}>
                                    <SelectTrigger className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] focus:border-[var(--accent-brown)] h-9">
                                        <SelectValue placeholder="Sans catégorie" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[var(--bg-dark)] border-[var(--border-color)]">
                                        <SelectItem value="none" className="text-[var(--text-primary)] hover:bg-[var(--border-color)]">Sans catégorie</SelectItem>
                                        {categories.map((category) => (
                                            <SelectItem key={category.id} value={category.id} className="text-[var(--text-primary)] hover:bg-[var(--border-color)]">
                                                {category.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    {/* Onglets Combat / Compétences — masqués si le système ne déclare aucune
                        compétence (ex dnd-classic) : un seul onglet n'apporte rien. Sans ça les deux
                        sections s'empilaient et la liste de compétences devenait inatteignable. */}
                    {skills.length > 0 && (
                        <div className="flex gap-2 border-b border-[var(--border-color)]">
                            {([
                                { id: 'stats' as const, label: 'Combat' },
                                { id: 'skills' as const, label: skillLabel },
                            ]).map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors ${activeTab === tab.id
                                        ? 'border-[var(--accent-brown)] text-[var(--accent-brown)]'
                                        : 'border-transparent text-gray-500 hover:text-gray-300'
                                        }`}
                                >
                                    {tab.label}
                                    {tab.id === 'skills' && Object.keys(skillRanks).length > 0 && (
                                        <span className="ml-1.5 font-mono text-[10px] opacity-70">
                                            {Object.keys(skillRanks).length}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* 2. Combat Stats — dérivé du système de règles actif plutôt que
                        PV/Defense/Contact/Distance/Magie en dur. */}
                    <div className={`space-y-4 ${activeTab === 'stats' || skills.length === 0 ? '' : 'hidden'}`}>
                        <h3 className="text-xs font-bold text-[var(--accent-brown)] uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brown)]" />
                            Combat
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {vitalStats.map(({ stat, maxKey }) => (
                                <div key={stat.key} className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-3 flex flex-col items-center">
                                    <span className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1"><Heart className="w-3 h-3 text-red-500" /> {(stat.shortLabel || stat.label).toUpperCase()} MAX</span>
                                    <Input
                                        type="number"
                                        value={(char[maxKey || stat.key] as number) ?? 20}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 0;
                                            const next = { ...char, [stat.key]: val }
                                            if (maxKey) next[maxKey] = val
                                            onCharChange(next);
                                        }}
                                        className="bg-transparent border-none text-center font-bold text-red-400 h-8 text-lg p-0 focus-visible:ring-0"
                                    />
                                </div>
                            ))}
                            {defenseKey && (
                                <div className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded p-3 flex flex-col items-center">
                                    <span className="text-xs font-bold text-gray-400 mb-1 flex items-center gap-1"><Shield className="w-3 h-3 text-blue-500" /> DÉFENSE</span>
                                    <Input
                                        type="number"
                                        value={char[defenseKey] as number}
                                        onChange={(e) => onNumChange(defenseKey, e.target.value)}
                                        className="bg-transparent border-none text-center font-bold text-blue-400 h-8 text-lg p-0 focus-visible:ring-0"
                                    />
                                </div>
                            )}
                        </div>

                        {combatAttackKeys.length > 0 && (
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${combatAttackKeys.length}, minmax(0, 1fr))` }}>
                                {combatAttackKeys.map((stat) => (
                                    <div key={stat} className="bg-[var(--bg-card)] p-2 rounded border border-[var(--border-color)] flex flex-col items-center">
                                        <span className="text-[9px] uppercase text-gray-500 font-bold mb-1">{stat}</span>
                                        <input
                                            type="number"
                                            value={char[stat] as number}
                                            onChange={(e) => onNumChange(stat, e.target.value)}
                                            className="w-full bg-transparent border-none text-center p-0 text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:ring-0"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {extraCombatStats.map((stat) => (
                            <div key={stat.key} className="bg-[var(--bg-dark)] p-3 rounded border border-[var(--border-color)] flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-yellow-500" />
                                    <span className="text-xs font-bold text-gray-300 uppercase">{stat.label}</span>
                                </div>
                                <Input
                                    type="number"
                                    value={char[stat.key] as number}
                                    onChange={(e) => onNumChange(stat.key, e.target.value)}
                                    className="w-16 bg-[var(--bg-dark)] border-[var(--border-color)] text-center font-bold text-yellow-500 h-8"
                                />
                            </div>
                        ))}
                    </div>

                    {/* 3. Attributes — dérivé des caractéristiques (ability) du système actif */}
                    {abilityStats.length > 0 && (
                        <div className={`space-y-4 ${activeTab === 'stats' || skills.length === 0 ? '' : 'hidden'}`}>
                            <h3 className="text-xs font-bold text-[var(--accent-brown)] uppercase tracking-wider flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-brown)]" />
                                Caractéristiques
                            </h3>
                            <div className="grid grid-cols-1 gap-y-4 bg-[var(--bg-card)] p-4 rounded-lg border border-[var(--border-color)]">
                                {abilityStats.map((stat, i) => renderStatBar(
                                    stat.label,
                                    (char[stat.key] as number) ?? 10,
                                    stat.key,
                                    ['red', 'green', 'orange', 'blue', 'purple', 'yellow'][i % 6],
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 4. Compétences — rangs individuels, comme sur la fiche joueur. Rien n'est rendu
                        pour un système sans gameSystem.skills (ex dnd-classic). */}
                    {skills.length > 0 && (
                        <div className={activeTab === 'skills' ? '' : 'hidden'}>
                            <NpcSkillRanksEditor
                                skills={skills}
                                skillLabel={skillLabel}
                                skillGroups={skillGroups}
                                skillRanks={skillRanks}
                                onChange={(next) => onCharChange({ ...char, skillRanks: next })}
                                statByKey={statByKey}
                                values={char as Record<string, unknown>}
                            />
                        </div>
                    )}

                </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-4 bg-[var(--bg-darker)] border-t border-[var(--border-color)] flex justify-end gap-3 shrink-0">
                <Button
                    variant="ghost"
                    onClick={onCancel}
                    className="text-gray-400 hover:text-white hover:bg-[var(--bg-dark)]"
                >
                    Annuler
                </Button>
                <Button
                    onClick={onSubmit}
                    disabled={isSubmitting}
                    className="flex-1 bg-[var(--accent-brown)] text-black font-bold hover:bg-[var(--accent-brown-hover)] disabled:opacity-50"
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
