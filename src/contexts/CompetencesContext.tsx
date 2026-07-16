'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const PRESTIGE_FILE_COUNTS: Record<string, number> = {
  arquebusier: 3,
  barbare: 2,
  barde: 3,
  chevalier: 3,
  druide: 2,
  ensorceleur: 2,
  forgesort: 3,
  guerrier: 2,
  moine: 3,
  necromancien: 2,
  pretre: 3,
  rodeur: 3,
  voleur: 3,
};

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
  const [isLoading, setIsLoading] = useState(true);

  // NOTE : les entrées de base "Race"/"Classe"/"Règle" (ex-race.json/profile.json/Rules.json) ne
  // viennent PLUS de ce contexte — elles sont fournies par le SYSTÈME ACTIF de la salle
  // (gameSystem.races/profiles/rules via useGameSystem, contenu Firestore seedé/édité par le MJ),
  // directement dans les consommateurs (cf SearchMenu). Ce contexte ne porte plus que les VOIES
  // (arbres de compétences), encore statiques jusqu'à leur propre migration.

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
        const profileNames = ["Barbare", "Barde", "Chevalier", "Druide", "Ensorceleur", "Forgesort", "Guerrier", "Invocateur", "Magicien", "Moine", "Necromancien", "Pretre", "Psionique", "Rodeur", "Samourai", "Voleur"];

        const profilePromises = profileNames.map(async (name) => {
          const filePromises = [];
          for (let i = 1; i <= 5; i++) {
            filePromises.push(
              fetch(`/tabs/${name}${i}.json`)
                .then(res => res.ok ? res.json() : null)
                .catch(err => null)
            );
          }

          const filesData = await Promise.all(filePromises);
          const voies: Voie[] = [];

          filesData.forEach((data) => {
            if (!data) return;

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
          });

          return voies.length > 0 ? { nom: name, voies } : null;
        });

        const resolvedProfiles = await Promise.all(profilePromises);
        setProfiles(resolvedProfiles.filter((p): p is Profile => p !== null));

        // Fetch races
        const raceNames = ["Ame-forgee", "Drakonide", "Elfe", "Elfesylvain", "Elfenoir", "Halfelin", "Humain", "Minotaure", "Ogre", "Orque", "Nain"];

        const racePromises = raceNames.map(async (name) => {
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
                return { nom: data.Voie, competences };
              }
            }
          } catch (error) {
            console.error(`Error fetching ${name}.json:`, error);
          }
          return null;
        });

        const resolvedRaces = await Promise.all(racePromises);
        setRaces(resolvedRaces.filter((r): r is Voie => r !== null));

        // Fetch prestiges
        const prestigeNames = Object.keys(PRESTIGE_FILE_COUNTS);

        const prestigePromises = prestigeNames.map(async (name) => {
          const maxFiles = PRESTIGE_FILE_COUNTS[name];
          const filePromises = [];

          for (let i = 1; i <= maxFiles; i++) {
            filePromises.push(
              fetch(`/tabs/prestige_${name}${i}.json`)
                .then(res => res.ok ? res.json() : null)
                .catch(err => null)
            );
          }

          const filesData = await Promise.all(filePromises);
          const voies: Voie[] = [];

          filesData.forEach((data) => {
            if (!data) return;

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
          });

          return voies.length > 0 ? { nom: name, voies } : null;
        });

        const resolvedPrestiges = await Promise.all(prestigePromises);
        setPrestiges(resolvedPrestiges.filter((p): p is Profile => p !== null));

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