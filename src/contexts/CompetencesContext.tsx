'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

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

type CompetencesContextType = {
  races: Voie[];
  profiles: Profile[];
  prestiges: Profile[];
  searchCompetences: (searchTerm: string) => Competence[];
  isLoading: boolean;
  allCompetences: Competence[];
};

const CompetencesContext = createContext<CompetencesContextType | undefined>(undefined);

export function CompetencesProvider({ children }: { children: React.ReactNode }) {
  const [races, setRaces] = useState<Voie[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [prestiges, setPrestiges] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mémoiser toutes les compétences pour éviter de les recalculer à chaque recherche
  const allCompetences = useMemo(() => {
    const competences: Competence[] = [];

    // Ajouter les compétences des races
    races.forEach(race => {
      race.competences.forEach(comp => {
        competences.push({
          ...comp,
          source: `Race: ${race.nom}`
        });
      });
    });

    // Ajouter les compétences des profils
    profiles.forEach(profile => {
      profile.voies.forEach(voie => {
        voie.competences.forEach(comp => {
          competences.push({
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
          competences.push({
            ...comp,
            source: `Prestige: ${prestige.nom} - ${voie.nom}`
          });
        });
      });
    });

    return competences;
  }, [races, profiles, prestiges]);

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
        setRaces(raceData);

        // Fetch prestiges
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
        setPrestiges(prestigeData);

      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const searchCompetences = (searchTerm: string): Competence[] => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase().trim();
    
    // Utiliser la liste mémorisée des compétences pour la recherche
    return allCompetences.filter(comp => 
      comp.titre.toLowerCase().includes(term) ||
      comp.description.toLowerCase().includes(term)
    );
  };

  return (
    <CompetencesContext.Provider value={{ races, profiles, prestiges, searchCompetences, isLoading, allCompetences }}>
      {children}
    </CompetencesContext.Provider>
  );
}

export function useCompetences() {
  const context = useContext(CompetencesContext);
  if (context === undefined) {
    throw new Error('useCompetences must be used within a CompetencesProvider');
  }
  return context;
} 