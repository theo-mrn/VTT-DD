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
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const DIFFICULTIES: EncounterDifficulty[] = ['Easy', 'Medium', 'Hard', 'Deadly'];

export default function EncounterGenerator() {
    const params = useParams();
    const roomId = params.roomid as string;

    // Data State
    const [bestiary, setBestiary] = useState<Record<string, BestiaryData>>({});
    const [loading, setLoading] = useState(true);
    const [monsterTypes, setMonsterTypes] = useState<string[]>([]);

    // Players from DB
    const [players, setPlayers] = useState<{ id: string; name: string; niveau: number }[]>([]);

    // Search/Gen State — derived from real players
    const partySize = players.length || 1;
    const partyLevel = players.length > 0
        ? Math.round(players.reduce((sum, p) => sum + (p.niveau || 1), 0) / players.length)
        : 1;
    const [difficulty, setDifficulty] = useState<EncounterDifficulty>('Medium');

    // Multi-Select State
    const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
    const [openTypeSelect, setOpenTypeSelect] = useState(false);

    // Filtres avancés
    const [minPV, setMinPV] = useState<string>('');
    const [maxPV, setMaxPV] = useState<string>('');
    const [minDefense, setMinDefense] = useState<string>('');
    const [maxDefense, setMaxDefense] = useState<string>('');
    const [minCR, setMinCR] = useState<string>('');
    const [maxCR, setMaxCR] = useState<string>('');

    // Result State
    const [scenarios, setScenarios] = useState<{ [key in EncounterScenarioType]?: GeneratedEncounter[] }>({});
    const [activeTab, setActiveTab] = useState<EncounterScenarioType>('Balanced');

    const [isGenerating, setIsGenerating] = useState(false);
    const [encounterCount, setEncounterCount] = useState(0);

    // Players listener
    useEffect(() => {
        if (!roomId) return;
        const ref = collection(db, `cartes/${roomId}/characters`);
        const unsub = onSnapshot(ref, (snap) => {
            const joueurs = snap.docs
                .filter(d => d.data().type === 'joueurs')
                .map(d => ({
                    id: d.id,
                    name: d.data().Nomperso || d.data().name || 'Joueur',
                    niveau: d.data().niveau || 1,
                }));
            setPlayers(joueurs);
        });
        return () => unsub();
    }, [roomId]);

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
            monsterTypes: selectedTypes,
            minPV: minPV !== '' ? parseInt(minPV) : undefined,
            maxPV: maxPV !== '' ? parseInt(maxPV) : undefined,
            minDefense: minDefense !== '' ? parseInt(minDefense) : undefined,
            maxDefense: maxDefense !== '' ? parseInt(maxDefense) : undefined,
            minCR: minCR !== '' ? parseFloat(minCR) : undefined,
            maxCR: maxCR !== '' ? parseFloat(maxCR) : undefined,
        });

        setScenarios(newScenarios);
        setIsGenerating(false);

        if (!newScenarios[activeTab]) {
            if (newScenarios['Balanced']) setActiveTab('Balanced');
            else if (newScenarios['Horde']) setActiveTab('Horde');
            else if (newScenarios['Boss']) setActiveTab('Boss');
        }
    };

    const handleSaveAsTemplates = async (proposalIdx: number) => {
        const proposals = scenarios[activeTab];
        const encounter = proposals?.[proposalIdx];
        if (!encounter || !roomId) return;

        const uniqueMonsters = encounter.monsters.filter(
            (item, idx, arr) => arr.findIndex(m => m.creature.Nom === item.creature.Nom) === idx
        );

        try {
            const nextCount = encounterCount + 1;
            setEncounterCount(nextCount);

            // Créer la catégorie
            const categoriesRef = collection(db, 'npc_templates', roomId, 'categories');
            const categoryDoc = await addDoc(categoriesRef, {
                name: `Rencontre #${nextCount}`,
                color: '#ef4444',
                createdAt: new Date(),
            });

            // Sauvegarder les templates avec la catégorie
            const templatesRef = collection(db, 'npc_templates', roomId, 'templates');
            await Promise.all(uniqueMonsters.map(({ creature }) =>
                addDoc(templatesRef, {
                    Nomperso: creature.Nom,
                    categoryId: categoryDoc.id,
                    imageURL2: creature.image || '',
                    niveau: creature.niveau || 1,
                    PV: creature.PV,
                    PV_F: creature.PV,
                    PV_Max: creature.PV_Max,
                    Defense: creature.Defense,
                    Defense_F: creature.Defense,
                    Contact: creature.Contact,
                    Distance: creature.Distance,
                    Magie: creature.Magie,
                    INIT: creature.INIT,
                    FOR: creature.FOR,
                    DEX: creature.DEX,
                    CON: creature.CON,
                    SAG: creature.SAG,
                    INT: creature.INT,
                    CHA: creature.CHA,
                    Actions: creature.Actions || [],
                })
            ));
            toast.success(`Rencontre #${nextCount} sauvegardée (${uniqueMonsters.length} templates)`);
        } catch (e) {
            console.error('[SaveTemplates] error', e);
            toast.error('Erreur lors de la sauvegarde');
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
                            <div className="space-y-2">
                                {players.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">Aucun joueur trouvé dans la salle.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {players.map(p => (
                                            <div key={p.id} className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] border border-[#333] rounded text-sm">
                                                <span className="text-gray-200">{p.name}</span>
                                                <span className="text-xs text-[#c0a080]">Niv. {p.niveau}</span>
                                            </div>
                                        ))}
                                        <div className="flex justify-between pt-1 text-xs text-gray-500">
                                            <span>{partySize} joueur{partySize > 1 ? 's' : ''}</span>
                                            <span>Niveau moyen : {partyLevel}</span>
                                        </div>
                                    </div>
                                )}
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

                            {/* Filtres avancés */}
                            <div className="space-y-2 pt-2">
                                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtres avancés</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        { label: 'PV min', value: minPV, set: setMinPV },
                                        { label: 'PV max', value: maxPV, set: setMaxPV },
                                        { label: 'Déf min', value: minDefense, set: setMinDefense },
                                        { label: 'Déf max', value: maxDefense, set: setMaxDefense },
                                        { label: 'CR min', value: minCR, set: setMinCR },
                                        { label: 'CR max', value: maxCR, set: setMaxCR },
                                    ].map(({ label, value, set }) => (
                                        <div key={label} className="flex items-center gap-1.5 bg-[#1a1a1a] border border-[#333] rounded px-2 py-1 focus-within:border-[#c0a080]/50">
                                            <span className="text-[10px] text-gray-500 shrink-0 w-12">{label}</span>
                                            <input
                                                type="number"
                                                value={value}
                                                onChange={e => set(e.target.value)}
                                                placeholder="—"
                                                className="w-full bg-transparent text-white text-xs outline-none placeholder:text-gray-600"
                                            />
                                        </div>
                                    ))}
                                </div>
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
                                    {(Object.keys(SCENARIO_TYPES) as EncounterScenarioType[]).map((type) => {
                                        const proposals = scenarios[type];
                                        return (
                                            <TabsContent key={type} value={type} className="absolute inset-0 m-0 overflow-y-auto">
                                                <div className="p-4">
                                                    <div className="space-y-6">
                                                        {proposals?.map((encounter, pi) => (
                                                            <div key={pi} className="rounded-xl border border-[#333] bg-[#1a1a1a] overflow-hidden">
                                                                {/* Proposal header */}
                                                                <div className="flex justify-between items-center px-4 py-2 bg-[#141414] border-b border-[#333]">
                                                                    <span className="text-xs font-bold text-gray-400">Proposition {pi + 1}</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <Button
                                                                            size="sm"
                                                                            className="bg-[#c0a080] text-black hover:bg-[#d4b494] h-7 text-xs"
                                                                            onClick={() => handleSaveAsTemplates(pi)}
                                                                        >
                                                                            <PlusCircle className="w-3 h-3 mr-1" />
                                                                            Ajouter
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                                {/* Monsters */}
                                                                <div className="divide-y divide-[#222]">
                                                                    {encounter.monsters.map((item, idx) => (
                                                                        <div key={idx} className="flex items-center gap-3 px-4 py-2">
                                                                            <div className="w-10 h-10 rounded bg-black overflow-hidden border border-[#333] shrink-0">
                                                                                <img
                                                                                    src={item.creature.image || ''}
                                                                                    alt={item.creature.Nom}
                                                                                    className="w-full h-full object-cover"
                                                                                    onError={(e) => (e.currentTarget.src = 'https://placehold.co/40x40/222/666?text=M')}
                                                                                />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    <span className="font-semibold text-white text-sm truncate">{item.creature.Nom}</span>
                                                                                    <span className="text-[#c0a080] text-xs font-bold shrink-0">×{item.count}</span>
                                                                                </div>
                                                                                <p className="text-xs text-gray-500 truncate">{item.creature.Type}</p>
                                                                            </div>
                                                                            <div className="flex items-center gap-3 text-xs text-gray-400 shrink-0">
                                                                                <span>{item.creature.PV} PV</span>
                                                                                <Badge variant="secondary" className="text-[10px] bg-[#222] text-gray-400">CR {item.creature.Challenge}</Badge>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </TabsContent>
                                        );
                                    })}
                                </div>
                            </Tabs>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
