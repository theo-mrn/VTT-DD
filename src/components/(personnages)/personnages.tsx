"use client"

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Users, Shield, Heart, Zap, Eye, EyeOff, UserPlus,
    Dices, Image as ImageIcon, Swords, ScrollText,
    User, Check, X, RotateCcw
} from 'lucide-react'

import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

// Import types from map (assuming we can access them, otherwise we define local interface)
import { type NewCharacter } from '@/app/[roomid]/map/types'

interface NPCManagerProps {
    isOpen?: boolean
    onClose?: () => void
    onSubmit?: (character: NewCharacter) => void
    difficulty?: number
}
import { useParams } from 'next/navigation'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'

// Stats presets
const STAT_PRESETS = {
    average: { FOR: 10, DEX: 10, CON: 10, INT: 10, SAG: 10, CHA: 10 },
    weak: { FOR: 8, DEX: 10, CON: 8, INT: 8, SAG: 10, CHA: 8 },
    strong: { FOR: 16, DEX: 12, CON: 14, INT: 8, SAG: 10, CHA: 10 },
    agile: { FOR: 10, DEX: 16, CON: 12, INT: 12, SAG: 14, CHA: 10 },
    smart: { FOR: 8, DEX: 10, CON: 10, INT: 16, SAG: 14, CHA: 12 },
}

