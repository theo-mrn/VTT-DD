"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import {
    Swords,
    RefreshCw,
    Users,
    Shield,
    Skull,
    Target,
    PlusCircle,
    Loader2,
    Crown,
    Rat,
    X,
    Check
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    BestiaryData,
    EncounterDifficulty,
    GeneratedEncounter
} from './encounter-types';
import {
    fetchBestiary,
    generateEncounterScenarios,
    calculateEncounterBudget,
    EncounterScenarioType,
    SCENARIO_TYPES
} from '@/lib/encounter-utils';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils'; // Assuming you have a utils file, otherwise can remove cn usage

const DIFFICULTIES: EncounterDifficulty[] = ['Easy', 'Medium', 'Hard', 'Deadly'];

export default function EncounterGenerator() {
    const params = useParams();
    const roomId = params.roomid as string;

    // Data State
    const [bestiary, setBestiary] = useState<Record<string, BestiaryData>>({});
    const [loading, setLoading] = useState(true);
    const [monsterTypes, setMonsterTypes] = useState<string[]>([]);

    // Search/Gen State
    const [partySize, setPartySize] = useState(4);
    const [partyLevel, setPartyLevel] = useState(3);
    const [difficulty, setDifficulty] = useState<EncounterDifficulty>('Medium');

    // Multi-Select State
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [openTypeSelect, setOpenTypeSelect] = useState(false);

    // Result State
    const [scenarios, setScenarios] = useState<{ [key in EncounterScenarioType]?: GeneratedEncounter }>({});
    const [activeTab, setActiveTab] = useState<EncounterScenarioType>('Balanced');

    const [isGenerating, setIsGenerating] = useState(false);
    const [isAddingToMap, setIsAddingToMap] = useState(false);

    // Initial Load
    useEffect(() => {
        setLoading(true);
        fetchBestiary().then(data => {
            setBestiary(data);
            const types = new Set<string>();
            Object.values(data).forEach(m => {
                if (m.Type) {
                    const mainType = m.Type.split(' ')[0].trim();
                    // Capitalize first letter logic if needed, but usually data is consistent
                    types.add(mainType);
                }
            });
            setMonsterTypes(Array.from(types).sort());
            setLoading(false);
        });
    }, []);

    const toggleType = (type: string) => {
        setSelectedTypes(prev => {
            if (prev.includes(type)) return prev.filter(t => t !== type);
            return [...prev, type];
        });
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        // Small delay for UI feedback
        await new Promise(resolve => setTimeout(resolve, 500));

        const newScenarios = generateEncounterScenarios(bestiary, {
            partySize,
            partyLevel,
            difficulty,
            monsterTypes: selectedTypes // Pass array
        });

        setScenarios(newScenarios);
        setIsGenerating(false);

        if (!newScenarios[activeTab]) {
            if (newScenarios['Balanced']) setActiveTab('Balanced');
            else if (newScenarios['Horde']) setActiveTab('Horde');
            else if (newScenarios['Boss']) setActiveTab('Boss');
        }
    };

    const handleAddToMap = async () => {
        const selectedEncounter = scenarios[activeTab];
        if (!selectedEncounter || !roomId) return;
        setIsAddingToMap(true);

        const spacing = 100;
        const totalMonsters = selectedEncounter.monsters.reduce((a, b) => a + b.count, 0);
        const cols = Math.ceil(Math.sqrt(totalMonsters));
        let count = 0;

        const startX = 500;
        const startY = 500;

        try {
            for (const group of selectedEncounter.monsters) {
                for (let i = 0; i < group.count; i++) {
                    const offsetX = (count % cols) * spacing;
                    const offsetY = Math.floor(count / cols) * spacing;

                    const monsterData = group.creature;

                    const newChar = {
                        id: `monster-${group.id}-${i}-${Date.now()}`,
                        type: 'monster',
                        name: `${monsterData.Nom} ${i + 1}`,
                        x: startX + offsetX - (cols * spacing / 2),
                        y: startY + offsetY - (cols * spacing / 2),
                        scale: 1,
                        imageUrl: monsterData.image || '',
                        PV: monsterData.PV,
                        PV_Max: monsterData.PV_Max,
                        visible: false,
                        niveau: monsterData.niveau,
                        visibility: 'hidden',
                        visibilityRadius: 0,
                        rotation: 0,
                        size: 1,
                        stats: {
                            str: monsterData.FOR,
                            dex: monsterData.DEX,
                            con: monsterData.CON,
                            int: monsterData.INT,
                            wis: monsterData.SAG,
                            cha: monsterData.CHA
                        },
                        initiative: 0,
                        defense: monsterData.Defense,
                        Actions: monsterData.Actions || [],
                        contact: monsterData.Contact,
                        distance: monsterData.Distance,
                        magie: monsterData.Magie,
                        init_bonus: monsterData.INIT
                    };

                    await addDoc(collection(db, `characters/${roomId}/characters`), newChar);
                    count++;
                }
            }
        } catch (error) {
            console.error("Error adding encounter to map:", error);
        } finally {
            setIsAddingToMap(false);
        }
    };

    const budget = calculateEncounterBudget(partySize, partyLevel, difficulty);

    const getIconForScenario = (type: EncounterScenarioType) => {
        switch (type) {
            case 'Balanced': return <Swords className="w-4 h-4" />;
            case 'Horde': return <Rat className="w-4 h-4" />;
            case 'Boss': return <Crown className="w-4 h-4" />;
        }
    };

    return (
        <div className="h-full flex flex-col bg-[#141414] text-gray-200">
            {/* Header */}
            <div className="p-6 border-b border-[#333] bg-gradient-to-r from-[#1a1a1a] to-[#252525]">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20">
                        <Swords className="w-6 h-6 text-[#c0a080]" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">
                            Générateur de Rencontre v2
                        </h2>
                        <p className="text-sm text-gray-400">
                            Scénarios : Horde, Équilibré ou Boss
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                {/* Left Panel: Settings */}
                <div className="w-full md:w-1/3 p-6 border-r border-[#333] bg-[#141414] overflow-y-auto">
                    <div className="space-y-6">
                        {/* Party Settings */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                <Users className="w-4 h-4" /> Groupe
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Joueurs</Label>
                                    <Input
                                        type="number" min={1} max={10} value={partySize}
                                        onChange={(e) => setPartySize(parseInt(e.target.value) || 4)}
                                        className="bg-[#222] border-[#333] text-white focus:border-[#c0a080]"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400">Niveau</Label>
                                    <Input
                                        type="number" min={1} max={20} value={partyLevel}
                                        onChange={(e) => setPartyLevel(parseInt(e.target.value) || 1)}
                                        className="bg-[#222] border-[#333] text-white focus:border-[#c0a080]"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="h-px bg-[#333]" />

                        {/* Encounter Settings */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                <Target className="w-4 h-4" /> Difficulté
                            </h3>

                            <div className="grid grid-cols-2 gap-2">
                                {DIFFICULTIES.map(diff => (
                                    <Button
                                        key={diff}
                                        variant={difficulty === diff ? "secondary" : "outline"}
                                        size="sm"
                                        onClick={() => setDifficulty(diff)}
                                        className={`
                                            text-xs border-[#333] transition-all
                                            ${difficulty === diff
                                                ? 'bg-[#c0a080] text-black hover:bg-[#d4b494] font-bold'
                                                : 'bg-transparent text-gray-400 hover:text-white hover:bg-[#222]'
                                            }
                                        `}
                                    >
                                        {diff === 'Easy' && 'Facile'}
                                        {diff === 'Medium' && 'Moyen'}
                                        {diff === 'Hard' && 'Difficile'}
                                        {diff === 'Deadly' && 'Mortel'}
                                    </Button>
                                ))}
                            </div>

                            <div className="space-y-2 mt-4">
                                <Label className="text-xs text-gray-400">Types (Optionnel)</Label>
                                <Popover open={openTypeSelect} onOpenChange={setOpenTypeSelect}>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            role="combobox"
                                            aria-expanded={openTypeSelect}
                                            className="w-full justify-between bg-[#222] border-[#333] text-white hover:bg-[#2a2a2a] hover:text-white"
                                        >
                                            {selectedTypes.length === 0
                                                ? "Tous les types"
                                                : `${selectedTypes.length} type(s) sélectionné(s)`}
                                            <Shield className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[300px] p-0 bg-[#222] border-[#333] text-white">
                                        <Command className="bg-transparent">
                                            <CommandInput placeholder="Rechercher un type..." className="text-white placeholder:text-gray-500" />
                                            <CommandList>
                                                <CommandEmpty>Aucun type trouvé.</CommandEmpty>
                                                <CommandGroup>
                                                    {monsterTypes.map((type) => (
                                                        <CommandItem
                                                            key={type}
                                                            value={type}
                                                            onSelect={() => toggleType(type)}
                                                            className="text-white hover:bg-[#333] aria-selected:bg-[#333]"
                                                        >
                                                            <div className={cn(
                                                                "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                                                                selectedTypes.includes(type)
                                                                    ? "bg-[#c0a080] text-black border-[#c0a080]"
                                                                    : "opacity-50 [&_svg]:invisible"
                                                            )}>
                                                                <Check className={cn("h-4 w-4")} />
                                                            </div>
                                                            {type}
                                                        </CommandItem>
                                                    ))}
                                                </CommandGroup>
                                            </CommandList>
                                        </Command>
                                    </PopoverContent>
                                </Popover>

                                {/* Selected Types Tags */}
                                {selectedTypes.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {selectedTypes.map(type => (
                                            <Badge key={type} variant="secondary" className="bg-[#333] text-gray-300 hover:bg-[#444] text-[10px] flex items-center gap-1 cursor-pointer" onClick={() => toggleType(type)}>
                                                {type}
                                                <X className="w-3 h-3" />
                                            </Badge>
                                        ))}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 text-[10px] text-[#c0a080] hover:text-[#d4b494] px-1"
                                            onClick={() => setSelectedTypes([])}
                                        >
                                            Reset
                                        </Button>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between text-xs text-gray-500 mb-1 pt-2">
                                <span>Budget XP Base:</span>
                                <span className="font-mono text-[#c0a080]">{budget} XP</span>
                            </div>
                        </div>

                        <Button
                            className="w-full bg-[#c0a080] text-black hover:bg-[#d4b494] font-bold py-6"
                            onClick={handleGenerate}
                            disabled={loading || isGenerating}
                        >
                            {isGenerating ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> ...</>
                            ) : (
                                <><RefreshCw className="w-4 h-4 mr-2" /> Générer Scénarios</>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Right Panel: Results */}
                <div className="w-full md:w-2/3 flex flex-col bg-[#0a0a0a]">
                    {Object.keys(scenarios).length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
                            <div className="w-20 h-20 rounded-full bg-[#1a1a1a] flex items-center justify-center border border-[#333]">
                                <Skull className="w-10 h-10 opacity-50" />
                            </div>
                            <p>Lancez la génération pour voir les 3 options.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EncounterScenarioType)} className="flex-1 flex flex-col">
                                <div className="border-b border-[#333] bg-[#1a1a1a] px-4 pt-2">
                                    <TabsList className="grid w-full grid-cols-3 bg-[#111]">
                                        {(Object.keys(SCENARIO_TYPES) as EncounterScenarioType[]).map((type) => {
                                            const hasResult = !!scenarios[type];
                                            return (
                                                <TabsTrigger
                                                    key={type}
                                                    value={type}
                                                    disabled={!hasResult}
                                                    className="data-[state=active]:bg-[#333] data-[state=active]:text-[#c0a080]"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {getIconForScenario(type)}
                                                        {SCENARIO_TYPES[type].label}
                                                    </div>
                                                </TabsTrigger>
                                            );
                                        })}
                                    </TabsList>
                                </div>

                                <div className="flex-1 overflow-hidden relative">
                                    {(Object.keys(SCENARIO_TYPES) as EncounterScenarioType[]).map((type) => (
                                        <TabsContent key={type} value={type} className="absolute inset-0 m-0 flex flex-col">
                                            {scenarios[type] && (
                                                <>
                                                    {/* Toolbar for active scenario */}
                                                    <div className="p-4 border-b border-[#333] bg-[#141414] flex justify-between items-center">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-white text-lg">
                                                                    {SCENARIO_TYPES[type].label}
                                                                </h3>
                                                                <Badge variant="outline" className="border-[#c0a080] text-[#c0a080]">
                                                                    {scenarios[type]?.totalXp} XP
                                                                </Badge>
                                                            </div>
                                                            <p className="text-xs text-gray-400 mt-1">
                                                                {SCENARIO_TYPES[type].description}
                                                            </p>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            className="bg-[#c0a080] text-black hover:bg-[#d4b494]"
                                                            onClick={handleAddToMap}
                                                            disabled={isAddingToMap}
                                                        >
                                                            {isAddingToMap ? (
                                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                            ) : (
                                                                <PlusCircle className="w-4 h-4 mr-2" />
                                                            )}
                                                            Ajouter
                                                        </Button>
                                                    </div>

                                                    {/* List */}
                                                    <ScrollArea className="flex-1 p-4">
                                                        <div className="grid gap-4">
                                                            {scenarios[type]?.monsters.map((item, idx) => (
                                                                <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-[#1a1a1a] border border-[#333]">
                                                                    <div className="w-16 h-16 rounded-lg bg-black overflow-hidden border border-[#333] relative shrink-0">
                                                                        <img
                                                                            src={item.creature.image || ''}
                                                                            alt={item.creature.Nom}
                                                                            className="w-full h-full object-cover"
                                                                            onError={(e) => (e.currentTarget.src = 'https://placehold.co/64x64/222/666?text=Monster')}
                                                                        />
                                                                        <div className="absolute bottom-0 right-0 bg-[#c0a080] text-black text-xs font-bold px-1.5 py-0.5 rounded-tl-md">
                                                                            x{item.count}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="flex justify-between">
                                                                            <h4 className="font-bold text-white max-w-[200px] truncate">{item.creature.Nom}</h4>
                                                                            <Badge variant="secondary" className="text-[10px] bg-[#222] text-gray-400">CR {item.creature.Challenge}</Badge>
                                                                        </div>
                                                                        <p className="text-xs text-gray-500">{item.creature.Type}</p>
                                                                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                                                                            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> {item.creature.PV} PV</span>
                                                                            <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> AC {item.creature.Defense}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </ScrollArea>
                                                </>
                                            )}
                                        </TabsContent>
                                    ))}
                                </div>
                            </Tabs>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
