'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { X, Plus, Trash2, Check, GripVertical, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from "@/lib/utils";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export type Competence = {
    titre: string;
    description: string;
    type: string;
    isCustom?: boolean;
    originalVoie?: string;
    originalRank?: number;
};

export type Voie = {
    nom: string;
    competences: Competence[];
    fichier: string;
};

export type CustomCompetence = {
    slotIndex: number;
    voieIndex: number;
    sourceVoie: string;
    sourceRank: number;
    competenceName: string;
    competenceDescription: string;
    competenceType: string;
};

interface CompetenceCreatorProps {
    initialProfile: string;
    initialRace: string;
    onVoiesChange: (voies: Voie[], customCompetences: CustomCompetence[]) => void;
}

// Sortable Voie Card Component (Reuse from change.tsx logic)
function SortableVoieCard({
    voie,
    index,
    onRemove,
    onCompetenceClick,
    onVoieClick,
    onResetCompetence
}: {
    voie: Voie;
    index: number;
    onRemove: (index: number) => void;
    onCompetenceClick: (voieIndex: number, compIndex: number) => void;
    onVoieClick: (voieIndex: number, compIndex: number) => void;
    onResetCompetence: (voieIndex: number, compIndex: number) => void;
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: `voie-${index}` });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            <Card className={`card relative transition-all duration-200 ${isDragging ? 'shadow-2xl scale-105 ring-2 ring-[var(--accent-brown)]' : ''
                } ${isOver ? 'ring-4 ring-[var(--accent-brown)] ring-opacity-50 scale-105 bg-[var(--accent-brown)] bg-opacity-10' : ''
                }`}>
                <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2 flex-1">
                            <div
                                {...listeners}
                                className="cursor-grab active:cursor-grabbing hover:bg-[var(--bg-card)] p-1 rounded transition-all hover:scale-110"
                                title="⋮⋮ Glisser pour réorganiser"
                            >
                                <GripVertical className="w-5 h-5 text-[var(--accent-brown)]" />
                            </div>
                            <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove(index);
                            }}
                            className="button-cancel"
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2">
                        {voie.competences.map((competence, compIndex) => (
                            <li
                                key={compIndex}
                                className={`group flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${competence.isCustom
                                    ? 'border-[var(--accent-brown)] bg-[var(--bg-card)]'
                                    : 'border-[var(--border-color)] hover:border-[var(--accent-brown)]'
                                    }`}
                                onClick={() => onCompetenceClick(index, compIndex)}
                            >
                                <div className="flex-1">
                                    <span className={`${competence.isCustom ? 'text-[var(--accent-brown)]' : 'text-[var(--text-secondary)]'}`}>
                                        {competence.titre}
                                        {competence.isCustom && ' 🔄'}
                                    </span>
                                    {competence.isCustom && competence.originalVoie && (
                                        <div className="text-xs text-[var(--text-secondary)] mt-1">
                                            Depuis: {competence.originalVoie} (rang {competence.originalRank})
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="button-primary p-1 h-6 w-6"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onVoieClick(index, compIndex);
                                        }}
                                        title="Voir détails de la voie"
                                    >
                                        <Info size={16} />
                                    </Button>
                                    {competence.isCustom && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="button-cancel p-1 h-6 w-6"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onResetCompetence(index, compIndex);
                                            }}
                                            title="Rétablir compétence originale"
                                        >
                                            ↺
                                        </Button>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}

export default function CompetenceCreator({ initialProfile, initialRace, onVoiesChange }: CompetenceCreatorProps) {
    const [voies, setVoies] = useState<Voie[]>([]);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedVoieIndex, setSelectedVoieIndex] = useState<number | null>(null);
    const [selectedCompetenceIndex, setSelectedCompetenceIndex] = useState<number | null>(null);
    const [replacementVoies, setReplacementVoies] = useState<Voie[]>([]);
    const [selectedReplacement, setSelectedReplacement] = useState<Voie | null>(null);
    const [selectedProfile, setSelectedProfile] = useState<string>('');
    const [profileSearchTerm, setProfileSearchTerm] = useState<string>('');
    const [isProfileInputFocused, setIsProfileInputFocused] = useState(false);
    const [selectedRace, setSelectedRace] = useState<string>('');
    const [raceSearchTerm, setRaceSearchTerm] = useState<string>('');
    const [isRaceInputFocused, setIsRaceInputFocused] = useState(false);
    const [selectedPrestige, setSelectedPrestige] = useState<string>('');
    const [prestigeSearchTerm, setPrestigeSearchTerm] = useState<string>('');
    const [isPrestigeInputFocused, setIsPrestigeInputFocused] = useState(false);
    const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [customCompetences, setCustomCompetences] = useState<CustomCompetence[]>([]);
    const [isCompetenceDialogOpen, setIsCompetenceDialogOpen] = useState(false);
    const [selectedCompetenceSlot, setSelectedCompetenceSlot] = useState<{ voieIndex: number, competenceIndex: number } | null>(null);
    const [selectedVoieForCompetence, setSelectedVoieForCompetence] = useState<Voie | null>(null);
    const [isCompetenceDetailModalOpen, setIsCompetenceDetailModalOpen] = useState(false);
    const [selectedCompetenceFromVoie, setSelectedCompetenceFromVoie] = useState<number | null>(null);
    const [competenceReplacementVoies, setCompetenceReplacementVoies] = useState<Voie[]>([]);
    const [selectedProfileForCompetence, setSelectedProfileForCompetence] = useState<string>('');
    const [profileForCompetenceSearchTerm, setProfileForCompetenceSearchTerm] = useState<string>('');
    const [isProfileForCompetenceInputFocused, setIsProfileForCompetenceInputFocused] = useState(false);
    const [selectedRaceForCompetence, setSelectedRaceForCompetence] = useState<string>('');
    const [raceForCompetenceSearchTerm, setRaceForCompetenceSearchTerm] = useState<string>('');
    const [isRaceForCompetenceInputFocused, setIsRaceForCompetenceInputFocused] = useState(false);
    const [selectedPrestigeForCompetence, setSelectedPrestigeForCompetence] = useState<string>('');
    const [prestigeForCompetenceSearchTerm, setPrestigeForCompetenceSearchTerm] = useState<string>('');
    const [isPrestigeForCompetenceInputFocused, setIsPrestigeForCompetenceInputFocused] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeTabMain, setActiveTabMain] = useState<string>('profiles');
    const [activeTabComp, setActiveTabComp] = useState<string>('profiles');

    // Drag and drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = voies.findIndex((_, idx) => `voie-${idx}` === active.id);
            const newIndex = voies.findIndex((_, idx) => `voie-${idx}` === over.id);

            if (oldIndex !== -1 && newIndex !== -1) {
                setVoies((items) => {
                    const newItems = arrayMove(items, oldIndex, newIndex);

                    // Update custom competences positions
                    const updatedCustomCompetences = customCompetences.map(cc => {
                        if (cc.voieIndex === oldIndex) {
                            return { ...cc, voieIndex: newIndex };
                        }
                        if (oldIndex < newIndex) {
                            if (cc.voieIndex > oldIndex && cc.voieIndex <= newIndex) {
                                return { ...cc, voieIndex: cc.voieIndex - 1 };
                            }
                        } else if (oldIndex > newIndex) {
                            if (cc.voieIndex >= newIndex && cc.voieIndex < oldIndex) {
                                return { ...cc, voieIndex: cc.voieIndex + 1 };
                            }
                        }
                        return cc;
                    });

                    setCustomCompetences(updatedCustomCompetences);
                    onVoiesChange(newItems, updatedCustomCompetences);
                    return newItems;
                });
            }
        }
        setActiveId(null);
    };

    const handleDragCancel = () => {
        setActiveId(null);
    };

    const activeVoie = activeId ? voies[parseInt(activeId.split('-')[1])] : null;

    // Initialize data
    useEffect(() => {
        const initVoies = async () => {
            setLoading(true);
            const loadedVoies: Voie[] = [];

            if (initialProfile) {
                // Load default profile voies (1 to 5)
                for (let i = 1; i <= 5; i++) {
                    const voieFile = `${initialProfile}${i}.json`;
                    const voie = await loadVoieFromFile(voieFile);
                    if (voie) loadedVoies.push(voie);
                }
            }

            if (initialRace) {
                // Load race voie
                let raceFilename = initialRace;

                // Map of specific keys to filenames
                const raceFileMap: Record<string, string> = {
                    'ame_forgee': 'Ame-forgee',
                    'elfe_noir': 'Elfenoir',
                    'elfe_sylvain': 'Elfesylvain'
                };

                if (raceFileMap[initialRace]) {
                    raceFilename = raceFileMap[initialRace];
                } else {
                    // Default behavior: Capitalize first letter
                    raceFilename = initialRace.charAt(0).toUpperCase() + initialRace.slice(1);
                }

                const raceFile = `${raceFilename}.json`;
                const raceVoie = await loadVoieFromFile(raceFile);
                if (raceVoie) loadedVoies.push(raceVoie);
            }

            setVoies(loadedVoies);
            // Reset custom competences when profile/race changes (new character creation flow)
            setCustomCompetences([]);
            onVoiesChange(loadedVoies, []);
            setLoading(false);
        };

        initVoies();
    }, [initialProfile, initialRace]);

    const loadVoieFromFile = async (filename: string): Promise<Voie | null> => {
        try {
            const response = await fetch(`/tabs/${filename}`);
            if (response.ok) {
                const data = await response.json();
                const competences = Object.keys(data)
                    .filter((key) => key.startsWith('Affichage'))
                    .map((key, index) => ({
                        titre: data[`Affichage${index + 1}`] || '',
                        description: (data[`rang${index + 1}`] || '').replace(/<br>/g, '\n'),
                        type: data[`type${index + 1}`] || 'other',
                    }));

                return {
                    nom: data.Voie,
                    competences,
                    fichier: filename
                };
            }
        } catch (error) {
            console.error(`Error loading voie ${filename}:`, error);
        }
        return null;
    };

    const applyCustomCompetences = (currentVoies: Voie[], customComps: CustomCompetence[]) => {
        const updatedVoies = currentVoies.map(v => ({ ...v, competences: [...v.competences] }));

        customComps.forEach((customComp) => {
            if (updatedVoies[customComp.voieIndex] && updatedVoies[customComp.voieIndex].competences[customComp.slotIndex]) {
                updatedVoies[customComp.voieIndex].competences[customComp.slotIndex] = {
                    ...updatedVoies[customComp.voieIndex].competences[customComp.slotIndex], // Keep existing properties if needed
                    titre: customComp.competenceName,
                    description: customComp.competenceDescription,
                    type: customComp.competenceType,
                    isCustom: true,
                    originalVoie: customComp.sourceVoie,
                    originalRank: customComp.sourceRank,
                };
            }
        });

        return updatedVoies;
    };

    const handleVoieClick = (voieIndex: number, compIndex: number) => {
        setSelectedVoieIndex(voieIndex);
        setSelectedCompetenceIndex(compIndex);
        setIsPanelOpen(true);
    };

    const handleReplacementSelect = (voie: Voie) => {
        setSelectedReplacement(voie);
        setSelectedCompetenceIndex(0);
        setIsDetailsPanelOpen(true);
    };

    const fetchReplacementVoies = async (type: string, profileName?: string, raceName?: string, prestigeClassName?: string) => {
        const replacementData: Voie[] = [];

        if (type === 'profiles') {
            if (!profileName) {
                for (const profile of profiles) {
                    for (let i = 1; i <= 5; i++) {
                        const voie = await loadVoieFromFile(`${profile.value}${i}.json`);
                        if (voie) replacementData.push(voie);
                    }
                }
            } else {
                for (let i = 1; i <= 5; i++) {
                    const voie = await loadVoieFromFile(`${profileName}${i}.json`);
                    if (voie) replacementData.push(voie);
                }
            }
        } else if (type === 'races') {
            if (!raceName) {
                for (const race of races) {
                    const voie = await loadVoieFromFile(`${race.value}.json`);
                    if (voie) replacementData.push(voie);
                }
            } else {
                const voie = await loadVoieFromFile(`${raceName}.json`);
                if (voie) replacementData.push(voie);
            }
        } else if (type === 'prestiges') {
            if (!prestigeClassName) {
                for (const prestigeClass of prestigeClasses) {
                    for (let i = 1; i <= prestigeClass.count; i++) {
                        const voie = await loadVoieFromFile(`prestige_${prestigeClass.value}${i}.json`);
                        if (voie) replacementData.push(voie);
                    }
                }
            } else {
                const selectedClass = prestigeClasses.find(pc => pc.value === prestigeClassName);
                if (selectedClass) {
                    for (let i = 1; i <= selectedClass.count; i++) {
                        const voie = await loadVoieFromFile(`prestige_${prestigeClassName}${i}.json`);
                        if (voie) replacementData.push(voie);
                    }
                }
            }
        }

        setReplacementVoies(replacementData);
    };

    const openDialog = () => {
        setIsPanelOpen(false);
        setIsDialogOpen(true);
        fetchReplacementVoies('profiles');
    };

    /* DATA STRUCTURES (Copied from change.tsx) */
    const profiles = [
        { value: 'Samourai', label: 'Samourai' },
        { value: 'Guerrier', label: 'Guerrier' },
        { value: 'Barde', label: 'Barde' },
        { value: 'Barbare', label: 'Barbare' },
        { value: 'Chevalier', label: 'Chevalier' },
        { value: 'Druide', label: 'Druide' },
        { value: 'Ensorceleur', label: 'Ensorceleur' },
        { value: 'Forgesort', label: 'Forgesort' },
        { value: 'Invocateur', label: 'Invocateur' },
        { value: 'Moine', label: 'Moine' },
        { value: 'Necromancien', label: 'Nécromancien' },
        { value: 'Psionique', label: 'Psionique' },
        { value: 'Pretre', label: 'Prêtre' },
        { value: 'Rodeur', label: 'Rôdeur' },
        { value: 'Voleur', label: 'Voleur' },
    ];

    const races = [
        { value: 'Humain', label: 'Humain' },
        { value: 'Elfe', label: 'Elfe' },
        { value: 'Elfenoir', label: 'Elfe Noir' },
        { value: 'Elfesylvain', label: 'Elfe Sylvain' },
        { value: 'Nain', label: 'Nain' },
        { value: 'Halfelin', label: 'Halfelin' },
        { value: 'Orque', label: 'Orque' },
        { value: 'Minotaure', label: 'Minotaure' },
        { value: 'Drakonide', label: 'Drakonide' },
        { value: 'Wolfer', label: 'Wolfer' },
        { value: 'Ogre', label: 'Ogre' },
        { value: 'Frouin', label: 'Frouin' },
        { value: 'Ame-forgee', label: 'Âme Forgée' },
    ];

    const prestigeClasses = [
        { value: 'voleur', label: 'Voleur', count: 3 },
        { value: 'rodeur', label: 'Rôdeur', count: 3 },
        { value: 'pretre', label: 'Prêtre', count: 3 },
        { value: 'moine', label: 'Moine', count: 3 },
        { value: 'guerrier', label: 'Guerrier', count: 2 },
        { value: 'forgesort', label: 'Forgesort', count: 3 },
        { value: 'ensorceleur', label: 'Ensorceleur', count: 2 },
        { value: 'druide', label: 'Druide', count: 2 },
        { value: 'chevalier', label: 'Chevalier', count: 3 },
        { value: 'barde', label: 'Barde', count: 3 },
        { value: 'barbare', label: 'Barbare', count: 2 },
        { value: 'arquebusier', label: 'Arquebusier', count: 3 },
        { value: 'necromancien', label: 'Nécromancien', count: 2 },
    ];

    /* HANDLERS */
    const handleProfileChange = (newProfile: string, profileLabel: string) => {
        setSelectedProfile(newProfile);
        setProfileSearchTerm(profileLabel);
        setIsProfileInputFocused(false);
        if (newProfile) fetchReplacementVoies('profiles', newProfile);
    };

    const clearProfileFilter = () => {
        setSelectedProfile('');
        setProfileSearchTerm('');
        fetchReplacementVoies('profiles');
    };

    const handleRaceChange = (newRace: string, raceLabel: string) => {
        setSelectedRace(newRace);
        setRaceSearchTerm(raceLabel);
        setIsRaceInputFocused(false);
        if (newRace) fetchReplacementVoies('races', undefined, newRace);
    };

    const clearRaceFilter = () => {
        setSelectedRace('');
        setRaceSearchTerm('');
        fetchReplacementVoies('races');
    };

    const handlePrestigeChange = (newPrestige: string, prestigeLabel: string) => {
        setSelectedPrestige(newPrestige);
        setPrestigeSearchTerm(prestigeLabel);
        setIsPrestigeInputFocused(false);
        if (newPrestige) fetchReplacementVoies('prestiges', undefined, undefined, newPrestige);
    };

    const clearPrestigeFilter = () => {
        setSelectedPrestige('');
        setPrestigeSearchTerm('');
        fetchReplacementVoies('prestiges');
    };

    const filteredProfiles = profiles.filter(profile =>
        profile.label.toLowerCase().includes(profileSearchTerm.toLowerCase())
    );

    const filteredRaces = races.filter(race =>
        race.label.toLowerCase().includes(raceSearchTerm.toLowerCase())
    );

    const filteredPrestigeClasses = prestigeClasses.filter(prestige =>
        prestige.label.toLowerCase().includes(prestigeSearchTerm.toLowerCase())
    );

    const applyReplacement = () => {
        if (selectedReplacement && selectedVoieIndex !== null) {
            const updatedVoies = [...voies];

            // Preserve custom competences if possible, or clear them for this slot?
            // Simpler to clear custom competences for this specific voie slot if the voie changes completely
            const oldVoieIndex = selectedVoieIndex;

            updatedVoies[oldVoieIndex] = selectedReplacement;

            setVoies(updatedVoies);

            // Remove custom competences associated with this voie index
            const updatedCustomCompetences = customCompetences.filter(cc => cc.voieIndex !== oldVoieIndex);
            setCustomCompetences(updatedCustomCompetences);

            // Re-apply custom competences to the updated voies list (in case other voies had them)
            const finalVoies = applyCustomCompetences(updatedVoies, updatedCustomCompetences);
            onVoiesChange(finalVoies, updatedCustomCompetences);

            setIsDialogOpen(false);
            setIsPanelOpen(true);
            setIsDetailsPanelOpen(false);
            setSelectedReplacement(null);
            toast.success('Voie remplacée avec succès');
        }
    };

    const addNewVoie = () => {
        setSelectedVoieIndex(null);
        setIsDialogOpen(true);
        fetchReplacementVoies('profiles');
    };

    const addVoieFromDialog = () => {
        if (selectedReplacement) {
            const updatedVoies = [...voies, selectedReplacement];
            setVoies(updatedVoies);

            // No custom competences to worry about for a new slot yet
            const finalVoies = applyCustomCompetences(updatedVoies, customCompetences);
            onVoiesChange(finalVoies, customCompetences);

            setIsDialogOpen(false);
            setIsDetailsPanelOpen(false);
            setSelectedReplacement(null);
            toast.success('Voie ajoutée avec succès');
        }
    };

    const removeVoie = (index: number) => {
        const updatedVoies = voies.filter((_, i) => i !== index);
        setVoies(updatedVoies);

        // Update custom competences:
        // 1. Remove those for the deleted index
        // 2. Shift indices for those after the deleted index
        const updatedCustomCompetences = customCompetences
            .filter(cc => cc.voieIndex !== index)
            .map(cc => {
                if (cc.voieIndex > index) {
                    return { ...cc, voieIndex: cc.voieIndex - 1 };
                }
                return cc;
            });

        setCustomCompetences(updatedCustomCompetences);
        const finalVoies = applyCustomCompetences(updatedVoies, updatedCustomCompetences);
        onVoiesChange(finalVoies, updatedCustomCompetences);

        if (isPanelOpen && selectedVoieIndex === index) {
            setIsPanelOpen(false);
        }
        toast.success('Voie supprimée');
    };

    /* COMPETENCE REPLACEMENT LOGIC */
    const handleCompetenceClick = (voieIndex: number, competenceIndex: number) => {
        setSelectedCompetenceSlot({ voieIndex, competenceIndex });
        setIsCompetenceDialogOpen(true);
        fetchCompetenceReplacementVoies('profiles');
    };

    const selectCompetenceFromVoie = (competenceIndex: number) => {
        if (!selectedVoieForCompetence || !selectedCompetenceSlot) return;

        const competence = selectedVoieForCompetence.competences[competenceIndex];
        const customCompetence: CustomCompetence = {
            slotIndex: selectedCompetenceSlot.competenceIndex,
            voieIndex: selectedCompetenceSlot.voieIndex,
            sourceVoie: selectedVoieForCompetence.fichier,
            sourceRank: competenceIndex + 1,
            competenceName: competence.titre,
            competenceDescription: competence.description,
            competenceType: competence.type,
        };

        const updatedCustomCompetences = customCompetences.filter(
            cc => !(cc.voieIndex === selectedCompetenceSlot.voieIndex && cc.slotIndex === selectedCompetenceSlot.competenceIndex)
        );
        updatedCustomCompetences.push(customCompetence);

        setCustomCompetences(updatedCustomCompetences);

        // Reconstruct voies with new custom competence
        const finalVoies = applyCustomCompetences(voies, updatedCustomCompetences);
        setVoies(finalVoies); // Update local visual state
        onVoiesChange(finalVoies, updatedCustomCompetences); // Update parent

        setIsCompetenceDialogOpen(false);
        setIsCompetenceDetailModalOpen(false);
        setSelectedCompetenceSlot(null);
        setSelectedVoieForCompetence(null);
        setSelectedCompetenceFromVoie(null);
        toast.success('Compétence remplacée avec succès.');
    };

    const fetchCompetenceReplacementVoies = async (type: string, profileName?: string, raceName?: string, prestigeClassName?: string) => {
        const replacementData: Voie[] = [];
        // ... Same filtering logic as fetchReplacementVoies ...
        // To avoid duplication, I will reuse the same function logic but output to setCompetenceReplacementVoies
        // Or simpler: just reuse the logic but call setCompetenceReplacementVoies at the end.
        // For brevity, I'll copy the logic logic.

        if (type === 'profiles') {
            if (!profileName) {
                for (const profile of profiles) {
                    for (let i = 1; i <= 5; i++) {
                        const voie = await loadVoieFromFile(`${profile.value}${i}.json`);
                        if (voie) replacementData.push(voie);
                    }
                }
            } else {
                for (let i = 1; i <= 5; i++) {
                    const voie = await loadVoieFromFile(`${profileName}${i}.json`);
                    if (voie) replacementData.push(voie);
                }
            }
        } else if (type === 'races') {
            if (!raceName) {
                for (const race of races) {
                    const voie = await loadVoieFromFile(`${race.value}.json`);
                    if (voie) replacementData.push(voie);
                }
            } else {
                const voie = await loadVoieFromFile(`${raceName}.json`);
                if (voie) replacementData.push(voie);
            }
        } else if (type === 'prestiges') {
            if (!prestigeClassName) {
                for (const prestigeClass of prestigeClasses) {
                    for (let i = 1; i <= prestigeClass.count; i++) {
                        const voie = await loadVoieFromFile(`prestige_${prestigeClass.value}${i}.json`);
                        if (voie) replacementData.push(voie);
                    }
                }
            } else {
                const selectedClass = prestigeClasses.find(pc => pc.value === prestigeClassName);
                if (selectedClass) {
                    for (let i = 1; i <= selectedClass.count; i++) {
                        const voie = await loadVoieFromFile(`prestige_${prestigeClassName}${i}.json`);
                        if (voie) replacementData.push(voie);
                    }
                }
            }
        }
        setCompetenceReplacementVoies(replacementData);
    };

    const handleProfileForCompetenceChange = (newProfile: string, profileLabel: string) => {
        setSelectedProfileForCompetence(newProfile);
        setProfileForCompetenceSearchTerm(profileLabel);
        setIsProfileForCompetenceInputFocused(false);
        if (newProfile) fetchCompetenceReplacementVoies('profiles', newProfile);
    };

    const clearProfileForCompetenceFilter = () => {
        setSelectedProfileForCompetence('');
        setProfileForCompetenceSearchTerm('');
        fetchCompetenceReplacementVoies('profiles');
    };

    const handleRaceForCompetenceChange = (newRace: string, raceLabel: string) => {
        setSelectedRaceForCompetence(newRace);
        setRaceForCompetenceSearchTerm(raceLabel);
        setIsRaceForCompetenceInputFocused(false);
        if (newRace) fetchCompetenceReplacementVoies('races', undefined, newRace);
    };

    const clearRaceForCompetenceFilter = () => {
        setSelectedRaceForCompetence('');
        setRaceForCompetenceSearchTerm('');
        fetchCompetenceReplacementVoies('races');
    };

    const handlePrestigeForCompetenceChange = (newPrestige: string, prestigeLabel: string) => {
        setSelectedPrestigeForCompetence(newPrestige);
        setPrestigeForCompetenceSearchTerm(prestigeLabel);
        setIsPrestigeForCompetenceInputFocused(false);
        if (newPrestige) fetchCompetenceReplacementVoies('prestiges', undefined, undefined, newPrestige);
    };

    const clearPrestigeForCompetenceFilter = () => {
        setSelectedPrestigeForCompetence('');
        setPrestigeForCompetenceSearchTerm('');
        fetchCompetenceReplacementVoies('prestiges');
    };

    const filteredProfilesForCompetence = profiles.filter(profile =>
        profile.label.toLowerCase().includes(profileForCompetenceSearchTerm.toLowerCase())
    );

    const filteredRacesForCompetence = races.filter(race =>
        race.label.toLowerCase().includes(raceForCompetenceSearchTerm.toLowerCase())
    );

    const filteredPrestigeClassesForCompetence = prestigeClasses.filter(prestige =>
        prestige.label.toLowerCase().includes(prestigeForCompetenceSearchTerm.toLowerCase())
    );

    const resetCompetence = (voieIndex: number, competenceIndex: number) => {
        // Update local state
        const updatedCustomCompetences = customCompetences.filter(
            cc => !(cc.voieIndex === voieIndex && cc.slotIndex === competenceIndex)
        );
        setCustomCompetences(updatedCustomCompetences);

        // Reload original voies with updated custom competences
        // Since we don't reload from DB, we can just "re-apply" custom comps to the current voies (assuming current voies still have original data? No, applied in place)
        // Actually, to fully reset, we need the "base" voies.
        // But `voies` state currently HAS the modified competencies.
        // We should probably reload the specific FILE for that voie to get the original back.
        const voieToReset = voies[voieIndex];
        if (voieToReset) {
            loadVoieFromFile(voieToReset.fichier).then(originalVoie => {
                if (originalVoie) {
                    const newVoies = [...voies];
                    newVoies[voieIndex] = originalVoie;

                    // Re-apply remaining custom competences for this voie
                    const remainingCustomComps = updatedCustomCompetences.filter(cc => cc.voieIndex === voieIndex);

                    if (remainingCustomComps.length > 0) {
                        // Need a mini apply for just this one
                        const tempArray = [newVoies[voieIndex]];
                        const fixedArray = applyCustomCompetences(tempArray, remainingCustomComps);
                        newVoies[voieIndex] = fixedArray[0];
                    }

                    setVoies(newVoies);
                    onVoiesChange(newVoies, updatedCustomCompetences);
                    toast.success('Compétence réinitialisée');
                }
            })
        }
    };


    if (loading) {
        return (
            <div className="flex justify-center items-center h-40">
                <div className="text-xl text-[var(--text-secondary)]">Chargement des compétences...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center w-full">
            <div className="mb-6 text-center">
                <h2 className="text-2xl font-bold mb-2 text-[var(--accent-brown)]">Choix des Compétences</h2>
                <p className="text-[var(--text-secondary)]">Gérez vos voies de compétences. Vous pouvez ajouter, remplacer ou modifier vos 5 voies initiales.</p>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <SortableContext
                    items={voies.map((_, idx) => `voie-${idx}`)}
                    strategy={rectSortingStrategy}
                >
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6 w-full">
                        {voies.map((voie, index) => (
                            <SortableVoieCard
                                key={`voie-${index}`}
                                voie={voie}
                                index={index}
                                onRemove={removeVoie}
                                onCompetenceClick={handleCompetenceClick}
                                onVoieClick={handleVoieClick}
                                onResetCompetence={resetCompetence}
                            />
                        ))}

                        {/* Add new voie card */}
                        <Card
                            className="card border-2 border-dashed border-[var(--border-color)] hover:border-[var(--accent-brown)] cursor-pointer transition-colors"
                            onClick={addNewVoie}
                        >
                            <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px]">
                                <Plus className="w-12 h-12 text-[var(--text-secondary)] mb-2" />
                                <span className="text-[var(--text-secondary)] font-medium">Ajouter une voie</span>
                            </CardContent>
                        </Card>
                    </div>
                </SortableContext>

                <DragOverlay dropAnimation={null}>
                    {activeVoie ? (
                        <Card className="card shadow-2xl opacity-90 ring-4 ring-[var(--accent-brown)] rotate-3 scale-105">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-2">
                                    <GripVertical className="w-5 h-5 text-[var(--accent-brown)]" />
                                    <CardTitle className="text-[var(--accent-brown)]">{activeVoie.nom}</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2">
                                    {activeVoie.competences.slice(0, 3).map((competence, compIndex) => (
                                        <li
                                            key={compIndex}
                                            className={`p-2 rounded border ${competence.isCustom
                                                ? 'border-[var(--accent-brown)] bg-[var(--bg-card)]'
                                                : 'border-[var(--border-color)]'
                                                }`}
                                        >
                                            <span className={`text-sm ${competence.isCustom ? 'text-[var(--accent-brown)]' : 'text-[var(--text-secondary)]'}`}>
                                                {competence.titre}
                                                {competence.isCustom && ' 🔄'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {/* Modal for voie details */}
            <Dialog open={isPanelOpen} onOpenChange={setIsPanelOpen}>
                <DialogContent className="max-w-2xl">
                    {selectedVoieIndex !== null && voies[selectedVoieIndex] && (
                        <>
                            <DialogTitle className="modal-title mb-4">{voies[selectedVoieIndex].nom}</DialogTitle>

                            <div className="mb-4">
                                <label className="block font-semibold text-[var(--text-primary)] mb-2">Sélectionner une compétence</label>
                                <Select
                                    value={String(selectedCompetenceIndex || 0)}
                                    onValueChange={(val) => setSelectedCompetenceIndex(parseInt(val))}
                                >
                                    <SelectTrigger className="w-full bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white">
                                        <SelectGroup>
                                            {voies[selectedVoieIndex].competences.map((competence, index) => (
                                                <SelectItem key={index} value={String(index)}>
                                                    {competence.titre}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>

                            {selectedCompetenceIndex !== null && voies[selectedVoieIndex].competences[selectedCompetenceIndex] && (
                                <div className="mb-6">
                                    <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">
                                        {voies[selectedVoieIndex].competences[selectedCompetenceIndex].titre}
                                    </h3>
                                    <div
                                        className="text-sm text-[var(--text-secondary)] p-4 bg-[var(--bg-card)] rounded border border-[var(--border-color)] whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{
                                            __html: voies[selectedVoieIndex].competences[selectedCompetenceIndex].description
                                        }}
                                    />
                                </div>
                            )}

                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setIsPanelOpen(false)} className="button-cancel">
                                    Fermer
                                </Button>
                                <Button onClick={openDialog} className="button-primary">
                                    Remplacer cette voie
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Dialog for selecting replacement voies */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[90vh] p-6 overflow-y-auto">
                    <DialogTitle className="modal-title mb-4">
                        {selectedVoieIndex !== null ? 'Choisir une nouvelle voie' : 'Ajouter une voie'}
                    </DialogTitle>

                    <Tabs value={activeTabMain} onValueChange={(type) => {
                        setActiveTabMain(type);
                        fetchReplacementVoies(type);
                    }}>
                        <div className="flex items-center justify-between mb-6 bg-black/20 p-2 rounded-lg border border-white/5">
                            <TabsList className="bg-transparent border-none">
                                <TabsTrigger value="profiles" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Profils</TabsTrigger>
                                <TabsTrigger value="races" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Races</TabsTrigger>
                                <TabsTrigger value="prestiges" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Prestiges</TabsTrigger>
                            </TabsList>

                            <div className="flex items-center gap-4">
                                {activeTabMain === 'profiles' && (
                                    <Select
                                        value={selectedProfile || "none"}
                                        onValueChange={(val) => {
                                            if (val === "none") {
                                                setSelectedProfile("");
                                                fetchReplacementVoies('profiles');
                                            } else {
                                                const profile = profiles.find(p => p.value === val);
                                                if (profile) handleProfileChange(profile.value, profile.label);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                                            <SelectValue placeholder="Profil..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-60">
                                            <SelectGroup>
                                                <SelectItem value="none">Tous les profils</SelectItem>
                                                {profiles.map((profile) => (
                                                    <SelectItem key={profile.value} value={profile.value}>
                                                        {profile.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                )}

                                {activeTabMain === 'races' && (
                                    <Select
                                        value={selectedRace || "none"}
                                        onValueChange={(val) => {
                                            if (val === "none") {
                                                setSelectedRace("");
                                                fetchReplacementVoies('races');
                                            } else {
                                                const race = races.find(r => r.value === val);
                                                if (race) handleRaceChange(race.value, race.label);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                                            <SelectValue placeholder="Race..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-60">
                                            <SelectGroup>
                                                <SelectItem value="none">Toutes les races</SelectItem>
                                                {races.map((race) => (
                                                    <SelectItem key={race.value} value={race.value}>
                                                        {race.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                )}

                                {activeTabMain === 'prestiges' && (
                                    <Select
                                        value={selectedPrestige || "none"}
                                        onValueChange={(val) => {
                                            if (val === "none") {
                                                setSelectedPrestige("");
                                                fetchReplacementVoies('prestiges');
                                            } else {
                                                const prestige = prestigeClasses.find(p => p.value === val);
                                                if (prestige) handlePrestigeChange(prestige.value, prestige.label);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                                            <SelectValue placeholder="Classe..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-60">
                                            <SelectGroup>
                                                <SelectItem value="none">Toutes les classes</SelectItem>
                                                {prestigeClasses.map((prestige) => (
                                                    <SelectItem key={prestige.value} value={prestige.value}>
                                                        {prestige.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>

                        <TabsContent value="profiles">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {replacementVoies.map((voie, index) => (
                                    <Card
                                        key={index}
                                        className="card cursor-pointer hover:border-[var(--accent-brown)] transition-colors"
                                        onClick={() => handleReplacementSelect(voie)}
                                    >
                                        <CardHeader>
                                            <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ul className="space-y-2">
                                                {voie.competences.length > 0 && (
                                                    <li className="text-sm text-[var(--text-primary)]">{voie.competences[0].titre}</li>
                                                )}
                                                <li className="text-xs text-[var(--text-secondary)]">Et {voie.competences.length - 1} autres...</li>
                                            </ul>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        {/* Similar contents for Races and Prestiges */}
                        <TabsContent value="races">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {replacementVoies.map((voie, index) => (
                                    <Card
                                        key={index}
                                        className="card cursor-pointer hover:border-[var(--accent-brown)] transition-colors"
                                        onClick={() => handleReplacementSelect(voie)}
                                    >
                                        <CardHeader>
                                            <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ul className="space-y-2">
                                                {voie.competences.length > 0 && (
                                                    <li className="text-sm text-[var(--text-primary)]">{voie.competences[0].titre}</li>
                                                )}
                                                <li className="text-xs text-[var(--text-secondary)]">Et {voie.competences.length - 1} autres...</li>
                                            </ul>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                        <TabsContent value="prestiges">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {replacementVoies.map((voie, index) => (
                                    <Card
                                        key={index}
                                        className="card cursor-pointer hover:border-[var(--accent-brown)] transition-colors"
                                        onClick={() => handleReplacementSelect(voie)}
                                    >
                                        <CardHeader>
                                            <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <ul className="space-y-2">
                                                {voie.competences.length > 0 && (
                                                    <li className="text-sm text-[var(--text-primary)]">{voie.competences[0].titre}</li>
                                                )}
                                                <li className="text-xs text-[var(--text-secondary)]">Et {voie.competences.length - 1} autres...</li>
                                            </ul>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>

                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Modal for replacement voie details (ADD/REPLACE confirmation) */}
            <Dialog open={isDetailsPanelOpen} onOpenChange={setIsDetailsPanelOpen}>
                <DialogContent className="max-w-2xl">
                    {selectedReplacement && (
                        <>
                            <DialogTitle className="modal-title mb-4">{selectedReplacement.nom}</DialogTitle>
                            {/* ... Details of the voie ... */}
                            <div className="mb-4 max-h-60 overflow-y-auto">
                                {selectedReplacement.competences.map((comp, idx) => (
                                    <div key={idx} className="mb-2 p-2 border rounded">
                                        <div className="font-bold">{comp.titre}</div>
                                        <div className="text-sm text-gray-400" dangerouslySetInnerHTML={{ __html: comp.description }}></div>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setIsDetailsPanelOpen(false)} className="button-cancel">
                                    Annuler
                                </Button>
                                <Button
                                    onClick={selectedVoieIndex !== null ? applyReplacement : addVoieFromDialog}
                                    className="button-primary"
                                >
                                    {selectedVoieIndex !== null ? 'Remplacer' : 'Ajouter'}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Competence Selection Dialog */}
            <Dialog open={isCompetenceDialogOpen} onOpenChange={setIsCompetenceDialogOpen}>
                <DialogContent className="!max-w-[95vw] !w-[95vw] !h-[90vh] p-6 overflow-y-auto">
                    <DialogTitle>Choisir une compétence de remplacement</DialogTitle>
                    <Tabs value={activeTabComp} onValueChange={(type) => {
                        setActiveTabComp(type);
                        fetchCompetenceReplacementVoies(type);
                    }}>
                        <div className="flex items-center justify-between mb-6 bg-black/20 p-2 rounded-lg border border-white/5">
                            <TabsList className="bg-transparent border-none">
                                <TabsTrigger value="profiles" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Profils</TabsTrigger>
                                <TabsTrigger value="races" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Races</TabsTrigger>
                                <TabsTrigger value="prestiges" className="data-[state=active]:bg-[#c0a080] data-[state=active]:text-black">Prestiges</TabsTrigger>
                            </TabsList>

                            <div className="flex items-center gap-4">
                                {activeTabComp === 'profiles' && (
                                    <Select
                                        value={selectedProfileForCompetence || "none"}
                                        onValueChange={(val) => {
                                            if (val === "none") {
                                                setSelectedProfileForCompetence("");
                                                fetchCompetenceReplacementVoies('profiles');
                                            } else {
                                                const profile = profiles.find(p => p.value === val);
                                                if (profile) handleProfileForCompetenceChange(profile.value, profile.label);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                                            <SelectValue placeholder="Profil..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-60">
                                            <SelectGroup>
                                                <SelectItem value="none">Tous les profils</SelectItem>
                                                {profiles.map((profile) => (
                                                    <SelectItem key={profile.value} value={profile.value}>
                                                        {profile.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                )}

                                {activeTabComp === 'races' && (
                                    <Select
                                        value={selectedRaceForCompetence || "none"}
                                        onValueChange={(val) => {
                                            if (val === "none") {
                                                setSelectedRaceForCompetence("");
                                                fetchCompetenceReplacementVoies('races');
                                            } else {
                                                const race = races.find(r => r.value === val);
                                                if (race) handleRaceForCompetenceChange(race.value, race.label);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                                            <SelectValue placeholder="Race..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-60">
                                            <SelectGroup>
                                                <SelectItem value="none">Toutes les races</SelectItem>
                                                {races.map((race) => (
                                                    <SelectItem key={race.value} value={race.value}>
                                                        {race.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                )}

                                {activeTabComp === 'prestiges' && (
                                    <Select
                                        value={selectedPrestigeForCompetence || "none"}
                                        onValueChange={(val) => {
                                            if (val === "none") {
                                                setSelectedPrestigeForCompetence("");
                                                fetchCompetenceReplacementVoies('prestiges');
                                            } else {
                                                const prestige = prestigeClasses.find(p => p.value === val);
                                                if (prestige) handlePrestigeForCompetenceChange(prestige.value, prestige.label);
                                            }
                                        }}
                                    >
                                        <SelectTrigger className="w-[180px] bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]">
                                            <SelectValue placeholder="Classe..." />
                                        </SelectTrigger>
                                        <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-60">
                                            <SelectGroup>
                                                <SelectItem value="none">Toutes les classes</SelectItem>
                                                {prestigeClasses.map((prestige) => (
                                                    <SelectItem key={prestige.value} value={prestige.value}>
                                                        {prestige.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>

                        <TabsContent value="profiles">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {competenceReplacementVoies.map((voie, index) => (
                                    <Card key={index} className="card">
                                        <CardHeader><CardTitle>{voie.nom}</CardTitle></CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-3 mt-4">
                                                <Select
                                                    value={selectedVoieForCompetence?.fichier || ""}
                                                    onValueChange={async (val) => {
                                                        const voie = await loadVoieFromFile(val);
                                                        if (voie) {
                                                            setSelectedVoieForCompetence(voie);
                                                            setSelectedCompetenceFromVoie(0);
                                                            setIsCompetenceDetailModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="flex-1 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs font-semibold">
                                                        <SelectValue placeholder="Choisir une voie..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-[300px]">
                                                        <SelectGroup>
                                                            {competenceReplacementVoies.map(voie => (
                                                                <SelectItem key={voie.fichier} value={voie.fichier}>
                                                                    {voie.nom}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>
                        <TabsContent value="races">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {competenceReplacementVoies.map((voie, index) => (
                                    <Card key={index} className="card">
                                        <CardHeader><CardTitle>{voie.nom}</CardTitle></CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-3 mt-4">
                                                <Select
                                                    value={selectedVoieForCompetence?.fichier || ""}
                                                    onValueChange={async (val) => {
                                                        const voie = await loadVoieFromFile(val);
                                                        if (voie) {
                                                            setSelectedVoieForCompetence(voie);
                                                            setSelectedCompetenceFromVoie(0);
                                                            setIsCompetenceDetailModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="flex-1 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs font-semibold">
                                                        <SelectValue placeholder="Choisir une voie..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-[300px]">
                                                        <SelectGroup>
                                                            {competenceReplacementVoies.map(v => (
                                                                <SelectItem key={v.fichier} value={v.fichier}>
                                                                    {v.nom}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>
                        <TabsContent value="prestiges">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {competenceReplacementVoies.map((voie, index) => (
                                    <Card key={index} className="card">
                                        <CardHeader><CardTitle>{voie.nom}</CardTitle></CardHeader>
                                        <CardContent>
                                            <div className="flex items-center gap-3 mt-4">
                                                <Select
                                                    value={selectedVoieForCompetence?.fichier || ""}
                                                    onValueChange={async (val) => {
                                                        const voie = await loadVoieFromFile(val);
                                                        if (voie) {
                                                            setSelectedVoieForCompetence(voie);
                                                            setSelectedCompetenceFromVoie(0);
                                                            setIsCompetenceDetailModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger className="flex-1 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] rounded-lg px-3 py-2 text-xs font-semibold">
                                                        <SelectValue placeholder="Choisir une voie..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-zinc-900 border-[#c0a080]/30 text-white max-h-[300px]">
                                                        <SelectGroup>
                                                            {competenceReplacementVoies.map(v => (
                                                                <SelectItem key={v.fichier} value={v.fichier}>
                                                                    {v.nom}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Competence Detail/Confirm Modal */}
            <Dialog open={isCompetenceDetailModalOpen} onOpenChange={setIsCompetenceDetailModalOpen}>
                <DialogContent>
                    {selectedVoieForCompetence && selectedCompetenceFromVoie !== null && (
                        <>
                            <DialogTitle>{selectedVoieForCompetence.competences[selectedCompetenceFromVoie].titre}</DialogTitle>
                            <div className="py-4" dangerouslySetInnerHTML={{ __html: selectedVoieForCompetence.competences[selectedCompetenceFromVoie].description }}></div>
                            <Button onClick={() => selectCompetenceFromVoie(selectedCompetenceFromVoie!)}>Confirmer le remplacement</Button>
                        </>
                    )}
                </DialogContent>
            </Dialog>

        </div>
    );
}