export function NPCManager({ isOpen, onClose, onSubmit, difficulty = 3 }: NPCManagerProps) {
    // Default State
    const defaultCharacter: NewCharacter = {
        name: '',
        niveau: 1,
        image: null,
        visibility: 'hidden',
        PV: 20,
        PV_Max: 20,
        Defense: 10,
        Contact: 0,
        Distance: 0,
        Magie: 0,
        INIT: 10,
        nombre: 1,
        FOR: 10,
        DEX: 10,
        CON: 10,
        SAG: 10,
        INT: 10,
        CHA: 10
    }

    const [char, setChar] = useState<NewCharacter>(defaultCharacter)
    const [activeTab, setActiveTab] = useState("identity")
    const [visibilityRadius, setVisibilityRadius] = useState(100)

    // Animation variants
    const containerVariants = {
        hidden: { opacity: 0, scale: 0.95 },
        visible: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
        exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }
    }

    // Handle Image Upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setChar(prev => ({ ...prev, image: { src: reader.result as string } }))
            }
            reader.readAsDataURL(file)
        }
    }

    // Handle number inputs safely
    const handleNumChange = (field: keyof NewCharacter, value: string) => {
        const num = parseInt(value) || 0
        setChar(prev => ({ ...prev, [field]: num }))
    }

    // Generate random stats
    const generateStats = () => {
        // Simple variation based on difficulty (1-5)
        // This replicates the logic from existing page.tsx roughly
        const base = difficulty * 3 + 5 // Simple baseline
        const rand = () => Math.floor(Math.random() * 6) + base

        setChar(prev => ({
            ...prev,
            FOR: rand(),
            DEX: rand(),
            CON: rand(),
            INT: rand(),
            SAG: rand(),
            CHA: rand(),
            PV: base * 2 + 10,
            PV_Max: base * 2 + 10,
            Defense: 10 + Math.floor(base / 2),
            INIT: rand()
        }))
    }

    // --- FIREBASE SUBMISSION LOGIC ---
    const { id: roomIdString } = useParams()
    const roomId = roomIdString as string

    // We infer mode from props. If isOpen is provided, it's a dialog. Only use Dialog wrapper if intended.
    // Actually, let's keep it simple: We render the CONTENT. If it's a dialog, we wrap it.
    // Use a helper render function for the content.

    const handleSubmit = async () => {
        if (!char.name || !roomId) return

        const storage = getStorage()
        const charactersCollectionRef = collection(db, 'cartes', roomId.toString(), 'characters')
        const isAlly = char.visibility === 'ally'

        let imageURL = ''

        try {
            if (char.image && char.image.src) {
                if (char.image.src.startsWith('data:')) {
                    const imageRef = ref(storage, `characters/${char.name}-${Date.now()}`)
                    const response = await fetch(char.image.src)
                    const blob = await response.blob()
                    await uploadBytes(imageRef, blob)
                    imageURL = await getDownloadURL(imageRef)
                } else {
                    imageURL = char.image.src
                }
            }

            // Create characters
            // We need canvas dimensions for random positioning if not specified? 
            // In Sidebar mode, we don't have canvasRef. We can default to center or random within standard bounds.
            // Let's assume standard HD bounds if unknown: 1920x1080.
            const defaultWidth = 1920
            const defaultHeight = 1080

            for (let i = 1; i <= char.nombre; i++) {
                const characterName = char.nombre > 1 ? `${char.name} ${i}` : char.name
                await addDoc(charactersCollectionRef, {
                    Nomperso: characterName,
                    imageURL2: imageURL,
                    // Random position logic - ideally should be centered on screen view but we lack that context here easily without more props.
                    // Using a default "safe" random area.
                    x: Math.random() * defaultWidth,
                    y: Math.random() * defaultHeight,
                    visibility: char.visibility,
                    visibilityRadius: visibilityRadius || (char.visibility === 'ally' ? 100 : 100),
                    PV: char.PV,
                    PV_F: char.PV, // Current PV
                    PV_Max: char.PV_Max || char.PV,
                    niveau: char.niveau,
                    Defense: char.Defense,
                    Defense_F: char.Defense,
                    Contact: char.Contact,
                    Distance: char.Distance,
                    Magie: char.Magie,
                    INIT: char.INIT,
                    FOR: char.FOR,
                    DEX: char.DEX,
                    CON: char.CON,
                    SAG: char.SAG,
                    INT: char.INT,
                    CHA: char.CHA,
                    type: "pnj",
                    cityId: null // Sidebar creation implies global context usually? Or we need to select city... defaulting to null for now.
                })
            }

            // Reset after success
            setChar(defaultCharacter)
            if (onClose) onClose()

            // If onSubmit provided (legacy/wrapper), call it too
            if (onSubmit) onSubmit({ ...char, visibilityRadius } as any)

        } catch (error) {
            console.error("Error creating NPC:", error)
        }
    }

    // Helper to render stat bar
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
                    defaultValue={[value]}
                    value={[value]}
                    max={30}
                    step={1}
                    onValueChange={(val) => setChar(prev => ({ ...prev, [field]: val[0] }))}
                    className={`h-2 py-0 [&_.bg-primary]:bg-${color}-500`}
                />
            </div>
        </div>
    )

    const Content = (
        <div className="flex flex-col h-full bg-[#1a1a1a] text-[#e0e0e0] border-[#3a3a3a] overflow-hidden w-full">
            {/* HEADER - Only show if not in Dialog (Dialog has its own header usually, but here we used custom) 
                    Actually, let's keep the header consistent everywhere.
                */}
            <div className="p-4 bg-[#141414] border-b border-[#333] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20">
                        <UserPlus className="w-5 h-5 text-[#c0a080]" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-[#c0a080] tracking-tight">
                            Créateur de PNJ
                        </h2>
                        <p className="text-xs text-gray-500 font-medium">Forgé dans les ténèbres</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setChar(defaultCharacter)}
                        className="h-8 border-[#333] hover:bg-[#222] text-gray-400"
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                        Reset
                    </Button>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">

                {/* LEFT COLUMN - PREVIEW */}
                <div className="w-full lg:w-1/3 bg-[#0f0f0f] border-b lg:border-b-0 lg:border-r border-[#333] p-6 flex flex-col items-center justify-center relative overflow-hidden shrink-0">

                    {/* Background Decor */}
                    <div className="absolute inset-0 opacity-20 pointer-events-none">
                        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_#3a2a1a_0%,_transparent_70%)]" />
                    </div>

                    {/* Token Preview */}
                    <div className="relative z-10 group cursor-pointer">
                        <div className={`
                w-32 h-32 lg:w-48 lg:h-48 rounded-full border-4 shadow-[0_0_30px_rgba(0,0,0,0.5)] 
                flex items-center justify-center overflow-hidden bg-[#222]
                transition-all duration-300 group-hover:shadow-[0_0_50px_rgba(192,160,128,0.3)]
                ${char.visibility === 'ally' ? 'border-green-500/50' : 'border-[#c0a080]'}
              `}>
                            {char.image ? (
                                <img src={char.image.src} alt="Token" className="w-full h-full object-cover" />
                            ) : (
                                <User className="w-16 h-16 lg:w-20 lg:h-20 text-gray-600 opacity-50" />
                            )}

                            {/* Upload Overlay */}
                            <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                <ImageIcon className="w-6 h-6 lg:w-8 lg:h-8 text-white mb-2" />
                                <span className="text-[10px] lg:text-xs font-bold text-white uppercase tracking-wider">Changer Image</span>
                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                            </label>
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
                    <div className="mt-6 lg:mt-8 text-center z-10 w-full px-4">
                        <h3 className="text-lg lg:text-xl font-bold text-white truncate w-full">
                            {char.name || "Sans Nom"}
                        </h3>
                        <p className="text-sm text-[#c0a080] opacity-80 mt-1 uppercase tracking-widest text-[10px]">
                            Niveau {char.niveau} • PNJ
                        </p>
                    </div>

                    {/* Quick Actions */}
                    <div className="mt-6 lg:mt-8 grid grid-cols-2 gap-2 w-full max-w-[200px]">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={generateStats}
                            className="bg-[#1a1a1a] border-[#c0a080]/30 hover:bg-[#c0a080]/10 text-[#c0a080]"
                        >
                            <Dices className="w-3.5 h-3.5 mr-2" />
                            Générer
                        </Button>
                        {/* Count Input Wrapper */}
                        <div className="flex items-center bg-[#1a1a1a] border border-[#333] rounded-md px-2">
                            <Users className="w-3.5 h-3.5 text-gray-500 mr-2" />
                            <input
                                type="number"
                                value={char.nombre}
                                onChange={(e) => handleNumChange('nombre', e.target.value)}
                                className="w-full bg-transparent border-none text-xs text-white focus:ring-0 p-1 h-8 text-center font-mono"
                                min={1}
                                max={20}
                            />
                        </div>
                    </div>

                </div>

                {/* RIGHT COLUMN - TABS */}
                <div className="flex-1 bg-[#1a1a1a] flex flex-col min-w-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full">

                        <div className="px-4 lg:px-6 pt-4 lg:pt-6 pb-2 border-b border-[#333]">
                            <TabsList className="bg-[#0f0f0f] border border-[#333] p-1 w-full justify-start h-auto">
                                <TabsTrigger value="identity" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black text-[10px] lg:text-xs font-bold uppercase tracking-wider py-1.5 flex-1">Identité</TabsTrigger>
                                <TabsTrigger value="combat" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black text-[10px] lg:text-xs font-bold uppercase tracking-wider py-1.5 flex-1">Combat</TabsTrigger>
                                <TabsTrigger value="stats" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black text-[10px] lg:text-xs font-bold uppercase tracking-wider py-1.5 flex-1">Stats</TabsTrigger>
                                <TabsTrigger value="visibility" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black text-[10px] lg:text-xs font-bold uppercase tracking-wider py-1.5 flex-1">Visibilité</TabsTrigger>
                            </TabsList>
                        </div>

                        <ScrollArea className="flex-1">
                            <div className="p-4 lg:p-6">

                                {/* IDENTITY TAB */}
                                <TabsContent value="identity" className="space-y-6 m-0 focus-visible:outline-none">
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="text-gray-400 text-xs uppercase">Nom du Personnage</Label>
                                            <Input
                                                value={char.name}
                                                onChange={(e) => setChar(prev => ({ ...prev, name: e.target.value }))}
                                                className="bg-[#252525] border-[#444] text-[#e0e0e0] focus:border-[#c0a080] h-10"
                                                placeholder="Ex: Gobelin Éclaireur"
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-gray-400 text-xs uppercase">Type / Race</Label>
                                                <Input
                                                    placeholder="Gbelin (en dev)"
                                                    className="bg-[#252525] border-[#444] text-[#e0e0e0] h-9"
                                                    disabled
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-gray-400 text-xs uppercase">Niveau</Label>
                                                <div className="flex items-center gap-2 bg-[#252525] border border-[#444] rounded-md px-3 h-9">
                                                    <span className="text-[#c0a080] font-bold text-sm">LVL</span>
                                                    <input
                                                        type="number"
                                                        value={char.niveau}
                                                        onChange={(e) => handleNumChange('niveau', e.target.value)}
                                                        className="w-full bg-transparent border-none text-right font-mono text-[#e0e0e0] focus:ring-0 p-0"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-[#222] p-4 rounded-lg border border-[#333] space-y-3">
                                            <Label className="text-gray-400 text-xs uppercase flex items-center gap-2">
                                                <Dices className="w-3 h-3" />
                                                Difficulté Automatique
                                            </Label>
                                            <Slider
                                                defaultValue={[difficulty]}
                                                max={5} min={1} step={1}
                                                className="[&_.bg-primary]:bg-[#c0a080]"
                                            />
                                            <div className="flex justify-between text-[10px] text-gray-500 uppercase font-medium">
                                                <span>Faible</span>
                                                <span>Moyen</span>
                                                <span>Mortel</span>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* COMBAT TAB */}
                                <TabsContent value="combat" className="space-y-6 m-0 focus-visible:outline-none">
                                    <div className="grid grid-cols-2 gap-4">
                                        <Card className="bg-[#222] border-[#333]">
                                            <CardContent className="p-4 space-y-4">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <Heart className="w-4 h-4 text-red-500" />
                                                    <span className="text-sm font-bold text-gray-300">Vitalité</span>
                                                </div>
                                                <div className="space-y-3">
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between text-xs text-gray-500">
                                                            <span>PV Max</span>
                                                            <span>{char.PV_Max}</span>
                                                        </div>
                                                        <Slider
                                                            value={[char.PV_Max || 20]}
                                                            max={200} step={5}
                                                            onValueChange={(val) => setChar(prev => ({ ...prev, PV_Max: val[0], PV: val[0] }))}
                                                            className="[&_.bg-primary]:bg-red-600"
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
                                                        onChange={(e) => handleNumChange('Defense', e.target.value)}
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
                                                    onChange={(e) => handleNumChange(stat as keyof NewCharacter, e.target.value)}
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
                                                onChange={(e) => handleNumChange('INIT', e.target.value)}
                                                className="bg-[#1a1a1a] border-[#444] text-center font-bold text-yellow-500"
                                            />
                                        </div>
                                    </div>
                                </TabsContent>

                                {/* STATS TAB */}
                                <TabsContent value="stats" className="space-y-6 m-0 focus-visible:outline-none">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                                        {renderStatBar("Force", char.FOR, 'FOR', 'red')}
                                        {renderStatBar("Dextérité", char.DEX, 'DEX', 'green')}
                                        {renderStatBar("Constitution", char.CON, 'CON', 'orange')}
                                        {renderStatBar("Intelligence", char.INT, 'INT', 'blue')}
                                        {renderStatBar("Sagesse", char.SAG, 'SAG', 'purple')}
                                        {renderStatBar("Charisme", char.CHA, 'CHA', 'yellow')}
                                    </div>
                                </TabsContent>

                                {/* VISIBILITY TAB */}
                                <TabsContent value="visibility" className="space-y-6 m-0 focus-visible:outline-none">
                                    <div className="grid grid-cols-1 gap-4">
                                        <div className="bg-[#222] p-4 rounded-lg border border-[#333] flex items-center justify-between cursor-pointer hover:border-[#c0a080]/50 transition-colors"
                                            onClick={() => setChar(prev => ({ ...prev, visibility: 'visible' }))}>
                                            <div className="flex items-center gap-3">
                                                <Eye className={`w-5 h-5 ${char.visibility === 'visible' ? 'text-[#c0a080]' : 'text-gray-600'}`} />
                                                <div>
                                                    <p className={`text-sm font-bold ${char.visibility === 'visible' ? 'text-[#c0a080]' : 'text-gray-400'}`}>Visible</p>
                                                    <p className="text-xs text-gray-600">Visible par tous les joueurs</p>
                                                </div>
                                            </div>
                                            {char.visibility === 'visible' && <div className="w-3 h-3 rounded-full bg-[#c0a080]" />}
                                        </div>

                                        <div className="bg-[#222] p-4 rounded-lg border border-[#333] flex items-center justify-between cursor-pointer hover:border-[#c0a080]/50 transition-colors"
                                            onClick={() => setChar(prev => ({ ...prev, visibility: 'hidden' }))}>
                                            <div className="flex items-center gap-3">
                                                <EyeOff className={`w-5 h-5 ${char.visibility === 'hidden' ? 'text-[#c0a080]' : 'text-gray-600'}`} />
                                                <div>
                                                    <p className={`text-sm font-bold ${char.visibility === 'hidden' ? 'text-[#c0a080]' : 'text-gray-400'}`}>Caché</p>
                                                    <p className="text-xs text-gray-600">Invisible pour les joueurs</p>
                                                </div>
                                            </div>
                                            {char.visibility === 'hidden' && <div className="w-3 h-3 rounded-full bg-[#c0a080]" />}
                                        </div>

                                        <div className="bg-[#222] p-4 rounded-lg border border-[#333] space-y-4 cursor-pointer hover:border-green-500/50 transition-colors"
                                            onClick={() => setChar(prev => ({ ...prev, visibility: 'ally' }))}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Users className={`w-5 h-5 ${char.visibility === 'ally' ? 'text-green-500' : 'text-gray-600'}`} />
                                                    <div>
                                                        <p className={`text-sm font-bold ${char.visibility === 'ally' ? 'text-green-500' : 'text-gray-400'}`}>Allié / Vision Partagée</p>
                                                        <p className="text-xs text-gray-600">Les joueurs peuvent voir ce que voit ce PNJ</p>
                                                    </div>
                                                </div>
                                                {char.visibility === 'ally' && <div className="w-3 h-3 rounded-full bg-green-500" />}
                                            </div>

                                            {/* Radius Slider shown only if Ally */}
                                            {char.visibility === 'ally' && (
                                                <div className="pt-2 pl-8">
                                                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                        <span>Rayon de vision</span>
                                                        <span>{Math.round(1 + (visibilityRadius - 10) / 490 * 29)} cases</span>
                                                    </div>
                                                    <Slider
                                                        value={[visibilityRadius]}
                                                        max={500} min={10} step={10}
                                                        onValueChange={(val) => setVisibilityRadius(val[0])}
                                                        className="[&_.bg-primary]:bg-green-600"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </TabsContent>

                            </div>
                        </ScrollArea>
                    </Tabs>
                </div>
            </div>

            {/* FOOTER */}
            <div className="p-4 bg-[#141414] border-t border-[#333] flex justify-end gap-3 shrink-0">
                {onClose && <Button
                    variant="ghost"
                    onClick={onClose}
                    className="text-gray-400 hover:text-white hover:bg-[#222]"
                >
                    Annuler
                </Button>}
                <Button
                    onClick={handleSubmit}
                    className="bg-[#c0a080] text-black font-bold hover:bg-[#b09070] px-8"
                >
                    <Check className="w-4 h-4 mr-2" />
                    Créer {char.nombre > 1 ? `(${char.nombre})` : ''}
                </Button>
            </div>
        </div>
    )

    if (isOpen === undefined) {
        return Content
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose && onClose()}>
            <DialogContent className="max-w-4xl p-0 gap-0 bg-[#1a1a1a] text-[#e0e0e0] border-[#3a3a3a] overflow-hidden flex flex-col h-[85vh]">
                {Content}
            </DialogContent>
        </Dialog>
    )
}
