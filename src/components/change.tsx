'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { db, auth, onAuthStateChanged, getDoc, setDoc, doc, collection, getDocs, deleteDoc } from '@/lib/firebase';
import { X, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
}

export default function CharacterProfile({ onClose }: CharacterProfileProps = {}) {
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
  const [selectedProfile, setSelectedProfile] = useState<string>('Samourai');
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [persoId, setPersoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [customCompetences, setCustomCompetences] = useState<CustomCompetence[]>([]);
  const [isCompetenceDialogOpen, setIsCompetenceDialogOpen] = useState(false);
  const [selectedCompetenceSlot, setSelectedCompetenceSlot] = useState<{voieIndex: number, competenceIndex: number} | null>(null);
  const [allAvailableCompetences, setAllAvailableCompetences] = useState<{category: string, voies: {voie: string, competences: Competence[]}[]}[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchCharacterData = async () => {
      const user = auth.currentUser;
      if (user) {
        const userRef = doc(db, 'users', user.uid);
        const userData = await getDoc(userRef);

        if (userData.exists()) {
          const { room_id, persoId } = userData.data();
          setRoomId(room_id);
          setPersoId(persoId);

          const characterRef = doc(db, `cartes/${room_id}/characters/${persoId}`);
          const characterData = await getDoc(characterRef);

          if (characterData.exists()) {
            const data = characterData.data();
            setRace(data.Race);
            setProfile(data.Profile);
            
            // Load current voies from character data
            await loadCurrentVoies(data);
            
            // Load custom competences
            await loadCustomCompetences(room_id, persoId);
          }
        }
      }
      setLoading(false);
    };

    onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchCharacterData();
      } else {
        setLoading(false);
      }
    });
  }, []);

  const loadCustomCompetences = async (roomId: string, persoId: string) => {
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
    } catch (error) {
      console.error('Error loading custom competences:', error);
    }
  };

  const applyCustomCompetences = (voies: Voie[]) => {
    const updatedVoies = [...voies];
    
    customCompetences.forEach((customComp) => {
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

  const loadCurrentVoies = async (characterData: Record<string, string | number>) => {
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
    const voiesWithCustomCompetences = applyCustomCompetences(loadedVoies);
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

  const handleVoieClick = (index: number) => {
    setSelectedVoieIndex(index);
    setSelectedCompetenceIndex(0);
    setIsPanelOpen(true);
  };

  const handleReplacementSelect = (voie: Voie) => {
    setSelectedReplacement(voie);
    setSelectedCompetenceIndex(0);
    setIsDetailsPanelOpen(true);
  };

  const fetchReplacementVoies = async (type: string) => {
    const replacementData: Voie[] = [];
    let items: string[] = [];

    if (type === 'profiles') {
      for (let i = 1; i <= 5; i++) {
        const voie = await loadVoieFromFile(`${selectedProfile}${i}.json`);
        if (voie) replacementData.push(voie);
      }
    } else if (type === 'races') {
      items = ['Humain', 'Elfe', 'Nain', 'Orc', 'Halfelin'];
      for (const raceName of items) {
        const voie = await loadVoieFromFile(`${raceName}.json`);
        if (voie) replacementData.push(voie);
      }
    } else {
      items = ['Prestige1', 'Prestige2', 'Prestige3'];
      for (const prestigeName of items) {
        const voie = await loadVoieFromFile(`${prestigeName}.json`);
        if (voie) replacementData.push(voie);
      }
    }

    setReplacementVoies(replacementData);
  };

  const openDialog = () => {
    setIsPanelOpen(false);
    setIsDialogOpen(true);
    fetchReplacementVoies('profiles');
  };

  const handleProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedProfile(e.target.value);
    fetchReplacementVoies('profiles');
  };

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
    const voiesData = voies.reduce((acc, voie, index) => {
      acc[`Voie${index + 1}`] = voie.fichier;
      acc[`v${index + 1}`] = 0;
      return acc;
    }, {} as Record<string, string | number>);

    // Clear any remaining voie slots
    for (let i = voies.length + 1; i <= 10; i++) {
      voiesData[`Voie${i}`] = '';
      voiesData[`v${i}`] = 0;
    }

    await setDoc(characterRef, voiesData, { merge: true });
    toast.success('Les données ont été sauvegardées avec succès.');
    router.push(`/${roomId}/map`);
  };

  const loadAllAvailableCompetences = async () => {
    const groupedCompetences: {category: string, voies: {voie: string, competences: Competence[]}[]}[] = [];
    
    // Load from all profile voies
    const profiles = ['Samourai', 'Guerrier', 'Barde', 'Moine', 'Pretre', 'Rodeur', 'Voleur', 'Psionique', 'Necromencien'];
    for (const profile of profiles) {
      const profileVoies: {voie: string, competences: Competence[]}[] = [];
      for (let i = 1; i <= 5; i++) {
        const voie = await loadVoieFromFile(`${profile}${i}.json`);
        if (voie) {
          profileVoies.push({
            voie: `${profile} ${i}`,
            competences: voie.competences
          });
        }
      }
      if (profileVoies.length > 0) {
        groupedCompetences.push({
          category: profile,
          voies: profileVoies
        });
      }
    }
    
    // Load from race voies
    const races = ['Humain', 'Elfe', 'Nain', 'Halfelin', 'Orque', 'Wolfer', 'Ogre', 'Minotaure'];
    const raceVoies: {voie: string, competences: Competence[]}[] = [];
    for (const race of races) {
      const voie = await loadVoieFromFile(`${race}.json`);
      if (voie) {
        raceVoies.push({
          voie: race,
          competences: voie.competences
        });
      }
    }
    if (raceVoies.length > 0) {
      groupedCompetences.push({
        category: 'Races',
        voies: raceVoies
      });
    }
    
    // Load from prestige voies - organized by class
    const prestigeClasses = [
      { name: 'Voleur', count: 3 },
      { name: 'Rodeur', count: 3 },
      { name: 'Pretre', count: 3 },
      { name: 'Moine', count: 3 },
      { name: 'Guerrier', count: 2 },
      { name: 'Forgesort', count: 3 },
      { name: 'Ensorceleur', count: 2 },
      { name: 'Druide', count: 2 },
      { name: 'Chevalier', count: 3 },
      { name: 'Barde', count: 3 },
      { name: 'Barbare', count: 2 },
      { name: 'Arquebusier', count: 3 },
      { name: 'Necromencien', count: 2 }
    ];
    
    for (const prestigeClass of prestigeClasses) {
      const prestigeVoies: {voie: string, competences: Competence[]}[] = [];
      for (let i = 1; i <= prestigeClass.count; i++) {
        const voie = await loadVoieFromFile(`prestige_${prestigeClass.name.toLowerCase()}${i}.json`);
        if (voie) {
          prestigeVoies.push({
            voie: `${prestigeClass.name} ${i}`,
            competences: voie.competences
          });
        }
      }
      if (prestigeVoies.length > 0) {
        groupedCompetences.push({
          category: `Prestige ${prestigeClass.name}`,
          voies: prestigeVoies
        });
      }
    }
    
    setAllAvailableCompetences(groupedCompetences);
  };

  const handleCompetenceClick = (voieIndex: number, competenceIndex: number) => {
    setSelectedCompetenceSlot({ voieIndex, competenceIndex });
    setIsCompetenceDialogOpen(true);
    if (allAvailableCompetences.length === 0) {
      loadAllAvailableCompetences();
    }
  };

  const replaceCompetence = async (sourceVoie: string, sourceRank: number, competence: Competence) => {
    if (!selectedCompetenceSlot || !roomId || !persoId) return;

    const customCompetence: CustomCompetence = {
      slotIndex: selectedCompetenceSlot.competenceIndex,
      voieIndex: selectedCompetenceSlot.voieIndex,
      sourceVoie,
      sourceRank,
      competenceName: competence.titre,
      competenceDescription: competence.description,
      competenceType: competence.type,
    };

    try {
      // Save to Firestore
      const customCompRef = doc(db, `cartes/${roomId}/characters/${persoId}/customCompetences`, 
        `${selectedCompetenceSlot.voieIndex}-${selectedCompetenceSlot.competenceIndex}`);
      await setDoc(customCompRef, customCompetence);

      // Update local state
      const updatedCustomCompetences = customCompetences.filter(
        cc => !(cc.voieIndex === selectedCompetenceSlot.voieIndex && cc.slotIndex === selectedCompetenceSlot.competenceIndex)
      );
      updatedCustomCompetences.push(customCompetence);
      setCustomCompetences(updatedCustomCompetences);

      // Apply custom competences to current voies - create a fresh copy
      const voiesCopy = voies.map(voie => ({
        ...voie,
        competences: voie.competences.map(comp => ({ ...comp }))
      }));

      // Apply the new custom competence immediately
      if (voiesCopy[selectedCompetenceSlot.voieIndex] && 
          voiesCopy[selectedCompetenceSlot.voieIndex].competences[selectedCompetenceSlot.competenceIndex]) {
        voiesCopy[selectedCompetenceSlot.voieIndex].competences[selectedCompetenceSlot.competenceIndex] = {
          titre: customCompetence.competenceName,
          description: customCompetence.competenceDescription,
          type: customCompetence.competenceType,
          isCustom: true,
          originalVoie: customCompetence.sourceVoie,
          originalRank: customCompetence.sourceRank,
        };
      }

      // Apply all other custom competences
      updatedCustomCompetences.forEach((customComp) => {
        if (voiesCopy[customComp.voieIndex] && voiesCopy[customComp.voieIndex].competences[customComp.slotIndex]) {
          voiesCopy[customComp.voieIndex].competences[customComp.slotIndex] = {
            titre: customComp.competenceName,
            description: customComp.competenceDescription,
            type: customComp.competenceType,
            isCustom: true,
            originalVoie: customComp.sourceVoie,
            originalRank: customComp.sourceRank,
          };
        }
      });

      setVoies(voiesCopy);
      setIsCompetenceDialogOpen(false);
      setSelectedCompetenceSlot(null);
    } catch (error) {
      console.error('Error saving custom competence:', error);
    }
  };

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

      // Reload original voies
      const characterRef = doc(db, `cartes/${roomId}/characters/${persoId}`);
      const characterData = await getDoc(characterRef);
      if (characterData.exists()) {
        await loadCurrentVoies(characterData.data());
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6 max-w-5xl w-full">
        {voies.map((voie, index) => (
          <Card key={index} className="card relative">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-[var(--accent-brown)]">{voie.nom}</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeVoie(index);
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
                    className={`group flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                      competence.isCustom 
                        ? 'border-[var(--accent-brown)] bg-[var(--bg-card)]' 
                        : 'border-[var(--border-color)] hover:border-[var(--accent-brown)]'
                    }`}
                    onClick={() => handleCompetenceClick(index, compIndex)}
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
                          handleVoieClick(index);
                        }}
                        title="Voir détails de la voie"
                      >
                        👁️
                      </Button>
                      {competence.isCustom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="button-cancel p-1 h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            resetCompetence(index, compIndex);
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

      {/* Side panel for voie details */}
      {isPanelOpen && selectedVoieIndex !== null && (
        <div className="fixed top-0 right-0 bg-[var(--bg-dark)] border-l border-[var(--border-color)] shadow-lg p-6 w-80 h-full z-20 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-[var(--accent-brown)]">{voies[selectedVoieIndex].nom}</h2>
            <Button variant="ghost" onClick={() => setIsPanelOpen(false)} className="button-cancel">
              <X className="w-6 h-6" />
            </Button>
          </div>
          
          <select
            className="mb-4 p-2 border border-[var(--border-color)] rounded w-full bg-[var(--bg-dark)] text-[var(--text-primary)]"
            value={selectedCompetenceIndex || 0}
            onChange={(e) => setSelectedCompetenceIndex(parseInt(e.target.value))}
          >
            {voies[selectedVoieIndex].competences.map((competence, index) => (
              <option key={index} value={index}>
                {competence.titre}
              </option>
            ))}
          </select>
          
          {selectedCompetenceIndex !== null && (
            <div className="mb-4">
              <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">
                {voies[selectedVoieIndex].competences[selectedCompetenceIndex].titre}
              </h3>
              <div 
                className="text-sm text-[var(--text-secondary)]"
                dangerouslySetInnerHTML={{ 
                  __html: voies[selectedVoieIndex].competences[selectedCompetenceIndex].description 
                }}
              />
            </div>
          )}
          
          <Button onClick={openDialog} className="button-primary w-full">
            Remplacer cette voie
          </Button>
        </div>
      )}

      {/* Dialog for selecting replacement voies */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className=" p-6 rounded-lg fixed left-0 right-0 m-auto w-full h-[80vh] max-w-6xl max-h-screen overflow-y-auto z-50">
          <div className="flex justify-between items-center mb-4">
            <DialogTitle className="modal-title">
              {selectedVoieIndex !== null ? 'Choisir une nouvelle voie' : 'Ajouter une voie'}
            </DialogTitle>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)} className="button-cancel">
              <X className="w-6 h-6" />
            </Button>
          </div>
          
          <Tabs defaultValue="profiles" onValueChange={(type) => fetchReplacementVoies(type)}>
            <TabsList>
              <TabsTrigger value="profiles">Profils</TabsTrigger>
              <TabsTrigger value="races">Races</TabsTrigger>
              <TabsTrigger value="prestiges">Prestiges</TabsTrigger>
            </TabsList>
            
            <TabsContent value="profiles">
              <div className="mb-4">
                <label className="block font-semibold mb-2 text-[var(--text-primary)]">Sélectionner un profil</label>
                <select
                  value={selectedProfile}
                  onChange={handleProfileChange}
                  className="p-2 border border-[var(--border-color)] rounded w-full bg-[var(--bg-dark)] text-[var(--text-primary)]"
                >
                  <option value="Samourai">Samourai</option>
                  <option value="Guerrier">Guerrier</option>
                  <option value="Barde">Barde</option>
                  <option value="Moine">Moine</option>
                  <option value="Pretre">Prêtre</option>
                  <option value="Rodeur">Rôdeur</option>
                </select>
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
                      <ul className="list-disc pl-5 space-y-1">
                        {voie.competences.map((competence, compIndex) => (
                          <li key={compIndex} className="text-sm text-[var(--text-secondary)]">{competence.titre}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
            
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
                      <ul className="list-disc pl-5 space-y-1">
                        {voie.competences.map((competence, compIndex) => (
                          <li key={compIndex} className="text-sm text-[var(--text-secondary)]">{competence.titre}</li>
                        ))}
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
                      <ul className="list-disc pl-5 space-y-1">
                        {voie.competences.map((competence, compIndex) => (
                          <li key={compIndex} className="text-sm text-[var(--text-secondary)]">{competence.titre}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {/* Details panel for selected replacement */}
          {isDetailsPanelOpen && selectedReplacement && (
            <div className="fixed top-0 right-0 bg-[var(--bg-dark)] border-l border-[var(--border-color)] shadow-lg p-6 w-80 h-full z-50 overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-[var(--accent-brown)]">{selectedReplacement.nom}</h2>
                <Button variant="ghost" onClick={() => setIsDetailsPanelOpen(false)} className="button-cancel">
                  <X className="w-6 h-6" />
                </Button>
              </div>
              
              <select
                className="mb-4 p-2 border border-[var(--border-color)] rounded w-full bg-[var(--bg-dark)] text-[var(--text-primary)]"
                value={selectedCompetenceIndex || 0}
                onChange={(e) => setSelectedCompetenceIndex(parseInt(e.target.value))}
              >
                {selectedReplacement.competences.map((competence, index) => (
                  <option key={index} value={index}>
                    {competence.titre}
                  </option>
                ))}
              </select>
              
              {selectedCompetenceIndex !== null && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">
                    {selectedReplacement.competences[selectedCompetenceIndex].titre}
                  </h3>
                  <div 
                    className="text-sm text-[var(--text-secondary)]"
                    dangerouslySetInnerHTML={{ 
                      __html: selectedReplacement.competences[selectedCompetenceIndex].description 
                    }}
                  />
                </div>
              )}
              
              <Button 
                onClick={selectedVoieIndex !== null ? applyReplacement : addVoieFromDialog} 
                className="button-primary w-full"
              >
                {selectedVoieIndex !== null ? 'Remplacer' : 'Ajouter'}
              </Button>
            </div>
          )}
        </DialogContent>
              </Dialog>

        {/* Competence Selection Dialog */}
        <Dialog open={isCompetenceDialogOpen} onOpenChange={setIsCompetenceDialogOpen}>
          <DialogContent className="p-6 rounded-lg fixed left-0 right-0 m-auto w-full h-[90vh] max-w-7xl max-h-screen overflow-hidden z-50">
            <div className="flex justify-between items-center mb-4">
              <DialogTitle className="modal-title">
                Choisir une nouvelle compétence
                {selectedCompetenceSlot && (
                  <span className="text-sm text-[var(--text-secondary)] block">
                    Pour remplacer la compétence n°{selectedCompetenceSlot.competenceIndex + 1} de la voie {selectedCompetenceSlot.voieIndex + 1}
                  </span>
                )}
              </DialogTitle>
              <Button variant="ghost" onClick={() => setIsCompetenceDialogOpen(false)} className="button-cancel">
                <X className="w-6 h-6" />
              </Button>
            </div>
            
            {/* Search Bar */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="Rechercher une compétence..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)]"
              />
            </div>
            
            {/* Competences Grid */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-8">
                {/* PROFILS SECTION */}
                {(() => {
                  const profileGroups = allAvailableCompetences.filter(group => 
                    !group.category.startsWith('Prestige') && group.category !== 'Races'
                  );
                  
                  if (profileGroups.length === 0) return null;
                  
                  return (
                    <div className="space-y-4">
                      <h1 className="text-2xl font-bold text-[var(--accent-brown)] border-b-2 border-[var(--accent-brown)] pb-2 mb-4">
                        🗡️ PROFILS
                      </h1>
                      
                      <div className="space-y-6">
                        {profileGroups
                          .filter((categoryGroup) => {
                            if (!searchTerm) return true;
                            return categoryGroup.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                   categoryGroup.voies.some(voie => 
                                     voie.voie.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                     voie.competences.some((comp: Competence) => 
                                       comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                       comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                       comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                     )
                                   );
                          })
                          .map((categoryGroup, categoryIndex) => (
                            <div key={categoryIndex} className="space-y-3">
                              <h2 className="text-lg font-semibold text-[var(--accent-brown)] pl-4 border-l-4 border-[var(--accent-brown)]">
                                {categoryGroup.category}
                              </h2>
                              
                              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                                {categoryGroup.voies
                                  .filter((voie) => {
                                    if (!searchTerm) return true;
                                    return voie.voie.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                           voie.competences.some((comp: Competence) => 
                                             comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                             comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                             comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                           );
                                  })
                                  .map((voie, voieIndex) => {
                                    const filteredCompetences = searchTerm 
                                      ? voie.competences.filter((comp: Competence) => 
                                          comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                        )
                                      : voie.competences;
                                    
                                    if (searchTerm && filteredCompetences.length === 0) return null;
                                    
                                    return (
                                      <Card key={voieIndex} className="card h-fit border-l-2 border-l-blue-500">
                                        <CardHeader className="pb-2">
                                          <CardTitle className="text-[var(--accent-brown)] text-sm">
                                            {voie.voie}
                                          </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                          {filteredCompetences.map((competence: Competence, compIndex: number) => {
                                            const originalIndex = voie.competences.indexOf(competence);
                                            const filename = `${categoryGroup.category}${voie.voie.split(' ')[1]}.json`;
                                            
                                            return (
                                              <div
                                                key={compIndex}
                                                className="p-2 border border-[var(--border-color)] rounded cursor-pointer hover:border-[var(--accent-brown)] hover:bg-[var(--bg-card)] transition-all duration-200"
                                                onClick={() => replaceCompetence(filename, originalIndex + 1, competence)}
                                              >
                                                <div className="font-semibold text-[var(--text-primary)] text-xs mb-1">
                                                  Rang {originalIndex + 1}: {competence.titre}
                                                </div>
                                                <div className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-1">
                                                  {competence.description.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').substring(0, 60)}...
                                                </div>
                                                <div className="text-xs text-[var(--accent-brown)]">
                                                  {competence.type}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </CardContent>
                                      </Card>
                                    );
                                  })
                                  .filter(Boolean)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })()}

                {/* RACES SECTION */}
                {(() => {
                  const raceGroups = allAvailableCompetences.filter(group => group.category === 'Races');
                  
                  if (raceGroups.length === 0) return null;
                  
                  return (
                    <div className="space-y-4">
                      <h1 className="text-2xl font-bold text-[var(--accent-brown)] border-b-2 border-[var(--accent-brown)] pb-2 mb-4">
                        🧙‍♂️ RACES
                      </h1>
                      
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {raceGroups[0].voies
                          .filter((voie) => {
                            if (!searchTerm) return true;
                            return voie.voie.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                   voie.competences.some((comp: Competence) => 
                                     comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                     comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                     comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                   );
                          })
                          .map((voie, voieIndex) => {
                            const filteredCompetences = searchTerm 
                              ? voie.competences.filter((comp: Competence) => 
                                  comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                  comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                )
                              : voie.competences;
                            
                            if (searchTerm && filteredCompetences.length === 0) return null;
                            
                            return (
                              <Card key={voieIndex} className="card h-fit border-l-2 border-l-green-500">
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-[var(--accent-brown)] text-sm">
                                    {voie.voie}
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                  {filteredCompetences.map((competence: Competence, compIndex: number) => {
                                    const originalIndex = voie.competences.indexOf(competence);
                                    const filename = `${voie.voie}.json`;
                                    
                                    return (
                                      <div
                                        key={compIndex}
                                        className="p-2 border border-[var(--border-color)] rounded cursor-pointer hover:border-[var(--accent-brown)] hover:bg-[var(--bg-card)] transition-all duration-200"
                                        onClick={() => replaceCompetence(filename, originalIndex + 1, competence)}
                                      >
                                        <div className="font-semibold text-[var(--text-primary)] text-xs mb-1">
                                          Rang {originalIndex + 1}: {competence.titre}
                                        </div>
                                        <div className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-1">
                                          {competence.description.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').substring(0, 60)}...
                                        </div>
                                        <div className="text-xs text-[var(--accent-brown)]">
                                          {competence.type}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </CardContent>
                              </Card>
                            );
                          })
                          .filter(Boolean)}
                      </div>
                    </div>
                  );
                })()}

                {/* PRESTIGES SECTION */}
                {(() => {
                  const prestigeGroups = allAvailableCompetences.filter(group => group.category.startsWith('Prestige'));
                  
                  if (prestigeGroups.length === 0) return null;
                  
                  return (
                    <div className="space-y-4">
                      <h1 className="text-2xl font-bold text-[var(--accent-brown)] border-b-2 border-[var(--accent-brown)] pb-2 mb-4">
                        🏆 PRESTIGES
                      </h1>
                      
                      <div className="space-y-6">
                        {prestigeGroups
                          .filter((categoryGroup) => {
                            if (!searchTerm) return true;
                            return categoryGroup.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                   categoryGroup.voies.some(voie => 
                                     voie.voie.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                     voie.competences.some((comp: Competence) => 
                                       comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                       comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                       comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                     )
                                   );
                          })
                          .map((categoryGroup, categoryIndex) => (
                            <div key={categoryIndex} className="space-y-3">
                              <h2 className="text-lg font-semibold text-[var(--accent-brown)] pl-4 border-l-4 border-[var(--accent-brown)]">
                                {categoryGroup.category}
                              </h2>
                              
                              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                                {categoryGroup.voies
                                  .filter((voie) => {
                                    if (!searchTerm) return true;
                                    return voie.voie.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                           voie.competences.some((comp: Competence) => 
                                             comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                             comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                             comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                           );
                                  })
                                  .map((voie, voieIndex) => {
                                    const filteredCompetences = searchTerm 
                                      ? voie.competences.filter((comp: Competence) => 
                                          comp.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          comp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          comp.type.toLowerCase().includes(searchTerm.toLowerCase())
                                        )
                                      : voie.competences;
                                    
                                    if (searchTerm && filteredCompetences.length === 0) return null;
                                    
                                    return (
                                      <Card key={voieIndex} className="card h-fit border-l-2 border-l-purple-500">
                                        <CardHeader className="pb-2">
                                          <CardTitle className="text-[var(--accent-brown)] text-sm">
                                            {voie.voie}
                                          </CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-2">
                                          {filteredCompetences.map((competence: Competence, compIndex: number) => {
                                            const originalIndex = voie.competences.indexOf(competence);
                                            const filename = `prestige_${categoryGroup.category.replace('Prestige ', '').toLowerCase()}${voie.voie.split(' ')[1]}.json`;
                                            
                                            return (
                                              <div
                                                key={compIndex}
                                                className="p-2 border border-[var(--border-color)] rounded cursor-pointer hover:border-[var(--accent-brown)] hover:bg-[var(--bg-card)] transition-all duration-200"
                                                onClick={() => replaceCompetence(filename, originalIndex + 1, competence)}
                                              >
                                                <div className="font-semibold text-[var(--text-primary)] text-xs mb-1">
                                                  Rang {originalIndex + 1}: {competence.titre}
                                                </div>
                                                <div className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-1">
                                                  {competence.description.replace(/<br>/g, ' ').replace(/<[^>]*>/g, '').substring(0, 60)}...
                                                </div>
                                                <div className="text-xs text-[var(--accent-brown)]">
                                                  {competence.type}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </CardContent>
                                      </Card>
                                    );
                                  })
                                  .filter(Boolean)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
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
