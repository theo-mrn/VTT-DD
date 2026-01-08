'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { mapImagePath } from '@/utils/imagePathMapper';

export type Competence = {
  titre: string;
  description: string;
  type: string;
  source?: string;
  // Extended fields for Stats
  image?: string;
  modificateurs?: Record<string, number>;
  hitDie?: string;
  tailleMoyenne?: number;
  poidsMoyen?: number;
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
  const [raceStats, setRaceStats] = useState<any[]>([]);
  const [profileStats, setProfileStats] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Mémoiser toutes les compétences pour éviter de les recalculer à chaque recherche
  const allCompetences = useMemo(() => {
    const competences: Competence[] = [];

    // Ajouter les stats de base des races
    raceStats.forEach(stat => {
      competences.push({
        titre: stat.name, // Nom de la race (ex: "Elfe")
        description: stat.description,
        type: "Race",
        source: "Règles",
        image: stat.image,
        modificateurs: stat.modificateurs,
        tailleMoyenne: stat.tailleMoyenne,
        poidsMoyen: stat.poidsMoyen
      });
    });

    // Ajouter les stats de base des profils
    profileStats.forEach(stat => {
      competences.push({
        titre: stat.name, // Nom du profil (ex: "Barbare")
        description: stat.description,
        type: "Classe",
        source: "Règles",
        image: stat.image,
        hitDie: stat.hitDie
      });
    });

    // Ajouter les règles
    rules.forEach(rule => {
      competences.push({
        titre: rule.title,
        description: rule.description,
        type: "Règle", // New type for filtering
        source: "Règles"
      });
    });

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
  }, [races, profiles, prestiges, raceStats, profileStats, rules]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch Base Stats (Race & Profile) & Rules
        try {
          const [raceRes, profileRes, rulesRes] = await Promise.all([
            fetch('/tabs/race.json'),
            fetch('/tabs/profile.json'),
            fetch('/tabs/Rules.json')
          ]);

          if (raceRes.ok) {
            const raceData = await raceRes.json();
            const formattedRaces = await Promise.all(Object.entries(raceData).map(async ([key, data]: [string, any]) => ({
              name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
              ...data,
              image: data.image ? await mapImagePath(data.image) : undefined
            })));
            setRaceStats(formattedRaces);
          }

          if (profileRes.ok) {
            const profileData = await profileRes.json();
            const formattedProfiles = await Promise.all(Object.entries(profileData).map(async ([key, data]: [string, any]) => ({
              name: key.charAt(0).toUpperCase() + key.slice(1),
              ...data,
              image: data.image ? await mapImagePath(data.image) : undefined
            })));
            setProfileStats(formattedProfiles);
          }

          if (rulesRes.ok) {
            const rulesData = await rulesRes.json();
            if (rulesData.rules && Array.isArray(rulesData.rules)) {
              setRules(rulesData.rules);
            }
          }
        } catch (e) {
          console.error("Error fetching stats json", e);
        }

        // Fetch profiles
        const profileNames = ["Barbare", "Barde", "Chevalier", "Druide", "Ensorceleur", "Forgesort", "Guerrier", "Invocateur", "Magicien", "Moine", "Necromancien", "Pretre", "Psionique", "Rodeur", "Samourai", "Voleur"];
        // Note: added missing profiles from list based on profile.json check if needed
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
              //console.error(`Error fetching ${name}${i}.json:`, error);
            }
          }
          if (voies.length > 0) {
            profileData.push({ nom: name, voies });
          }
        }
        setProfiles(profileData);

        // Fetch races
        const raceNames = ["Ame-forgee", "Drakonide", "Elfe", "Elfesylvain", "Elfenoir", "Halfelin", "Humain", "Minotaure", "Ogre", "Orque", "Nain"];
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
            //console.error(`Error fetching ${name}.json:`, error);
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
              //console.error(`Error fetching prestige_${name}${i}.json:`, error);
            }
          }
          if (voies.length > 0) {
            prestigeData.push({ nom: name, voies });
          }
        }
        setPrestiges(prestigeData);

      } catch (error) {
        //console.error('Error fetching data:', error);
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