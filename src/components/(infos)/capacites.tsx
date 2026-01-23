"use client";

import { useState, useEffect } from 'react';
import { Search, ChevronRight, Scroll, Swords, Crown, Check, Info, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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

export default function Capacites() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [races, setRaces] = useState<Voie[]>([]);
  const [prestiges, setPrestiges] = useState<Profile[]>([]);

  const [selectedRace, setSelectedRace] = useState<string>("");
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [selectedPrestige, setSelectedPrestige] = useState<string>("");

  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [selectedCompetence, setSelectedCompetence] = useState<Competence | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Search/Filter states
  const [raceSearchTerm, setRaceSearchTerm] = useState("");
  const [isRaceInputFocused, setIsRaceInputFocused] = useState(false);

  const [profileSearchTerm, setProfileSearchTerm] = useState("");
  const [isProfileInputFocused, setIsProfileInputFocused] = useState(false);

  const [prestigeSearchTerm, setPrestigeSearchTerm] = useState("");
  const [isPrestigeInputFocused, setIsPrestigeInputFocused] = useState(false);

  // Global Text Search State
  const [globalSearch, setGlobalSearch] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch profiles
        const profileNames = ["Barbare", "Barde", "Chevalier", "Druide", "Samourai", "Ensorceleur", "Forgesort", "Guerrier", "Invocateur", "Magicien", "Moine", "Necromancien", "Pretre", "Psionique", "Rodeur", "Voleur"];
        const profileData: Profile[] = [];

        for (const name of profileNames) {
          const voies = [];
          for (let i = 1; i <= 5; i++) {
            try {
              const response = await fetch(`/tabs/${name}${i}.json`);
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
        setProfiles(profileData);

        // Fetch races
        const raceNames = ["Ame-forgee", "Drakonide", "Elfe", "Elfesylvain", "Elfenoir", "Frouin", "Halfelin", "Humain", "Minotaure", "Ogre", "Orque", "Nain", "Wolfer"];
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
                raceData.push({ nom: data.Voie || name, competences });
              }
            }
          } catch (error) {
            console.error(`Error fetching ${name}.json:`, error);
          }
        }
        setRaces(raceData);

        // Fetch prestiges
        const prestigeNames = ["arquebusier", "barbare", "barde", "chevalier", "druide", "ensorceleur", "forgesort", "guerrier", "moine", "necromancien", "pretre", "rodeur", "voleur"];
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
              // Ignore errors for non-existent prestige files
            }
          }
          if (voies.length > 0) {
            prestigeData.push({ nom: name, voies });
          }
        }
        setPrestiges(prestigeData);

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleCompetenceClick = (competence: Competence) => {
    setSelectedCompetence(competence);
    setIsModalOpen(true);
  };

  const VoieCard = ({ voie, subtitle, searchTerm }: { voie: Voie, subtitle?: string, searchTerm?: string }) => {
    return (
      <div className="w-full">
        <Card className="h-full border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-colors bg-[var(--bg-card)]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[var(--accent-brown)] text-lg">
              {voie.nom}
              {subtitle && <span className="block text-xs text-[var(--text-secondary)] mt-1 font-normal">{subtitle}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {voie.competences.map((competence, index) => {
                const isMatch = searchTerm && (
                  competence.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  competence.description.toLowerCase().includes(searchTerm.toLowerCase())
                );

                return (
                  <li
                    key={index}
                    className={cn(
                      "group flex items-center justify-between p-2 rounded border cursor-pointer transition-all duration-200",
                      isMatch
                        ? "border-[var(--accent-brown)] bg-[var(--accent-brown)]/10 ring-1 ring-[var(--accent-brown)]"
                        : "border-[var(--border-color)] hover:border-[var(--accent-brown)] bg-[var(--bg-card)]"
                    )}
                    onClick={() => handleCompetenceClick(competence)}
                  >
                    <div className="flex-1">
                      <span className={cn(
                        "font-medium transition-colors",
                        isMatch ? "text-[var(--accent-brown)] font-bold" : "text-[var(--text-secondary)]"
                      )}>
                        {competence.titre}
                      </span>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                      >
                        <Info className="h-4 w-4 text-[var(--accent-brown)]" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Filter logic for dropdowns
  const filteredRacesList = races.filter(race =>
    race.nom.toLowerCase().includes(raceSearchTerm.toLowerCase())
  );

  const filteredProfilesList = profiles.filter(profile =>
    profile.nom.toLowerCase().includes(profileSearchTerm.toLowerCase())
  );

  const filteredPrestigesList = prestiges.filter(prestige =>
    prestige.nom.toLowerCase().includes(prestigeSearchTerm.toLowerCase())
  );

  // Display logic with Global Search
  const getDisplayedRaces = () => {
    return races.filter(race => {
      // 1. Filter by Selection
      if (selectedRace && race.nom !== selectedRace) return false;

      // 2. Filter by Global Search
      if (globalSearch) {
        const term = globalSearch.toLowerCase();
        const matchName = race.nom.toLowerCase().includes(term);
        const matchComp = race.competences.some(c =>
          c.titre.toLowerCase().includes(term) ||
          c.description.toLowerCase().includes(term)
        );
        if (!matchName && !matchComp) return false;
      }

      return true;
    });
  };

  const getDisplayedProfileVoies = () => {
    return profiles.flatMap(profile => {
      // 1. Filter by Selection (if active)
      if (selectedProfile && profile.nom !== selectedProfile) return [];

      // 2. Filter by Global Search
      if (globalSearch) {
        const term = globalSearch.toLowerCase();
        // Check if profile name matches
        const profileMatches = profile.nom.toLowerCase().includes(term);

        // Filter voies
        const matchingVoies = profile.voies.filter(voie => {
          if (profileMatches) return true;

          const matchVoieName = voie.nom.toLowerCase().includes(term);
          const matchComp = voie.competences.some(c =>
            c.titre.toLowerCase().includes(term) ||
            c.description.toLowerCase().includes(term)
          );
          return matchVoieName || matchComp;
        });

        if (matchingVoies.length === 0) return [];
        return matchingVoies.map(v => ({ ...v, _profileName: profile.nom }));
      }

      // If no global search, return all voies of the selected profile
      return profile.voies.map(v => ({ ...v, _profileName: profile.nom }));
    });
  };

  const getDisplayedPrestigeVoies = () => {
    return prestiges.flatMap(prestige => {
      // 1. Filter by Selection (if active)
      if (selectedPrestige && prestige.nom !== selectedPrestige) return [];

      // 2. Filter by Global Search
      if (globalSearch) {
        const term = globalSearch.toLowerCase();
        const prestigeMatches = prestige.nom.toLowerCase().includes(term);

        const matchingVoies = prestige.voies.filter(voie => {
          if (prestigeMatches) return true;

          const matchVoieName = voie.nom.toLowerCase().includes(term);
          const matchComp = voie.competences.some(c =>
            c.titre.toLowerCase().includes(term) ||
            c.description.toLowerCase().includes(term)
          );
          return matchVoieName || matchComp;
        });

        if (matchingVoies.length === 0) return [];
        return matchingVoies.map(v => ({ ...v, _profileName: prestige.nom }));
      }

      return prestige.voies.map(v => ({ ...v, _profileName: prestige.nom }));
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-8 min-h-screen">
      <div className="flex items-center justify-between">
        <h1 className="text-4xl font-bold text-[var(--accent-brown)]">Compétences</h1>
      </div>

      <Tabs defaultValue="races" className="w-full" onValueChange={() => {
        setGlobalSearch("");
      }}>
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

        {isLoading ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-brown)]" />
          </div>
        ) : (
          <>
            {/* RACES TAB */}
            <TabsContent value="races" className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 max-w-4xl mx-auto mb-6">
                {/* Combobox Filter */}
                <div className="flex-1 relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block font-semibold text-[var(--text-primary)]">Filtrer par race</label>
                    {selectedRace && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRace("");
                          setRaceSearchTerm("");
                        }}
                        className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Effacer
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
                      placeholder={selectedRace ? `Filtré par: ${selectedRace}` : "Sélectionner une race..."}
                      className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                    />
                    {isRaceInputFocused && (
                      <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                        {filteredRacesList.length > 0 ? (
                          filteredRacesList.map((race) => (
                            <div
                              key={race.nom}
                              onClick={() => {
                                setSelectedRace(race.nom);
                                setRaceSearchTerm(race.nom);
                                setIsRaceInputFocused(false);
                              }}
                              className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                  selectedRace === race.nom ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="text-[var(--text-primary)]">{race.nom}</span>
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

                {/* Global Search Bar */}
                <div className="flex-1">
                  <label className="block font-semibold text-[var(--text-primary)] mb-2">Recherche textuelle</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--text-secondary)]" />
                    <input
                      type="text"
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                      placeholder="Rechercher une compétence..."
                      className="w-full p-3 pl-10 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                    />
                  </div>
                </div>
              </div>

              <ScrollArea className="h-[calc(100vh-300px)] pr-4">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {getDisplayedRaces().map((race, idx) => (
                    <VoieCard key={idx} voie={race} searchTerm={globalSearch} />
                  ))}
                  {getDisplayedRaces().length === 0 && (
                    <div className="col-span-full text-center text-muted-foreground py-10">
                      Aucun résultat trouvé.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* PROFILES TAB */}
            <TabsContent value="profiles" className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 max-w-4xl mx-auto mb-6">
                {/* Combobox Filter */}
                <div className="flex-1 relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block font-semibold text-[var(--text-primary)]">Filtrer par profil</label>
                    {selectedProfile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedProfile("");
                          setProfileSearchTerm("");
                        }}
                        className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Effacer
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
                      placeholder={selectedProfile ? `Filtré par: ${selectedProfile}` : "Sélectionner un profil..."}
                      className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                    />
                    {isProfileInputFocused && (
                      <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                        {filteredProfilesList.length > 0 ? (
                          filteredProfilesList.map((profile) => (
                            <div
                              key={profile.nom}
                              onClick={() => {
                                setSelectedProfile(profile.nom);
                                setProfileSearchTerm(profile.nom);
                                setIsProfileInputFocused(false);
                              }}
                              className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                  selectedProfile === profile.nom ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="text-[var(--text-primary)]">
                                {profile.nom} <span className="text-[var(--text-secondary)] text-xs">(5 voies)</span>
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

                {/* Global Search Bar */}
                <div className="flex-1">
                  <label className="block font-semibold text-[var(--text-primary)] mb-2">Recherche textuelle</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--text-secondary)]" />
                    <input
                      type="text"
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                      placeholder="Rechercher une compétence..."
                      className="w-full p-3 pl-10 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                    />
                  </div>
                </div>
              </div>

              <ScrollArea className="h-[calc(100vh-300px)] pr-4">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {getDisplayedProfileVoies().length > 0 ? (
                    getDisplayedProfileVoies().map((voie, idx) => (
                      <VoieCard key={idx} voie={voie} subtitle={(voie as any)._profileName} searchTerm={globalSearch} />
                    ))
                  ) : (
                    <div className="col-span-full text-center text-muted-foreground py-10">
                      Aucun résultat trouvé.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* PRESTIGES TAB */}
            <TabsContent value="prestiges" className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4 max-w-4xl mx-auto mb-6">
                {/* Combobox Filter */}
                <div className="flex-1 relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block font-semibold text-[var(--text-primary)]">Filtrer par classe</label>
                    {selectedPrestige && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedPrestige("");
                          setPrestigeSearchTerm("");
                        }}
                        className="text-[var(--accent-brown)] hover:text-[var(--text-primary)]"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Effacer
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
                      placeholder={selectedPrestige ? `Filtré par: ${selectedPrestige}` : "Sélectionner une classe..."}
                      className="w-full p-3 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                    />
                    {isPrestigeInputFocused && (
                      <div className="absolute z-50 w-full mt-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded shadow-lg max-h-60 overflow-y-auto">
                        {filteredPrestigesList.length > 0 ? (
                          filteredPrestigesList.map((prestige) => (
                            <div
                              key={prestige.nom}
                              onClick={() => {
                                setSelectedPrestige(prestige.nom);
                                setPrestigeSearchTerm(prestige.nom);
                                setIsPrestigeInputFocused(false);
                              }}
                              className="flex items-center p-3 cursor-pointer hover:bg-[var(--bg-card)] transition-colors"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 text-[var(--accent-brown)]",
                                  selectedPrestige === prestige.nom ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <span className="text-[var(--text-primary)]">
                                {prestige.nom} <span className="text-[var(--text-secondary)] text-xs">(5 voies)</span>
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="p-6 text-center text-[var(--text-secondary)] text-sm">
                            Aucune classe trouvée.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Global Search Bar */}
                <div className="flex-1">
                  <label className="block font-semibold text-[var(--text-primary)] mb-2">Recherche textuelle</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--text-secondary)]" />
                    <input
                      type="text"
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                      placeholder="Rechercher une compétence..."
                      className="w-full p-3 pl-10 border border-[var(--border-color)] rounded bg-[var(--bg-dark)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)]"
                    />
                  </div>
                </div>
              </div>

              <ScrollArea className="h-[calc(100vh-300px)] pr-4">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {getDisplayedPrestigeVoies().length > 0 ? (
                    getDisplayedPrestigeVoies().map((voie, idx) => (
                      <VoieCard key={idx} voie={voie} subtitle={(voie as any)._profileName} searchTerm={globalSearch} />
                    ))
                  ) : (
                    <div className="col-span-full text-center text-muted-foreground py-10">
                      Aucun résultat trouvé.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Competence Detail Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl bg-[var(--bg-dark)] border border-[var(--border-color)] z-[100]">
          {selectedCompetence && (
            <>
              <div className="mb-4">
                <DialogTitle className="modal-title mb-2 text-2xl font-bold text-[var(--accent-brown)]">
                  {selectedCompetence.titre}
                </DialogTitle>
                <DialogDescription className="text-sm text-[var(--text-secondary)]">
                  {selectedCompetence.source}
                </DialogDescription>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">Description</h3>
                <div
                  className="text-sm text-[var(--text-secondary)] p-4 bg-[var(--bg-card)] rounded border border-[var(--border-color)] whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: selectedCompetence.description
                  }}
                />
              </div>

              {selectedCompetence.type && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-2 text-[var(--accent-brown)]">Type</h3>
                  <p className="text-sm text-[var(--text-secondary)] p-2 bg-[var(--bg-card)] rounded border border-[var(--border-color)]">
                    {selectedCompetence.type}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={() => setIsModalOpen(false)} className="button-cancel">
                  Fermer
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
