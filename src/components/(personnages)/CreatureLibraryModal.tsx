"use client"

import React, { useState, useEffect } from 'react'
import { Search, Info, User, Upload, BookOpen, X, Check, Dna, Shield, Heart, Swords, Filter, Pencil, Crop as CropIcon, ZoomIn, Crop, Loader2, Ghost, Images } from 'lucide-react'
import { type NewCharacter } from '@/app/[roomid]/map/types'
import { mapImagePath } from '@/utils/imagePathMapper'
import Cropper from 'react-easy-crop'
import { getCroppedImg, createCompositeImage } from '@/lib/cropImageHelper'
import { Slider } from '@/components/ui/slider'
import { RaceImageSelector } from './RaceImageSelector'

// Types based on the JSON files
interface RaceData {
    description: string;
    metrics: string;
    image: string;
    tailleMoyenne: number;
    poidsMoyen: number;
    modificateurs: Record<string, number>;
}

interface ProfileData {
    description: string;
    hitDie: string;
    image: string;
}

interface BestiaryData {
    Nom: string;
    Type: string;
    description: string;
    image?: string;
    niveau: number;
    Challenge?: string;
    PV: number;
    PV_Max: number;
    Defense: number;
    Contact: number;
    Distance: number;
    Magie: number;
    INIT: number;
    FOR: number;
    DEX: number;
    CON: number;
    INT: number;
    SAG: number;
    CHA: number;
    Actions?: Array<{
        Nom: string;
        Description: string;
        Toucher: number;
    }>;
}

interface TokenData {
    name: string;
    path: string;
    localPath: string;
    category: string;
}

interface CreatureLibraryModalProps {
    isOpen: boolean
    onClose: () => void
    onImport: (character: NewCharacter) => void
}

