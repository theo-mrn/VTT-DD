"use client"

import React, { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Search, User, Upload, BookOpen, X, Check, Dna, Shield, Heart, Swords, Pencil, Crop as CropIcon, ZoomIn, Loader2, Ghost, Plus } from 'lucide-react'
import { type NewCharacter } from '@/app/[roomid]/map/types'
import Cropper from 'react-easy-crop'
import { getCroppedImg } from '@/lib/cropImageHelper'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RaceImageSelector } from './RaceImageSelector'
import { useGameSystem } from '@/modules/game-system/useGameSystem'
import { useNpcStatFields } from '@/hooks/useNpcStatFields'
import { rollCharacterStats } from '@/lib/rules-engine'
import type { RaceDefinition, ProfileDefinition } from '@/modules/game-system/types'

// ─────────────────────────────────────────────────────────────────────────────
// "Bibliothèque" de PNJ : jusqu'ici deux onglets, Race+Profil (générateur) et Bestiaire (fetch
// /tabs/bestiairy.json, legacy dnd-classic). Le vrai bestiaire par monstre n'a pas d'équivalent
// générique dans le moteur de règles — à la place, l'onglet "Bestiaire" réutilise gameSystem.races
// comme pseudo-bestiaire (chaque race sert de "modèle de créature" avec ses stats de base), même si
// imparfait : c'est la seule liste de gabarits déjà définie par le MJ pour n'importe quel système.
// races.json/profile.json/bestiairy.json sont entièrement remplacés par gameSystem.races/profiles.
// ─────────────────────────────────────────────────────────────────────────────

interface CreatureLibraryModalProps {
    isOpen: boolean
    onClose: () => void
    onImport: (character: NewCharacter) => void
}

