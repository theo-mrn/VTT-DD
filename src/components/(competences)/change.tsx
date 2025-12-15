'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { db, auth, onAuthStateChanged, getDoc, setDoc, doc, collection, getDocs, deleteDoc } from '@/lib/firebase';
import { X, Plus, Trash2, Check, ChevronsUpDown, Info, GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
  DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Competence = {
  titre: string;
  description: string;
  type: string;
  isCustom?: boolean;
  originalVoie?: string;
  originalRank?: number;
};

type Voie = {
  nom: string;
  competences: Competence[];
  fichier: string;
};

type CustomCompetence = {
  slotIndex: number; // Position dans la voie (0-4)
  voieIndex: number; // Index de la voie (0-based)
  sourceVoie: string; // Fichier de la voie source
  sourceRank: number; // Rang dans la voie source (1-5)
  competenceName: string;
  competenceDescription: string;
  competenceType: string;
};

interface CharacterProfileProps {
  onClose?: () => void;
  characterId?: string;
  roomId?: string;
}

// Sortable Voie Card Component
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
                    <Info />
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

export default function CharacterProfile({ onClose, characterId: propCharacterId, roomId: propRoomId }: CharacterProfileProps = {}) {
  const router = useRouter();
  const [, setProfile] = useState<string | null>(null);
  const [, setRace] = useState<string | null>(null);
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
  const [roomId, setRoomId] = useState<string | null>(propRoomId || null);
  const [persoId, setPersoId] = useState<string | null>(propCharacterId || null);
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
      setVoies((items) => {
        const oldIndex = items.findIndex((_, idx) => `voie-${idx}` === active.id);
        const newIndex = items.findIndex((_, idx) => `voie-${idx}` === over.id);

        // Update custom competences positions
        const updatedCustomCompetences = customCompetences.map(cc => {
          if (cc.voieIndex === oldIndex) {
            return { ...cc, voieIndex: newIndex };
          }
          // If moving down (e.g. 0 -> 2), items between 0 and 2 (exclusive of 0, inclusive of 2) shift up (-1)
          if (oldIndex < newIndex) {
            if (cc.voieIndex > oldIndex && cc.voieIndex <= newIndex) {
              return { ...cc, voieIndex: cc.voieIndex - 1 };
            }
          }
          // If moving up (e.g. 2 -> 0), items between 0 and 2 (inclusive of 0, exclusive of 2) shift down (+1)
          else if (oldIndex > newIndex) {
            if (cc.voieIndex >= newIndex && cc.voieIndex < oldIndex) {
              return { ...cc, voieIndex: cc.voieIndex + 1 };
            }
          }
          return cc;
        });

        setCustomCompetences(updatedCustomCompetences);
        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const activeVoie = activeId ? voies[parseInt(activeId.split('-')[1])] : null;

  useEffect(() => {
    const fetchCharacterData = async () => {
      // Prioritize props if available
      let targetRoomId = propRoomId;
      let targetPersoId = propCharacterId;

      if (!targetRoomId || !targetPersoId) {
        const user = auth.currentUser;
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          const userData = await getDoc(userRef);

          if (userData.exists()) {
            const data = userData.data();
            targetRoomId = data.room_id;
            targetPersoId = data.persoId;
            setRoomId(targetRoomId || null);
            setPersoId(targetPersoId || null);
          }
        }
      }

      if (targetRoomId && targetPersoId) {
        const characterRef = doc(db, `cartes/${targetRoomId}/characters/${targetPersoId}`);
        const characterData = await getDoc(characterRef);

        if (characterData.exists()) {
          const data = characterData.data();
          setRace(data.Race);
          setProfile(data.Profile);

          // Load custom competences FIRST
          const customComps = await loadCustomCompetences(targetRoomId, targetPersoId);

          // Then load current voies with custom competences applied
          await loadCurrentVoies(data, customComps);
          setLoading(false);
          return;
        }
      }

      setLoading(false);
    };

    if (propRoomId && propCharacterId) {
      fetchCharacterData();
    } else {
      onAuthStateChanged(auth, (user) => {
        if (user) {
          fetchCharacterData();
        } else {
          setLoading(false);
        }
      });
    }
  }, [propCharacterId, propRoomId]);

  const loadCustomCompetences = async (roomId: string, persoId: string): Promise<CustomCompetence[]> => {
    try {
      const customCompetencesRef = collection(db, `cartes/${roomId}/characters/${persoId}/customCompetences`);
      const customCompetencesSnapshot = await getDocs(customCompetencesRef);

      const customComps: CustomCompetence[] = [];
      customCompetencesSnapshot.forEach((doc) => {
        const data = doc.data();
        customComps.push({
          slotIndex: data.slotIndex,
          voieIndex: data.voieIndex,
          sourceVoie: data.sourceVoie,
          sourceRank: data.sourceRank,
          competenceName: data.competenceName,
          competenceDescription: data.competenceDescription,
          competenceType: data.competenceType,
        });
      });

      setCustomCompetences(customComps);
      return customComps;
    } catch (error) {
      console.error('Error loading custom competences:', error);
      return [];
    }
  };

  const applyCustomCompetences = (voies: Voie[], customComps: CustomCompetence[]) => {
    const updatedVoies = [...voies];

    customComps.forEach((customComp) => {
      if (updatedVoies[customComp.voieIndex] && updatedVoies[customComp.voieIndex].competences[customComp.slotIndex]) {
        updatedVoies[customComp.voieIndex].competences[customComp.slotIndex] = {
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

  const loadCurrentVoies = async (characterData: Record<string, string | number>, customComps: CustomCompetence[] = []) => {
    const loadedVoies: Voie[] = [];

    // Load voies from character data
    for (let i = 1; i <= 10; i++) { // Support up to 10 voies
      const voieFile = characterData[`Voie${i}`];

      if (voieFile) {
        try {
          const response = await fetch(`/tabs/${voieFile}`);
          if (response.ok) {
            const data = await response.json();
            const competences = Object.keys(data)
              .filter((key) => key.startsWith('Affichage'))
              .map((key, index) => ({
                titre: data[`Affichage${index + 1}`] || '',
                description: (data[`rang${index + 1}`] || '').replace(/<br>/g, '\n'),
                type: data[`type${index + 1}`] || 'other',
              }));

            loadedVoies.push({
              nom: data.Voie,
              competences,
              fichier: voieFile as string
            });
          }
        } catch (error) {
          console.error(`Error loading voie ${voieFile}:`, error);
        }
      }
    }

    // Apply custom competences after loading voies
    const voiesWithCustomCompetences = applyCustomCompetences(loadedVoies, customComps);
    setVoies(voiesWithCustomCompetences);
  };

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
      // Load all profile voies if no specific profile is selected
      if (!profileName) {
        for (const profile of profiles) {
          for (let i = 1; i <= 5; i++) {
            const voie = await loadVoieFromFile(`${profile.value}${i}.json`);
            if (voie) replacementData.push(voie);
          }
        }
      } else {
        // Load specific profile
        for (let i = 1; i <= 5; i++) {
          const voie = await loadVoieFromFile(`${profileName}${i}.json`);
          if (voie) replacementData.push(voie);
        }
      }
    } else if (type === 'races') {
      // Load all race voies if no specific race is selected
      if (!raceName) {
        for (const race of races) {
          const voie = await loadVoieFromFile(`${race.value}.json`);
          if (voie) replacementData.push(voie);
        }
      } else {
        // Load specific race
        const voie = await loadVoieFromFile(`${raceName}.json`);
        if (voie) replacementData.push(voie);
      }
    } else if (type === 'prestiges') {
      // Load all prestige voies if no specific class is selected
      if (!prestigeClassName) {
        for (const prestigeClass of prestigeClasses) {
          for (let i = 1; i <= prestigeClass.count; i++) {
            const voie = await loadVoieFromFile(`prestige_${prestigeClass.value}${i}.json`);
            if (voie) replacementData.push(voie);
          }
        }
      } else {
        // Load specific prestige class
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
    { value: 'Necromencien', label: 'Nécromancien' },
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
    { value: 'necromencien', label: 'Nécromancien', count: 2 },
  ];

  const handleProfileChange = (newProfile: string, profileLabel: string) => {
    setSelectedProfile(newProfile);
    setProfileSearchTerm(profileLabel);
    setIsProfileInputFocused(false);
    if (newProfile) {
      fetchReplacementVoies('profiles', newProfile);
    }
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
    if (newRace) {
      fetchReplacementVoies('races', undefined, newRace);
    }
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
    if (newPrestige) {
      fetchReplacementVoies('prestiges', undefined, undefined, newPrestige);
    }
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
      updatedVoies[selectedVoieIndex] = selectedReplacement;
      setVoies(updatedVoies);
      setIsDialogOpen(false);
      setIsPanelOpen(true);
      setIsDetailsPanelOpen(false);
      setSelectedReplacement(null);
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
      setIsDialogOpen(false);
      setIsDetailsPanelOpen(false);
      setSelectedReplacement(null);
    }
  };

  const removeVoie = (index: number) => {
    const updatedVoies = voies.filter((_, i) => i !== index);
    setVoies(updatedVoies);
    if (isPanelOpen && selectedVoieIndex === index) {
      setIsPanelOpen(false);
    }
  };

  const saveCharacterData = async () => {
    if (!roomId || !persoId) return;

    const characterRef = doc(db, `cartes/${roomId}/characters/${persoId}`);

    // Get current character data from Firestore to compare
    const currentCharacterData = await getDoc(characterRef);
    const currentVoies: Record<string, string> = {};
    const currentVValues: Record<string, number> = {};

    if (currentCharacterData.exists()) {
      const data = currentCharacterData.data();
      for (let i = 1; i <= 10; i++) {
        const voieFile = data[`Voie${i}`];
        if (voieFile) {
          currentVoies[`Voie${i}`] = voieFile as string;
        }
        // Préserver les valeurs v1, v2, etc.
        const vValue = data[`v${i}`];
        if (vValue !== undefined) {
          currentVValues[`v${i}`] = vValue as number;
        }
      }
    }

    const voiesData = voies.reduce((acc, voie, index) => {
      const voieIndex = index + 1;
      const previousVoieFile = currentVoies[`Voie${voieIndex}`];

      acc[`Voie${voieIndex}`] = voie.fichier;

      // Si la voie a changé, réinitialiser à 0, sinon conserver la valeur actuelle
      if (previousVoieFile && previousVoieFile !== voie.fichier) {
        acc[`v${voieIndex}`] = 0;
      } else {
        acc[`v${voieIndex}`] = currentVValues[`v${voieIndex}`] || 0;
      }

      return acc;
    }, {} as Record<string, string | number>);

    // Clear any remaining voie slots
    for (let i = voies.length + 1; i <= 10; i++) {
      voiesData[`Voie${i}`] = '';
      voiesData[`v${i}`] = 0;
    }

    await setDoc(characterRef, voiesData, { merge: true });

    // Save all current custom competences
    // First delete all existing ones to avoid ghosts
    const customCompetencesRef = collection(db, `cartes/${roomId}/characters/${persoId}/customCompetences`);
    const snapshot = await getDocs(customCompetencesRef);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);

    // Then save current ones
    const savePromises = customCompetences.map(cc => {
      const docRef = doc(db, `cartes/${roomId}/characters/${persoId}/customCompetences`, `${cc.voieIndex}-${cc.slotIndex}`);
      return setDoc(docRef, cc);
    });
    await Promise.all(savePromises);

    toast.success('Les données ont été sauvegardées avec succès.');

    // Émettre un événement pour notifier les autres composants de la mise à jour
    window.dispatchEvent(new CustomEvent('competences-updated'));

    // Si onClose est fourni, on retourne aux compétences
    // Sinon, on redirige vers la map
    if (onClose) {
      onClose();
    } else {
      router.push(`/${roomId}/map`);
    }
  };

  const cleanupCustomCompetencesForChangedVoies = async (previousVoies: Record<string, string>) => {
    if (!roomId || !persoId) return;

    try {
      const customCompetencesRef = collection(db, `cartes/${roomId}/characters/${persoId}/customCompetences`);
      const customCompetencesSnapshot = await getDocs(customCompetencesRef);

      const deletePromises: Promise<void>[] = [];

      customCompetencesSnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        const voieIndex = data.voieIndex;

        // Delete if:
        // 1. Voie index is beyond current voies length (voie removed)
        // 2. Voie at this index has changed (different file)
        if (voieIndex >= voies.length) {
          // Voie was removed
          deletePromises.push(deleteDoc(docSnapshot.ref));
        } else {
          const currentVoieFile = voies[voieIndex]?.fichier;
          const previousVoieFile = previousVoies[`Voie${voieIndex + 1}`];

          // If the voie file has changed, delete the custom competence
          if (currentVoieFile !== previousVoieFile) {
            deletePromises.push(deleteDoc(docSnapshot.ref));
          }
        }
      });

      await Promise.all(deletePromises);

      if (deletePromises.length > 0) {
        console.log(`Cleaned up ${deletePromises.length} custom competence(s) due to voie changes`);
      }
    } catch (error) {
      console.error('Error cleaning up custom competences:', error);
    }
  };

  const selectCompetenceFromVoie = async (competenceIndex: number) => {
    if (!selectedVoieForCompetence || !selectedCompetenceSlot || !roomId || !persoId) return;

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

    try {
      const customCompRef = doc(db, `cartes/${roomId}/characters/${persoId}/customCompetences`,
        `${selectedCompetenceSlot.voieIndex}-${selectedCompetenceSlot.competenceIndex}`);
      await setDoc(customCompRef, customCompetence);

      const updatedCustomCompetences = customCompetences.filter(
        cc => !(cc.voieIndex === selectedCompetenceSlot.voieIndex && cc.slotIndex === selectedCompetenceSlot.competenceIndex)
      );
      updatedCustomCompetences.push(customCompetence);
      setCustomCompetences(updatedCustomCompetences);

      const voiesCopy = voies.map(voie => ({
        ...voie,
        competences: voie.competences.map(comp => ({ ...comp }))
      }));

      const finalVoies = applyCustomCompetences(voiesCopy, updatedCustomCompetences);

      setVoies(finalVoies);
      setIsCompetenceDialogOpen(false);
      setIsCompetenceDetailModalOpen(false);
      setSelectedCompetenceSlot(null);
      setSelectedVoieForCompetence(null);
      setSelectedCompetenceFromVoie(null);
      toast.success('Compétence remplacée avec succès.');
    } catch (error) {
      console.error('Error saving custom competence:', error);
      toast.error('Erreur lors du remplacement de la compétence.');
    }
  };

  const handleCompetenceClick = (voieIndex: number, competenceIndex: number) => {
    setSelectedCompetenceSlot({ voieIndex, competenceIndex });
    setIsCompetenceDialogOpen(true);
    // Load all voies by default (profils)
    fetchCompetenceReplacementVoies('profiles');
  };

  const fetchCompetenceReplacementVoies = async (type: string, profileName?: string, raceName?: string, prestigeClassName?: string) => {
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

    setCompetenceReplacementVoies(replacementData);
  };

  const handleProfileForCompetenceChange = (newProfile: string, profileLabel: string) => {
    setSelectedProfileForCompetence(newProfile);
    setProfileForCompetenceSearchTerm(profileLabel);
    setIsProfileForCompetenceInputFocused(false);
    if (newProfile) {
      fetchCompetenceReplacementVoies('profiles', newProfile);
    }
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
    if (newRace) {
      fetchCompetenceReplacementVoies('races', undefined, newRace);
    }
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
    if (newPrestige) {
      fetchCompetenceReplacementVoies('prestiges', undefined, undefined, newPrestige);
    }
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

  const resetCompetence = async (voieIndex: number, competenceIndex: number) => {
    if (!roomId || !persoId) return;

    try {
      // Remove from Firestore
      const customCompRef = doc(db, `cartes/${roomId}/characters/${persoId}/customCompetences`,
        `${voieIndex}-${competenceIndex}`);
      await deleteDoc(customCompRef);

      // Update local state
      const updatedCustomCompetences = customCompetences.filter(
        cc => !(cc.voieIndex === voieIndex && cc.slotIndex === competenceIndex)
      );
      setCustomCompetences(updatedCustomCompetences);

      // Reload original voies with updated custom competences
      const characterRef = doc(db, `cartes/${roomId}/characters/${persoId}`);
      const characterData = await getDoc(characterRef);
      if (characterData.exists()) {
        await loadCurrentVoies(characterData.data(), updatedCustomCompetences);
      }
    } catch (error) {
      console.error('Error resetting competence:', error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center min-h-screen">
        <div className="text-xl">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center bg-[var(--bg-dark)] text-[var(--text-primary)] min-h-screen p-4">
      <div className="mb-6">
        <div className="flex justify-between items-center w-full max-w-5xl mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-[var(--accent-brown)]">Gestion des Voies</h1>
            <p className="text-[var(--text-secondary)]">Gérez vos voies de compétences : ajoutez, supprimez ou modifiez vos voies.</p>
          </div>
          {onClose && (
            <Button
              onClick={onClose}
              className="button-secondary"
            >
              ← Retour aux Compétences
            </Button>
          )}
        </div>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6 max-w-5xl w-full">
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
                  {activeVoie.competences.length > 3 && (
                    <li className="text-xs text-[var(--text-secondary)] text-center">
                      +{activeVoie.competences.length - 3} compétences...
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal for voie details */}
      <Dialog open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <DialogContent className="max-w-2xl">
          {selectedVoieIndex !== null && (
            <>
              <DialogTitle className="modal-title mb-4">{voies[selectedVoieIndex].nom}</DialogTitle>

              <div className="mb-4">
                <label className="block font-semibold text-[var(--text-primary)] mb-2">Sélectionner une compétence</label>
                <select
                  className="p-2 border border-[var(--border-color)] rounded w-full bg-[var(--bg-dark)] text-[var(--text-primary)]"
                  value={selectedCompetenceIndex || 0}
                  onChange={(e) => setSelectedCompetenceIndex(parseInt(e.target.value))}
                >
                  {voies[selectedVoieIndex].competences.map((competence, index) => (
                    <option key={index} value={index}>
                      {competence.titre}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCompetenceIndex !== null && (
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

          <Tabs defaultValue="profiles" onValueChange={(type) => {
            // Load all voies when switching tabs
            fetchReplacementVoies(type);
          }}>
            <TabsList>
              <TabsTrigger value="profiles">Profils</TabsTrigger>
              <TabsTrigger value="races">Races</TabsTrigger>
              <TabsTrigger value="prestiges">Prestiges</TabsTrigger>
            </TabsList>

            <TabsContent value="profiles">
              <div className="mb-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-semibold text-[var(--text-primary)]">Filtrer par profil</label>
                  {selectedProfile && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearProfileFilter}
                      className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Effacer filtre
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={profileSearchTerm}
                    onChange={(e) => setProfileSearchTerm(e.target.value)}
                    onFocus={() => setIsProfileInputFocused(true)}
                    onBlur={() => setTimeout(() => setIsProfileInputFocused(false), 200)}
                    placeholder={selectedProfile ? `Filtré par: ${profiles.find(p => p.value === selectedProfile)?.label}` : "Filtrer par profil..."}
                    className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                  />
                  {isProfileInputFocused && (
                    <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                      {filteredProfiles.length > 0 ? (
                        filteredProfiles.map((profile) => (
                          <div
                            key={profile.value}
                            onClick={() => handleProfileChange(profile.value, profile.label)}
                            className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                selectedProfile === profile.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-[var(--text-primary)]">
                              {profile.label} <span className="text-[var(--text-secondary)] text-xs">(5 voies)</span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                          Aucun profil trouvé.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
                        {voie.competences.map((competence, compIndex) => (
                          <li
                            key={compIndex}
                            className="text-sm text-[var(--text-primary)] p-3 rounded cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--accent-brown)] hover:bg-opacity-20 border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all shadow-sm hover:shadow-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReplacement(voie);
                              setSelectedCompetenceIndex(compIndex);
                              setIsDetailsPanelOpen(true);
                            }}
                          >
                            {competence.titre}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="races">
              <div className="mb-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-semibold text-[var(--text-primary)]">Filtrer par race</label>
                  {selectedRace && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearRaceFilter}
                      className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Effacer filtre
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={raceSearchTerm}
                    onChange={(e) => setRaceSearchTerm(e.target.value)}
                    onFocus={() => setIsRaceInputFocused(true)}
                    onBlur={() => setTimeout(() => setIsRaceInputFocused(false), 200)}
                    placeholder={selectedRace ? `Filtré par: ${races.find(r => r.value === selectedRace)?.label}` : "Filtrer par race..."}
                    className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                  />
                  {isRaceInputFocused && (
                    <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                      {filteredRaces.length > 0 ? (
                        filteredRaces.map((race) => (
                          <div
                            key={race.value}
                            onClick={() => handleRaceChange(race.value, race.label)}
                            className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                selectedRace === race.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-[var(--text-primary)]">{race.label}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                          Aucune race trouvée.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
                        {voie.competences.map((competence, compIndex) => (
                          <li
                            key={compIndex}
                            className="text-sm text-[var(--text-primary)] p-3 rounded cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--accent-brown)] hover:bg-opacity-20 border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all shadow-sm hover:shadow-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReplacement(voie);
                              setSelectedCompetenceIndex(compIndex);
                              setIsDetailsPanelOpen(true);
                            }}
                          >
                            {competence.titre}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="prestiges">
              <div className="mb-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-semibold text-[var(--text-primary)]">Filtrer par classe de prestige</label>
                  {selectedPrestige && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearPrestigeFilter}
                      className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Effacer filtre
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={prestigeSearchTerm}
                    onChange={(e) => setPrestigeSearchTerm(e.target.value)}
                    onFocus={() => setIsPrestigeInputFocused(true)}
                    onBlur={() => setTimeout(() => setIsPrestigeInputFocused(false), 200)}
                    placeholder={selectedPrestige ? `Filtré par: ${prestigeClasses.find(p => p.value === selectedPrestige)?.label}` : "Filtrer par classe..."}
                    className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                  />
                  {isPrestigeInputFocused && (
                    <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                      {filteredPrestigeClasses.length > 0 ? (
                        filteredPrestigeClasses.map((prestige) => (
                          <div
                            key={prestige.value}
                            onClick={() => handlePrestigeChange(prestige.value, prestige.label)}
                            className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                selectedPrestige === prestige.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-[var(--text-primary)]">
                              {prestige.label} <span className="text-[var(--text-secondary)] text-xs">({prestige.count} voies)</span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                          Aucun prestige trouvé.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
                        {voie.competences.map((competence, compIndex) => (
                          <li
                            key={compIndex}
                            className="text-sm text-[var(--text-primary)] p-3 rounded cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--accent-brown)] hover:bg-opacity-20 border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all shadow-sm hover:shadow-md"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReplacement(voie);
                              setSelectedCompetenceIndex(compIndex);
                              setIsDetailsPanelOpen(true);
                            }}
                          >
                            {competence.titre}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

        </DialogContent>
      </Dialog>

      {/* Modal for replacement voie details */}
      <Dialog open={isDetailsPanelOpen} onOpenChange={setIsDetailsPanelOpen}>
        <DialogContent className="max-w-2xl">
          {selectedReplacement && (
            <>
              <DialogTitle className="modal-title mb-4">{selectedReplacement.nom}</DialogTitle>

              <div className="mb-4">
                <label className="block font-semibold text-[var(--text-primary)] mb-2">Sélectionner une compétence</label>
                <select
                  className="p-2 border border-[var(--border-color)] rounded w-full bg-[var(--bg-dark)] text-[var(--text-primary)]"
                  value={selectedCompetenceIndex || 0}
                  onChange={(e) => setSelectedCompetenceIndex(parseInt(e.target.value))}
                >
                  {selectedReplacement.competences.map((competence, index) => (
                    <option key={index} value={index}>
                      {competence.titre}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCompetenceIndex !== null && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">
                    {selectedReplacement.competences[selectedCompetenceIndex].titre}
                  </h3>
                  <div
                    className="text-sm text-[var(--text-secondary)] p-4 bg-[var(--bg-card)] rounded border border-[var(--border-color)] whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: selectedReplacement.competences[selectedCompetenceIndex].description
                    }}
                  />
                </div>
              )}

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
          <DialogTitle className="modal-title mb-4">
            Choisir une compétence de remplacement
            {selectedCompetenceSlot && (
              <span className="text-sm text-[var(--text-secondary)] block">
                Compétence n°{selectedCompetenceSlot.competenceIndex + 1} de la voie "{voies[selectedCompetenceSlot.voieIndex]?.nom}"
              </span>
            )}
          </DialogTitle>

          <Tabs defaultValue="profiles" onValueChange={(type) => {
            fetchCompetenceReplacementVoies(type);
          }}>
            <TabsList>
              <TabsTrigger value="profiles">Profils</TabsTrigger>
              <TabsTrigger value="races">Races</TabsTrigger>
              <TabsTrigger value="prestiges">Prestiges</TabsTrigger>
            </TabsList>

            <TabsContent value="profiles">
              <div className="mb-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-semibold text-[var(--text-primary)]">Filtrer par profil</label>
                  {selectedProfileForCompetence && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearProfileForCompetenceFilter}
                      className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Effacer filtre
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={profileForCompetenceSearchTerm}
                    onChange={(e) => setProfileForCompetenceSearchTerm(e.target.value)}
                    onFocus={() => setIsProfileForCompetenceInputFocused(true)}
                    onBlur={() => setTimeout(() => setIsProfileForCompetenceInputFocused(false), 200)}
                    placeholder={selectedProfileForCompetence ? `Filtré par: ${profiles.find(p => p.value === selectedProfileForCompetence)?.label}` : "Filtrer par profil..."}
                    className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                  />
                  {isProfileForCompetenceInputFocused && (
                    <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                      {filteredProfilesForCompetence.length > 0 ? (
                        filteredProfilesForCompetence.map((profile) => (
                          <div
                            key={profile.value}
                            onClick={() => handleProfileForCompetenceChange(profile.value, profile.label)}
                            className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                selectedProfileForCompetence === profile.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-[var(--text-primary)]">
                              {profile.label} <span className="text-[var(--text-secondary)] text-xs">(5 voies)</span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                          Aucun profil trouvé.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {competenceReplacementVoies.map((voie, index) => (
                  <Card
                    key={index}
                    className="card transition-colors"
                  >
                    <CardHeader>
                      <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {voie.competences.map((competence, compIndex) => (
                          <li
                            key={compIndex}
                            className="text-sm text-[var(--text-primary)] p-3 rounded cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--accent-brown)] hover:bg-opacity-20 border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all shadow-sm hover:shadow-md"
                            onClick={() => {
                              setSelectedVoieForCompetence(voie);
                              setSelectedCompetenceFromVoie(compIndex);
                              setIsCompetenceDetailModalOpen(true);
                            }}
                          >
                            {competence.titre}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="races">
              <div className="mb-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-semibold text-[var(--text-primary)]">Filtrer par race</label>
                  {selectedRaceForCompetence && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearRaceForCompetenceFilter}
                      className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Effacer filtre
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={raceForCompetenceSearchTerm}
                    onChange={(e) => setRaceForCompetenceSearchTerm(e.target.value)}
                    onFocus={() => setIsRaceForCompetenceInputFocused(true)}
                    onBlur={() => setTimeout(() => setIsRaceForCompetenceInputFocused(false), 200)}
                    placeholder={selectedRaceForCompetence ? `Filtré par: ${races.find(r => r.value === selectedRaceForCompetence)?.label}` : "Filtrer par race..."}
                    className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                  />
                  {isRaceForCompetenceInputFocused && (
                    <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                      {filteredRacesForCompetence.length > 0 ? (
                        filteredRacesForCompetence.map((race) => (
                          <div
                            key={race.value}
                            onClick={() => handleRaceForCompetenceChange(race.value, race.label)}
                            className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                selectedRaceForCompetence === race.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-[var(--text-primary)]">{race.label}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                          Aucune race trouvée.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {competenceReplacementVoies.map((voie, index) => (
                  <Card
                    key={index}
                    className="card transition-colors"
                  >
                    <CardHeader>
                      <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {voie.competences.map((competence, compIndex) => (
                          <li
                            key={compIndex}
                            className="text-sm text-[var(--text-primary)] p-3 rounded cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--accent-brown)] hover:bg-opacity-20 border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all shadow-sm hover:shadow-md"
                            onClick={() => {
                              setSelectedVoieForCompetence(voie);
                              setSelectedCompetenceFromVoie(compIndex);
                              setIsCompetenceDetailModalOpen(true);
                            }}
                          >
                            {competence.titre}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="prestiges">
              <div className="mb-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <label className="block font-semibold text-[var(--text-primary)]">Filtrer par classe de prestige</label>
                  {selectedPrestigeForCompetence && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearPrestigeForCompetenceFilter}
                      className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Effacer filtre
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={prestigeForCompetenceSearchTerm}
                    onChange={(e) => setPrestigeForCompetenceSearchTerm(e.target.value)}
                    onFocus={() => setIsPrestigeForCompetenceInputFocused(true)}
                    onBlur={() => setTimeout(() => setIsPrestigeForCompetenceInputFocused(false), 200)}
                    placeholder={selectedPrestigeForCompetence ? `Filtré par: ${prestigeClasses.find(p => p.value === selectedPrestigeForCompetence)?.label}` : "Filtrer par classe..."}
                    className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                  />
                  {isPrestigeForCompetenceInputFocused && (
                    <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                      {filteredPrestigeClassesForCompetence.length > 0 ? (
                        filteredPrestigeClassesForCompetence.map((prestige) => (
                          <div
                            key={prestige.value}
                            onClick={() => handlePrestigeForCompetenceChange(prestige.value, prestige.label)}
                            className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                selectedPrestigeForCompetence === prestige.value ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="text-[var(--text-primary)]">
                              {prestige.label} <span className="text-[var(--text-secondary)] text-xs">({prestige.count} voies)</span>
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                          Aucun prestige trouvé.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {competenceReplacementVoies.map((voie, index) => (
                  <Card
                    key={index}
                    className="card transition-colors"
                  >
                    <CardHeader>
                      <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {voie.competences.map((competence, compIndex) => (
                          <li
                            key={compIndex}
                            className="text-sm text-[var(--text-primary)] p-3 rounded cursor-pointer bg-[var(--bg-card)] hover:bg-[var(--accent-brown)] hover:bg-opacity-20 border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-all shadow-sm hover:shadow-md"
                            onClick={() => {
                              setSelectedVoieForCompetence(voie);
                              setSelectedCompetenceFromVoie(compIndex);
                              setIsCompetenceDetailModalOpen(true);
                            }}
                          >
                            {competence.titre}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

        </DialogContent>
      </Dialog>

      {/* Modal for competence details */}
      <Dialog open={isCompetenceDetailModalOpen} onOpenChange={setIsCompetenceDetailModalOpen}>
        <DialogContent className="max-w-2xl">
          {selectedVoieForCompetence && selectedCompetenceFromVoie !== null && (
            <>
              <div className="mb-4">
                <DialogTitle className="modal-title mb-2">
                  {selectedVoieForCompetence.competences[selectedCompetenceFromVoie].titre}
                </DialogTitle>
                <p className="text-sm text-[var(--text-secondary)]">
                  {selectedVoieForCompetence.nom} - Rang {selectedCompetenceFromVoie + 1}
                </p>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">Description</h3>
                <div
                  className="text-sm text-[var(--text-secondary)] p-4 bg-[var(--bg-card)] rounded border border-[var(--border-color)] whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: selectedVoieForCompetence.competences[selectedCompetenceFromVoie].description
                  }}
                />
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">Type</h3>
                <p className="text-sm text-[var(--text-secondary)] p-2 bg-[var(--bg-card)] rounded border border-[var(--border-color)]">
                  {selectedVoieForCompetence.competences[selectedCompetenceFromVoie].type}
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsCompetenceDetailModalOpen(false);
                    setSelectedCompetenceFromVoie(null);
                  }}
                  className="button-cancel"
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => selectCompetenceFromVoie(selectedCompetenceFromVoie)}
                  className="button-primary"
                >
                  Utiliser cette compétence
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Save button */}
      <div className="flex justify-center mt-8">
        <Button onClick={saveCharacterData} className="button-primary w-48 h-12 text-lg">
          Sauvegarder et Continuer
        </Button>
      </div>
    </div>
  );
}
