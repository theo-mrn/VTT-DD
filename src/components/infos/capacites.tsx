"use client";
import { useState, useEffect } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button"; // Import du bouton de shadcn/ui

type Competence = {
  titre: string;
  description: string;
  type: string;
};

type Voie = {
  nom: string;
  competences: Competence[];
};

type Profile = {
  nom: string;
  voies: Voie[];
};

export default function Component() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearchPanel, setShowSearchPanel] = useState(false); // État pour afficher le panneau latéral
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [races, setRaces] = useState<Voie[]>([]);
  const [prestiges, setPrestiges] = useState<Profile[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedPrestigeProfile, setSelectedPrestigeProfile] = useState<string>('');

  useEffect(() => {
    const fetchProfiles = async () => {
      const profileNames = ["Barbare", "Barde", "Chevalier", "Druide", "Samourai","Ensorceleur","Forgesort","Guerrier","Invocateur","Moine","Psionique","Rodeur","Voleur"];
      const profileData: Profile[] = [];

      for (const name of profileNames) {
        const voies = [];
        for (let i = 1; i <= 5; i++) {
          const response = await fetch(`/tabs/${name}${i}.json`);
          if (response.ok) {
            const data = await response.json();
            const competences: Competence[] = Object.keys(data).filter(key => key.startsWith("Affichage")).map((key, index) => ({
              titre: data[`Affichage${index + 1}`],
              description: data[`rang${index + 1}`],
              type: data[`type${index + 1}`]
            }));
            voies.push({ nom: data.Voie, competences });
          } else {
            console.warn(`File /tabs/${name}${i}.json not found`);
          }
        }
        profileData.push({ nom: name, voies });
      }
      setProfiles(profileData);
    };

    const fetchRaces = async () => {
      const raceNames = ["Ame-forgee","Drakonide","Elfe", "Elfesylvain","Elfenoir", "Humain","Minotaure" ,"Ogre", "Orque","Nain"];
      const raceData: Voie[] = [];

      for (const name of raceNames) {
        const response = await fetch(`/tabs/${name}.json`);
        if (response.ok) {
          const data = await response.json();
          const competences: Competence[] = Object.keys(data).filter(key => key.startsWith("Affichage")).map((key, index) => ({
            titre: data[`Affichage${index + 1}`],
            description: data[`rang${index + 1}`],
            type: data[`type${index + 1}`]
          }));
          raceData.push({ nom: data.Voie, competences });
        } else {
          console.warn(`File /tabs/${name}.json not found`);
        }
      }
      setRaces(raceData);
    };

    const fetchPrestiges = async () => {
      const profileNames = ["arquebusier", "barbare", "barde", "chevalier", "druide", "ensorceleur", "forgesort", "guerrier", "moine", "necromencien", "pretre", "rodeur", "voleur"];
      const prestigeData: Profile[] = [];

      for (const name of profileNames) {
        const voies = [];
        for (let i = 1; i <= 5; i++) {
          const response = await fetch(`/tabs/prestige_${name}${i}.json`);
          if (response.ok) {
            const data = await response.json();
            const competences: Competence[] = Object.keys(data).filter(key => key.startsWith("Affichage")).map((key, index) => ({
              titre: data[`Affichage${index + 1}`],
              description: data[`rang${index + 1}`],
              type: data[`type${index + 1}`]
            }));
            voies.push({ nom: data.Voie, competences });
          } else {
            console.warn(`File /tabs/prestige_${name}${i}.json not found`);
            break; // Stop if no more files for this profile
          }
        }
        prestigeData.push({ nom: name, voies });
      }
      setPrestiges(prestigeData);
    };

    fetchProfiles();
    fetchRaces();
    fetchPrestiges();
  }, []);

  const allCompetences = [
    ...races.flatMap(race => race.competences),
    ...profiles.flatMap(profile => profile.voies.flatMap(voie => voie.competences)),
    ...prestiges.flatMap(prestige => prestige.voies.flatMap(voie => voie.competences))
  ];

  const filteredCompetences = allCompetences.filter(competence =>
    competence.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    competence.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-4 flex text-black relative">
      
      {/* Left Panel for Tabs */}
      <div className="flex-grow">
        <h1 className="text-3xl font-bold mb-6">Hub d'Information</h1>
        
        <Tabs defaultValue="races" className="mb-6">
          <TabsList>
            <TabsTrigger value="races">Races</TabsTrigger>
            <TabsTrigger value="profiles">Profils</TabsTrigger>
            <TabsTrigger value="prestiges">Prestige</TabsTrigger>
          </TabsList>

          {/* Races Section with Selector */}
          <TabsContent value="races">
            <div className="flex items-center mb-4">
              <label htmlFor="race-select" className="mr-2 font-semibold">Choisissez une race:</label>
              <select
                id="race-select"
                className="border border-gray-300 rounded p-2"
                value={selectedRace}
                onChange={(e) => setSelectedRace(e.target.value)}
              >
                <option value="">Toutes les races</option>
                {races.map((race, index) => (
                  <option key={index} value={race.nom}>{race.nom}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(selectedRace ? races.filter(race => race.nom === selectedRace) : races).map((race, index) => (
                <Card key={index} className="bg-gray-800 text-white w-80">
                  <CardHeader>
                    <CardTitle>{race.nom}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible>
                      {race.competences.map((competence, compIndex) => (
                        <AccordionItem key={compIndex} value={`item-${compIndex}`}>
                          <AccordionTrigger>{competence.titre}</AccordionTrigger>
                          <AccordionContent>
                            <p dangerouslySetInnerHTML={{ __html: competence.description }} />
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Profiles Section with Selector */}
          <TabsContent value="profiles">
            <div className="flex items-center mb-4">
              <label htmlFor="profile-select" className="mr-2 font-semibold">Choisissez un profil:</label>
              <select
                id="profile-select"
                className="border border-gray-300 rounded p-2"
                value={selectedProfile}
                onChange={(e) => setSelectedProfile(e.target.value)}
              >
                <option value="">Tous les profils</option>
                {profiles.map((profile, index) => (
                  <option key={index} value={profile.nom}>{profile.nom}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(selectedProfile ? profiles.filter(profile => profile.nom === selectedProfile) : profiles).flatMap(profile =>
                profile.voies.map((voie, voieIndex) => (
                  <Card key={`${profile.nom}-${voieIndex}`} className="bg-gray-800 text-white w-80">
                    <CardHeader>
                      <CardTitle>{`${profile.nom} - ${voie.nom}`}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible>
                        {voie.competences.map((competence, compIndex) => (
                          <AccordionItem key={compIndex} value={`comp-${compIndex}`}>
                            <AccordionTrigger>{competence.titre}</AccordionTrigger>
                            <AccordionContent>
                              <p dangerouslySetInnerHTML={{ __html: competence.description }} />
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          {/* Prestiges Section with Selector */}
          <TabsContent value="prestiges">
            <div className="flex items-center mb-4">
              <label htmlFor="prestige-select" className="mr-2 font-semibold">Choisissez un prestige:</label>
              <select
                id="prestige-select"
                className="border border-gray-300 rounded p-2"
                value={selectedPrestigeProfile}
                onChange={(e) => setSelectedPrestigeProfile(e.target.value)}
              >
                <option value="">Tous les prestiges</option>
                {prestiges.map((prestige, index) => (
                  <option key={index} value={prestige.nom}>{prestige.nom}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(selectedPrestigeProfile ? prestiges.filter(prestige => prestige.nom === selectedPrestigeProfile) : prestiges).flatMap(prestige =>
                prestige.voies.map((voie, voieIndex) => (
                  <Card key={`${prestige.nom}-${voieIndex}`} className="bg-gray-800 text-white w-80">
                    <CardHeader>
                      <CardTitle>{`${prestige.nom} - ${voie.nom}`}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="single" collapsible>
                        {voie.competences.map((competence, compIndex) => (
                          <AccordionItem key={compIndex} value={`comp-${compIndex}`}>
                            <AccordionTrigger>{competence.titre}</AccordionTrigger>
                            <AccordionContent>
                              <p dangerouslySetInnerHTML={{ __html: competence.description }} />
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Bouton pour ouvrir le panneau de recherche en haut à droite */}
      <Button 
        onClick={() => setShowSearchPanel(true)} 
        className="fixed top-4 right-4 z-50"
      >
        Rechercher une compétence
      </Button>
      
      {/* Panneau de recherche latéral */}
      <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-lg transform ${showSearchPanel ? 'translate-x-0' : 'translate-x-full'} transition-transform duration-300 ease-in-out z-50`}>
        <div className="p-6 h-full flex flex-col">
          
          {/* Bouton pour fermer le panneau */}
          <button 
            onClick={() => setShowSearchPanel(false)} 
            className="self-end text-gray-500 hover:text-gray-700 mb-4"
          >
            &times;
          </button>

          <Input
            type="text"
            placeholder="Rechercher une compétence..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full mb-6"
          />

          {searchTerm && (
            <div className="overflow-y-auto">
              <h2 className="text-2xl font-semibold mb-4">Résultats de recherche</h2>
              <div className="grid gap-4">
                {filteredCompetences.map((competence, index) => (
                  <Card key={index} className="bg-gray-800 text-white">
                    <CardHeader>
                      <CardTitle>{competence.titre}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p dangerouslySetInnerHTML={{ __html: competence.description }} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