export function CreatureLibraryModal({ isOpen, onClose, onImport }: CreatureLibraryModalProps) {
    const params = useParams()
    const roomId = (params?.roomid as string) ?? null
    const { gameSystem } = useGameSystem(roomId)
    const { abilityStats, vitalStats, defenseKey, combatAttackKeys, extraCombatStats } = useNpcStatFields(roomId)
    const races: RaceDefinition[] = gameSystem.races ?? []
    const profiles: ProfileDefinition[] = gameSystem.profiles ?? []
    // Pseudo-bestiaire : les races servent de gabarits de créature (cf commentaire plus haut).
    const bestiary: RaceDefinition[] = races
    const loading = false

    // Cropping State
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editingImageSrc, setEditingImageSrc] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)

    // Stats State — clés dérivées du système actif (caractéristiques/stat vitale/défense/attaques),
    // pas les 6+7 clés D&D fixes.
    const [stats, setStats] = useState<Record<string, number>>({})

    // Selection State
    const [activeTab, setActiveTab] = useState<'bestiary' | 'npc'>('npc')

    const [selectedRace, setSelectedRace] = useState<string | null>(null)
    const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
    const [selectedCreature, setSelectedCreature] = useState<string | null>(null)

    const [targetLevel, setTargetLevel] = useState<number>(1)
    const [customImage, setCustomImage] = useState<string>('')
    const [customName, setCustomName] = useState<string>('')
    const [activeImageSource, setActiveImageSource] = useState<'race' | 'profile' | 'creature' | 'custom'>('creature')
    const [searchQuery, setSearchQuery] = useState('')

    // Image Selector Dialog State
    const [isImageSelectorOpen, setIsImageSelectorOpen] = useState(false)

    // Calculate Defaults when selection changes — délègue au VRAI moteur de règles (rollCharacterStats,
    // le même que la création de personnage classique) au lieu d'une formule de "scaling par niveau"
    // maison qui supposait un modèle D&D (hit die + modificateur CON augmentant avec le niveau). Un
    // système custom (ex Star Wars) a des stats vitales qui démarrent à une VRAIE constante (rollFormula
    // = const 0 pour Blessures/Stress), pas une valeur qui grandit avec un niveau choisi ici — le moteur
    // respecte ça nativement, et n'invente aucune clé (ex INIT) que le système ne définit pas.
    // PRIORITÉ 1 : créature du pseudo-bestiaire sélectionnée (une race utilisée comme gabarit, ses
    // "modifiers" servant de modificateurs raciaux). PRIORITÉ 2 : race + profil choisis pour un PNJ générique.
    useEffect(() => {
        if (!isOpen) return

        const creatureRace = selectedCreature ? bestiary.find((r) => r.id === selectedCreature) : null
        const raceData = selectedRace ? races.find((r) => r.id === selectedRace) : null
        const profileData = selectedProfile ? profiles.find((p) => p.id === selectedProfile) : null
        const mods = (creatureRace ?? raceData)?.modifiers || {}

        const rolled = rollCharacterStats(gameSystem, mods, [], { deVie: profileData?.hitDie });
        const newStats: Record<string, number> = {};
        for (const [key, value] of Object.entries({ ...rolled.abilities, ...rolled.derived })) {
            if (typeof value === 'number') newStats[key] = value;
        }

        setStats(newStats)
    }, [selectedRace, selectedProfile, selectedCreature, activeTab, races, profiles, bestiary, gameSystem])

    // Reset crop when selection changes
    useEffect(() => {
        setIsEditing(false)
        setCrop({ x: 0, y: 0 })
        setZoom(1)
        setEditingImageSrc(null)
    }, [selectedRace, selectedProfile, selectedCreature, activeImageSource, activeTab])




    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setCustomImage(reader.result as string)
                setActiveImageSource('custom')
            }
            reader.readAsDataURL(file)
        }
    }

    const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }


    const handleImport = async () => {
        setIsCreating(true)

        try {
            // Name Generation
            const charName = customName || getPreviewName()

            const baseImage = getPreviewImage() || '';
            let finalImage = baseImage;

            // --- CROPPING LOGIC ---
            try {
                if (croppedAreaPixels && (isEditing || editingImageSrc)) {
                    finalImage = await getCroppedImg(editingImageSrc || finalImage, croppedAreaPixels);
                }
            } catch (e: any) {
                console.error("Error processing image:", e);
                alert(`Erreur lors du traitement de l'image : ${e.message || e}`);
                setIsCreating(false)
                return
            }

            // Stats dérivées du système actif (cf effet "Calculate Defaults" plus haut) — seules les
            // clés RÉELLEMENT résolues par rollCharacterStats sont copiées, jamais de préremplissage
            // D&D fixe (PV/Defense/FOR/.../INIT) qui polluerait un système sans ces clés (ex un INIT
            // fantôme pour Star Wars, qui n'a pas cette stat).
            const newChar: NewCharacter = {
                name: charName,
                niveau: targetLevel,
                image: { src: finalImage },
                imageURL: '',
                visibility: 'visible',
                nombre: 1,
                Actions: []
            } as NewCharacter
            for (const [key, value] of Object.entries(stats)) newChar[key] = value

            await onImport(newChar)
            onClose()

        } catch (error) {
            console.error("Error creating character:", error)
        } finally {
            setIsCreating(false)
        }
    }



    // Filtering — races/profiles/bestiary sont maintenant des tableaux (gameSystem.races/profiles),
    // plus de Record<string, X> ni de recherche de "catégorie" (notion propre au bestiaire dnd-classic,
    // absente du pseudo-bestiaire par race).
    const filteredRaces = races.filter((r) =>
        r.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredProfiles = profiles.filter((p) =>
        p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredBestiary = bestiary
        .filter((r) =>
            r.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => a.label.localeCompare(b.label))

    if (!isOpen) return null

    // Render bestiary grid items (only used in bestiary tab) — pseudo-bestiaire : chaque race sert de
    // gabarit de créature, pas de catégorie/niveau propre à afficher.
    const renderGridItems = () => {
        if (activeTab === 'bestiary') {
            return filteredBestiary.map((race) => {
                const isSelected = selectedCreature === race.id
                const hasProfile = !!selectedProfile
                return (
                    <Card
                        key={race.id}
                        title={race.label}
                        subtitle="Race"
                        image={race.image}
                        isSelected={isSelected}
                        onClick={() => {
                            if (!isSelected) {
                                setSelectedCreature(race.id)
                                setSelectedRace(null)
                                setActiveImageSource('creature')
                            } else {
                                setSelectedCreature(null)
                            }
                        }}
                        footer={
                            hasProfile && !isSelected ? (
                                <div className="flex items-center justify-end w-full">
                                    <div className="bg-[#c0a080] text-black rounded-full p-1 shadow-lg animate-in zoom-in-50 duration-300">
                                        <Plus className="w-3 h-3" strokeWidth={4} />
                                    </div>
                                </div>
                            ) : undefined
                        }
                    />
                )
            })
        }
    }

    // --- RENDER HELPERS ---

    const selectedRaceData = selectedRace ? races.find((r) => r.id === selectedRace) : null
    const selectedProfileData = selectedProfile ? profiles.find((p) => p.id === selectedProfile) : null
    const selectedCreatureData = selectedCreature ? bestiary.find((r) => r.id === selectedCreature) : null

    const getPreviewImage = () => {
        // Priority: Custom > Active Source Selection > Hierarchy(Creature > Race > Profile > Custom)

        // If user explicitly chose a source in the preview UI controls, try to honor it if available
        if (activeImageSource === 'custom' && customImage) return customImage
        if (activeImageSource === 'creature' && selectedCreatureData?.image) return selectedCreatureData.image
        if (activeImageSource === 'profile' && selectedProfileData?.image) return selectedProfileData.image
        // For race source: prioritize customImage (gallery selection) over default race image
        if (activeImageSource === 'race') {
            if (customImage) return customImage
            if (selectedRaceData?.image) return selectedRaceData.image
        }

        // Fallback Hierarchy
        if (customImage) return customImage
        if (selectedCreatureData?.image) return selectedCreatureData.image
        if (selectedProfileData?.image) return selectedProfileData.image
        if (selectedRaceData?.image) return selectedRaceData.image

        return ''
    }

    const getPreviewName = () => {
        // CASE 1: BESTIARY + optionally Profile
        if (selectedCreatureData) {
            const creatureName = selectedCreatureData.label
            const profileName = selectedProfileData?.label ?? ''
            return [creatureName, profileName].filter(Boolean).join(' ')
        }

        // CASE 2: CUSTOM (Race + Profile)
        const pName = selectedProfileData?.label ?? ''
        const rName = selectedRaceData?.label ?? ''
        return [pName, rName].filter(Boolean).join(' ') || 'Nouveau Personnage'
    }

    return (
        <div className="fixed inset-0 z-[999999999] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">

            {/* Main Container - The "Opened Book" */}
            <div className="w-[95vw] h-[90vh] max-w-7xl bg-[#09090b] border border-[#2a2a2a] rounded-2xl shadow-2xl flex relative overflow-hidden ring-1 ring-white/10">

                {/* --- LEFT PANEL: BROWSER (65%) --- */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#0c0c0e]">

                    {/* Header */}
                    <div className="p-6 border-b border-[#2a2a2a] bg-[#121214] flex justify-between items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20 flex items-center justify-center">
                                <BookOpen className="w-5 h-5 text-[#c0a080]" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-serif font-bold text-[#e4e4e7] tracking-tight">Mes PNJ</h1>
                                <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium"></p>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="relative flex-1 max-w-md group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-[#c0a080] transition-colors" />
                            <input
                                type="text"
                                placeholder="Rechercher une créature, une race..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-[#18181b] border border-[#27272a] rounded-full py-2.5 pl-10 pr-4 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#c0a080] focus:ring-1 focus:ring-[#c0a080]/50 transition-all font-medium text-sm"
                            />
                        </div>
                    </div>
                    {/* Top Navigation Bar */}
                    <div className="flex items-center justify-start mb-4 px-6">
                        <div className="flex items-center p-1.5 bg-[#18181b] rounded-2xl border border-[#27272a] shadow-2xl w-fit">
                            <button
                                onClick={() => { setActiveTab('npc'); setSelectedCreature(null) }}
                                className={`relative px-6 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 group
                                    ${activeTab === 'npc'
                                        ? 'bg-[#c0a080] text-[#09090b] shadow-[0_0_20px_rgba(192,160,128,0.3)]'
                                        : 'text-zinc-500 hover:text-zinc-200'
                                    }`}
                            >
                                <User className={`w-4 h-4 ${activeTab === 'npc' ? 'text-black' : 'text-[#c0a080]'}`} />
                                <span>Nouveau PNJ</span>
                            </button>
                            <div className="w-px h-6 bg-[#2a2a2a] mx-2" />
                            <button
                                onClick={() => setActiveTab('bestiary')}
                                className={`relative px-6 py-2.5 text-sm font-bold rounded-xl transition-all flex items-center gap-2 group
                                    ${activeTab === 'bestiary'
                                        ? 'bg-[#c0a080] text-[#09090b] shadow-[0_0_20px_rgba(192,160,128,0.3)]'
                                        : 'text-zinc-500 hover:text-zinc-200'
                                    }`}
                            >
                                <Ghost className={`w-4 h-4 ${activeTab === 'bestiary' ? 'text-black' : 'text-[#c0a080]'}`} />
                                <span className="flex items-center gap-1.5">
                                    Bestiaire
                                    {selectedCreature && (
                                        <Check className={`w-3.5 h-3.5 ${activeTab === 'bestiary' ? 'text-black' : 'text-green-500'}`} strokeWidth={4} />
                                    )}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Content Grid */}
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="w-8 h-8 border-4 border-[#c0a080] border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : activeTab === 'npc' ? (
                        /* NPC MODE: 2 columns side by side */
                        <div className="flex-1 flex min-h-0 overflow-hidden">
                            {/* Races column */}
                            <div className="flex-1 flex flex-col min-w-0 border-r border-[#2a2a2a]">
                                <div className="px-4 py-3 border-b border-[#2a2a2a] bg-[#0f0f11] flex items-center gap-2 shrink-0">
                                    <Dna className="w-3.5 h-3.5 text-blue-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Races</span>
                                    {selectedRaceData && (
                                        <span className="ml-auto flex items-center gap-1 text-[10px] text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                            {selectedRaceData.label}
                                            <button onClick={() => setSelectedRace(null)} className="hover:text-white"><X className="w-2.5 h-2.5" /></button>
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[url('/grid-pattern.svg')] bg-repeat p-3">
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
                                        {filteredRaces.map((race) => {
                                            const isSelected = selectedRace === race.id
                                            return (
                                                <Card
                                                    key={race.id}
                                                    title={race.label}
                                                    subtitle="Race"
                                                    image={race.image}
                                                    isSelected={isSelected}
                                                    onClick={() => {
                                                        if (!isSelected) {
                                                            setSelectedRace(race.id)
                                                            setSelectedCreature(null)
                                                            setActiveImageSource('race')
                                                            setIsImageSelectorOpen(true)
                                                        } else {
                                                            setSelectedRace(null)
                                                        }
                                                    }}
                                                    footer={
                                                        <div className="flex gap-1 flex-wrap">
                                                            {Object.entries(race.modifiers || {}).slice(0, 2).map(([k, v]) => (
                                                                <span key={k} className="text-[9px] bg-white/10 px-1 rounded">{k} {v > 0 ? '+' : ''}{v}</span>
                                                            ))}
                                                        </div>
                                                    }
                                                />
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Classes column */}
                            <div className="flex-1 flex flex-col min-w-0">
                                <div className="px-4 py-3 border-b border-[#2a2a2a] bg-[#0f0f11] flex items-center gap-2 shrink-0">
                                    <Swords className="w-3.5 h-3.5 text-purple-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Classes</span>
                                    {selectedProfileData && (
                                        <span className="ml-auto flex items-center gap-1 text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                                            {selectedProfileData.label}
                                            <button onClick={() => setSelectedProfile(null)} className="hover:text-white"><X className="w-2.5 h-2.5" /></button>
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[url('/grid-pattern.svg')] bg-repeat p-3">
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
                                        {filteredProfiles.map((profile) => {
                                            const isSelected = selectedProfile === profile.id
                                            return (
                                                <Card
                                                    key={profile.id}
                                                    title={profile.label}
                                                    subtitle="Classe"
                                                    image={profile.image}
                                                    isSelected={isSelected}
                                                    onClick={() => {
                                                        setSelectedProfile(isSelected ? null : profile.id)
                                                        if (!isSelected) setActiveImageSource('profile')
                                                    }}
                                                    footer={
                                                        profile.hitDie ? <span className="text-[9px] text-red-300">DV: {profile.hitDie}</span> : undefined
                                                    }
                                                />
                                            )
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* BESTIARY MODE */
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[url('/grid-pattern.svg')] bg-repeat p-6">
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
                                {renderGridItems()}
                            </div>
                        </div>
                    )}
                </div>

                {/* --- RIGHT PANEL: INSPECTOR (35%) --- */}
                <div className="w-[420px] border-l border-[#2a2a2a] bg-[#121212] flex flex-col shadow-[-10px_0_30px_rgba(0,0,0,0.5)] z-10 relative">

                    {/* Background Ambient Effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-[#1a1a1a] to-transparent opacity-50 pointer-events-none" />

                    {/* Close Button (Moved Inside Right Panel with z-50) */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-50 p-2 bg-black/40 text-white/70 hover:text-white rounded-full hover:bg-black/80 backdrop-blur-sm border border-white/5 transition-all"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        {/* 1. Portrait Header - Larger Image */}
                        <div className="relative h-[400px] bg-black group overflow-hidden border-b border-[#2a2a2a]">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-30" />
                            {isEditing ? (
                                <div className="absolute inset-0 z-10">
                                    <Cropper
                                        image={editingImageSrc || ''}
                                        crop={crop}
                                        zoom={zoom}
                                        aspect={1}
                                        cropShape="round"
                                        showGrid={false}
                                        restrictPosition={false}
                                        cropSize={{ width: 320, height: 320 }}
                                        onCropChange={setCrop}
                                        onZoomChange={setZoom}
                                        onCropComplete={onCropComplete}
                                        classes={{
                                            containerClassName: "bg-black",
                                            mediaClassName: ""
                                        }}
                                    />
                                </div>
                            ) : (
                                getPreviewImage() ? (
                                    <div className="relative w-full h-full">
                                        <img src={getPreviewImage() || ''} className="w-full h-full object-cover object-top" />
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-[#151515]">
                                        <User className="w-20 h-20 text-[#333]" strokeWidth={1} />
                                    </div>
                                )
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent pointer-events-none z-20" />

                            {/* Edit / Controls Overlay */}
                            {!isEditing && getPreviewImage() && (
                                <button
                                    onClick={() => {
                                        setEditingImageSrc(getPreviewImage() || '')
                                        setIsEditing(true)
                                    }}
                                    className="absolute top-4 right-4 z-30 p-2 bg-black/60 text-white/70 hover:text-white rounded-full hover:bg-black/80 backdrop-blur-sm border border-white/10 transition-all"
                                    title="Recadrer / Ajuster"
                                >
                                    <CropIcon className="w-4 h-4" />
                                </button>
                            )}

                            {/* Edit Mode Controls */}
                            {isEditing && (
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-[#18181b] border border-white/10 rounded-full px-4 py-2 shadow-xl w-3/4">
                                    <ZoomIn className="w-4 h-4 text-zinc-400" />
                                    <Slider
                                        value={[zoom]}
                                        min={1}
                                        max={3}
                                        step={0.1}
                                        onValueChange={(v) => setZoom(v[0])}
                                        className="flex-1"
                                    />
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="ml-2 p-1 bg-white text-black rounded-full hover:bg-zinc-200"
                                    >
                                        <Check className="w-3 h-3" />
                                    </button>
                                </div>
                            )}

                            {/* Image Selector Controls */}
                            {((selectedRace || selectedProfile || selectedCreature) || customImage) && (
                                <div className="absolute top-4 left-4 z-20 flex gap-2 bg-black/60 backdrop-blur-md p-1.5 rounded-full border border-white/10">
                                    {selectedCreature && (
                                        <button
                                            onClick={() => setActiveImageSource('creature')}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeImageSource === 'creature' ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                                            title="Image de Créature"
                                        >
                                            <Ghost className="w-4 h-4" />
                                        </button>
                                    )}
                                    {selectedRace && (
                                        <button
                                            onClick={() => setActiveImageSource('race')}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeImageSource === 'race' ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                                            title="Image de Race"
                                        >
                                            <Dna className="w-4 h-4" />
                                        </button>
                                    )}
                                    {selectedProfile && (
                                        <button
                                            onClick={() => setActiveImageSource('profile')}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeImageSource === 'profile' ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                                            title="Image de Profil"
                                        >
                                            <Swords className="w-4 h-4" />
                                        </button>
                                    )}
                                    {customImage && activeImageSource === 'custom' && (
                                        <button
                                            onClick={() => setActiveImageSource('custom')}
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${activeImageSource === 'custom' ? 'bg-[#c0a080] text-black shadow-lg' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                                            title="Image Personnalisée"
                                        >
                                            <User className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Title overlay - Editable (Hidden in Edit Mode) */}
                            {!isEditing && (
                                <div className="absolute bottom-6 left-6 right-6 group z-20">
                                    <div className="relative flex items-center mb-1">
                                        <input
                                            type="text"
                                            value={customName}
                                            onChange={(e) => setCustomName(e.target.value)}
                                            placeholder={getPreviewName()}
                                            className="w-full bg-transparent text-3xl font-serif font-bold text-white drop-shadow-md leading-tight focus:outline-none border-b-2 border-white/10 hover:border-white/30 focus:border-[#c0a080] placeholder:text-white transition-all py-1"
                                        />
                                        <Pencil className="absolute right-0 w-5 h-5 text-white/30 group-hover:text-white/80 pointer-events-none transition-colors" />
                                    </div>
                                    <div className="flex items-center gap-2 text-[#c0a080] text-sm font-medium uppercase tracking-wider">
                                        {selectedCreatureData ? 'Créature' : 'Nouvelle Créature'}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Interactive Controls (Level/Image) - Always Available */}
                        <div className="px-6 py-4 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-lg flex flex-col gap-2">
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">Niveau</span>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="range" min="1" max="20"
                                            value={targetLevel}
                                            onChange={(e) => setTargetLevel(parseInt(e.target.value))}
                                            className="flex-1 accent-[#c0a080] h-1.5 bg-[#333] rounded-lg appearance-none cursor-pointer"
                                        />
                                        <span className="text-[#c0a080] font-mono font-bold text-lg">{targetLevel}</span>
                                    </div>
                                </div>
                                <label className="bg-[#1a1a1a] border border-[#2a2a2a] p-3 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-[#c0a080]/50 transition-colors group">
                                    <Upload className="w-4 h-4 text-zinc-500 group-hover:text-[#c0a080] mb-1" />
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider group-hover:text-zinc-300">Image</span>
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                </label>
                            </div>

                        </div>

                        {/* 4. Stats & Info */}
                        <div className="px-6 pb-24 space-y-8">

                            {/* Description Text */}
                            {(selectedCreatureData || selectedRaceData || selectedProfileData) && (
                                <div className="prose prose-invert prose-sm">
                                    <p className="text-zinc-400 leading-relaxed text-sm">
                                        {(selectedCreatureData ?? selectedRaceData)?.description}
                                        {selectedProfileData && !selectedCreatureData && (
                                            <span className="block mt-2 text-zinc-500 italic border-l-2 border-[#333] pl-3">
                                                {selectedProfileData.description}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            )}

                            {/* Stat Grid - Always Available — dérivé du système actif (stat vitale
                                principale, défense, attaques de combat, caractéristiques) plutôt que
                                PV/Defense/Contact/Distance/Magie/FOR/DEX/... en dur. */}
                            <div className="space-y-6">
                                <h3 className="text-[#c0a080] text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#c0a080]" />
                                    Statistiques
                                </h3>

                                {/* Main Vitals — dérivé dynamiquement de gameSystem.stats, jamais de clé en dur.
                                    Toutes les stats vitales (Blessures, Stress, ...) sont affichées, pas seulement la première. */}
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        ...vitalStats.map(({ stat, maxKey }) => ({ label: stat.shortLabel || stat.label, key: maxKey || stat.key, color: 'text-green-400' })),
                                        ...(defenseKey ? [{ label: 'DEF', key: defenseKey, color: 'text-blue-400' }] : []),
                                        ...extraCombatStats.map((stat) => ({ label: stat.shortLabel || stat.label, key: stat.key, color: 'text-yellow-400' })),
                                    ].map(stat => (
                                        <div key={stat.key} className="bg-[#1e1e20] p-2 rounded border border-[#2a2a2a] flex flex-col items-center">
                                            <span className="text-zinc-500 text-[10px] uppercase font-bold">{stat.label}</span>
                                            <input
                                                type="number"
                                                value={stats[stat.key] ?? 0}
                                                onChange={(e) => setStats(prev => ({ ...prev, [stat.key]: parseInt(e.target.value) || 0 }))}
                                                className={`w-full bg-transparent text-center font-mono font-bold text-lg focus:outline-none ${stat.color}`}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Combat Stats */}
                                {combatAttackKeys.length > 0 && (
                                    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${combatAttackKeys.length}, minmax(0, 1fr))` }}>
                                        {combatAttackKeys.map((key, i) => (
                                            <div key={key} className="bg-[#1e1e20] p-2 rounded border border-[#2a2a2a] flex flex-col items-center">
                                                <span className="text-zinc-500 text-[10px] uppercase font-bold">{key}</span>
                                                <input
                                                    type="number"
                                                    value={stats[key] ?? 0}
                                                    onChange={(e) => setStats(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                                                    className={`w-full bg-transparent text-center font-mono font-bold text-lg focus:outline-none ${['text-red-400', 'text-emerald-400', 'text-purple-400'][i % 3]}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Attributes */}
                                {abilityStats.length > 0 && (
                                    <div className="grid grid-cols-3 gap-2">
                                        {abilityStats.map((stat) => (
                                            <div key={stat.key} className="flex items-center justify-between bg-[#1a1a1a] px-2 py-1.5 rounded border border-[#2a2a2a]">
                                                <span className="text-[10px] font-bold text-zinc-400">{stat.shortLabel || stat.key}</span>
                                                <input
                                                    type="number"
                                                    value={stats[stat.key] ?? 10}
                                                    onChange={(e) => setStats(prev => ({ ...prev, [stat.key]: parseInt(e.target.value) || 0 }))}
                                                    className="w-12 bg-transparent text-right font-mono text-sm text-[#e0e0e0] focus:outline-none focus:text-[#c0a080]"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-6 border-t border-[#2a2a2a] bg-[#121212] flex gap-3 z-20">
                        <button onClick={onClose} className="px-6 py-3 rounded-xl border border-[#333] text-zinc-400 hover:text-white hover:bg-[#222] font-medium text-sm transition-colors">
                            Fermer
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={!(getPreviewImage() || customImage) || isCreating}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-bold tracking-wide transition-all ${(getPreviewImage() || customImage) && !isCreating
                                ? 'bg-[#c0a080] hover:bg-[#e0c0a0] text-black shadow-lg shadow-[#c0a080]/10'
                                : 'bg-[#1a1a1a] text-zinc-600 cursor-not-allowed border border-[#2a2a2a]'
                            }`}
                        >
                            {isCreating ? (
                                <>
                                    <span>Invocation...</span>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                </>
                            ) : (
                                <>
                                    <span>Invoquer</span>
                                    <Check className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Race Image Selector */}
            {selectedRaceData && (
                <RaceImageSelector
                    isOpen={isImageSelectorOpen}
                    onClose={() => setIsImageSelectorOpen(false)}
                    onSelectImage={(imageUrl) => {
                        // All images from race gallery should use 'race' source
                        setCustomImage(imageUrl)
                        setActiveImageSource('race')
                    }}
                    raceName={selectedRaceData.label}
                    currentImage={customImage}
                    raceDefaultImage={selectedRaceData.image}
                />
            )}
        </div>
    )
}

// --- SUB COMPONENTS ---

interface CardProps {
    title: string
    subtitle: string
    image?: string
    isSelected?: boolean
    onClick?: () => void
    footer?: React.ReactNode
}

function Card({ title, subtitle, image, isSelected, onClick, footer }: CardProps) {
    return (
        <div
            onClick={onClick}
            className={`
                group relative flex flex-col aspect-[3/4] rounded-xl overflow-hidden cursor-pointer transition-all duration-300
                border 
                ${isSelected
                    ? 'border-[#c0a080] ring-1 ring-[#c0a080] scale-[1.02] shadow-[0_0_20px_rgba(192,160,128,0.2)]'
                    : 'border-[#27272a] hover:border-[#52525b] hover:shadow-xl opacity-80 hover:opacity-100'
                }
            `}
        >
            {/* Image Layer */}
            <div className="absolute inset-0 bg-[#1a1a1a]">
                {image ? (
                    <img
                        src={image}
                        alt={title}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#202022]">
                        <User className="w-12 h-12 text-[#333]" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            </div>

            {/* Content Layer */}
            <div className="relative flex-1 flex flex-col justify-end p-4">
                <span className="text-[10px] font-bold text-[#c0a080] uppercase tracking-wider mb-1 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                    {subtitle}
                </span>
                <h3 className={`font-serif text-lg font-bold leading-none mb-2 ${isSelected ? 'text-[#c0a080]' : 'text-zinc-200 group-hover:text-white'}`}>
                    {title}
                </h3>

                {footer && (
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between mt-1">
                        {footer}
                    </div>
                )}
            </div>

            {/* Selection Indicator */}
            {isSelected && (
                <div className="absolute top-3 right-3 w-6 h-6 bg-[#c0a080] rounded-full flex items-center justify-center shadow-lg">
                    <Check className="w-4 h-4 text-black" strokeWidth={3} />
                </div>
            )}
        </div>
    )
}