export function CreatureLibraryModal({ isOpen, onClose, onImport }: CreatureLibraryModalProps) {
    const [races, setRaces] = useState<Record<string, RaceData>>({})
    const [profiles, setProfiles] = useState<Record<string, ProfileData>>({})
    const [bestiary, setBestiary] = useState<Record<string, BestiaryData>>({})
    const [tokens, setTokens] = useState<TokenData[]>([])
    const [loading, setLoading] = useState(true)

    // Cropping State
    const [crop, setCrop] = useState({ x: 0, y: 0 })
    const [zoom, setZoom] = useState(1)
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
    const [isEditing, setIsEditing] = useState(false)
    const [editingImageSrc, setEditingImageSrc] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)

    // Stats State
    const [stats, setStats] = useState({
        PV_Max: 10,
        Defense: 10,
        INIT: 10,
        Contact: 0,
        Distance: 0,
        Magie: 0,
        FOR: 10,
        DEX: 10,
        CON: 10,
        INT: 10,
        SAG: 10,
        CHA: 10
    })

    // Selection State
    const [activeTab, setActiveTab] = useState<'bestiary' | 'race' | 'profile' | 'token'>('bestiary')

    const [selectedRace, setSelectedRace] = useState<string | null>(null)
    const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
    const [selectedToken, setSelectedToken] = useState<TokenData | null>(null)
    const [selectedCreature, setSelectedCreature] = useState<string | null>(null)

    const [targetLevel, setTargetLevel] = useState<number>(1)
    const [customImage, setCustomImage] = useState<string>('')
    const [customName, setCustomName] = useState<string>('')
    const [activeImageSource, setActiveImageSource] = useState<'race' | 'profile' | 'creature' | 'custom'>('creature')
    const [searchQuery, setSearchQuery] = useState('')

    // Image Selector Dialog State
    const [isImageSelectorOpen, setIsImageSelectorOpen] = useState(false)

    // Fetch Data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [racesRes, profilesRes, bestiaryRes] = await Promise.all([
                    fetch('/tabs/race.json'),
                    fetch('/tabs/profile.json'),
                    fetch('/tabs/bestiairy.json')
                ])
                const racesData: Record<string, RaceData> = await racesRes.json()
                const profilesData: Record<string, ProfileData> = await profilesRes.json()
                const bestiaryData: Record<string, BestiaryData> = await bestiaryRes.json()
                const assetsRes = await fetch('/asset-mappings.json')
                const assetsData = await assetsRes.json()

                // Filter for Token category
                const tokenList = assetsData.filter((asset: any) => asset.category === 'Token')

                // Map local image paths to R2 URLs for races and profiles
                const racesWithMappedImages: Record<string, RaceData> = {}
                for (const [key, race] of Object.entries(racesData)) {
                    racesWithMappedImages[key] = {
                        ...race,
                        image: await mapImagePath(race.image)
                    }
                }

                const profilesWithMappedImages: Record<string, ProfileData> = {}
                for (const [key, profile] of Object.entries(profilesData)) {
                    profilesWithMappedImages[key] = {
                        ...profile,
                        image: await mapImagePath(profile.image)
                    }
                }

                setRaces(racesWithMappedImages)
                setProfiles(profilesWithMappedImages)
                setBestiary(bestiaryData)
                setTokens(tokenList)
            } catch (error) {
                console.error("Error loading library data:", error)
            } finally {
                setLoading(false)
            }
        }
        if (isOpen) loadData()
    }, [isOpen])

    // Calculate Defaults when selection changes
    useEffect(() => {
        if (!isOpen) return

        let newStats = { ...stats }

        // PRIORITY 1: BESTIARY (if a creature is selected)
        if (selectedCreature && bestiary[selectedCreature]) {
            const creature = bestiary[selectedCreature]
            const safeRefLevel = Math.max(1, creature.niveau)

            const scaleHP = (val: number) => {
                const basePerLevel = val / safeRefLevel
                const levelDiff = targetLevel - safeRefLevel
                return Math.floor(val + (basePerLevel * levelDiff * 0.5))
            }
            const scaleStat = (val: number) => val + Math.floor((targetLevel - safeRefLevel) / 2)
            const scaleCombat = (val: number) => val + (targetLevel - safeRefLevel)
            const scaleDef = (val: number) => val + Math.floor((targetLevel - safeRefLevel) / 2)

            newStats = {
                PV_Max: scaleHP(creature.PV_Max),
                Defense: scaleDef(creature.Defense),
                INIT: creature.INIT,
                Contact: scaleCombat(creature.Contact),
                Distance: scaleCombat(creature.Distance),
                Magie: scaleCombat(creature.Magie),
                FOR: scaleStat(creature.FOR),
                DEX: scaleStat(creature.DEX),
                CON: scaleStat(creature.CON),
                INT: scaleStat(creature.INT),
                SAG: scaleStat(creature.SAG),
                CHA: scaleStat(creature.CHA),
            }
        }
        // PRIORITY 2: CUSTOM (Race + Profile)
        else {
            const raceData = selectedRace ? races[selectedRace] : null
            const profileData = selectedProfile ? profiles[selectedProfile] : null
            const mods = raceData?.modificateurs || {}

            // 1. Calculate Base (Level 1) Stats
            const baseStats = { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 }
            const lvl1Attr = {
                FOR: baseStats.FOR + (mods.FOR || 0),
                DEX: baseStats.DEX + (mods.DEX || 0),
                CON: baseStats.CON + (mods.CON || 0),
                INT: baseStats.INT + (mods.INT || 0),
                SAG: baseStats.SAG + (mods.SAG || 0),
                CHA: baseStats.CHA + (mods.CHA || 0),
            }
            const calcMod = (val: number) => Math.floor((val - 10) / 2)

            const hitDieVal = profileData
                ? parseInt((profileData.hitDie || '1d8').replace('d', '')) || 8
                : 8

            const lvl1HP = Math.max(1, hitDieVal + calcMod(lvl1Attr.CON))
            const lvl1Def = 10 + calcMod(lvl1Attr.DEX)

            // 2. Define Scaling Helpers (same as Bestiary, but refLevel = 1)
            const levelDiff = Math.max(0, targetLevel - 1)

            const scaleHP = (val: number) => Math.floor(val + (val * levelDiff * 0.5)) // 50% growth per level
            const scaleStat = (val: number) => val + Math.floor(levelDiff / 2)
            const scaleCombat = (val: number) => val + levelDiff
            const scaleDef = (val: number) => val + Math.floor(levelDiff / 2)

            // 3. Apply Scaling
            newStats = {
                PV_Max: scaleHP(lvl1HP),
                Defense: scaleDef(lvl1Def),
                INIT: scaleStat(lvl1Attr.DEX), // Init scales like Dex
                Contact: scaleCombat(1 + calcMod(lvl1Attr.FOR)),
                Distance: scaleCombat(1 + calcMod(lvl1Attr.DEX)),
                Magie: scaleCombat(1 + calcMod(lvl1Attr.CHA)),
                FOR: scaleStat(lvl1Attr.FOR),
                DEX: scaleStat(lvl1Attr.DEX),
                CON: scaleStat(lvl1Attr.CON),
                INT: scaleStat(lvl1Attr.INT),
                SAG: scaleStat(lvl1Attr.SAG),
                CHA: scaleStat(lvl1Attr.CHA),
            }
        }

        setStats(newStats)
    }, [selectedRace, selectedProfile, selectedCreature, targetLevel, activeTab, races, profiles, bestiary])

    // Reset crop when selection changes
    useEffect(() => {
        // Don't reset if we're in token tab (crop mode should stay active)
        if (activeTab !== 'token') {
            setIsEditing(false)
            setCrop({ x: 0, y: 0 })
            setZoom(1)
            setEditingImageSrc(null)
        }
    }, [selectedRace, selectedProfile, selectedCreature, selectedToken, activeImageSource, activeTab])

    // Auto-enable crop mode when Token tab is opened or when token is selected
    useEffect(() => {
        if (activeTab === 'token') {
            // Calculate current preview image inline (same logic as getPreviewImage)
            let currentPreview = ''

            if (activeImageSource === 'custom' && customImage) currentPreview = customImage
            else if (activeImageSource === 'creature' && selectedCreature && bestiary[selectedCreature]?.image) currentPreview = bestiary[selectedCreature].image
            else if (activeImageSource === 'profile' && selectedProfile && profiles[selectedProfile]?.image) currentPreview = profiles[selectedProfile].image
            else if (activeImageSource === 'race') {
                if (customImage) currentPreview = customImage
                else if (selectedRace && races[selectedRace]?.image) currentPreview = races[selectedRace].image
            }
            else if (customImage) currentPreview = customImage
            else if (selectedCreature && bestiary[selectedCreature]?.image) currentPreview = bestiary[selectedCreature].image
            else if (selectedProfile && profiles[selectedProfile]?.image) currentPreview = profiles[selectedProfile].image
            else if (selectedRace && races[selectedRace]?.image) currentPreview = races[selectedRace].image

            if (currentPreview) {
                setEditingImageSrc(currentPreview)
                setZoom(0.5) // Start with smaller zoom for better token framing
                setIsEditing(true)
            }
        } else {
            // Exit crop mode when not in Token tab
            setIsEditing(false)
        }
    }, [activeTab, selectedToken, customImage, activeImageSource, selectedCreature, selectedProfile, selectedRace, bestiary, profiles, races])


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

            // If token selected, we need to composite
            // --- COMPOSITING / CROPPING LOGIC ---
            try {
                if (selectedToken) {
                    let sourceForComposite = finalImage;

                    // If the user used the cropper, use that result
                    if (croppedAreaPixels && (isEditing || editingImageSrc)) {
                        sourceForComposite = await getCroppedImg(editingImageSrc || finalImage, croppedAreaPixels);
                    }

                    finalImage = await createCompositeImage(sourceForComposite, selectedToken.path);
                }
                else if (croppedAreaPixels && (isEditing || editingImageSrc)) {
                    finalImage = await getCroppedImg(editingImageSrc || finalImage, croppedAreaPixels);
                }

            } catch (e: any) {
                console.error("Error processing image:", e);
                alert(`Erreur lors de la création du token : ${e.message || e}`);
                setIsCreating(false)
                return
            }

            const newChar: NewCharacter = {
                name: charName,
                niveau: targetLevel,
                image: { src: finalImage },
                imageURL: selectedToken ? baseImage : '',
                visibility: 'visible',
                PV: stats.PV_Max,
                PV_Max: stats.PV_Max,
                Defense: stats.Defense,
                Contact: stats.Contact,
                Distance: stats.Distance,
                Magie: stats.Magie,
                INIT: stats.INIT,
                FOR: stats.FOR,
                DEX: stats.DEX,
                CON: stats.CON,
                SAG: stats.SAG,
                INT: stats.INT,
                CHA: stats.CHA,
                nombre: 1,
                Actions: (activeTab === 'bestiary' && selectedCreature) ? (bestiary[selectedCreature]?.Actions || []) : []
            }

            await onImport(newChar)
            onClose()

        } catch (error) {
            console.error("Error creating character:", error)
        } finally {
            setIsCreating(false)
        }
    }

    // Filtering
    const filteredRaces = Object.entries(races).filter(([key, val]) =>
        key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        val.description.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredProfiles = Object.entries(profiles).filter(([key, val]) =>
        key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        val.description.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredBestiary = Object.entries(bestiary).filter(([key, val]) =>
        key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        val.Nom.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const filteredTokens = tokens.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (!isOpen) return null

    // Determine current grid items based on active tabs
    // Determine current grid items based on active tabs
    const renderGridItems = () => {
        if (activeTab === 'bestiary') {
            return filteredBestiary.map(([key, data]) => (
                <Card
                    key={key}
                    title={data.Nom}
                    subtitle={data.Type}
                    image={data.image}
                    isSelected={selectedCreature === key}
                    onClick={() => {
                        setSelectedCreature(key)
                        // MIX & MATCH ALLOWED: Do not clear selectedProfile
                        setSelectedRace(null) // Clear Race as it conflicts with "Creature Base"
                        setTargetLevel(data.niveau)
                        setActiveImageSource('creature')
                    }}
                    footer={<span className="text-xs bg-black/60 px-2 py-0.5 rounded text-[#c0a080] border border-[#c0a080]/30">Ne: {Math.max(1, data.niveau)}</span>}
                />
            ))
        }

        if (activeTab === 'race') {
            return filteredRaces.map(([key, data]) => (
                <Card
                    key={key}
                    title={key.replace('_', ' ')}
                    subtitle="Race"
                    image={data.image}
                    isSelected={selectedRace === key}
                    onClick={() => {
                        const isSelected = selectedRace === key
                        if (!isSelected) {
                            setSelectedRace(key)
                            setSelectedCreature(null) // Custom Mode -> Clear Creature
                            setActiveImageSource('race')
                            // Open image selector automatically
                            setIsImageSelectorOpen(true)
                        } else {
                            setSelectedRace(null)
                        }
                    }}
                    footer={
                        <div className="flex gap-1">
                            {Object.entries(data.modificateurs || {}).slice(0, 2).map(([k, v]) => (
                                <span key={k} className="text-[10px] bg-white/10 px-1 rounded">{k} {v > 0 ? '+' : ''}{v}</span>
                            ))}
                        </div>
                    }
                />
            ))
        }

        if (activeTab === 'profile') {
            return filteredProfiles.map(([key, data]) => (
                <Card
                    key={key}
                    title={key}
                    subtitle="Classe"
                    image={data.image}
                    isSelected={selectedProfile === key}
                    onClick={() => {
                        const isSelected = selectedProfile === key
                        setSelectedProfile(isSelected ? null : key)
                        // MIX & MATCH ALLOWED: Do not clear creature
                        setActiveImageSource('profile')
                    }}
                    footer={<span className="text-xs text-red-300">DV: {data.hitDie}</span>}
                />
            ))
        }

        if (activeTab === 'token') {
            return filteredTokens.map((token) => (
                <Card
                    key={token.name}
                    title={token.name.replace('.png', '').replace('Token', 'Token ')}
                    subtitle="Token"
                    image={token.path}
                    isSelected={selectedToken?.name === token.name}
                    onClick={() => {
                        const isSelected = selectedToken?.name === token.name
                        setSelectedToken(isSelected ? null : token)
                    }}
                />
            ))
        }
    }

    // --- RENDER HELPERS ---

    const getPreviewImage = () => {
        // Priority: Custom > Active Source Selection > Hierarchy(Creature > Race > Profile > Custom)

        // If user explicitly chose a source in the preview UI controls, try to honor it if available
        if (activeImageSource === 'custom' && customImage) return customImage
        if (activeImageSource === 'creature' && selectedCreature && bestiary[selectedCreature]?.image) return bestiary[selectedCreature].image
        if (activeImageSource === 'profile' && selectedProfile && profiles[selectedProfile]?.image) return profiles[selectedProfile].image
        // For race source: prioritize customImage (gallery selection) over default race image
        if (activeImageSource === 'race') {
            if (customImage) return customImage
            if (selectedRace && races[selectedRace]?.image) return races[selectedRace].image
        }


        // Fallback Hierarchy
        if (customImage) return customImage
        if (selectedCreature && bestiary[selectedCreature]?.image) return bestiary[selectedCreature].image
        if (selectedProfile && profiles[selectedProfile]?.image) return profiles[selectedProfile].image
        if (selectedRace && races[selectedRace]?.image) return races[selectedRace].image

        return ''
    }

    const getPreviewName = () => {
        // CASE 1: BESTIARY + optionally Profile
        if (selectedCreature && bestiary[selectedCreature]) {
            const creatureName = bestiary[selectedCreature].Nom
            const profileName = selectedProfile ? selectedProfile.charAt(0).toUpperCase() + selectedProfile.slice(1) : ''
            return [creatureName, profileName].filter(Boolean).join(' ')
        }

        // CASE 2: CUSTOM (Race + Profile)
        const pName = selectedProfile ? selectedProfile.charAt(0).toUpperCase() + selectedProfile.slice(1) : ''
        const rName = selectedRace ? selectedRace.charAt(0).toUpperCase() + selectedRace.slice(1).replace('_', ' ') : ''
        return [pName, rName].filter(Boolean).join(' ') || 'Nouveau Personnage'
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">

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

                        {/* Unified Tabs */}
                        <div className="flex bg-[#18181b] p-1 rounded-lg border border-[#27272a]">
                            <button
                                onClick={() => setActiveTab('bestiary')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'bestiary' ? 'bg-[#c0a080] text-[#09090b] shadow-md' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                Bestiaire
                            </button>
                            <button
                                onClick={() => setActiveTab('race')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'race' ? 'bg-[#c0a080] text-[#09090b] shadow-md' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                Races
                            </button>
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'profile' ? 'bg-[#c0a080] text-[#09090b] shadow-md' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                Classes
                            </button>
                            <button
                                onClick={() => setActiveTab('token')}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'token' ? 'bg-[#c0a080] text-[#09090b] shadow-md' : 'text-zinc-500 hover:text-zinc-200'}`}
                            >
                                Tokens
                            </button>
                        </div>
                    </div>

                    {/* Selection Summary Bar */}
                    <div className="px-6 py-2 border-b border-[#2a2a2a] bg-[#0f0f11] flex items-center gap-4 text-xs text-zinc-500 h-10">
                        {selectedCreature ? (
                            <span className="flex items-center gap-1 text-[#c0a080] font-bold bg-[#c0a080]/10 px-2 py-0.5 rounded border border-[#c0a080]/30">
                                {bestiary[selectedCreature]?.Nom}
                                <button onClick={(e) => { e.stopPropagation(); setSelectedCreature(null); }} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                        ) : null}

                        {selectedRace ? (
                            <span className="flex items-center gap-1 text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                Race: {selectedRace.replace('_', ' ')}
                                <button onClick={(e) => { e.stopPropagation(); setSelectedRace(null); }} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                        ) : null}

                        {selectedProfile ? (
                            <span className="flex items-center gap-1 text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                Classe: {selectedProfile}
                                <button onClick={(e) => { e.stopPropagation(); setSelectedProfile(null); }} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                        ) : null}

                        {selectedToken ? (
                            <span className="flex items-center gap-1 text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                                Token: {selectedToken.name.replace('.png', '')}
                                <button onClick={(e) => { e.stopPropagation(); setSelectedToken(null); }} className="hover:text-white"><X className="w-3 h-3" /></button>
                            </span>
                        ) : null}

                        {!selectedCreature && !selectedRace && !selectedProfile && !selectedToken &&
                            <span>Sélectionnez des éléments pour composer votre personnage.</span>
                        }
                    </div>

                    {/* Content Grid */}
                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[url('/grid-pattern.svg')] bg-repeat opacity-90">
                        {loading ? (
                            <div className="w-full h-40 flex items-center justify-center">
                                <div className="w-8 h-8 border-4 border-[#c0a080] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-5">
                                {renderGridItems()}
                            </div>
                        )}
                    </div>
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
                                    {/* Token Overlay for WYSIWYG preview */}
                                    {selectedToken && (
                                        <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                                            <img
                                                src={selectedToken.path}
                                                alt="Token Frame"
                                                className="w-full h-full object-contain opacity-80"
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                getPreviewImage() ? (
                                    <div className="relative w-full h-full">
                                        <img src={getPreviewImage() || ''} className="w-full h-full object-cover object-top" />
                                        {/* Show token overlay in preview too if token is selected */}
                                        {activeTab === 'token' && selectedToken && (
                                            <div className="absolute inset-0 pointer-events-none z-20 flex items-center justify-center">
                                                <img
                                                    src={selectedToken.path}
                                                    alt="Token Frame"
                                                    // Use same scaling visual as the crop view logic implies (though preview is full cover)
                                                    // Actually preview here is just valid image. 
                                                    // If we are in token tab, we show the composition result usually?
                                                    // But getPreviewImage returns the raw image.
                                                    // For now just showing raw image is fine as they enter crop mode auto.
                                                    className="w-full h-full object-contain opacity-80 hidden" // Hidden for now to avoid confusion if not composited
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-[#151515]">
                                        <User className="w-20 h-20 text-[#333]" strokeWidth={1} />
                                    </div>
                                )
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#121212] via-[#121212]/60 to-transparent pointer-events-none z-20" />

                            {/* Token Overlay Preview */}
                            {selectedToken && (
                                <div
                                    className="absolute inset-0 z-20 pointer-events-none bg-contain bg-center bg-no-repeat transition-transform"
                                    style={{ backgroundImage: `url(${selectedToken.path})` }}
                                />
                            )}

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
                                        {selectedCreature ? bestiary[selectedCreature]?.Type : 'Nouvelle Créature'}
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
                                    <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider group-hover:text-zinc-300">Modifier Image</span>
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                </label>
                            </div>
                        </div>

                        {/* 3. Stats & Info */}
                        <div className="px-6 pb-24 space-y-8">

                            {/* Description Text */}
                            {(selectedCreature || selectedRace || selectedProfile) && (
                                <div className="prose prose-invert prose-sm">
                                    <p className="text-zinc-400 leading-relaxed text-sm">
                                        {selectedRace && races[selectedRace]?.description}
                                        {selectedProfile && !selectedCreature && (
                                            <span className="block mt-2 text-zinc-500 italic border-l-2 border-[#333] pl-3">
                                                {profiles[selectedProfile]?.description}
                                            </span>
                                        )}
                                    </p>
                                </div>
                            )}

                            {/* Stat Grid - Always Available */}
                            <div className="space-y-6">
                                <h3 className="text-[#c0a080] text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#c0a080]" />
                                    Statistiques
                                </h3>

                                {/* Main Vitals */}
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { label: 'PV', key: 'PV_Max', color: 'text-green-400' },
                                        { label: 'DEF', key: 'Defense', color: 'text-blue-400' },
                                        { label: 'INIT', key: 'INIT', color: 'text-yellow-400' },
                                    ].map(stat => (
                                        <div key={stat.key} className="bg-[#1e1e20] p-2 rounded border border-[#2a2a2a] flex flex-col items-center">
                                            <span className="text-zinc-500 text-[10px] uppercase font-bold">{stat.label}</span>
                                            <input
                                                type="number"
                                                value={(stats as any)[stat.key]}
                                                onChange={(e) => setStats(prev => ({ ...prev, [stat.key]: parseInt(e.target.value) || 0 }))}
                                                className={`w-full bg-transparent text-center font-mono font-bold text-lg focus:outline-none ${stat.color}`}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Combat Stats */}
                                <div className="grid grid-cols-3 gap-3">
                                    {[
                                        { label: 'Contact', key: 'Contact', color: 'text-red-400' },
                                        { label: 'Distance', key: 'Distance', color: 'text-emerald-400' },
                                        { label: 'Magie', key: 'Magie', color: 'text-purple-400' },
                                    ].map(stat => (
                                        <div key={stat.key} className="bg-[#1e1e20] p-2 rounded border border-[#2a2a2a] flex flex-col items-center">
                                            <span className="text-zinc-500 text-[10px] uppercase font-bold">{stat.label}</span>
                                            <input
                                                type="number"
                                                value={(stats as any)[stat.key]}
                                                onChange={(e) => setStats(prev => ({ ...prev, [stat.key]: parseInt(e.target.value) || 0 }))}
                                                className={`w-full bg-transparent text-center font-mono font-bold text-lg focus:outline-none ${stat.color}`}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Attributes */}
                                <div className="grid grid-cols-3 gap-2">
                                    {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((attr) => (
                                        <div key={attr} className="flex items-center justify-between bg-[#1a1a1a] px-2 py-1.5 rounded border border-[#2a2a2a]">
                                            <span className="text-[10px] font-bold text-zinc-400">{attr}</span>
                                            <input
                                                type="number"
                                                value={(stats as any)[attr]}
                                                onChange={(e) => setStats(prev => ({ ...prev, [attr]: parseInt(e.target.value) || 0 }))}
                                                className="w-12 bg-transparent text-right font-mono text-sm text-[#e0e0e0] focus:outline-none focus:text-[#c0a080]"
                                            />
                                        </div>
                                    ))}
                                </div>
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
                            disabled={!getPreviewImage() || isCreating}
                            className={`flex-1 flex items-center justify-center gap-2 rounded-xl text-sm font-bold tracking-wide transition-all ${getPreviewImage() && !isCreating
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
            {selectedRace && (
                <RaceImageSelector
                    isOpen={isImageSelectorOpen}
                    onClose={() => setIsImageSelectorOpen(false)}
                    onSelectImage={(imageUrl) => {
                        // All images from race gallery should use 'race' source
                        setCustomImage(imageUrl)
                        setActiveImageSource('race')
                    }}
                    raceName={selectedRace}
                    currentImage={customImage}
                    raceDefaultImage={selectedRace ? races[selectedRace]?.image : undefined}
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
