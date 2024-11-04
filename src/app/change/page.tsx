'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { db, auth, onAuthStateChanged, getDoc, setDoc, doc } from '@/lib/firebase'; // Added setDoc
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';



type Competence = {
  titre: string;
  description: string;
  type: string;
};

type Voie = {
  nom: string;
  competences: Competence[];
  fichier: string; // Added to keep track of the JSON file
};

export default function CharacterProfile() {
    const router = useRouter();
  const [profile, setProfile] = useState<string | null>(null);
  const [race, setRace] = useState<string | null>(null);
  const [voies, setVoies] = useState<Voie[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedVoieIndex, setSelectedVoieIndex] = useState<number | null>(null);
  const [selectedCompetenceIndex, setSelectedCompetenceIndex] = useState<number | null>(null);
  const [replacementVoies, setReplacementVoies] = useState<Voie[]>([]);
  const [selectedReplacement, setSelectedReplacement] = useState<Voie | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string>('Samourai');
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null); // Store room ID
  const [persoId, setPersoId] = useState<string | null>(null); // Store perso ID



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
            const { Race, Profile } = characterData.data();
            setRace(Race);
            setProfile(Profile);
          }
        }
      }
    };

    onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchCharacterData();
      }
    });
  }, []);

  useEffect(() => {
    const fetchVoies = async () => {
      const loadedVoies: Voie[] = [];

      if (profile) {
        for (let i = 1; i <= 5; i++) {
          const response = await fetch(`/tabs/${profile}${i}.json`);
          if (response.ok) {
            const data = await response.json();
            const competences = Object.keys(data)
              .filter((key) => key.startsWith('Affichage'))
              .map((key, index) => ({
                titre: data[`Affichage${index + 1}`],
                description: data[`rang${index + 1}`].replace(/<br>/g, '\n'),
                type: data[`type${index + 1}`],
              }));
            loadedVoies.push({ nom: data.Voie, competences, fichier: `${profile}${i}.json` });
          }
        }
      }

      if (race) {
        const raceResponse = await fetch(`/tabs/${race}.json`);
        if (raceResponse.ok) {
          const raceData = await raceResponse.json();
          const raceCompetences = Object.keys(raceData)
            .filter((key) => key.startsWith('Affichage'))
            .map((key, index) => ({
              titre: raceData[`Affichage${index + 1}`],
              description: raceData[`rang${index + 1}`].replace(/<br>/g, '\n'),
              type: raceData[`type${index + 1}`],
            }));
          loadedVoies.push({ nom: raceData.Voie, competences: raceCompetences, fichier: `${race}.json` });
        }
      }

      setVoies(loadedVoies);
    };

    if (profile && race) {
      fetchVoies();
    }
  }, [profile, race]);

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
        const response = await fetch(`/tabs/${selectedProfile}${i}.json`);
        if (response.ok) {
          const data = await response.json();
          const competences = Object.keys(data)
            .filter((key) => key.startsWith('Affichage'))
            .map((key, index) => ({
              titre: data[`Affichage${index + 1}`],
              description: data[`rang${index + 1}`].replace(/<br>/g, '\n'),
              type: data[`type${index + 1}`],
            }));
          replacementData.push({ nom: data.Voie, competences, fichier: `${selectedProfile}${i}.json` });
        }
      }
    } else if (type === 'races') {
      items = ['Humain', 'Elfe', 'Nain', 'Orc', 'Halfelin'];
      for (const raceName of items) {
        const response = await fetch(`/tabs/${raceName}.json`);
        if (response.ok) {
          const data = await response.json();
          const competences = Object.keys(data)
            .filter((key) => key.startsWith('Affichage'))
            .map((key, index) => ({
              titre: data[`Affichage${index + 1}`],
              description: data[`rang${index + 1}`].replace(/<br>/g, '\n'),
              type: data[`type${index + 1}`],
            }));
          replacementData.push({ nom: data.Voie, competences, fichier: `${raceName}.json` });
        }
      }
    } else {
      items = ['Prestige1', 'Prestige2', 'Prestige3'];
      for (const prestigeName of items) {
        const response = await fetch(`/tabs/${prestigeName}.json`);
        if (response.ok) {
          const data = await response.json();
          const competences = Object.keys(data)
            .filter((key) => key.startsWith('Affichage'))
            .map((key, index) => ({
              titre: data[`Affichage${index + 1}`],
              description: data[`rang${index + 1}`].replace(/<br>/g, '\n'),
              type: data[`type${index + 1}`],
            }));
          replacementData.push({ nom: data.Voie, competences, fichier: `${prestigeName}.json` });
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

  const saveCharacterData = async () => {
    if (!roomId || !persoId) return;

    const characterRef = doc(db, `cartes/${roomId}/characters/${persoId}`);
    const voiesData = voies.reduce((acc, voie, index) => {
      acc[`Voie${index + 1}`] = voie.fichier;
      acc[`v${index + 1}`] = 0;
      return acc;
    }, {} as Record<string, string | number>);

    await setDoc(characterRef, voiesData, { merge: true });
    alert('Les données ont été sauvegardées avec succès.');
    router.push('/map'); // Redirection vers /map    
  };

  return (
    <div className="container mx-auto p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {voies.map((voie, index) => (
        <Card key={index} className="bg-gray-800 text-white w-full cursor-pointer" onClick={() => handleVoieClick(index)}>
          <CardHeader>
            <CardTitle>{voie.nom}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5">
              {voie.competences.map((competence, compIndex) => (
                <li key={compIndex}>{competence.titre}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {isPanelOpen && selectedVoieIndex !== null && (
        <div className="fixed top-0 right-0 bg-white shadow-lg p-6 w-80 h-full z-20">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold mb-4">{voies[selectedVoieIndex].nom}</h2>
            <Button variant="ghost" onClick={() => setIsPanelOpen(false)}>
              <X className="w-6 h-6" />
            </Button>
          </div>
          <select
            className="mb-4 p-2 border border-gray-300 rounded w-full"
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
              <h3 className="font-semibold">{voies[selectedVoieIndex].competences[selectedCompetenceIndex].titre}</h3>
              <p dangerouslySetInnerHTML={{ __html: voies[selectedVoieIndex].competences[selectedCompetenceIndex].description }}></p>
            </div>
          )}
          <Button onClick={openDialog}>Changer</Button>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="bg-white p-6 rounded-lg fixed left-0 right-0 m-auto w-full h-[80vh] max-w-6xl max-h-screen overflow-y-auto z-50">
          <div className="flex justify-between items-center">
            <DialogTitle>Choisir une nouvelle voie</DialogTitle>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
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
                <label className="block font-semibold mb-2">Sélectionner un personnage</label>
                <select
                  value={selectedProfile}
                  onChange={handleProfileChange}
                  className="p-2 border rounded w-full"
                >
                  <option value="Samourai">Samourai</option>
                  <option value="Guerrier">Guerrier</option>
                  <option value="Barde">Barde</option>
                  <option value="Moine">Moine</option>
                  <option value="Pretre">prêtre</option>
                  <option value="Rodeur">Rodeur</option>
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {replacementVoies.map((voie, index) => (
                  <Card
                    key={index}
                    className="bg-gray-800 text-white cursor-pointer"
                    onClick={() => handleReplacementSelect(voie)}
                  >
                    <CardHeader>
                      <CardTitle>{voie.nom}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc pl-5">
                        {voie.competences.map((competence, compIndex) => (
                          <li key={compIndex}>{competence.titre}</li>
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
                    className="bg-gray-800 text-white cursor-pointer"
                    onClick={() => handleReplacementSelect(voie)}
                  >
                    <CardHeader>
                      <CardTitle>{voie.nom}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc pl-5">
                        {voie.competences.map((competence, compIndex) => (
                          <li key={compIndex}>{competence.titre}</li>
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
                    className="bg-gray-800 text-white cursor-pointer"
                    onClick={() => handleReplacementSelect(voie)}
                  >
                    <CardHeader>
                      <CardTitle>{voie.nom}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc pl-5">
                        {voie.competences.map((competence, compIndex) => (
                          <li key={compIndex}>{competence.titre}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          {isDetailsPanelOpen && selectedReplacement && (
            <div className="fixed top-0 right-0 bg-gray-200 shadow-lg p-6 w-80 h-full z-50">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold mb-4">{selectedReplacement.nom}</h2>
                <Button variant="ghost" onClick={() => setIsDetailsPanelOpen(false)}>
                  <X className="w-6 h-6" />
                </Button>
              </div>
              <select
                className="mb-4 p-2 border border-gray-300 rounded w-full"
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
                  <h3 className="font-semibold">
                    {selectedReplacement.competences[selectedCompetenceIndex].titre}
                  </h3>
                  <p dangerouslySetInnerHTML={{ __html: selectedReplacement.competences[selectedCompetenceIndex].description }}></p>
                </div>
              )}
              <Button onClick={applyReplacement} className="w-full">
                Remplacer
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Button to save final changes */}
      <div className="col-span-full flex justify-center mt-4">
        <Button onClick={saveCharacterData} className="w-48">
          Continuer
        </Button>
      </div>
    </div>
  );
}
