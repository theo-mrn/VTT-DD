"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight, Scroll, Swords, Crown } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

type Competence = {
  titre: string;
  description: string;
  type: string;
  source?: string;
};

type Voie = {
  nom: string;
  competences: Competence[];
};

type Profile = {
  nom: string;
  voies: Voie[];
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
};

export default function Component() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [races, setRaces] = useState<Voie[]>([]);
  const [prestiges, setPrestiges] = useState<Profile[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>('');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedPrestigeProfile, setSelectedPrestigeProfile] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<Competence[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch profiles
        const profileNames = ["Barbare", "Barde", "Chevalier", "Druide", "Samourai", "Ensorceleur", "Forgesort", "Guerrier", "Invocateur", "Moine", "Psionique", "Rodeur", "Voleur"];
        const profileData: Profile[] = [];

        for (const name of profileNames) {
          const voies = [];
          for (let i = 1; i <= 5; i++) {
            try {
              const response = await fetch(`/tabs/${name}${i}.json`);
              if (response.ok) {
                const data = await response.json();
                
                // Extraire les compétences en utilisant les clés correctes
                const competences: Competence[] = [];
                for (let j = 1; j <= 20; j++) { // On vérifie jusqu'à 20 compétences possibles
                  const affichageKey = `Affichage${j}`;
                  const rangKey = `rang${j}`;
                  const typeKey = `type${j}`;
                  
                  if (data[affichageKey] && data[rangKey]) {
                    competences.push({
                      titre: data[affichageKey],
                      description: data[rangKey],
                      type: data[typeKey] || '',
                      source: `${name} - ${data.Voie}`
                    });
                  }
                }

                if (competences.length > 0) {
                  voies.push({ nom: data.Voie, competences });
                }
              }
            } catch (error) {
              console.error(`Error fetching ${name}${i}.json:`, error);
            }
          }
          if (voies.length > 0) {
            profileData.push({ nom: name, voies });
          }
        }
        console.log('Profils chargés:', profileData);
        setProfiles(profileData);

        // Fetch races avec la même logique
        const raceNames = ["Ame-forgee", "Drakonide", "Elfe", "Elfesylvain", "Elfenoir", "Humain", "Minotaure", "Ogre", "Orque", "Nain"];
        const raceData: Voie[] = [];

        for (const name of raceNames) {
          try {
            const response = await fetch(`/tabs/${name}.json`);
            if (response.ok) {
              const data = await response.json();
              const competences: Competence[] = [];
              
              for (let j = 1; j <= 20; j++) {
                const affichageKey = `Affichage${j}`;
                const rangKey = `rang${j}`;
                const typeKey = `type${j}`;
                
                if (data[affichageKey] && data[rangKey]) {
                  competences.push({
                    titre: data[affichageKey],
                    description: data[rangKey],
                    type: data[typeKey] || '',
                    source: `Race: ${name}`
                  });
                }
              }

              if (competences.length > 0) {
                raceData.push({ nom: data.Voie, competences });
              }
            }
          } catch (error) {
            console.error(`Error fetching ${name}.json:`, error);
          }
        }
        console.log('Races chargées:', raceData);
        setRaces(raceData);

        // Fetch prestiges avec la même logique
        const prestigeNames = ["arquebusier", "barbare", "barde", "chevalier", "druide", "ensorceleur", "forgesort", "guerrier", "moine", "necromencien", "pretre", "rodeur", "voleur"];
        const prestigeData: Profile[] = [];

        for (const name of prestigeNames) {
          const voies = [];
          for (let i = 1; i <= 5; i++) {
            try {
              const response = await fetch(`/tabs/prestige_${name}${i}.json`);
              if (response.ok) {
                const data = await response.json();
                const competences: Competence[] = [];
                
                for (let j = 1; j <= 20; j++) {
                  const affichageKey = `Affichage${j}`;
                  const rangKey = `rang${j}`;
                  const typeKey = `type${j}`;
                  
                  if (data[affichageKey] && data[rangKey]) {
                    competences.push({
                      titre: data[affichageKey],
                      description: data[rangKey],
                      type: data[typeKey] || '',
                      source: `Prestige: ${name} - ${data.Voie}`
                    });
                  }
                }

                if (competences.length > 0) {
                  voies.push({ nom: data.Voie, competences });
                }
              }
            } catch (error) {
              console.error(`Error fetching prestige_${name}${i}.json:`, error);
            }
          }
          if (voies.length > 0) {
            prestigeData.push({ nom: name, voies });
          }
        }
        console.log('Prestiges chargés:', prestigeData);
        setPrestiges(prestigeData);

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fonction simplifiée pour obtenir toutes les compétences
  const getAllCompetences = () => {
    const allCompetences: Competence[] = [];

    // Log pour déboguer
    console.log('Races:', races);
    console.log('Profiles:', profiles);
    console.log('Prestiges:', prestiges);

    // Ajouter les compétences des races
    races.forEach(race => {
      race.competences.forEach(comp => {
        allCompetences.push({
          ...comp,
          source: `Race: ${race.nom}`
        });
      });
    });

    // Ajouter les compétences des profils
    profiles.forEach(profile => {
      profile.voies.forEach(voie => {
        voie.competences.forEach(comp => {
          allCompetences.push({
            ...comp,
            source: `${profile.nom} - ${voie.nom}`
          });
        });
      });
    });

    // Ajouter les compétences des prestiges
    prestiges.forEach(prestige => {
      prestige.voies.forEach(voie => {
        voie.competences.forEach(comp => {
          allCompetences.push({
            ...comp,
            source: `Prestige: ${prestige.nom} - ${voie.nom}`
          });
        });
      });
    });

    // Log pour déboguer
    console.log('Toutes les compétences:', allCompetences);
    return allCompetences;
  };

  // Fonction de recherche modifiée
  const searchCompetences = (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    console.log('Terme de recherche:', term);

    const results: Competence[] = [];

    // Recherche dans les races
    races.forEach(race => {
      race.competences.forEach(comp => {
        if (comp.titre?.toLowerCase().includes(term) ||
            comp.description?.toLowerCase().includes(term)) {
          results.push({
            ...comp,
            source: `Race: ${race.nom}`
          });
        }
      });
    });

    // Recherche dans les profils
    profiles.forEach(profile => {
      profile.voies.forEach(voie => {
        voie.competences.forEach(comp => {
          if (comp.titre?.toLowerCase().includes(term) ||
              comp.description?.toLowerCase().includes(term)) {
            results.push({
              ...comp,
              source: `${profile.nom} - ${voie.nom}`
            });
          }
        });
      });
    });

    // Recherche dans les prestiges
    prestiges.forEach(prestige => {
      prestige.voies.forEach(voie => {
        voie.competences.forEach(comp => {
          if (comp.titre?.toLowerCase().includes(term) ||
              comp.description?.toLowerCase().includes(term)) {
            results.push({
              ...comp,
              source: `Prestige: ${prestige.nom} - ${voie.nom}`
            });
          }
        });
      });
    });

    console.log('Nombre de résultats trouvés:', results.length);
    console.log('Résultats:', results);
    setSearchResults(results);
  };

  // Gestionnaire de changement de recherche
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    searchCompetences(value);
  };

  const CompetenceCard = ({ 
    voie, 
    competence, 
    className = "" 
  }: { 
    voie?: Voie; 
    competence?: Competence; 
    className?: string 
  }) => (
    <motion.div variants={itemVariants}>
      <Card className={`bg-card hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}>
        {voie ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ChevronRight className="h-5 w-5" />
                {voie.nom}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                {voie.competences.map((competence, index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="hover:no-underline">
                      <span className="text-sm font-medium">{competence.titre}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: competence.description }} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </>
        ) : competence && (
          <>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {competence.titre}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {competence.source}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p 
                  className="text-sm text-muted-foreground" 
                  dangerouslySetInnerHTML={{ __html: competence.description }}
                />
                {competence.type && (
                  <p className="text-xs text-muted-foreground">
                    Type: {competence.type}
                  </p>
                )}
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </motion.div>
  );

  return (
    <TooltipProvider>
      <div className="container mx-auto p-4 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold">Compétences</h1>
          <Button variant="outline" size="icon" onClick={() => setIsSearchOpen(true)}>
            <Search className="h-5 w-5" />
          </Button>
        </div>

        <Tabs defaultValue="races" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="races" className="flex items-center gap-2">
              <Scroll className="h-4 w-4" /> Races
            </TabsTrigger>
            <TabsTrigger value="profiles" className="flex items-center gap-2">
              <Swords className="h-4 w-4" /> Profils
            </TabsTrigger>
            <TabsTrigger value="prestiges" className="flex items-center gap-2">
              <Crown className="h-4 w-4" /> Prestiges
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-center items-center min-h-[400px]"
              >
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
              </motion.div>
            ) : (
              <>
                <TabsContent value="races">
                  <div className="mb-6">
                    <Input
                      placeholder="Filtrer les races..."
                      value={selectedRace}
                      onChange={(e) => setSelectedRace(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                  <ScrollArea className="h-[600px] pr-4">
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="show"
                      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                    >
                      {(selectedRace
                        ? races.filter(race => race.nom.toLowerCase().includes(selectedRace.toLowerCase()))
                        : races
                      ).map((race, index) => (
                        <CompetenceCard key={index} voie={race} />
                      ))}
                    </motion.div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="profiles">
                  <div className="mb-6">
                    <Input
                      placeholder="Filtrer les profils..."
                      value={selectedProfile}
                      onChange={(e) => setSelectedProfile(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                  <ScrollArea className="h-[600px] pr-4">
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="show"
                      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                    >
                      {(selectedProfile
                        ? profiles.filter(profile => profile.nom.toLowerCase().includes(selectedProfile.toLowerCase()))
                        : profiles
                      ).flatMap(profile =>
                        profile.voies.map((voie, voieIndex) => (
                          <CompetenceCard
                            key={`${profile.nom}-${voieIndex}`}
                            voie={{ ...voie, nom: `${profile.nom} - ${voie.nom}` }}
                          />
                        ))
                      )}
                    </motion.div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="prestiges">
                  <div className="mb-6">
                    <Input
                      placeholder="Filtrer les prestiges..."
                      value={selectedPrestigeProfile}
                      onChange={(e) => setSelectedPrestigeProfile(e.target.value)}
                      className="max-w-sm"
                    />
                  </div>
                  <ScrollArea className="h-[600px] pr-4">
                    <motion.div
                      variants={containerVariants}
                      initial="hidden"
                      animate="show"
                      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                    >
                      {(selectedPrestigeProfile
                        ? prestiges.filter(prestige => prestige.nom.toLowerCase().includes(selectedPrestigeProfile.toLowerCase()))
                        : prestiges
                      ).flatMap(prestige =>
                        prestige.voies.map((voie, voieIndex) => (
                          <CompetenceCard
                            key={`${prestige.nom}-${voieIndex}`}
                            voie={{ ...voie, nom: `${prestige.nom} - ${voie.nom}` }}
                          />
                        ))
                      )}
                    </motion.div>
                  </ScrollArea>
                </TabsContent>
              </>
            )}
          </AnimatePresence>
        </Tabs>

        <Drawer open={isSearchOpen} onOpenChange={setIsSearchOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Rechercher une compétence</DrawerTitle>
              <DrawerDescription>
                Recherchez dans les titres et descriptions des compétences
              </DrawerDescription>
            </DrawerHeader>
            <div className="p-4 pb-0">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher une compétence..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-9"
                />
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {searchResults.length > 0 ? (
                  `${searchResults.length} résultat(s) trouvé(s)`
                ) : searchTerm ? (
                  'Aucun résultat'
                ) : null}
              </div>
            </div>
            <ScrollArea className="p-4 h-[500px]">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="space-y-4"
              >
                {searchResults.map((competence, index) => (
                  <CompetenceCard
                    key={index}
                    competence={competence}
                  />
                ))}
              </motion.div>
            </ScrollArea>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="outline">Fermer</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </div>
    </TooltipProvider>
  );
}
