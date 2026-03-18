"use client";

import { useState, useEffect } from 'react';
import { Search, ChevronRight, Scroll, Swords, Crown, X } from 'lucide-react';
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

  const [activeTab, setActiveTab] = useState<string>("races");

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
        <div className="h-full rounded-2xl border border-[var(--border-color)] hover:border-[var(--accent-brown)]/40 transition-all duration-300 bg-[var(--bg-card)] hover:shadow-[0_0_25px_rgba(192,160,128,0.06)] flex flex-col">
          <div className="px-4 pt-4 pb-2 shrink-0">
            <h3 className="text-[var(--accent-brown)] text-base font-bold">
              {voie.nom}
            </h3>
            {subtitle && <span className="block text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</span>}
          </div>
          <ScrollArea className="flex-1 max-h-[280px] px-4 pb-4">
            <ul className="space-y-1.5 pr-2">
              {voie.competences.map((competence, index) => {
                const isMatch = searchTerm && (
                  competence.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  competence.description.toLowerCase().includes(searchTerm.toLowerCase())
                );

                return (
                  <li
                    key={index}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all duration-200",
                      isMatch
                        ? "bg-[var(--accent-brown)]/15 ring-1 ring-[var(--accent-brown)]/50"
                        : "hover:bg-[var(--bg-dark)]/50"
                    )}
                    onClick={() => handleCompetenceClick(competence)}
                  >
                    <span className={cn(
                      "text-sm transition-colors",
                      isMatch ? "text-[var(--accent-brown)] font-bold" : "text-[var(--text-primary)]"
                    )}>
                      {competence.titre}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2" />
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>
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
      if (selectedRace && selectedRace !== "all_races" && race.nom !== selectedRace) return false;

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
      if (selectedProfile && selectedProfile !== "all_profiles" && profile.nom !== selectedProfile) return [];

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
      if (selectedPrestige && selectedPrestige !== "all_prestiges" && prestige.nom !== selectedPrestige) return [];

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
    <div className="w-full h-full overflow-hidden flex flex-col space-y-0">
      <Tabs value={activeTab} className="w-full flex-1 min-h-0 flex flex-col" onValueChange={(val) => {
        setActiveTab(val);
        setGlobalSearch("");
      }}>
        {/* ── Toolbar: Tabs + Search + Select on one line ── */}
        <div className="shrink-0 px-4 md:px-8 pt-4 pb-4">
          <div className="flex items-center gap-3">
            {/* Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-card)]/60 backdrop-blur-sm border border-[var(--border-color)] shrink-0">
              <TabsList className="bg-transparent border-none gap-1 p-0">
                <TabsTrigger value="races" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-[var(--bg-dark)] data-[state=active]:shadow-[0_2px_10px_rgba(192,160,128,0.3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <Scroll className="h-4 w-4" /> Races
                </TabsTrigger>
                <TabsTrigger value="profiles" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-[var(--bg-dark)] data-[state=active]:shadow-[0_2px_10px_rgba(192,160,128,0.3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <Swords className="h-4 w-4" /> Profils
                </TabsTrigger>
                <TabsTrigger value="prestiges" className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-[var(--bg-dark)] data-[state=active]:shadow-[0_2px_10px_rgba(192,160,128,0.3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                  <Crown className="h-4 w-4" /> Prestiges
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Rechercher une capacité..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-[var(--bg-card)]/60 backdrop-blur-sm border border-[var(--border-color)] text-sm text-[var(--text-primary)] placeholder-[var(--text-secondary)] focus:outline-none focus:border-[var(--accent-brown)] focus:shadow-[0_0_15px_rgba(192,160,128,0.1)] transition-all"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Select */}
            {activeTab === 'races' && (
              <Select value={selectedRace} onValueChange={setSelectedRace}>
                <SelectTrigger className="w-[200px] h-10 rounded-xl bg-[var(--bg-card)]/60 backdrop-blur-sm border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:border-[var(--accent-brown)]">
                  <SelectValue placeholder="Toutes les races" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] rounded-xl">
                  <SelectGroup>
                    <SelectItem value="all_races">Toutes les races</SelectItem>
                    {races.map((race) => (
                      <SelectItem key={race.nom} value={race.nom}>
                        {race.nom}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}

            {activeTab === 'profiles' && (
              <Select value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectTrigger className="w-[200px] h-10 rounded-xl bg-[var(--bg-card)]/60 backdrop-blur-sm border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:border-[var(--accent-brown)]">
                  <SelectValue placeholder="Tous les profils" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] rounded-xl">
                  <SelectGroup>
                    <SelectItem value="all_profiles">Tous les profils</SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.nom} value={profile.nom}>
                        {profile.nom}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}

            {activeTab === 'prestiges' && (
              <Select value={selectedPrestige} onValueChange={setSelectedPrestige}>
                <SelectTrigger className="w-[200px] h-10 rounded-xl bg-[var(--bg-card)]/60 backdrop-blur-sm border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:border-[var(--accent-brown)]">
                  <SelectValue placeholder="Toutes les classes" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] rounded-xl">
                  <SelectGroup>
                    <SelectItem value="all_prestiges">Toutes les classes</SelectItem>
                    {prestiges.map((prestige) => (
                      <SelectItem key={prestige.nom} value={prestige.nom}>
                        {prestige.nom}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent-brown)]" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 pb-4 styled-scrollbar">
            {/* RACES TAB */}
            <TabsContent value="races" className="mt-0">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4">
                {getDisplayedRaces().map((race, idx) => (
                  <VoieCard key={idx} voie={race} searchTerm={globalSearch} />
                ))}
                {getDisplayedRaces().length === 0 && (
                  <div className="col-span-full text-center text-[var(--text-secondary)] py-10">
                    Aucun résultat trouvé.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* PROFILES TAB */}
            <TabsContent value="profiles" className="mt-0">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4">
                {getDisplayedProfileVoies().length > 0 ? (
                  getDisplayedProfileVoies().map((voie, idx) => (
                    <VoieCard key={idx} voie={voie} subtitle={(voie as any)._profileName} searchTerm={globalSearch} />
                  ))
                ) : (
                  <div className="col-span-full text-center text-[var(--text-secondary)] py-10">
                    Aucun résultat trouvé.
                  </div>
                )}
              </div>
            </TabsContent>

            {/* PRESTIGES TAB */}
            <TabsContent value="prestiges" className="mt-0">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-4">
                {getDisplayedPrestigeVoies().length > 0 ? (
                  getDisplayedPrestigeVoies().map((voie, idx) => (
                    <VoieCard key={idx} voie={voie} subtitle={(voie as any)._profileName} searchTerm={globalSearch} />
                  ))
                ) : (
                  <div className="col-span-full text-center text-[var(--text-secondary)] py-10">
                    Aucun résultat trouvé.
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
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
