"use client"

import React, { useState, useEffect } from 'react'
import { Search, Info, Shield, Heart, Swords, Brain, Flame, PersonStanding, User, Scale, Upload, BookOpen, X, Check, ArrowRight } from 'lucide-react'
import { type NewCharacter } from '@/app/[roomid]/map/types'

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

interface CreatureLibraryModalProps {
    isOpen: boolean
    onClose: () => void
    onImport: (character: NewCharacter) => void
}

export function CreatureLibraryModal({ isOpen, onClose, onImport }: CreatureLibraryModalProps) {
    const [races, setRaces] = useState<Record<string, RaceData>>({})
    const [profiles, setProfiles] = useState<Record<string, ProfileData>>({})
    const [bestiary, setBestiary] = useState<Record<string, BestiaryData>>({})
    const [loading, setLoading] = useState(true)

    const [selectedRace, setSelectedRace] = useState<string | null>(null)
    const [selectedProfile, setSelectedProfile] = useState<string | null>(null)
    const [selectedCreature, setSelectedCreature] = useState<string | null>(null)
    const [targetLevel, setTargetLevel] = useState<number>(1)
    const [customImage, setCustomImage] = useState<string>('')

    const [searchQuery, setSearchQuery] = useState('')
    const [activeTab, setActiveTab] = useState<'custom' | 'bestiary'>('custom')
    const [customSubTab, setCustomSubTab] = useState<'race' | 'profile'>('race')

    // Fetch Data
    useEffect(() => {
        const loadData = async () => {
            try {
                const [racesRes, profilesRes, bestiaryRes] = await Promise.all([
                    fetch('/tabs/race.json'),
                    fetch('/tabs/profile.json'),
                    fetch('/tabs/bestiairy.json')
                ])
                const racesData = await racesRes.json()
                const profilesData = await profilesRes.json()
                const bestiaryData = await bestiaryRes.json()

                setRaces(racesData)
                setProfiles(profilesData)
                setBestiary(bestiaryData)
            } catch (error) {
                console.error("Error loading library data:", error)
            } finally {
                setLoading(false)
            }
        }
        if (isOpen) loadData()
    }, [isOpen])

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setCustomImage(reader.result as string)
            }
            reader.readAsDataURL(file)
        }
    }

    const handleImport = () => {
        if (!selectedCreature && !selectedProfile && !selectedRace) return

        // CASE 1: BESTIARY IMPORT
        if (activeTab === 'bestiary' && selectedCreature) {
            const creature = bestiary[selectedCreature]
            // Clamp refLevel to 1 to avoid division by zero
            const safeRefLevel = Math.max(1, creature.niveau)

            // Scaling Factors
            // New reduced scaling: Base + (Base/Ref * (Target-Ref) * 0.5)
            const scaleHP = (val: number) => {
                const basePerLevel = val / safeRefLevel
                const levelDiff = targetLevel - safeRefLevel
                return Math.floor(val + (basePerLevel * levelDiff * 0.5))
            }
            const scaleStat = (val: number) => val + Math.floor((targetLevel - safeRefLevel) / 2) // +1 every 2 levels diff
            const scaleCombat = (val: number) => val + (targetLevel - safeRefLevel) // +1 every level diff
            const scaleDef = (val: number) => val + Math.floor((targetLevel - safeRefLevel) / 2)

            const newChar: NewCharacter = {
                name: creature.Nom,
                niveau: targetLevel,
                image: { src: customImage || creature.image || '' },
                visibility: 'visible',
                PV: scaleHP(creature.PV),
                PV_Max: scaleHP(creature.PV_Max),
                Defense: scaleDef(creature.Defense),
                Contact: scaleCombat(creature.Contact),
                Distance: scaleCombat(creature.Distance),
                Magie: scaleCombat(creature.Magie),
                INIT: creature.INIT,
                FOR: scaleStat(creature.FOR),
                DEX: scaleStat(creature.DEX),
                CON: scaleStat(creature.CON),
                SAG: scaleStat(creature.SAG),
                INT: scaleStat(creature.INT),
                CHA: scaleStat(creature.CHA),
                nombre: 1,
                Actions: creature.Actions || []
            }
            onImport(newChar)
            onClose()
            return
        }

        // CASE 2: TEMPLATE GENERATION (Race + Profile)
        if (!selectedRace || !selectedProfile) return

        const raceData = races[selectedRace]
        const profileData = profiles[selectedProfile]
        const mods = raceData.modificateurs || {}

        // Standard base stats
        const baseStats = { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 }

        // Apply Modifiers
        const finalStats = {
            FOR: baseStats.FOR + (mods.FOR || 0),
            DEX: baseStats.DEX + (mods.DEX || 0),
            CON: baseStats.CON + (mods.CON || 0),
            INT: baseStats.INT + (mods.INT || 0),
            SAG: baseStats.SAG + (mods.SAG || 0),
            CHA: baseStats.CHA + (mods.CHA || 0),
        }

        // Helper to calc stat mod
        const calcMod = (val: number) => Math.floor((val - 10) / 2)

        const hitDieVal = parseInt((profileData.hitDie || '1d8').replace('d', '')) || 8
        const hp = hitDieVal + calcMod(finalStats.CON)
        const def = 10 + calcMod(finalStats.DEX)

        const name = `${selectedProfile.charAt(0).toUpperCase() + selectedProfile.slice(1)} ${selectedRace.charAt(0).toUpperCase() + selectedRace.slice(1)}`

        const newChar: NewCharacter = {
            name: name,
            niveau: 1,
            image: { src: profileData.image || raceData.image || '' },
            visibility: 'visible',
            PV: Math.max(1, hp),
            PV_Max: Math.max(1, hp),
            Defense: def,
            Contact: 1 + calcMod(finalStats.FOR),
            Distance: 1 + calcMod(finalStats.DEX),
            Magie: 1 + calcMod(finalStats.CHA),
            INIT: finalStats.DEX,
            FOR: finalStats.FOR,
            DEX: finalStats.DEX,
            CON: finalStats.CON,
            SAG: finalStats.SAG,
            INT: finalStats.INT,
            CHA: finalStats.CHA,
            nombre: 1,
            Actions: [] // Custom characters don't have predefined actions
        }

        onImport(newChar)
        onClose()
    }

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
        val.Nom.toLowerCase().includes(searchQuery.toLowerCase()) ||
        val.description.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            {/* Modal Container */}
            <div className="w-[90vw] max-w-6xl h-[85vh] bg-[#121212] border border-[#333] rounded-xl flex flex-col shadow-2xl relative overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-[#2a2a2a] bg-[#161616]">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20">
                            <BookOpen className="w-6 h-6 text-[#c0a080]" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-[#c0a080] font-serif tracking-wide">Grimoire & Bestiaire</h2>
                            <p className="text-sm text-gray-500">Consultez les races, profils et créatures légendaires</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-[#2a2a2a] rounded-full transition-colors group"
                    >
                        <X className="w-6 h-6 text-gray-500 group-hover:text-white" />
                    </button>
                </div>

                {/* Content Grid */}
                <div className="flex-1 flex overflow-hidden">

                    {/* LEFT PANEL: Filters & List */}
                    <div className="w-[400px] flex flex-col border-r border-[#2a2a2a] bg-[#141414]">

                        {/* Search & Tabs */}
                        <div className="p-4 space-y-4 border-b border-[#2a2a2a]">
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-[#c0a080] transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Rechercher..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-[#1a1a1a] border border-[#333] rounded-lg py-2 pl-10 pr-4 text-[#e0e0e0] placeholder-gray-600 focus:outline-none focus:border-[#c0a080]/50 transition-all"
                                />
                            </div>

                            <div className="flex p-1 bg-[#1a1a1a] rounded-lg border border-[#333]">
                                <button
                                    onClick={() => setActiveTab('custom')}
                                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${activeTab === 'custom'
                                        ? 'bg-[#c0a080] text-black shadow-lg'
                                        : 'text-gray-400 hover:text-white hover:bg-[#222]'
                                        }`}
                                >
                                    Custom
                                    {(selectedRace || selectedProfile) && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/20 text-[10px]"><Info strokeWidth={3} className="w-2.5 h-2.5" /></span>}
                                </button>
                                <button
                                    onClick={() => setActiveTab('bestiary')}
                                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all flex items-center justify-center gap-2 ${activeTab === 'bestiary'
                                        ? 'bg-[#c0a080] text-black shadow-lg'
                                        : 'text-gray-400 hover:text-white hover:bg-[#222]'
                                        }`}
                                >
                                    Bestiaire
                                    {selectedCreature && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/20 text-[10px]"><Info strokeWidth={3} className="w-2.5 h-2.5" /></span>}
                                </button>
                            </div>

                            {/* Sub-tabs for Custom */}
                            {activeTab === 'custom' && (
                                <div className="flex gap-2 px-1">
                                    <button
                                        onClick={() => setCustomSubTab('race')}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${customSubTab === 'race'
                                            ? 'bg-[#2a2a2a] text-[#c0a080] border border-[#c0a080]/30'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'
                                            }`}
                                    >
                                        Races {selectedRace && '✓'}
                                    </button>
                                    <button
                                        onClick={() => setCustomSubTab('profile')}
                                        className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${customSubTab === 'profile'
                                            ? 'bg-[#2a2a2a] text-[#c0a080] border border-[#c0a080]/30'
                                            : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'
                                            }`}
                                    >
                                        Profils {selectedProfile && '✓'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Scrolling List */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                            {loading && (
                                <div className="flex items-center justify-center h-40">
                                    <div className="w-6 h-6 border-2 border-[#c0a080] border-t-transparent rounded-full animate-spin"></div>
                                </div>
                            )}

                            {activeTab === 'custom' && customSubTab === 'race' && (
                                <>
                                    {filteredRaces.map(([key, data]) => (
                                        <div
                                            key={key}
                                            onClick={() => { setSelectedRace(key); setSelectedCreature(null); }}
                                            className={`group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selectedRace === key
                                                ? 'bg-[#2a2a2a] border-[#c0a080] shadow-[0_0_15px_rgba(192,160,128,0.1)]'
                                                : 'bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#444] hover:bg-[#202020]'
                                                }`}
                                        >
                                            <div className="w-12 h-12 rounded-md bg-black/40 overflow-hidden border border-white/5 flex-shrink-0">
                                                {data.image ? (
                                                    <img src={data.image} alt={key} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-700">
                                                        <User size={20} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="font-bold text-gray-200 capitalize truncate group-hover:text-[#c0a080] transition-colors">
                                                        {key.replace('_', ' ')}
                                                    </h4>
                                                    {selectedRace === key && <Info className="w-4 h-4 text-[#c0a080]" />}
                                                </div>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {Object.entries(data.modificateurs || {}).slice(0, 3).map(([stat, val]) => (
                                                        <span key={stat} className="text-[10px] px-1.5 py-0.5 rounded bg-[#333] text-gray-400 border border-[#444]">
                                                            {stat} {val > 0 ? '+' : ''}{val}
                                                        </span>
                                                    ))}
                                                    {(Object.keys(data.modificateurs || {}).length > 3) && <span className="text-[10px] text-gray-600">...</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {activeTab === 'custom' && customSubTab === 'profile' && (
                                <>
                                    {filteredProfiles.map(([key, data]) => (
                                        <div
                                            key={key}
                                            onClick={() => { setSelectedProfile(key); setSelectedCreature(null); }}
                                            className={`group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selectedProfile === key
                                                ? 'bg-[#2a2a2a] border-[#c0a080] shadow-[0_0_15px_rgba(192,160,128,0.1)]'
                                                : 'bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#444] hover:bg-[#202020]'
                                                }`}
                                        >
                                            <div className="w-12 h-12 rounded-md bg-black/40 overflow-hidden border border-white/5 flex-shrink-0">
                                                {data.image ? (
                                                    <img src={data.image} alt={key} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-700">
                                                        <User size={20} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center">
                                                    <h4 className="font-bold text-gray-200 capitalize truncate group-hover:text-[#c0a080] transition-colors">
                                                        {key}
                                                    </h4>
                                                    {selectedProfile === key && <Info className="w-4 h-4 text-[#c0a080]" />}
                                                </div>
                                                <div className="mt-1">
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/30 text-red-300 border border-red-900/40">
                                                        DV: {data.hitDie}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            {activeTab === 'bestiary' && filteredBestiary.map(([key, data]) => (
                                <div
                                    key={key}
                                    onClick={() => {
                                        setSelectedCreature(key);
                                        setSelectedRace(null);
                                        setSelectedProfile(null);
                                        setTargetLevel(1); // Default to level 1 for scaling
                                        setCustomImage(bestiary[key]?.image || ''); // Init custom image
                                    }}
                                    className={`group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 ${selectedCreature === key
                                        ? 'bg-[#2a2a2a] border-[#c0a080] shadow-[0_0_15px_rgba(192,160,128,0.1)]'
                                        : 'bg-[#1a1a1a] border-[#2a2a2a] hover:border-[#444] hover:bg-[#202020]'
                                        }`}
                                >
                                    <div className="w-12 h-12 rounded-md bg-black/40 overflow-hidden border border-white/5 flex-shrink-0">
                                        {data.image ? (
                                            <img src={data.image} alt={data.Nom} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-700">
                                                <User size={20} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center">
                                            <h4 className="font-bold text-gray-200 capitalize truncate group-hover:text-[#c0a080] transition-colors">
                                                {data.Nom}
                                            </h4>
                                            {selectedCreature === key && <Info className="w-4 h-4 text-[#c0a080]" />}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/30 text-purple-300 border border-purple-900/40">
                                                {data.Type.substring(0, 10)}
                                            </span>
                                            <span className="text-[10px] text-gray-500">Niv 1+</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT PANEL: Preview & Info */}
                    <div className="flex-1 bg-[#101010] flex flex-col relative">
                        {/* Background Decoration */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-[#1a1a1a] via-[#0f0f0f] to-[#0a0a0a] pointer-events-none" />

                        {(selectedRace || selectedProfile || selectedCreature) ? (
                            <div className="relative flex-1 overflow-y-auto custom-scrollbar p-8">
                                <div className="max-w-2xl mx-auto space-y-8">

                                    {/* 1. Header with Avatar */}
                                    <div className="flex flex-col items-center text-center space-y-4">
                                        <div className="w-32 h-32 rounded-full p-1 bg-gradient-to-tr from-[#c0a080] to-[#806040] shadow-2xl relative">
                                            <div className="w-full h-full rounded-full bg-black overflow-hidden border-4 border-[#1a1a1a]">
                                                {(selectedCreature && bestiary[selectedCreature]) ? (
                                                    (customImage || bestiary[selectedCreature].image) ? (
                                                        <img src={customImage || bestiary[selectedCreature].image || ''} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center bg-[#222]">
                                                            <User size={48} className="text-[#444]" />
                                                        </div>
                                                    )
                                                ) : (profiles[selectedProfile!]?.image || races[selectedRace!]?.image) ? (
                                                    <img
                                                        src={profiles[selectedProfile!]?.image || races[selectedRace!]?.image}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-[#222]">
                                                        <User size={48} className="text-[#444]" />
                                                    </div>
                                                )}
                                            </div>
                                            {/* Level Badge */}
                                            <div className="absolute -bottom-2 -right-2 bg-[#1a1a1a] text-[#c0a080] text-xs font-bold px-3 py-1 rounded-full border border-[#c0a080] shadow-lg">
                                                Niveau {selectedCreature ? targetLevel : 1}
                                            </div>
                                        </div>

                                        <div>
                                            <h2 className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#c0a080] to-[#e0c0a0] capitalize tracking-wide">
                                                {(selectedCreature && bestiary[selectedCreature]) ? bestiary[selectedCreature].Nom : `${selectedProfile || '...'} ${selectedRace?.replace('_', ' ') || '...'}`}
                                            </h2>
                                            <p className="text-gray-500 mt-1 font-medium">
                                                {(selectedCreature && bestiary[selectedCreature]) ? bestiary[selectedCreature].Type : 'Création de personnage'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Inputs for Bestiary (Level & Image) */}
                                    {selectedCreature && (
                                        <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-bottom-2 fade-in">
                                            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#333] flex flex-col gap-2">
                                                <span className="text-xs font-bold text-[#c0a080] uppercase tracking-wider">Niveau {targetLevel}</span>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="20"
                                                    value={targetLevel}
                                                    onChange={(e) => setTargetLevel(parseInt(e.target.value))}
                                                    className="w-full h-2 bg-[#333] rounded-lg appearance-none cursor-pointer accent-[#c0a080]"
                                                />
                                            </div>
                                            <div className="bg-[#1a1a1a] p-4 rounded-xl border border-[#333] flex flex-col gap-2">
                                                <span className="text-xs font-bold text-[#c0a080] uppercase tracking-wider">Image Personnalisée</span>
                                                <div className="relative">
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleImageUpload}
                                                        className="hidden"
                                                        id="creature-image-upload"
                                                    />
                                                    <label
                                                        htmlFor="creature-image-upload"
                                                        className="flex items-center justify-center w-full px-2 py-1.5 text-xs text-center border border-dashed border-gray-600 rounded cursor-pointer hover:border-[#c0a080] hover:text-[#c0a080] transition-colors gap-2"
                                                    >
                                                        <Upload className="w-3 h-3" />
                                                        {customImage ? 'Changer l\'image' : 'Uploader une image'}
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* 2. Stats Grid */}
                                    {selectedCreature && bestiary[selectedCreature] && (
                                        <div className="space-y-4">
                                            {/* Vitals */}
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-[#1a1a1a]/50 p-3 rounded-lg border border-[#333] flex flex-col items-center">
                                                    <span className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">PV</span>
                                                    <span className="text-lg font-bold text-green-400 font-mono">
                                                        {Math.floor(bestiary[selectedCreature].PV_Max + ((bestiary[selectedCreature].PV_Max / Math.max(1, bestiary[selectedCreature].niveau)) * (targetLevel - Math.max(1, bestiary[selectedCreature].niveau)) * 0.5))}
                                                    </span>
                                                </div>
                                                <div className="bg-[#1a1a1a]/50 p-3 rounded-lg border border-[#333] flex flex-col items-center">
                                                    <span className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">DEF</span>
                                                    <span className="text-lg font-bold text-blue-400 font-mono">
                                                        {bestiary[selectedCreature].Defense + Math.floor((targetLevel - Math.max(1, bestiary[selectedCreature].niveau)) / 2)}
                                                    </span>
                                                </div>
                                                <div className="bg-[#1a1a1a]/50 p-3 rounded-lg border border-[#333] flex flex-col items-center">
                                                    <span className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">INIT</span>
                                                    <span className="text-lg font-bold text-yellow-400 font-mono">{bestiary[selectedCreature].INIT}</span>
                                                </div>
                                            </div>

                                            {/* Combat */}
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-[#1a1a1a]/50 p-3 rounded-lg border border-[#333] flex flex-col items-center">
                                                    <span className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Contact</span>
                                                    <span className="text-lg font-bold text-red-400 font-mono">
                                                        {(() => {
                                                            const val = bestiary[selectedCreature].Contact + (targetLevel - Math.max(1, bestiary[selectedCreature].niveau))
                                                            return val > 0 ? `+${val}` : val
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="bg-[#1a1a1a]/50 p-3 rounded-lg border border-[#333] flex flex-col items-center">
                                                    <span className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Distance</span>
                                                    <span className="text-lg font-bold text-emerald-400 font-mono">
                                                        {(() => {
                                                            const val = bestiary[selectedCreature].Distance + (targetLevel - Math.max(1, bestiary[selectedCreature].niveau))
                                                            return val > 0 ? `+${val}` : val
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="bg-[#1a1a1a]/50 p-3 rounded-lg border border-[#333] flex flex-col items-center">
                                                    <span className="text-gray-500 text-[10px] uppercase tracking-wider mb-1">Magie</span>
                                                    <span className="text-lg font-bold text-purple-400 font-mono">
                                                        {(() => {
                                                            const val = bestiary[selectedCreature].Magie + (targetLevel - Math.max(1, bestiary[selectedCreature].niveau))
                                                            return val > 0 ? `+${val}` : val
                                                        })()}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {selectedRace && selectedProfile && !selectedCreature && (
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-[#1a1a1a]/50 p-4 rounded-xl border border-[#333] flex flex-col items-center">
                                                <span className="text-gray-500 text-xs uppercase tracking-wider mb-1">Points de Vie</span>
                                                <span className="text-2xl font-bold text-green-400 font-mono">
                                                    {(() => {
                                                        const hitDice = profiles[selectedProfile]?.hitDie || '1d8'
                                                        const hitDieVal = parseInt(hitDice.replace('d', '')) || 8
                                                        const conMod = Math.floor(((10 + (races[selectedRace]?.modificateurs?.CON || 0)) - 10) / 2)
                                                        return Math.max(1, hitDieVal + conMod)
                                                    })()}
                                                </span>
                                            </div>
                                            <div className="bg-[#1a1a1a]/50 p-4 rounded-xl border border-[#333] flex flex-col items-center">
                                                <span className="text-gray-500 text-xs uppercase tracking-wider mb-1">Classe d'Armure</span>
                                                <span className="text-2xl font-bold text-blue-400 font-mono">
                                                    {10 + Math.floor((10 + (races[selectedRace].modificateurs?.DEX || 0) - 10) / 2)}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* 3. Details Sections */}
                                    <div className="space-y-6">
                                        {selectedCreature && bestiary[selectedCreature] && (
                                            <div className="animate-in slide-in-from-bottom-5 duration-500 fade-in fill-mode-backwards" style={{ animationDelay: '100ms' }}>
                                                <h3 className="text-[#c0a080] font-bold text-sm uppercase tracking-widest mb-3 flex items-center gap-2 border-b border-[#333] pb-2">
                                                    <span className="w-2 h-2 rounded-full bg-[#c0a080]" />
                                                    Description
                                                </h3>
                                                <div className="bg-[#1a1a1a] p-5 rounded-xl border border-[#2a2a2a] leading-relaxed text-gray-400 text-sm shadow-inner">
                                                    {bestiary[selectedCreature].description}

                                                    <div className="mt-4 pt-4 border-t border-[#333] grid grid-cols-3 gap-2">
                                                        {['FOR', 'DEX', 'CON', 'INT', 'SAG', 'CHA'].map((stat) => (
                                                            <div key={stat} className="flex justify-between px-2 py-1 bg-[#222] rounded border border-[#333] text-xs">
                                                                <span className="text-gray-500 font-bold">{stat}</span>
                                                                <span className="text-[#e0e0e0] font-mono">
                                                                    {((bestiary[selectedCreature] as any)[stat] as number) + Math.floor((targetLevel - Math.max(1, bestiary[selectedCreature].niveau)) / 2)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions/Attacks Section */}
                                        {selectedCreature && bestiary[selectedCreature]?.Actions && bestiary[selectedCreature].Actions!.length > 0 && (
                                            <div className="animate-in slide-in-from-bottom-5 duration-500 fade-in fill-mode-backwards" style={{ animationDelay: '200ms' }}>
                                                <h3 className="text-[#c0a080] font-bold text-sm uppercase tracking-widest mb-3 flex items-center gap-2 border-b border-[#333] pb-2">
                                                    <Swords className="w-4 h-4" />
                                                    Actions & Attaques
                                                </h3>
                                                <div className="space-y-3">
                                                    {bestiary[selectedCreature].Actions!.map((action, index) => (
                                                        <div key={index} className="bg-[#1a1a1a] p-4 rounded-xl border border-[#2a2a2a] hover:border-[#c0a080]/30 transition-colors">
                                                            <div className="flex items-start justify-between gap-3 mb-2">
                                                                <h4 className="text-[#e0c0a0] font-bold text-sm flex items-center gap-2">
                                                                    <span className="text-[#c0a080]">•</span>
                                                                    {action.Nom}
                                                                </h4>
                                                                {action.Toucher !== 0 && (
                                                                    <span className="px-2 py-0.5 bg-red-950/40 border border-red-900/50 rounded text-xs font-mono text-red-300 flex-shrink-0">
                                                                        {action.Toucher > 0 ? '+' : ''}{action.Toucher} pour toucher
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-gray-400 text-xs leading-relaxed">
                                                                {action.Description}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {selectedRace && races[selectedRace] && !selectedCreature && (
                                            <div className="animate-in slide-in-from-bottom-5 duration-500 fade-in fill-mode-backwards" style={{ animationDelay: '100ms' }}>
                                                <h3 className="text-[#c0a080] font-bold text-sm uppercase tracking-widest mb-3 flex items-center gap-2 border-b border-[#333] pb-2">
                                                    <span className="w-2 h-2 rounded-full bg-[#c0a080]" />
                                                    Traits de Race ({selectedRace.replace('_', ' ')})
                                                </h3>
                                                <div className="bg-[#1a1a1a] p-5 rounded-xl border border-[#2a2a2a] leading-relaxed text-gray-400 text-sm shadow-inner">
                                                    {races[selectedRace].description}

                                                    {races[selectedRace].modificateurs && (
                                                        <div className="mt-4 pt-4 border-t border-[#333] flex flex-wrap gap-2">
                                                            {Object.entries(races[selectedRace].modificateurs!).map(([stat, val]) => (
                                                                <span key={stat} className="inline-flex items-center px-2 py-1 rounded bg-[#252525] border border-[#333] text-xs font-mono text-gray-300">
                                                                    <span className="text-[#c0a080] font-bold mr-1">{stat}</span>
                                                                    {val > 0 ? '+' : ''}{val}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {selectedProfile && profiles[selectedProfile] && !selectedCreature && (
                                            <div className="animate-in slide-in-from-bottom-5 duration-500 fade-in fill-mode-backwards" style={{ animationDelay: '200ms' }}>
                                                <h3 className="text-[#c0a080] font-bold text-sm uppercase tracking-widest mb-3 flex items-center gap-2 border-b border-[#333] pb-2">
                                                    <span className="w-2 h-2 rounded-full bg-[#c0a080]" />
                                                    Caractéristiques de Classe ({selectedProfile})
                                                </h3>
                                                <div className="bg-[#1a1a1a] p-5 rounded-xl border border-[#2a2a2a] leading-relaxed text-gray-400 text-sm shadow-inner">
                                                    {profiles[selectedProfile].description}
                                                    <div className="mt-4 pt-4 border-t border-[#333] grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-300">
                                                        <div className="flex items-center gap-2">
                                                            <Heart className="w-4 h-4 text-red-400" />
                                                            <span>Dé de vie: {profiles[selectedProfile]?.hitDie || '1d8'}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            // Empty State
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 p-8">
                                <div className="w-24 h-24 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center mb-6 animate-pulse">
                                    <BookOpen size={32} className="opacity-50" />
                                </div>
                                <h3 className="text-xl font-bold text-gray-400 mb-2">Votre Grimoire est ouvert</h3>
                                <p className="text-gray-600 text-center max-w-md">
                                    Sélectionnez une race/profil ou une créature du bestiaire pour voir les détails.
                                </p>
                            </div>
                        )}

                        {/* Bottom Action Bar */}
                        <div className="p-6 border-t border-[#2a2a2a] bg-[#161616] flex justify-end gap-3 z-10">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-[#2a2a2a] transition-all text-sm font-bold tracking-wide"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={(!selectedRace || !selectedProfile) && !selectedCreature}
                                className={`
                                    px-8 py-3 rounded-lg font-bold text-sm tracking-wide flex items-center gap-2 shadow-xl transition-all
                                    ${((!selectedRace || !selectedProfile) && !selectedCreature)
                                        ? 'bg-[#2a2a2a] text-gray-600 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-[#c0a080] to-[#b09070] text-black hover:scale-105 hover:shadow-[#c0a080]/20'
                                    }
                                `}
                            >
                                <Check className="w-4 h-4" />
                                Importer la Créature
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    )
}
